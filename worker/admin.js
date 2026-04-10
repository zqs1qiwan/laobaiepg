/**
 * LaobaiEPG 管理页面 HTML
 * 内嵌在 Worker 中，通过根路径 / 提供服务
 *
 * 开源设计：
 * - GitHub 链接从 / API 动态读取（env.GITHUB_REPO），Fork 者无需修改此文件
 * - Footer 的 "Powered by LaobaiEPG" 永远指向原始项目，保留归因
 */

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LaobaiEPG 管理面板</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f172a;--surface:#1e293b;--surface2:#263348;--border:#334155;
  --text:#e2e8f0;--muted:#64748b;--accent:#3b82f6;--accent2:#60a5fa;
  --green:#22c55e;--red:#ef4444;--yellow:#f59e0b;
}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;min-height:100vh;display:flex;flex-direction:column}
main{flex:1}
a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}

.header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:100}
.header-logo{font-size:18px;font-weight:700;color:var(--accent)}
.header-badge{background:var(--accent);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.header-gh{margin-left:auto;display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;text-decoration:none;padding:4px 8px;border:1px solid var(--border);border-radius:5px;transition:.15s}
.header-gh:hover{border-color:var(--accent);color:var(--accent);text-decoration:none}
.header-gh svg{opacity:.7}

.tabs{display:flex;gap:2px;padding:0 24px;background:var(--surface);border-bottom:1px solid var(--border)}
.tab{padding:10px 18px;cursor:pointer;color:var(--muted);font-size:13px;font-weight:500;border:none;background:none;border-bottom:2px solid transparent;transition:all .15s}
.tab:hover{color:var(--text)}.tab.active{color:var(--accent2);border-bottom-color:var(--accent2)}
.tab-panel{display:none;padding:24px;max-width:1400px;margin:0 auto}.tab-panel.active{display:block}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px}
.stat-value{font-size:28px;font-weight:700;color:var(--accent)}.stat-label{color:var(--muted);font-size:12px;margin-top:4px}
.progress-wrap{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px}
.progress-label{display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;color:var(--muted)}
.progress-bar{height:8px;background:var(--border);border-radius:4px;overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:4px;transition:width .6s ease}

.url-box{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:18px;margin-bottom:20px}
.url-box h3{font-size:14px;font-weight:600;margin-bottom:14px}
.url-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}.url-row:last-child{margin-bottom:0}
.url-label{color:var(--muted);font-size:12px;width:90px;flex-shrink:0}
.url-value{font-family:monospace;font-size:12px;color:var(--accent2);background:var(--bg);padding:5px 10px;border-radius:4px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.copy-btn{padding:4px 10px;font-size:11px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer;white-space:nowrap;transition:.15s}
.copy-btn:hover{border-color:var(--accent);color:var(--accent)}.copy-btn.copied{background:var(--green);border-color:var(--green);color:#fff}

.status-box{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:18px;margin-bottom:20px}
.status-box h3{font-size:14px;font-weight:600;margin-bottom:14px}
.status-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)}.status-row:last-child{border-bottom:none}
.status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.status-dot.ok{background:var(--green)}.status-dot.err{background:var(--red)}
.status-filename{font-family:monospace;font-size:13px;flex:1}.status-meta{color:var(--muted);font-size:12px}

