/**
 * 电视猫数据源
 * 直连 lighttv.tvmao.com API 获取节目单
 * API: GET https://lighttv.tvmao.com/qa/qachannelschedule?epgCode={shortId}&op=getProgramByChnid&epgName=&isNew=on&day={dayParam}
 */

import { logger } from '../utils.js';

const LIGHTTV_BASE = 'https://lighttv.tvmao.com/qa/qachannelschedule';

const LIGHTTV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.tvmao.com/',
};

// ---------- 并发控制：Semaphore ----------

class Semaphore {
  /**
   * @param {number} max - 最大并发数
   */
  constructor(max) {
    this.max = max;
    this.current = 0;
    /** @type {Array<() => void>} */
    this.queue = [];
  }

  /** 获取许可（如果已满则等待） */
  acquire() {
    return new Promise((resolve) => {
      if (this.current < this.max) {
        this.current++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  /** 释放许可 */
  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.current--;
    }
  }
}

/** 全局信号量：最多同时 2 个请求 */
const semaphore = new Semaphore(2);

// ---------- 工具函数 ----------

/** 等待指定毫秒 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 随机抖动：800-1500ms */
const jitter = () => Math.floor(800 + Math.random() * 700);

/**
 * 计算 day 参数
 * lighttv API: day=1 本周一, day=2 本周二 ... day=7 本周日, day=8 下周一 ...
 *
 * @param {Date} targetDate - 目标日期
 * @returns {number} day 参数
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
 * 解析频道 ID: "ZJTV-ZJTV1" → "ZJTV1", "BTV-BTV1" → "BTV1"
 *
 * @param {string} fullId - 完整频道 ID
 * @returns {string} shortId
 */
function parseChannelId(fullId) {
  const parts = fullId.split('-');
  if (parts.length === 2) return parts[1];
  if (parts.length === 3) return parts.slice(1).join('-');
  return fullId;
}

/**
 * 带限速和重试的 lighttv API 请求
 * - 每次请求前随机等待 800-1500ms
 * - 最多重试 3 次，指数退避（1s → 2s → 4s）
 * - 返回 [0,""] 视为限速，额外等待 5s
 *
 * @param {string} url - 请求 URL
 * @returns {Promise<any>} 解析后的 JSON
 */
async function fetchLighttv(url) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 每次请求前随机抖动
    await sleep(jitter());

    try {
      const res = await fetch(url, { headers: LIGHTTV_HEADERS, signal: AbortSignal.timeout(15000) });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();

      // 限速检测：返回 [0, ""] 表示被限速
      if (Array.isArray(json) && json[0] === 0 && json[1] === '' && json.length === 2) {
        logger.warn(`[tvmao] 限速检测触发，等待 5s 后重试 (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(5000);
        if (attempt < MAX_RETRIES) continue;
        throw new Error('持续被限速');
      }

      return json;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        logger.warn(`[tvmao] 请求失败: ${err.message}，${backoff}ms 后重试 (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(backoff);
      } else {
        throw err;
      }
    }
  }
}

// ---------- 导出函数 ----------

/**
 * 获取电视猫某频道某天的节目单
 *
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - 频道在 tvmao 中的 ID（如 "ZJTV-ZJTV1"）
 * @param {Date}   date      - 日期（北京时间 00:00:00 的 Date 对象）
 * @returns {Promise<Array<{start: Date, stop: Date|null, title: string, desc: string}>>}
 */
export async function getEpgTvmao(channel, channelId, date) {
  const epgs = [];
  const dayParam = getDayParam(new Date(date));
  const shortId = parseChannelId(channelId);

  const url = `${LIGHTTV_BASE}?epgCode=${shortId}&op=getProgramByChnid&epgName=&isNew=on&day=${dayParam}`;

  await semaphore.acquire();
  try {
    const json = await fetchLighttv(url);

    // 响应格式: [status, "", {epgName, pro: [{name, time, typeid, pid, status}]}]
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

    // 推算 stop 时间：每条节目的结束 = 下一条的开始
    for (let i = 0; i < epgs.length - 1; i++) {
      epgs[i].stop = epgs[i + 1].start;
    }
    if (epgs.length > 0) {
      const last = epgs[epgs.length - 1];
      last.stop = new Date(last.start.getTime() + 30 * 60000);
    }

    logger.info(`[tvmao] ${channel.name} (${shortId}) day=${dayParam}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[tvmao] ${channel.name} (${shortId}) day=${dayParam} 失败: ${err.message}`);
  } finally {
    semaphore.release();
  }

  return epgs;
}

/**
 * 获取频道列表（内置，无需远程拉取）
 * @returns {Promise<Array>}
 */
export async function getChannelsTvmao() {
  logger.info('[tvmao] 频道列表（内置）');
  return [];
}
