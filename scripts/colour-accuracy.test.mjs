import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hexToLab } from '../packages/shared/src/deltaE.ts'
import {
  ALPHA_MIN,
  FLAG_ABOVE,
  formatTable,
  garmentLabs,
  isFlagged,
  isOwnHttpsUrl,
  median,
  medianLab,
  parseArgs,
  pickImage,
  productSlugsFromSitemap,
  scoreColour,
  sortWorstFirst,
} from './colour-accuracy.mjs'

/** A width x height RGBA picture, every pixel from `paint(x, y)` -> [r, g, b, a]. */
function picture(width, height, paint) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(paint(x, y), (y * width + x) * 4)
  }
  return data
}

test('median: odd count, even count, unsorted input, and nothing', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
  assert.equal(median([10, -5, 7, 7, 100]), 7)
  assert.throws(() => median([]))
})

test('median is not thrown by one extreme value, which a mean would be', () => {
  assert.equal(median([50, 51, 52, 53, 100000]), 52)
})

test('medianLab takes L, a and b separately', () => {
  const m = medianLab([
    { L: 10, a: 1, b: 9 },
    { L: 20, a: 5, b: 1 },
    { L: 30, a: 3, b: 5 },
  ])
  assert.deepEqual(m, { L: 20, a: 3, b: 5 })
})

test('garment pixels, transparent picture: only the opaque pixels count', () => {
  // 10 x 10, empty (alpha 0) except a 4 x 4 red square; one square pixel is a half-transparent
  // fringe that must not count, and the empty pixels carry green RGB that must not leak in.
  const rgba = picture(10, 10, (x, y) => {
    const inside = x >= 3 && x < 7 && y >= 3 && y < 7
    if (!inside) return [0, 255, 0, 0]
    return x === 3 && y === 3 ? [255, 0, 0, 100] : [255, 0, 0, 255]
  })
  const { labs, method, sampled } = garmentLabs(rgba, 10, 10, { step: 1 })
  assert.equal(method, 'alpha')
  assert.equal(sampled, 100)
  assert.equal(labs.length, 15)
  const red = hexToLab('#ff0000')
  for (const lab of labs) assert.deepEqual(lab, red)
})

test('the alpha cut-off is the one the script documents', () => {
  const edge = picture(2, 1, (x) => (x === 0 ? [9, 9, 9, ALPHA_MIN] : [9, 9, 9, ALPHA_MIN - 1]))
  assert.equal(garmentLabs(edge, 2, 1, { step: 1 }).labs.length, 1)
})

test('garment pixels, opaque picture: whatever differs from the corner colour', () => {
  // A white page with a navy 4 x 4 garment, and faint page noise (ΔE well under 6) that must
  // stay background.
  const navy = [20, 30, 90, 255]
  const rgba = picture(10, 10, (x, y) => {
    if (x >= 3 && x < 7 && y >= 3 && y < 7) return navy
    return (x + y) % 2 === 0 ? [255, 255, 255, 255] : [253, 253, 253, 255]
  })
  const { labs, method } = garmentLabs(rgba, 10, 10, { step: 1 })
  assert.equal(method, 'corner')
  assert.equal(labs.length, 16)
  assert.deepEqual(labs[0], hexToLab('#141e5a'))
})

