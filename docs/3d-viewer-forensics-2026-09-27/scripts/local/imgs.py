import sys, json, struct, io, numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS=None
path, out = sys.argv[1], sys.argv[2]; want=[int(x) for x in sys.argv[3].split(',')]
b=open(path,'rb').read(); L=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+L]); bs=20+L+8
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18); tiles=[]
for s in want:
    im=j['images'][s]; bv=j['bufferViews'][im['bufferView']]; o=bs+bv.get('byteOffset',0)
    I=Image.open(io.BytesIO(b[o:o+bv['byteLength']])); a=np.asarray(I.convert('RGBA')); al=a[...,3].astype(int)
    print(f"img{s} {im.get('mimeType')} {I.size} {I.mode} bytes={bv['byteLength']} alpha0={100*(al==0).mean():.1f}% soft={100*((al>0)&(al<255)).mean():.1f}% solid={100*(al==255).mean():.1f}% rgbMean(ink)={a[...,:3][al>0].mean(0).round() if (al>0).any() else '-'} rgbStd(ink)={a[...,:3][al>0].std(0).round() if (al>0).any() else '-'}")
    t=I.convert('RGBA'); t.thumbnail((360,360)); bg=Image.new('RGBA',t.size,(255,0,255,255)); bg.alpha_composite(t); t=bg.convert('RGB')
    d=ImageDraw.Draw(t); d.rectangle([0,0,t.width,22],fill='white'); d.text((3,2),f'img{s}',fill='black',font=font); tiles.append(t)
W=sum(t.width for t in tiles); H=max(t.height for t in tiles); sh=Image.new('RGB',(W,H),'white'); x=0
for t in tiles: sh.paste(t,(x,0)); x+=t.width
sh.save(out)