.list-controls{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.list-count{color:var(--muted);font-size:12px;margin-left:auto}
.search-input{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:13px;flex:1;min-width:200px;max-width:320px}
.search-input:focus{outline:none;border-color:var(--accent)}
.filter-btns{display:flex;gap:4px;flex-wrap:wrap}
.filter-btn{padding:5px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--muted);transition:.15s}
.filter-btn:hover{color:var(--text)}.filter-btn.active{background:var(--accent);border-color:var(--accent);color:#fff}

.ch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.ch-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;cursor:pointer;transition:border-color .15s,background .15s;user-select:none}
.ch-card:hover{border-color:var(--accent);background:var(--surface2)}
.ch-card.no-epg{border-color:rgba(239,68,68,.3)}
.ch-header{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.ch-logo-wrap{width:40px;height:40px;flex-shrink:0;position:relative}
.ch-logo{width:40px;height:40px;border-radius:6px;object-fit:contain;background:var(--bg);border:1px solid var(--border);display:block}
.ch-logo-fallback{width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;text-align:center;line-height:1.2;padding:3px;word-break:break-all}
.ch-title{flex:1;min-width:0}
.ch-name{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ch-group-tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:3px;margin-top:2px;font-weight:500;color:#fff}
.ch-id{font-family:monospace;font-size:11px;color:var(--muted);margin-bottom:5px}
.ch-source{font-size:11px;color:var(--muted);margin-bottom:5px;display:flex;flex-wrap:wrap;gap:4px}
.source-badge{font-size:10px;padding:1px 5px;border-radius:3px;background:var(--surface2);border:1px solid var(--border);font-family:monospace}
.ch-epg-status{display:flex;align-items:center;gap:5px;font-size:12px;margin-bottom:4px}
.ch-epg-status.ok{color:var(--green)}.ch-epg-status.none{color:var(--red)}
.ch-aliases{display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
.ch-card.expanded .ch-aliases{display:block}
.alias-label{font-size:11px;color:var(--muted);margin-bottom:5px}
.alias-tags{display:flex;flex-wrap:wrap;gap:4px}
.alias-tag{background:var(--bg);border:1px solid var(--border);color:var(--muted);padding:2px 7px;border-radius:3px;font-size:11px}

.match-box{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:16px}
.match-box h3{font-size:14px;font-weight:600;margin-bottom:14px}
.match-input-row{display:flex;gap:8px}
.match-input{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:13px;flex:1}
.match-input:focus{outline:none;border-color:var(--accent)}
.match-btn{padding:8px 16px;background:var(--accent);border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap}
.match-btn:hover{opacity:.85}
.match-result{margin-top:14px;padding:12px;border-radius:6px;font-size:13px}
.match-result.ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--green)}
.match-result.fail{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red)}
.match-result.loading{background:var(--surface2);border:1px solid var(--border);color:var(--muted)}
.match-detail{margin-top:8px;font-family:monospace;font-size:12px;color:var(--text)}
.batch-textarea{width:100%;height:130px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:10px;border-radius:6px;font-family:monospace;font-size:13px;resize:vertical;margin-bottom:10px}
.batch-textarea:focus{outline:none;border-color:var(--accent)}
.batch-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:14px}
.batch-table th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;font-size:12px}
.batch-table td{padding:7px 10px;border-bottom:1px solid var(--border)}.batch-table tr:last-child td{border-bottom:none}
.ok-text{color:var(--green)}.fail-text{color:var(--red)}

.guide-section{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:16px}
.guide-section h3{font-size:15px;font-weight:600;margin-bottom:12px;color:var(--accent2)}
.guide-section p{color:var(--muted);line-height:1.7;margin-bottom:10px}.guide-section p:last-child{margin-bottom:0}
.code-block{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px;font-family:monospace;font-size:12px;line-height:1.6;overflow-x:auto;margin:10px 0;color:var(--accent2)}
.loading-text{text-align:center;color:var(--muted);padding:40px;font-size:13px}
.empty-text{text-align:center;color:var(--muted);padding:30px;font-size:13px}

/* Footer */
.footer{background:var(--surface);border-top:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;justify-content:center;gap:16px;font-size:12px;color:var(--muted);flex-wrap:wrap}
.footer a{color:var(--muted)}.footer a:hover{color:var(--accent2);text-decoration:none}
.footer-sep{opacity:.3}
</style>
</head>
<body>
<main>

<div class="header">
  <span class="header-logo">LaobaiEPG</span>
  <span class="header-badge">管理面板</span>
  <a class="header-gh" id="header-repo-link" href="https://github.com/zqs1qiwan/laobaiepg" target="_blank">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
    <span id="header-repo-text">GitHub</span>
  </a>
</div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('status')">状态总览</button>
  <button class="tab" onclick="switchTab('channels')">频道列表</button>
  <button class="tab" onclick="switchTab('match')">匹配测试</button>
  <button class="tab" onclick="switchTab('guide')">使用指南</button>
</div>

