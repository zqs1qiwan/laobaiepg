/**
 * 央视网 (CNTV) 官方 EPG 数据源
 * API: http://api.cntv.cn/epg/epginfo?c={ch1},{ch2},...&d={YYYYMMDD}
 *
 * 特点：
 * - 官方数据源，稳定可靠
 * - 支持批量多频道（逗号分隔），一次请求拿多个频道
 * - 支持多天数据（今天、明天、后天均可查询）
 * - 秒级时间戳（st/et）
 * - 覆盖 CCTV1-17 + 欧洲/美洲 + 大量卫视频道
 */

import { fetchWithRetry, logger, formatBeijingDate, sleep } from '../utils.js';

const API_BASE = 'http://api.cntv.cn/epg/epginfo';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Referer': 'https://tv.cctv.com/',
};

/** CNTV 频道名 → 显示名映射（含央视 + 卫视） */
const CHANNEL_MAP = {
  // === 央视 ===
  cctv1:        'CCTV-1 综合',
  cctv2:        'CCTV-2 财经',
  cctv3:        'CCTV-3 综艺',
  cctv4:        'CCTV-4 中文国际',
  cctv5:        'CCTV-5 体育',
  cctv5plus:    'CCTV-5+ 体育赛事',
  cctv6:        'CCTV-6 电影',
  cctv7:        'CCTV-7 国防军事',
  cctv8:        'CCTV-8 电视剧',
  cctvjilu:     'CCTV-9 纪录',
  cctv10:       'CCTV-10 科教',
  cctv11:       'CCTV-11 戏曲',
  cctv12:       'CCTV-12 社会与法',
  cctv13:       'CCTV-13 新闻',
  cctvchild:    'CCTV-14 少儿',
  cctv15:       'CCTV-15 音乐',
  cctv16:       'CCTV-16 奥林匹克',
  cctv17:       'CCTV-17 农业农村',
  cctveurope:   'CCTV-4 欧洲',
  cctvamerica:  'CCTV-4 美洲',
  // === 卫视 ===
  btv1:         '北京卫视',
  hunan:        '湖南卫视',
  zhejiang:     '浙江卫视',
  jiangsu:      '江苏卫视',
  dongfang:     '东方卫视',
  anhui:        '安徽卫视',
  shandong:     '山东卫视',
  sichuan:      '四川卫视',
  henan:        '河南卫视',
  guangdong:    '广东卫视',
  chongqing:    '重庆卫视',
  liaoning:     '辽宁卫视',
  hubei:        '湖北卫视',
  jiangxi:      '江西卫视',
  yunnan:        '云南卫视',
  guizhou:      '贵州卫视',
  gansu:        '甘肃卫视',
  heilongjiang: '黑龙江卫视',
  jilin:        '吉林卫视',
  tianjin:      '天津卫视',
  neimenggu:    '内蒙古卫视',
  xinjiang:     '新疆卫视',
  xizang:       '西藏卫视',
  ningxia:      '宁夏卫视',
  qinghai:      '青海卫视',
  guangxi:      '广西卫视',
  shenzhen:     '深圳卫视',
  dongnan:      '东南卫视',
  xiamen:       '厦门卫视',
  hebei:        '河北卫视',
};

/**
 * 批量获取多频道某天的节目单
 * 内部方法，由 getEpgCntv 调用（单频道），也可外部用于批量场景
 *
 * @param {string[]} cntvNames - CNTV 频道名数组
 * @param {string}   dateStr   - 日期字符串 YYYYMMDD
 * @returns {Map<string, Array>} cntvName → [{start, stop, title, desc}]
 */
export async function batchFetchCntv(cntvNames, dateStr) {
  const result = new Map();
  if (!cntvNames.length) return result;

  const url = `${API_BASE}?c=${cntvNames.join(',')}&d=${dateStr}`;

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 15000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    // 检查 API 错误
    if (data.errcode) {
      logger.error(`[cntv] 批量请求失败: errcode=${data.errcode}, msg=${data.msg || ''}`);
      return result;
    }

    for (const cntvName of cntvNames) {
      const channelData = data[cntvName];
      if (!channelData || !Array.isArray(channelData.program) || channelData.program.length === 0) {
        continue;
      }
      result.set(cntvName, parsePrograms(channelData.program));
    }
  } catch (err) {
    logger.error(`[cntv] 批量请求 ${dateStr} 失败: ${err.message}`);
  }

  return result;
}

/**
 * 获取央视网某频道某天的节目单（标准 scraper 接口）
 *
 * @param {Object} channel    - 频道配置
 * @param {string} cntvName   - CNTV 频道名（如 "cctv1", "cctvjilu", "hunan"）
 * @param {Date}   date       - 日期（北京时间 midnight 的 UTC 基准）
 * @returns {Array} [{start, stop, title, desc}]
 */
export async function getEpgCntv(channel, cntvName, date) {
  const dateStr = formatBeijingDate(date); // "YYYYMMDD"
  const url = `${API_BASE}?c=${cntvName}&d=${dateStr}`;

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.errcode) {
      logger.warn(`[cntv] ${channel.name} (${cntvName}) ${dateStr}: errcode=${data.errcode}`);
      return [];
    }

    const channelData = data[cntvName];
    if (!channelData || !Array.isArray(channelData.program) || channelData.program.length === 0) {
      // 尝试取第一个有效 key（response key 可能不完全匹配）
      const firstKey = Object.keys(data).find(k => data[k]?.program?.length > 0);
      if (!firstKey) {
        logger.warn(`[cntv] ${channel.name} (${cntvName}) ${dateStr}: 无节目数据`);
        return [];
      }
      const epgs = parsePrograms(data[firstKey].program);
      logger.info(`[cntv] ${channel.name} (${cntvName}) ${dateStr}: ${epgs.length} 条节目`);
      return epgs;
    }

    const epgs = parsePrograms(channelData.program);
    logger.info(`[cntv] ${channel.name} (${cntvName}) ${dateStr}: ${epgs.length} 条节目`);
    return epgs;
  } catch (err) {
    logger.error(`[cntv] ${channel.name} (${cntvName}) ${dateStr} 失败: ${err.message}`);
    return [];
  }
}

/**
 * 解析节目列表
 * @param {Array} programs - API 返回的 program 数组
 * @returns {Array} [{start, stop, title, desc}]
 */
function parsePrograms(programs) {
  const epgs = [];
  for (const prog of programs) {
    const { t, st, et } = prog;
    if (!t || !st) continue;

    const start = new Date(st * 1000);
    const stop = et ? new Date(et * 1000) : null;

    if (isNaN(start.getTime())) continue;
    if (stop && isNaN(stop.getTime())) continue;

    epgs.push({
      start,
      stop,
      title: t.trim(),
      desc: '',
    });
  }
  return epgs;
}

/**
 * 频道列表
 */
export async function getChannelsCntv() {
  logger.info('[cntv] 频道列表（内置）');
  return Object.entries(CHANNEL_MAP).map(([id, name]) => ({ id, name }));
}
