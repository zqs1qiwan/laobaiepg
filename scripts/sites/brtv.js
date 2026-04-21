/**
 * BRTV（北京广播电视台）节目单数据源
 *
 * API: https://dynamic.rbc.cn/bvradio_app/service/LIVE
 *      ?functionName=getCurrentChannel&channelId=XXX&curdate=YYYYMMDD
 *
 * 频道 ID 映射（来自 https://www.brtv.org.cn/TVjmd.shtml）：
 *   133 → BRTV财经（BTV5）
 *   135 → BRTV文艺（BTV2）
 *   136 → 纪实科教（BTV12）
 *   137 → BRTV影视（BTV4）
 *   138 → 体育休闲（BTV3）
 *   139 → BRTV生活（BTV7）
 *   141 → BRTV新闻（BTV9）
 *   142 → 卡酷少儿（BTV10）
 *
 * 节目时间格式：HH:MM（北京时间），无日期，需结合请求日期还原完整时间
 *
 * ⚠️ 阿里云 WAF (acw_tc) 防护说明：
 *   - 首次请求返回 200 + 空 body + Set-Cookie: acw_tc=xxx
 *   - 必须携带该 cookie 再次请求才返回真实数据
 *   - 从数据中心 IP（GitHub Actions、CF Workers）请求直接返回 405，cookie 无法绕过
 *   - 仅从住宅/ISP IP（如路由器）可以正常完成 cookie 挑战
 *
 * 代理模式（GitHub Actions 使用）：
 *   设置环境变量 BRTV_PROXY_URL + BRTV_PROXY_SECRET
 *   通过部署在路由器上的 brtv-proxy 服务转发请求（住宅 IP 出口）
 *   默认: https://brtv-proxy.laobaitv.net（Cloudflare Tunnel → 家庭路由器）
 */

import https from 'https';
import { fetchWithRetry, logger } from '../utils.js';

const API_BASE = 'https://dynamic.rbc.cn/bvradio_app/service/LIVE';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.brtv.org.cn/',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'identity',
};
const BEIJING_OFFSET_MS = 8 * 3600 * 1000;

/**
 * 代理配置（通过环境变量设置）
 * BRTV_PROXY_URL: 代理服务地址（默认 https://brtv-proxy.laobaitv.net）
 * BRTV_PROXY_SECRET: 代理认证密钥（默认 laobai2026）
 */
const BRTV_PROXY_URL = process.env.BRTV_PROXY_URL || '';
const BRTV_PROXY_SECRET = process.env.BRTV_PROXY_SECRET || 'laobai2026';

/**
 * 阿里云 WAF acw_tc cookie 缓存（直连模式使用）
 * key: hostname, value: cookie string
 */
const cookieCache = new Map();

/**
 * 通过 brtv-proxy 代理获取数据
 * 代理部署在路由器上，走住宅 IP 出口，绕过阿里云 WAF
 *
 * @param {string} channelId - BRTV channelId
 * @param {string} dateStr   - 日期字符串 YYYYMMDD
 * @returns {Object} 解析后的 JSON 数据
 */
