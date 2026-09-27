# CLO render vs live, per colourway, both cropped to the garment and scaled to one height
import sys, glob, os, re, numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS=None
S, tag, folder, out = sys.argv[1:5]
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
def crop_clo(im):  # CLO: black background
    a=np.asarray(im.convert('L')); ys,xs=np.nonzero(a>18); return im.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
def crop_live(im):  # live: light page background; use the page colour at the corner
    a=np.asarray(im.convert('RGB')).astype(int); d=np.abs(a-a[3,3]).sum(2)
    # ignore overlay text in the corners by using a central band
    m=d>40; m[:, :int(.18*m.shape[1])]=False; m[:, int(.82*m.shape[1]):]=False; m[int(.9*m.shape[0]):,:]=False
    ys,xs=np.nonzero(m); return im.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
H=640; tiles=[]
for f in sorted(glob.glob(f'{S}/live/{tag}__*.png')):
    v=f.split('__')[1][:-4]; name=v.replace('_',' ')
    clo=[p for p in glob.glob(folder+'/*.png') if os.path.basename(p)[:-4].lower().endswith(name.lower()) or re.sub(r'.*_','',os.path.basename(p)[:-4]).lower()==name.lower()]
    L=crop_live(Image.open(f).convert('RGB')); L=L.resize((int(L.width*H/L.height),H))
    row=[(L,f'LIVE {name}')]
    if clo: C=crop_clo(Image.open(clo[0]).convert('RGB')); C=C.resize((int(C.width*H/C.height),H)); row.insert(0,(C,'CLO '+os.path.basename(clo[0])[-22:]))
    else: row.insert(0,(Image.new('RGB',(300,H),'black'),'no CLO render'))
    for im,lab in row:
        im=im.copy(); d=ImageDraw.Draw(im); d.rectangle([0,0,im.width,26],fill='white'); d.text((4,2),lab,fill='black',font=font); tiles.append(im)
W=sum(t.width for t in tiles); sh=Image.new('RGB',(W,H),'white'); x=0
for t in tiles: sh.paste(t,(x,0)); x+=t.width
sh.save(out,quality=88); print(out, sh.size)
