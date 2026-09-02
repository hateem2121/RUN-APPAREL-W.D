import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { type Browser, chromium } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderHarnessPage, startHarnessServer } from './render'
import { type ReviewServerHandle, startReviewServer } from './review-server'
import { DECAL_OFFSET_FACTOR, MIN_NEAR } from './viewer-page'

/**
 * THE INSTRUMENTS, DRIVEN IN A REAL BROWSER — audit HR-7, 2026-09-02.
 *
 * Until now every test of the two local pages checked TEXT: that the page source
 * contained "Object.defineProperty(camera, 'near'". A future model-viewer that
 * renamed one internal symbol would leave every one of those tests green while the
 * page quietly stopped doing any of it. This file loads a fixture into Chromium and
 * reads the internals back: the camera's near plane must be the adaptive value, not
 * model-viewer's own pinned one, and a material that should be biased must come back
 * with polygonOffset set. The negative control is the OLD page — the harness with
 * instruments off — which must read back exactly the way the audit found it.
 *
 * ⚠️ NEEDS CHROMIUM. The unit suite runs in CI's `verify` job on a plain runner with no
 * browser, so this file SKIPS there and says so; the `artwork` job, which runs inside
 * the Playwright container, runs it explicitly (`vitest run src/instruments.browser.test.ts`).
 * A skip here is loud on purpose: a skipped browser test is not a passed one.
 */

const chromiumAvailable = (() => {
  try {
    const path = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? chromium.executablePath()
    return existsSync(path)
  } catch {
    return false
  }
})()

/**
 * A garment in miniature: a fabric panel (OPAQUE), a printed cut-out on it (MASK,
 * which three.js exposes as alphaTest > 0 — the first bias mechanism) and an opaque
 * printed layer the pipeline flagged with a depthBias record (the second mechanism,
 * which three.js copies from material extras to userData).
 */
async function fixtureGlb(dir: string): Promise<string> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const quad = (name: string, z: number, size: number) => {
    const position = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([-size, -size, z, size, -size, z, size, size, z, -size, size, z]))
      .setBuffer(buffer)
    const normal = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]))
      .setBuffer(buffer)
    const indices = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
      .setBuffer(buffer)
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('NORMAL', normal)
      .setIndices(indices)
    const mesh = doc.createMesh(name).addPrimitive(prim)
    const node = doc.createNode(name).setMesh(mesh)
    return { prim, node }
  }
  const scene = doc.createScene('scene')
  const fabric = doc.createMaterial('FABRIC 1').setBaseColorFactor([0.5, 0.2, 0.2, 1])
  const cutout = doc
    .createMaterial('RUN LOGO')
    .setBaseColorFactor([1, 1, 1, 1])
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.5)
  const overlay = doc.createMaterial('OPAQUE OVERLAY').setBaseColorFactor([0.1, 0.1, 0.9, 1])
  overlay.setExtras({
    depthBias: { enabled: true, factor: DECAL_OFFSET_FACTOR, units: DECAL_OFFSET_FACTOR },
  })
  const a = quad('panel', 0, 0.5)
  a.prim.setMaterial(fabric)
  const b = quad('print', 0.0001, 0.2)
  b.prim.setMaterial(cutout)
  const c = quad('overlay', 0.0002, 0.1)
  c.prim.setMaterial(overlay)
  for (const { node } of [a, b, c]) scene.addChild(node)
  const file = join(dir, 'instruments-fixture.glb')
  await writeFile(file, await new NodeIO().writeBinary(doc))
  return file
}

interface Probe {
  hasInstruments: boolean
  nearPlane: { installed: boolean; skipped: string } | null
  nearIsGetter: boolean
  near: number | null
  bias: { biased: number; overlays: number; unreachable: number } | null
  biased: string[]
}

