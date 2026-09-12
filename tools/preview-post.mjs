#!/usr/bin/env node
/**
 * 把 source/_drafts 下的 Markdown 草稿渲染成一份单文件 HTML 预览，
 * 配图以内联 SVG 的形式嵌入（不依赖相对路径，双击即可看）。
 *
 * 用法：node tools/preview-post.mjs "随机图片API开发日记"
 * 产物：docs/preview/<标题>-文章预览.html
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const name = process.argv[2] || '随机图片API开发日记';
const SRC = path.join(ROOT, 'source/_drafts', `${name}.md`);
if (!existsSync(SRC)) {
  console.error(`找不到草稿：${SRC}`);
  process.exit(1);
}

/* 图注映射 */
const CAPTIONS = {
  'cover.svg': '封面：随机图片 API 项目',
  'overview.svg': '图 1　功能总览：三入口、双模式、后台与统计',
  'flow.svg': '图 2　一次 GET /pc.php 调用的完整链路',
  'timeline.svg': '图 3　八次迭代与关键节点',
  'trend.svg': '图 4　最近 30 天真实调用趋势（数据来自站点统计）',
};

/** 给内联 SVG 的 id 加前缀，避免多张图之间 defs 冲突 */
function isolateSvg(svg, prefix) {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  let out = svg;
  for (const id of ids) {
    out = out.replaceAll(`id="${id}"`, `id="${prefix}-${id}"`);
    out = out.replaceAll(`url(#${id})`, `url(#${prefix}-${id})`);
  }
  return out
    .replace(/^<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
    .replace(/\sheight="[^"]*"/, '')
    .replace('<svg', '<svg style="width:100%;height:auto;display:block"');
}

/** 把 ![](/img/posts/img-api/x.svg) 换成内联 SVG + 图注 */
function inlineImages(html) {
  return html.replace(
    /<img src="\/img\/posts\/img-api\/([^"]+)"[^>]*>/g,
    (m, file) => {
      const p = path.join(ROOT, 'source/img/posts/img-api', file);
      if (!existsSync(p)) return m;
      const svg = isolateSvg(readFileSync(p, 'utf8').trim(), file.replace(/\W/g, ''));
      const cap = CAPTIONS[file]
        ? `<figcaption>${CAPTIONS[file]}</figcaption>`
        : '';
      return `<figure class="fig">${svg}${cap}</figure>`;
    }
  );
}

/* ---------- 解析 ---------- */
const raw = readFileSync(SRC, 'utf8');
const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
const front = {};
let body = raw;
if (fmMatch) {
  body = raw.slice(fmMatch[0].length);
  fmMatch[1].split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(':');
    if (i > 0) front[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
}
body = inlineImages(marked.parse(body));

/* 封面：本地 SVG 则内联展示 */
let coverBlock = '';
if (front.cover && front.cover.endsWith('.svg')) {
  const cp = path.join(ROOT, 'source', front.cover.replace(/^\//, ''));
  if (existsSync(cp)) {
    const svg = isolateSvg(readFileSync(cp, 'utf8').trim(), 'cover');
    coverBlock = `<div class="coverbox">${svg}</div>`;
  }
}

const tags = (front.tags || '').replace(/[[\]]/g, '').split(',').filter(Boolean);
const cats = (front.categories || '').replace(/[[\]]/g, '').split(',').filter(Boolean);
const chip = (t, cls = '') => `<span class="chip ${cls}">${t.trim()}</span>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${front.title || name} — 文章预览</title>
<style>
  :root{
    --ink:#1f2937; --ink2:#4b5563; --ink3:#6b7280; --line:#e8eaef;
    --brand:#6366f1; --brand-soft:#eef2ff; --bg:#f3f4f8; --card:#fff;
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--bg); color:var(--ink);
    font:15.5px/1.85 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif;
  }
  .banner{background:#fff;border-bottom:1px solid var(--line);padding:26px 0 22px}
  .wrap{max-width:900px;margin:0 auto;padding:0 26px}
  .crumb{font-size:12.5px;color:var(--ink3);margin-bottom:14px}
  .crumb b{color:var(--brand)}
  h1.post{font-size:29px;line-height:1.4;margin:0 0 14px;letter-spacing:-.2px}
  .meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12.5px;color:var(--ink3)}
  .chip{display:inline-block;padding:3px 11px;border-radius:20px;background:#f1f2f6;color:var(--ink2);font-size:12px}
  .chip.tag{background:var(--brand-soft);color:#4f46e5}
  .coverbox{max-width:900px;margin:24px auto 0;border-radius:14px;overflow:hidden;
    box-shadow:0 6px 22px rgba(17,24,39,.14)}
  .article{background:var(--card);border-radius:14px;padding:44px 52px 52px;margin:22px auto 60px;
    box-shadow:0 2px 14px rgba(17,24,39,.05);max-width:900px}
  .article h2{font-size:21px;margin:44px 0 16px;padding-left:13px;border-left:4px solid var(--brand);line-height:1.5}
  .article h2:first-child{margin-top:0}
  .article h3{font-size:17px;margin:30px 0 12px;color:#374151}
  .article p{margin:0 0 17px;color:#374151}
  .article a{color:var(--brand);text-decoration:none;border-bottom:1px solid rgba(99,102,241,.35)}
  .article a:hover{border-bottom-color:var(--brand)}
  .article strong{color:#111827}
  .article ul{color:#374151;padding-left:22px}
  .article li{margin:6px 0}
  .article code{background:#f1f2f6;padding:2px 6px;border-radius:5px;font-size:13px;
    font-family:ui-monospace,Consolas,"Courier New",monospace;color:#be185d}
  .article pre{background:#1e293b;color:#e2e8f0;padding:18px 20px;border-radius:11px;overflow:auto;margin:0 0 20px}
  .article pre code{background:none;color:inherit;padding:0;font-size:13px;line-height:1.7}
  .article table{width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px}
  .article th,.article td{border:1px solid var(--line);padding:9px 14px;text-align:left}
  .article th{background:#f8f9fc;font-weight:600;color:var(--ink)}
  .fig{margin:26px 0;padding:16px;background:#fbfbfd;border:1px solid var(--line);border-radius:12px}
  .fig figcaption{text-align:center;font-size:12.5px;color:var(--ink3);margin-top:11px}
  .foot{text-align:center;font-size:12.5px;color:#9ca3af;padding-bottom:50px}
  @media(max-width:680px){.article{padding:28px 20px}.wrap{padding:0 16px}h1.post{font-size:22px}}
</style>
</head>
<body>
<div class="banner">
  <div class="wrap">
    <div class="crumb">开发日记 · 文章预览（<b>草稿，未发布</b>）</div>
    <h1 class="post">${front.title || name}</h1>
    <div class="meta">
      <span>📅 ${front.date || ''}</span>
      <span>·</span>
      ${cats.map((c) => chip(c)).join('')}
      ${tags.map((t) => chip(t, 'tag')).join('')}
      <span>·</span><span>封面：${front.cover || '（无）'}</span>
    </div>
  </div>
</div>
${coverBlock}
<div class="article">${body}</div>
<div class="foot">本页为本地预览，仅用于确认排版与配图效果</div>
</body>
</html>`;

const outDir = path.join(ROOT, 'docs/preview');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${name}-文章预览.html`);
writeFileSync(outFile, html, 'utf8');
console.log(`✓ ${path.relative(ROOT, outFile)}  (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
