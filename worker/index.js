/**
 * Cloudflare Worker 主入口
 * 纯边缘化 EPG 服务
 *
 * 路由:
 *   GET /              - 服务信息
 *   GET /guide.xml     - 完整 XMLTV（全量）
 *   GET /guide.xml.gz  - gzip 压缩版本
 *   GET /guide_mainland.xml    - 大陆频道
 *   GET /guide_hktw.xml        - 港台频道
 *   GET /channels.json - 频道列表 + 别名
 *   GET /match?name=xx - 测试频道名匹配
 *   GET /status        - 服务状态
 *
 * 环境变量（Cloudflare Secrets）:
 *   R2_BUCKET          - R2 Bucket 绑定名称（wrangler.jsonc 中配置）
 *   ADMIN_TOKEN        - 管理 API 的认证 Token（可选）
 */

import { buildAliasIndex, findChannel, normalizeName } from './matcher.js';
import { ADMIN_HTML } from './admin.js';

// R2 对象路径前缀
const R2_PREFIX = 'xmltv/';

// 缓存配置（秒）
const CACHE_TTL = {
  guide: 3600,      // guide.xml 缓存 1 小时
  channels: 86400,  // channels.json 缓存 24 小时
  match: 300,       // match API 缓存 5 分钟
};

// KV 键名
const KV_CHANNELS_KEY = 'channels_index';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 路由分发
      if (path === '/' || path === '') {
        // 浏览器访问返回管理页，API 调用（curl 等）返回 JSON
        const accept = request.headers.get('Accept') || '';
        if (accept.includes('text/html')) {
          return new Response(ADMIN_HTML, {
            headers: { 'Content-Type': 'text/html;charset=utf-8' },
          });
        }
        return handleInfo(request, env, corsHeaders);
      }

      if (path === '/status') {
        return handleStatus(request, env, corsHeaders);
      }

      if (path === '/channels.json') {
        return handleChannels(request, env, ctx, corsHeaders);
      }

      if (path === '/match') {
        return handleMatch(request, env, ctx, corsHeaders);
      }

      // XMLTV 文件服务
      const xmltvFiles = [
        '/guide.xml',
        '/guide.xml.gz',
        '/guide_mainland.xml',
        '/guide_mainland.xml.gz',
        '/guide_hktw.xml',
        '/guide_hktw.xml.gz',
      ];

      if (xmltvFiles.includes(path)) {
        return handleXmltv(request, env, ctx, path, corsHeaders);
      }

      return new Response('Not Found', {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// ============================================================
// 路由处理函数
// ============================================================

/**
 * GET / - 服务信息
 */
async function handleInfo(request, env, corsHeaders) {
  const info = {
    name: 'LaobaiEPG',
    description: 'IPTV EPG 管理系统 - 纯边缘化实现',
    version: '1.0.0',
    endpoints: {
      guide: '/guide.xml',
      guide_gz: '/guide.xml.gz',
      guide_mainland: '/guide_mainland.xml',
      guide_hktw: '/guide_hktw.xml',
      channels: '/channels.json',
      match: '/match?name=浙江卫视',
      status: '/status',
    },
    usage: {
      iptv_player: 'EPG URL: https://your-worker.workers.dev/guide.xml',
      note: '支持频道名别名匹配，"浙江卫视4K" 会自动匹配到 "浙江卫视" 的节目单',
    },
  };

  return new Response(JSON.stringify(info, null, 2), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json;charset=utf-8',
    },
  });
}

/**
 * GET /status - 服务状态
 */
