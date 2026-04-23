/**
 * 齐鲁网（iqilu.com）山东广播电视台数据源
 *
 * API: https://sdxw.iqilu.com/v1/app/play/program/qilu?channelID={id}&date={YYYY-MM-DD}
 *
 * 返回格式：
 *   { code: 1, data: { infos: [{ name, start_time, end_time, begintime, endtime }] } }
 *
 * 频道 ID 对应关系：
 *   24 → 山东卫视
 *   25 → 齐鲁频道
 *   26 → 山东体育休闲频道
 *   27 → 山东文旅频道
 *   28 → 山东综艺频道
 *   29 → 山东生活频道
 *   30 → 山东农科频道
 *   31 → 山东新闻频道
 *   32 → 山东少儿频道
 *
 * 注意：
 *   - 接口只有当天数据（未来日期返回空），历史数据保留约 3 天
 *   - 节目名中可能有大量空格，需要 trim
 *   - 直接使用 begintime/endtime（Unix 时间戳秒）作为时间
 */

import { fetchWithRetry, logger, formatBeijingDateDash } from '../utils.js';

const API_BASE = 'https://sdxw.iqilu.com/v1/app/play/program/qilu';

/**
 * 获取齐鲁网某频道某天节目单
 *
 * @param {Object} channel    - 频道配置
 * @param {string} channelId  - iqilu channelID（数字字符串）
 * @param {Date}   date       - 日期（北京时间 midnight 的 UTC 基准）
 * @returns {Array} [{start, stop, title, desc}]
 */
export async function getEpgIqilu(channel, channelId, date) {
  const epgs = [];
  const dateStr = formatBeijingDateDash(date);
  const url = `${API_BASE}?channelID=${channelId}&date=${dateStr}`;

  try {
    const res = await fetchWithRetry(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      },
      2,
      15000
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.code !== 1 || !data.data?.infos) {
      logger.warn(`[iqilu] ${channel.name} (${channelId}) ${dateStr}: 接口返回异常 code=${data.code}`);
      return epgs;
    }

    const infos = data.data.infos;
    if (infos.length === 0) {
      logger.warn(`[iqilu] ${channel.name} (${channelId}) ${dateStr}: 无节目数据`);
      return epgs;
    }

    for (const prog of infos) {
      const title = (prog.name || '').replace(/\s+/g, ' ').trim();
      if (!title) continue;

      const startTs = prog.begintime;
      const stopTs = prog.endtime;
      if (!startTs || !stopTs) continue;

      const start = new Date(startTs * 1000);
      const stop = new Date(stopTs * 1000);

      if (isNaN(start.getTime()) || isNaN(stop.getTime())) continue;

      epgs.push({ start, stop, title, desc: '' });
    }

    logger.info(`[iqilu] ${channel.name} (${channelId}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[iqilu] ${channel.name} (${channelId}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsIqilu() {
  logger.info('[iqilu] 频道列表（内置）');
  return [
    { id: '24', name: '山东卫视' },
    { id: '25', name: '齐鲁频道' },
    { id: '26', name: '山东体育休闲频道' },
    { id: '27', name: '山东文旅频道' },
    { id: '28', name: '山东综艺频道' },
    { id: '29', name: '山东生活频道' },
    { id: '30', name: '山东农科频道' },
    { id: '31', name: '山东新闻频道' },
    { id: '32', name: '山东少儿频道' },
  ];
}
