import { feature, mesh } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry, MultiLineString, Position } from 'geojson'

export interface MuniProps {
  c: string
  p: string
  n: string
}

export interface GeoBundle {
  munis: FeatureCollection<Geometry, MuniProps>
  coast: MultiLineString
  prefBorders: MultiLineString
  cityBorders: MultiLineString
  bounds: Map<string, [number, number, number, number]>
}

const pref = (g: { properties?: unknown }) => (g.properties as MuniProps).p

type Topo = Topology<{ municipalities: GeometryCollection<MuniProps> }>

const ringBounds = (ring: Position[]) => {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of ring) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return [w, s, e, n] as [number, number, number, number]
}

/** Bounds of the largest polygon, so remote islands do not stretch the view. */
function mainBounds(f: Feature<Geometry, MuniProps>) {
  const g = f.geometry
  const polys: Position[][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  let best: [number, number, number, number] | null = null
  let bestArea = -1
  for (const poly of polys) {
    const b = ringBounds(poly[0])
    const area = (b[2] - b[0]) * (b[3] - b[1])
    if (area > bestArea) {
      best = b
      bestArea = area
    }
  }
  return best
}

export function buildGeo(topo: Topo): GeoBundle {
  const obj = topo.objects.municipalities
  const munis = feature(topo, obj) as FeatureCollection<Geometry, MuniProps>
  const bounds = new Map<string, [number, number, number, number]>()
  for (const f of munis.features) {
    const b = mainBounds(f)
    if (b) bounds.set(f.properties.c, b)
  }
  return {
    munis,
    bounds,
    coast: mesh(topo, obj, (a, b) => a === b),
    prefBorders: mesh(topo, obj, (a, b) => a !== b && pref(a) !== pref(b)),
    cityBorders: mesh(topo, obj, (a, b) => a !== b && pref(a) === pref(b)),
  }
}

export function boundsOf(geo: GeoBundle, codes: string[]): [number, number, number, number] | null {
  let out: [number, number, number, number] | null = null
  for (const c of codes) {
    const b = geo.bounds.get(c)
    if (!b) continue
    out = out ? [Math.min(out[0], b[0]), Math.min(out[1], b[1]), Math.max(out[2], b[2]), Math.max(out[3], b[3])] : [...b]
  }
  return out
}
