import { readGlb } from './src/io.ts'
const file = process.env.GLB,
  SEARCH = 0.01
const { document } = await readGlb(file)
const root = document.getRoot()
const meshIdx = new Map(root.listMeshes().map((m, i) => [m, i]))
const tris = [],
  meta = []
const T = (m, x, y, z, w) => [
  m[0] * x + m[4] * y + m[8] * z + m[12] * w,
  m[1] * x + m[5] * y + m[9] * z + m[13] * w,
  m[2] * x + m[6] * y + m[10] * z + m[14] * w,
]
function walk(node) {
  const w = node.getWorldMatrix(),
    mesh = node.getMesh()
  if (mesh)
    mesh.listPrimitives().forEach((p, pi) => {
      const pos = p.getAttribute('POSITION'),
        nor = p.getAttribute('NORMAL'),
        ind = p.getIndices()
      if (!pos) return
      const self = meta.length
      meta.push({
        key: `m${meshIdx.get(mesh)}/p${pi}`,
        name: p.getMaterial()?.getName() ?? '',
        alpha: p.getMaterial()?.getAlphaMode(),
      })
      const n = ind ? ind.getCount() : pos.getCount(),
        A = [0, 0, 0],
        B = [0, 0, 0],
        C = [0, 0, 0],
        NA = [0, 0, 0],
        NB = [0, 0, 0],
        NC = [0, 0, 0]
      for (let i = 0; i + 2 < n; i += 3) {
        const i0 = ind ? ind.getScalar(i) : i,
          i1 = ind ? ind.getScalar(i + 1) : i + 1,
          i2 = ind ? ind.getScalar(i + 2) : i + 2
        pos.getElement(i0, A)
        pos.getElement(i1, B)
        pos.getElement(i2, C)
        const a = T(w, ...A, 1),
          b = T(w, ...B, 1),
          c = T(w, ...C, 1)
        let nn
        if (nor) {
          nor.getElement(i0, NA)
          nor.getElement(i1, NB)
          nor.getElement(i2, NC)
          nn = T(w, NA[0] + NB[0] + NC[0], NA[1] + NB[1] + NC[1], NA[2] + NB[2] + NC[2], 0)
        } else {
          const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
            v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
          nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        }
        const l = Math.hypot(...nn) || 1
        const cr = [
          (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
          (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
          (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
        ]
        tris.push({ a, b, c, n: nn.map((x) => x / l), prim: self, area: Math.hypot(...cr) / 2 })
      }
    })
  for (const ch of node.listChildren()) walk(ch)
}
for (const s of root.listScenes()) for (const n of s.listChildren()) walk(n)
const cell = 0.02,
  grid = new Map()
tris.forEach((t, i) => {
  const lo = [0, 1, 2].map((k) => Math.min(t.a[k], t.b[k], t.c[k])),
    hi = [0, 1, 2].map((k) => Math.max(t.a[k], t.b[k], t.c[k]))
  for (let x = Math.floor(lo[0] / cell); x <= Math.floor(hi[0] / cell); x++)
    for (let y = Math.floor(lo[1] / cell); y <= Math.floor(hi[1] / cell); y++)
      for (let z = Math.floor(lo[2] / cell); z <= Math.floor(hi[2] / cell); z++) {
        const k = `${x},${y},${z}`
        ;(grid.get(k) ?? grid.set(k, []).get(k)).push(i)
      }
})
function cast(p, d, self) {
  let best = Infinity,
    bt = null
  const seen = new Set()
  for (let s = 0; s <= SEARCH + cell; s += cell / 2) {
    const q = [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s]
    const k = `${Math.floor(q[0] / cell)},${Math.floor(q[1] / cell)},${Math.floor(q[2] / cell)}`
    for (const i of grid.get(k) ?? []) {
      if (seen.has(i)) continue
      seen.add(i)
      const t = tris[i]
      if (t.prim === self) continue
      const e1 = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]],
        e2 = [t.c[0] - t.a[0], t.c[1] - t.a[1], t.c[2] - t.a[2]]
      const h = [
          d[1] * e2[2] - d[2] * e2[1],
          d[2] * e2[0] - d[0] * e2[2],
          d[0] * e2[1] - d[1] * e2[0],
        ],
        det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]
      if (Math.abs(det) < 1e-14) continue
      const inv = 1 / det,
        sv = [p[0] - t.a[0], p[1] - t.a[1], p[2] - t.a[2]],
        u = inv * (sv[0] * h[0] + sv[1] * h[1] + sv[2] * h[2])
      if (u < 0 || u > 1) continue
      const qv = [
          sv[1] * e1[2] - sv[2] * e1[1],
          sv[2] * e1[0] - sv[0] * e1[2],
          sv[0] * e1[1] - sv[1] * e1[0],
        ],
        v = inv * (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2])
      if (v < 0 || u + v > 1) continue
      const hit = inv * (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2])
      if (hit > 1e-7 && hit < best && hit <= SEARCH) {
        best = hit
        bt = t
      }
    }
  }
  return bt ? { dist: best, tri: bt } : null
}
const targets = (process.env.TARGETS || '').split(',')
meta.forEach((m, pi) => {
  if (!targets.includes(m.key)) return
  const list = tris.filter((t) => t.prim === pi)
  const total = list.reduce((s, t) => s + t.area, 0)
  const step = Math.max(1, Math.floor(list.length / 4000))
  const by = new Map()
  let sampledArea = 0
  for (let i = 0; i < list.length; i += step) {
    const t = list[i]
    sampledArea += t.area
    const p = [0, 1, 2].map((k) => (t.a[k] + t.b[k] + t.c[k]) / 3)
    const h = cast(p, t.n, pi)
    if (!h) continue
    const hm = meta[h.tri.prim],
      key = `${hm.key} ${hm.name} [${hm.alpha}]`
    const e = by.get(key) ?? by.set(key, { area: 0, d: [], dot: [] }).get(key)
    e.area += t.area
    e.d.push(h.dist * 1000)
    e.dot.push(t.n[0] * h.tri.n[0] + t.n[1] * h.tri.n[1] + t.n[2] * h.tri.n[2])
  }
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]
  console.log(
    `\n${m.key} ${m.name} [${m.alpha}] triangles=${list.length} area=${(total * 1e4).toFixed(1)} cm2`,
  )
  for (const [k, e] of [...by].sort((a, b) => b[1].area - a[1].area)) {
    const ds = e.d.slice().sort((x, y) => x - y)
    console.log(
      `   in front: ${k.slice(0, 60).padEnd(60)} covers ${((100 * e.area) / sampledArea).toFixed(1)}% of it  gap median ${med(e.d).toFixed(2)} mm (min ${ds[0].toFixed(2)}, p90 ${ds[Math.floor(ds.length * 0.9)].toFixed(2)})  facing ${med(e.dot).toFixed(3)}`,
    )
  }
})
