'use client'

import { containedBox, type DyeRun, playDye, readDyeTiming } from '@run-apparel/shared'
import { useEffect } from 'react'

/**
 * №02's cards turn colour with the dye (owner, 2026-10-26: one dye everywhere a garment changes
 * colour; packages/shared/src/dyePlayer.ts). A card opens in CSS alone (site.css, D44): from 1440px
 * with a pointer that can hover, a hovered or keyboard-focused card shows its garment's other colour.
 * Until then the two pictures cross-faded, the double image the owner turned down for №03 on
 * 2026-10-19. This lays the picture that is going over the one that is coming and soaks it away from
 * the opened colour's dot: the full dye as a card opens, the short one as it closes. Without
 * scripting, or under reduced motion, the cross-fade is what a visitor sees, as before.
 */
const OPENS = '(min-width: 1440px) and (hover: hover) and (pointer: fine)'

/** The longest the going picture is held over a coming one still loading. */
const HOLD_MS = 1500

/** Settles once `picture` has loaded, or after `HOLD_MS`. */
function loaded(picture: HTMLImageElement): Promise<void> {
  return new Promise((done) => {
    const started = performance.now()
    const look = () => {
      if ((picture.complete && picture.naturalWidth > 0) || performance.now() - started > HOLD_MS) {
        done()
      } else {
        requestAnimationFrame(look)
      }
    }
    look()
  })
}

export function FamilyDye() {
  useEffect(() => {
    const opens = matchMedia(OPENS)
    const runs = new Map<HTMLElement, DyeRun>()
    const done = new AbortController()

    const play = (card: HTMLElement, opening: boolean) => {
      runs.get(card)?.cancel()
      runs.delete(card)
      if (!opens.matches || card.hasAttribute('data-dismissed')) return
      const first = card.querySelector<HTMLImageElement>(
        '.family-card__img:not(.family-card__img--open)',
      )
      const second = card.querySelector<HTMLImageElement>('.family-card__img--open')
      const layer = card.querySelector<HTMLCanvasElement>('.family-card__media > .dye-layer')
      const going = opening ? first : second
      const coming = opening ? second : first
      if (!layer || !going || !coming || !going.complete || !going.naturalWidth) return
      const style = getComputedStyle(going)
      const drawn = containedBox(
        { width: going.offsetWidth, height: going.offsetHeight },
        {
          top: Number.parseFloat(style.paddingTop) || 0,
          right: Number.parseFloat(style.paddingRight) || 0,
          bottom: Number.parseFloat(style.paddingBottom) || 0,
          left: Number.parseFloat(style.paddingLeft) || 0,
        },
        { width: going.naturalWidth, height: going.naturalHeight },
      )
      if (!drawn) return
      Object.assign(layer.style, {
        left: `${going.offsetLeft + drawn.x}px`,
        top: `${going.offsetTop + drawn.y}px`,
        width: `${drawn.width}px`,
        height: `${drawn.height}px`,
      })
      // The opened colour's dot: where the dye starts, and its colour for the wet edge.
      const dot = card.querySelector<HTMLElement>('.family-card__dots > .is-shown')
      const at = dot?.getBoundingClientRect()
      const box = layer.getBoundingClientRect()
      const point =
        at && at.width > 0
          ? { x: at.left + at.width / 2 - box.left, y: at.top + at.height / 2 - box.top }
          : null
      runs.set(
        card,
        playDye({
          layer,
          old: going,
          point,
          swatch: opening ? dot?.style.getPropertyValue('--swatch') || null : null,
          kind: opening ? 'full' : 'short',
          timing: readDyeTiming((token) => getComputedStyle(layer).getPropertyValue(token)),
          after: loaded(coming),
        }),
      )
    }

    /*
     * ⚠️ THE PICTURES' OWN CROSS-FADE IS SWITCHED OFF WHERE THE DYE RUNS (whole-branch review,
     * 2026-10-26). site.css fades the two pictures over --settle as a card opens, and under a dye of
     * about 400 ms the soaked region showed both garments at once: the double image the dye replaces.
     * Inline, so a page without this script keeps the cross-fade.
     */
    const pictures = [...document.querySelectorAll<HTMLElement>('.family-card .family-card__img')]
    for (const picture of pictures) picture.style.transition = 'none'
    for (const card of document.querySelectorAll<HTMLElement>('.family-card')) {
      const options = { signal: done.signal }
      card.addEventListener('pointerenter', () => play(card, true), options)
      card.addEventListener('pointerleave', () => play(card, false), options)
      card.addEventListener(
        'focusin',
        (event) => {
          if ((event.target as Element).matches('.family-card__link:focus-visible'))
            play(card, true)
        },
        options,
      )
      card.addEventListener(
        'focusout',
        (event) => {
          if ((event.target as Element).matches('.family-card__link')) play(card, false)
        },
        options,
      )
    }
    return () => {
      done.abort()
      for (const picture of pictures) picture.style.transition = ''
      for (const run of runs.values()) run.cancel()
    }
  }, [])
  return null
}
