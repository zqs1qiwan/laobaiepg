#!/usr/bin/env node
/**
 * EPG 抓取主程序
 * 学习 supzhang/epg 的多源抓取 + 换源重试模式
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

import { logger, buildAliasIndex, sleep } from './utils.js';
import { fetchEpg, resetCaches } from './sites/index.js';
import { generateXmltv, generateSummary, mergeEpgData } from './xmltv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// ============================================================
// 解析命令行参数
// ============================================================
const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1]
    : null;
};
const hasFlag = (flag) => args.includes(flag);

const TEST_MODE = hasFlag('--test');
const SINGLE_CHANNEL = getArg('--channel');
const DAYS_OVERRIDE = getArg('--days') ? parseInt(getArg('--days')) : null;

// ============================================================
// 加载配置
// ============================================================
function loadConfig() {
  const channelsPath = join(ROOT_DIR, 'config/channels.yaml');
  const sourcesPath = join(ROOT_DIR, 'config/sources.yaml');

  const channels = yaml.load(readFileSync(channelsPath, 'utf-8')).channels;
  const sourcesConfig = yaml.load(readFileSync(sourcesPath, 'utf-8'));

  // 构建 xmltv_url 数据源 Map
  const xmltvSources = new Map();
  for (const src of (sourcesConfig.xmltv_sources || [])) {
    if (src.enabled && src.url) {
      xmltvSources.set(src.id, src);
    }
  }

  const crawlConfig = sourcesConfig.crawl || {};
  const outputConfig = sourcesConfig.output || {};

  return { channels, xmltvSources, crawlConfig, outputConfig, sourcesConfig };
}

// ============================================================
// 生成需要抓取的日期列表
// ============================================================
function getDateRange(days) {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// ============================================================
// 为单个频道抓取 EPG（带换源重试，参考 supzhang/epg get_epg）
// ============================================================
async function fetchChannelEpg(channel, dates, xmltvSources, crawlConfig) {
  const sources = channel.sources || [];

  if (sources.length === 0) {
    logger.warn(`频道 ${channel.name} 没有配置数据源`);
    return [];
  }

  const maxRetry = crawlConfig.retry || 2;
  const changeSource = crawlConfig.change_source !== false;

  for (let srcIdx = 0; srcIdx < sources.length; srcIdx++) {
    const source = sources[srcIdx];
    const sourceType = source.type;
    const sourceId = source.id || source.name || '';

    if (srcIdx > 0 && !changeSource) break; // 不允许换源时跳出

    // 准备数据源配置（xmltv_url 需要）
    let sourceConfig = null;
    if (sourceType === 'xmltv_url') {
      // 找到启用的 xmltv 数据源（按顺序尝试所有启用的 xmltv 源）
      const xmltvSourcesList = [...xmltvSources.values()];
      if (xmltvSourcesList.length === 0) {
        logger.warn(`${channel.name}: xmltv_url 类型但没有启用的 XMLTV 数据源`);
        continue;
      }

      // 尝试每个 XMLTV 源
      let found = [];
      for (const xs of xmltvSourcesList) {
        try {
          const epgs = await fetchEpg(channel, 'xmltv_url', sourceId, dates, xs);
          if (epgs.length > 0) {
            found = epgs;
            logger.info(`✓ ${channel.name}: 从 ${xs.name} 获取 ${epgs.length} 条节目`);
            break;
          }
        } catch (err) {
          logger.warn(`${channel.name}: ${xs.name} 失败: ${err.message}`);
        }
      }
      if (found.length > 0) return found;
      continue; // 所有 xmltv 源都失败，尝试下一个数据源类型
    }

    // 爬虫数据源（cctv/tvmao/tvb 等）
    let epgs = [];
    let success = false;

    for (let retry = 0; retry <= maxRetry; retry++) {
      try {
        epgs = await fetchEpg(channel, sourceType, sourceId, dates, sourceConfig);
        if (epgs.length > 0) {
          success = true;
          logger.info(`✓ ${channel.name}: [${sourceType}] 获取 ${epgs.length} 条节目`);
          break;
        }
      } catch (err) {
        logger.warn(`${channel.name}: [${sourceType}] 第${retry + 1}次失败: ${err.message}`);
      }

      if (retry < maxRetry) {
        await sleep(1000 * (retry + 1));
      }
    }

    if (success) return epgs;

    if (srcIdx < sources.length - 1) {
      logger.warn(`${channel.name}: [${sourceType}] 全部重试失败，尝试换源...`);
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

  const files = outputConfig.files || [
    { id: 'all', filename: 'guide.xml', groups: [] },
  ];

  for (const fileConfig of files) {
    const filterGroups = fileConfig.groups || [];
    const xmlContent = generateXmltv(channels, epgData, filterGroups);
    const outputPath = join(outputDir, fileConfig.filename);

    writeFileSync(outputPath, xmlContent, 'utf-8');
    const sizeKB = (xmlContent.length / 1024).toFixed(0);
    logger.info(`写入 ${fileConfig.filename} (${sizeKB} KB)`);

    // 同时写入 .gz 版本
    const gzPath = outputPath + '.gz';
    const gzContent = gzipSync(Buffer.from(xmlContent, 'utf-8'));
    writeFileSync(gzPath, gzContent);
    logger.info(`写入 ${fileConfig.filename}.gz (${(gzContent.length / 1024).toFixed(0)} KB)`);
  }
}

// ============================================================
// 写入频道索引（供 Worker 使用）
// ============================================================
function writeChannelIndex(channels, epgData) {
  const outputDir = join(ROOT_DIR, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const index = channels.map(ch => ({
    id: ch.id,
    name: ch.name,
    group: ch.group,
    logo: ch.logo || '',
    aliases: ch.aliases || [],
    hasEpg: (epgData.get(ch.id) || []).length > 0,
    programmeCount: (epgData.get(ch.id) || []).length,
  }));

  writeFileSync(
    join(outputDir, 'channels.json'),
    JSON.stringify(index, null, 2),
    'utf-8'
  );
  logger.info(`写入 channels.json (${index.length} 个频道)`);
}

// ============================================================
// 主程序
// ============================================================
async function main() {
  logger.info('='.repeat(60));
  logger.info('LaobaiEPG 抓取程序启动');
  logger.info(`模式: ${TEST_MODE ? '测试' : '正常'} | 单频道: ${SINGLE_CHANNEL || '全部'}`);
  logger.info('='.repeat(60));

  // 加载配置
  const { channels, xmltvSources, crawlConfig, outputConfig } = loadConfig();

  // 重置缓存
  resetCaches();

  // 确定抓取天数和日期
  const days = DAYS_OVERRIDE || crawlConfig.days || 7;
  const dates = getDateRange(days);
  logger.info(`抓取日期: ${dates[0].toISOString().slice(0, 10)} ~ ${dates[dates.length - 1].toISOString().slice(0, 10)} (${days} 天)`);

  // 筛选频道
  let targetChannels = channels;
  if (SINGLE_CHANNEL) {
    targetChannels = channels.filter(ch =>
      ch.id === SINGLE_CHANNEL ||
      ch.name.includes(SINGLE_CHANNEL) ||
      (ch.aliases || []).some(a => a.includes(SINGLE_CHANNEL))
    );
    if (targetChannels.length === 0) {
      logger.error(`未找到频道: ${SINGLE_CHANNEL}`);
      process.exit(1);
    }
    logger.info(`测试频道: ${targetChannels.map(c => c.name).join(', ')}`);
  }

  logger.info(`共有 ${targetChannels.length} 个频道需要抓取`);

  // 抓取数据
  const epgData = new Map();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < targetChannels.length; i++) {
    const channel = targetChannels[i];
    const progress = `[${i + 1}/${targetChannels.length}]`;
    logger.info(`${progress} 抓取: ${channel.name}`);

    const epgs = await fetchChannelEpg(channel, dates, xmltvSources, crawlConfig);

    if (epgs.length > 0) {
      epgData.set(channel.id, epgs);
      successCount++;
    } else {
      failCount++;
    }

    // 请求间隔
    if (i < targetChannels.length - 1 && !TEST_MODE) {
      const delay = crawlConfig.delay || 200;
      await sleep(delay);
    }
  }

  // 统计
  const { totalChannels, totalProgrammes } = generateSummary(targetChannels, epgData);
  logger.info('='.repeat(60));
  logger.info(`抓取完成: 成功 ${successCount} 个频道，失败 ${failCount} 个`);
  logger.info(`有效频道: ${totalChannels}，总节目数: ${totalProgrammes}`);

  // 测试模式：只打印，不写文件
  if (TEST_MODE) {
    logger.info('[测试模式] 不写入文件');
    if (SINGLE_CHANNEL && epgData.size > 0) {
      const [ch] = targetChannels;
      const progs = epgData.get(ch.id) || [];
      logger.info(`\n${ch.name} 节目单 (前10条):`);
      for (const p of progs.slice(0, 10)) {
        const startStr = p.start.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        logger.info(`  ${startStr}  ${p.title}`);
      }
    }
    return;
  }

  // 写入输出文件
  writeOutput(channels, epgData, outputConfig);
  writeChannelIndex(channels, epgData);

  logger.info('='.repeat(60));
  logger.info('所有文件写入完成！');

  // 失败频道汇总
  if (failCount > 0) {
    const failedChannels = targetChannels
      .filter(ch => !epgData.has(ch.id) || (epgData.get(ch.id) || []).length === 0)
      .map(ch => ch.name);
    logger.warn(`失败频道: ${failedChannels.join(', ')}`);
  }
}

main().catch(err => {
  logger.error(`致命错误: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});
