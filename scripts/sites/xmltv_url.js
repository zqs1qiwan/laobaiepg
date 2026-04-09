/**
 * XMLTV URL 数据源适配器
 * 直接拉取现成的 XMLTV 格式文件（如 epg.pw）
 * 根据频道名从 XMLTV 中提取对应频道的节目单
 */

import { parseXmltvTime, fetchWithRetry, logger, normalizeName } from '../utils.js';
import { gunzipSync } from 'zlib';
import { parseStringPromise } from 'xml2js';

/**
 * 解析 XMLTV 内容，返回按频道名索引的节目数据
 * @param {string} xmlContent - XMLTV XML 字符串
 * @returns {Map<string, {channel: Object, programmes: Array}>}
 */
async function parseXmltv(xmlContent) {
  const result = await parseStringPromise(xmlContent, {
    explicitArray: false,
    ignoreAttrs: false,
    mergeAttrs: false,
  });

  const tv = result.tv || result;
  const channelMap = new Map(); // normalized_name -> channel_id
  const programmeMap = new Map(); // channel_id -> programmes[]

  // 解析频道定义
  const channels = Array.isArray(tv.channel) ? tv.channel : (tv.channel ? [tv.channel] : []);
  for (const ch of channels) {
    const id = ch.$ ? ch.$.id : ch.id;
    if (!id) continue;

    // 获取所有 display-name
    const displayNames = [];
    if (ch['display-name']) {
      const names = Array.isArray(ch['display-name']) ? ch['display-name'] : [ch['display-name']];
      for (const n of names) {
        const nameStr = typeof n === 'string' ? n : (n._ || n['#text'] || '');
        if (nameStr) displayNames.push(nameStr);
      }
    }

    for (const name of displayNames) {
      channelMap.set(normalizeName(name), id);
      channelMap.set(name, id); // 保留原始名
    }
  }

  // 解析节目单
  const programmes = Array.isArray(tv.programme) ? tv.programme : (tv.programme ? [tv.programme] : []);
  for (const prog of programmes) {
    const attrs = prog.$ || {};
    const channelId = attrs.channel;
    if (!channelId) continue;

    const title = extractText(prog.title);
    const desc = extractText(prog.desc);
    const start = parseXmltvTime(attrs.start);
    const stop = parseXmltvTime(attrs.stop);

    if (!start || !title) continue;

    if (!programmeMap.has(channelId)) {
      programmeMap.set(channelId, []);
    }
    programmeMap.get(channelId).push({
      start,
      stop,
      title,
      desc: desc || '',
    });
  }

  return { channelMap, programmeMap };
}

/**
 * 从 XMLTV 元素中提取文本
 */
function extractText(elem) {
  if (!elem) return '';
  if (typeof elem === 'string') return elem;
  if (elem._) return elem._;
  if (elem['#text']) return elem['#text'];
  if (Array.isArray(elem)) {
    for (const e of elem) {
      const t = extractText(e);
      if (t) return t;
    }
  }
  return '';
}

/**
 * 下载并解析 XMLTV 数据源
 */
async function downloadXmltv(source) {
  const url = source.url;
  logger.info(`[xmltv_url] 下载 ${source.name}: ${url}`);

  const res = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaobaiEPG/1.0)' },
  }, 2, 30000);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  let buffer = Buffer.from(await res.arrayBuffer());

  // 自动解压 gz
  if (url.endsWith('.gz') || res.headers.get('content-encoding') === 'gzip') {
    buffer = gunzipSync(buffer);
  }

  const xmlContent = buffer.toString('utf-8');
  logger.info(`[xmltv_url] 解析 ${source.name}，大小 ${(buffer.length / 1024).toFixed(0)} KB`);
  return parseXmltv(xmlContent);
}

// 全局缓存：避免同一个 source 在一次 grab 中重复下载
const cache = new Map();

/**
 * 获取指定频道的节目单（从 XMLTV URL 数据源）
 *
 * @param {Object} channel     - 频道配置（来自 channels.yaml）
 * @param {string} matchName   - 在 XMLTV 中用于匹配的频道名
 * @param {Object} source      - 数据源配置（来自 sources.yaml）
 * @returns {Array} 节目数组 [{start, stop, title, desc}]
 */
export async function getEpgFromXmltvUrl(channel, matchName, source) {
  try {
    // 使用缓存
    let parsed;
    if (cache.has(source.id)) {
      parsed = cache.get(source.id);
    } else {
      parsed = await downloadXmltv(source);
      cache.set(source.id, parsed);
    }

    const { channelMap, programmeMap } = parsed;

    // 查找频道 ID（尝试多种匹配方式）
    let channelId = null;

    // 1. 按 matchName 匹配
    if (matchName) {
      channelId = channelMap.get(matchName) || channelMap.get(normalizeName(matchName));
    }

    // 2. 按频道 aliases 匹配
    if (!channelId && channel.aliases) {
      for (const alias of channel.aliases) {
        channelId = channelMap.get(alias) || channelMap.get(normalizeName(alias));
        if (channelId) break;
      }
    }

    // 3. 按频道主名称匹配
    if (!channelId) {
      channelId = channelMap.get(channel.name) || channelMap.get(normalizeName(channel.name));
    }

    if (!channelId) {
      logger.debug(`[xmltv_url] ${source.name} 未找到频道: ${channel.name}`);
      return [];
    }

    const programmes = programmeMap.get(channelId) || [];
    logger.info(`[xmltv_url] ${source.name} 找到 ${channel.name}: ${programmes.length} 条节目`);
    return programmes;

  } catch (err) {
    logger.error(`[xmltv_url] ${source.name} 获取 ${channel.name} 失败: ${err.message}`);
    return [];
  }
}

/**
 * 清除下载缓存（每次 grab 开始时调用）
 */
export function clearXmltvCache() {
  cache.clear();
}
