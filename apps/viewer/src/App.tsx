import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { garmentPageTitle, isViewerApiError, PAGE_TITLE_BRAND } from '@run-apparel/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COLOURWAY_PANEL_ID, ColourwayTabs, colourwayTabId } from './components/ColourwayTabs'
import { ConsentBanner } from './components/ConsentBanner'
import { ContactSection, MobileActionBar, StageContact } from './components/Contact'
import { CustomisationSection } from './components/CustomisationSection'
import { Footer } from './components/Footer'
import { GarmentTrail } from './components/GarmentTrail'
import { Header } from './components/Header'
import { Preloader } from './components/Preloader'
import { ProductIdentity } from './components/ProductIdentity'
import { ProductPanel } from './components/ProductPanel'
import { RelatedGarments } from './components/RelatedGarments'
import { Stage } from './components/Stage'
import { RetiredNotice, UnavailableState, UnreachableState } from './components/States'
import { startActionBarHeight } from './lib/actionBarHeight'
import { track } from './lib/analytics'
import { type ViewerFetchFailure, ViewerFetchError, fetchViewerData } from './lib/api'
import { diagnostic } from './lib/diagnostic'
import { isFocusUnclaimed } from './lib/focusHandoff'
import { currentRoute, onRouteChange, setColourwayUrl } from './lib/router'
import { useIdentityInAside } from './lib/useIdentityInAside'
import { usePrinting } from './lib/usePrinting'

type AppState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  /**
   * ⚠️ NOT THE SAME STATE AS `unavailable`, since 2026-09-07 — audit FA-P-05/P-06.
   *
   * They were one state and one screen: a 500 from the CMS, a dropped connection
   * and a phone with no signal all rendered "THIS REFERENCE IS NO LONGER LIVE —
   * the QR code you scanned points to a garment we no longer show here". Measured
   * on the live site by forcing the API to 500, and again by going offline (the
   * service worker precaches the shell, so the page loads and only the payload is
   * missing). A buyer holding the garment was told it had been retired, and given
   * no way to try again.
   *
   * A 404 keeps `unavailable`, which is what that copy is true of.
   */
  | { kind: 'unreachable'; reason: ViewerFetchFailure }
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
/**
 * The focus target when the preloader leaves — the page wrapper, not `<main>`.
 * See the effect below for what moved and why, and `page.css` for the one rule
 * this id needs (`outline: none`, because nothing can focus it deliberately).
 */
const PAGE_TOP_ID = 'viewer-top'