test('one odd corner pixel does not become the background', () => {
  // The top-left pixel is black, the other three corners are white paper: the median of the
  // four corners is paper, so the paper is background and the black pixel is garment.
  const rgba = picture(8, 8, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
  const { labs } = garmentLabs(rgba, 8, 8, { step: 1 })
  assert.equal(labs.length, 1)
})

test('sampling by a step looks at a thinner grid but finds the same garment colour', () => {
  const rgba = picture(30, 30, (x, y) =>
    x >= 6 && x < 24 && y >= 6 && y < 24 ? [200, 40, 40, 255] : [0, 0, 0, 0],
  )
  const dense = garmentLabs(rgba, 30, 30, { step: 1 })
  const thin = garmentLabs(rgba, 30, 30, { step: 3 })
  assert.equal(dense.sampled, 900)
  assert.equal(thin.sampled, 100)
  assert.ok(thin.labs.length < dense.labs.length)
  assert.deepEqual(medianLab(thin.labs), medianLab(dense.labs))
})

test('scoreColour: a swatch equal to the cloth scores 0, a different colour scores high', () => {
  const rgba = picture(10, 10, (x, y) =>
    x >= 2 && x < 8 && y >= 2 && y < 8 ? [130, 83, 83, 255] : [0, 0, 0, 0],
  )
  const garment = garmentLabs(rgba, 10, 10, { step: 1 })
  const same = scoreColour('#825353', garment)
  assert.equal(same.clothHex, '#825353')
  assert.ok(same.deltaE < 0.01, `ΔE ${same.deltaE}`)
  // NEGATIVE CONTROL: the same cloth against a green dot must be far apart and flagged.
  const wrong = scoreColour('#8fde60', garment)
  assert.ok(wrong.deltaE > 30, `ΔE ${wrong.deltaE}`)
  assert.equal(isFlagged(wrong), true)
})

test('scoreColour refuses a picture with no garment in it', () => {
  const empty = garmentLabs(
    picture(10, 10, () => [0, 0, 0, 0]),
    10,
    10,
    { step: 1 },
  )
  assert.throws(() => scoreColour('#ffffff', empty), /only 0 of 100/)
})

test('sortWorstFirst orders by delta-E descending, keeps ties in order, and does not mutate', () => {
  const rows = [
    { id: 'a', deltaE: 3 },
    { id: 'b', deltaE: 12 },
    { id: 'c', deltaE: 3 },
    { id: 'd', deltaE: 40 },
  ]
  const sorted = sortWorstFirst(rows)
  assert.deepEqual(
    sorted.map((r) => r.id),
    ['d', 'b', 'a', 'c'],
  )
  assert.deepEqual(
    rows.map((r) => r.id),
    ['a', 'b', 'c', 'd'],
  )
})

test('the flag is strictly above 10', () => {
  assert.equal(FLAG_ABOVE, 10)
  assert.equal(isFlagged({ deltaE: 10 }), false)
  assert.equal(isFlagged({ deltaE: 10.0001 }), true)
  assert.equal(isFlagged({ deltaE: 0 }), false)
})

test('formatTable: header, one line per row, FLAG only where flagged, columns line up', () => {
  const rows = sortWorstFirst([
    {
      product: 'rxps',
      colour: 'Claret Red',
      slug: 'wine',
      swatch: '#825353',
      clothHex: '#6d3735',
      deltaE: 12.34,
      image: 'poster',
    },
    {
      product: 'r-afp',
      colour: 'Sky',
      slug: 'sky',
      swatch: '#a0c4e8',
      clothHex: '#9fc3e6',
      deltaE: 0.5,
      image: 'render',
    },
  ])
  const lines = formatTable(rows).split('\n')
  assert.equal(lines.length, 4)
  assert.match(lines[0], /^DELTA-E +FLAG +PRODUCT +COLOUR +SLUG +SWATCH +CLOTH +IMAGE$/)
  assert.match(lines[2], /^ *12\.3 +FLAG +rxps +Claret Red +wine +#825353 +#6d3735 +poster$/)
  assert.doesNotMatch(lines[3], /FLAG/)
  assert.match(lines[3], /^ *0\.5 +r-afp +Sky/)
  // The PRODUCT column starts at the same character on every line.
  const start = lines[0].indexOf('PRODUCT')
  assert.equal(lines[2].indexOf('rxps'), start)
  assert.equal(lines[3].indexOf('r-afp'), start)
})

const SITEMAP = `<?xml version="1.0"?><urlset>
<url><loc>https://wear-run.com</loc></url>
<url><loc>https://wear-run.com/products</loc></url>
<url><loc>https://wear-run.com/products/r-xmp/wine</loc></url>
<url><loc>https://wear-run.com/products/rxps/wine</loc></url>
<url><loc>https://wear-run.com/products/rxps</loc></url>
<url><loc>https://wear-run.com/guides/products/not-a-garment</loc></url>
<url><loc>https://other.example/products/evil/red</loc></url>
<url><loc>https://wear-run.com/products/Bad_Slug/red</loc></url>
<url><loc>not a url</loc></url>
</urlset>`

test('productSlugsFromSitemap: garments on this host only, once each, valid slugs only', () => {
  assert.deepEqual(productSlugsFromSitemap(SITEMAP, 'https://wear-run.com'), ['r-xmp', 'rxps'])
})

test('pickImage: poster first by default, then the renders; own hosts only', () => {
  const colour = {
    poster: { url: 'https://media.wear-run.com/x-poster.webp' },
    renderScreen: { url: 'https://media.wear-run.com/x-render-screen.webp' },
    render: { url: 'https://media.wear-run.com/x-render.webp' },
  }
  assert.deepEqual(pickImage(colour), { url: colour.poster.url, kind: 'poster' })
  assert.equal(pickImage(colour, 'render')?.kind, 'render-screen')
  assert.equal(pickImage({ poster: null, render: colour.render })?.kind, 'render')
  assert.equal(pickImage({ poster: null, render: null }), null)
  // NEGATIVE CONTROL: an address off our hosts, or not https, is never fetched.
  assert.equal(pickImage({ poster: { url: 'https://evil.example/p.webp' } }), null)
  assert.equal(pickImage({ poster: { url: 'http://media.wear-run.com/p.webp' } }), null)
  assert.equal(isOwnHttpsUrl('https://media.wear-run.com.evil.example/p.webp'), false)
  assert.equal(isOwnHttpsUrl('https://media.wear-run.help/p.webp'), true)
})

test('parseArgs: the origin is required, the API and picture have defaults', () => {
  assert.deepEqual(parseArgs(['--origin=https://wear-run.com/']), {
    origin: 'https://wear-run.com',
    api: 'https://cms.wear-run.help',
    prefer: 'poster',
  })
  assert.equal(parseArgs(['--origin=https://x.test', '--image=render']).prefer, 'render')
  assert.throws(() => parseArgs([]), /--origin/)
  assert.throws(() => parseArgs(['--origin=https://x.test', '--image=bogus']), /--image/)
})
