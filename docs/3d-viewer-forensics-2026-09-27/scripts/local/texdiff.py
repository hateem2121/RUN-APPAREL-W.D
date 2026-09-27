import sys, json, struct, re, io
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
def load(path):
    b=open(path,'rb').read(); L=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+L]); bs=20+L+8
    def size(ti):
        t=j['textures'][ti]; s=t.get('source',(t.get('extensions',{}).get('EXT_texture_webp') or {}).get('source'))
        if s is None: return None
        im=j['images'][s]; bv=j['bufferViews'][im['bufferView']]; o=bs+bv.get('byteOffset',0)
        return Image.open(io.BytesIO(b[o:o+bv['byteLength']])).size, bv['byteLength']
    out={}
    for m in j['materials']:
        base=re.sub(r'_\d+(__overlay)?$','',m['name']); p=m.get('pbrMetallicRoughness',{})
        for slot,t in (('color',p.get('baseColorTexture')),('normal',m.get('normalTexture')),('rough',p.get('metallicRoughnessTexture'))):
            if t and (base,slot) not in out:
                r=size(t['index'])
                if r: out[(base,slot)]=r
    return out
raw,shp=load(sys.argv[1]),load(sys.argv[2])
for k in sorted(raw):
    r=raw[k]; s=shp.get(k)
    rs=f"{r[0][0]}x{r[0][1]}"; ss=f"{s[0][0]}x{s[0][1]} {s[1]/1024:.0f}KB" if s else 'MISSING'
    ratio=f"{(s[0][0]*s[0][1])/(r[0][0]*r[0][1])*100:5.1f}% px" if s else ''
    print(f"  {k[0][:32]:32} {k[1]:6} raw {rs:>11} -> shipped {ss:>18} {ratio}")
