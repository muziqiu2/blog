# -*- coding: utf-8 -*-
"""
make-imgbed-post-art.py —— 为「魔法师图床优化」这篇文章生成配图（统一 WebP）

素材来源：
  - 图床项目里的历史截图（优化前首页 / 压缩条前后对比 / 缩放规则对比）
  - 本次用 CDP 新截的线上页面
输出：source/img/covers/<POST_ID>.webp  与  source/img/posts/mofashi-imgbed/*.webp
"""
import io
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POST_ID = os.environ.get('POST_ID') or '2918829047'   # 改这里即可复用给下一篇文章

COVER_OUT = os.path.join(ROOT, 'source/img/covers', f'{POST_ID}.webp')
POST_DIR = os.path.join(ROOT, 'source/img/posts/mofashi-imgbed')

BED = r'C:\Users\123\Desktop\github\魔法师图床2.0'
SHOTS = os.path.join(ROOT, '_shots')

os.makedirs(POST_DIR, exist_ok=True)


def enc(im, flat=False):
    """在「无损 / 有损」里挑更小的那份"""
    cands = []
    im2 = im.convert('RGBA') if im.mode in ('RGBA', 'LA') or (
        im.mode == 'P' and 'transparency' in im.info) else im.convert('RGB')
    for kw in ([{}] if not flat else []):
        pass
    b = io.BytesIO()
    im2.save(b, format='WEBP', lossless=True, method=6)
    cands.append((b.getvalue(), 'lossless'))
    b2 = io.BytesIO()
    im2.save(b2, format='WEBP', quality=82 if not flat else 85, method=6)
    cands.append((b2.getvalue(), f'q={82 if not flat else 85}'))
    cands.sort(key=lambda x: len(x[0]))
    return cands[0]


def save(im, path, flat=False, maxside=1440):
    if max(im.size) > maxside:
        sc = maxside / max(im.size)
        im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    data, note = enc(im, flat=flat)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'  {os.path.basename(path):28s} {im.width}x{im.height:<5} {len(data)/1024:7.1f}KB  [{note}]')
    return len(data)


def load(p):
    im = Image.open(p)
    im.load()
    return im


print('=== 封面 ===')
cov = load(os.path.join(SHOTS, 'home-tall.png'))
# 与既有封面保持一致：1200x630（≈1.905:1），从页面顶部起裁
w = cov.width
ch = int(w * 630 / 1200)
cov_crop = cov.crop((0, 0, w, min(cov.height, ch)))
save(cov_crop, COVER_OUT, flat=False, maxside=1200)

print('\n=== 正文配图 ===')
save(load(os.path.join(BED, '.workbuddy/preview/before_1000.png')),
     os.path.join(POST_DIR, 'home-before.webp'), flat=False, maxside=1000)
save(load(os.path.join(SHOTS, 'home-desktop.png')),
     os.path.join(POST_DIR, 'home-after.webp'), flat=False, maxside=1280)
save(load(os.path.join(BED, '_compress_mobile_before_after.png')),
     os.path.join(POST_DIR, 'compress-copy-compare.webp'), flat=True, maxside=1100)
save(load(os.path.join(SHOTS, 'upload-desktop.png')),
     os.path.join(POST_DIR, 'compress-ui.webp'), flat=True, maxside=1280)
save(load(os.path.join(SHOTS, 'upload-360.png')),
     os.path.join(POST_DIR, 'compress-narrow.webp'), flat=True, maxside=480)
save(load(os.path.join(BED, '_compress_long_image_compare.png')),
     os.path.join(POST_DIR, 'scale-compare.webp'), flat=True, maxside=1200)

print('\n=== 汇总 ===')
tot = sum(
    os.path.getsize(os.path.join(POST_DIR, f)) for f in os.listdir(POST_DIR)
) + os.path.getsize(COVER_OUT)
print(f'  封面 + 正文图合计 {tot/1024:.1f} KB')
print(f'  文章 ID = {POST_ID}')
