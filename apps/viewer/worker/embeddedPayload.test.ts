import type { ViewerApiSuccess } from '@run-apparel/shared'
import { viewerApiPath } from '@run-apparel/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { EMBEDDED_PAYLOAD_ID as APP_ID, takeEmbeddedPayload } from '../src/lib/embeddedPayload'
import { EMBEDDED_PAYLOAD_ID, embeddedPayloadScript } from './embeddedPayload'

/**
 * The payload a search robot's page carries (2026-10-21), tested as a round trip: the
 * Worker's markup goes through a real HTML parser (jsdom's), and the app's reader takes it
 * back out. Either half alone could pass while the pair fails, for example a payload whose
 * description closes the script early, which only the parser can show.
 */

const PATH = viewerApiPath('r-au', 'bone')

/** Hostile on purpose: a garment description is typed by a person into the CMS. */
const HOSTILE = 'Light shell </script><img src=x onerror="window.__pwned=1"> <!-- and a comment'

function payload(description = 'A light running shell.'): ViewerApiSuccess {
  return {
    product: { slug: 'r-au', productCode: 'R-AU', name: 'Aero Shell', description },
    selectedColourway: { slug: 'bone', name: 'Bone' },
  } as unknown as ViewerApiSuccess
}

/** Put the Worker's markup in the head the way a browser would parse it. */
function serve(markup: string): void {
  document.head.insertAdjacentHTML('beforeend', markup)
}

afterEach(() => {
  document.head.innerHTML = ''
  delete (window as { __pwned?: number }).__pwned
})

describe('the payload a robot is handed', () => {
  it('reaches the app exactly as the Worker had it', () => {
    serve(embeddedPayloadScript(payload(), PATH))
    expect(takeEmbeddedPayload(PATH)).toEqual(payload())
  })

  it('survives a description that tries to close the script', () => {
    serve(embeddedPayloadScript(payload(HOSTILE), PATH))
    // One element in the head: the description did not end the block and leave markup behind.
    expect(document.head.children).toHaveLength(1)
    expect(document.head.querySelector('img')).toBeNull()
    expect(takeEmbeddedPayload(PATH)).toEqual(payload(HOSTILE))
  })

  it('is data the browser never runs, so the page CSP has nothing to allow', () => {
    serve(embeddedPayloadScript(payload(), PATH))
    expect(document.getElementById(EMBEDDED_PAYLOAD_ID)?.getAttribute('type')).toBe(
      'application/json',
    )
  })

  it('is read once, so a retry or a colour change fetches fresh', () => {
    serve(embeddedPayloadScript(payload(), PATH))
    expect(takeEmbeddedPayload(PATH)).not.toBeNull()
    expect(takeEmbeddedPayload(PATH)).toBeNull()
    expect(document.getElementById(EMBEDDED_PAYLOAD_ID)).toBeNull()
  })

  it('is ignored when it answers a different request', () => {
    serve(embeddedPayloadScript(payload(), viewerApiPath('r-au', 'olive')))
    expect(takeEmbeddedPayload(PATH)).toBeNull()
  })

  it('is ignored when it does not parse, and the app fetches as before', () => {
    serve(
      `<script type="application/json" id="${EMBEDDED_PAYLOAD_ID}" data-path="${PATH}">{</script>`,
    )
    expect(takeEmbeddedPayload(PATH)).toBeNull()
  })

  it('is absent for a person, whose page the Worker never rewrites', () => {
    expect(takeEmbeddedPayload(PATH)).toBeNull()
  })

  it('uses the same element id on both sides', () => {
    expect(APP_ID).toBe(EMBEDDED_PAYLOAD_ID)
  })
})
