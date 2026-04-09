/**
 * XMLTV 文件生成器
 * 将内存中的节目数据序列化为标准 XMLTV 格式
 */

import { escapeXml, formatXmltvTime } from './utils.js';

const XMLTV_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="laobaiepg" generator-info-url="https://github.com/laobaiepg">
`;

const XMLTV_FOOTER = `</tv>`;

/**
 * 生成 XMLTV 格式字符串
 *
 * @param {Array} channels    - 频道配置数组（channels.yaml 中的条目）
 * @param {Map}   epgData     - Map<channel.id, [{start, stop, title, desc}]>
 * @param {Array} filterGroups - 仅包含这些分组（空数组=全部）
 * @returns {string} XMLTV XML 字符串
 */
export function generateXmltv(channels, epgData, filterGroups = []) {
  const parts = [XMLTV_HEADER];

  // 筛选频道
  const filteredChannels = filterGroups.length > 0
    ? channels.filter(ch => filterGroups.includes(ch.group))
    : channels;

  // 只输出有节目单数据的频道
  const activeChannels = filteredChannels.filter(ch => {
    const progs = epgData.get(ch.id);
    return progs && progs.length > 0;
  });

  // 1. 输出频道定义
  for (const channel of activeChannels) {
    parts.push(generateChannelTag(channel));
  }

  // 2. 输出节目单
  for (const channel of activeChannels) {
    const programmes = epgData.get(channel.id) || [];
    for (const prog of programmes) {
      parts.push(generateProgrammeTag(channel.id, prog));
    }
  }

  parts.push(XMLTV_FOOTER);
  return parts.join('');
}

/**
 * 生成 <channel> 标签
 */
function generateChannelTag(channel) {
  const lines = [`  <channel id="${escapeXml(channel.id)}">`];
  lines.push(`    <display-name lang="zh">${escapeXml(channel.name)}</display-name>`);

  // 添加别名作为额外的 display-name（帮助播放器匹配）
  if (channel.aliases && channel.aliases.length > 0) {
    // 只添加前5个别名，避免文件过大
    for (const alias of channel.aliases.slice(0, 5)) {
      if (alias !== channel.name) {
        lines.push(`    <display-name lang="zh">${escapeXml(alias)}</display-name>`);
      }
    }
  }

  if (channel.logo) {
    lines.push(`    <icon src="${escapeXml(channel.logo)}"/>`);
  }

  lines.push(`  </channel>`);
  return lines.join('\n') + '\n';
}

/**
 * 生成 <programme> 标签
 */
function generateProgrammeTag(channelId, prog) {
  const start = prog.start instanceof Date ? prog.start : new Date(prog.start);
  const stop = prog.stop instanceof Date ? prog.stop : (prog.stop ? new Date(prog.stop) : null);

  // 使用北京时间 +0800
  const startStr = formatXmltvTime(toBeijingTime(start), '+0800');
  const stopStr = stop ? formatXmltvTime(toBeijingTime(stop), '+0800') : '';

  const stopAttr = stopStr ? ` stop="${stopStr}"` : '';
  const lines = [
    `  <programme start="${startStr}"${stopAttr} channel="${escapeXml(channelId)}">`,
    `    <title lang="zh">${escapeXml(prog.title || '')}</title>`,
  ];

  if (prog.desc) {
    lines.push(`    <desc lang="zh">${escapeXml(prog.desc)}</desc>`);
  }

  lines.push(`  </programme>`);
  return lines.join('\n') + '\n';
}

/**
 * 将 UTC 时间转换为北京时间（+8小时）
 * 注意：formatXmltvTime 使用本地时间，所以这里做时区调整
 */
function toBeijingTime(date) {
  // 调整为北京时间（UTC+8）
  const utcMs = date.getTime();
  const beijingOffset = 8 * 60 * 60 * 1000;
  return new Date(utcMs + beijingOffset);
}

/**
 * 生成统计摘要
 */
export function generateSummary(channels, epgData) {
  let totalChannels = 0;
  let totalProgrammes = 0;

  for (const channel of channels) {
    const progs = epgData.get(channel.id);
    if (progs && progs.length > 0) {
      totalChannels++;
      totalProgrammes += progs.length;
    }
  }

  return { totalChannels, totalProgrammes };
}

/**
 * 合并多个来源的节目单（去重 + 按时间排序）
 */
export function mergeEpgData(existingProgs, newProgs) {
  if (!existingProgs || existingProgs.length === 0) return newProgs;
  if (!newProgs || newProgs.length === 0) return existingProgs;

  // 合并后按开始时间排序
  const merged = [...existingProgs, ...newProgs];
  merged.sort((a, b) => {
    const ta = a.start instanceof Date ? a.start : new Date(a.start);
    const tb = b.start instanceof Date ? b.start : new Date(b.start);
    return ta - tb;
  });

  // 去重（相同开始时间的保留前者）
  const deduped = [];
  const seen = new Set();
  for (const prog of merged) {
    const key = `${prog.start instanceof Date ? prog.start.getTime() : prog.start}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(prog);
    }
  }

  return deduped;
}
