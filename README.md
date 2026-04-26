# LaobaiEPG

**基于 Cloudflare Workers + R2 + GitHub Actions 的纯边缘化 IPTV EPG 管理系统**

[![GitHub Actions](https://github.com/zqs1qiwan/laobaiepg/actions/workflows/grab.yml/badge.svg)](https://github.com/zqs1qiwan/laobaiepg/actions/workflows/grab.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> [English Version](README_EN.md)

---

## ✨ 特性

- **纯边缘化** — 完全运行在 Cloudflare 全球网络，无需自建服务器
- **多源聚合** — 支持 epg.pw、CNTV官方(cntv)、北京台(brtv)、电视猫(tvmao)、看看新闻(kankanews)、陕西台(shaanxi)、澳门 TDM、香港 TVB 等多个数据源，自动换源
- **数据保护** — 按日期维度合并新旧数据，抓取失败不丢失已有节目单，7 天窗口始终完整
- **智能匹配** — CCTV 正则自动归一化 + 繁简自动转换 + 多别名匹配
- **自动更新** — GitHub Actions 每天定时抓取，epg.pw 数据源一次抓取 7 天覆盖，节目单始终保持充足
- **Web 管理面板** — 内置可视化管理界面，频道状态一目了然
- **开箱即用** — 直接使用公共服务地址，也可 Fork 部署自己的实例

---

## 📺 公共 EPG 服务

> **无需部署**，直接在 IPTV 播放器中填入以下地址即可使用。

| 格式 | 地址 |
|------|------|
| 完整节目单 | `https://laobaiepg.laobaitv.net/guide.xml` |
| **压缩版（推荐）** | `https://laobaiepg.laobaitv.net/guide.xml.gz` |
| 大陆频道 | `https://laobaiepg.laobaitv.net/guide_mainland.xml` |
| 港澳台频道 | `https://laobaiepg.laobaitv.net/guide_hktw.xml` |

**管理面板：** https://laobaiepg.laobaitv.net/

**支持的播放器：** TiviMate、Kodi、Perfect Player、VLC、DIYP 等所有支持 XMLTV 格式的播放器

---

## 🧠 智能匹配系统

无需手动对照频道名，系统自动处理以下匹配场景：

| 你的播放列表写法 | 自动匹配到 | 匹配方式 |
|---|---|---|
| `CCTV-1` / `CCTV 1` / `cctv1综合` | CCTV1 | CCTV 正则 |
| `CCTV5PLUS` / `cctv 5+` | CCTV5+ | CCTV 正则 |
| `浙江卫视4K` / `浙江卫视 4K HD` | 浙江卫视 | 别名 + 后缀去除 |
| `翡翠臺` | TVB 翡翠台 | 繁简自动转换 |
| `鳳凰資訊` | 凤凰资讯台 | 繁简自动转换 |
| `無線新聞` | TVB 互动新闻台 | 繁简自动转换 |

在管理面板的「匹配测试」页面可以实时验证匹配效果。

---

## 📋 频道管理

所有配置通过编辑 YAML 文件完成，提交后约 3-5 分钟自动生效。

### 添加频道别名

编辑 `config/channels.yaml`，在对应频道的 `aliases` 里添加你的写法：

```yaml
- id: zhejiangweishi
  name: 浙江卫视
  aliases:
    - 浙江卫视
    - 浙江卫视4K       # ← 添加你需要的别名
    - 浙江卫视 4K HD
    - ZJTV
```

### 添加新频道

```yaml
- id: wodeweishi            # 唯一 ID（拼音，全小写）
  name: 我的频道              # 显示名称
  group: 卫视                # 分组：央视/卫视/港澳台/地方台/数字付费/卫星
  aliases:
    - 我的频道
    - 我的频道4K
  sources:
    - type: epgpw_api
      id: "12345"           # epg.pw 频道 ID
```

频道 ID 可在 [epg.pw](https://epg.pw/check_guide.php) 搜索获取。

### 数据源类型

| 类型 | 说明 | IP 要求 |
|------|------|--------|
| `epgpw_api` | epg.pw JSON API，推荐，实时数据，7 天覆盖 | 无限制 |
| `cntv` | CCTV 官方 API，CCTV 全系列 + 30 个卫视，3 天覆盖 | 无限制 |
| `tvmao` | 电视猫 lighttv，覆盖大多数卫视/地方台，3 天覆盖 | **需要中国大陆 IP**，海外 IP 返回限速响应 |
| `brtv` | 北京广播电视台官方 API（BTV2/3/4/5/7/9/10/12，数据精准）| **需要中国大陆住宅 IP**，数据中心 IP 被阿里云 WAF 拦截 |
| `kankanews` | 上海广播电视台（SMG）官方 API，今日节目单精准 | 无限制 |
| `shaanxi` | 陕西广播电视台官方 API，陕西卫视 + 5 个地方台，7 天覆盖 | 无限制 |
| `tdm` | 澳门广播电视 TDM，澳视系列 6 个频道 | 无限制 |
| `tvb` | 香港无线电视官方 API（翡翠台/明珠台/TVB Plus/无线新闻台，4 天覆盖）| 无限制 |

> ⚠️ **部署注意**：`brtv` 数据源需要中国大陆住宅 IP 才能正常抓取。
> - 使用 GitHub Actions（海外 IP）时，`tvmao`、`kankanews`、`cntv`、`shaanxi` 均可直连，但 `brtv` 需要通过国内住宅 IP 代理访问。
> - 本仓库通过在路由器部署 HTTP 代理（`BRTV_PROXY_URL` 环境变量）解决 `brtv` 的访问问题。
> - 如果你没有国内住宅 IP 代理，建议将 `brtv` 频道改用 `tvmao` 或 `epgpw_api` 作为数据源。
> - `tvmao` 在 GitHub Actions 环境（海外 IP）下已验证可正常访问。

---

## 🚀 Fork 部署自己的实例

### 前提条件

- GitHub 账号
- Cloudflare 账号（免费额度即可）
- Node.js 18+

### 第一步：Fork 并 Clone

```bash
# 在 GitHub 上 Fork 本仓库，然后 clone 你的 Fork
git clone https://github.com/你的用户名/laobaiepg.git
cd laobaiepg
npm install
```

### 第二步：创建 Cloudflare 资源

```bash
# 登录 Cloudflare
npx wrangler login

# 创建 R2 存储桶（存放 EPG 文件）
npx wrangler r2 bucket create epg-data

# 创建 KV 命名空间（缓存频道索引）
npx wrangler kv namespace create EPG_KV
# → 记录返回的 id 和 preview_id
```

### 第三步：修改 wrangler.jsonc

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "EPG_KV",
      "id": "你的KV_ID",              // ← 第二步返回的 id
      "preview_id": "你的PREVIEW_ID"   // ← 第二步返回的 preview_id
    }
  ],
  "vars": {
    "ENVIRONMENT": "production",
    "GITHUB_REPO": "你的用户名/laobaiepg"  // ← 你的 Fork 仓库
  }
}
```

### 第四步：配置 GitHub Secrets

在仓库 → **Settings → Secrets and variables → Actions** 中添加：

| Secret | 获取方式 |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → **Edit Cloudflare Workers** 模板，额外添加 R2 Edit 权限 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard 右侧栏 |
| `KV_NAMESPACE_ID` | 第二步 `wrangler kv namespace create` 返回的 id |

### 第五步：部署

```bash
npx wrangler deploy
```

### 第六步：推送代码

推送到 `main` 分支后，GitHub Actions 会自动部署 Worker 并执行首次抓取（约 3 分钟）。

---

## 🏗️ 架构

```
GitHub 仓库（配置 + 代码）
        │
        ├── GitHub Actions（每天定时 2 次）
        │   └── scripts/grab.js  ──→  Cloudflare R2（guide.xml, channels.json）
        │
        └── Cloudflare Worker（边缘服务）
                ├── GET /              管理面板（浏览器）/ JSON 信息（API）
                ├── GET /guide.xml     XMLTV 节目单
                ├── GET /guide.xml.gz  压缩版（推荐）
                ├── GET /channels.json 频道列表 + EPG 状态
                ├── GET /match?name=   频道匹配测试
                └── GET /status        服务状态
