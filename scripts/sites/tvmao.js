/**
 * 电视猫数据源
 * 参考 supzhang/epg crawl/spiders/tvmao.py
 * 使用轻量级接口: https://lighttv.tvmao.com/qa/qachannelschedule
 */

import { fetchWithRetry, logger, sleep } from '../utils.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.tvmao.com/',
};

/**
 * 计算相对于今天的周次偏移
 * tvmao 的接口用 day 参数表示: 1=本周一, 2=本周二... 7=本周日, 8=下周一...
 */
function getDayParam(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  const todayWeekday = today.getDay() === 0 ? 7 : today.getDay(); // 1=周一...7=周日
  const targetWeekday = targetDate.getDay() === 0 ? 7 : targetDate.getDay();
  const deltaDays = Math.round((targetDate - today) / 86400000);
  const dayParam = todayWeekday + deltaDays;
  return dayParam;
}

/**
 * 解析频道 ID（tvmao 格式: "ZJTV-ZJTV1" 提取为 "ZJTV1"）
 */
function parseChannelId(fullId) {
  const parts = fullId.split('-');
  if (parts.length === 2) return parts[1];
  if (parts.length === 3) return parts.slice(1).join('-');
  return fullId;
}

/**
 * 获取电视猫某频道某天的节目单
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - 频道在 tvmao 中的 ID（如 "ZJTV-ZJTV1"）
 * @param {Date}   date      - 日期
 * @returns {Array} [{start, stop, title, desc}]
 */
export async function getEpgTvmao(channel, channelId, date) {
  const epgs = [];
  const dayParam = getDayParam(new Date(date));
  const shortId = parseChannelId(channelId);

  const url = `https://lighttv.tvmao.com/qa/qachannelschedule?epgCode=${shortId}&op=getProgramByChnid&epgName=&isNew=on&day=${dayParam}`;

  try {
    await sleep(1000); // 防封（1秒间隔，避免 tvmao 限速）
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const progs = json?.[2]?.pro;
    if (!Array.isArray(progs)) throw new Error('节目列表为空或格式错误');

    for (const prog of progs) {
      const title = prog.name || '';
      const timeStr = prog.time || ''; // "HH:MM" 格式（北京时间）
      // status=-1 表示该节目为占位/未播出，但仍然是真实节目信息，保留
      if (!title || !timeStr) continue;

      const [hh, mm] = timeStr.split(':').map(Number);
      // date 是北京时间 midnight 的 UTC 基准（UTC 前一天 16:00）
      // 北京时间 HH:MM = UTC HH:MM - 8h = date基准 + HH*3600s + MM*60s
      const start = new Date(date.getTime() + hh * 3600000 + mm * 60000);

      epgs.push({ start, stop: null, title, desc: '' });
    }

    // 推算 stop 时间（下一个节目的开始时间）
    for (let i = 0; i < epgs.length - 1; i++) {
      epgs[i].stop = epgs[i + 1].start;
    }
    // 最后一条节目的 stop 设为当天北京时间 23:59:59（= date基准 + 23h59m59s）
    if (epgs.length > 0) {
      epgs[epgs.length - 1].stop = new Date(date.getTime() + 23 * 3600000 + 59 * 60000 + 59000);
    }

    logger.info(`[tvmao] ${channel.name} (${shortId}) day=${dayParam}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[tvmao] ${channel.name} (${channelId}) 失败: ${err.message}`);
  }

  return epgs;
}

/**
 * 获取电视猫的频道列表（抓取可用频道）
 */
export async function getChannelsTvmao() {
  // 此功能用于发现新频道，简化实现：返回常用频道列表
  // 完整实现需爬取 https://www.tvmao.com/program/playing/
  logger.info('[tvmao] 频道列表发现功能（简化版）');
  return [];
}
