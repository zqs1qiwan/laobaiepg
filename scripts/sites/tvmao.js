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
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }
  acquire() {
    return new Promise((resolve) => {
      if (this.current < this.max) { this.current++; resolve(); }
      else { this.queue.push(resolve); }
    });
  }
  release() {
    if (this.queue.length > 0) { this.queue.shift()(); }
    else { this.current--; }
  }
}

/** 全局信号量：最多同时 1 个请求（降低并发，减少限速风险） */
const semaphore = new Semaphore(1);

// ---------- 全局限速状态 ----------

let rateLimitUntil = 0;
/** 本次运行累计被限速次数 */
let totalRateLimitHits = 0;
/** 连续限速次数达到此阈值后，跳过所有后续 tvmao 请求 */
const CIRCUIT_BREAKER_THRESHOLD = 3;

const RATE_LIMIT_WAIT_MS = 2 * 60 * 1000; // 2 分钟（从 5 分钟降低）

async function waitForRateLimit() {
  const now = Date.now();
  if (now < rateLimitUntil) {
    const waitMs = rateLimitUntil - now;
    logger.warn(`[tvmao] 全局限速中，等待 ${Math.ceil(waitMs / 1000)}s 后继续...`);
    await sleep(waitMs);
  }
}

function triggerGlobalRateLimit() {
  totalRateLimitHits++;
  rateLimitUntil = Date.now() + RATE_LIMIT_WAIT_MS;
  logger.warn(`[tvmao] 触发全局限速退避 ${RATE_LIMIT_WAIT_MS / 1000}s (累计第 ${totalRateLimitHits} 次)，暂停至 ${new Date(rateLimitUntil).toISOString()}`);
}

/** 检查断路器：累计限速次数过多则放弃 */
export function isTvmaoCircuitBroken() {
  return totalRateLimitHits >= CIRCUIT_BREAKER_THRESHOLD;
}

// ---------- 工具函数 ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => Math.floor(1500 + Math.random() * 1500); // 1.5-3s

function getDayParam(targetDate) {
  const BEIJING_OFFSET_MS = 8 * 3600 * 1000;
  const nowBJ = new Date(Date.now() + BEIJING_OFFSET_MS);
  const todayBJMidnightUTC = Date.UTC(nowBJ.getUTCFullYear(), nowBJ.getUTCMonth(), nowBJ.getUTCDate());
  const targetBJ = new Date(targetDate.getTime() + BEIJING_OFFSET_MS);
  const targetBJMidnightUTC = Date.UTC(targetBJ.getUTCFullYear(), targetBJ.getUTCMonth(), targetBJ.getUTCDate());
  const todayWeekday = new Date(todayBJMidnightUTC).getUTCDay();
  const todayWeekdayAdj = todayWeekday === 0 ? 7 : todayWeekday;
  const deltaDays = Math.round((targetBJMidnightUTC - todayBJMidnightUTC) / 86400000);
  return todayWeekdayAdj + deltaDays;
}

function parseChannelId(fullId) {
  const parts = fullId.split('-');
  if (parts.length === 2) return parts[1];
  if (parts.length === 3) return parts.slice(1).join('-');
  return fullId;
}

/**
 * 带限速退避的 lighttv API 请求
 * 关键改进：限速时只重试 1 次（不再 3 次），快速失败，交给上层决策
 */
async function fetchLighttv(url) {
  const MAX_RATE_LIMIT_RETRIES = 1; // 限速只重试 1 次（原来 3 次）

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    await waitForRateLimit();
    await sleep(jitter());

    try {
      const res = await fetch(url, { headers: LIGHTTV_HEADERS, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      // 限速检测
      if (Array.isArray(json) && json[0] === 0 && json[1] === '' && json.length === 2) {
        logger.warn(`[tvmao] 限速检测触发 (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES + 1})`);
        triggerGlobalRateLimit();
        if (attempt < MAX_RATE_LIMIT_RETRIES) continue;
        throw new Error(`被限速，已重试 ${MAX_RATE_LIMIT_RETRIES} 次`);
      }

      return json;
    } catch (err) {
      if (err.message.includes('被限速')) throw err;
      if (attempt < MAX_RATE_LIMIT_RETRIES) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        logger.warn(`[tvmao] 请求失败: ${err.message}，${backoff}ms 后重试`);
        await sleep(backoff);
      } else {
        throw err;
      }
    }
  }
}

// ---------- 导出函数 ----------

export async function getEpgTvmao(channel, channelId, date) {
  const epgs = [];

  // 断路器检查：如果累计限速次数过多，跳过
  if (isTvmaoCircuitBroken()) {
    logger.warn(`[tvmao] ${channel.name}: 断路器已触发（累计 ${totalRateLimitHits} 次限速），跳过`);
    return epgs;
  }

  const dayParam = getDayParam(new Date(date));
  const shortId = parseChannelId(channelId);
  const url = `${LIGHTTV_BASE}?epgCode=${shortId}&op=getProgramByChnid&epgName=&isNew=on&day=${dayParam}`;

  await semaphore.acquire();
  try {
    const json = await fetchLighttv(url);

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
    // 如果是限速错误，向上层抛出，让 grab.js 跳过该频道剩余天数
    if (err.message.includes('被限速')) throw err;
  } finally {
    semaphore.release();
  }

  return epgs;
}

export async function getChannelsTvmao() {
  logger.info('[tvmao] 频道列表（内置）');
  return [];
}
