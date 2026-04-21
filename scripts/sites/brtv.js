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
 */

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
 * 阿里云 WAF acw_tc cookie 缓存
 * key: hostname, value: cookie string
 * 同一个 grab session 内复用 cookie，避免每个频道/日期都做两次请求
 */
const cookieCache = new Map();

/**
 * 带阿里云 WAF cookie 挑战的 fetch
 * 1. 先用缓存的 cookie 请求
 * 2. 如果返回空或 405，重新获取 cookie 再试
 */
async function fetchWithWafCookie(url, options = {}) {
  const parsed = new URL(url);
  const host = parsed.hostname;

  // 如果有缓存 cookie，先带着试
  const cachedCookie = cookieCache.get(host);
  if (cachedCookie) {
    const headers = { ...options.headers, Cookie: cachedCookie };
    const res = await fetchWithRetry(url, { ...options, headers }, 1, 10000);
    if (res.status !== 405) {
      const text = await res.text();
      if (text.length > 10) {
        return { ok: true, status: res.status, text };
      }
    }
    // Cookie 过期了，清除缓存重新获取
    cookieCache.delete(host);
  }

  // 步骤 1：首次请求，获取 acw_tc cookie
  const res1 = await fetchWithRetry(url, options, 1, 10000);

  if (res1.status === 405) {
    // 数据中心 IP 被 WAF 直接封锁，cookie 挑战无法绕过
    throw new Error('HTTP 405 (阿里云 WAF 封锁，需从住宅 IP 访问)');
  }

  const setCookie = res1.headers.get('set-cookie');
  if (!setCookie) {
    // 没有 Set-Cookie，可能直接返回了数据
    const text = await res1.text();
    if (text.length > 10) {
      return { ok: res1.ok, status: res1.status, text };
    }
    throw new Error('空响应且无 Set-Cookie');
  }

  // 提取 cookie name=value
  const cookie = setCookie.split(';')[0]; // "acw_tc=xxx"
  if (!cookie || !cookie.includes('=')) {
    throw new Error('无法解析 Set-Cookie');
  }

  // 缓存 cookie
  cookieCache.set(host, cookie);

  // 步骤 2：带 cookie 重新请求
  const headers2 = { ...options.headers, Cookie: cookie };
  const res2 = await fetchWithRetry(url, { ...options, headers: headers2 }, 1, 10000);
  const text2 = await res2.text();

  if (text2.length <= 10) {
    // Cookie 没用，可能 IP 也被标记了
    cookieCache.delete(host);
    throw new Error('Cookie 挑战后仍为空响应');
  }

  return { ok: res2.ok, status: res2.status, text: text2 };
}

/**
 * 获取 BRTV 某频道某天节目单
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

  const url = `${API_BASE}?functionName=getCurrentChannel&channelId=${channelId}&curdate=${dateStr}`;

  try {
    const result = await fetchWithWafCookie(url, { headers: HEADERS });
    if (!result.ok) throw new Error(`HTTP ${result.status}`);

    const data = JSON.parse(result.text);
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

    logger.info(`[brtv] ${channel.name} (${channelId}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[brtv] ${channel.name} (${channelId}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsBrtv() {
  return [];
}
