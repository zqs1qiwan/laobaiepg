/**
 * 频道名匹配引擎
 * 在 Cloudflare Worker 边缘运行
 *
 * 匹配优先级：
 *   1. 精确匹配（原始名 / ID）
 *   2. 归一化匹配（小写 + 去空格 + 全角转半角 + 去 HD/4K 后缀）
 *   3. 繁简转换匹配（繁体 → 简体后重新匹配）
 *   4. CCTV 正则匹配（CCTV-1、CCTV 1、CCTV1综合 等变体自动归一化）
 *   5. 去尾部字母数字匹配（如 "浙江卫视HD" → "浙江卫视"）
 */

// ============================================================
// 繁简转换映射（常见电视频道名中出现的繁体字）
// 精简版：只覆盖频道名常见字，不是完整繁简转换库
// ============================================================
const T2S = {
  // 常见字
  '臺':'台','衛':'卫','視':'视','電':'电','頻':'频','導':'导','錄':'录',
  '華':'华','國':'国','際':'际','經':'经','濟':'济','財':'财','軍':'军',
  '農':'农','業':'业','紀':'纪','實':'实','藝':'艺','樂':'乐','體':'体',
  '動':'动','畫':'画','聯':'联','網':'网','訊':'讯','報':'报','綜':'综',
  '節':'节','預':'预','劇':'剧','戲':'戏','劇':'剧','場':'场','園':'园',
  '頻':'频','廣':'广','傳':'传','東':'东','車':'车','計':'计','學':'学',
  '達':'达','環':'环','勢':'势','點':'点','線':'线','調':'调','長':'长',
  '開':'开','關':'关','門':'门','間':'间','運':'运','選':'择','聞':'闻',
  '與':'与','歡':'欢','風':'风','雲':'云','聯':'联','會':'会','寶':'宝',
  '訊':'讯','歷':'历','書':'书','來':'来','類':'类','無':'无','衝':'冲',
  '現':'现','裡':'里','區':'区','鳳':'凤','鳳':'凤','黃':'黄','個':'个',
  '飛':'飞','夢':'梦','覺':'觉','優':'优','馬':'马','時':'时','聯':'联',
  '遊':'游','戰':'战','複':'复','號':'号','機':'机','愛':'爱','輪':'轮',
  '陽':'阳','雜':'杂','萬':'万','連':'连','從':'从','獎':'奖','費':'费',
  '禮':'礼','鑑':'鉴','識':'识','寫':'写','應':'应','係':'系','對':'对',
  '轉':'转','據':'据','離':'离','雞':'鸡','絲':'丝','魚':'鱼','蘭':'兰',
  '釣':'钓',
};

/**
 * 繁体转简体（频道名级别，非通用转换）
 */
export function t2s(str) {
  if (!str) return '';
  let result = '';
  for (const ch of str) {
    result += T2S[ch] || ch;
  }
  return result;
}

// ============================================================
// CCTV 正则：匹配 CCTV 各种写法，归一化为 CCTVxx
// 参考 iptv-tool 的正则，适配我们的频道 ID 格式
// ============================================================
// 匹配：CCTV1, CCTV-1, CCTV 1, CCTV1综合, cctv-5+, CCTV5PLUS, CCTV 4K 等
const CCTV_REGEX = /^cctv[-\s]*(\d{1,2}(?:\s*(?:plus|\+|k))?)/i;

/**
 * 尝试将 CCTV 变体归一化为标准 ID
 * "CCTV-1" → "CCTV1", "cctv 5+" → "CCTV5+", "CCTV 4K" → "CCTV4K"
 */
function normalizeCCTV(name) {
  const cleaned = name.replace(/[\s\-]/g, '').toLowerCase();
  const m = cleaned.match(CCTV_REGEX);
  if (!m) return null;
  let num = m[1].replace(/\s+/g, '').toLowerCase();
  // plus → +
  num = num.replace(/plus/i, '+');
  // 标准化大写
  return 'CCTV' + num.toUpperCase();
}

// ============================================================
// 归一化
// ============================================================

/**
 * 归一化频道名
 * - 全角转半角
 * - 去空格
 * - 转小写
 * - 去 HD/4K/高清 等后缀
 */
export function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, '')
    .replace(/(高清|标清|hd|4k|8k|uhd|超清|蓝光)$/gi, '')
    .trim();
}

// ============================================================
// 索引构建
// ============================================================

/**
 * 构建别名索引
 * 对每个频道的 id / name / aliases，分别存入：
 *   原始值、归一化值、繁→简转换值
 */
export function buildAliasIndex(channelList) {
  const index = new Map();

  for (const channel of channelList) {
    const names = [
      channel.id,
      channel.name,
      ...(channel.aliases || []),
    ].filter(Boolean);

    for (const name of names) {
      // 原始
      setIfAbsent(index, name, channel);
      // 小写
      setIfAbsent(index, name.toLowerCase(), channel);
      // 归一化
      setIfAbsent(index, normalizeName(name), channel);
      // 繁→简 + 归一化
      const simplified = t2s(name);
      if (simplified !== name) {
        setIfAbsent(index, simplified, channel);
        setIfAbsent(index, normalizeName(simplified), channel);
      }
    }
  }

  return index;
}

function setIfAbsent(map, key, value) {
  if (key && !map.has(key)) map.set(key, value);
}

// ============================================================
// 频道查找
// ============================================================

/**
 * 查找频道
 *
 * @param {string} name       - 播放器传入的频道名
 * @param {Map}    aliasIndex - buildAliasIndex() 返回的索引
 * @returns {Object|null}
 */
export function findChannel(name, aliasIndex) {
  if (!name) return null;

  // 1. 精确匹配
  if (aliasIndex.has(name)) return aliasIndex.get(name);

  // 2. 归一化匹配
  const norm = normalizeName(name);
  if (norm && aliasIndex.has(norm)) return aliasIndex.get(norm);

  // 3. 繁→简转换后匹配
  const simplified = t2s(name);
  if (simplified !== name) {
    if (aliasIndex.has(simplified)) return aliasIndex.get(simplified);
    const normS = normalizeName(simplified);
    if (normS && aliasIndex.has(normS)) return aliasIndex.get(normS);
  }

  // 4. CCTV 正则匹配
  const cctvId = normalizeCCTV(name);
  if (cctvId && aliasIndex.has(cctvId)) return aliasIndex.get(cctvId);

  // 5. 去尾部字母/数字后匹配
  const stripped = norm.replace(/[a-z0-9]+$/, '').trim();
  if (stripped && stripped !== norm && aliasIndex.has(stripped)) return aliasIndex.get(stripped);

  return null;
}
