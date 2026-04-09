/**
 * 香港 NOW TV 数据源
 * 参考 supzhang/epg crawl/spiders/nowtv.py
 */

import { fetchWithRetry, logger, formatBeijingDateDash } from "../utils.js";

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

export async function getEpgNowtv(channel, channelId, date) {
  const epgs = [];
  const dateStr = formatBeijingDateDash(date); // "2024-01-01"（北京时间）

  const url = `https://www.nowtv.com/api/cmsoperation/getSchedule?lang=zh&date=${dateStr}&channelno=${channelId}`;

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const progs = json?.result?.programmes || json?.data || [];

    for (const prog of progs) {
      const title = prog.programmeName || prog.title || prog.name || '';
      const startStr = prog.startTime || prog.start;
      const endStr = prog.endTime || prog.end;

      if (!title || !startStr) continue;

      const start = new Date(startStr);
      const stop = endStr ? new Date(endStr) : null;

      epgs.push({ start, stop, title, desc: prog.synopsis || prog.desc || '' });
    }

    logger.info(`[nowtv] ${channel.name} (${channelId}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[nowtv] ${channel.name} (${channelId}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsNowtv() {
  return [
    { id: '330', name: 'Now 新闻台' },
    { id: '331', name: 'Now 财经台' },
    { id: '332', name: 'Now Sports 1' },
    { id: '333', name: 'Now Sports 2' },
  ];
}

// formatDate 已由 utils.js 的 formatBeijingDateDash 替代
