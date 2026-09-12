#!/usr/bin/env node
/**
 * 生成《开发日记之随机图片API》一文的配图（纯 SVG，零依赖）。
 *
 * 用法：node tools/gen-img-api-art.mjs
 * 产物：source/img/posts/img-api/*.svg
 *
 * 说明：配色自带浅色底，明暗主题下均可阅读（SVG 作为 <img> 引用时不继承外部 CSS）。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 文章 ID：封面按站点既有约定落到 source/img/covers/ */
const POST_ID = '5298729416';
const ART_DIR = path.resolve(__dirname, '../source/img/posts/img-api');
const COVER_DIR = path.resolve(__dirname, '../source/img/covers');
mkdirSync(ART_DIR, { recursive: true });
mkdirSync(COVER_DIR, { recursive: true });

/* ---------- 设计变量 ---------- */
const C = {
  ink: '#0f172a',
  ink2: '#334155',
  ink3: '#64748b',
  line: '#e2e8f0',
  card: '#ffffff',
  bg: '#f8fafc',
  indigo: '#6366f1',
  indigoSoft: '#eef2ff',
  cyan: '#0891b2',
  cyanSoft: '#ecfeff',
  amber: '#d97706',
  amberSoft: '#fffbeb',
  rose: '#e11d48',
  roseSoft: '#fff1f2',
  emerald: '#059669',
  emeraldSoft: '#ecfdf5',
};
const FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC","Hiragino Sans GB",sans-serif';
const MONO = 'ui-monospace,SFMono-Regular,Consolas,"Courier New",monospace';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
<defs>
  <linearGradient id="gIndigo" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/>
  </linearGradient>
  <linearGradient id="gCyan" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#0891b2"/>
  </linearGradient>
  <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#6366f1" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="#6366f1" stop-opacity="0.02"/>
  </linearGradient>
  <filter id="sh" x="-20%" y="-20%" width="140%" height="150%">
    <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.07"/>
  </filter>
  <style>
    .t{font-family:${FONT}}
    .m{font-family:${MONO}}
    .h1{font-size:26px;font-weight:700;fill:${C.ink}}
    .h2{font-size:17px;font-weight:700;fill:${C.ink}}
    .b{font-size:13px;fill:${C.ink3}}
    .s{font-size:11.5px;fill:${C.ink3}}
    .k{font-size:12px;font-weight:600}
  </style>
</defs>
<rect width="${w}" height="${h}" fill="${C.bg}"/>
${body}
</svg>
`;

/* 圆角卡片 + 顶部色条 */
const card = (x, y, w, h, accent, tint) => `
<g filter="url(#sh)">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.card}" stroke="${C.line}"/>
  <path d="M${x} ${y + 14} a14 14 0 0 1 14 -14 h${w - 28} a14 14 0 0 1 14 14 v4 h${-w} z" fill="${tint}"/>
  <rect x="${x}" y="${y + 15}" width="${w}" height="3" fill="${accent}" opacity="0.85"/>
