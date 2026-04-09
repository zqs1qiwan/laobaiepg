/**
 * 台湾宽频数据源
 * 参考 supzhang/epg crawl/spiders/tbc.py
 */

import { fetchWithRetry, logger, formatBeijingDate } from '../utils.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

export async function getEpgTbc(channel, channelId, date) {
  const epgs = [];
  const dateStr = formatBeijingDate(date); // "20240101"（北京时间）

  // 台湾宽频 EPG API
  const url = `https://data.tbc.net.tw/tbc/api/EPG/EPGList/${channelId}/${dateStr}`;

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const progs = json?.data || json?.epgList || json || [];

    for (const prog of Array.isArray(progs) ? progs : []) {
      const title = prog.programName || prog.title || prog.name || '';
      const startStr = prog.startTime || prog.start;
      const endStr = prog.endTime || prog.end;

      if (!title || !startStr) continue;

      const start = parseDateTime(date, startStr);
      const stop = endStr ? parseDateTime(date, endStr) : null;

      epgs.push({ start, stop, title, desc: prog.synopsis || '' });
    }

    logger.info(`[tbc] ${channel.name} (${channelId}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[tbc] ${channel.name} (${channelId}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsTbc() {
  // 台湾主要频道 ID
  return [
    { id: '11', name: '台视' },
    { id: '12', name: '中视' },
    { id: '13', name: '华视' },
    { id: '14', name: '台视新闻' },
    { id: '15', name: '公视' },
    { id: '16', name: '民视' },
    { id: '17', name: '民视新闻' },
    { id: '53', name: 'TVBS' },
    { id: '54', name: 'TVBS新闻' },
  ];
}

// formatDate 已由 utils.js 的 formatBeijingDate 替代

function parseDateTime(date, timeStr) {
  // timeStr 可能是 "HH:MM" 或完整 ISO 字符串
  if (timeStr.includes('T') || timeStr.includes(' ')) {
    return new Date(timeStr);
  }
  const [hh, mm] = timeStr.split(':').map(Number);
  // date 是北京时间 midnight 的 UTC 基准，直接加时分偏移
  return new Date(date.getTime() + hh * 3600000 + mm * 60000);
}
