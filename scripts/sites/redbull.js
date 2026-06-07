/**
 * Red Bull TV 数据源
 *
 * API: https://tv-api.redbull.com/guides/v5/rbtv/zh_CN/cn/{channel-uuid}
 *
 * 特点：
 *   - 无需鉴权，Access-Control-Allow-Origin: *，公开接口
 *   - 只有当天数据（任何日期参数均无效），每次返回固定 20 条左右
 *   - 时间为 UTC ISO8601，直接解析即可
 *   - 图片 URL 含 {im} 占位符，替换为具体尺寸可获取缩略图
 *
 * 频道 UUID 对照表：
 *   redbulltv         → c81f8686-ab67-4965-ba04-5f6658bb96cc  (主台 World of Red Bull)
 *   redbullpadel      → e0e6dee0-8c39-4de1-9488-72828468efe0
 *   redbullbike       → ee30c528-32b1-4604-8976-e3bcee4ae7f0
 *   redbulladventure  → 870bcfa8-62b1-4e84-9c85-39f083df368a
 *   redbullmotorsports→ fd4ed3c9-1800-477b-9909-53255da06632
 *   redbullsurfing    → 2f6afaec-7ade-4fb8-961a-a51aa8279a99
 *   redbullskateboarding → 5021f46c-6f34-4f51-ba1f-967f2885ac97
 *   redbullwinter     → f4aa4fe4-5ce6-4b1c-a60b-abc6f21f16d0
 *   redbullactionreel → 69a66f02-21fd-42a1-be5b-6965541cfe6a
 */

import { fetchWithRetry, logger } from '../utils.js';

const API_BASE = 'https://tv-api.redbull.com/guides/v5/rbtv/zh_CN/cn';
const CHANNEL_PREFIX = 'rrn:content:video-channels:';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; LaobaiEPG/1.0)',
  'Accept': 'application/json',
};

/**
 * 获取 Red Bull TV 某频道节目单
 *
 * 注意：API 不支持按日期查询，始终返回当天数据。
 * 对于非当天的 date 参数，直接返回空数组，不发请求，避免浪费。
 *
 * @param {Object} channel   - 频道配置
 * @param {string} channelId - Red Bull TV 频道 UUID
 * @param {Date}   date      - 日期（北京时间 midnight 的 UTC 基准）
 * @returns {Array} [{start, stop, title, desc, icon}]
 */
export async function getEpgRedbull(channel, channelId, date) {
  // 计算 date 对应的北京日期
  const bjDate = new Date(date.getTime() + 8 * 3600000);
  const bjDateStr = `${bjDate.getUTCFullYear()}-${String(bjDate.getUTCMonth() + 1).padStart(2, '0')}-${String(bjDate.getUTCDate()).padStart(2, '0')}`;

  // 当前北京日期
  const nowBj = new Date(Date.now() + 8 * 3600000);
  const todayStr = `${nowBj.getUTCFullYear()}-${String(nowBj.getUTCMonth() + 1).padStart(2, '0')}-${String(nowBj.getUTCDate()).padStart(2, '0')}`;

  // API 只有当天数据，非今天跳过
  if (bjDateStr !== todayStr) {
    logger.debug(`[redbull] ${channel.name} (${channelId}) ${bjDateStr}: 非当天，跳过`);
    return [];
  }

  const url = `${API_BASE}/${CHANNEL_PREFIX}${channelId}`;
  const epgs = [];

  try {
    const res = await fetchWithRetry(url, { headers: HEADERS }, 2, 15000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const cards = data.cards || [];

    for (const card of cards) {
      const title = (card.title || '').trim();
      if (!title) continue;

      const startStr = card.start_time;
      const stopStr = card.end_time;
      if (!startStr) continue;

      const start = new Date(startStr);
      const stop = stopStr ? new Date(stopStr) : null;

      if (isNaN(start.getTime())) continue;

      // 描述：优先用 short_description，fallback 到 subheading
      const desc = (card.short_description || card.subheading || '').trim();

      // 缩略图（landscape 格式，替换 {im} 占位符为 1280x720）
      let icon = '';
      const lr = card.media_resources?.rbtv_display_art_landscape?.url;
      if (lr) {
        icon = lr.replace('{im}', '1280x720');
      }

      epgs.push({ start, stop, title, desc, icon });
    }

    logger.info(`[redbull] ${channel.name} (${channelId}) ${bjDateStr}: ${epgs.length} 条节目`);
  } catch (err) {
    logger.error(`[redbull] ${channel.name} (${channelId}) ${bjDateStr} 失败: ${err.message}`);
  }

  return epgs;
}

export async function getChannelsRedbull() {
  logger.info('[redbull] 频道列表（内置）');
  return [
    { id: 'c81f8686-ab67-4965-ba04-5f6658bb96cc', name: 'Red Bull TV' },
    { id: 'e0e6dee0-8c39-4de1-9488-72828468efe0', name: 'Red Bull Padel' },
    { id: 'ee30c528-32b1-4604-8976-e3bcee4ae7f0', name: 'Red Bull Bike' },
    { id: '870bcfa8-62b1-4e84-9c85-39f083df368a', name: 'Red Bull Adventure' },
    { id: 'fd4ed3c9-1800-477b-9909-53255da06632', name: 'Red Bull Motorsports' },
    { id: '2f6afaec-7ade-4fb8-961a-a51aa8279a99', name: 'Red Bull Surfing' },
    { id: '5021f46c-6f34-4f51-ba1f-967f2885ac97', name: 'Red Bull Skateboarding' },
    { id: 'f4aa4fe4-5ce6-4b1c-a60b-abc6f21f16d0', name: 'Red Bull Winter' },
    { id: '69a66f02-21fd-42a1-be5b-6965541cfe6a', name: 'Red Bull Action Reel' },
  ];
}
