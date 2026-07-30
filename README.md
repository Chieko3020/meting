# Music API Adapter — Enhanced API 适配器

- 代理本地 Enhanced API（:3000），将原始数据转换为 APlayer 兼容格式
- 单端点 `GET /`，支持 `?server=&type=&id=` 查询参数和音乐关键词搜索
- 内存缓存减少重复请求，支持网易云 VIP Cookie 鉴权
- 无参数访问时返回 HTML 文档页面，含 API 说明和示例
- 开发环境：Node.js 22, Express 4

## 项目简介

博客的音乐播放器（APlayer）需要调用音乐 API 获取歌曲信息。Enhanced API（本地 :3000）负责从各平台获取原始数据，本服务作为中间适配层，格式化响应为 APlayer 所期望的 JSON 结构，并加入缓存和 Cookie 鉴权。

## 技术栈

| 组件 | 选型 |
|------|------|
| 运行时 | Node.js 22 |
| Web 框架 | Express 4 |
| HTTP 客户端 | node-fetch |

## 项目结构

```
meting/
├── server.js          # Express 服务入口
├── package.json
├── .env               # NETEASE_COOKIE（本地，不提交）
└── .env.example       # 配置模板
```

## API

```
GET /?server=netease&type=song&id=xxx
  → { "title": "...", "artist": "...", "url": "...", ... }

GET /?keyword=关键词
  → [{ "title": "...", ... }, ...]
```

无参数直接访问返回 HTML 文档页面。

## 配置

| 环境变量 | 说明 |
|----------|------|
| `NETEASE_COOKIE` | 网易云 VIP Cookie（`MUSIC_U=xxx`） |
| `DJ_PROGRAM_PAGE_SIZE` | 电台节目每页条数（默认 200） |
| `DJ_PROGRAM_MAX_PAGES` | 电台节目最大页数（默认 500） |

## 编译和运行

```bash
npm install
node server.js
# Listening on port 3001
```