<!-- 状态总览 -->
<div class="tab-panel active" id="tab-status">
  <div class="stats">
    <div class="stat-card"><div class="stat-value" id="stat-total">…</div><div class="stat-label">总频道数</div></div>
    <div class="stat-card"><div class="stat-value" id="stat-hasepg">…</div><div class="stat-label">有节目单</div></div>
    <div class="stat-card"><div class="stat-value" id="stat-rate">…</div><div class="stat-label">覆盖率</div></div>
    <div class="stat-card"><div class="stat-value" id="stat-updated" style="font-size:15px;padding-top:6px">…</div><div class="stat-label">最后更新（UTC）</div></div>
  </div>
  <div class="progress-wrap">
    <div class="progress-label"><span>覆盖率</span><span id="progress-text">加载中…</span></div>
    <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
  </div>
  <div class="url-box">
    <h3>EPG 接入地址</h3>
    <div class="url-row"><span class="url-label">完整节目单</span><span class="url-value" id="url-full" onclick="copyUrl('url-full')"></span><button class="copy-btn" id="copy-full" onclick="copyUrl('url-full')">复制</button></div>
    <div class="url-row"><span class="url-label">压缩版(推荐)</span><span class="url-value" id="url-gz" onclick="copyUrl('url-gz')"></span><button class="copy-btn" id="copy-gz" onclick="copyUrl('url-gz')">复制</button></div>
    <div class="url-row"><span class="url-label">大陆频道</span><span class="url-value" id="url-ml" onclick="copyUrl('url-ml')"></span><button class="copy-btn" id="copy-ml" onclick="copyUrl('url-ml')">复制</button></div>
    <div class="url-row"><span class="url-label">港台频道</span><span class="url-value" id="url-hktw" onclick="copyUrl('url-hktw')"></span><button class="copy-btn" id="copy-hktw" onclick="copyUrl('url-hktw')">复制</button></div>
  </div>
  <div class="status-box">
    <h3>节目单文件状态</h3>
    <div id="statusRows"><div class="loading-text">检查中…</div></div>
  </div>
</div>

<!-- 频道列表 -->
<div class="tab-panel" id="tab-channels">
  <div class="list-controls">
    <input class="search-input" type="text" id="searchInput" placeholder="搜索频道名、ID 或别名…" oninput="filterChannels()">
    <div class="filter-btns" id="groupFilters"></div>
    <span class="list-count" id="listCount"></span>
  </div>
  <div id="channelGrid" class="ch-grid"><div class="loading-text">加载中…</div></div>
</div>

<!-- 匹配测试 -->
<div class="tab-panel" id="tab-match">
  <div class="match-box">
    <h3>单频道测试</h3>
    <p style="color:var(--muted);font-size:12px;margin-bottom:12px">输入你 M3U 播放列表中的 tvg-name，测试能否匹配到节目单</p>
    <div class="match-input-row">
      <input class="match-input" type="text" id="matchInput" placeholder="例如：浙江卫视4K、翡翠台、CCTV1" onkeydown="if(event.key==='Enter')testMatch()">
      <button class="match-btn" onclick="testMatch()">测试匹配</button>
    </div>
    <div id="matchResult" style="display:none" class="match-result"></div>
  </div>
  <div class="match-box">
    <h3>批量测试</h3>
    <p style="color:var(--muted);font-size:12px;margin-bottom:12px">粘贴 M3U 频道名，每行一个，批量检查匹配情况</p>
    <textarea class="batch-textarea" id="batchInput" placeholder="浙江卫视4K&#10;CCTV1&#10;翡翠台&#10;睛彩竞技"></textarea>
    <button class="match-btn" onclick="batchTest()">批量测试</button>
    <div id="batchResult" style="display:none">
      <table class="batch-table">
        <thead><tr><th>输入频道名</th><th>匹配到的频道</th><th>状态</th></tr></thead>
        <tbody id="batchBody"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- 使用指南 -->
