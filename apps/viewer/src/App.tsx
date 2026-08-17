import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { isViewerApiError } from '@run-apparel/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { COLOURWAY_PANEL_ID, ColourwayTabs, colourwayTabId } from './components/ColourwayTabs'
import { ContactSection, MobileActionBar, StickyContactRail } from './components/Contact'
import { CustomisationSection } from './components/CustomisationSection'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Preloader } from './components/Preloader'
import { ProductPanel } from './components/ProductPanel'
import { Stage } from './components/Stage'
import { RetiredNotice, UnavailableState } from './components/States'
import { track } from './lib/analytics'
import { fetchViewerData } from './lib/api'
import { diagnostic } from './lib/diagnostic'
import { currentRoute, onRouteChange, setColourwayUrl } from './lib/router'

type AppState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | {
      kind: 'ready'
      data: ViewerApiSuccess
      selected: ViewerColourway
      retiredNotice: string | null
    }

/**
 * Never let a retired colourway swap the garment silently.
 *
 * `retiredNotice` was `response.fallbackMessage ?? response.product.retiredMessage`,
 * and `??` only falls through on null/undefined — so an EMPTY STRING from the CMS
 * (the likeliest way a message goes missing: a field cleared rather than unset)
 * produced a falsy notice, `{retiredNotice && …}` rendered nothing, and the URL
 * was rewritten and a different colour shown with no explanation at all.
 *
 * The visitor scanned a QR code printed on a physical garment tag. Showing them a
 * different colourway without a word is the one outcome this whole fallback path
 * exists to prevent.
 */
const RETIRED_FALLBACK =
  'The colourway printed on your tag is no longer in production. This page is showing the ' +
  'current default colourway for this garment.'

