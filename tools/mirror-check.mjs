#!/usr/bin/env node
/**
 * jsDelivr 镜像健康自检 —— 专治「明文响应被截断」（Uncaught SyntaxError: expected expression, got end of script）
 *
 * 【病灶原理】
 *   镜像站的响应带 Content-Encoding: br/gzip + Content-Length: <压缩后长度>。
 *   当边缘节点给「不接受压缩的客户端」做透明解压时，如果只解压 body 而不同步修正
 *   Content-Length，客户端就会严格按压缩长度截断明文 —— 结果是一个「官方文件的前 N 字节」，
 *   且该残体还会被写进边缘缓存（配合 immutable 长 TTL，坏上一年不自愈）。
 *   典型症状：Content-Length / 落盘字节数 ≈ 该文件的 br/gzip 压缩后大小。
 *
 * 【检测原理】
 *   坏副本只存在于「命中边缘缓存」的那条路径上。给同一个 URL 加一个唯一的查询串
 *   即可绕开缓存回源拿到正确内容。因此：
 *       命中缓存版 != 回源版   =>  该 URL 的缓存副本已损坏，需要刷新缓存
 *   本脚本对同一个 URL 各请求两次（缓存 / 回源），对带压缩的响应先解码，再逐字节比对。
 *
 * 【用法】
 *   node tools/mirror-check.mjs                          # 用内置清单检查
 *   node tools/mirror-check.mjs --base https://cdn-jsdelivr.mofashi.ltd
 *   node tools/mirror-check.mjs --file urls.txt          # 每行一个路径或完整 URL
 *   node tools/mirror-check.mjs --json                   # 输出 JSON（便于接入 CI）
 *   退出码：0 = 全部正常；1 = 存在坏副本（输出需刷新的 URL 清单）
 */

import zlib from 'node:zlib';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = arg('base', 'https://cdn-jsdelivr.mofashi.ltd').replace(/\/+$/, '');
const AS_JSON = argv.includes('--json');
const TIMEOUT = Number(arg('timeout', 45000));
const CONCURRENCY = Number(arg('concurrency', 4));

/**
 * 内置清单：Hexo solitude 主题会用到的第三方库
 * （名称/版本取自 node_modules/hexo-theme-solitude/plugins.yml，可自行增删）
 */
const DEFAULT_LIST = [
  'npm/pace-js@1.2.4/pace.min.js',
  'npm/pjax@0.2.8/pjax.min.js',
  'npm/vanilla-lazyload@19.1.3/dist/lazyload.iife.min.js',
  'npm/node-snackbar@0.1.16/dist/snackbar.min.js',
  'npm/@fancyapps/ui@6.1.14/dist/fancybox/fancybox.umd.js',
  'npm/@fancyapps/ui@6.1.14/dist/fancybox/fancybox.css',
  'npm/@fortawesome/fontawesome-free@7.3.0/css/all.min.css',
  'npm/katex@0.16.47/dist/katex.min.css',
  'npm/swiper@14.0.5/swiper-bundle.min.js',
];

