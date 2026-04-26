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

import { readFileSync, mkdirSync, writeFileSync, existsSync, renameSync } from 'fs';
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
// 为单个频道抓取 EPG（多源 + 换源重试 + 双源合并）
// ============================================================

/**
 * 按北京时间日期分组，返回 Map<"YYYY-MM-DD", programme[]>
 */
function groupByBeijingDate(progs) {
  const groups = new Map();
  for (const p of progs) {
    const bj = new Date(p.start.getTime() + 8 * 3600000);
    const key = `${bj.getUTCFullYear()}-${String(bj.getUTCMonth() + 1).padStart(2, '0')}-${String(bj.getUTCDate()).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return groups;
}

/**
 * 检测频道是否配置了双源合并模式（kankanews + tvmao）
 * 双源模式：sources 中同时存在 kankanews 和 tvmao 类型
 * 合并策略：kankanews 的今天数据覆盖 tvmao 的今天数据；tvmao 的明天/后天数据直接追加
 */
function isDualSourceMerge(sources) {
  const types = sources.map(s => s.type);
  return types.includes('kankanews') && types.includes('tvmao');
}

/**
 * 双源合并抓取：kankanews（今天优先）+ tvmao（补充明后天）
 */
async function fetchDualSource(channel, dates, crawlConfig, datesTvmao) {
  const sources = channel.sources || [];
  const maxRetry = crawlConfig.retry || 2;

  const kankanewsSrc = sources.find(s => s.type === 'kankanews');
  const tvmaoSrc = sources.find(s => s.type === 'tvmao');

  let kankanewsEpgs = [];
  let tvmaoEpgs = [];

  // 1. 抓 kankanews（仅当天）
  if (kankanewsSrc) {
    for (let retry = 0; retry <= maxRetry; retry++) {
      try {
        kankanewsEpgs = await fetchEpg(channel, 'kankanews', kankanewsSrc.id, dates);
        if (kankanewsEpgs.length > 0) break;
      } catch (err) {
        logger.warn(`${channel.name}: [kankanews] 第${retry + 1}次失败: ${err.message}`);
      }
      if (retry < maxRetry) await sleep(1000 * (retry + 1));
    }
    if (kankanewsEpgs.length > 0) {
      logger.info(`✓ ${channel.name}: [kankanews] 获取 ${kankanewsEpgs.length} 条节目`);
    } else {
      logger.warn(`${channel.name}: [kankanews] 无数据`);
    }
  }

  // 2. 抓 tvmao（补充）
  if (tvmaoSrc) {
    const effectiveDates = datesTvmao || dates;
    for (let retry = 0; retry <= maxRetry; retry++) {
      try {
        tvmaoEpgs = await fetchEpg(channel, 'tvmao', tvmaoSrc.id, effectiveDates);
        if (tvmaoEpgs.length > 0) break;
      } catch (err) {
        logger.warn(`${channel.name}: [tvmao] 第${retry + 1}次失败: ${err.message}`);
      }
      if (retry < maxRetry) await sleep(1000 * (retry + 1));
    }
    if (tvmaoEpgs.length > 0) {
      logger.info(`✓ ${channel.name}: [tvmao] 获取 ${tvmaoEpgs.length} 条节目（补充源）`);
    } else {
      logger.warn(`${channel.name}: [tvmao] 无数据`);
    }
  }

  // 3. 合并：按日期分组，kankanews 覆盖同日 tvmao 数据
  const kankanewsByDate = groupByBeijingDate(kankanewsEpgs);
  const tvmaoByDate = groupByBeijingDate(tvmaoEpgs);
  const allDates = new Set([...kankanewsByDate.keys(), ...tvmaoByDate.keys()]);

  const merged = [];
  for (const date of [...allDates].sort()) {
    if (kankanewsByDate.has(date)) {
      // kankanews 有数据的日期，优先使用 kankanews
      merged.push(...kankanewsByDate.get(date));
    } else if (tvmaoByDate.has(date)) {
      // kankanews 没有的日期（明后天），用 tvmao 补充
      merged.push(...tvmaoByDate.get(date));
    }
  }

  if (merged.length > 0) {
    const kkDays = kankanewsByDate.size;
    const tvDays = [...allDates].filter(d => !kankanewsByDate.has(d) && tvmaoByDate.has(d)).length;
    logger.info(`✓ ${channel.name}: [双源合并] 共 ${merged.length} 条（kankanews ${kkDays} 天, tvmao 补充 ${tvDays} 天）`);
  } else {
    logger.error(`✗ ${channel.name}: 双源均无数据`);
  }

  return merged;
}

async function fetchChannelEpg(channel, dates, crawlConfig, datesTvmao) {
  const sources   = channel.sources || [];
  if (sources.length === 0) return [];

  // 双源合并模式（kankanews + tvmao）
  if (isDualSourceMerge(sources)) {
    return fetchDualSource(channel, dates, crawlConfig, datesTvmao);
  }

  const maxRetry    = crawlConfig.retry || 2;
  const changeSource = crawlConfig.change_source !== false;

  for (let srcIdx = 0; srcIdx < sources.length; srcIdx++) {
    if (srcIdx > 0 && !changeSource) break;

    const { type: sourceType, id: sourceId = '' } = sources[srcIdx];
    let epgs    = [];
    let success = false;
    // tvmao 用独立天数配置，其他源用全量 dates
    const effectiveDates = (sourceType === 'tvmao' && datesTvmao) ? datesTvmao : dates;

    for (let retry = 0; retry <= maxRetry; retry++) {
      try {
        epgs = await fetchEpg(channel, sourceType, sourceId, effectiveDates);
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
/**
 * 从已有 XML 文件中解析出旧 EPG 数据，用于在新抓取失败时兜底
 * 返回 Map<channelId, programme[]>
 */
function loadExistingEpg(outputDir, filename) {
  const outPath = join(outputDir, filename);
  if (!existsSync(outPath)) return new Map();
  try {
    const xml = readFileSync(outPath, 'utf-8');
    const old = new Map();
    // 解析 <programme start="..." stop="..." channel="..."><title>...</title></programme>
    const re = /<programme[^>]+start="([^"]+)"[^>]+stop="([^"]+)"[^>]+channel="([^"]+)"[^>]*>\s*<title[^>]*>([^<]*)<\/title>(?:[\s\S]*?<desc[^>]*>([^<]*)<\/desc>)?/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const [, startStr, stopStr, channelId, title, desc = ''] = m;
      const start = new Date(startStr.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2}) ([+-]\d{4})/, '$1-$2-$3T$4:$5:$6$7'));
      const stop  = new Date(stopStr.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2}) ([+-]\d{4})/, '$1-$2-$3T$4:$5:$6$7'));
      if (!old.has(channelId)) old.set(channelId, []);
      old.get(channelId).push({ start, stop, title, desc });
    }
    logger.info(`[fallback] 读取旧数据: ${old.size} 个频道`);
    return old;
  } catch (e) {
    logger.warn(`[fallback] 读取旧 XML 失败: ${e.message}`);
    return new Map();
  }
}

function writeOutput(channels, epgData, outputConfig) {
  const outputDir = join(ROOT_DIR, outputConfig.local_dir || 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const files = outputConfig.files || [{ filename: 'guide.xml', groups: [] }];

  for (const fileConfig of files) {
    const outPath = join(outputDir, fileConfig.filename);

    // 读取旧数据用于 fallback
    const oldEpg = loadExistingEpg(outputDir, fileConfig.filename);

    // 按日期维度合并：对每个频道每一天，有新数据用新的，没有则保留旧的
    // 这样 7 天中某天抓取失败，不会丢失该天已有的节目数据
    const mergedEpg = new Map();
    let fallbackChannels = 0, fallbackProgs = 0;

    // 把节目列表按「北京时间日期 YYYY-MM-DD」分桶
    function bucketByDate(progs) {
      const buckets = new Map();
      for (const p of progs) {
        const bj = new Date(p.start.getTime() + 8 * 3600000);
        const key = `${bj.getUTCFullYear()}-${String(bj.getUTCMonth()+1).padStart(2,'0')}-${String(bj.getUTCDate()).padStart(2,'0')}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(p);
      }
      return buckets;
    }

    for (const ch of channels) {
      const newProgs  = epgData.get(ch.id) || [];
      const oldProgs  = oldEpg.get(ch.id)  || [];

      if (oldProgs.length === 0) {
        // 没有旧数据，直接用新数据（可能也是空）
        if (newProgs.length > 0) mergedEpg.set(ch.id, newProgs);
        continue;
      }

      const newBuckets = bucketByDate(newProgs);
      const oldBuckets = bucketByDate(oldProgs);

      // 合并：新有的日期用新的，新没有的日期补旧的
      const allDates = new Set([...newBuckets.keys(), ...oldBuckets.keys()]);
      const merged = [];
      let addedFallback = 0;
      for (const date of [...allDates].sort()) {
        const newProgsForDate = newBuckets.get(date) || [];
        const oldProgsForDate = oldBuckets.get(date) || [];
        if (newProgsForDate.length > 0) {
          // 新数据有内容，用新的
          merged.push(...newProgsForDate);
        } else if (oldProgsForDate.length > 0) {
          // 新数据为空（如 brtv 当天返回空），保留旧数据不覆盖
          merged.push(...oldProgsForDate);
          addedFallback += oldProgsForDate.length;
        }
      }

      if (merged.length > 0) mergedEpg.set(ch.id, merged);

      if (addedFallback > 0) {
        fallbackChannels++;
        fallbackProgs += addedFallback;
        logger.warn(`[fallback] ${ch.name}: 补充 ${addedFallback} 条旧节目（新抓取缺失的日期）`);
      }
    }

    if (fallbackChannels > 0) logger.info(`[fallback] 共 ${fallbackChannels} 个频道补充了 ${fallbackProgs} 条旧节目数据`);

    const xml = generateXmltv(channels, mergedEpg, fileConfig.groups || []);
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
  const LOGO_BASE = 'https://logo.laobaitv.net/';
  const index = channels.map(ch => {
    const logoSlug = (ch.logo || ch.name || '').replace(/\s+/g, '');
    return {
      id: ch.id, name: ch.name, group: ch.group, region: ch.region || null, logo: ch.logo || '',
      logo_url: logoSlug ? `${LOGO_BASE}${logoSlug}` : '',
      aliases: ch.aliases || [],
      sources: (ch.sources || []).map(s => ({ type: s.type, id: s.id || s.name || '' })),
      hasEpg: (epgData.get(ch.id) || []).length > 0,
      programmeCount: (epgData.get(ch.id) || []).length,
    };
  });
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
  const days       = DAYS_OVERRIDE || crawlConfig.days || 7;
  const daysTvmao  = DAYS_OVERRIDE || crawlConfig.days_tvmao || days;
  const dates      = getDateRange(days);
  const datesTvmao = getDateRange(daysTvmao).reverse(); // 倒序：先抓最远的天，今天的数据下次跑会补
  logger.info(`抓取日期: ${dates[0].toISOString().slice(0, 10)} ~ ${dates[days - 1].toISOString().slice(0, 10)} (${days} 天, tvmao: ${daysTvmao} 天 倒序)`);

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

    const epgs = await fetchChannelEpg(channel, dates, crawlConfig, datesTvmao);
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

  // 记录失败频道信息（用于后续补抓）
  const failedChannels = targetChannels
    .filter(ch => !epgData.has(ch.id) || !(epgData.get(ch.id) || []).length)
    .map(ch => ({
      id: ch.id,
      name: ch.name,
      sources: (ch.sources || []).map(s => s.type),
      failedAt: new Date().toISOString(),
    }));

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

  // 写入失败频道记录（上传到 R2 供下次跑参考）
  const outputDir = join(ROOT_DIR, outputConfig.local_dir || 'output');
  if (failedChannels.length > 0) {
    writeFileSync(
      join(outputDir, 'failed_channels.json'),
      JSON.stringify({ timestamp: new Date().toISOString(), channels: failedChannels }, null, 2),
      'utf-8'
    );
    logger.warn(`失败频道 (${failedChannels.length}): ${failedChannels.map(c => c.name).join(', ')}`);
    logger.info(`已写入 failed_channels.json（将随 output 上传到 R2）`);
  } else {
    // 全部成功，删除旧的失败记录
    const failedPath = join(outputDir, 'failed_channels.json');
    if (existsSync(failedPath)) {
      writeFileSync(failedPath, JSON.stringify({ timestamp: new Date().toISOString(), channels: [] }, null, 2), 'utf-8');
      logger.info('所有频道抓取成功，清除失败记录');
    }
  }

  logger.info('完成！');
}

main().catch(err => {
  logger.error(`致命错误: ${err.message}\n${err.stack}`);
  process.exit(1);
});
