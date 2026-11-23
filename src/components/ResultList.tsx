import type { Area, AreaMuni } from '../lib/types'
import { colorOf } from '../lib/match'

interface Props {
  areas: Area[]
  onSelect: (a: Area) => void
}

const exchangeText = (e: string) => `${e.length}桁`

function groupByPref(munis: AreaMuni[]) {
  const map = new Map<string, AreaMuni[]>()
  for (const m of munis) {
    if (!map.has(m.pref)) map.set(m.pref, [])
    map.get(m.pref)!.push(m)
  }
  return [...map.entries()]
}

const suffix = (m: AreaMuni) => (m.kind === 'part' ? '（一部）' : m.kind === 'most' ? '（一部を除く）' : '')

export default function ResultList({ areas, onSelect }: Props) {
  return (
    <ul className="results">
      {areas.map((a) => (
        <li key={a.id}>
          <button type="button" className="card" onClick={() => onSelect(a)} title="この番号区画に地図を移動">
            <span className="swatch" style={{ background: colorOf(a.color) }} aria-hidden />
            <span className="card-body">
              <span className="card-title">
                {a.name}MA
                <span className="card-code">
                  市外局番 0{a.areaCode} ／ 市内局番 {exchangeText(a.exchange)}
                </span>
              </span>
              <span className="card-munis">
                {groupByPref(a.munis).map(([pref, ms]) => (
                  <span key={pref} className="pref-line">
                    <b>{pref}</b> {ms.map((m) => m.name + suffix(m)).join('、')}
                  </span>
                ))}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
