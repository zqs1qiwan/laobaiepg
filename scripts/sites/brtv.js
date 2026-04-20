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
 */

import { fetchWithRetry, logger } from '../utils.js';

const API_BASE = 'https://dynamic.rbc.cn/bvradio_app/service/LIVE';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; LaobaiEPG/1.0)',
  'Referer': 'https://www.brtv.org.cn/',
  'Accept': '*/*',
  'Accept-Encoding': 'identity', // 服务器返回格式异常，禁止压缩
};
const BEIJING_OFFSET_MS = 8 * 3600 * 1000;

/**
 * 将 "HH:MM" 时间字符串 + 基准日期（北京时间）还原为 UTC Date
 * 如果时间小于 06:00，认为是次日（跨午夜节目）
 */
function parseTime(timeStr, baseDateBj, prevTimeBj = null) {
  const [h, m] = timeStr.split(':').map(Number);
  let date = new Date(baseDateBj);
  date.setUTCHours(h, m, 0, 0);

  // 如果当前时间比前一条节目早，说明跨过了午夜，加一天
  if (prevTimeBj !== null && date < prevTimeBj) {
    date = new Date(date.getTime() + 24 * 3600 * 1000);
  }

  // 转为 UTC（baseDateBj 已是北京时间当天 00:00 UTC 表示）
  return new Date(date.getTime() - BEIJING_OFFSET_MS);
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
    // BRTV CDN 不稳定，同一 URL 有时返回空响应，重试最多 4 次
    let text = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetchWithRetry(url, { headers: HEADERS }, 1, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      if (text.length > 10) break;
      logger.warn(`[brtv] ${channel.name} (${channelId}) ${dateStr} 空响应，重试 ${attempt + 1}/4`);
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
    if (!text || text.length < 10) throw new Error('空响应（多次重试后仍为空）');
    const data = JSON.parse(text);
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
