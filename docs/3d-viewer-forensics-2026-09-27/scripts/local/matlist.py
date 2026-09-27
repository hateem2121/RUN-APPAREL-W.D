import sys, json, struct, re, collections
path=sys.argv[1]
b=open(path,'rb').read(); L=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+L])
imgs=j.get('images',[]); tex=j.get('textures',[])
def isz(ti):
    if ti is None: return '-'
    t=tex[ti]; s=t.get('source', (t.get('extensions',{}).get('EXT_texture_webp') or {}).get('source'))
    if s is None: return 'nosrc'
    return f"img{s}"
groups=collections.OrderedDict()
for i,m in enumerate(j['materials']):
    base=re.sub(r'_\d+(__overlay)?$','',m.get('name',''))
    p=m.get('pbrMetallicRoughness',{})
    key=(base,m.get('alphaMode','OPAQUE'),round((p.get('baseColorFactor') or [1,1,1,1])[3],2),isz((p.get('baseColorTexture') or {}).get('index')),'N' if 'normalTexture' in m else '-', round(p.get('roughnessFactor',1),2))
    groups.setdefault(key,[]).append(i)
for k,v in groups.items(): print(f"{k[0][:38]:38} {k[1]:6} a={k[2]:<5} base={k[3]:6} normal={k[4]} rough={k[5]}  x{len(v)} (#{v[0]})")
