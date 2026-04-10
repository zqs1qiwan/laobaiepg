#!/usr/bin/env node
/**
 * EPG 抓取主程序
 *
 * 用法:
 *   node scripts/grab.js                    # 抓取所有频道
 *   node scripts/grab.js --channel CCTV1    # 测试单个频道
 *   node scripts/grab.js --days 3           # 指定抓取天数
 *   node scripts/grab.js --test             # 测试模式（不写文件）
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';
import yaml from 'js-yaml';

import { logger, sleep } from './utils.js';
import { fetchEpg } from './sites/index.js';
import { generateXmltv, generateSummary } from './xmltv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// ============================================================
// 命令行参数
// ============================================================
const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1] : null;
};
const TEST_MODE     = args.includes('--test');
const SINGLE_CHANNEL = getArg('--channel');
const DAYS_OVERRIDE  = getArg('--days') ? parseInt(getArg('--days')) : null;

// ============================================================
// 加载配置
// ============================================================
function loadConfig() {
  const channels     = yaml.load(readFileSync(join(ROOT_DIR, 'config/channels.yaml'), 'utf-8')).channels;
  const sourcesConfig = yaml.load(readFileSync(join(ROOT_DIR, 'config/sources.yaml'), 'utf-8'));
  return {
    channels,
    crawlConfig:  sourcesConfig.crawl  || {},
    outputConfig: sourcesConfig.output || {},
  };
}

// ============================================================
// 生成日期列表（以北京时间 midnight 为基准）
// ============================================================
function getDateRange(days) {
  const beijingNow       = new Date(Date.now() + 8 * 3600000);
  const beijingMidnightUTC = Date.UTC(
    beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate(),
    -8, 0, 0, 0
  );
  return Array.from({ length: days }, (_, i) => new Date(beijingMidnightUTC + i * 86400000));
}

// ============================================================
// 为单个频道抓取 EPG（多源 + 换源重试）
// ============================================================
async function fetchChannelEpg(channel, dates, crawlConfig) {
  const sources   = channel.sources || [];
  if (sources.length === 0) return [];

  const maxRetry    = crawlConfig.retry || 2;
  const changeSource = crawlConfig.change_source !== false;

  for (let srcIdx = 0; srcIdx < sources.length; srcIdx++) {
    if (srcIdx > 0 && !changeSource) break;

    const { type: sourceType, id: sourceId = '' } = sources[srcIdx];
    let epgs    = [];
    let success = false;

    for (let retry = 0; retry <= maxRetry; retry++) {
      try {
        epgs = await fetchEpg(channel, sourceType, sourceId, dates);
        if (epgs.length > 0) { success = true; break; }
      } catch (err) {
        logger.warn(`${channel.name}: [${sourceType}] 第${retry + 1}次失败: ${err.message}`);
      }
      if (retry < maxRetry) await sleep(1000 * (retry + 1));
    }

    if (success) {
      logger.info(`✓ ${channel.name}: [${sourceType}] 获取 ${epgs.length} 条节目`);
      return epgs;
    }

    if (srcIdx < sources.length - 1) {
      logger.warn(`${channel.name}: [${sourceType}] 失败，换源...`);
    } else {
      logger.error(`✗ ${channel.name}: 所有数据源均失败`);
    }
  }
  return [];
}

// ============================================================
// 写入输出文件
// ============================================================
function writeOutput(channels, epgData, outputConfig) {
  const outputDir = join(ROOT_DIR, outputConfig.local_dir || 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const files = outputConfig.files || [{ filename: 'guide.xml', groups: [] }];

  for (const fileConfig of files) {
    const xml = generateXmltv(channels, epgData, fileConfig.groups || []);
    const outPath = join(outputDir, fileConfig.filename);
    writeFileSync(outPath, xml, 'utf-8');
    logger.info(`写入 ${fileConfig.filename} (${(xml.length / 1024).toFixed(0)} KB)`);
    const gz = gzipSync(Buffer.from(xml, 'utf-8'));
    writeFileSync(outPath + '.gz', gz);
    logger.info(`写入 ${fileConfig.filename}.gz (${(gz.length / 1024).toFixed(0)} KB)`);
  }
}

function writeChannelIndex(channels, epgData) {
  const outputDir = join(ROOT_DIR, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const index = channels.map(ch => ({
    id: ch.id, name: ch.name, group: ch.group, logo: ch.logo || '',
    aliases: ch.aliases || [],
    sources: (ch.sources || []).map(s => ({ type: s.type, id: s.id || s.name || '' })),
    hasEpg: (epgData.get(ch.id) || []).length > 0,
    programmeCount: (epgData.get(ch.id) || []).length,
  }));
  writeFileSync(join(outputDir, 'channels.json'), JSON.stringify(index, null, 2), 'utf-8');
  logger.info(`写入 channels.json (${index.length} 个频道)`);
}

// ============================================================
// 主程序
// ============================================================
async function main() {
  logger.info('='.repeat(60));
  logger.info(`LaobaiEPG | 模式: ${TEST_MODE ? '测试' : '正常'} | 频道: ${SINGLE_CHANNEL || '全部'}`);
  logger.info('='.repeat(60));

  const { channels, crawlConfig, outputConfig } = loadConfig();
  const days  = DAYS_OVERRIDE || crawlConfig.days || 7;
  const dates = getDateRange(days);
  logger.info(`抓取日期: ${dates[0].toISOString().slice(0, 10)} ~ ${dates[days - 1].toISOString().slice(0, 10)} (${days} 天)`);

  let targetChannels = channels;
  if (SINGLE_CHANNEL) {
    targetChannels = channels.filter(ch =>
      ch.id === SINGLE_CHANNEL ||
      ch.name.includes(SINGLE_CHANNEL) ||
      (ch.aliases || []).some(a => a.includes(SINGLE_CHANNEL))
    );
    if (!targetChannels.length) { logger.error(`未找到频道: ${SINGLE_CHANNEL}`); process.exit(1); }
    logger.info(`测试频道: ${targetChannels.map(c => c.name).join(', ')}`);
  }
  logger.info(`共 ${targetChannels.length} 个频道`);

  const epgData = new Map();
  let successCount = 0, failCount = 0;

  for (let i = 0; i < targetChannels.length; i++) {
    const channel = targetChannels[i];
    logger.info(`[${i + 1}/${targetChannels.length}] ${channel.name}`);

    const epgs = await fetchChannelEpg(channel, dates, crawlConfig);
    if (epgs.length > 0) {
      epgData.set(channel.id, epgs);
      successCount++;
    } else {
      failCount++;
    }

    if (i < targetChannels.length - 1 && !TEST_MODE) {
      await sleep(crawlConfig.delay || 200);
    }
  }

  const { totalChannels, totalProgrammes } = generateSummary(targetChannels, epgData);
  logger.info('='.repeat(60));
  logger.info(`完成: 成功 ${successCount}，失败 ${failCount}，节目 ${totalProgrammes} 条`);

  if (TEST_MODE) {
    logger.info('[测试模式] 不写入文件');
    if (SINGLE_CHANNEL && epgData.size > 0) {
      const [ch] = targetChannels;
      const progs = epgData.get(ch.id) || [];
      logger.info(`\n${ch.name} 前10条:`);
      for (const p of progs.slice(0, 10)) {
        logger.info(`  ${p.start.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}  ${p.title}`);
      }
    }
    return;
  }

  writeOutput(channels, epgData, outputConfig);
  writeChannelIndex(channels, epgData);
  logger.info('完成！');

  if (failCount > 0) {
    const failed = targetChannels
      .filter(ch => !epgData.has(ch.id) || !(epgData.get(ch.id) || []).length)
      .map(ch => ch.name);
    logger.warn(`失败频道: ${failed.join(', ')}`);
  }
}

main().catch(err => {
  logger.error(`致命错误: ${err.message}\n${err.stack}`);
  process.exit(1);
});
