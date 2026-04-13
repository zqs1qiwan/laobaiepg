# LaobaiEPG

**A pure edge-based IPTV EPG management system built on Cloudflare Workers + R2 + GitHub Actions.**

[![GitHub Actions](https://github.com/zqs1qiwan/laobaiepg/actions/workflows/grab.yml/badge.svg)](https://github.com/zqs1qiwan/laobaiepg/actions/workflows/grab.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> [中文说明](README.md)

---

## ✨ Features

- **Pure edge deployment** — runs entirely on Cloudflare's global network, no server needed
- **Multi-source EPG** — aggregates from epg.pw, tvmao, Macau TDM, with automatic failover
- **Smart matching** — CCTV regex normalization + Traditional/Simplified Chinese auto-conversion + multi-alias support
- **Auto-refresh** — GitHub Actions updates EPG data twice daily
- **Web admin panel** — built-in management UI with channel status, alias testing, and one-click URL copy
- **Zero config for users** — just paste the EPG URL into your IPTV player

---

## 📺 Public EPG Service

> **No deployment needed.** Use the URL below directly in your IPTV player.

| Format | URL |
|--------|-----|
| Full (all channels) | `https://laobaiepg.laobaitv.net/guide.xml` |
| **Compressed (recommended)** | `https://laobaiepg.laobaitv.net/guide.xml.gz` |
| Mainland China only | `https://laobaiepg.laobaitv.net/guide_mainland.xml` |
| HK/Macau/Taiwan only | `https://laobaiepg.laobaitv.net/guide_hktw.xml` |

**Admin panel:** https://laobaiepg.laobaitv.net/

---

## 🧠 Smart Matching

The system automatically handles various channel name formats:

| Your playlist name | Matches to | Method |
|---|---|---|
| `CCTV-1` / `CCTV 1` / `cctv1综合` | CCTV1 | CCTV regex |
| `CCTV5PLUS` / `cctv 5+` | CCTV5+ | CCTV regex |
| `浙江卫视4K` / `浙江卫视 4K HD` | 浙江卫视 | Alias + suffix removal |
| `翡翠臺` (Traditional) | TVB 翡翠台 | Traditional→Simplified auto-conversion |
| `鳳凰資訊` (Traditional) | 凤凰资讯台 | Traditional→Simplified auto-conversion |

---

## 🚀 Deploy Your Own Instance

### Prerequisites

- GitHub account
- Cloudflare account (free tier sufficient)
- Node.js 18+

### Steps

1. **Fork & Clone** this repository
2. **Create Cloudflare resources**: `wrangler r2 bucket create epg-data` and `wrangler kv namespace create EPG_KV`
3. **Edit `wrangler.jsonc`**: fill in your KV namespace ID and set `GITHUB_REPO` to your fork
4. **Configure GitHub Secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `KV_NAMESPACE_ID`
5. **Deploy**: `npx wrangler deploy`
6. **Push to main** — GitHub Actions auto-deploys and runs the first EPG grab (~3 min)

See the [Chinese README](README.md) for detailed step-by-step instructions.

---

## 📊 API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /` | Admin panel (browser) / JSON info (API) |
| `GET /guide.xml` | Full XMLTV programme guide |
| `GET /guide.xml.gz` | Compressed version **(recommended)** |
| `GET /guide_mainland.xml` | Mainland China channels only |
| `GET /guide_hktw.xml` | HK/Macau/Taiwan channels only |
| `GET /channels.json` | Channel list with aliases and EPG status |
| `GET /match?name=浙江卫视4K` | Test channel alias matching |
| `GET /status` | Service status and last update time |

---

## 🏗️ Architecture

```
GitHub Repository
        │
        ├── GitHub Actions (twice daily)
        │   └── scripts/grab.js  ──→  Cloudflare R2 (guide.xml, channels.json)
        │
        └── Cloudflare Worker (edge service)
                ├── GET /              Admin panel / JSON info
                ├── GET /guide.xml     XMLTV programme guide
                ├── GET /channels.json Channel list + EPG status
                ├── GET /match?name=   Alias matching test
                └── GET /status        Service status
```

All Cloudflare resources used are within the free tier (Workers 100k req/day, R2 10GB, KV 100k reads/day).

---

## 🙏 Acknowledgements

- [epg.pw](https://epg.pw) — Primary EPG data source
- [supzhang/epg](https://github.com/supzhang/epg) — Multi-source scraping architecture reference
- [iptv-org](https://github.com/iptv-org) — Community EPG resources
- [taksssss/iptv-tool](https://github.com/taksssss/iptv-tool) — CCTV regex matching reference

---

## 📄 License

MIT License — feel free to fork and deploy your own instance.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/zqs1qiwan">laobai</a> · <a href="https://laobaiepg.laobaitv.net/">Public EPG Service</a></sub>
</div>
