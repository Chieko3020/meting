import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const port = 3001;
const ENHANCED_API = 'http://localhost:3000'; // Enhanced API 运行在本地 3000 端口
const BASE_URL = 'https://music.chieko3020.xyz';

/** 电台节目分页：每页条数（网易云接口单次 limit，过大可能被服务端截断，需实测） */
const DJ_PROGRAM_PAGE_SIZE = Math.min(
    Math.max(1, parseInt(process.env.DJ_PROGRAM_PAGE_SIZE || '200', 10) || 200),
    500,
);
/** 最多请求页数，防止异常时死循环（默认 500 页 × 每页条数） */
const DJ_PROGRAM_MAX_PAGES = Math.max(1, parseInt(process.env.DJ_PROGRAM_MAX_PAGES || '500', 10) || 500);

app.use(cors());

// 初始化全局内存缓存
if (!global.apiCache) global.apiCache = new Map();
const cache = global.apiCache;

/**
 * 统一格式化函数：将 Enhanced API 的原始数据转换为 APlayer 格式
 */
function formatToAPlayer(item) {
    if (!item) return null;

    // 适配多种 ID 来源 (普通歌曲 vs 电台节目)
    const id = item.mainSong?.id || item.id;
    const name = item.name || item.mainSong?.name || '未知节目';
    
    // 适配作者字段 (dj.nickname vs ar[0].name)
    const artist = item.dj?.nickname || (item.ar && item.ar.map(a => a.name).join(' / ')) || (item.artists && item.artists.map(a => a.name).join(' / ')) || '未知作者';
    
    // 适配封面图 (coverUrl vs picUrl vs al.picUrl)
    const cover = item.coverUrl || item.picUrl || item.al?.picUrl || (item.mainSong?.album?.picUrl);

    if (!id) return null;

    return {
        name: name,
        artist: artist,
        url: `${BASE_URL}/?type=url&id=${id}`,
        cover: cover ? cover.replace('http://', 'https://') : `${BASE_URL}/?type=pic&id=${id}`,
        lrc: `${BASE_URL}/?type=lrc&id=${id}`
    };
}

/**
 * 带有超时和重试逻辑的通用请求函数
 */
/**
 * 分页拉取电台（播客）节目列表，直到没有更多数据
 */
async function fetchAllDjPrograms(rid) {
    const all = [];
    let offset = 0;

    for (let page = 0; page < DJ_PROGRAM_MAX_PAGES; page++) {
        const qs = new URLSearchParams({
            rid: String(rid),
            limit: String(DJ_PROGRAM_PAGE_SIZE),
            offset: String(offset),
            asc: 'false',
        });
        const data = await fetchWithRetry(`${ENHANCED_API}/dj/program?${qs.toString()}`);
        const batch = Array.isArray(data.programs) ? data.programs : [];

        all.push(...batch);

        if (batch.length === 0) break;
        if (data.more === false) break;

        if (data.more === true) {
            offset += batch.length;
            continue;
        }

        // 未返回 more 时：本页不满一页则已到末尾
        if (batch.length < DJ_PROGRAM_PAGE_SIZE) break;

        offset += batch.length;
    }

    return all;
}

async function fetchWithRetry(url, retries = 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000); // 20 秒超时
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        clearTimeout(timer);
        if (retries > 0) {
            console.warn(`[Retry] Fetch failed: ${url}, retrying...`);
            return fetchWithRetry(url, retries - 1);
        }
        throw e;
    }
}

