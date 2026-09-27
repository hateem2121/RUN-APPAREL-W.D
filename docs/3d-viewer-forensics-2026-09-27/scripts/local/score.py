# blink = pixel changes then changes back across three frames 0.5 deg apart; damage = still differs from the nudge-off picture where live differs from it
import sys, glob, numpy as np
from PIL import Image
S, tag = sys.argv[1], sys.argv[2]; T=24
L=lambda m,v,d: np.asarray(Image.open(f'{S}/exp/{tag}__{m}__{v}__{d}.png').convert('RGB')).astype(int)
modes=sorted({p.split('__')[1] for p in glob.glob(f'{S}/exp/{tag}__*.png')}, key=lambda m: ['live','nudgeOffSolid'].index(m) if m in ('live','nudgeOffSolid') else 9)
views=sorted({p.split('__')[2] for p in glob.glob(f'{S}/exp/{tag}__*.png')})
for v in views:
    ref=L('nudgeOffSolid',v,0) if 'nudgeOffSolid' in modes else None
    live=L('live',v,0); gar=(np.abs(live-live[4,4]).sum(2)>40); G=gar.sum()
    region=None
    if ref is not None:
        region=(np.abs(live-ref).max(2)>T)
    for m in modes:
        f0,f1,f2=L(m,v,-0.5),L(m,v,0),L(m,v,0.5)
        a=np.abs(f1-f0).max(2)>T; b=np.abs(f2-f1).max(2)>T; c=np.abs(f2-f0).max(2)<=T
        blink=(a&b&c&gar).sum()/G*100
        dmg='' if region is None else f"  damage left {100*((np.abs(f1-ref).max(2)>T)&region).sum()/max(region.sum(),1):5.1f}% of {region.sum()} px"
        print(f"{tag:6} {v:8} {m:16} blink {blink:5.2f}%{dmg}")
