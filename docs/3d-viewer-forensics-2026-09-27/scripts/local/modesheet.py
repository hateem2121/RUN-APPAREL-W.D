import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
S,tag,modes,box,out=sys.argv[1],sys.argv[2],sys.argv[3].split(','),[float(x) for x in sys.argv[4].split(',')],sys.argv[5]
f=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
base=np.asarray(Image.open(f'{S}/shots/{tag}-{modes[0]}.png').convert('RGB')).astype(int); ts=[]
for m in modes:
    im=Image.open(f'{S}/shots/{tag}-{m}.png').convert('RGB'); a=np.asarray(im).astype(int)
    ch=(np.abs(a-base).max(2)>16).sum()
    w,h=im.size; t=im.crop((int(box[0]*w),int(box[1]*h),int(box[2]*w),int(box[3]*h))); t=t.resize((520,int(520*t.height/t.width)))
    d=ImageDraw.Draw(t); d.rectangle([0,0,520,32],fill='white'); d.text((4,3),f'{m}  ({ch} px changed)',fill='black',font=f); ts.append(t)
s=Image.new('RGB',(520*len(ts),ts[0].height),'white')
for i,t in enumerate(ts): s.paste(t,(i*520,0))
s.save(out,quality=90)