</g>`;

/* 图标：用小圆 + 简单图形代替 emoji，避免字体依赖 */
const ico = (cx, cy, accent, tint, kind) => {
  let inner = '';
  if (kind === 'grid')
    inner = `<rect x="${cx - 8}" y="${cy - 8}" width="7" height="7" rx="2" fill="${accent}"/><rect x="${cx + 1}" y="${cy - 8}" width="7" height="7" rx="2" fill="${accent}" opacity=".55"/><rect x="${cx - 8}" y="${cy + 1}" width="7" height="7" rx="2" fill="${accent}" opacity=".55"/><rect x="${cx + 1}" y="${cy + 1}" width="7" height="7" rx="2" fill="${accent}"/>`;
  else if (kind === 'bolt')
    inner = `<path d="M${cx + 2} ${cy - 9} L${cx - 6} ${cy + 1} h5 l-1 8 L${cx + 6} ${cy - 1} h-5 z" fill="${accent}"/>`;
  else if (kind === 'shield')
    inner = `<path d="M${cx} ${cy - 9} l8 3 v6 c0 5 -3.5 8 -8 9 c-4.5 -1 -8 -4 -8 -9 v-6 z" fill="none" stroke="${accent}" stroke-width="2"/><path d="M${cx - 3.5} ${cy} l2.5 2.5 l4.5 -4.5" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>`;
  else if (kind === 'chart')
    inner = `<rect x="${cx - 9}" y="${cy + 1}" width="5" height="8" rx="1.5" fill="${accent}" opacity=".5"/><rect x="${cx - 2}" y="${cy - 4}" width="5" height="13" rx="1.5" fill="${accent}"/><rect x="${cx + 5}" y="${cy - 8}" width="5" height="17" rx="1.5" fill="${accent}" opacity=".5"/>`;
  else if (kind === 'db')
    inner = `<ellipse cx="${cx}" cy="${cy - 6}" rx="8" ry="3.2" fill="none" stroke="${accent}" stroke-width="2"/><path d="M${cx - 8} ${cy - 6} v12 a8 3.2 0 0 0 16 0 v-12" fill="none" stroke="${accent}" stroke-width="2"/>`;
  else if (kind === 'box')
    inner = `<path d="M${cx - 8} ${cy - 5} l8 -4 l8 4 v10 l-8 4 l-8 -4 z" fill="none" stroke="${accent}" stroke-width="2" stroke-linejoin="round"/><path d="M${cx - 8} ${cy - 5} l8 4 l8 -4 M${cx} ${cy - 1} v10" fill="none" stroke="${accent}" stroke-width="1.6"/>`;
  else if (kind === 'sync')
    inner = `<path d="M${cx + 8} ${cy - 3} a8 8 0 0 0 -14 -4 M${cx - 8} ${cy + 3} a8 8 0 0 0 14 4" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round"/><path d="M${cx - 7} ${cy - 8} l1 5 l5 -1 M${cx + 7} ${cy + 8} l-1 -5 l-5 1" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>`;
  else if (kind === 'gear')
    inner = `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="${accent}" stroke-width="2"/><path d="M${cx} ${cy - 9} v3 M${cx} ${cy + 6} v3 M${cx - 9} ${cy} h3 M${cx + 6} ${cy} h3 M${cx - 6.4} ${cy - 6.4} l2.1 2.1 M${cx + 4.3} ${cy + 4.3} l2.1 2.1 M${cx + 6.4} ${cy - 6.4} l-2.1 2.1 M${cx - 4.3} ${cy + 4.3} l-2.1 2.1" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>`;
  else if (kind === 'hash')
    inner = `<path d="M${cx - 4} ${cy - 8} l-2 16 M${cx + 5} ${cy - 8} l-2 16 M${cx - 9} ${cy - 3} h16 M${cx - 10} ${cy + 3} h16" stroke="${accent}" stroke-width="2" stroke-linecap="round" fill="none"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="17" fill="${tint}"/>${inner}`;
};

/* =========================================================
   1. 功能总览
   ========================================================= */
