import { readdirSync, readFileSync } from 'node:fs'
const dir = `${process.env.S}/glb`
console.log(
  'garment | mats | OPAQUE/MASK/BLEND | depthBias(O/M/B) | BLEND w/o bias | dblSided | normalTex | extUsed | minFilter | gridMm(max)',
)
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
  const m = j.materials ?? []
  const c = { OPAQUE: 0, MASK: 0, BLEND: 0 },
    db = { OPAQUE: 0, MASK: 0, BLEND: 0 }
  let ds = 0,
    nt = 0
  const blendNoBias = []
  for (const x of m) {
    const a = x.alphaMode ?? 'OPAQUE'
    c[a]++
    if (x.extras?.depthBias?.enabled) db[a]++
    else if (a === 'BLEND') blendNoBias.push(x.name)
    if (x.doubleSided) ds++
    if (x.normalTexture) nt++
  }
  const samp = (j.samplers ?? []).map((s) => s.minFilter ?? 'default')
  let grid = 0
  for (const n of j.nodes ?? [])
    if (n.scale && n.mesh !== undefined)
      grid = Math.max(grid, (Math.max(...n.scale.map(Math.abs)) / 8191) * 1000)
  console.log(
    [
      f.replace(/-2026.*/, ''),
      m.length,
      `${c.OPAQUE}/${c.MASK}/${c.BLEND}`,
      `${db.OPAQUE}/${db.MASK}/${db.BLEND}`,
      blendNoBias.length,
      ds,
      nt,
      (j.extensionsUsed ?? []).map((e) => e.replace(/^(KHR_|EXT_)/, '')).join(','),
      [...new Set(samp)].join('/'),
      grid.toFixed(3),
    ].join(' | '),
  )
}