<div class="tab-panel" id="tab-guide">
  <div class="guide-section">
    <h3>在 IPTV 播放器中配置</h3>
    <p>在 TiviMate、Kodi、Perfect Player 等播放器的 EPG 设置中，填入以下地址：</p>
    <div class="code-block" id="guide-epg-url">加载中…</div>
    <p>播放器会根据播放列表中的 <code style="background:var(--bg);padding:1px 4px;border-radius:3px">tvg-name</code> 自动匹配频道节目单。别名匹配已内置，例如 <code style="background:var(--bg);padding:1px 4px;border-radius:3px">浙江卫视4K</code> 会自动匹配到浙江卫视的节目单。</p>
  </div>
  <div class="guide-section">
    <h3>添加频道别名</h3>
    <p>编辑仓库中的 <code style="background:var(--bg);padding:1px 4px;border-radius:3px">config/channels.yaml</code>，在对应频道的 <code style="background:var(--bg);padding:1px 4px;border-radius:3px">aliases</code> 列表里添加你的频道名写法，提交后约 3-5 分钟生效。</p>
    <div class="code-block">- id: "ZhejiangTV"
  name: "浙江卫视"
  aliases:
    - "浙江卫视"
    - "浙江卫视4K"    ← 添加新别名
    - "ZJTV"</div>
    <p><a id="link-channels-yaml" href="#" target="_blank">→ 在 GitHub 上编辑 channels.yaml</a></p>
  </div>
  <div class="guide-section">
    <h3>添加新频道</h3>
    <p>在 <code style="background:var(--bg);padding:1px 4px;border-radius:3px">config/channels.yaml</code> 末尾添加新频道条目：</p>
    <div class="code-block">- id: "MyChannel"
  name: "我的频道"
  group: "卫视"
  aliases:
    - "我的频道"
    - "我的频道4K"
  sources:
    - type: "epgpw_api"
      id: "12345"    ← epg.pw 频道 ID</div>
    <p>epg.pw 频道 ID 可在 <a href="https://epg.pw/check_guide.php" target="_blank">epg.pw 频道列表</a> 中搜索获取。</p>
  </div>
  <div class="guide-section">
    <h3>部署自己的实例</h3>
    <p>Fork 本项目后按照 README 的步骤部署，即可拥有完全属于自己的 EPG 服务。</p>
    <p>
      <a id="link-repo" href="#" target="_blank">→ 查看本实例的 GitHub 仓库</a>
      &nbsp;&nbsp;
      <a href="https://github.com/zqs1qiwan/laobaiepg" target="_blank">→ LaobaiEPG 项目主页</a>
    </p>
  </div>
  <div class="guide-section">
    <h3>手动触发更新</h3>
    <p>节目单每 8 小时自动更新（北京时间 09:00 / 17:00 / 01:00）。如需立即更新，前往 GitHub Actions 手动触发。</p>
    <p><a id="link-actions" href="#" target="_blank">→ 在 GitHub Actions 中手动触发抓取</a></p>
  </div>
</div>

</main>

<!-- Footer：Powered by 永远指向原始项目 -->
<footer class="footer">
  <span>Powered by <a href="https://github.com/zqs1qiwan/laobaiepg" target="_blank"><strong>LaobaiEPG</strong></a></span>
  <span class="footer-sep">·</span>
  <a id="footer-instance-link" href="#" target="_blank" style="display:none">本实例仓库</a>
  <span id="footer-instance-sep" class="footer-sep" style="display:none">·</span>
  <a href="https://epg.pw" target="_blank">epg.pw</a>
  <span class="footer-sep">·</span>
  <span id="footer-host" style="font-family:monospace"></span>
</footer>

<script>
const BASE = window.location.origin;
let allChannels = [];
let activeGroup = 'ALL';
let renderAbortKey = 0;
// 当前实例 repo 信息（从 / API 读取）
let instanceRepo = 'zqs1qiwan/laobaiepg';

const GC = {
  '央视':'#3b82f6','卫视':'#8b5cf6','港澳台':'#ec4899',
  '地方台':'#f59e0b','数字付费':'#10b981','卫星':'#06b6d4','少儿':'#f97316'
};
const gc = g => GC[g] || '#64748b';

// ── 台标懒加载 ──
const logoObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const wrap = entry.target;
    if (wrap.dataset.loaded) return;
    wrap.dataset.loaded = '1';
    const img = document.createElement('img');
    img.className = 'ch-logo';
    img.onload = () => { wrap.querySelector('.ch-logo-fallback')?.remove(); wrap.appendChild(img); };
    img.onerror = () => {};
    img.src = 'https://logo.laobaitv.net/' + wrap.dataset.id;
    logoObserver.unobserve(wrap);
  });
}, { rootMargin: '200px 0px' });

