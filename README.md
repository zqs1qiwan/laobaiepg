# LaobaiEPG

基于 **Cloudflare Workers + R2 + KV + GitHub Actions** 构建的纯边缘化 IPTV EPG 管理系统。

**EPG 地址：** `https://laobaiepg.laobaitv.workers.dev/guide.xml.gz`

---

## 目录

- [日常使用：新增频道别名](#新增频道别名)
- [日常使用：添加新频道](#添加新频道)
- [日常使用：添加新数据源](#添加新数据源)
- [进阶：编写自定义爬虫](#编写自定义爬虫)
- [如何找到频道在数据源中的名字](#如何找到频道在数据源中的名字)
- [API 端点](#api-端点)
- [部署文档](#部署文档)

---

## 新增频道别名

**场景**：你的 M3U 播放列表里某个频道名字对不上，比如写的是"浙江卫视4K HD"，但没有匹配到节目单。

**操作**：只需编辑 `config/channels.yaml`，在对应频道的 `aliases` 列表里加一行。

```yaml
# config/channels.yaml

- id: "ZhejiangTV"
  name: "浙江卫视"
  group: "卫视"
  aliases:
    - "浙江卫视"
    - "浙江卫视4K"
    - "浙江卫视4K HD"    # ← 加这一行
    - "ZJTV"
  sources:
    - type: "xmltv_url"
      name: "浙江卫视"
```

提交到 GitHub → Actions 自动抓取 → 约 10 分钟后生效。

**验证匹配**：
```
https://laobaiepg.laobaitv.workers.dev/match?name=浙江卫视4K HD
```

---

## 添加新频道

**场景**：想添加一个目前没有收录的频道，比如"大湾区卫视"。

### 第一步：确认数据源里有这个频道

先去 [epg.pw 频道列表](https://epg.pw/check_guide.php) 搜索，看看有没有这个频道。也可以用下面的工具测试当前数据源里的频道名：

```bash
# 本地测试：先抓一次数据，看 epg.pw 里有没有这个频道名
node scripts/grab.js --test --channel 大湾区卫视
```

### 第二步：在 channels.yaml 末尾添加

```yaml
# config/channels.yaml

  - id: "DawanquTV"          # 英文 ID，唯一，不能重复
    name: "大湾区卫视"         # 显示名称
    group: "卫视"             # 分组：央视/卫视/港澳台/数字付费/卫星
    logo: ""                  # 台标图片 URL，可留空
    aliases:                  # 所有可能出现的频道名写法
      - "大湾区卫视"
      - "DawanquTV"
      - "大湾区"
    sources:                  # 数据源（按优先级）
      - type: "xmltv_url"
        name: "大湾区卫视"    # 在 epg.pw 等 XMLTV 源里的频道名
```

### 第三步：提交

```bash
git add config/channels.yaml
git commit -m "feat: 添加大湾区卫视"
git push
```

Actions 自动触发，约 10 分钟后节目单更新。

---

## 添加新数据源

系统支持两类数据源。根据你要添加的来源选择对应方式：

### 方式 A：添加 XMLTV URL 源（最简单，推荐）

**适用**：对方已经提供了标准 XMLTV 格式的节目单文件（`.xml` 或 `.xml.gz`）。

**第一步**：在 `config/sources.yaml` 的 `xmltv_sources` 列表里添加：

```yaml
# config/sources.yaml

xmltv_sources:
  # ... 已有的源 ...

  # 新增：你的自定义源
  - id: "my_custom_source"       # 唯一 ID，英文
    name: "我的自定义 EPG"         # 显示名称
    url: "https://example.com/epg/guide.xml.gz"  # XMLTV 文件地址
    enabled: true
    note: "某某网站提供的 EPG"
```

**第二步**：在 `config/channels.yaml` 里，让需要用这个源的频道指向它：

```yaml
  - id: "MyChannel"
    name: "某频道"
    aliases:
      - "某频道"
    sources:
      - type: "xmltv_url"
        name: "某频道"    # 在新数据源里这个频道叫什么名字
```

系统会自动遍历所有启用的 `xmltv_sources`，直到找到匹配的频道为止。**不需要指定从哪个源拿**，按 `sources.yaml` 里的顺序依次尝试。

---

### 方式 B：添加自定义 API 爬虫

**适用**：对方没有现成 XMLTV，但有 JSON/HTML 格式的节目单页面，需要自己写解析代码。

#### 第一步：创建爬虫文件

在 `scripts/sites/` 目录下新建文件，模板如下：

```javascript
// scripts/sites/mysite.js

import { fetchWithRetry, logger, sleep } from '../utils.js';

/**
 * 获取某频道某天的节目单
 *
 * @param {Object} channel   - 频道配置对象（来自 channels.yaml）
 * @param {string} channelId - 在本数据源里该频道的 ID（来自 channels.yaml 的 sources[].id）
 * @param {Date}   date      - 要抓取哪天（北京时间 00:00:00 的 Date 对象）
 * @returns {Array}          - 节目数组，每项：{ start: Date, stop: Date|null, title: string, desc: string }
 */
export async function getEpgMysite(channel, channelId, date) {
  const epgs = [];

  // 格式化日期，很多 API 用 "20240101" 或 "2024-01-01"
  const dateStr = date.toISOString().slice(0, 10); // "2024-01-01"

  const url = `https://example.com/api/epg?channel=${channelId}&date=${dateStr}`;

  try {
    await sleep(300); // 礼貌等待，防止被限速

    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }, 2, 10000); // 重试 2 次，超时 10 秒

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    // 根据实际接口格式解析，这里是示例
    for (const item of json.programs || []) {
      const start = new Date(item.startTime);   // 根据实际字段调整
      const stop  = new Date(item.endTime);
      const title = item.name || item.title || '';
      const desc  = item.description || '';

      if (!title) continue;
      epgs.push({ start, stop, title, desc });
    }

    logger.info(`[mysite] ${channel.name} ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[mysite] ${channel.name} ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

// 频道列表（可选，用于自动发现频道，不用可以留空）
export async function getChannelsMysite() {
  return [];
}
```

#### 第二步：注册到数据源入口

编辑 `scripts/sites/index.js`，加两行：

```javascript
// scripts/sites/index.js

import { getEpgMysite, getChannelsMysite } from './mysite.js';   // ← 新增

export const scraperRegistry = {
  // ... 已有的 ...
  mysite: {                          // ← 新增，key 就是 channels.yaml 里 type 的值
    getEpg: getEpgMysite,
    getChannels: getChannelsMysite,
  },
};
```

#### 第三步：在 channels.yaml 里引用

```yaml
  - id: "MyChannel"
    name: "某频道"
    aliases:
      - "某频道"
    sources:
      - type: "mysite"       # ← 对应 scraperRegistry 里的 key
        id: "channel_001"    # ← 传给 getEpgMysite 的 channelId 参数
```

#### 第四步：本地测试

```bash
node scripts/grab.js --test --channel 某频道 --days 1
```

看到 `✓ 某频道: 获取 XX 条节目` 即成功，然后提交即可。

---

## 如何找到频道在数据源中的名字

当你添加一个新频道，需要知道它在 epg.pw 等数据源里叫什么名字。

**方法 1：使用 epg.pw 的频道搜索**

打开 https://epg.pw/check_guide.php，选择 `China`，搜索频道名。  
页面显示的 `Channel name` 就是你在 `channels.yaml` 的 `sources[].name` 里填的值。

**方法 2：本地搜索 XMLTV 文件**

```bash
# 下载 epg.pw 的中国大陆数据（约 2MB gzip）
curl -L https://epg.pw/xmltv/epg_CN.xml.gz | gunzip | grep -o 'display-name[^<]*<[^>]*>[^<]*' | grep "浙江" | head -10
```

**方法 3：用 --test 模式观察日志**

先随便填一个名字运行，日志里会提示"未找到频道"，你可以根据日志去源文件里确认正确的名字。

---

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /guide.xml` | 完整节目单（所有频道） |
| `GET /guide.xml.gz` | gzip 压缩版本（**推荐，体积小 80%**） |
| `GET /guide_mainland.xml` | 仅大陆频道（央视+卫视） |
| `GET /guide_hktw.xml` | 仅港澳台频道 |
| `GET /channels.json` | 频道列表（含别名、EPG 状态） |
| `GET /match?name=浙江卫视4K` | 测试频道名是否能匹配 |
| `GET /status` | 服务状态（含最后更新时间） |

---

## 部署文档

### 首次部署

**需要**：Cloudflare 账号 + GitHub 账号

```bash
# 1. Fork 或 clone 本项目
git clone https://github.com/zqs1qiwan/laobaiepg.git
cd laobaiepg && npm install

# 2. 登录 Cloudflare
npx wrangler login

# 3. 创建 R2 Bucket
npx wrangler r2 bucket create epg-data

# 4. 创建 KV Namespace
npx wrangler kv namespace create EPG_KV
# → 记录返回的 id 和 preview_id，填入 wrangler.jsonc

# 5. 部署 Worker
npx wrangler deploy
```

### GitHub Actions 配置

在仓库 Settings → Secrets 中添加：

| Secret | 获取方式 |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | [Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → Edit Cloudflare Workers 模板，额外添加 R2 Edit 权限 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 主页右侧 Account ID |
| `KV_NAMESPACE_ID` | 上一步 `wrangler kv namespace create` 返回的 id |

### 自动运行

- **每天北京时间 0:30、12:30** 自动抓取更新
- `worker/**` 或 `wrangler.jsonc` 有修改时自动重新部署 Worker
- 手动触发：GitHub → Actions → 抓取 EPG 节目单 → Run workflow

---

## 数据源现状

| 数据源 | 类型 | 覆盖 | 状态 |
|--------|------|------|------|
| epg.pw 中国大陆 | XMLTV URL | CCTV、卫视等 500+ 频道 | ✅ 正常 |
| epg.pw 香港 | XMLTV URL | TVB、凤凰等港台频道 | ✅ 正常 |
| epg.pw 台湾 | XMLTV URL | 台湾主要电视台 | ✅ 正常 |
| 电视猫 tvmao | 爬虫 | 全国数百频道（备用） | ✅ 正常 |
| TVB 香港无线 | 爬虫 | 翡翠台、明珠台 | ✅ 正常 |
| NOW TV | 爬虫 | 香港 NOW TV | ✅ 正常 |
| 台湾宽频 | 爬虫 | 台湾本土频道 | ✅ 正常 |

---

## 鸣谢

- [supzhang/epg](https://github.com/supzhang/epg) - 多源抓取架构参考
- [epg.pw](https://epg.pw) - 主要 XMLTV 数据源
