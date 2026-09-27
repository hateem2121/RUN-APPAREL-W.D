import sys, json, struct, re, collections
path=sys.argv[1]; b=open(path,'rb').read(); L=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+L])
area=collections.Counter()
for me in j['meshes']:
    for p in me['primitives']:
        area[p['material']]+=j['accessors'][p['indices']]['count']//3 if 'indices' in p else 0
seen=set()
for i,_ in area.most_common(12):
    m=j['materials'][i]; base=re.sub(r'_\d+(__overlay)?$','',m['name'])
    if base in seen: continue
    seen.add(base); p=m.get('pbrMetallicRoughness',{}); e=m.get('extensions',{})
    sp=e.get('KHR_materials_specular',{})
    print(f"  {base[:30]:30} tris={area[i]:7d} metal={p.get('metallicFactor','ABSENT(=1)')} rough={p.get('roughnessFactor','ABSENT(=1)')} MRtex={'metallicRoughnessTexture' in p} normal={'normalTexture' in m} spec={sp.get('specularFactor','-')} specColor={sp.get('specularColorFactor','-')} specTex={'specularTexture' in sp} alpha={m.get('alphaMode','OPAQUE')}")
