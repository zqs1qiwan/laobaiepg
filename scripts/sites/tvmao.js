/**
 * 电视猫数据源
 * 使用轻量级 API: https://lighttv.tvmao.com/qa/qachannelschedule
 * 通过 epg-proxy (CF China Worker) 转发，绕过 IP 限制
 *
 * epg-proxy: https://epg-proxy.chinacert.cftest5.cn/proxy
 * Secret: 见 EPG_PROXY_SECRET 环境变量（或硬编码 fallback）
 */

import { fetchWithRetry, logger, sleep } from '../utils.js';

const PROXY_URL = 'https://epg-proxy.chinacert.cftest5.cn/proxy';
const PROXY_SECRET = process.env.EPG_PROXY_SECRET || 'laobai2026';

const LIGHTTV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.tvmao.com/',
};

/**
 * 计算 day 参数
 * lighttv API: day=1 本周一, day=2 本周二 ... day=7 本周日, day=8 下周一 ...
 */
function getDayParam(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const todayWeekday = today.getDay() === 0 ? 7 : today.getDay();
  const deltaDays = Math.round((target - today) / 86400000);
  return todayWeekday + deltaDays;
}

/**
 * 解析频道 ID: "ZJTV-ZJTV1" → "ZJTV1"
 */
function parseChannelId(fullId) {
  const parts = fullId.split('-');
  if (parts.length === 2) return parts[1];
  if (parts.length === 3) return parts.slice(1).join('-');
  return fullId;
}

/**
 * 通过 epg-proxy 调用 lighttv API
 */
async function fetchViaProxy(targetUrl) {
  const body = JSON.stringify({
    url: targetUrl,
    method: 'GET',
    headers: LIGHTTV_HEADERS,
  });

  const res = await fetchWithRetry(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Secret': PROXY_SECRET,
    },
    body,
  }, 2, 15000);

  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
  return res.json();
}

/**
 * 获取电视猫某频道某天的节目单
 *
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - 频道在 tvmao 中的 ID（如 "ZJTV-ZJTV1"）
 * @param {Date}   date      - 日期
 * @returns {Array} [{start, stop, title, desc}]
 */
export async function getEpgTvmao(channel, channelId, date) {
  const epgs = [];
  const dayParam = getDayParam(new Date(date));
  const shortId = parseChannelId(channelId);

  const targetUrl = `https://lighttv.tvmao.com/qa/qachannelschedule?epgCode=${shortId}&op=getProgramByChnid&epgName=&isNew=on&day=${dayParam}`;

  try {
    await sleep(300); // 适当间隔
    const json = await fetchViaProxy(targetUrl);

    // 响应格式: [status, "", {epgName, pro: [{name, time, ...}], ...}]
    const progs = json?.[2]?.pro;
    if (!Array.isArray(progs)) throw new Error('节目列表为空或格式错误');

    for (const prog of progs) {
      const title = prog.name || '';
      const timeStr = prog.time || '';
      if (!title || !timeStr) continue;

      const [hh, mm] = timeStr.split(':').map(Number);
      const start = new Date(date.getTime() + hh * 3600000 + mm * 60000);
      epgs.push({ start, stop: null, title, desc: '' });
    }

    // 推算 stop 时间
    for (let i = 0; i < epgs.length - 1; i++) {
      epgs[i].stop = epgs[i + 1].start;
    }
    if (epgs.length > 0) {
      const last = epgs[epgs.length - 1];
      last.stop = new Date(last.start.getTime() + 30 * 60000); // 最后一条加30分钟
    }

    logger.info(`[tvmao] ${channel.name} (${shortId}) day=${dayParam}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[tvmao] ${channel.name} (${shortId}) day=${dayParam} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsTvmao() {
  logger.info('[tvmao] 频道列表（内置）');
  return [];
}