app.get('/', async (req, res) => {
    const { type, id, keyword } = req.query;

    if (!type && !id && !keyword) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Music API 说明文档</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { max-width: 900px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; background: #f8f9fa; }
        .container { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        h1 { color: #2c3e50; margin-bottom: 24px; font-size: 28px; text-align: center; }
        h2 { color: #3498db; margin: 30px 0 15px; font-size: 20px; border-left: 4px solid #3498db; padding-left: 12px; }
        p { margin-bottom: 15px; }
        ul { margin-bottom: 20px; padding-left: 20px; }
        li { margin-bottom: 8px; }
        .notice { background: #e3f2fd; color: #0d47a1; padding: 15px; border-radius: 8px; margin-bottom: 25px; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 15px; }
        th, td { border: 1px solid #eee; padding: 12px; text-align: left; }
        th { background: #fcfcfc; color: #666; font-weight: 600; }
        .example { background: #f1f3f5; padding: 12px 16px; border-radius: 6px; margin: 8px 0; font-family: "SFMono-Regular", Consolas, monospace; color: #d63384; font-size: 14px; word-break: break-all; }
        .code-block { background: #2d3436; color: #dfe6e9; padding: 20px; border-radius: 8px; margin: 15px 0; font-family: monospace; font-size: 14px; overflow-x: auto; }
        .footer { text-align: center; margin-top: 40px; color: #999; font-size: 14px; }
        .btn-group { text-align: center; margin-top: 20px; }
        .btn { display: inline-block; padding: 10px 20px; background: #3498db; color: #fff; text-decoration: none; border-radius: 6px; margin: 0 10px; transition: background 0.2s; }
        .btn-raw { background: #e67e22; }
        .btn:hover { opacity: 0.9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎵 Music API 服务</h1>
        <div class="notice">服务地址：${BASE_URL}</div>

        <h2>接口概述</h2>
        <ul>
            <li>基于 <strong>NeteaseCloudMusicApiEnhanced</strong> 实现的网易云音乐 API, 支持跨域请求，返回 APlayer 格式并缓存。</li>
            <li>Runtime: Node.js | Framework: Express</li>
        </ul>

        <h2>核心参数</h2>
        <table>
            <tr><th>参数</th><th>必传</th><th>取值范围</th><th>说明</th></tr>
            <tr><td><strong>type</strong></td><td>是</td><td><code>lrc</code>, <code>song</code>, <code>playlist</code>, <code>radio</code>, <code>album</code>, <code>search</code>, <code>artist</code>, <code>url</code>, <code>pic</code></td><td>请求资源类型</td></tr>
            <tr><td><strong>id</strong></td><td>是*</td><td>数字</td><td>资源 ID（search 类型除外）</td></tr>
            <tr><td><strong>keyword</strong></td><td>否</td><td>字符串</td><td>搜索关键词（仅 search 类型必传）</td></tr>
        </table>
        <p><small>*注：<code>type=search</code> 时必须传入 <code>keyword</code> 而非 <code>id</code>。</small></p>

        <h2>请求示例</h2>
        <p><strong>单曲解析:</strong></p>
        <div class="example">${BASE_URL}/?type=song&id=2733777862</div>
        <p><strong>歌单解析:</strong></p>
        <div class="example">${BASE_URL}/?type=playlist&id=14424322349</div>
        <p><strong>播客解析:</strong></p>
        <div class="example">${BASE_URL}/?type=radio&id=1228381556</div>
        <p><strong>搜索歌曲:</strong></p>
        <div class="example">${BASE_URL}/?type=search&keyword=初音ミク</div>

        <h2>高级功能</h2>
        <p>如果您需要访问原生的网易云 API 接口（获取原始 JSON 数据），请使用 <code>/raw/</code> 前缀路径。</p>
        <div class="btn-group">
            <a href="/raw/" class="btn btn-raw">访问原生接口 (Raw)</a>
            <a href="https://neteasecloudmusicapienhanced.js.org/" target="_blank" class="btn">查看原生接口文档</a>
        </div>

        <div class="footer">Powered by Chieko3020 & Enhanced API</div>
    </div>
</body>
</html>
        `);
    }

    try {
        // 1. 处理资源重定向 (URL, 图片, 歌词) - 不加缓存以保证时效性
        if (type === 'url') {
            const data = await fetchWithRetry(`${ENHANCED_API}/song/url?id=${id}`);
            const url = data.data?.[0]?.url;
            return url ? res.redirect(302, url.replace('http://', 'https://')) : res.status(404).send('URL Not Found');
        }
        
        if (type === 'pic') {
            return res.redirect(302, `https://music.163.com/api/img/blur/${id}?param=300y300`);
        }

        if (type === 'lrc') {
            const data = await fetchWithRetry(`${ENHANCED_API}/lyric?id=${id}`);
            return res.type('text/plain').send(data.lrc?.lyric || '');
        }

        // 2. 处理列表请求 (Radio, Playlist, Song, Search) - 启用内存缓存
        const cacheKey = `${type}_${id || keyword}`;
        const cached = cache.get(cacheKey);
        
        // 检查缓存（1 小时有效期）
        if (cached && (Date.now() - cached.time < 3600000)) {
            console.log(`[Cache] Hit: ${cacheKey}`);
            return res.json(cached.data);
        }

        let list = [];
        try {
            if (type === 'radio') {
                list = await fetchAllDjPrograms(id);
            } else if (type === 'playlist') {
                const data = await fetchWithRetry(`${ENHANCED_API}/playlist/track/all?id=${id}`);
                list = data.songs || [];
            } else if (type === 'song') {
                const data = await fetchWithRetry(`${ENHANCED_API}/song/detail?ids=${id}`);
                list = data.songs || [];
            } else if (type === 'search') {
                const data = await fetchWithRetry(`${ENHANCED_API}/search?keywords=${encodeURIComponent(keyword)}`);
                list = data.result?.songs || [];
            } else if (type === 'album') {
                const data = await fetchWithRetry(`${ENHANCED_API}/album?id=${id}`);
                list = data.songs || [];
            } else if (type === 'artist') {
                const data = await fetchWithRetry(`${ENHANCED_API}/artists?id=${id}`);
                list = data.hotSongs || [];
            }
        } catch (fetchError) {
            // 如果请求失败但有旧缓存，则降级使用过期缓存
            if (cached) {
                console.log(`[Fallback] Using expired cache for: ${cacheKey}`);
                return res.json(cached.data);
            }
            throw fetchError;
        }

        const result = list.map(formatToAPlayer).filter(i => i !== null);
        
        if (result.length > 0) {
            cache.set(cacheKey, { time: Date.now(), data: result });
        } else if (cached) {
            // 如果没拿到新数据但有旧缓存，返回旧缓存
            return res.json(cached.data);
        }

        res.json(result);

    } catch (error) {
        console.error('Adapter Error:', error.message);
        res.status(500).json({ code: 500, message: error.message });
    }
});

app.listen(port, () => console.log(`🚀 Enhanced Adapter running on port ${port}`));

