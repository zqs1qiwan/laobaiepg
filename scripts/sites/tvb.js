/**
 * 香港无线电视 TVB 数据源
 * API: https://programme.tvb.com/api/schedule?input_date=YYYYMMDD&network_code={code}&_t={timestamp}
 * network_code: J=翡翠台, P=明珠台, B=TVB Plus, C=无线新闻台
 */

import { fetchWithRetry, logger } from '../utils.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

/**
 * 获取 TVB 某频道某天的节目单
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - 频道 network_code (J/P/B/C)
 * @param {Date}   date      - 日期
 */
export async function getEpgTvb(channel, channelId, date) {
  const epgs = [];

  // 格式化为 YYYYMMDD（香港时区 UTC+8）
  const hkOffset = 8 * 60;
  const localMs = date.getTime() + (hkOffset + date.getTimezoneOffset()) * 60000;
  const hkDate = new Date(localMs);
  const y = hkDate.getFullYear();
  const m = String(hkDate.getMonth() + 1).padStart(2, '0');
  const d = String(hkDate.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;

  const ts = Math.floor(Date.now() / 1000);
  const url = `https://programme.tvb.com/api/schedule?input_date=${dateStr}&network_code=${channelId}&_t=${ts}`;

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const list = json?.data?.list;
    if (!Array.isArray(list) || list.length === 0) {
      logger.warn(`[tvb] ${channel.name} (${channelId}) ${dateStr}: 无数据`);
      return epgs;
    }

    const schedules = list[0].schedules || [];
    for (let i = 0; i < schedules.length; i++) {
      const s = schedules[i];
      const title = s.programme_title || s.en_programme_title || '';
      if (!title || !s.event_time) continue;

      const start = new Date(s.event_time * 1000);
      // stop = 下一条的 start，最后一条用当天末尾
      const stop = i < schedules.length - 1
        ? new Date(schedules[i + 1].event_time * 1000)
        : new Date(start.getTime() + 3600000);
      const desc = s.synopsis || s.en_synopsis || '';

      epgs.push({ start, stop, title, desc });
    }

    logger.info(`[tvb] ${channel.name} (${channelId}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[tvb] ${channel.name} (${channelId}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsTvb() {
  return [
    { id: 'J', name: 'TVB 翡翠台' },
    { id: 'P', name: 'TVB 明珠台' },
    { id: 'B', name: 'TVB Plus' },
    { id: 'C', name: 'TVB 无线新闻台' },
  ];
}
