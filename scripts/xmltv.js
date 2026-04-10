/**
 * XMLTV 文件生成器
 */

import { escapeXml, formatXmltvTime } from './utils.js';

const HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="laobaiepg" generator-info-url="https://github.com/laobaiepg">
`;

export function generateXmltv(channels, epgData, filterGroups = []) {
  const active = (filterGroups.length > 0
    ? channels.filter(ch => filterGroups.includes(ch.group))
    : channels
  ).filter(ch => (epgData.get(ch.id) || []).length > 0);

  const parts = [HEADER];
  for (const ch of active) parts.push(channelTag(ch));
  for (const ch of active) {
    for (const prog of epgData.get(ch.id) || []) {
      parts.push(programmeTag(ch.id, prog));
    }
  }
  parts.push('</tv>');
  return parts.join('');
}

function channelTag(ch) {
  const lines = [`  <channel id="${escapeXml(ch.id)}">`,
    `    <display-name lang="zh">${escapeXml(ch.name)}</display-name>`];
  for (const alias of (ch.aliases || []).slice(0, 5)) {
    if (alias !== ch.name) lines.push(`    <display-name lang="zh">${escapeXml(alias)}</display-name>`);
  }
  if (ch.logo) lines.push(`    <icon src="${escapeXml(ch.logo)}"/>`);
  lines.push('  </channel>');
  return lines.join('\n') + '\n';
}

function programmeTag(channelId, prog) {
  const start = prog.start instanceof Date ? prog.start : new Date(prog.start);
  const stop  = prog.stop  ? (prog.stop instanceof Date ? prog.stop : new Date(prog.stop)) : null;
  const startStr = formatXmltvTime(start);
  const stopAttr = stop ? ` stop="${formatXmltvTime(stop)}"` : '';
  const lines = [
    `  <programme start="${startStr}"${stopAttr} channel="${escapeXml(channelId)}">`,
    `    <title lang="zh">${escapeXml(prog.title || '')}</title>`,
  ];
  if (prog.desc) lines.push(`    <desc lang="zh">${escapeXml(prog.desc)}</desc>`);
  lines.push('  </programme>');
  return lines.join('\n') + '\n';
}

export function generateSummary(channels, epgData) {
  let totalChannels = 0, totalProgrammes = 0;
  for (const ch of channels) {
    const n = (epgData.get(ch.id) || []).length;
    if (n > 0) { totalChannels++; totalProgrammes += n; }
  }
  return { totalChannels, totalProgrammes };
}