const PROBE = `(() => {
  const mv = document.getElementById('mv')
  const inst = window.__instruments ?? null
  const internalCamera = (element) => {
    for (const sym of Object.getOwnPropertySymbols(element)) {
      const value = element[sym]
      if (value && value.isObject3D && value.camera) return value.camera
    }
    return null
  }
  const backingOf = (material) => {
    for (const source of [material, Object.getPrototypeOf(material)]) {
      if (!source) continue
      for (const symbol of Object.getOwnPropertySymbols(source)) {
        if (symbol.description !== 'backingThreeMaterial') continue
        const value = material[symbol]
        if (value && typeof value === 'object') return value
      }
    }
    return null
  }
  const cam = internalCamera(mv)
  const d = cam ? Object.getOwnPropertyDescriptor(cam, 'near') : null
  const biased = []
  for (const m of mv.model ? mv.model.materials : []) {
    const b = backingOf(m)
    if (b && b.polygonOffset === true) biased.push(m.name + '@' + b.polygonOffsetFactor)
  }
  return {
    hasInstruments: inst !== null,
    nearPlane: inst ? inst.nearPlane : null,
    nearIsGetter: !!(d && typeof d.get === 'function'),
    near: cam ? cam.near : null,
    bias: inst ? inst.bias : null,
    biased,
  }
})()`

describe.skipIf(!chromiumAvailable)('the instruments, read back from a real browser (HR-7)', () => {
  let browser: Browser
  let dir: string
  let glb: string
  let review: ReviewServerHandle
  const harnessServers: { close(): Promise<void> }[] = []

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'instruments-'))
    glb = await fixtureGlb(dir)
    review = await startReviewServer([dir], 0)
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : {}),
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await review?.close()
    for (const s of harnessServers) await s.close()
  })

  const harness = async (instruments: boolean) => {
    const { server, port } = await startHarnessServer(glb, renderHarnessPage({ instruments }))
    harnessServers.push({ close: () => new Promise((r) => server.close(() => r())) })
    return `http://127.0.0.1:${port}/`
  }

  const probe = async (url: string): Promise<Probe> => {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    // A string, not a function: this package's tsconfig has no DOM types, and the
    // expression only ever runs in the page.
    await page.waitForFunction(
      '(() => { const mv = document.getElementById("mv"); return !!(mv && mv.model && mv.model.materials && mv.model.materials.length) })()',
      null,
      { timeout: 60_000 },
    )
    // One painted frame after 'load', so the load-time install has run.
    await page.waitForTimeout(500)
    const result = (await page.evaluate(PROBE)) as Probe
    await page.close()
    return result
  }

  it('the render harness installs the adaptive near plane and biases both kinds of print', async () => {
    const p = await probe(await harness(true))
    expect(p.hasInstruments).toBe(true)
    expect(p.nearPlane).toEqual({ installed: true, skipped: '' })
    expect(p.nearIsGetter).toBe(true)
    // The adaptive value: never below MIN_NEAR, and well above model-viewer's pin.
    expect(p.near).toBeGreaterThanOrEqual(MIN_NEAR)
    expect(p.bias).toMatchObject({ biased: 2, overlays: 1, unreachable: 0 })
    expect(p.biased.sort()).toEqual([
      `OPAQUE OVERLAY@${DECAL_OFFSET_FACTOR}`,
      `RUN LOGO@${DECAL_OFFSET_FACTOR}`,
    ])
  }, 120_000)

  it('NEGATIVE CONTROL: the old page (instruments off) reads back exactly as the audit found it', async () => {
    const instrumented = await probe(await harness(true))
    const p = await probe(await harness(false))
    expect(p.hasInstruments).toBe(false)
    expect(p.nearIsGetter).toBe(false)
    // model-viewer's own pinned near plane: a plain number, and CLOSER than the
    // adaptive value the instrumented page computes for the same camera — which is
    // the whole defect, depth precision spent on a slab of empty space in front of
    // the garment (0.00436 m against 0.799 m on the audit's garment, HR-3).
    expect(p.near).not.toBeNull()
    expect(p.near as number).toBeLessThan(instrumented.near as number)
    expect(p.biased).toEqual([])
  }, 120_000)

  it('the review page carries the same instruments', async () => {
    const p = await probe(`${review.url}g/0/0`)
    expect(p.nearPlane).toEqual({ installed: true, skipped: '' })
    expect(p.nearIsGetter).toBe(true)
    expect(p.biased).toHaveLength(2)
  }, 120_000)
})

if (!chromiumAvailable) {
  it('⚠️ SKIPPED: no Chromium here — the artwork CI job runs this file in the Playwright container', () => {
    expect(chromiumAvailable).toBe(false)
  })
}