// ── Tab 切换 ──
function switchTab(name) {
  const names = ['status','channels','match','guide'];
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', names[i]===name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  if (name === 'channels') {
    if (allChannels.length > 0 && !document.getElementById('channelGrid').querySelector('.ch-card')) {
      buildGroupFilters(); renderChannels(allChannels);
    } else if (allChannels.length === 0) {
      loadChannels();
    }
  }
}

// ── 初始化：先加载 info，再加载数据 ──
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('footer-host').textContent = window.location.host;
  // EPG URLs（先用当前 origin 填写，不等 API）
  const paths = ['/guide.xml','/guide.xml.gz','/guide_mainland.xml','/guide_hktw.xml'];
  ['url-full','url-gz','url-ml','url-hktw'].forEach((id,i) =>
    document.getElementById(id).textContent = BASE + paths[i]);
  document.getElementById('guide-epg-url').textContent = BASE + '/guide.xml.gz';

  // 加载 info（获取 repo 信息）和数据（并行）
  await loadInfo();
  loadStatus();
});

// ── 加载实例信息（repo、github 链接）──
async function loadInfo() {
  try {
    const res = await fetch(BASE + '/');
    // 注意：浏览器 fetch / 会收到 HTML，需用 JSON 接口
    // Worker 对 Accept: text/html 返回 HTML，其他返回 JSON
    // 这里直接 fetch（无 text/html header）会拿到 JSON
    const info = await res.json();
    instanceRepo = info.repo || 'zqs1qiwan/laobaiepg';
    const repoUrl = info.github || ('https://github.com/' + instanceRepo);

    // Header GitHub 链接
    const headerLink = document.getElementById('header-repo-link');
    headerLink.href = repoUrl;
    document.getElementById('header-repo-text').textContent = instanceRepo;

    // 使用指南 Tab 里的动态链接
    document.getElementById('link-channels-yaml').href = repoUrl + '/blob/main/config/channels.yaml';
    document.getElementById('link-repo').href = repoUrl;
    document.getElementById('link-actions').href = repoUrl + '/actions/workflows/grab.yml';

    // Footer：只有当实例 repo 不是原始项目时，才显示"本实例仓库"链接
    if (instanceRepo !== 'zqs1qiwan/laobaiepg') {
      document.getElementById('footer-instance-link').href = repoUrl;
      document.getElementById('footer-instance-link').textContent = instanceRepo;
      document.getElementById('footer-instance-link').style.display = '';
      document.getElementById('footer-instance-sep').style.display = '';
    }
  } catch(e) {
    // 加载失败时使用默认值，静默处理
  }
}

// ── 复制 URL ──
function copyUrl(elemId) {
  const text = document.getElementById(elemId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-' + elemId.replace('url-',''));
    if (!btn) return;
    btn.textContent = '已复制!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1800);
  });
}

// ── 加载状态总览 ──
async function loadStatus() {
  try {
    const [sRes, cRes] = await Promise.all([
      fetch(BASE + '/status'),
      fetch(BASE + '/channels.json'),
    ]);
    const status = await sRes.json();
    const channels = await cRes.json();
    allChannels = channels;

    const total = channels.length;
    const hasEpg = channels.filter(c => c.hasEpg).length;
    const rate = total > 0 ? (hasEpg / total * 100).toFixed(1) : 0;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-hasepg').textContent = hasEpg;
    document.getElementById('stat-rate').textContent = rate + '%';
    document.getElementById('progress-text').textContent = hasEpg + ' / ' + total + ' 个频道有节目单';
    document.getElementById('progress-fill').style.width = rate + '%';

    const gx = status.guide_xml;
    document.getElementById('stat-updated').textContent = gx?.last_modified
      ? new Date(gx.last_modified).toISOString().replace('T',' ').slice(0,16) : '未知';

    document.getElementById('statusRows').innerHTML = [
      sRow('guide.xml', !!gx, gx ? (gx.size/1024).toFixed(0)+' KB' : '不存在',
        gx?.last_modified ? new Date(gx.last_modified).toISOString().replace('T',' ').slice(0,16)+' UTC' : ''),
      sRow('guide.xml.gz', !!gx, '', ''),
      sRow('channels.json', channels.length > 0, channels.length + ' 个频道', ''),
    ].join('');
  } catch(e) {
    document.getElementById('statusRows').innerHTML =
      '<div class="empty-text" style="color:var(--red)">加载失败: ' + e.message + '</div>';
  }
}