async function fetchViaProxy(channelId, dateStr) {
  const proxyUrl = `${BRTV_PROXY_URL}/epg?channelId=${channelId}&date=${dateStr}`;
  const res = await fetchWithRetry(proxyUrl, {
    headers: { 'X-Secret': BRTV_PROXY_SECRET },
  }, 2, 15000);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Proxy HTTP ${res.status}: ${text.substring(0, 200)}`);
  }

  const text = await res.text();
  if (text.length <= 10) {
    throw new Error('Proxy returned empty response');
  }

  return JSON.parse(text);
}

/** 等待指定毫秒 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 使用 node:https 发起 GET 请求（强制新 TCP 连接）
 *
 * Node.js 内置 fetch() 的 keepalive:false 并不可靠地创建新连接，
 * 导致阿里云 WAF cookie 挑战失败。改用 node:https + agent:false。
 */
function httpsGet(url, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, agent: false }, (res) => {
      let body = '';
      const setCookie = res.headers['set-cookie'];
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        ok: res.statusCode >= 200 && res.statusCode < 300,
        body,
        setCookie: setCookie || [],
      }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * 带阿里云 WAF cookie 挑战的直连 fetch
 *
 * 关键细节（阿里云 WAF acw_tc 机制）：
 *   1. 首次请求返回 200 + 空 body + Set-Cookie: acw_tc=xxx
 *   2. 第二次请求必须满足两个条件：
 *      a) 使用新的 TCP 连接（agent: false），不能复用首次请求的连接
 *      b) 等待 ~500ms 让 WAF 后端注册 cookie
 *   3. 不满足这两个条件会导致第二次请求仍返回空 body
 *
 * 注意：Node.js 内置 fetch() 的 keepalive:false 不可靠，因此改用 node:https
 */
async function fetchWithWafCookie(url, headers = {}) {
  const parsed = new URL(url);
  const host = parsed.hostname;

  // 如果有缓存 cookie，先带着试
  const cachedCookie = cookieCache.get(host);
  if (cachedCookie) {
    const res = await httpsGet(url, { ...headers, Cookie: cachedCookie });
    if (res.status !== 405 && res.body.length > 10) {
      return { ok: true, status: res.status, text: res.body };
    }
    cookieCache.delete(host);
  }

  // 步骤 1：首次请求，获取 acw_tc cookie
  const res1 = await httpsGet(url, headers);

  if (res1.status === 405) {
    throw new Error('HTTP 405 (阿里云 WAF 封锁，需从住宅 IP 访问或设置 BRTV_PROXY_URL)');
  }

  // 可能直接返回了数据（WAF 的随机放行）
  if (res1.body.length > 10) {
    // 仍然缓存 cookie 以便后续请求
    if (res1.setCookie.length > 0) {
      const c = res1.setCookie[0].split(';')[0];
      if (c.includes('=')) cookieCache.set(host, c);
    }
    return { ok: true, status: res1.status, text: res1.body };
  }

  // 提取 Set-Cookie
  if (res1.setCookie.length === 0) {
    throw new Error('空响应且无 Set-Cookie');
  }

  const cookie = res1.setCookie[0].split(';')[0];
  if (!cookie || !cookie.includes('=')) {
    throw new Error('无法解析 Set-Cookie');
  }

  cookieCache.set(host, cookie);

  // 等待 WAF 后端注册 cookie（实测需要 ~400ms，给 500ms 余量）
  await sleep(500);

  // 步骤 2：带 cookie 重新请求（agent:false 强制新 TCP 连接）
  const res2 = await httpsGet(url, { ...headers, Cookie: cookie });

  if (res2.body.length <= 10) {
    cookieCache.delete(host);
    throw new Error('Cookie 挑战后仍为空响应');
  }

  return { ok: res2.ok, status: res2.status, text: res2.body };
}

/**
 * 获取 BRTV 某频道某天节目单
 *
 * 策略：
 * 1. 如果设置了 BRTV_PROXY_URL，通过代理获取（GitHub Actions 模式）
 * 2. 否则直连 BRTV API（本地路由器模式，走住宅 IP）
 *
 * @param {Object} channel    - 频道配置（含 name）
 * @param {string} channelId  - BRTV channelId（数字字符串）
 * @param {Date}   date       - 日期（UTC，北京时间基准）
 * @returns {Array} [{start: Date(UTC), stop: Date|null, title: string, desc: string}]
 */
export async function getEpgBrtv(channel, channelId, date) {
  const epgs = [];

  // 北京时间当天 00:00（用 UTC 表达）
  const bjDate = new Date(date.getTime() + BEIJING_OFFSET_MS);
  const y = bjDate.getUTCFullYear();
  const mo = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bjDate.getUTCDate()).padStart(2, '0');
  const dateStr = `${y}${mo}${d}`;
  // 基准：北京时间当天 00:00，以 UTC 表示
  const baseDateBj = new Date(Date.UTC(y, bjDate.getUTCMonth(), bjDate.getUTCDate(), 0, 0, 0));

  try {
    let data;

    if (BRTV_PROXY_URL) {
      // 代理模式：通过 brtv-proxy 获取（GitHub Actions 等数据中心环境）
      data = await fetchViaProxy(channelId, dateStr);
    } else {
      // 直连模式：带 WAF cookie 挑战（路由器等住宅 IP 环境）
      const url = `${API_BASE}?functionName=getCurrentChannel&channelId=${channelId}&curdate=${dateStr}`;
      const result = await fetchWithWafCookie(url, HEADERS);
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      data = JSON.parse(result.text);
    }

    const programs = data?.channel?.programes || [];

    if (programs.length === 0) {
      logger.warn(`[brtv] ${channel.name} (${channelId}) ${dateStr}: 无节目数据`);
      return epgs;
    }

    let prevTimeBj = null;
    const rawEpgs = [];

    for (const prog of programs) {
      const title = (prog.name || '').trim();
      const startStr = prog.startTime; // "HH:MM"
      if (!title || !startStr || title === '结束') continue;

      // 解析时间（北京时间，含跨午夜处理）
      const [h, m] = startStr.split(':').map(Number);
      let timeBj = new Date(baseDateBj);
      timeBj.setUTCHours(h, m, 0, 0);
      if (prevTimeBj !== null && timeBj < prevTimeBj) {
        timeBj = new Date(timeBj.getTime() + 24 * 3600 * 1000);
      }
      prevTimeBj = timeBj;

      const startUtc = new Date(timeBj.getTime() - BEIJING_OFFSET_MS);
      rawEpgs.push({ start: startUtc, title, desc: '' });
    }

    // 推算 stop（下一条节目的 start）
    for (let i = 0; i < rawEpgs.length; i++) {
      const stop = i + 1 < rawEpgs.length
        ? rawEpgs[i + 1].start
        : new Date(rawEpgs[i].start.getTime() + 3600 * 1000); // 最后一条给1小时
      epgs.push({ ...rawEpgs[i], stop });
    }

    const mode = BRTV_PROXY_URL ? '代理' : '直连';
    logger.info(`[brtv] ${channel.name} (${channelId}) ${dateStr}: ${epgs.length} 条节目 (${mode})`);
  } catch (err) {
    logger.error(`[brtv] ${channel.name} (${channelId}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsBrtv() {
  return [];
}