function overview() {
  const W = 1200;
  const PAD = 40;
  const cols = 3;
  const gap = 22;
  const cw = Math.floor((W - PAD * 2 - gap * (cols - 1)) / cols);
  const ch = 138;
  const features = [
    ['grid', C.indigo, C.indigoSoft, '三入口自适应', 'api.php 自动识别设备，pc.php / pe.php 定点出图，一套图库服务三种场景'],
    ['bolt', C.cyan, C.cyanSoft, '双输出模式', '302 跳转省流量，代理模式由服务器代转、隐藏真实图片地址'],
    ['box', C.amber, C.amberSoft, '缓存与 JSON', 'cache=3600 控制重复返回间隔，?format=json 直接拿图片地址'],
    ['chart', C.emerald, C.emeraldSoft, '调用统计', '按天落库，PC / 移动端分渠道统计，首页 Chart.js 趋势图'],
    ['gear', C.indigo, C.indigoSoft, '管理后台', '图片增删与批量导入、操作日志、网站信息自定义、一键环境自检'],
    ['sync', C.cyan, C.cyanSoft, '在线更新', '基于 GitHub Releases，更新前自动备份，失败自动回滚'],
    ['shield', C.rose, C.roseSoft, '安全防护', 'SSRF 防护、CSRF Token、登录锁定、频率限制、XSS 转义'],
    ['db', C.emerald, C.emeraldSoft, 'SQLite 单文件', '零配置存储，备份即拷一个文件，可选 APCu 内存加速'],
    ['box', C.amber, C.amberSoft, '一键部署', 'Docker 镜像开箱即用，附 Nginx 敏感目录防护示例，MIT 开源'],
  ];
  const rows = Math.ceil(features.length / cols);
  const headH = 112;
  const H = headH + rows * (ch + gap) + PAD;

  let body = `
  <text x="${PAD}" y="52" class="t h1">魔法师随机图片 API · 功能总览</text>
  <text x="${PAD}" y="80" class="t b">v3.2.3.5 ｜ 142 次提交 ｜ PHP + SQLite ｜ 累计调用 12.5 万+</text>
  <rect x="${PAD}" y="94" width="60" height="4" rx="2" fill="url(#gIndigo)"/>`;

  features.forEach((f, i) => {
    const [kind, accent, tint, title, desc] = f;
    const cx0 = PAD + (i % cols) * (cw + gap);
    const cy0 = headH + Math.floor(i / cols) * (ch + gap);
    body += card(cx0, cy0, cw, ch, accent, tint);
    body += ico(cx0 + 38, cy0 + 44, accent, tint, kind);
    body += `<text x="${cx0 + 66}" y="${cy0 + 42}" class="t h2">${esc(title)}</text>`;
    // 描述自动折行（按字符数粗排）
    const max = 19;
    const lines = [];
    let cur = '';
    for (const chx of desc) {
      cur += chx;
      if (cur.length >= max) {
        lines.push(cur);
        cur = '';
      }
    }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((ln, li) => {
      body += `<text x="${cx0 + 22}" y="${cy0 + 82 + li * 20}" class="t b">${esc(ln)}</text>`;
    });
  });

  return svg(W, H, body);
}

/* =========================================================
   2. 一次请求的旅程
   ========================================================= */