function sRow(name, ok, meta, time) {
  return \`<div class="status-row">
    <div class="status-dot \${ok?'ok':'err'}"></div>
    <span class="status-filename">\${name}</span>
    <span class="status-meta">\${meta}</span>
    <span class="status-meta" style="margin-left:auto">\${time}</span>
  </div>\`;
}

// ── 频道列表 ──
async function loadChannels() {
  document.getElementById('channelGrid').innerHTML = '<div class="loading-text">加载中…</div>';
  try {
    if (allChannels.length === 0) {
      allChannels = await (await fetch(BASE + '/channels.json')).json();
    }
    buildGroupFilters();
    renderChannels(allChannels);
  } catch(e) {
    document.getElementById('channelGrid').innerHTML =
      '<div class="empty-text" style="color:var(--red)">加载失败: ' + e.message + '</div>';
  }
}

function buildGroupFilters() {
  const groups = ['ALL', ...new Set(allChannels.map(c=>c.group).filter(Boolean))];
  document.getElementById('groupFilters').innerHTML = groups
    .map(g => \`<button class="filter-btn \${g===activeGroup?'active':''}" onclick="setGroup('\${g}')">\${g==='ALL'?'全部':g}</button>\`)
    .join('');
}

function setGroup(g) { activeGroup = g; buildGroupFilters(); filterChannels(); }

function filterChannels() {
  const q = (document.getElementById('searchInput')?.value||'').toLowerCase().trim();
  const filtered = allChannels.filter(ch => {
    if (activeGroup !== 'ALL' && ch.group !== activeGroup) return false;
    if (!q) return true;
    return (ch.name||'').toLowerCase().includes(q)
        || (ch.id||'').toLowerCase().includes(q)
        || (ch.aliases||[]).some(a=>a.toLowerCase().includes(q));
  });
  renderChannels(filtered);
}

function renderChannels(channels) {
  const grid = document.getElementById('channelGrid');
  const countEl = document.getElementById('listCount');
  if (countEl) countEl.textContent = channels.length + ' 个频道';
  if (channels.length === 0) { grid.innerHTML = '<div class="empty-text">没有匹配的频道</div>'; return; }
  grid.innerHTML = '';
  const myKey = ++renderAbortKey;
  let i = 0;
  function appendBatch() {
    if (myKey !== renderAbortKey) return;
    const frag = document.createDocumentFragment();
    const end = Math.min(i + 30, channels.length);
    for (; i < end; i++) frag.appendChild(makeCard(channels[i]));
    grid.appendChild(frag);
    if (i < channels.length) requestAnimationFrame(appendBatch);
  }
  requestAnimationFrame(appendBatch);
}

function makeCard(ch) {
  const color = gc(ch.group);
  const card = document.createElement('div');
  card.className = 'ch-card ' + (ch.hasEpg ? 'has-epg' : 'no-epg');
  card.addEventListener('click', () => card.classList.toggle('expanded'));

  const logoWrap = document.createElement('div');
  logoWrap.className = 'ch-logo-wrap';
  logoWrap.dataset.id = ch.id;
  const fallback = document.createElement('div');
  fallback.className = 'ch-logo-fallback';
  fallback.style.background = color;
  fallback.textContent = ch.name;
  logoWrap.appendChild(fallback);
  logoObserver.observe(logoWrap);

  const titleDiv = document.createElement('div');
  titleDiv.className = 'ch-title';
  const nameEl = document.createElement('div');
  nameEl.className = 'ch-name'; nameEl.textContent = ch.name;
  const tagEl = document.createElement('span');
  tagEl.className = 'ch-group-tag'; tagEl.style.background = color; tagEl.textContent = ch.group || '';
  titleDiv.appendChild(nameEl); titleDiv.appendChild(tagEl);

  const header = document.createElement('div');
  header.className = 'ch-header';
  header.appendChild(logoWrap); header.appendChild(titleDiv);

  const idEl = document.createElement('div');
  idEl.className = 'ch-id'; idEl.textContent = ch.id;

  const srcEl = document.createElement('div');
  srcEl.className = 'ch-source';
  (ch.sources || []).forEach(s => {
    const b = document.createElement('span');
    b.className = 'source-badge';
    b.textContent = s.type + ':' + (s.id || '');
    srcEl.appendChild(b);
  });
  if (!ch.sources || ch.sources.length === 0) {
    const b = document.createElement('span');
    b.className = 'source-badge'; b.style.color = 'var(--red)'; b.textContent = '无数据源';
    srcEl.appendChild(b);
  }

  const epgEl = document.createElement('div');
  epgEl.className = 'ch-epg-status ' + (ch.hasEpg ? 'ok' : 'none');
  epgEl.textContent = ch.hasEpg ? '✓ ' + ch.programmeCount + ' 条节目' : '✗ 无节目单';

  const aliasBox = document.createElement('div');
  aliasBox.className = 'ch-aliases';
  const aliasLabel = document.createElement('div');
  aliasLabel.className = 'alias-label';
  const aliases = ch.aliases || [];
  aliasLabel.textContent = '别名（共 ' + aliases.length + ' 个）';
  const aliasTags = document.createElement('div');
  aliasTags.className = 'alias-tags';
  aliases.forEach(a => {
    const tag = document.createElement('span');
    tag.className = 'alias-tag'; tag.textContent = a;
    aliasTags.appendChild(tag);
  });
  aliasBox.appendChild(aliasLabel); aliasBox.appendChild(aliasTags);

  card.appendChild(header); card.appendChild(idEl);
  card.appendChild(srcEl); card.appendChild(epgEl); card.appendChild(aliasBox);
  return card;
}

// ── 匹配测试 ──
async function testMatch() {
  const name = document.getElementById('matchInput').value.trim();
  if (!name) return;
  const res = document.getElementById('matchResult');
  res.style.display = 'block'; res.className = 'match-result loading'; res.innerHTML = '测试中…';
  try {
    const d = await (await fetch(BASE + '/match?name=' + encodeURIComponent(name))).json();
    if (d.matched) {
      res.className = 'match-result ok';
      res.innerHTML = '✓ 匹配成功'
        + \`<div class="match-detail">输入: <b>\${d.query}</b><br>归一化: \${d.normalized}<br>匹配到: <b>\${d.matched.name}</b>（\${d.matched.id}）[\${d.matched.group||''}]</div>\`;
    } else {
      res.className = 'match-result fail';
      res.innerHTML = '✗ 未匹配到任何频道'
        + \`<div class="match-detail">输入: \${d.query}<br>归一化: \${d.normalized}</div>\`;
    }
  } catch(e) { res.className = 'match-result fail'; res.innerHTML = '请求失败: ' + e.message; }
}

async function batchTest() {
  const lines = document.getElementById('batchInput').value.split('\\n').map(s=>s.trim()).filter(Boolean);
  if (!lines.length) return;
  document.getElementById('batchResult').style.display = 'block';
  const tbody = document.getElementById('batchBody');
  tbody.innerHTML = '<tr><td colspan="3" style="color:var(--muted);padding:8px">测试中…</td></tr>';
  const rows = await Promise.all(lines.map(async name => {
    try {
      const d = await (await fetch(BASE + '/match?name=' + encodeURIComponent(name))).json();
      return { name, matched: d.matched, ok: d.success };
    } catch { return { name, matched: null, ok: false }; }
  }));
  tbody.innerHTML = rows.map(r =>
    \`<tr>
      <td>\${r.name}</td>
      <td>\${r.matched ? r.matched.name+' <span style="color:var(--muted);font-size:11px">(\${r.matched.id})</span>' : '-'}</td>
      <td class="\${r.ok?'ok-text':'fail-text'}">\${r.ok?'✓ 匹配':'✗ 未匹配'}</td>
    </tr>\`
  ).join('');
}
</script>
</body>
</html>`;
