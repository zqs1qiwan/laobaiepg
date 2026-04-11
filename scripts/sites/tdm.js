/**
 * 澳门广播电视 TDM 数据源
 * API: https://www.tdm.com.mo/api/v1.0/program-list/{date}?channelId={id}
 *
 * 频道列表：
 *   channelId=1  澳视澳门（中文台）
 *   channelId=2  澳视葡文台
 *   channelId=3  澳门资讯
 *   channelId=4  澳门葡文资讯
 *   channelId=5  澳视卫星
 *   channelId=6  澳视体育
 */

import { fetchWithRetry, logger, formatBeijingDateDash } from '../utils.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; LaobaiEPG/1.0)',
  'Accept': 'application/json',
};

/**
 * 获取 TDM 某频道某天的节目单
 *
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - TDM channelId（"1"~"6"）
 * @param {Date}   date      - 日期（北京时间基准，澳门同为 UTC+8）
 * @returns {Array} [{start: Date(UTC), stop: Date|null, title: string, desc: string}]
 */
export async function getEpgTdm(channel, channelId, date) {
  const epgs = [];
  const dateStr = formatBeijingDateDash(date); // "2026-04-10"

  const url = `https://www.tdm.com.mo/api/v1.0/program-list/${dateStr}?channelId=${channelId}`;

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    if (json.code !== 0 || !json.data) throw new Error(json.message || 'empty');

    for (const prog of json.data) {
      const title = prog.title || '';
      const dateTime = prog.date; // "2026-04-10 07:00:00"（澳门时间 = UTC+8）
      if (!title || !dateTime) continue;

      // 澳门时间 = UTC+8，转为 UTC
      // "2026-04-10 07:00:00" → ISO: "2026-04-10T07:00:00+08:00"
      const start = new Date(dateTime.replace(' ', 'T') + '+08:00');
      if (isNaN(start.getTime())) continue;

      epgs.push({ start, stop: null, title, desc: '' });
    }

    // 推算 stop 时间（下一条节目的开始时间）
    for (let i = 0; i < epgs.length - 1; i++) {
      epgs[i].stop = epgs[i + 1].start;
    }
    if (epgs.length > 0 && !epgs[epgs.length - 1].stop) {
      epgs[epgs.length - 1].stop = new Date(date.getTime() + 23 * 3600000 + 59 * 60000 + 59000);
    }

    logger.info(`[tdm] ${channel.name} (ch=${channelId}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[tdm] ${channel.name} (ch=${channelId}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsTdm() {
  return [
    { id: '1', name: '澳视澳门' },
    { id: '2', name: '澳视葡文台' },
    { id: '3', name: '澳门资讯' },
    { id: '4', name: '澳门葡文资讯' },
    { id: '5', name: '澳视卫星' },
    { id: '6', name: '澳视体育' },
  ];
}
