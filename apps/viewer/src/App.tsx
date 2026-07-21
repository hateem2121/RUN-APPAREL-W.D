import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { isViewerApiError } from '@run-apparel/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ColourwayTabs } from './components/ColourwayTabs'
import { ContactSection, MobileActionBar, StickyContactRail } from './components/Contact'
import { CustomisationSection } from './components/CustomisationSection'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { ProductPanel } from './components/ProductPanel'
import { Stage } from './components/Stage'
import { LoadingScreen, RetiredNotice, UnavailableState } from './components/States'
import { track } from './lib/analytics'
import { fetchViewerData } from './lib/api'
import { currentRoute, onRouteChange, setColourwayUrl } from './lib/router'

type AppState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; data: ViewerApiSuccess; selected: ViewerColourway; retiredNotice: string | null }

export default function App() {
  const [state, setState] = useState<AppState>({ kind: 'loading' })
  const loadedFor = useRef<string | null>(null)

  const load = useCallback(async () => {
    const route = currentRoute()
    if (!route) {
      setState({ kind: 'unavailable' })
      return
    }
    try {
      const response = await fetchViewerData(route.productSlug, route.colourSlug)
      if (isViewerApiError(response)) {
        setState({ kind: 'unavailable' })
        return
      }
      const retired = response.requestedColourwayUnavailable
      if (retired) {
        // Silently normalise the URL to the valid default path — no redirect loops.
        setColourwayUrl(response.product.slug, response.selectedColourway.slug, true)
        track('retired_colourway_fallback', { product: response.product.productCode })
      }
      setState({
        kind: 'ready',
        data: response,
        selected: response.selectedColourway,
        retiredNotice: retired ? (response.fallbackMessage ?? response.product.retiredMessage) : null,
      })
      if (loadedFor.current !== response.product.slug) {
        loadedFor.current = response.product.slug
        track('viewer_page_loaded', { product: response.product.productCode })
      }
    } catch {
      setState({ kind: 'unavailable' })
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

  if (state.kind === 'loading') {
    return (
      <div className="page">
        <LoadingScreen />
      </div>
    )
  }

  if (state.kind === 'unavailable') {
    return (
      <div className="page">
        <UnavailableState />
      </div>
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
    if (colourway.slug === selected.slug) return
    setColourwayUrl(data.product.slug, colourway.slug)
    setState({ kind: 'ready', data, selected: colourway, retiredNotice: null })
    track('colourway_selected', { variant: colourway.variantId })
  }

  return (
    <div className="page">
      <Header wordmark={data.siteSettings.temporaryWordmark} catalogueUrl={data.product.catalogueUrl} />
      <main>
        <Stage data={data} selected={selected} />
        {retiredNotice && <RetiredNotice message={retiredNotice} />}
        <div className="content">
          <ProductPanel data={data} selected={selected} selectedIndex={Math.max(selectedIndex, 0)} />
          <ColourwayTabs colourways={data.colourways} selected={selected} onSelect={onSelectColourway} />
          <CustomisationSection data={data} />
          <ContactSection settings={data.siteSettings} enquiry={enquiry} />
        </div>
      </main>
      <StickyContactRail settings={data.siteSettings} enquiry={enquiry} />
      <MobileActionBar settings={data.siteSettings} enquiry={enquiry} />
      <Footer settings={data.siteSettings} />
    </div>
  )
}
