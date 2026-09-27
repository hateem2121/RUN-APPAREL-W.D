import sys, glob, os, numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS=None
S, tag, folder, out = sys.argv[1:5]
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
def crop_clo(im):
    a=np.asarray(im.convert('L')); ys,xs=np.nonzero(a>18); return im.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
def crop_live(im):
    a=np.asarray(im.convert('RGB')).astype(int); d=np.abs(a-a[3,3]).sum(2); m=d>40
    m[:, :int(.18*m.shape[1])]=False; m[:, int(.82*m.shape[1]):]=False; m[int(.9*m.shape[0]):,:]=False
    ys,xs=np.nonzero(m); return im.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
H=560
def row(files, crop, lab):
    ims=[]
    for f in files:
        im=crop(Image.open(f).convert('RGB')); im=im.resize((int(im.width*H/im.height),H)); d=ImageDraw.Draw(im)
        d.rectangle([0,0,im.width,22],fill='white'); d.text((3,2),lab+os.path.basename(f)[-24:-4],fill='black',font=font); ims.append(im)
    return ims
clo=[f for f in sorted(glob.glob(folder+'/*.png')) if Image.open(f).size!=(10000,10000)]
top=row(clo,crop_clo,'CLO ') if clo else []
bot=row(sorted(glob.glob(f'{S}/live/{tag}__*.png')),crop_live,'LIVE ')
W=max(sum(i.width for i in top) if top else 0, sum(i.width for i in bot))
sh=Image.new('RGB',(W,H*(2 if top else 1)),'white')
for r,(ims) in enumerate([top,bot] if top else [bot]):
    x=0
    for i in ims: sh.paste(i,(x,r*H)); x+=i.width
sh.save(out,quality=85); print(tag, sh.size)