```

**Cloudflare 资源用量（均在免费额度内）：**

| 资源 | 用途 | 免费限制 |
|------|------|---------|
| Workers | EPG API 服务 | 10 万次/天 |
| R2 | 存储 XMLTV 文件（~2MB）| 10 GB |
| KV | 频道索引缓存 | 10 万次读/天 |

---

## 📊 API 接口

| 端点 | 说明 |
|------|------|
| `GET /` | 管理面板（浏览器）/ JSON 服务信息（curl/API）|
| `GET /guide.xml` | 完整 XMLTV 节目单 |
| `GET /guide.xml.gz` | 压缩版 **（推荐）** |
| `GET /guide_mainland.xml` | 仅大陆频道 |
| `GET /guide_hktw.xml` | 仅港澳台频道 |
| `GET /channels.json` | 频道列表（含别名、EPG 状态、数据源）|
| `GET /match?name=浙江卫视4K` | 频道匹配测试 |
| `GET /status` | 服务状态和最后更新时间 |

---

## 🔄 更新计划

节目单每天自动更新 **2 次**（北京时间）：

| 北京时间 | UTC | 说明 |
|---------|-----|------|
| 00:55 | 16:55 | 凌晨刷新 |
| 12:55 | 04:55 | 中午刷新 |

> **注意**：GitHub Actions 的定时任务在高峰期可能延迟 1-4 小时触发，属于平台已知限制。
> 为缓解此问题，epg.pw 数据源每次抓取 **7 天**节目单覆盖，tvmao 抓取 **3 天**，即使某次定时任务延迟也不会影响当天节目单显示。
>
> **数据保护机制**：每次抓取完成后，按日期维度与上次结果合并——新抓到的日期用新数据，未抓到或返回空数据的日期保留旧数据。某个频道某天临时抓取失败或数据源返回空（如部分 brtv 频道当天不提供节目单），不会清空该天已有节目单。

如需立即更新，在 [GitHub Actions](https://github.com/zqs1qiwan/laobaiepg/actions/workflows/grab.yml) 手动触发即可。

---

## ⚙️ 配置文件

| 文件 | 用途 |
|------|------|
| `config/channels.yaml` | 频道定义、别名、数据源 |
| `config/sources.yaml` | 抓取设置（天数、间隔、重试；epg.pw 默认 7 天，tvmao 默认 3 天）|
| `wrangler.jsonc` | Cloudflare Worker 配置 |
| `.github/workflows/grab.yml` | 定时抓取计划 |

---

## 🙏 致谢

- [epg.pw](https://epg.pw) — 主要 EPG 数据源
- [supzhang/epg](https://github.com/supzhang/epg) — 多源抓取架构参考
- [iptv-org](https://github.com/iptv-org) — 社区 EPG 资源
- [taksssss/iptv-tool](https://github.com/taksssss/iptv-tool) — CCTV 正则匹配参考

---

## 📄 License

MIT License — 可自由 Fork 部署。

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/zqs1qiwan">laobai</a> · <a href="https://laobaiepg.laobaitv.net/">公共 EPG 服务</a></sub>
</div>