function flow() {
  const W = 1200;
  const H = 880;
  const PAD = 40;
  const boxW = 330;
  const midX = W / 2;

  let body = `
  <text x="${PAD}" y="52" class="t h1">一次 API 调用的完整链路</text>
  <text x="${PAD}" y="80" class="t b">以 GET /pc.php 为例：从命中入口到写入统计数据，全程约十余行核心逻辑</text>
  <rect x="${PAD}" y="94" width="60" height="4" rx="2" fill="url(#gCyan)"/>`;

  const node = (x, y, w, h, accent, tint, title, sub, mono) => {
    let s = `<g filter="url(#sh)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.card}" stroke="${C.line}"/></g>
    <rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${accent}"/>
    <text x="${x + 20}" y="${y + 28}" class="t h2">${esc(title)}</text>`;
    if (sub) s += `<text x="${x + 20}" y="${y + 52}" class="t b">${esc(sub)}</text>`;
    if (mono)
      s += `<text x="${x + 20}" y="${y + (sub ? 74 : 52)}" class="m s">${esc(mono)}</text>`;
    return s;
  };

  const arrow = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 8}" stroke="${C.ink3}" stroke-width="1.6" marker-end="url(#ar)"/>
  ${label ? `<rect x="${x + 8}" y="${(y1 + y2) / 2 - 11}" width="${label.length * 8.2 + 14}" height="22" rx="11" fill="${C.card}" stroke="${C.line}"/><text x="${x + 15}" y="${(y1 + y2) / 2 + 4}" class="m s">${esc(label)}</text>` : ''}`;

  let y = 122;
  const steps = [
    [C.indigo, C.indigoSoft, '① 入口分发', '按访问的 PHP 文件决定取图渠道', 'api.php=UA 分发｜pc.php / pe.php 定点'],
    [C.cyan, C.cyanSoft, '② 频率限制', '按 IP 双维度限流，超限直接拒绝', 'lib/ratelimit.php：429 Too Many'],
    [C.amber, C.amberSoft, '③ 缓存判定', '按 cache 参数切时间片，命中即复用', '?cache=3600 → 1 小时内同图'],
    [C.emerald, C.emeraldSoft, '④ 随机取图', 'SQLite 中按渠道随机取一条记录', 'ORDER BY RANDOM() LIMIT 1'],
    [C.rose, C.roseSoft, '⑤ 存在性校验', '图片不可用则换一条重试', 'SSRF 防护 + 魔数校验'],
  ];
  steps.forEach((s, i) => {
    body += node(PAD, y, boxW, 92, s[0], s[1], s[2], s[3], s[4]);
    if (i < steps.length - 1) body += arrow(PAD + boxW / 2, y + 92, y + 118);
    y += 118;
  });

  // 分支
  const bx = PAD + boxW + 60;
  body += `<line x1="${PAD + boxW}" y1="${y - 118 + 46}" x2="${bx - 12}" y2="${y - 118 + 46}" stroke="${C.ink3}" stroke-width="1.6" marker-end="url(#ar)"/>`;
  body += `<rect x="${PAD + boxW + 10}" y="${y - 118 + 24}" width="96" height="22" rx="11" fill="${C.card}" stroke="${C.line}"/><text x="${PAD + boxW + 20}" y="${y - 118 + 39}" class="m s">按模式分支</text>`;

  const branches = [
    [C.indigo, C.indigoSoft, '302 跳转模式（默认）', '返回 Location 指向真实图片地址，浏览器自行去图床取图', 'HTTP/1.1 302 Found + Location: https://free-img.mofashi.ltd/...'],
    [C.cyan, C.cyanSoft, '代理转发模式', '服务器 cURL 拉取图片再转发，客户端拿不到原始地址', 'Content-Type: image/* + 流式输出'],
    [C.amber, C.amberSoft, 'JSON 输出', '?format=json 时返回结构化地址，便于程序二次处理', '{"success":true,"type":"pc","url":"https://..."}'],
  ];
  branches.forEach((b, i) => {
    const by = 122 + i * 108;
    body += node(bx, by, W - bx - PAD, 92, b[0], b[1], b[2], b[3], b[4]);
    // 引流线
    body += `<path d="M${bx - 12} ${y - 118 + 46} H${bx - 34} V${by + 46} H${bx - 12}" fill="none" stroke="${C.ink3}" stroke-width="1.4" marker-end="url(#ar)"/>`;
  });

  // 统计落库
  const sy = y + 12;
  body += node(PAD, sy, W - PAD * 2, 96, C.emerald, C.emeraldSoft, '⑥ 统计落库', '命中渠道计数器自增，按天聚合，首页趋势图读的正是这份数据', 'data/stats 日表 + 可选 APCu 内存缓存，避免每次调用都写盘');
  body += `<path d="M${midX} ${sy - 12} V${sy}" fill="none" stroke="${C.ink3}" stroke-width="1.6" marker-end="url(#ar)"/>`;
  body += arrow(PAD + boxW / 2, y - 118 + 92, sy);

  body += `<defs><marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 z" fill="${C.ink3}"/></marker></defs>`;
  return svg(W, H, body);
}

/* =========================================================
   3. 版本时间线
   ========================================================= */