export default function App() {
  const [state, setState] = useState<AppState>({ kind: 'loading' })
  const [preloaderGone, setPreloaderGone] = useState(false)
  // Hovering a colourway tab shows that colour ON the loaded model. Kept here
  // because <Stage> and <ColourwayTabs> are siblings, and deliberately separate
  // from `selected`: a preview must never move the URL or the enquiry payload.
  const [previewedColourway, setPreviewedColourway] = useState<ViewerColourway | null>(null)
  // `variantSwapReady` lived here until 2026-08-15. Its only consumer was the hover
  // thumbnail in <ColourwayTabs>, removed by owner decision; <Stage> still exposes
  // `onModelReadyChange` (optional) for the next thing that needs to know.
  const polishStarted = useRef(false)
  const loadedFor = useRef<string | null>(null)

  const load = useCallback(async () => {
    const route = currentRoute()
    if (!route) {
      setState({ kind: 'unavailable' })
      diagnostic('route-unparsed', { reason: window.location.pathname })
      return
    }
    try {
      const response = await fetchViewerData(route.productSlug, route.colourSlug)
      if (isViewerApiError(response)) {
        setState({ kind: 'unavailable' })
        // A real product that will not load and a URL nobody ever published look
        // identical on screen. They must not look identical in the diagnostics.
        diagnostic('viewer-api-error', {
          product: route.productSlug,
          variant: route.colourSlug ?? '',
          reason: response.error ?? 'unknown',
        })
        return
      }
      const retired = response.requestedColourwayUnavailable
      // Two different reasons to rewrite the URL, and only one of them is a
      // retirement. `retired` is "you asked for a colour that is gone"; a null
      // colourSlug is "/n001", where nothing was asked for and nothing is gone.
      // Both want the address bar to end up on a real, shareable colour path;
      // only the first wants the notice or the analytics event.
      if (retired || route.colourSlug === null) {
        // Silently normalise the URL to the valid default path — no redirect loops.
        setColourwayUrl(response.product.slug, response.selectedColourway.slug, true)
      }
      if (retired) {
        track('retired_colourway_fallback', { product: response.product.productCode })
      }
      setState({
        kind: 'ready',
        data: response,
        selected: response.selectedColourway,
        // `||`, not `??`, and deliberately — an empty string is the exact case
        // being fixed here. See RETIRED_FALLBACK above.
        retiredNotice: retired
          ? response.fallbackMessage || response.product.retiredMessage || RETIRED_FALLBACK
          : null,
      })
      if (loadedFor.current !== response.product.slug) {
        loadedFor.current = response.product.slug
        track('viewer_page_loaded', { product: response.product.productCode })
      }
    } catch (error) {
      setState({ kind: 'unavailable' })
      // Network failure, CORS, a 5xx, malformed JSON — all previously swallowed
      // whole. The visitor still gets the same calm screen; the difference is
      // that now somebody can find out why they got it.
      diagnostic('viewer-load-failed', {
        product: route.productSlug,
        variant: route.colourSlug ?? '',
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Back/forward: reselect locally when possible, refetch otherwise.
  useEffect(
    () =>
      onRouteChange(() => {
        const route = currentRoute()
        setState((previous) => {
          if (!route) return previous
          if (previous.kind === 'ready' && previous.data.product.slug === route.productSlug) {
            const match = previous.data.colourways.find((c) => c.slug === route.colourSlug)
            if (match) return { ...previous, selected: match }
          }
          void load()
          return previous
        })
      }),
    [load],
  )

  useEffect(() => {
    if (state.kind === 'ready') {
      document.title = `${state.data.product.productName} · ${state.selected.displayName} — RUN APPAREL 3D Reference`
    }
  }, [state])

  // Start the refined-motion layer once, after the first ready render — lazily
  // imported so Motion + Lenis stay out of the initial shell chunk.
  useEffect(() => {
    if (state.kind === 'ready' && !polishStarted.current) {
      polishStarted.current = true
      void import('./polish').then((m) => m.startPolish()).catch(() => {})
    }
  }, [state.kind])

  /**
   * Hand focus to <main> when the preloader leaves.
   *
   * EVERY visit to this viewer is a fresh QR scan, so this transition happens on
   * essentially 100% of sessions rather than on an occasional in-app route
   * change. For the 1.77–2.27s the CMS fetch takes, the entire document is
   * `aria-hidden="true"` (see the loading branch below) except the preloader
   * overlay. When the data arrives, the overlay unmounts and a full page appears
   * — with focus still on <body> and nothing announced. A screen-reader user's
   * virtual cursor is left pointing at what was, a moment ago, a hidden document.
   *
   * `<main id="main-content" tabIndex={-1}>` already exists and is already
   * focusable for exactly this purpose; it was reachable only via the skip link.
   * Nothing new is built here.
   *
   * Guarded on `preloaderGone` rather than on `state.kind` alone so focus moves
   * when the overlay has actually left, not while it still covers the page.
   *
   * ⚠️ `preventScroll: true` IS LOAD-BEARING, and without it this accessibility
   * fix was a layout bug on every single visit. Measured 2026-08-17 on the live
   * site at four viewports: the page arrived at `scrollY: 69` on desktop and
   * `scrollY: 117` where the header wraps — **the header's own height, to the
   * pixel, every time.**
   *
   * `focus()` scrolls its element into view. <main> starts directly under the
   * sticky header and is taller than the viewport, so the browser scrolls the
   * minimum that makes it fill the viewport, which is precisely the header's
   * height. There is no `scrollTo` anywhere in this app; this one call was the
   * whole cause.
   *
   * It was not cosmetic. At 390x844 the sticky header then covered the top
   * **29px of the garment** and the control pill covered 38px at the bottom, so
   * a QR visitor met a product cropped at both ends — reported as "the model
   * gets cut off", and initially diagnosed as a stage-height problem.
   *
   * The hand-off itself is unchanged and still required; only the scroll side
   * effect goes. `e2e/motion-and-layout.spec.ts` → "the page opens at the very
   * top" pins it, and waits for this hand-off before measuring — asserting
   * straight after the <h1> appears is flaky in the direction that PASSES.
   */
  const focusHandedOff = useRef(false)
  useEffect(() => {
    if (state.kind !== 'ready' || !preloaderGone || focusHandedOff.current) return
    focusHandedOff.current = true
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [state.kind, preloaderGone])

  // Stable identity: this is in <Preloader>'s effect dependency array, and a new
  // arrow function per App render re-ran that effect — clearing and rescheduling
  // both of its timeouts every time, on the component whose whole job is timing.
  const onPreloaderExited = useCallback(() => setPreloaderGone(true), [])

  if (state.kind === 'unavailable') {
    return (
      <div className="page">
        <UnavailableState />
      </div>
    )
  }

  const preloader = preloaderGone ? null : (
    <Preloader done={state.kind === 'ready'} onExited={onPreloaderExited} />
  )

  if (state.kind === 'loading') {
    return (
      <>
        {preloader}
        <div className="page" aria-hidden="true" />
      </>
    )
  }

  const { data, selected, retiredNotice } = state
  const selectedIndex = data.colourways.findIndex((c) => c.slug === selected.slug)
  const enquiry = {
    productName: data.product.productName,
    productCode: data.product.productCode,
    colourName: selected.displayName,
  }

  const onSelectColourway = (colourway: ViewerColourway) => {
    setPreviewedColourway(null)
    if (colourway.slug === selected.slug) return
    setColourwayUrl(data.product.slug, colourway.slug)
    setState({ kind: 'ready', data, selected: colourway, retiredNotice: null })
    track('colourway_selected', { variant: colourway.variantId })
  }

  return (
    <>
      {preloader}
      <div className="page">
        {/* First focusable thing on the page: a keyboard user should not have to
            tab through the header to reach the garment. Visually hidden until
            focused — see `.skip-link` in the stylesheet. */}
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <Header
          wordmark={data.siteSettings.temporaryWordmark}
          catalogueUrl={data.product.catalogueUrl}
        />
        {/* `tabIndex={-1}` is what makes the skip link actually skip. <main> is not
            focusable by default, so following the fragment moves the SCROLL
            position but leaves focus in the header — the next Tab then walks back
            through exactly the links the user just asked to skip. */}
        <main id="main-content" tabIndex={-1}>
          {/*
            The garment and the control that recolours it, in one band.

            Until 2026-08-13 the tablist lived in `.content` BELOW <ProductPanel>,
            which is 613px tall on a phone — so the swatches sat 686px under the
            canvas and, measured on the live site, scrolling them into view left
            ZERO pixels of the garment on screen. Every colour change was made
            blind, then undone by a scroll back up.

            The tablist and its panel were always declared to belong together
            (`aria-controls` → COLOURWAY_PANEL_ID); only the layout disagreed.
            They are siblings here so the DOM order finally matches the ARIA, and
            `.stage-block` is what draws the band's bottom edge — see page.css.
          */}
          <div className="stage-block">
            {/* The panel half of <ColourwayTabs>'s tablist. Labelled by whichever
                tab is selected, so a screen reader reaching the stage is told
                which colourway it is showing. */}
            <div
              id={COLOURWAY_PANEL_ID}
              role="tabpanel"
              aria-labelledby={colourwayTabId(selected.slug)}
              tabIndex={-1}
            >
              <Stage data={data} selected={selected} preview={previewedColourway} />
            </div>
            <ColourwayTabs
              colourways={data.colourways}
              selected={selected}
              onSelect={onSelectColourway}
              onPreview={setPreviewedColourway}
            />
          </div>
          {retiredNotice && <RetiredNotice message={retiredNotice} />}
          <div className="content">
            <ProductPanel
              data={data}
              selected={selected}
              selectedIndex={Math.max(selectedIndex, 0)}
            />
            <CustomisationSection data={data} />
            <ContactSection settings={data.siteSettings} enquiry={enquiry} />
          </div>
        </main>
        <StickyContactRail settings={data.siteSettings} enquiry={enquiry} />
        <MobileActionBar settings={data.siteSettings} enquiry={enquiry} />
        <Footer settings={data.siteSettings} />
      </div>
    </>
  )
}
