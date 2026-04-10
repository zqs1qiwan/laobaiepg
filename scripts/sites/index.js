/**
 * 数据源统一入口
 * 参考 supzhang/epg crawl/spiders/__init__.py 的设计模式
 *
 * 每个数据源注册两个函数：
 *   getEpg(channel, channelId, date) -> [{start, stop, title, desc}]
 *   getChannels()                    -> [{id, name}]
 */

import { getEpgCctv, getChannelsCctv } from './cctv.js';
import { getEpgTvmao, getChannelsTvmao } from './tvmao.js';
import { getEpgTvb, getChannelsTvb } from './tvb.js';
import { getEpgNowtv, getChannelsNowtv } from './nowtv.js';
import { getEpgTbc, getChannelsTbc } from './tbc.js';
import { getEpgEpgpwApi, getChannelsEpgpwApi } from './epgpw_api.js';
import { getEpgFromXmltvUrl, clearXmltvCache } from './xmltv_url.js';

/**
 * 爬虫数据源注册表
 * 类型 -> { getEpg, getChannels }
 */
export const scraperRegistry = {
  cctv: {
    getEpg: getEpgCctv,
    getChannels: getChannelsCctv,
  },
  epgpw_api: {
    getEpg: getEpgEpgpwApi,
    getChannels: getChannelsEpgpwApi,
  },
  tvmao: {
    getEpg: getEpgTvmao,
    getChannels: getChannelsTvmao,
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
 * 统一的 EPG 获取入口（参考 supzhang/epg 的 epg_func）
 *
 * @param {Object} channel      - 频道配置（来自 channels.yaml）
 * @param {string} sourceType   - 数据源类型（"cctv", "tvmao", "xmltv_url" 等）
 * @param {string} sourceId     - 频道在该数据源中的 ID 或匹配名称
 * @param {Date[]} dates        - 需要获取的日期数组
 * @param {Object} sourceConfig - 对应的数据源配置（xmltv_url 需要）
 * @returns {Array} 所有日期合并的节目数组
 */
export async function fetchEpg(channel, sourceType, sourceId, dates, sourceConfig = null) {
  const allEpgs = [];

  if (sourceType === 'xmltv_url') {
    // XMLTV URL 源：一次性获取所有日期，无需按日循环
    const epgs = await getEpgFromXmltvUrl(channel, sourceId, sourceConfig);
    allEpgs.push(...epgs);
  } else if (sourceType === 'epgpw_api') {
    // epg.pw JSON API：API 每次返回该频道所有日期的节目单，只需调用一次
    // 传入第一个日期即可（API 会返回未来 7 天的数据）
    const scraper = scraperRegistry['epgpw_api'];
    const epgs = await scraper.getEpg(channel, sourceId, dates[0]);
    allEpgs.push(...epgs);
  } else {
    // 爬虫数据源：按日期分别获取
    const scraper = scraperRegistry[sourceType];
    if (!scraper) {
      throw new Error(`未知数据源类型: ${sourceType}`);
    }

    for (const date of dates) {
      try {
        const epgs = await scraper.getEpg(channel, sourceId, date);
        allEpgs.push(...epgs);
      } catch (err) {
        // 单日失败不影响其他日期
      }
    }
  }

  return allEpgs;
}

/**
 * 重置所有缓存（每次 grab 开始时调用）
 */
export function resetCaches() {
  clearXmltvCache();
}
