/**
 * 数据源统一入口
 *
 * 每个数据源注册：
 *   getEpg(channel, channelId, date) -> [{start, stop, title, desc}]
 */

import { getEpgCctv, getChannelsCctv } from './cctv.js';
import { getEpgCntv, getChannelsCntv } from './cntv.js';
import { getEpgTvmao, getChannelsTvmao, isTvmaoCircuitBroken } from './tvmao.js';
import { getEpgTvb, getChannelsTvb } from './tvb.js';
import { getEpgNowtv, getChannelsNowtv } from './nowtv.js';
import { getEpgTbc, getChannelsTbc } from './tbc.js';
import { getEpgEpgpwApi, getChannelsEpgpwApi } from './epgpw_api.js';
import { getEpgTdm, getChannelsTdm } from './tdm.js';
import { getEpgBrtv, getChannelsBrtv } from './brtv.js';
import { getEpgKankanews, getChannelsKankanews } from './kankanews.js';
import { getEpgShaanxi, getChannelsShaanxi } from './shaanxi.js';
import { getEpgIqilu, getChannelsIqilu } from './iqilu.js';

/**
 * 数据源注册表
 */
export const scraperRegistry = {
  epgpw_api: {
    getEpg: getEpgEpgpwApi,
    getChannels: getChannelsEpgpwApi,
  },
  tdm: {
    getEpg: getEpgTdm,
    getChannels: getChannelsTdm,
  },
  tvmao: {
    getEpg: getEpgTvmao,
    getChannels: getChannelsTvmao,
  },
  cctv: {
    getEpg: getEpgCctv,
    getChannels: getChannelsCctv,
  },
  cntv: {
    getEpg: getEpgCntv,
    getChannels: getChannelsCntv,
  },
  tvb: {
    getEpg: getEpgTvb,
    getChannels: getChannelsTvb,
  },
  nowtv: {
    getEpg: getEpgNowtv,
    getChannels: getChannelsNowtv,
  },
  tbc: {
    getEpg: getEpgTbc,
    getChannels: getChannelsTbc,
  },
  brtv: {
    getEpg: getEpgBrtv,
    getChannels: getChannelsBrtv,
  },
  kankanews: {
    getEpg: getEpgKankanews,
    getChannels: getChannelsKankanews,
  },
  shaanxi: {
    getEpg: getEpgShaanxi,
    getChannels: getChannelsShaanxi,
  },
  iqilu: {
    getEpg: getEpgIqilu,
    getChannels: getChannelsIqilu,
  },
};

/**
 * 统一 EPG 获取入口
 *
 * @param {Object} channel    - 频道配置
 * @param {string} sourceType - 数据源类型
 * @param {string} sourceId   - 频道在该数据源中的 ID
 * @param {Date[]} dates      - 日期数组
 */
export async function fetchEpg(channel, sourceType, sourceId, dates) {
  const scraper = scraperRegistry[sourceType];
  if (!scraper) {
    throw new Error(`未知数据源类型: ${sourceType}`);
  }

  // tvmao 熔断器检查：如果已熔断，直接返回空（避免无意义的等待）
  if (sourceType === 'tvmao' && isTvmaoCircuitBroken()) {
    return [];
  }

  // 其他爬虫均按日期循环顺序获取
  const all = [];
  for (const date of dates) {
    try {
      const epgs = await scraper.getEpg(channel, sourceId, date);
      all.push(...epgs);
    } catch (err) {
      // tvmao 限速/熔断错误：返回已获取的数据，不再继续请求后续天数
      if (sourceType === 'tvmao' && (err.message.includes('限速') || err.message.includes('熔断'))) {
        break;
      }
      // 其他源单日失败不影响后续日期
    }
  }

  // 精密去重：以开始时间为唯一 Key，保留最先获取的数据，过滤掉重复的节目节点
  const merged = [];
  const seen = new Set();
  for (const item of all) {
    const key = item.start.getTime();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}