const listFile = arg('file', null);
const TARGETS = listFile
  ? fs.readFileSync(listFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
  : DEFAULT_LIST;

const toUrl = (t) => (/^https?:\/\//i.test(t) ? t : BASE + '/' + t.replace(/^\/+/, ''));
const bust = (u) => u + (u.includes('?') ? '&' : '?') + '__hc=' + Math.random().toString(36).slice(2) + Date.now().toString(36);

function decode(buf, enc) {
  if (!enc) return buf;
  const e = enc.toLowerCase();
  try {
    if (e.includes('br')) return zlib.brotliDecompressSync(buf);
    if (e.includes('gzip')) return zlib.gunzipSync(buf);
    if (e.includes('deflate')) return zlib.inflateSync(buf);
  } catch (err) {
    return new Error('解压失败: ' + err.message);
  }
  return buf;
}

/**
 * ⚠️ Node 内置 fetch（undici）的行为：它会**自动解压** br/gzip/deflate 响应体，
 * 但**不删除** `content-encoding` 响应头。所以 arrayBuffer() 拿到的可能已经是明文。
 * 这里先按 header 尝试解压，失败就说明 undici 已经解压过了，直接用原始字节。
 */
function unwrap(buf, enc) {
  if (!enc || enc === 'identity') return buf;
  const d = decode(buf, enc);
  return d instanceof Error ? buf : d;
}

async function grab(url, acceptEncoding) {
  const headers = acceptEncoding ? { 'accept-encoding': acceptEncoding } : { 'accept-encoding': 'identity' };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: ac.signal });
    const raw = Buffer.from(await res.arrayBuffer());
    const encoding = res.headers.get('content-encoding') || 'identity';
    const payload = unwrap(raw, encoding);
    return {
      ok: res.ok,
      status: res.status,
      wire: raw.length,
      declared: Number(res.headers.get('content-length') || NaN),
      encoding,
      cache: res.headers.get('eo-cache-status') || res.headers.get('cf-cache-status') || res.headers.get('x-cache') || '-',
      cacheControl: res.headers.get('cache-control') || '-',
      body: payload,
      decodeError: null,
    };
  } catch (err) {
    return { ok: false, status: 0, wire: 0, declared: NaN, encoding: '-', cache: '-', cacheControl: '-', body: null, decodeError: String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

const same = (a, b) => (a && b && a.length === b.length && Buffer.compare(a, b) === 0);

async function checkOne(target) {
  const url = toUrl(target);
  const label = target.replace(/^https?:\/\/[^/]+/i, '');

  // 1) 明文路径：命中缓存 vs 回源
  const [hitPlain, freshPlain] = await Promise.all([grab(url, null), grab(bust(url), null)]);
  // 2) 压缩路径：命中缓存 vs 回源（模拟真实浏览器）
  const [hitEnc, freshEnc] = await Promise.all([grab(url, 'gzip, deflate, br'), grab(bust(url), 'gzip, deflate, br')]);

  const ref = freshPlain.body || freshEnc.body;             // 回源结果视为基准（正确内容）
  const plainBroken = !!ref && !same(hitPlain.body, ref);
  const encBroken = !!ref && !same(hitEnc.body, ref);
  // Content-Length 应当等于实体真实长度；不等即说明头部与实体不匹配（截断的直接征兆）
  const clMismatch = !!ref && Number.isFinite(hitPlain.declared) && hitPlain.declared !== ref.length;

  return {
    label,
    url,
    reference: ref ? ref.length : 0,
    plain: { ...hitPlain, body: undefined, match: !!ref && same(hitPlain.body, ref) },
    encoded: { ...hitEnc, body: undefined, match: !!ref && same(hitEnc.body, ref) },
    freshPlain: { ...freshPlain, body: undefined },
    bad: plainBroken || encBroken || clMismatch,
    clMismatch,
  };
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const results = await pool(TARGETS, CONCURRENCY, checkOne);

if (AS_JSON) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('\njsDelivr 镜像自检  base=' + BASE);
  console.log('判定依据：把「命中边缘缓存的结果」与「绕开缓存回源的结果」逐字节比对（压缩响应先解码）。\n');
  for (const r of results) {
    const cl = Number.isFinite(r.plain.declared) ? r.plain.declared : r.plain.wire;
    console.log((r.bad ? '❌ 损坏' : '✅ 正常') + '  ' + r.label);
    console.log(
      '        回源基准 ' + String(r.reference).padStart(7) + 'B' +
      ' | 缓存命中 ' + String(r.plain.wire).padStart(7) + 'B' +
      ' (CL=' + cl + ', ' + r.plain.cache + ')' +
      ' | 压缩请求解码后 ' + String(r.encoded.wire).padStart(7) + 'B' +
      (r.clMismatch ? '  ← ⚠ Content-Length 与实体长度不符' : '') +
      (r.plain.match ? '' : '  ← 明文内容不一致') +
      (r.encoded.match ? '' : '  ← 压缩路径内容不一致')
    );
    console.log('        Cache-Control: ' + r.plain.cacheControl);
  }
  const bad = results.filter((r) => r.bad);
  console.log('');
  if (bad.length) {
    console.log('=== 需要刷新缓存的 URL（' + bad.length + ' 条）===');
    for (const r of bad) console.log('  ' + r.url);
    console.log('\n对照结论：这些条目【回源正常、缓存副本被截断】——缓存里存的就是一份被截断的明文实体，');
    console.log('         边缘再按客户端 Accept-Encoding 现场压缩，所以 identity/gzip/br 三种变体解出来全是同一份残体。');
    console.log('         止血 = 刷新 EdgeOne 缓存；根治 = 回源固定 accept-encoding: identity + 不依赖 Content-Length + 去掉 immutable。');
  } else {
    console.log('全部正常 ✅  未发现被截断的缓存副本。');
  }
}

process.exit(results.some((r) => r.bad) ? 1 : 0);
