import { useEffect, useRef } from 'react'
import { Map as MLMap, NavigationControl, setWorkerUrl, type ExpressionSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { boundsOf, type GeoBundle } from '../lib/geo'
import { colorOf, type MuniAssignment } from '../lib/match'

setWorkerUrl(workerUrl)

export interface FitRequest {
  codes: string[]
  key: number
}

interface Props {
  geo: GeoBundle
  highlight: Map<string, MuniAssignment>
  fit: FitRequest
}

const JAPAN: [[number, number], [number, number]] = [
  [122.5, 24],
  [146, 45.8],
]

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

function fillExpression(highlight: Map<string, MuniAssignment>): ExpressionSpecification {
  const pairs: (string)[] = []
  for (const [code, a] of highlight) pairs.push(code, rgba(colorOf(a.color), a.kind === 'part' ? 0.5 : 0.85))
  if (!pairs.length) return 'rgba(0,0,0,0)' as unknown as ExpressionSpecification
  return ['match', ['get', 'c'], ...pairs, 'rgba(0,0,0,0)'] as unknown as ExpressionSpecification
}

export default function MapView({ geo, highlight, fit }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const ready = useRef(false)
  const latest = useRef({ highlight, fit })
  latest.current = { highlight, fit }

  const padding = () => {
    const w = container.current?.clientWidth ?? 600
    const h = container.current?.clientHeight ?? 400
    const px = Math.min(48, w * 0.08)
    const py = Math.min(48, h * 0.1)
    return { top: py, bottom: py, left: px, right: px }
  }

  const applyFit = () => {
    const map = mapRef.current
    if (!map || !ready.current) return
    const b = boundsOf(geo, latest.current.fit.codes)
    const bounds = b ?? JAPAN
    const cam = map.cameraForBounds(bounds, { padding: padding(), maxZoom: 10.5 })
    if (!cam) return
    map.flyTo({ ...cam, duration: b ? 1400 : 1000, curve: 1.5, essential: true })
  }

  const applyHighlight = () => {
    const map = mapRef.current
    if (!map || !ready.current) return
    const codes = [...latest.current.highlight.keys()]
    map.setFilter('muni-highlight', codes.length ? ['in', ['get', 'c'], ['literal', codes]] : ['==', ['get', 'c'], ''])
    map.setPaintProperty('muni-highlight', 'fill-color', fillExpression(latest.current.highlight))
  }

  useEffect(() => {
    const map = new MLMap({
      container: container.current!,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'sea', type: 'background', paint: { 'background-color': '#d6e2ee' } }],
      },
      bounds: JAPAN,
      fitBoundsOptions: { padding: 24 },
      minZoom: 3,
      maxZoom: 12,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      renderWorldCopies: false,
    })
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', () => {
      map.addSource('munis', { type: 'geojson', data: geo.munis })
      map.addSource('coast', { type: 'geojson', data: geo.coast })
      map.addSource('pref', { type: 'geojson', data: geo.prefBorders })
      map.addSource('city', { type: 'geojson', data: geo.cityBorders })
      map.addLayer({ id: 'muni-base', type: 'fill', source: 'munis', paint: { 'fill-color': '#ffffff' } })
      map.addLayer({
        id: 'muni-highlight',
        type: 'fill',
        source: 'munis',
        filter: ['==', ['get', 'c'], ''],
        paint: { 'fill-color': 'rgba(0,0,0,0)' },
      })
      map.addLayer({
        id: 'city-lines',
        type: 'line',
        source: 'city',
        paint: {
          'line-color': '#8a96a3',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 9, 0.9, 12, 1.4],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, 0, 7, 0.85],
        },
      })
      map.addLayer({
        id: 'pref-lines',
        type: 'line',
        source: 'pref',
        paint: {
          'line-color': '#4a5663',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 6, 1, 10, 2],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0, 5, 0.9],
        },
      })
      map.addLayer({
        id: 'coast-lines',
        type: 'line',
        source: 'coast',
        paint: { 'line-color': '#4a5663', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 1.2] },
      })
      ready.current = true
      applyHighlight()
      if (latest.current.fit.codes.length) applyFit()
    })

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(container.current!)
    return () => {
      ro.disconnect()
      ready.current = false
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(applyHighlight, [highlight])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(applyFit, [fit.key])

  return <div ref={container} className="map" role="application" aria-label="日本地図" />
}
