# -*- coding: utf-8 -*-
"""
optimize-images.py —— 博客图片瘦身：统一转 WebP + 限制最大边长

用法:
    python tools/optimize-images.py --scan    只报告
    python tools/optimize-images.py --apply   就地转换（保留 .orig 备份到 _imgbak/）
    python tools/optimize-images.py --rewrite 改写 md/yml 中的引用扩展名

策略:
    - 光栅图 (PNG/JPEG/WebP/GIF/BMP) -> WebP
    - 最大边长超过 CAP 的先等比缩放（LANCZOS）
    - 带 alpha 或源为 PNG 的，同时试「无损 WebP」与「有损 q=85」，取更小的
    - 纯照片类源（JPEG）走有损 q=82
    - 结果反而更大且原图本就不大时，保留原图
    - SVG / ICO 一律不动
"""
import argparse
import io
import os
import re
import shutil
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_ROOT = os.path.join(ROOT, 'source', 'img')
BAK_ROOT = os.path.join(ROOT, '_imgbak')

CAP = 1440          # 最大边长
Q_PHOTO = 82        # 照片有损质量
Q_FLAT = 85         # 图形/截图有损质量
SKIP_SMALL = 45 * 1024   # 小于此体积且非 PNG 的，不动

RASTER_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'}

SCAN_DIRS = [
    'posts',
    'covers',
    'about',
    'links',
]
SCAN_FILES = [
    '404.jpg',
    'default_cover.jpg',
    'site-avatar.jpg',
    'site-logo.png',
]


def collect():
    out = []
    for d in SCAN_DIRS:
        base = os.path.join(IMG_ROOT, d)
        if not os.path.isdir(base):
            continue
        for dirpath, _dirnames, filenames in os.walk(base):
            for fn in filenames:
                ext = os.path.splitext(fn)[1].lower()
                if ext in RASTER_EXT:
                    out.append(os.path.join(dirpath, fn))
    for fn in SCAN_FILES:
        p = os.path.join(IMG_ROOT, fn)
        if os.path.isfile(p) and os.path.splitext(fn)[1].lower() in RASTER_EXT:
            out.append(p)
    return sorted(set(out))


def human(n):
    return f"{n/1024:.1f}KB" if n < 1024 * 1024 else f"{n/1024/1024:.2f}MB"


def encode_webp(im, src_format):
    """返回 (bytes, note) —— 在几种编码里挑体积最小的那个（质量优先保底）。"""
    cands = []

    has_alpha = im.mode in ('RGBA', 'LA', 'P') and (
        im.mode != 'P' or 'transparency' in im.info
    )

    # 有损
    if src_format in ('JPEG',):
        q = Q_PHOTO
    else:
        q = Q_FLAT
    rgb = im.convert('RGBA') if has_alpha else im.convert('RGB')
    b = io.BytesIO()
    rgb.save(b, format='WEBP', quality=q, method=6)
    cands.append((b.getvalue(), f'有损 q={q}'))

    # 无损（仅图形/截图类源，照片走无损通常更大）
    if src_format in ('PNG', 'GIF', 'BMP'):
        b2 = io.BytesIO()
        try:
            (im.convert('RGBA') if has_alpha else im.convert('RGB')).save(
                b2, format='WEBP', lossless=True, method=6
            )
            cands.append((b2.getvalue(), '无损'))
        except Exception:
            pass

    cands.sort(key=lambda x: len(x[0]))
    return cands[0]


