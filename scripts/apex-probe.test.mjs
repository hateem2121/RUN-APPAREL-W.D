import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TARGETS, probeHeaders } from './apex-probe.mjs'

/*
 * 25 Oct 2026: the probe's ranged GET of https://wear-run.com/ was refused by the page store, so
 * each probe drew the home page from scratch (234-860 ms of processor time, 9 of the home page's
 * 84 slow opens that day). The site's page is asked for whole; everything else keeps the range.
 */
test('asks for the site page whole, so the page store can answer it', () => {
  const site = TARGETS.find((target) => target.kind === 'site')
  assert.ok(site, 'no site target')
  assert.deepEqual(probeHeaders(site), { 'user-agent': 'run-apparel-apex-probe' })
})

// NEGATIVE CONTROL: every other target still caps what it can be sent.
test('keeps the 4 KB range on every other target', () => {
  const others = TARGETS.filter((target) => target.kind !== 'site')
  assert.ok(others.length > 3)
  for (const target of others) assert.equal(probeHeaders(target).Range, 'bytes=0-4095', target.name)
})
