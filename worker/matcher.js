/**
 * 频道名匹配引擎
 * 在 Cloudflare Worker 边缘运行
 * 实现精确 + 归一化匹配，支持别名
 */

/**
 * 归一化频道名（与 scripts/utils.js 保持一致）
 */
export function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    // 全角转半角
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, '')
    // 去除高清/4K等后缀
    .replace(/(高清|标清|hd|4k|8k|uhd|超清|蓝光)$/gi, '')
    .trim();
}

/**
 * 从频道 JSON 数据构建别名索引
 * @param {Array} channelList - channels.json 中的频道列表
 * @returns {Map<normalized_name, channel>}
 */
export function buildAliasIndex(channelList) {
  const index = new Map();

  for (const channel of channelList) {
    // 主 ID（精确匹配）
    index.set(channel.id, channel);
    index.set(channel.id.toLowerCase(), channel);

    // 主名称
    if (channel.name) {
      index.set(channel.name, channel);
      index.set(normalizeName(channel.name), channel);
    }

    // 所有别名
    if (channel.aliases) {
      for (const alias of channel.aliases) {
        index.set(alias, channel);
        index.set(normalizeName(alias), channel);
      }
    }
  }

  return index;
}

/**
 * 查找频道
 * 优先级：精确匹配 > 归一化匹配 > 去后缀匹配
 *
 * @param {string} name       - 播放器传入的频道名
 * @param {Map}    aliasIndex - buildAliasIndex() 返回的索引
 * @returns {Object|null}     - 频道配置，或 null
 */
export function findChannel(name, aliasIndex) {
  if (!name) return null;

  // 1. 精确匹配
  if (aliasIndex.has(name)) return aliasIndex.get(name);

  // 2. 归一化后匹配
  const norm = normalizeName(name);
  if (norm && aliasIndex.has(norm)) return aliasIndex.get(norm);

  // 3. 去掉结尾的数字/字母再匹配（如 "浙江卫视HD" -> "浙江卫视"）
  const stripped = norm.replace(/[a-z0-9]+$/, '').trim();
  if (stripped && aliasIndex.has(stripped)) return aliasIndex.get(stripped);

  return null;
}
