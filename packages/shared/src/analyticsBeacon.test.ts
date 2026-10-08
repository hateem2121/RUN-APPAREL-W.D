import { describe, expect, it } from 'vitest'
import { AUTOMATION_UA, BEACON_SRC, beaconLoader } from './analyticsBeacon.ts'

/**
 * The beacon loader's text (`analyticsBeacon.ts`). It is RUN against fake browsers in
 * `apps/viewer/src/analyticsBeacon.test.ts`, where Node's `vm` is available; this package's
 * type check has no Node types.
 */
describe('the beacon loader text', () => {
  it('puts the token in the beacon address, encoded', () => {
    expect(beaconLoader('a b')).toContain(JSON.stringify(`${BEACON_SRC}?token=a%20b`))
  })

  it('checks webdriver and the two automation user agents before adding anything', () => {
    const loader = beaconLoader('abc')
    expect(loader.startsWith(`if(!navigator.webdriver&&!/${AUTOMATION_UA}/.test(`)).toBe(true)
    expect(AUTOMATION_UA.split('|')).toEqual(['HeadlessChrome', 'Chrome-Lighthouse'])
  })

  it('cannot close its own script element, whatever the token', () => {
    expect(beaconLoader('x";alert(1);"</script>')).not.toContain('<')
  })
})
