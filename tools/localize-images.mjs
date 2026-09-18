#!/usr/bin/env node
/**
 * localize-images.mjs —— 把文章里的外链图床图片下载到博客本地
 *
 * 用法:
 *   node tools/localize-images.mjs --scan     只扫描并打印清单
 *   node tools/localize-images.mjs --fetch    下载到 source/img/posts/<postId>/
 *   node tools/localize-images.mjs --rewrite  改写 md 里的引用为本地路径
 *
 * 零依赖（Node 22 内置 fetch / fs）。默认不走代理。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source/_posts');
const OUT_ROOT = path.join(ROOT, 'source/img/posts');

// 需要本地化的图床域名
const HOSTED_HOSTS = [
  'vip-img.mofashi.ltd',
  'free-img.mofashi.ltd',
  'img.mofashi.ltd',
];

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i;

function listPosts() {
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ id: f.replace(/\.md$/, ''), file: path.join(POSTS_DIR, f) }));
}

/** 从 markdown 文本中提取外链图片 URL（保持出现顺序、去重） */
function extractUrls(text) {
  const out = [];
  const seen = new Set();
  const re = /https?:\/\/[^\s"'<>)\]]+/g;
  let m;
  while ((m = re.exec(text))) {
    const u = m[0];
    if (!IMG_EXT.test(u)) continue;
    let host;
    try {
      host = new URL(u).hostname;
    } catch {
      continue;
    }
    if (!HOSTED_HOSTS.includes(host)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function baseName(u) {
  const p = new URL(u).pathname;
  return path.basename(p);
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

async function download(url, dest) {
  if (fs.existsSync(dest)) {
    const st = fs.statSync(dest);
    if (st.size > 0) return { skipped: true, size: st.size };
  }
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error(`响应过小 ${buf.length}B`);
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, buf);
  return { skipped: false, size: buf.length };
}

function plan() {
  const rows = [];
  for (const { id, file } of listPosts()) {
    const text = fs.readFileSync(file, 'utf8');
    for (const url of extractUrls(text)) {
      rows.push({ id, file, url, name: baseName(url) });
    }
  }
  return rows;
}

async function main() {
  const mode = process.argv[2] || '--scan';
  const rows = plan();

  if (mode === '--scan') {
    const byPost = new Map();
    for (const r of rows) {
      if (!byPost.has(r.id)) byPost.set(r.id, []);
      byPost.get(r.id).push(r);
    }
    let total = 0;
    for (const [id, list] of [...byPost].sort()) {
      console.log(`\n## ${id}  (${list.length} 张)`);
      for (const r of list) console.log(`   ${r.name}  <- ${r.url}`);
      total += list.length;
    }
    console.log(`\n合计 ${total} 张，涉及 ${byPost.size} 篇文章`);
    return;
  }

  if (mode === '--fetch') {
    let ok = 0,
      skip = 0,
      fail = 0;
    const fails = [];
    for (const r of rows) {
      const dest = path.join(OUT_ROOT, r.id, r.name);
      try {
        const res = await download(r.url, dest);
        if (res.skipped) {
          skip++;
          console.log(`  [已有] ${r.id}/${r.name}  ${(res.size / 1024).toFixed(1)}KB`);
        } else {
          ok++;
          console.log(`  [下载] ${r.id}/${r.name}  ${(res.size / 1024).toFixed(1)}KB`);
        }
      } catch (e) {
        fail++;
        fails.push(`${r.url}  =>  ${e.message}`);
        console.log(`  [失败] ${r.url}  ${e.message}`);
      }
    }
    console.log(`\n下载 ${ok} / 跳过 ${skip} / 失败 ${fail}${fail ? '\n' + fails.join('\n') : ''}`);
    if (fail) process.exitCode = 1;
    return;
  }

  if (mode === '--rewrite') {
    // 只改写「本地已存在同名文件」的引用
    let changed = 0;
    for (const { id, file } of listPosts()) {
      let text = fs.readFileSync(file, 'utf8');
      const before = text;
      for (const url of extractUrls(text)) {
        const name = baseName(url);
        const localDir = path.join(OUT_ROOT, id);
        const candidates = fs.existsSync(localDir)
          ? fs.readdirSync(localDir).filter((f) => f.startsWith(name.replace(/\.[^.]+$/, '')))
          : [];
        // 优先同名，其次同 basename 换扩展名（webp 转换后）
        const pick =
          candidates.find((f) => f === name) ||
          candidates.find((f) => /\.webp$/i.test(f)) ||
          candidates[0];
        if (!pick) continue;
        const local = `/img/posts/${id}/${pick}`;
        text = text.split(url).join(local);
      }
      if (text !== before) {
        fs.writeFileSync(file, text);
        changed++;
        console.log(`  [改写] ${id}.md`);
      }
    }
    console.log(`\n改写 ${changed} 篇文章`);
    return;
  }

  console.error('用法: --scan | --fetch | --rewrite');
  process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
