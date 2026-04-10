/**
 * epg.pw JSON API 数据源
 *
 * 与 XMLTV 文件不同，JSON API 走源服务器，不经过 CDN 缓存，
 * 始终返回最新数据。适用于需要实时准确节目单的频道。
 *
 * API: https://epg.pw/api/epg.json?channel_id=XXXXX&date=YYYYMMDD&timezone=QXNpYS9TaGFuZ2hhaQ==
 * timezone base64: Asia/Shanghai = QXNpYS9TaGFuZ2hhaQ==
 */

import { fetchWithRetry, logger, formatBeijingDate } from '../utils.js';

const TIMEZONE_B64 = 'QXNpYS9TaGFuZ2hhaQ=='; // Asia/Shanghai
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; LaobaiEPG/1.0)',
  'Accept': 'application/json',
};

/**
 * 通过 epg.pw JSON API 获取频道某天节目单
 *
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - epg.pw 的 channel_id（数字字符串，如 "495008"）
 * @param {Date}   date      - 日期（北京时间基准）
 * @returns {Array} [{start: Date(UTC), stop: Date|null, title: string, desc: string}]
 */
export async function getEpgEpgpwApi(channel, channelId, date) {
  const epgs = [];
  const dateStr = formatBeijingDate(date); // "20260410"

  const url = `https://epg.pw/api/epg.json?channel_id=${channelId}&date=${dateStr}&timezone=${TIMEZONE_B64}&lang=zh-hans`;

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const progs = data.epg_list || [];

    for (const prog of progs) {
      const title = prog.title || prog.name || '';
      const startStr = prog.start_date; // "2026-04-10T00:57:00+08:00"
      if (!title || !startStr) continue;

      const start = new Date(startStr); // JS Date 正确解析带时区的 ISO 字符串
      // stop 需要从下一条节目推算，API 不直接提供
      epgs.push({ start, stop: null, title, desc: prog.desc || prog.description || '' });
    }

    // 推算 stop 时间（下一条节目的开始时间）
    for (let i = 0; i < epgs.length - 1; i++) {
      epgs[i].stop = epgs[i + 1].start;
    }
    if (epgs.length > 0 && !epgs[epgs.length - 1].stop) {
      // 最后一条到当天北京时间 23:59:59
      epgs[epgs.length - 1].stop = new Date(date.getTime() + 23 * 3600000 + 59 * 60000 + 59000);
    }

    logger.info(`[epgpw_api] ${channel.name} (${channelId}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[epgpw_api] ${channel.name} (${channelId}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsEpgpwApi() {
  return [];
}
