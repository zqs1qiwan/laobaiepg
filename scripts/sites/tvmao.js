/**
 * 电视猫数据源
 * 参考 supzhang/epg crawl/spiders/tvmao.py
 * 数据来源: https://www.tvmao.com/program/{channelId}-w{day}.html
 * （原 lighttv API 已失效，改为网页版抓取）
 */

import { fetchWithRetry, logger, sleep } from '../utils.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': 'https://www.tvmao.com/',
};

/**
 * 计算相对于今天的周次偏移
 * tvmao 的网页用 day 参数表示: 1=本周一, 2=本周二... 7=本周日, 8=下周一...
 */
function getDayParam(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  const todayWeekday = today.getDay() === 0 ? 7 : today.getDay(); // 1=周一...7=周日
  const deltaDays = Math.round((targetDate - today) / 86400000);
  const dayParam = todayWeekday + deltaDays;
  return dayParam;
}

/**
 * 从 HTML 中提取节目单
 * 时间格式: <span class="am|pm">\n  HH:MM\n  </span>
 * 节目名: <span class="p_show">..文本和链接..</span>
 */
function parseHtml(html) {
  const times = [];
  const names = [];

  // 提取时间（multiline: am/pm span 内含换行，可能含 cur_player 标记）
  const timeRe = /class="(?:am|pm)">\s*(\d{2}:\d{2})/gs;
  let m;
  while ((m = timeRe.exec(html)) !== null) {
    times.push(m[1]);
  }

  // 提取节目名（去除 HTML 标签，保留纯文本）
  const nameRe = /class="p_show">(.*?)<\/span>/gs;
  while ((m = nameRe.exec(html)) !== null) {
    const raw = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    names.push(raw);
  }

  return { times, names };
}

/**
 * 获取电视猫某频道某天的节目单
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - 频道在 tvmao 中的完整 ID（如 "CCTV-CCTV1", "SHHAI-SHHAI1"）
 * @param {Date}   date      - 日期
 * @returns {Array} [{start, stop, title, desc}]
 */
export async function getEpgTvmao(channel, channelId, date) {
  const epgs = [];
  const dayParam = getDayParam(new Date(date));

  const url = `https://www.tvmao.com/program/${channelId}-w${dayParam}.html`;

  try {
    await sleep(1000); // 防封（1秒间隔，避免 tvmao 限速）
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 15000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const { times, names } = parseHtml(html);

    if (times.length === 0) throw new Error('未解析到节目时间');
    if (times.length !== names.length) {
      logger.warn(`[tvmao] ${channel.name} 时间(${times.length})与节目名(${names.length})数量不匹配，取最小值`);
    }

    const count = Math.min(times.length, names.length);
    for (let i = 0; i < count; i++) {
      const title = names[i];
      const timeStr = times[i];
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

    logger.info(`[tvmao] ${channel.name} (${channelId}) day=${dayParam}: ${epgs.length} 条节目`);
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
