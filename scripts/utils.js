/**
 * 通用工具函数
 */

/**
 * 归一化频道名（用于匹配）
 * - 转为小写
 * - 去除空格
 * - 全角转半角
 * - 去除特殊符号
 */
export function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    // 全角转半角
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    // 全角空格
    .replace(/\u3000/g, ' ')
    // 去除所有空白
    .replace(/\s+/g, '')
    // 去除常见后缀（HD/4K/高清等）
    .replace(/(高清|标清|hd|4k|8k|uhd|超清|蓝光|\+|\-|_)$/gi, '')
    .trim();
}

/**
 * 构建频道别名索引
 * 返回 Map<normalized_alias, channel>
 */
export function buildAliasIndex(channels) {
  const index = new Map();
  for (const channel of channels) {
    // 主名称
    const normMain = normalizeName(channel.name);
    if (normMain) index.set(normMain, channel);

    // id 本身
    const normId = normalizeName(channel.id);
    if (normId) index.set(normId, channel);

    // 所有别名
    if (channel.aliases) {
      for (const alias of channel.aliases) {
        const normAlias = normalizeName(alias);
        if (normAlias) index.set(normAlias, channel);
      }
    }
  }
  return index;
}

/**
 * 根据频道名查找频道
 * 支持精确匹配 + 归一化匹配
 */
export function findChannel(name, aliasIndex) {
  if (!name) return null;

  // 1. 精确匹配原始名
  if (aliasIndex.has(name)) return aliasIndex.get(name);

  // 2. 归一化后匹配
  const norm = normalizeName(name);
  if (norm && aliasIndex.has(norm)) return aliasIndex.get(norm);

  // 3. 去掉高清/4K等后缀再匹配
  const normStripped = norm.replace(/(高清|标清|hd|4k|8k|uhd|超清)$/gi, '').trim();
  if (normStripped && aliasIndex.has(normStripped)) return aliasIndex.get(normStripped);

  return null;
}

/**
 * 格式化为 XMLTV 时间格式（UTC，标注 +0000）
 * 输入: Date 对象 或 时间戳(ms)
 * 输出: "20240101040000 +0000"（UTC 时间）
 *
 * 使用 getUTC* 方法，不受运行环境时区影响。
 * tz 参数保留但已废弃，始终输出 +0000。
 */
export function formatXmltvTime(dt, tz = '+0000') {
  const d = dt instanceof Date ? dt : new Date(dt);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

/**
 * 将 XMLTV 时间字符串解析为 Date 对象
 * 输入: "20240101120000 +0800" 或 "20240101120000 +0000"
 */
export function parseXmltvTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!match) return null;
  const [, year, month, day, hour, min, sec, tz] = match;
  const tzHours = tz ? parseInt(tz.slice(0, 3)) : 0;
  const tzMins = tz ? (parseInt(tz.slice(0, 1) + tz.slice(3))) : 0;
  const utcMs = Date.UTC(year, month - 1, day, hour, min, sec) - (tzHours * 60 + tzMins) * 60000;
  return new Date(utcMs);
}

/**
 * 转义 XML 特殊字符
 */
export function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 带超时的 fetch
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * 带重试的 fetch
 */
export async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 10000) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await sleep(1000 * (i + 1)); // 递增等待
      }
    }
  }
  throw lastErr;
}

/**
 * 睡眠
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 时区工具：从"北京时间基准 Date"提取北京时间的日期字符串
 *
 * 约定：getDateRange() 返回的 Date 对象代表北京时间 midnight 对应的 UTC 时刻
 *   即：北京时间 2026-04-09 00:00:00 = UTC 2026-04-08 16:00:00
 *
 * 所有爬虫收到的 date 参数都遵循此约定。
 *
 * formatBeijingDate(date)   → "20260409"（北京时间日期，用于 API 请求）
 * formatBeijingDateDash(date) → "2026-04-09"（连字符格式）
 * beijingHHMMtoUTC(date, hh, mm) → UTC Date（北京时间 HH:MM → UTC）
 */

const BEIJING_OFFSET_MS = 8 * 3600 * 1000;

/** 获取北京时间的年月日（返回 UTC Date，代表北京时间当天 midnight 的 UTC） */
function toBeijingUTCDay(date) {
  return new Date(date.getTime() + BEIJING_OFFSET_MS);
}

/** 格式化为北京时间日期 "YYYYMMDD" */
export function formatBeijingDate(date) {
  const bj = toBeijingUTCDay(date);
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}${pad(bj.getUTCMonth() + 1)}${pad(bj.getUTCDate())}`;
}

/** 格式化为北京时间日期 "YYYY-MM-DD" */
export function formatBeijingDateDash(date) {
  const bj = toBeijingUTCDay(date);
  const pad = n => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}`;
}

/**
 * 将北京时间 HH:MM 转为 UTC Date
 * date 是 getDateRange() 返回的基准日期（北京时间 midnight 的 UTC）
 * 直接在基准上加小时分钟偏移即可
 */
export function beijingHHMMtoUTC(date, hh, mm) {
  return new Date(date.getTime() + hh * 3600000 + mm * 60000);
}

/**
 * 日志工具
 */
export const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
  debug: (msg) => process.env.DEBUG && console.log(`[DEBUG] ${new Date().toISOString()} ${msg}`),
};