async function handleStatus(request, env, corsHeaders) {
  const status = { ok: true, timestamp: new Date().toISOString() };

  // 检查 R2 中最新的 guide.xml
  try {
    if (env.EPG_BUCKET) {
      const obj = await env.EPG_BUCKET.head(`${R2_PREFIX}guide.xml`);
      if (obj) {
        status.guide_xml = {
          size: obj.size,
          last_modified: obj.uploaded?.toISOString(),
        };
      }
    }
  } catch (e) {
    status.r2_error = e.message;
  }

  return new Response(JSON.stringify(status, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * GET /channels.json - 频道列表
 */
async function handleChannels(request, env, ctx, corsHeaders) {
  // 先从 KV 缓存读取
  let data = null;
  if (env.EPG_KV) {
    data = await env.EPG_KV.get(KV_CHANNELS_KEY, { type: 'text' });
  }

  // KV 没有时从 R2 读取
  if (!data && env.EPG_BUCKET) {
    const obj = await env.EPG_BUCKET.get(`${R2_PREFIX}channels.json`);
    if (obj) {
      data = await obj.text();
      // 写入 KV 缓存（24小时）
      if (env.EPG_KV) {
        ctx.waitUntil(
          env.EPG_KV.put(KV_CHANNELS_KEY, data, { expirationTtl: CACHE_TTL.channels })
        );
      }
    }
  }

  if (!data) {
    return new Response(JSON.stringify({ error: 'channels.json 尚未生成，请等待 GitHub Actions 执行抓取' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(data, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL.channels}`,
    },
  });
}

/**
 * GET /match?name=xx - 测试频道名匹配
 * 返回匹配到的频道信息，用于调试
 */
async function handleMatch(request, env, ctx, corsHeaders) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || '';

  if (!name) {
    return new Response(JSON.stringify({ error: '请提供 name 参数，例如 /match?name=浙江卫视4K' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 获取频道列表
  const channels = await getChannelList(env, ctx);
  if (!channels) {
    return new Response(JSON.stringify({ error: '频道列表未就绪' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const index = buildAliasIndex(channels);
  const matched = findChannel(name, index);

  const result = {
    query: name,
    normalized: normalizeName(name),
    matched: matched
      ? { id: matched.id, name: matched.name, group: matched.group }
      : null,
    success: !!matched,
  };

  return new Response(JSON.stringify(result, null, 2), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL.match}`,
    },
  });
}

/**
 * GET /guide.xml 等 - 提供 XMLTV 文件
 */
async function handleXmltv(request, env, ctx, path, corsHeaders) {
  const filename = path.replace('/', ''); // "guide.xml" 或 "guide.xml.gz"
  const isGzip = filename.endsWith('.gz');

  // 使用 Cloudflare Cache API 缓存
  const cacheKey = new Request(request.url, request);
  const cache = caches.default;
  let cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return addCorsHeaders(cachedResponse, corsHeaders);
  }

  // 从 R2 读取
  if (!env.EPG_BUCKET) {
    return new Response('R2 Bucket 未配置', {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }

  const r2Key = `${R2_PREFIX}${filename}`;
  const obj = await env.EPG_BUCKET.get(r2Key);

  if (!obj) {
    return new Response(
      `${filename} 尚未生成。\n\n请等待 GitHub Actions 的抓取任务完成，或手动触发 workflow_dispatch。\n\n提示：首次部署后需等待约 10-20 分钟完成首次抓取。`,
      {
        status: 503,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain;charset=utf-8',
          'Retry-After': '3600',
        },
      }
    );
  }

  // 构建响应
  const headers = {
    ...corsHeaders,
    'Content-Type': isGzip ? 'application/gzip' : 'text/xml;charset=utf-8',
    'Cache-Control': `public, max-age=${CACHE_TTL.guide}`,
    'Last-Modified': obj.uploaded?.toUTCString() || new Date().toUTCString(),
    'ETag': obj.etag || '',
  };

  if (isGzip) {
    headers['Content-Encoding'] = 'identity'; // 不让浏览器自动解压
  } else {
    // 纯 XML：告知客户端支持 gzip 版本
    headers['Vary'] = 'Accept-Encoding';
  }

  const response = new Response(obj.body, { headers });

  // 异步写入 Cache（不阻塞响应）
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 获取频道列表（优先 KV，其次 R2）
 */
async function getChannelList(env, ctx) {
  let data = null;

  if (env.EPG_KV) {
    data = await env.EPG_KV.get(KV_CHANNELS_KEY, { type: 'text' });
  }

  if (!data && env.EPG_BUCKET) {
    const obj = await env.EPG_BUCKET.get(`${R2_PREFIX}channels.json`);
    if (obj) {
      data = await obj.text();
      if (env.EPG_KV) {
        ctx.waitUntil(
          env.EPG_KV.put(KV_CHANNELS_KEY, data, { expirationTtl: CACHE_TTL.channels })
        );
      }
    }
  }

  return data ? JSON.parse(data) : null;
}

/**
 * 为已有 Response 添加 CORS 头
 */
function addCorsHeaders(response, corsHeaders) {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    newHeaders.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });
}