const RETIRED_FALLBACK =
  'The colorway printed on your tag is no longer in production. This page is showing the ' +
  'current default colorway for this garment.'

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
  /**
   * Which column the product's name and description belong to.
   *
   * Called here, above every early return, because hooks must be. The value is
   * used far below in the ready branch, where the `.stage__aside` and `.content`
   * placements are two lines apart and the exclusivity between them is visible.
   *
   * ⚠️ NOT "is the layout two columns". A landscape phone IS two columns and is
   * still the wrong home for a paragraph — see `useIdentityInAside.ts` for the
   * 726px-band measurement that put the height clause in that query.
   *
   * Never while printing (polish F14, lib/usePrinting.ts): paper takes the one-column
   * arrangement whatever screen it is printed from, so page.css lays out one sheet, not two.
   */
  const printing = usePrinting()
  const identityInAside = useIdentityInAside() && !printing
  /**
   * Where the garment's facts go (polish D10, owner-approved 2026-10-03): the four corners of
   * the 3D window on every computer, which is exactly where the name and description sit beside
   * the garment, and under the description everywhere else. Not while the stage has no garment
   * (LA-16): then the window holds the picture and the notice, and the facts go under the stage.
   * ONE value, handed to both places, so the facts are drawn exactly once at every width.
   */
  const [stageFallback, setStageFallback] = useState(false)
  const specsInCorners = identityInAside && !stageFallback

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
      // The KIND decides which screen, and it is deliberately conservative:
      // anything that is not a recognised transport/server failure — malformed
      // JSON, a thrown parse error, a bug in here — is treated as `network`,
      // because "we could not load this, try again" is true of all of them and
      // "this garment is retired" is true of none.
      const reason: ViewerFetchFailure = error instanceof ViewerFetchError ? error.kind : 'network'
      setState({ kind: 'unreachable', reason })
      // Network failure, CORS, a 5xx, malformed JSON — all previously swallowed
      // whole. The visitor still gets a calm screen; the difference is that now
      // somebody can find out why they got it.
      diagnostic('viewer-load-failed', {
        product: route.productSlug,
        variant: route.colourSlug ?? '',
        failure: reason,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * The retry the unreachable screen offers — audit FA-P-05 ("there is no retry
   * and no try again").
   *
   * ⚠️ IT MUST NOT GO BACK TO `{ kind: 'loading' }`, and that is the whole reason
   * this local flag exists. The loading branch renders `<div className="page"
   * aria-hidden="true" />` behind the preloader — which is correct on first paint
   * and wrong on a retry, because `preloaderGone` is already true by then: the
   * visitor would watch the page they are reading turn into an empty, aria-hidden
   * div. So the error screen stays on screen and its button reports the attempt.
   */
  const [retrying, setRetrying] = useState(false)
  const retry = useCallback(async () => {
    setRetrying(true)
    try {
      await load()
    } finally {
      setRetrying(false)
    }
  }, [load])

  /**
   * Come back on its own when the network does.
   *
   * The offline case is the one where the visitor's action ("walk to the window")
   * and the recovery are separable, and a page that has already told them it is
   * offline should not also make them find a button. `online` fires on the window
   * when the OS regains a connection; it is not a promise that anything is
   * reachable, so this is exactly the same attempt the button makes.
   *
   * ⚠️ `useLayoutEffect`, NOT `useEffect`: the listener must exist the moment "[ NO CONNECTION ]"
   * does. A passive effect runs after the browser has had the chance to paint, so an `online`
   * event in that gap was lost and the page stayed offline until a tap. Measured 2026-09-26: that
   * gap failed e2e/viewer.spec.ts "it comes back on its own…" on CI's mobile Safari (both
   * attempts, run 36173627945), which fires `online` as soon as the message is visible. A layout
   * effect runs in the same task as the commit, so no script — the OS's event included — can
   * observe the message without the listener.
   */
  useLayoutEffect(() => {
    if (state.kind !== 'unreachable') return
    const onOnline = () => void retry()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [state.kind, retry])

  /**
   * Keep the stage band's bottom reserve equal to the action bar's real height.
   *
   * Runs after the ready render, because the bar does not exist before it. See
   * `lib/actionBarHeight.ts` for why this is measured rather than computed: the bar
   * grows with the visitor's text-size setting since the type scale became rem, and
   * between Chrome's "Large" and "Very Large" its labels wrap and it jumps 30px at
   * once — not a function any CSS expression fits.
   */
  const ready = state.kind === 'ready'
  useEffect(() => {
    if (!ready) return
    return startActionBarHeight()
  }, [ready])

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
      /*
       * The SAME title the Worker writes for a search robot (worker/preview.ts), from the
       * same shared function. Google reads the title after running the page, so until
       * 2026-09-30 the title it indexed was this file's old wording, not the Worker's.
       */
      document.title = garmentPageTitle({
        productName: state.data.product.productName,
        productCode: state.data.product.productCode,
        garmentType: state.data.product.garmentType,
        colour: state.selected.displayName,
        brand: PAGE_TITLE_BRAND,
      })
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
   * Hand focus to the TOP OF THE PAGE when the preloader leaves.
   *
   * EVERY visit to this viewer is a fresh QR scan, so this transition happens on
   * essentially 100% of sessions rather than on an occasional in-app route
   * change. For the time the CMS fetch takes — 1.77-2.27s when this was written,
   * 0.56-0.72s across all 11 live products on 2026-09-04 — the entire document is
   * `aria-hidden="true"` (see the loading branch below) except the preloader
   * overlay. When the data arrives, the overlay unmounts and a full page appears
   * — with focus still on <body> and nothing announced. A screen-reader user's
   * virtual cursor is left pointing at what was, a moment ago, a hidden document.
   *
   * ⚠️ IT WAS `<main>` UNTIL 2026-09-07, AND THAT PUT THE HEADER BEHIND THE
   * VISITOR — audit FA-H-26. Measured in a real browser: `document.activeElement`
   * before any key press was `<main>`, so Tab 1 went to the `model-viewer` element
   * and Tab 2-4 to the camera buttons, while `.skip-link` stayed at `top: -75.5px`
   * throughout. Everything BEFORE `<main>` in the document — the skip link, the
   * wordmark (a link home since the same day) and the theme toggle — was reachable
   * only by tabbing backwards, or by tabbing forward through the entire page and
   * the browser's own chrome. On the marketing site, which hands off no focus,
   * Tab 1 focuses the skip link exactly as it should.
   *
   * The hand-off itself is unchanged and still required; only its target moves, to
   * the page wrapper, which is ABOVE the skip link. That restores the ordinary
   * document order — Tab 1 is the skip link again — while still moving the virtual
   * cursor out of the departed overlay and into the live document, which is the
   * whole reason this effect exists.
   *
   * ⚠️ NOT the skip link itself, which was the obvious alternative: `.skip-link`
   * reveals on `:focus`, not `:focus-visible`, so focusing it would flash a black
   * "Skip to main content" chip into the top-left corner of every visit, mouse and
   * touch included. `<main id="main-content">` keeps its `tabIndex={-1}` because
   * that is what makes the skip link actually skip.
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
   *
   * ⚠️ AND IT YIELDS TO A VISITOR WHO HAS ALREADY MOVED FOCUS (visual audit VA-05,
   * 2026-10-02). The page behind the curtain is live — Tab-able — from the moment
   * the data arrives until the curtain has gone, up to 1.2 s (the 400 ms floor plus
   * the 800 ms wipe, `lib/motion.ts`), and a keyboard user does not wait for it.
   * Measured with normal motion: Tab at 1.5 s reached "Skip to main content" and
   * the hand-off pulled focus to the wrapper within 400 ms; a phone menu opened in
   * that window lost its focus the same way, with the menu still open. Only a focus
   * nobody has claimed is handed over (`isFocusUnclaimed`, `lib/focusHandoff.ts`),
   * and the flag below is set either way, so the hand-off never comes back later and
   * takes it. `e2e/focus-handoff.spec.ts` presses Tab and opens the menu during the
   * curtain.
   */
  const focusHandedOff = useRef(false)
  useEffect(() => {
    if (state.kind !== 'ready' || !preloaderGone || focusHandedOff.current) return
    focusHandedOff.current = true
    if (!isFocusUnclaimed(document)) return
    document.getElementById(PAGE_TOP_ID)?.focus({ preventScroll: true })
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

  if (state.kind === 'unreachable') {
    return (
      <div className="page">
        <UnreachableState reason={state.reason} onRetry={retry} retrying={retrying} />
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
    // The SLUG, not `variantId`. Measured live 2026-08-30: the beacon was reporting
    // `variant: "Colorway 5"` — CLO's internal export label — so the analytics could
    // not say which colour anyone looked at, and the labels do not even map to
    // position (a five-colourway garment emits "Colorway 6"). The slug is the better
    // identifier on both counts: it is what the customer scanned off the QR tag, and
    // `Products.ts` forbids ever renaming it, whereas `variantId` is re-minted by
    // whatever CLO writes on the next export.
    track('colourway_selected', { variant: colourway.slug })
  }

  return (
    <>
      {preloader}
      {/* `tabIndex={-1}` makes this focusable WITHOUT putting it in the tab order:
          the effect above hands focus here when the preloader leaves, and the next
          Tab then continues from the top of the document into the skip link. */}
      <div className="page" id={PAGE_TOP_ID} tabIndex={-1}>
        {/* First focusable thing on the page: a keyboard user should not have to
            tab through the header to reach the garment. Visually hidden until
            focused — see `.skip-link` in the stylesheet. */}
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {/* The cookie choice. ⚠️ STRAIGHT AFTER THE SKIP LINK since 2026-10-01, for the TAB
            ORDER: it was the last element of the page, so a keyboard user met the question
            only after the whole garment page while it covered the foot of the screen (visual
            audit, WCAG 2.2 SC 2.4.11). It is `position: fixed`, and `.page` sets no transform
            or containment, so it is still an overlay and no part of the layout the stage band
            is measured against. */}
        <ConsentBanner />
        <Header wordmark={data.siteSettings.temporaryWordmark} />
        {/* `tabIndex={-1}` is what makes the skip link actually skip. <main> is not
            focusable by default, so following the fragment moves the SCROLL
            position but leaves focus in the header — the next Tab then walks back
            through exactly the links the user just asked to skip. */}
        <main id="main-content" tabIndex={-1}>
          {/*
            ⚠️ NO LABEL ROW ABOVE THE GARMENT (polish D8 and M5, owner-approved 2026-10-04).
            "[ 3D PRODUCT REFERENCE ]" sat on its own line here from 2026-09-17; the stage band
            now starts under the bar (--header-h, tokens.css) and the garment has the 32px.
          */}
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
            {/*
              ⚠️ NO NAME LINE OVER THE GARMENT ANY MORE (polish M5, F11 and X1, owner-approved
              2026-10-04). `.stage-block__name` put "R-GTD · GEOVENT TENNIS DRESS" here from
              2026-09-04 so the name was on a phone's first screen; it cost the garment 20px and
              was cut to "GEOVENT TENN…" on laptops (X1). Now: on a phone the garment has the
              room and the name follows it; an upright tablet's garment is shortened so the
              name below it is on the first screen (page.css, F11); every computer has the name
              beside the garment (useIdentityInAside.ts, D8).
            */}
            {/* The panel half of <ColourwayTabs>'s tablist. Labelled by whichever
                tab is selected, so a screen reader reaching the stage is told
                which colourway it is showing. */}
            <div
              id={COLOURWAY_PANEL_ID}
              role="tabpanel"
              aria-labelledby={colourwayTabId(selected.slug)}
              tabIndex={-1}
            >
              <Stage
                data={data}
                selected={selected}
                preview={previewedColourway}
                onSelectColourway={onSelectColourway}
                cornerSpecs={specsInCorners}
                onFallbackChange={setStageFallback}
              />
            </div>
            {/*
              The aside is a WRAPPER, not a relocation. `.stage__aside` is a
              plain block in one column and the second column when the screen is
              wide or short-and-wide — see the two-column rules in page.css.

              ⚠️ The tablist still directly follows its own tabpanel in reading
              order, which is the property the 2026-08-13 fix was for: they are
              declared to belong together via `aria-controls` → COLOURWAY_PANEL_ID
              and the layout used to disagree. Wrapping them keeps them adjacent;
              do not move <ColourwayTabs> away from this position.
            */}
            <div className="stage__aside">
              {/*
                The product's own name and description, in the column that used
                to be 81-93% empty — measured 526px of 650 at 1280x720, 910 of
                1010 at 1920x1080 and 1270 of 1370 at 2560x1440, because the
                column stretches with the band and its two controls do not.

                ⚠️ THE SAME FIELDS RENDER IN `.content` WHEN THIS IS FALSE, never
                as well as. `<ProductPanel showIdentity={!identityInAside}>` below is
                the other half of that switch and the two must stay opposite:
                both true is two <h1> elements sharing one id, both false loses
                the product's name from the page entirely.
              */}
              {identityInAside && (
                <ProductIdentity
                  product={data.product}
                  selected={selected}
                  selectedIndex={Math.max(selectedIndex, 0)}
                  clampDescription
                />
              )}
              <ColourwayTabs
                colourways={data.colourways}
                selected={selected}
                onSelect={onSelectColourway}
                onPreview={setPreviewedColourway}
              />
              <StageContact settings={data.siteSettings} enquiry={enquiry} />
            </div>
            {/*
              The only thing on the first screen that says the page continues.

              ⚠️ IT IS ORNAMENT, AND ORNAMENT WAS THE LAST RESORT — chosen because
              measurement removed the other two. Letting the next section peek is
              the honest cue (it shows WHAT is below, not merely that something
              is), and it costs 110px of garment: the fixed action bar hides the
              bottom 72px of every phone screen and `.content` adds 24px of
              padding before its first ink, so nothing appears until more has
              been spent than Parts A, C1 and C5 gained between them. A fade at
              the band's edge fails for the same reason — the region it would
              fade is empty reserved space, so it would fade nothing.

              This sits INSIDE the ~88px the band already reserves for the bar
              and nobody can see, so it costs the garment zero pixels.

              `aria-hidden`: a screen-reader user is not looking for a visual
              affordance and already has the document outline. It is not
              animated — see the CSS.
            */}
            <div className="stage__more" aria-hidden="true">
              <svg viewBox="0 0 16 10" width="16" height="10" focusable="false">
                <title>More below</title>
                <path
                  d="M1 1l7 7 7-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                />
              </svg>
            </div>
          </div>
          {retiredNotice && <RetiredNotice message={retiredNotice} />}
          <div className="content">
            {/* Where the garment sits on the website (polish S5). Here, under the garment band,
                not above it: the owner gave the garment the row a label once took (D8, M5). */}
            <GarmentTrail product={data.product} />
            <ProductPanel
              data={data}
              selected={selected}
              selectedIndex={Math.max(selectedIndex, 0)}
              showIdentity={!identityInAside}
              showSpecs={!specsInCorners}
            />
            <CustomisationSection data={data} />
            {/* Before the contact section, so the page still ends on its one prompt (S6, Q42). */}
            <RelatedGarments data={data} />
            <ContactSection settings={data.siteSettings} enquiry={enquiry} />
          </div>
        </main>
        <MobileActionBar settings={data.siteSettings} enquiry={enquiry} />
        <Footer settings={data.siteSettings} />
      </div>
    </>
  )
}
