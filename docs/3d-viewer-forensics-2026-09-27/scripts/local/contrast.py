# pattern strength = spread of brightness after removing slow shading (lighting), inside one box
import sys, numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS=None
def crop_clo(im):
    a=np.asarray(im.convert('L')); ys,xs=np.nonzero(a>18); return im.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
def crop_live(im):
    a=np.asarray(im.convert('RGB')).astype(int); d=np.abs(a-a[3,3]).sum(2); m=d>40
    m[:, :int(.18*m.shape[1])]=False; m[:, int(.82*m.shape[1]):]=False; m[int(.9*m.shape[0]):,:]=False
    ys,xs=np.nonzero(m); return im.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
def strength(im, box):
    w,h=im.size; im=im.crop((int(box[0]*w),int(box[1]*h),int(box[2]*w),int(box[3]*h))).convert('L').resize((400,400))
    a=np.asarray(im.filter(ImageFilter.GaussianBlur(4))).astype(float); bl=np.asarray(im.filter(ImageFilter.GaussianBlur(40))).astype(float)
    r=a/np.maximum(bl,1)
    return (np.percentile(r,90)-np.percentile(r,10))*100, a.mean()
box=[float(x) for x in sys.argv[1].split(',')]
for kind,path in zip(sys.argv[2::2], sys.argv[3::2]):
    im=Image.open(path).convert('RGB'); im=crop_clo(im) if kind=='clo' else crop_live(im)
    s,m=strength(im,box); print(f'{kind:5} {path.split("/")[-1][:40]:40} pattern spread {s:5.1f}% (mean brightness {m:.0f})')
