/**
 * 陕西广电融媒体（qidian.sxtvs.com）数据源
 * 官方 EPG 数据，覆盖陕西广播电视台旗下各频道
 * 数据来源: https://qidian.sxtvs.com/api/v3/program/tv?channel={key}
 *
 * 返回格式：JSONP，var snr_Playlist = [{start, end, name, allowLive}]
 * 无需认证，仅提供当天数据
 *
 * 频道 key 对应关系（台标验证）：
 *   star -> 陕西卫视
 *   nl   -> 农林卫视
 *   1    -> 新闻资讯频道
 *   2    -> 都市青春频道
 *   3    -> 银龄频道
 *   5    -> 秦腔频道
 *   7    -> 体育休闲频道
 */

import { fetchWithRetry, logger, formatBeijingDateDash } from '../utils.js';

const BASE_URL = 'https://qidian.sxtvs.com/api/v3/program/tv';

/**
 * 将 HH:MM 时间字符串（北京时间）和日期组合成 UTC Date 对象
 */
function parseBeijingTime(dateObj, timeStr) {
  // dateObj 是当天 0:00 UTC 基准（由 grab.js 传入）
  // 取北京时间的年月日
  const bjDate = new Date(dateObj.getTime() + 8 * 3600 * 1000);
  const year = bjDate.getUTCFullYear();
  const month = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(bjDate.getUTCDate()).padStart(2, '0');
  return new Date(`${year}-${month}-${day}T${timeStr}:00+08:00`);
}

/**
 * 获取陕西广电某频道当天节目单
 *
 * @param {Object} channel    - 频道配置
 * @param {string} channelKey - qidian.sxtvs.com 的频道 key（如 "star", "1"）
 * @param {Date}   date       - 日期（北京时间 midnight 的 UTC 基准）
 * @returns {Array} [{start, stop, title, desc}]
 */
export async function getEpgShaanxi(channel, channelKey, date) {
  const epgs = [];
  const dateStr = formatBeijingDateDash(date);
  const url = `${BASE_URL}?channel=${channelKey}`;

  try {
    const res = await fetchWithRetry(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'http://m.snrtv.com/snrtv_tv/index.html',
        },
      },
      2,
      15000
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = await res.text();

    // 提取 JSONP 数据: var snr_Playlist = [...]
    const match = body.match(/=\s*(\[[\s\S]*\])/);
    if (!match) throw new Error('未找到节目单数据');

    const programs = JSON.parse(match[1]);
    if (!Array.isArray(programs) || programs.length === 0) {
      throw new Error('节目单为空');
    }

    for (let i = 0; i < programs.length; i++) {
      const prog = programs[i];
      const { start, end, name } = prog;
      if (!start || !name) continue;

      const startTime = parseBeijingTime(date, start);

      // end 时间：优先用节目自带的 end，否则用下一条的 start
      let stopTime;
      if (end) {
        stopTime = parseBeijingTime(date, end);
        // 如果 end <= start（跨午夜），加一天
        if (stopTime <= startTime) {
          stopTime = new Date(stopTime.getTime() + 24 * 3600 * 1000);
        }
      } else if (i + 1 < programs.length) {
        stopTime = parseBeijingTime(date, programs[i + 1].start);
        if (stopTime <= startTime) {
          stopTime = new Date(stopTime.getTime() + 24 * 3600 * 1000);
        }
      } else {
        // 最后一条节目，结束时间设为 23:59
        stopTime = parseBeijingTime(date, '23:59');
      }

      if (isNaN(startTime.getTime()) || isNaN(stopTime.getTime())) continue;

      epgs.push({
        start: startTime,
        stop: stopTime,
        title: name.trim(),
        desc: '',
      });
    }

    logger.info(`[shaanxi] ${channel.name} (key=${channelKey}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[shaanxi] ${channel.name} (key=${channelKey}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsShaanxi() {
  logger.info('[shaanxi] 频道列表（内置）');
  return [
    { id: 'star', name: '陕西卫视' },
    { id: 'nl',   name: '农林卫视' },
    { id: '1',    name: '陕西新闻资讯频道' },
    { id: '2',    name: '陕西都市青春频道' },
    { id: '3',    name: '陕西银龄频道' },
    { id: '5',    name: '陕西秦腔频道' },
    { id: '7',    name: '陕西体育休闲频道' },
  ];
}
