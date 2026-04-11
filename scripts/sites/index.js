/**
 * 数据源统一入口
 *
 * 每个数据源注册：
 *   getEpg(channel, channelId, date) -> [{start, stop, title, desc}]
 */

import { getEpgCctv, getChannelsCctv } from './cctv.js';
import { getEpgTvmao, getChannelsTvmao } from './tvmao.js';
import { getEpgTvb, getChannelsTvb } from './tvb.js';
import { getEpgNowtv, getChannelsNowtv } from './nowtv.js';
import { getEpgTbc, getChannelsTbc } from './tbc.js';
import { getEpgEpgpwApi, getChannelsEpgpwApi } from './epgpw_api.js';
import { getEpgTdm, getChannelsTdm } from './tdm.js';

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
};

/**
 * 统一 EPG 获取入口
 *
 * @param {Object} channel    - 频道配置
 * @param {string} sourceType - 数据源类型
 * @param {string} sourceId   - 频道在该数据源中的 ID
 * @param {Date[]} dates      - 日期数组（对按日期抓取的爬虫有效）
 */
export async function fetchEpg(channel, sourceType, sourceId, dates) {
  const scraper = scraperRegistry[sourceType];
  if (!scraper) {
    throw new Error(`未知数据源类型: ${sourceType}`);
  }

  // epgpw_api 返回全量数据，只需调用一次
  if (sourceType === 'epgpw_api') {
    return scraper.getEpg(channel, sourceId, dates[0]);
  }

  // 其他爬虫按日期循环
  const all = [];
  for (const date of dates) {
    try {
      const epgs = await scraper.getEpg(channel, sourceId, date);
      all.push(...epgs);
    } catch (err) {
      // 单日失败不影响其他日期
    }
  }
  return all;
}
