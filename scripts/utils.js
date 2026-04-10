/**
 * 通用工具函数
 */

// ============================================================
// 频道名匹配（Worker 端使用）
// ============================================================

export function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, '')
    .replace(/(高清|标清|hd|4k|8k|uhd|超清|蓝光|\+|\-|_)$/gi, '')
    .trim();
}

export function buildAliasIndex(channels) {
  const index = new Map();
  for (const ch of channels) {
    [ch.id, ch.name, ...(ch.aliases || [])].forEach(s => {
      if (s) {
        index.set(s, ch);
        index.set(normalizeName(s), ch);
      }
    });
  }
  return index;
}

export function findChannel(name, aliasIndex) {
  if (!name) return null;
  if (aliasIndex.has(name)) return aliasIndex.get(name);
  const norm = normalizeName(name);
  if (norm && aliasIndex.has(norm)) return aliasIndex.get(norm);
  const stripped = norm.replace(/[a-z0-9]+$/, '').trim();
  if (stripped && aliasIndex.has(stripped)) return aliasIndex.get(stripped);
  return null;
}

// ============================================================
// XML 工具（XMLTV 生成器使用）
// ============================================================

export function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 格式化 Date 为 XMLTV 时间字符串（UTC +0000），与运行环境时区无关 */
export function formatXmltvTime(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

// ============================================================
// 时区工具（爬虫使用）
// ============================================================

const BEIJING_OFFSET_MS = 8 * 3600 * 1000;

/** 格式化为北京时间日期 "YYYYMMDD"（用于 API 请求） */
export function formatBeijingDate(date) {
  const bj = new Date(date.getTime() + BEIJING_OFFSET_MS);
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}${pad(bj.getUTCMonth() + 1)}${pad(bj.getUTCDate())}`;
}

/** 格式化为北京时间日期 "YYYY-MM-DD" */
export function formatBeijingDateDash(date) {
  const bj = new Date(date.getTime() + BEIJING_OFFSET_MS);
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}`;
}

// ============================================================
// 网络工具
// ============================================================

export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 10000) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fetchWithTimeout(url, options, timeoutMs); }
    catch (err) { lastErr = err; if (i < retries) await sleep(1000 * (i + 1)); }
  }
  throw lastErr;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 日志
// ============================================================

export const logger = {
  info:  (msg) => console.log(`[INFO]  ${new Date().toISOString()} ${msg}`),
  warn:  (msg) => console.warn(`[WARN]  ${new Date().toISOString()} ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
  debug: (msg) => process.env.DEBUG && console.log(`[DEBUG] ${new Date().toISOString()} ${msg}`),
};