function timeline() {
  const W = 1200;
  const PAD = 46;
  const items = [
    ['06-14', 'v2.0 起步 · 第一个能用的版本', '一个 api.php 从 SQLite 随机取 URL 并 302 出图\n当天上线，验证了「图库自持」这条路走得通', C.indigo, C.indigoSoft],
    ['06-17', 'v3.0.x 补上管理后台', '图片增删与批量导入、操作日志、登录页\n修掉模态框关闭无响应等交互问题', C.cyan, C.cyanSoft],
    ['06-18', 'v3.1.0 转向长期运维', 'GitHub Token 配置、备份与删除管理\n版本检查加频率限制，避免浪费 API 配额', C.amber, C.amberSoft],
    ['08-04', 'v3.1.1 第一次安全清算', '一轮系统性排查，修复多项注入与越权问题\n从此每次发版前都会过一遍安全检查清单', C.rose, C.roseSoft],
    ['08-21', 'v3.1.4 / 3.1.5 更新与性能', '在线更新加固：目录剥离、并发锁、路径穿越检测\n随机取图与分页重写，去掉全表扫描', C.emerald, C.emeraldSoft],
    ['08-24', 'v3.1.6 工程化与开源', 'Docker 一键部署 + Nginx 敏感目录防护示例\n采用 MIT 协议，发行包剥离部署文件', C.indigo, C.indigoSoft],
    ['08-25', 'v3.1.7 / 3.1.8 双模式与审查', '访问模式后台可切换，修掉 rand 参数打穿 CDN 缓存\n按代码审查意见集中修复，弹窗统一为自定义模态框', C.cyan, C.cyanSoft],
    ['09-12', 'v3.2.3.5 当前版本', 'config.php 收敛为纯配置入口，业务拆进 lib/ 各模块\n加载器与按钮微交互细节打磨', C.emerald, C.emeraldSoft],
  ];
  const cardH = 88;
  const stepY = 108;
  const headH = 150;
  const H = headH + items.length * stepY + 46;
  const lineX = 148;
  const cardX = 208;
  const cardW = W - cardX - PAD;

  let body = `
  <text x="${PAD}" y="52" class="t h1">八次迭代，一条主线</text>
  <text x="${PAD}" y="80" class="t b">2026 年 6 月立项，从「能出图」到「能长期跑」——每一次发版背后都有一次真实的翻车</text>
  <rect x="${PAD}" y="94" width="60" height="4" rx="2" fill="url(#gIndigo)"/>
  <line x1="${lineX}" y1="${headH - 26}" x2="${lineX}" y2="${headH + items.length * stepY - 46}" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>`;

  items.forEach((it, i) => {
    const y = headH + i * stepY;
    const [date, title, desc, accent] = it;
    body += `<text x="${lineX - 28}" y="${y + 33}" class="m s" text-anchor="end">${esc(date)}</text>`;
    body += `<circle cx="${lineX}" cy="${y + 28}" r="9" fill="${C.card}" stroke="${accent}" stroke-width="3"/>`;
    body += `<circle cx="${lineX}" cy="${y + 28}" r="3.5" fill="${accent}"/>`;
    body += `<line x1="${lineX + 9}" y1="${y + 28}" x2="${cardX}" y2="${y + 28}" stroke="${accent}" stroke-width="1.4" stroke-dasharray="3 3"/>`;
    body += `<g filter="url(#sh)"><rect x="${cardX}" y="${y}" width="${cardW}" height="${cardH}" rx="12" fill="${C.card}" stroke="${C.line}"/></g>`;
    body += `<rect x="${cardX}" y="${y}" width="4" height="${cardH}" rx="2" fill="${accent}"/>`;
    body += `<text x="${cardX + 24}" y="${y + 32}" class="t h2">${esc(title)}</text>`;
    desc.split('\n').forEach((ln, li) => {
      body += `<text x="${cardX + 24}" y="${y + 58 + li * 20}" class="t b">${esc(ln)}</text>`;
    });
  });

  body += `<text x="${PAD}" y="${H - 16}" class="t s">依据仓库 git log 整理（共 142 次提交，含合并与维护类提交）。</text>`;
  return svg(W, H, body);
}

