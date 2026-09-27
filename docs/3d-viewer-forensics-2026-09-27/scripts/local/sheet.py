import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
S, tag, views, cols, out = sys.argv[1], sys.argv[2], sys.argv[3].split(','), sys.argv[4].split(','), sys.argv[5]
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
rows = []
for v in views:
    base = np.asarray(Image.open(f'{S}/shots/{tag}-{v}-as-live.png').convert('RGB')).astype(int)
    bg = (np.abs(base - base[5,5]).sum(2) > 24)  # garment mask (non-background)
    tiles = []
    for c in cols:
        im = Image.open(f'{S}/shots/{tag}-{v}-{c}.png').convert('RGB')
        a = np.asarray(im).astype(int)
        ch = (np.abs(a - base).max(2) > 16)
        pct = 100 * ch.sum() / max(1, bg.sum())
        print(f'{tag} {v:8} {c:22} changed {pct:6.2f}% of garment pixels')
        im = im.copy(); d = ImageDraw.Draw(im); d.rectangle([0,0,im.width,34], fill=(255,255,255)); d.text((8,6), f'{v} | {c} | {pct:.2f}%', fill=(0,0,0), font=font)
        tiles.append(im)
    w, h = tiles[0].size
    row = Image.new('RGB', (w*len(tiles), h), 'white')
    for i,t in enumerate(tiles): row.paste(t, (i*w, 0))
    rows.append(row)
sheet = Image.new('RGB', (rows[0].width, sum(r.height for r in rows)), 'white')
y = 0
for r in rows: sheet.paste(r, (0,y)); y += r.height
sheet.thumbnail((2600, 2600)); sheet.save(out, quality=88)
