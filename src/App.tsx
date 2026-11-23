import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { faPhone } from '@fortawesome/free-solid-svg-icons/faPhone'
import MapView, { type FitRequest } from './components/MapView'
import Keypad from './components/Keypad'
import ResultList from './components/ResultList'
import InfoModal from './components/InfoModal'
import { buildGeo, type GeoBundle } from './lib/geo'
import { assignMunis, matchDigits, MAX_DIGITS, normalizeDigits } from './lib/match'
import type { Area, AreaData } from './lib/types'

const BASE = import.meta.env.BASE_URL
const APP_NAME = '市外局番マップ'
const [PHONE_W, PHONE_H, , , PHONE_PATH] = faPhone.icon as [number, number, string[], string, string]

const pathToDigits = () => {
  const path = location.pathname.slice(BASE.length - 1).replace(/^\/+/, '')
  try {
    return normalizeDigits(decodeURIComponent(path))
  } catch {
    // Malformed percent-encoding (e.g. /%E0%A4%A) must not crash the app
    return normalizeDigits(path)
  }
}

function usePhoneDigits() {
  const [digits, setDigits] = useState(pathToDigits)
  useEffect(() => {
    const onPop = () => setDigits(pathToDigits())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const update = useCallback((next: string) => {
    setDigits(next)
    const url = BASE + next + location.search
    if (location.pathname + location.search !== url) history.replaceState(null, '', url)
  }, [])
  return [digits, update] as const
}

export default function App() {
  const [data, setData] = useState<AreaData | null>(null)
  const [geo, setGeo] = useState<GeoBundle | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [digits, setDigits] = usePhoneDigits()
  const [showInfo, setShowInfo] = useState(false)
  const [focus, setFocus] = useState<Area | null>(null)
  const fitKey = useRef(0)

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}data/areas.json`).then((r) => r.json()),
      fetch(`${BASE}data/municipalities.topo.json`).then((r) => r.json()),
    ])
      .then(([a, t]) => {
        setData(a)
        setGeo(buildGeo(t))
      })
      .catch(() => setLoadError(true))
  }, [])

  const result = useMemo(() => (data ? matchDigits(data, digits) : null), [data, digits])
  const areas = useMemo(() => (result?.status === 'ok' ? result.areas : []), [result])
  const highlight = useMemo(() => assignMunis(areas), [areas])
  const [fit, setFit] = useState<FitRequest>({ codes: [], key: 0 })

  useEffect(() => {
    setFocus(null)
    setFit({ codes: [...highlight.keys()], key: ++fitKey.current })
  }, [highlight])

  const selectArea = (a: Area) => {
    setFocus(a)
    setFit({ codes: a.munis.map((m) => m.code), key: ++fitKey.current })
  }

  const full = digits.length >= MAX_DIGITS
  const onDigit = (d: string) => !full && setDigits(digits + d)
  const onBackspace = () => setDigits(digits.slice(0, -1))
  const onClear = () => setDigits('')
  const handlers = useRef({ onDigit, onBackspace, onClear })
  handlers.current = { onDigit, onBackspace, onClear }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/^[0-9]$/.test(e.key)) handlers.current.onDigit(e.key)
      else if (e.key === 'Backspace') handlers.current.onBackspace()
      else if (e.key === 'Delete' || (e.key === 'Escape' && !document.querySelector('.modal'))) handlers.current.onClear()
    }
    const onPaste = (e: ClipboardEvent) => {
      const text = normalizeDigits(e.clipboardData?.getData('text') ?? '')
      if (text) setDigits(text)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [setDigits])

  useEffect(() => {
    const first = areas.length === 1 ? ` ${areas[0].name}MA` : ''
    document.title = digits ? `${digits}${first} | ${APP_NAME}` : `${APP_NAME}｜固定電話の市外局番から地域を地図で確認`
  }, [digits, areas])

  const shown = focus ? [focus] : areas
  const muniCount = highlight.size
  const formatted = result?.status === 'ok' ? result.formatted : digits

  let message: React.ReactNode = null
  if (result?.status === 'empty')
    message = <p className="hint">市外局番の先頭から入力してください。例: <b>03</b>（東京）、<b>06</b>（大阪）、<b>097</b>（大分）。下4桁は不要です。</p>
  else if (result?.status === 'idle')
    message = <p className="hint">続けて市外局番を入力してください。例: <b>03</b>、<b>06</b>、<b>097</b></p>
  else if (result?.status === 'error')
    message = (
      <div className="error" role="alert">
        <strong>{result.error.title}</strong>
        <p>{result.error.message}</p>
        <p className="action">▶ {result.error.action}</p>
      </div>
    )
  else if (result?.status === 'ok') {
    const several = areas.length > 1
    message = (
      <p className="hint">
        <b>{areas.length}</b>件の番号区画・<b>{muniCount}</b>市区町村が該当します。
        {several && digits.length < MAX_DIGITS && '続けて入力すると絞り込めます。'}
        {result.areaCode && several && result.formatted.length > result.areaCode.length + 1 && !result.narrowed && ' この市内局番では番号区画を特定できません。'}
      </p>
    )
  }

  return (
    <div className="app">
      {geo ? <MapView geo={geo} highlight={highlight} fit={fit} /> : <div className="map" />}
      <aside className="panel">
        <header className="panel-head">
          <h1>
            <svg className="logo" viewBox={`0 0 ${PHONE_W} ${PHONE_H}`} aria-hidden>
              <path fill="currentColor" d={PHONE_PATH} />
            </svg>
            {APP_NAME}
          </h1>
          <button type="button" className="icon-btn info-btn" onClick={() => setShowInfo(true)} aria-label="データの出典を表示" title="データの出典">
            i
          </button>
        </header>

        <div className="display" aria-live="polite">
          <span className="display-num">{formatted || '0'}</span>
          <span className="display-rest" title="下4桁の入力は不要です">-····</span>
        </div>

        <div className="info-area">
          {loadError && <p className="error">データを読み込めませんでした。ページを再読み込みしてください。</p>}
          {!data && !loadError && <p className="hint">データを読み込み中…</p>}
          {message}
          {shown.length > 0 && <ResultList areas={shown} onSelect={selectArea} />}
          {focus && (
            <button type="button" className="link-btn" onClick={() => setFocus(null)}>
              すべての該当区画を表示
            </button>
          )}
        </div>

        <Keypad onDigit={onDigit} onBackspace={onBackspace} onClear={onClear} disableDigits={full} disableEdit={!digits} />
      </aside>
      {showInfo && <InfoModal data={data} onClose={() => setShowInfo(false)} />}
    </div>
  )
}
