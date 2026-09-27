import sys, json, struct, io, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
path, pat = sys.argv[1], sys.argv[2]
b=open(path,'rb').read(); L=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+L])
binstart=20+L+8
def img(tex_index):
    t=j['textures'][tex_index]; src=t.get('source')
    if src is None: src=(t.get('extensions',{}).get('EXT_texture_webp') or {}).get('source')
    if src is None: return None, 'no source'
    im=j['images'][src]; bv=j['bufferViews'][im['bufferView']]
    data=b[binstart+bv.get('byteOffset',0): binstart+bv.get('byteOffset',0)+bv['byteLength']]
    return Image.open(io.BytesIO(data)), im.get('mimeType')
seen=set()
for i,m in enumerate(j['materials']):
    if pat not in m.get('name',''): continue
    pbr=m.get('pbrMetallicRoughness',{})
    print(f"#{i} {m['name']} alpha={m.get('alphaMode','OPAQUE')} cutoff={m.get('alphaCutoff')} dbl={m.get('doubleSided')} factor={pbr.get('baseColorFactor')} rough={pbr.get('roughnessFactor')} metal={pbr.get('metallicFactor')} normal={'normalTexture' in m} ext={list(m.get('extensions',{}).keys())} extras={list((m.get('extras') or {}).keys())}")
    bt=pbr.get('baseColorTexture')
    if bt and bt['index'] not in seen:
        seen.add(bt['index'])
        im,mt=img(bt['index'])
        if im is None: print('   baseColor texture: ',mt); continue
        a=np.asarray(im.convert('RGBA')); al=a[...,3].astype(int); rgb=a[...,:3].astype(int)
        print(f"   baseColor tex #{bt['index']} {mt} {im.size} mode={im.mode} alpha: 0={100*(al==0).mean():.1f}% 1-254={100*((al>0)&(al<255)).mean():.1f}% 255={100*(al==255).mean():.1f}%  mean alpha of ink(>0)={al[al>0].mean() if (al>0).any() else 0:.0f}  rgb mean(ink)={rgb[al>0].mean(0).round() if (al>0).any() else '-'} texCoordTransform={bt.get('extensions',{}).get('KHR_texture_transform')}")
        if len(sys.argv)>3: im.save(sys.argv[3]+f"-tex{bt['index']}.png")