/* =========================================================
   4. 真实调用趋势（来自站点首页注入的 STATS）
   ========================================================= */
function trend() {
  const data = [
    ['08-14', 377], ['08-15', 995], ['08-16', 648], ['08-17', 539], ['08-18', 88],
    ['08-19', 862], ['08-20', 94], ['08-21', 867], ['08-22', 411], ['08-23', 1283],
    ['08-24', 159], ['08-25', 144], ['08-26', 2660], ['08-27', 913], ['08-28', 388],
    ['08-29', 962], ['08-30', 694], ['08-31', 186], ['09-01', 473], ['09-02', 120],
    ['09-03', 130], ['09-04', 220], ['09-05', 98], ['09-06', 99], ['09-07', 169],
    ['09-08', 91], ['09-09', 107], ['09-10', 95], ['09-11', 61], ['09-12', 98],
  ];
  const W = 1200;
  const H = 560;
  const PADL = 78;
  const PADR = 46;
  const PADT = 152;
  const PADB = 92;
  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;
  const maxV = 2800;
  const x = (i) => PADL + (plotW / (data.length - 1)) * i;
  const y = (v) => PADT + plotH - (v / maxV) * plotH;

  let body = `
  <text x="${PADL - 38}" y="52" class="t h1">最近 30 天调用趋势</text>
  <text x="${PADL - 38}" y="80" class="t b">2026-08-14 ~ 09-12 ｜ 累计 12.5 万次调用 ｜ 单日峰值 2,660 次</text>
  <rect x="${PADL - 38}" y="94" width="60" height="4" rx="2" fill="url(#gCyan)"/>`;

  // 网格 + Y 轴
  for (let g = 0; g <= 4; g++) {
    const v = (maxV / 4) * g;
    const gy = y(v);
    body += `<line x1="${PADL}" y1="${gy}" x2="${W - PADR}" y2="${gy}" stroke="${C.line}" stroke-width="1" ${g === 0 ? '' : 'stroke-dasharray="4 5"'}/>`;
    body += `<text x="${PADL - 14}" y="${gy + 4}" class="t s" text-anchor="end">${v === 0 ? '0' : (v / 1000) + 'k'}</text>`;
  }

  // 面积 + 折线
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d[1]).toFixed(1)}`).join(' ');
  body += `<polygon points="${PADL},${y(0)} ${pts} ${W - PADR},${y(0)}" fill="url(#gArea)"/>`;
  body += `<polyline points="${pts}" fill="none" stroke="${C.indigo}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  data.forEach((d, i) => {
    body += `<circle cx="${x(i).toFixed(1)}" cy="${y(d[1]).toFixed(1)}" r="3" fill="${C.card}" stroke="${C.indigo}" stroke-width="2"/>`;
  });

  // 峰值标注
  const pk = 12;
  body += `<line x1="${x(pk)}" y1="${y(data[pk][1]) - 10}" x2="${x(pk)}" y2="${PADT + 8}" stroke="${C.rose}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  body += `<rect x="${x(pk) - 46}" y="${y(data[pk][1]) - 42}" width="118" height="26" rx="13" fill="${C.roseSoft}" stroke="${C.rose}"/>`;
  body += `<text x="${x(pk) + 13}" y="${y(data[pk][1]) - 24}" class="t k" fill="${C.rose}" text-anchor="middle">峰值 2,660</text>`;

  // 平均线
  const avg = Math.round(data.reduce((a, b) => a + b[1], 0) / data.length);
  body += `<line x1="${PADL}" y1="${y(avg)}" x2="${W - PADR}" y2="${y(avg)}" stroke="${C.emerald}" stroke-width="1.6" stroke-dasharray="7 5"/>`;
  body += `<rect x="${W - PADR - 150}" y="${y(avg) - 30}" width="150" height="24" rx="12" fill="${C.emeraldSoft}" stroke="${C.emerald}"/>`;
  body += `<text x="${W - PADR - 75}" y="${y(avg) - 13}" class="t k" fill="${C.emerald}" text-anchor="middle">日均 ${avg} 次</text>`;

  // X 轴标签（每 5 天）
  data.forEach((d, i) => {
    if (i % 5 === 0 || i === data.length - 1)
      body += `<text x="${x(i).toFixed(1)}" y="${PADT + plotH + 26}" class="t s" text-anchor="middle">${d[0]}</text>`;
  });

  body += `<text x="${PADL - 38}" y="${H - 24}" class="t s">数据取自站点首页注入的 window.STATS（按天聚合的 total 字段），非估算值。</text>`;
  return svg(W, H, body);
}

/* =========================================================
   5. 封面
   ========================================================= */
function cover() {
  const W = 1200;
  const H = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#1e1b4b"/><stop offset="52%" stop-color="#4338ca"/><stop offset="100%" stop-color="#0e7490"/>
  </linearGradient>
  <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#a5b4fc" stop-opacity="0.55"/><stop offset="100%" stop-color="#67e8f9" stop-opacity="0"/>
  </linearGradient>
  <style>
    .tc{font-family:${FONT}}
    .mc{font-family:${MONO}}
  </style>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<circle cx="1035" cy="120" r="230" fill="url(#glow)"/>
<circle cx="150" cy="560" r="180" fill="#06b6d4" opacity="0.14"/>
<g opacity="0.22" stroke="#e0e7ff" stroke-width="1">
  ${Array.from({ length: 11 }, (_, i) => `<line x1="${820 + i * 34}" y1="0" x2="${700 + i * 34}" y2="${H}"/>`).join('')}
</g>
<g transform="translate(84,150)">
  <rect x="0" y="0" width="132" height="34" rx="17" fill="#ffffff" opacity="0.16"/>
  <text x="66" y="23" class="tc" font-size="14" font-weight="600" fill="#e0e7ff" text-anchor="middle">自研项目 · 开发日记</text>
  <text x="0" y="112" class="tc" font-size="58" font-weight="700" fill="#ffffff">随机图片 API</text>
  <text x="0" y="170" class="tc" font-size="27" font-weight="500" fill="#c7d2fe">从 v2.0 到 v3.2.3.5，一个图库服务的完整诞生记</text>
  <rect x="0" y="212" width="88" height="5" rx="2.5" fill="#67e8f9"/>
  <text x="0" y="272" class="mc" font-size="17" fill="#a5f3fc">GET https://sjtp.api.mofashi.ltd/pc.php</text>
  <text x="0" y="330" class="tc" font-size="16" fill="#c7d2fe">PHP + SQLite ｜ 302 跳转 / 代理转发 ｜ 管理后台 + 调用统计 ｜ MIT 开源</text>
</g>
<g transform="translate(84,520)">
  ${[['12.5万+', '累计调用'], ['1,547', '图库总量'], ['142', '次提交']].map((m, i) => `
  <g transform="translate(${i * 250},0)">
    <text x="0" y="0" class="tc" font-size="30" font-weight="700" fill="#ffffff">${m[0]}</text>
    <text x="0" y="26" class="tc" font-size="13" fill="#a5b4fc">${m[1]}</text>
  </g>`).join('')}
</g>
</svg>
`;
}

/* ---------- 输出 ---------- */
const files = {
  'cover.svg': cover(),
  'overview.svg': overview(),
  'flow.svg': flow(),
  'timeline.svg': timeline(),
  'trend.svg': trend(),
};
for (const [name, content] of Object.entries(files)) {
  const isCover = name === 'cover.svg';
  const p = path.join(isCover ? COVER_DIR : ART_DIR, isCover ? `${POST_ID}.svg` : name);
  writeFileSync(p, content, 'utf8');
  console.log(`✓ ${path.relative(process.cwd(), p)}  (${(Buffer.byteLength(content) / 1024).toFixed(1)} KB)`);
}
