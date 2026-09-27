import { readdirSync, readFileSync } from 'node:fs'
const dir = `${process.env.S}/glb`
const dims = (b) => {
  // WebP RIFF
  const t = b.toString('ascii', 12, 16)
  if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
  if (t === 'VP8L') {
    const v = b.readUInt32LE(21)
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]
  }
  if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
  return [0, 0]
}
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const name = f.replace('.json', '')
  const j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
  const url = `https://media.wear-run.help/${name}-optimized.glb`
  const jsonLen = Buffer.byteLength(readFileSync(`${dir}/${f}`))
  const binStart = 20 + jsonLen + 8
  // map image -> role
  const role = new Map()
  const tex = j.textures ?? []
  const src = (t) => t?.extensions?.EXT_texture_webp?.source ?? t?.source
  for (const m of j.materials ?? []) {
    const art = m.alphaMode === 'MASK' || m.alphaMode === 'BLEND'
    const b = m.pbrMetallicRoughness?.baseColorTexture
    if (b) role.set(src(tex[b.index]), (role.get(src(tex[b.index])) ?? '') + (art ? 'P' : 'F'))
    if (m.normalTexture)
      role.set(
        src(tex[m.normalTexture.index]),
        `${role.get(src(tex[m.normalTexture.index])) ?? ''}N`,
      )
  }
  const out = { print: [], fabric: [], normal: [] }
  for (const [i, img] of (j.images ?? []).entries()) {
    const bv = j.bufferViews[img.bufferView]
    const off = binStart + (bv.byteOffset ?? 0)
    const r = await fetch(url, { headers: { Range: `bytes=${off}-${off + 40}` } })
    const [w, h] = dims(Buffer.from(await r.arrayBuffer()))
    const ro = role.get(i) ?? ''
    const k = ro.includes('P') ? 'print' : ro.includes('N') ? 'normal' : 'fabric'
    out[k].push(Math.max(w, h))
  }
  const s = (a) => (a.length ? `${a.length} (max ${Math.max(...a)}, min ${Math.min(...a)})` : '0')
  console.log(
    name.replace(/-2026.*/, ''),
    '| print pics',
    s(out.print),
    '| fabric pics',
    s(out.fabric),
    '| weave maps',
    s(out.normal),
  )
}
