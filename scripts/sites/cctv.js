/**
 * 央视官方 API 数据源
 * 参考 supzhang/epg crawl/spiders/cctv.py
 *
 * 接口1 (JSONP, 较旧): http://api.cntv.cn/epg/getEpgInfoByChannelNew
 * 接口2 (JSON, 较新):  https://tv.cctv.com/api/epgList?channel=CCTV-1&date=20240101
 * 接口3 (备用):        https://api.danmu.com/getCCTV?channel=CCTV-1&date=20240101
 */

import { fetchWithRetry, logger, formatBeijingDate } from '../utils.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://tv.cctv.com/',
};

/**
 * 获取央视某频道某天的节目单
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - 频道在 CCTV API 中的 ID（如 "CCTV-1"）
 * @param {Date}   date      - 日期
 * @returns {Array} [{start, stop, title, desc}]
 */
export async function getEpgCctv(channel, channelId, date) {
  const dateStr = formatBeijingDate(date);

  // 尝试接口1: JSONP (旧)
  let epgs = await tryOldApi(channel, channelId, dateStr);
  if (epgs.length > 0) return epgs;

  // 尝试接口2: JSON (新)
  epgs = await tryNewApi(channel, channelId, dateStr);
  if (epgs.length > 0) return epgs;

  logger.error(`[cctv] ${channel.name} (${channelId}) ${dateStr} 所有接口均失败`);
  return [];
}

async function tryOldApi(channel, channelId, dateStr) {
  const epgs = [];
  const url = `http://api.cntv.cn/epg/getEpgInfoByChannelNew?c=${channelId}&serviceId=tvcctv&d=${dateStr}&t=jsonp&cb=set`;
  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 1, 6000);
    if (!res.ok) return epgs;
    const text = await res.text();
    const jsonMatch = text.match(/set\(([\s\S]*)\)/);
    if (!jsonMatch) return epgs;
    const data = JSON.parse(jsonMatch[1]);
    const progList = data?.data?.[channelId]?.list;
    if (!Array.isArray(progList) || progList.length === 0) return epgs;
    for (const prog of progList) {
      const title = prog.title || '';
      const start = prog.startTime ? new Date(prog.startTime * 1000) : null;
      const stop = prog.endTime ? new Date(prog.endTime * 1000) : null;
      if (!start || !title) continue;
      epgs.push({ start, stop, title, desc: '' });
    }
    if (epgs.length > 0) logger.info(`[cctv/old] ${channel.name} ${dateStr}: ${epgs.length} 条`);
  } catch (err) {
    logger.debug(`[cctv/old] ${channel.name} ${dateStr}: ${err.message}`);
  }
  return epgs;
}

async function tryNewApi(channel, channelId, dateStr) {
  const epgs = [];
  // 尝试 tv.cctv.com 的新接口
  const url = `https://tv.cctv.com/api/epgList?channel=${channelId}&date=${dateStr}`;
  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 1, 6000);
    if (!res.ok) return epgs;
    const data = await res.json();
    const progList = data?.data?.list || data?.list || [];
    for (const prog of progList) {
      const title = prog.title || prog.programName || '';
      const startTime = prog.startTime || prog.start;
      const endTime = prog.endTime || prog.end;
      if (!title || !startTime) continue;
      const start = typeof startTime === 'number' ? new Date(startTime * 1000) : new Date(startTime);
      const stop = endTime ? (typeof endTime === 'number' ? new Date(endTime * 1000) : new Date(endTime)) : null;
      epgs.push({ start, stop, title, desc: prog.synopsis || '' });
    }
    if (epgs.length > 0) logger.info(`[cctv/new] ${channel.name} ${dateStr}: ${epgs.length} 条`);
  } catch (err) {
    logger.debug(`[cctv/new] ${channel.name} ${dateStr}: ${err.message}`);
  }
  return epgs;
}

/**
 * 获取央视频道列表（用于发现可用频道）
 */
export async function getChannelsCctv() {
  // CCTV 频道 ID 是固定的，直接返回已知列表
  return [
    { id: 'CCTV-1', name: 'CCTV-1 综合' },
    { id: 'CCTV-2', name: 'CCTV-2 财经' },
    { id: 'CCTV-3', name: 'CCTV-3 综艺' },
    { id: 'CCTV-4', name: 'CCTV-4 中文国际' },
    { id: 'CCTV-5', name: 'CCTV-5 体育' },
    { id: 'CCTV-5+', name: 'CCTV-5+ 体育赛事' },
    { id: 'CCTV-6', name: 'CCTV-6 电影' },
    { id: 'CCTV-7', name: 'CCTV-7 国防军事' },
    { id: 'CCTV-8', name: 'CCTV-8 电视剧' },
    { id: 'CCTV-9', name: 'CCTV-9 纪录' },
    { id: 'CCTV-10', name: 'CCTV-10 科教' },
    { id: 'CCTV-11', name: 'CCTV-11 戏曲' },
    { id: 'CCTV-12', name: 'CCTV-12 社会与法' },
    { id: 'CCTV-13', name: 'CCTV-13 新闻' },
    { id: 'CCTV-14', name: 'CCTV-14 少儿' },
    { id: 'CCTV-15', name: 'CCTV-15 音乐' },
    { id: 'CCTV-16', name: 'CCTV-16 奥林匹克' },
    { id: 'CCTV-17', name: 'CCTV-17 农业农村' },
  ];
}

// formatDate 已由 utils.js 的 formatBeijingDate 替代
