import { writeFileSync } from 'node:fs'
const names = process.argv.slice(2)
for (const n of names) {
  const url = `https://media.wear-run.help/${n}-optimized.glb`
  const h = await fetch(url, { headers: { Range: 'bytes=0-19' } })
  const b = Buffer.from(await h.arrayBuffer())
  const total = b.readUInt32LE(8),
    jsonLen = b.readUInt32LE(12)
  const r = await fetch(url, { headers: { Range: `bytes=20-${20 + jsonLen - 1}` } })
  const j = Buffer.from(await r.arrayBuffer()).toString('utf8')
  writeFileSync(`${process.env.S}/glb/${n}.json`, j)
  console.log(
    n,
    'status',
    h.status,
    r.status,
    'total MB',
    (total / 1048576).toFixed(2),
    'json KB',
    (jsonLen / 1024).toFixed(0),
  )
}
