/**
 * 看看新闻 (kankanews) 数据源
 * SMG 官方 EPG 数据，覆盖上海台频道
 * 数据来源: https://kapi.kankanews.com/content/pc/tv/programs
 *
 * 注意：仅提供当天和昨天的数据，没有明天数据
 * 建议与 tvmao 配合使用（kankanews 提供当天精确数据，tvmao 补充明后天）
 */

import crypto from 'node:crypto';
import { fetchWithRetry, logger, formatBeijingDateDash } from '../utils.js';

const SECRET = '28c8edde3d61a0411511d3b1866f0636';
const VERSION = '2.37.6';

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

/**
 * 生成 kankanews API 请求头（含签名）
 */
function makeKankanHeaders(params, apiVersion = 'v1') {
  const nonce = Math.random().toString(36).slice(-8);
  const timestamp = Math.floor(Date.now() / 1000);
  const combined = {
    ...params,
    platform: 'pc',
    version: VERSION,
    nonce,
    timestamp,
    'Api-Version': apiVersion,
  };

  const sortedKeys = Object.keys(combined).sort();
  let r = '';
  for (const k of sortedKeys) {
    if (combined[k] != null) r += `${k}=${combined[k]}&`;
  }
  r += SECRET;
  const sign = md5(md5(r));

  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'api-version': apiVersion,
    'm-uuid': 's2V90rsIhSyAW3__LfDBU',
    'nonce': String(nonce),
    'origin': 'https://live.kankanews.com',
    'platform': 'pc',
    'referer': 'https://live.kankanews.com/',
    'sign': sign,
    'timestamp': String(timestamp),
    'version': VERSION,
  };
}

/**
 * 获取看看新闻某频道某天的节目单
 *
 * @param {Object} channel    - 频道配置
 * @param {string} channelId  - kankanews 的 channel_id（数字字符串，如 "1", "2", "5"）
 * @param {Date}   date       - 日期（北京时间 midnight 的 UTC 基准）
 * @returns {Array} [{start, stop, title, desc}]
 */
export async function getEpgKankanews(channel, channelId, date) {
  const epgs = [];
  const dateStr = formatBeijingDateDash(date); // "2026-04-21"

  const params = { channel_id: channelId, date: dateStr };
  const headers = makeKankanHeaders(params);
  const url = `https://kapi.kankanews.com/content/pc/tv/programs?channel_id=${channelId}&date=${dateStr}`;

  try {
    const res = await fetchWithRetry(url, { headers }, 2, 15000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.code !== '1000' || !data.result?.programs?.length) {
      throw new Error(`API 返回异常: code=${data.code}, msg=${data.msg || 'no programs'}`);
    }

    const programs = data.result.programs;
    for (const prog of programs) {
      const { name, start_time_string, end_time_string } = prog;
      if (!name || !start_time_string || !end_time_string) continue;

      // 时间字符串是北京时间，转成 UTC Date 对象
      const start = new Date(start_time_string + ' GMT+0800');
      const stop = new Date(end_time_string + ' GMT+0800');

      if (isNaN(start.getTime()) || isNaN(stop.getTime())) continue;

      epgs.push({
        start,
        stop,
        title: name.trim(),
        desc: '',
      });
    }

    logger.info(`[kankanews] ${channel.name} (ch=${channelId}) ${dateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[kankanews] ${channel.name} (ch=${channelId}) ${dateStr} 失败: ${err.message}`);
  }

  return epgs;
}

/**
 * 频道列表（简化版，仅返回已确认可用的频道）
 */
export async function getChannelsKankanews() {
  logger.info('[kankanews] 频道列表（内置）');
  return [
    { id: '1', name: '东方卫视' },
    { id: '2', name: '新闻综合' },
    { id: '4', name: '都市频道' },
    { id: '5', name: '第一财经' },
    { id: '10', name: '五星体育' },
  ];
}
