# LaobaiEPG

基于 **Cloudflare Workers + R2 + KV + GitHub Actions** 构建的纯边缘化 IPTV EPG 管理系统。

## 特性

- **纯边缘化**：运行在 Cloudflare 全球边缘节点，无需自建服务器
- **多数据源**：支持 epg.pw、央视官方 API、电视猫、TVB、NOW TV、台湾宽频等多种来源
- **自动换源**：主数据源失败时自动切换备用来源
- **别名匹配**：`浙江卫视4K` 自动匹配到 `浙江卫视` 的节目单
- **GitOps**：所有配置通过 YAML 文件管理，提交即生效
- **自动更新**：GitHub Actions 每12小时自动抓取最新节目单

## 项目结构

```
laobaiepg/
├── config/
│   ├── channels.yaml     # 频道定义 + 别名配置（主要编辑此文件）
│   └── sources.yaml      # 数据源配置
├── scripts/
│   ├── grab.js           # 主抓取程序
│   ├── xmltv.js          # XMLTV 生成器
│   ├── utils.js          # 工具函数
│   └── sites/            # 各数据源适配器
│       ├── index.js      # 数据源统一入口
│       ├── xmltv_url.js  # XMLTV URL 拉取（epg.pw等）
│       ├── cctv.js       # 央视官方 API
│       ├── tvmao.js      # 电视猫
│       ├── tvb.js        # 香港无线电视
│       ├── nowtv.js      # 香港 NOW TV
│       └── tbc.js        # 台湾宽频
├── worker/
│   ├── index.js          # Cloudflare Worker 主入口
│   └── matcher.js        # 频道名匹配引擎
├── admin/
│   └── index.html        # 管理界面（Cloudflare Pages）
├── .github/workflows/
│   ├── grab.yml          # 定时抓取 + 上传到 R2
│   └── deploy.yml        # 自动部署 Worker
├── wrangler.jsonc        # Cloudflare Worker 配置
└── package.json
```

## 部署步骤

### 第一步：准备 Cloudflare 资源

1. 创建 R2 Bucket：
   ```bash
   npx wrangler r2 bucket create epg-data
   ```

2. 创建 KV Namespace：
   ```bash
   npx wrangler kv namespace create EPG_KV
   # 记录返回的 id 和 preview_id
   ```

3. 将 KV ID 填入 `wrangler.jsonc`：
   ```jsonc
   "kv_namespaces": [
     {
       "binding": "EPG_KV",
       "id": "你的KV_ID",
       "preview_id": "你的KV_PREVIEW_ID"
     }
   ]
   ```

### 第二步：配置 GitHub Secrets

在 GitHub 仓库 → Settings → Secrets 中添加：

| Secret | 说明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需要 Workers、R2、KV 权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `KV_NAMESPACE_ID` | 上面创建的 KV Namespace ID |

### 第三步：部署

推送代码到 `main` 分支，GitHub Actions 会自动：
1. 部署 Cloudflare Worker
2. 执行首次 EPG 抓取
3. 将生成的 XMLTV 文件上传到 R2

### 第四步：在播放器中配置

```
EPG URL: https://laobaiepg.你的子域名.workers.dev/guide.xml
      或: https://laobaiepg.你的子域名.workers.dev/guide.xml.gz（推荐，更小）
```

## 添加频道别名

编辑 `config/channels.yaml`：

```yaml
channels:
  - id: "ZhejiangTV"
    name: "浙江卫视"
    group: "卫视"
    aliases:
      - "浙江卫视"
      - "浙江卫视4K"     # 添加新别名
      - "ZhejiangTV"
      - "ZJTV"
    sources:
      - type: "xmltv_url"
        name: "浙江卫视"
```

提交后 Actions 自动重新抓取，新别名即生效。

## 添加自定义数据源

编辑 `config/sources.yaml`：

```yaml
xmltv_sources:
  - id: "my_epg_source"
    name: "我的 EPG 源"
    url: "https://example.com/guide.xml.gz"
    enabled: true
```

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /guide.xml` | 完整节目单（XMLTV 格式） |
| `GET /guide.xml.gz` | gzip 压缩版本（推荐） |
| `GET /guide_mainland.xml` | 中国大陆频道 |
| `GET /guide_hktw.xml` | 港台频道 |
| `GET /channels.json` | 频道列表 + 别名 |
| `GET /match?name=浙江卫视4K` | 测试频道名匹配 |
| `GET /status` | 服务状态 |

## 管理界面

将 `admin/index.html` 部署到 Cloudflare Pages：

```bash
# 直接用 Cloudflare Pages 的 "直接上传" 功能上传此文件
# 或在 Pages 中关联此 GitHub 仓库，设置构建目录为 admin/
```

## 数据源说明

| 数据源 | 类型 | 适用频道 |
|--------|------|---------|
| epg.pw (CN/HK/TW) | XMLTV URL | 中国大陆、香港、台湾主要频道 |
| 央视官方 API | 内置爬虫 | CCTV 1-17 |
| 电视猫 | 内置爬虫 | 全国数百个频道 |
| TVB | 内置爬虫 | 翡翠台、明珠台 |
| NOW TV | 内置爬虫 | 香港 NOW TV 频道 |
| 台湾宽频 | 内置爬虫 | 台湾本土频道 |

## 鸣谢

- [supzhang/epg](https://github.com/supzhang/epg) - 多源抓取逻辑参考
- [iptv-org/epg](https://github.com/iptv-org/epg) - 数据源架构参考
- [epg.pw](https://epg.pw) - XMLTV 数据源
