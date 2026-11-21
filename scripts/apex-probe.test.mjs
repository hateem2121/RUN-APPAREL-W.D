import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { evaluate, TARGETS, probeHeaders } from './apex-probe.mjs'

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

/*
 * 21 Nov 2026, 09:52 to 11:05 UTC: every static file of the site answered 404 on wear-run.com
 * (the front door asked the page store for them). These are the answers of that hour and of the
 * minute after the door was switched off, as curl read them.
 */
const files = TARGETS.filter((target) => target.kind === 'file')

test('the site’s static files are asked for, and each one exists in apps/cms/public', () => {
  assert.equal(files.length, 2)
  for (const target of files) {
    const { hostname, pathname } = new URL(target.url)
    assert.equal(hostname, 'wear-run.com')
    const onDisk = join(import.meta.dirname, '..', 'apps', 'cms', 'public', pathname)
    assert.ok(existsSync(onDisk), `${pathname} is not in apps/cms/public`)
  }
})

test('a served file passes, whole or as the first 4 KB', () => {
  const served = evaluate([
    { name: 'site favicon', kind: 'file', status: 206, contentType: 'image/vnd.microsoft.icon' },
    { name: 'site photo', kind: 'file', status: 200, contentType: 'image/webp' },
  ])
  assert.deepEqual(served.failures, [])
})

test('negative control: the 404 page of 21 Nov fails, and so does a page sent with a 200', () => {
  const thatHour = evaluate([
    { name: 'site photo', kind: 'file', status: 404, contentType: 'text/html; charset=utf-8' },
  ])
  assert.equal(thatHour.ok, false)
  assert.match(thatHour.failures[0], /HTTP 404, expected the file/)
  const aPage = evaluate([
    { name: 'site photo', kind: 'file', status: 200, contentType: 'text/html; charset=utf-8' },
  ])
  assert.equal(aPage.ok, false)
  assert.match(aPage.failures[0], /expected an image/)
})