def process(path, apply_):
    src_size = os.path.getsize(path)
    with Image.open(path) as im:
        im.load()
        src_format = im.format
        w, h = im.size
        mode = im.mode
        has_alpha = mode in ('RGBA', 'LA') or (mode == 'P' and 'transparency' in im.info)

    # 缩放
    scale = 1.0
    if max(w, h) > CAP:
        scale = CAP / max(w, h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))

    if scale == 1.0 and src_format == 'WEBP' and src_size < SKIP_SMALL:
        return None  # 已经够小，略过

    with Image.open(path) as im:
        im.load()
        has_alpha = im.mode in ('RGBA', 'LA') or (
            im.mode == 'P' and 'transparency' in im.info
        )
        if scale != 1.0:
            im = im.resize((nw, nh), Image.LANCZOS)
        data, note = encode_webp(im, src_format)

    dest = os.path.splitext(path)[0] + '.webp'

    # 已是 WebP 且无需缩放：只有明显能瘦下来才重编码（避免无谓的画质损失）
    if src_format == 'WEBP' and scale == 1.0 and len(data) > src_size * 0.85:
        return None

    keep_original = False
    if len(data) >= src_size and src_size < 100 * 1024:
        keep_original = True

    row = {
        'path': path,
        'rel': os.path.relpath(path, ROOT).replace('\\', '/'),
        'src_size': src_size,
        'new_size': len(data) if not keep_original else src_size,
        'src_dim': (w, h),
        'new_dim': (nw, nh),
        'src_format': src_format,
        'has_alpha': has_alpha,
        'note': note,
        'dest': dest,
        'keep_original': keep_original,
    }

    if apply_ and not keep_original:
        # 备份
        rel = os.path.relpath(path, IMG_ROOT)
        bak = os.path.join(BAK_ROOT, rel)
        os.makedirs(os.path.dirname(bak), exist_ok=True)
        if not os.path.exists(bak):
            shutil.copy2(path, bak)
        with open(dest, 'wb') as f:
            f.write(data)
        if os.path.normcase(dest) != os.path.normcase(path):
            os.remove(path)

    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scan', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--rewrite', action='store_true')
    args = ap.parse_args()

    if args.rewrite:
        do_rewrite()
        return

    files = collect()
    rows = []
    for p in files:
        try:
            r = process(p, args.apply)
            if r:
                rows.append(r)
        except Exception as e:
            print(f'  [错误] {p}: {e!r}', file=sys.stderr)

    rows.sort(key=lambda r: -r['src_size'])
    tot_before = sum(r['src_size'] for r in rows)
    tot_after = sum(r['new_size'] for r in rows)

    print(f"{'源体积':>10} {'→':^3} {'新体积':>10}  {'尺寸':^16} {'格式':^12} 说明 / 路径")
    print('-' * 118)
    for r in rows:
        dim = f"{r['src_dim'][0]}x{r['src_dim'][1]}→{r['new_dim'][0]}x{r['new_dim'][1]}"
        if r['src_dim'] == r['new_dim']:
            dim = f"{r['src_dim'][0]}x{r['src_dim'][1]}"
        fmt = f"{r['src_format']}→{'KEEP' if r['keep_original'] else 'WEBP'}"
        pct = (1 - r['new_size'] / r['src_size']) * 100 if r['src_size'] else 0
        print(
            f"{human(r['src_size']):>10} {'→':^3} {human(r['new_size']):>10}  {dim:^16} {fmt:^12} "
            f"{r['note']:>10} {pct:5.1f}%  {r['rel']}"
        )
    print('-' * 118)
    print(
        f"共 {len(rows)} 张：{human(tot_before)} → {human(tot_after)}  "
        f"节省 {human(tot_before - tot_after)} ({(1-tot_after/tot_before)*100:.1f}%)"
        if tot_before
        else '无待处理图片'
    )
    if not args.apply:
        print('（这是预演，未写盘；加 --apply 才真正转换）')


def do_rewrite():
    """把引用里的 .png/.jpg/.jpeg 扩展名改成 .webp（只改本地已存在 webp 的）"""
    targets = []
    for base, _dirs, files in os.walk(os.path.join(ROOT, 'source')):
        for fn in files:
            if fn.endswith(('.md', '.yml', '.yaml')):
                targets.append(os.path.join(base, fn))
    for extra in ('_config.yml', '_config.solitude.yml'):
        p = os.path.join(ROOT, extra)
        if os.path.isfile(p):
            targets.append(p)

    pat = re.compile(r'(/img/[^\s"\')\]]+?)\.(png|jpe?g|gif|bmp)\b', re.I)
    changed_files = 0
    changed_refs = 0
    for path in sorted(set(targets)):
        text = open(path, encoding='utf-8').read()
        orig = text

        def repl(m):
            nonlocal changed_refs
            stem, _ext = m.group(1), m.group(2)
            if os.path.isfile(os.path.join(ROOT, 'source', stem.lstrip('/') + '.webp')):
                changed_refs += 1
                return stem + '.webp'
            return m.group(0)

        text = pat.sub(repl, text)
        if text != orig:
            open(path, 'w', encoding='utf-8', newline='\n').write(text)
            changed_files += 1
            print(f'  [改写] {os.path.relpath(path, ROOT)}')

    print(f'\n改写 {changed_refs} 处引用，涉及 {changed_files} 个文件')


if __name__ == '__main__':
    main()
