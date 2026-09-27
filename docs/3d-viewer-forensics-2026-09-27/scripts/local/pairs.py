import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
S, out = sys.argv[1], sys.argv[2]; items = sys.argv[3:]   # tag:view pairs
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
tiles = []
for it in items:
    tag, v = it.split(':')
    a = Image.open(f'{S}/shots/{tag}-{v}-as-live.png').convert('RGB'); b = Image.open(f'{S}/shots/{tag}-{v}-nudge-off-solid.png').convert('RGB')
    A, B = np.asarray(a).astype(int), np.asarray(b).astype(int)
    # crop to the band where the images differ (the waist), padded
    diff = np.abs(A-B).max(2) > 12
    ys, xs = np.nonzero(diff)
    pct = 100*diff.sum()/diff.size
    if len(ys)==0: print(it,'no difference'); continue
    cy, cx = int(np.median(ys)), int(np.median(xs)); r = int(0.16*A.shape[0])
    box = (max(0,cx-r), max(0,cy-r), min(A.shape[1],cx+r), min(A.shape[0],cy+r))
    print(f'{it:22} changed pixels {diff.sum():7d}  crop centre y={cy}/{A.shape[0]}')
    for im, lab in ((a,'LIVE (nudge on)'),(b,'nudge off')):
        t = im.crop(box).resize((420,420)); d = ImageDraw.Draw(t); d.rectangle([0,0,420,34],fill='white'); d.text((6,4),f'{tag} {v}: {lab}',fill='black',font=font); tiles.append(t)
cols = 4; rows = (len(tiles)+cols-1)//cols
sh = Image.new('RGB',(420*cols,420*rows),'white')
for i,t in enumerate(tiles): sh.paste(t,((i%cols)*420,(i//cols)*420))
sh.save(out, quality=88)
