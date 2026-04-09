/**
 * 香港无线电视 TVB 数据源
 * 参考 supzhang/epg crawl/spiders/tvb.py
 */

import { fetchWithRetry, logger } from '../utils.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/**
 * 获取 TVB 某频道某天的节目单
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - 频道 ID (J=翡翠台, P=明珠台)
 * @param {Date}   date      - 日期
 */
export async function getEpgTvb(channel, channelId, date) {
  const epgs = [];
  const dateStr = formatDate(date); // "2024-01-01"

  // TVB EPG API
  const url = `https://www.tvb.com/api/channel/getScheduleByDate?channel=${channelId}&date=${dateStr}`;

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const progs = json?.data?.programme || json?.programme || [];

    for (const prog of progs) {
      const title = prog.title_tc || prog.title_sc || prog.title || '';
      const start = prog.broadcast_start ? new Date(prog.broadcast_start * 1000) : null;
      const stop = prog.broadcast_end ? new Date(prog.broadcast_end * 1000) : null;
      const desc = prog.synopsis_tc || prog.synopsis_sc || prog.synopsis || '';

      if (!start || !title) continue;
      epgs.push({ start, stop, title, desc });
    }

    logger.info(`[tvb] ${channel.name} (${channelId}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.warn(`[tvb] ${channel.name} (${channelId}) ${dateStr} 失败: ${err.message}，尝试备用接口`);
    // 备用: 抓取网页
    return await getEpgTvbFallback(channel, channelId, date);
  }

  return epgs;
}

/**
 * TVB 备用接口
 */
async function getEpgTvbFallback(channel, channelId, date) {
  const epgs = [];
  const dateStr = formatDate(date);
  const chName = channelId === 'J' ? 'jade' : 'pearl';
  const url = `https://www.tvb.com/schedules/${chName}?date=${dateStr}`;

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 1, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // 简化：只记录失败，不解析 HTML
    logger.warn(`[tvb] ${channel.name} 备用接口也失败`);
  } catch (err) {
    logger.error(`[tvb] ${channel.name} 所有接口失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsTvb() {
  return [
    { id: 'J', name: 'TVB 翡翠台' },
    { id: 'P', name: 'TVB 明珠台' },
  ];
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
