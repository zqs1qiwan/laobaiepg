# LaobaiEPG

**A pure edge-based IPTV EPG management system built on Cloudflare Workers + R2 + GitHub Actions.**

> 基于 Cloudflare Workers + R2 + GitHub Actions 的纯边缘化 IPTV EPG 管理系统

[![GitHub Actions](https://github.com/zqs1qiwan/laobaiepg/actions/workflows/grab.yml/badge.svg)](https://github.com/zqs1qiwan/laobaiepg/actions/workflows/grab.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ Features / 特性

- **Pure edge deployment** — runs entirely on Cloudflare's global network, no server needed
- **Multi-source EPG** — aggregates from epg.pw (CN/HK/TW), tvmao, and more
- **Smart alias matching** — `浙江卫视4K` auto-matches to `浙江卫视`'s programme guide
- **Auto-refresh** — GitHub Actions updates EPG data every 8 hours automatically
- **Web admin panel** — built-in management UI at the root URL
- **Zero config for users** — just paste the EPG URL into your IPTV player

---

## 📺 Public EPG Service / 公共服务

> **No deployment needed.** Just use the URL below directly in your IPTV player.

| Format | URL |
|--------|-----|
| Full (all channels) | `https://laobaiepg.laobaitv.net/guide.xml` |
| **Compressed (recommended)** | `https://laobaiepg.laobaitv.net/guide.xml.gz` |
| Mainland China channels | `https://laobaiepg.laobaitv.net/guide_mainland.xml` |
| HK & Taiwan channels | `https://laobaiepg.laobaitv.net/guide_hktw.xml` |

**Admin panel:** https://laobaiepg.laobaitv.net/

---

## 🚀 Deploy Your Own Instance / 自己部署

Fork this project and deploy your own EPG service with full control over channel configuration.

### Prerequisites / 前提

- GitHub account
- Cloudflare account (free tier is sufficient)
- Node.js 18+

### Step 1: Fork & Clone

```bash
# Fork this repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/laobaiepg.git
cd laobaiepg
npm install
```

### Step 2: Create Cloudflare Resources

```bash
# Login to Cloudflare
npx wrangler login

# Create R2 bucket for EPG files
npx wrangler r2 bucket create epg-data

# Create KV namespace for channel index cache
npx wrangler kv namespace create EPG_KV
# → Note the returned id and preview_id
```

### Step 3: Configure wrangler.jsonc

Edit `wrangler.jsonc` and fill in the values from Step 2:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "EPG_KV",
      "id": "YOUR_KV_NAMESPACE_ID",        // ← from step 2
      "preview_id": "YOUR_KV_PREVIEW_ID"   // ← from step 2
    }
  ],
  "vars": {
    "ENVIRONMENT": "production",
    "GITHUB_REPO": "YOUR_USERNAME/laobaiepg"  // ← your fork
  }
}
```

### Step 4: Configure GitHub Secrets

In your GitHub repository → **Settings → Secrets and variables → Actions**, add:

| Secret | Where to get it |
|--------|----------------|
| `CLOUDFLARE_API_TOKEN` | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → **Edit Cloudflare Workers** template, also add R2 Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → right sidebar |
| `KV_NAMESPACE_ID` | The `id` returned from `wrangler kv namespace create` in Step 2 |

### Step 5: Deploy Worker

```bash
npx wrangler deploy
```

### Step 6: Push & Auto-run

Push your code to `main`. GitHub Actions will automatically deploy the Worker and run the first EPG grab (~3 minutes). Your service will be live at `https://laobaiepg.YOUR_SUBDOMAIN.workers.dev/`.

---

## 📋 Channel Management / 频道管理

All configuration is done by editing YAML files — changes take effect within 3-5 minutes after commit.

### Adding a Channel Alias / 添加频道别名

Edit `config/channels.yaml`:

```yaml
- id: "ZhejiangTV"
  name: "浙江卫视"
  aliases:
    - "浙江卫视"
    - "浙江卫视4K"       # ← add your variant here
    - "浙江卫视 4K HD"
    - "ZJTV"
```

### Adding a New Channel / 添加新频道

```yaml
- id: "MyChannel"            # unique ID (English)
  name: "我的频道"             # display name
  group: "卫视"               # 央视/卫视/港澳台/地方台/数字付费/卫星
  aliases:
    - "我的频道"
    - "我的频道4K"
  sources:
    - type: "epgpw_api"
      id: "12345"             # epg.pw channel ID
```

Find epg.pw channel IDs at [epg.pw/check_guide.php](https://epg.pw/check_guide.php).

---

## 🏗️ Architecture / 架构

```
GitHub Repository
        │
        ├── GitHub Actions (every 8 hours)
        │   └── scripts/grab.js  ─→  Cloudflare R2 (guide.xml, channels.json)
        │
        └── Cloudflare Worker
                ├── GET /            Web admin panel (browser) / JSON info (API)
                ├── GET /guide.xml   XMLTV programme guide
                ├── GET /channels.json  Channel list with EPG status
                ├── GET /match?name= Alias matching test
                └── GET /status      Service status
```

**Cloudflare resources (all free tier):**

| Resource | Usage | Free Limit |
|----------|-------|-----------|
| Workers | EPG API | 100k req/day |
| R2 | XMLTV files (~2 MB) | 10 GB |
| KV | Channel index cache | 100k reads/day |

---

## 📊 API Reference / API 接口

| Endpoint | Description |
|----------|-------------|
| `GET /` | Admin panel (browser) or JSON service info (curl/API) |
| `GET /guide.xml` | Full XMLTV programme guide |
| `GET /guide.xml.gz` | Compressed version **(recommended)** |
| `GET /guide_mainland.xml` | Mainland China channels only |
| `GET /guide_hktw.xml` | Hong Kong & Taiwan channels only |
| `GET /channels.json` | Channel list with aliases and EPG status |
| `GET /match?name=浙江卫视4K` | Test channel alias matching |
| `GET /status` | Service status and last update time |

---

## 🔄 Update Schedule / 更新计划

EPG refreshes **3 times daily** (Beijing Time / UTC):

| BJT | UTC | Notes |
|-----|-----|-------|
| 09:00 | 01:00 | 1 hour after epg.pw daily data update |
| 17:00 | 09:00 | Midday refresh |
| 01:00 | 17:00 | Overnight refresh |

---

## ⚙️ Key Configuration Files

| File | Purpose |
|------|---------|
| `config/channels.yaml` | Channel definitions, aliases, data sources |
| `config/sources.yaml` | Crawl settings (days, delay, retry) |
| `wrangler.jsonc` | Cloudflare Worker config |
| `.github/workflows/grab.yml` | EPG auto-update schedule |

---

## 🙏 Acknowledgements / 致谢

- [epg.pw](https://epg.pw) — Primary EPG data source
- [supzhang/epg](https://github.com/supzhang/epg) — Multi-source scraping architecture reference
- [iptv-org](https://github.com/iptv-org) — Community EPG resources

---

## 📄 License

MIT License — feel free to fork and deploy your own instance.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/zqs1qiwan">laobai</a> · <a href="https://laobaiepg.laobaitv.net/">Public EPG Service</a></sub>
</div>
