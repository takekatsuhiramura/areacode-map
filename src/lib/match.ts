import type { Area, AreaData, Kind } from './types'

export const MAX_DIGITS = 6

export interface InputError {
  title: string
  message: string
  action: string
}

export type MatchResult =
  | { status: 'empty' }
  | { status: 'idle' }
  | { status: 'error'; error: InputError }
  | {
      status: 'ok'
      areas: Area[]
      areaCode: string | null
      formatted: string
      narrowed: boolean
    }

const EXAMPLES = '03（東京）、06（大阪）、097（大分）'

const err = (title: string, message: string, action: string): MatchResult => ({
  status: 'error',
  error: { title, message, action },
})

function classify(p: string, raw: string): MatchResult {
  const num = `0${p}`
  const ask = `固定電話の市外局番を入力してください。例: ${EXAMPLES}。`
  if (/^(120|800)/.test(p))
    return err('フリーダイヤルは対象外です', `${num} で始まる番号は着信課金（フリーダイヤル）で、地域は特定できません。`, `「クリア」を押して、${ask}`)
  if (/^(570|180|990)/.test(p))
    return err('この番号は対象外です', `${num} で始まる番号（ナビダイヤル等）は地域に紐づいていません。`, `「クリア」を押して、${ask}`)
  if (/^50/.test(p))
    return err('IP電話は対象外です', '050 で始まる番号はIP電話で、地域に紐づいていません。', `「クリア」を押して、${ask}`)
  if (/^[789]0/.test(p) && p.length >= 2)
    return err('携帯電話・PHSは対象外です', `0${p.slice(0, 2)} で始まる番号は携帯電話・PHSで、地域に紐づいていません。`, `「クリア」を押して、${ask}`)
  if (/^(20|60)/.test(p))
    return err('この番号は対象外です', `0${p.slice(0, 2)} で始まる番号は地域に紐づいていません。`, `「クリア」を押して、${ask}`)
  return err(
    '該当する市外局番がありません',
    `${raw} で始まる固定電話の市外局番は見つかりませんでした。`,
    `「⌫」で1文字消して入力し直すか、${ask}`,
  )
}

/** Normalises user input to digits (max length MAX_DIGITS). */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '')
    .slice(0, MAX_DIGITS)
}

/** Areas with an area code shorter than `len` whose exchange hints are compatible with p (e.g. 0839 → 083 + 9xx). */
function hintedShorterThan(all: Area[], p: string, len: number): Area[] {
  return all.filter(
    (a) =>
      a.areaCode.length < len &&
      p.startsWith(a.areaCode) &&
      a.exchanges?.some((e) => e.startsWith(p) || p.startsWith(e)),
  )
}

/**
 * Prefix matching against the MIC list. `digits` includes the leading 0.
 * - If the input is a prefix of area codes, every area whose code starts with it is returned.
 * - Otherwise the area(s) with the longest area code that is a prefix of the input are returned
 *   (and narrowed by libphonenumber exchange hints when several areas share the code).
 */
export function matchDigits(data: AreaData, digits: string): MatchResult {
  if (digits === '') return { status: 'empty' }
  if (digits[0] !== '0')
    return err(
      '先頭は 0 から入力してください',
      `固定電話の番号は 0 から始まります（入力: ${digits}）。`,
      `「クリア」を押して、0 から入力し直してください。例: ${EXAMPLES}。`,
    )
  if (digits === '0') return { status: 'idle' }

  const p = digits.slice(1)
  if (/^(120|800|570|180|990)/.test(p)) return classify(p, digits)
  const all = data.areas

  let areas = all.filter((a) => a.areaCode.startsWith(p))
  // Areas with a shorter area code whose exchange range can still start with p (e.g. 0839 → 083 + 9xx)
  const shorter = areas.length ? hintedShorterThan(all, p, p.length) : []
  areas = [...areas, ...shorter]
  let areaCode: string | null = null
  let narrowed = false

  if (areas.length === 0) {
    const longest = Math.max(0, ...all.filter((a) => p.startsWith(a.areaCode)).map((a) => a.areaCode.length))
    if (longest === 0) return classify(p, digits)
    areaCode = p.slice(0, longest)
    const exchangeHead = p[longest]
    const hinted = hintedShorterThan(all, p, longest)
    if ((exchangeHead === '0' || exchangeHead === '1') && hinted.length === 0)
      return err(
        '市内局番は 2〜9 で始まります',
        `0${areaCode} の次の数字が ${exchangeHead} になっています。市内局番は 2〜9 で始まります。`,
        `「⌫」で ${exchangeHead} を消して、市内局番の先頭を 2〜9 で入力してください。`,
      )
    areas = exchangeHead === '0' || exchangeHead === '1' ? [] : all.filter((a) => a.areaCode === areaCode)
    if (p.length > areaCode.length && areas.length > 1) {
      const refined = areas.filter((a) => a.exchanges?.some((e) => e.startsWith(p) || p.startsWith(e)))
      if (refined.length > 0 && refined.length < areas.length) {
        areas = refined
        narrowed = true
      }
    }
    if (hinted.length) {
      areas = [...areas, ...hinted]
      areaCode = null
    }
  } else if (shorter.length === 0 && areas.every((a) => a.areaCode === areas[0].areaCode) && p.length >= areas[0].areaCode.length) {
    areaCode = areas[0].areaCode
  }

  const formatted = areaCode ? `0${areaCode}-${p.slice(areaCode.length)}`.replace(/-$/, '') : digits
  return { status: 'ok', areas, areaCode, formatted, narrowed }
}

const rank: Record<Kind, number> = { part: 0, most: 1, full: 2 }

export interface MuniAssignment {
  color: number
  kind: Kind
}

/** Decides one colour per municipality (the area covering most of it wins). */
export function assignMunis(areas: Area[]): Map<string, MuniAssignment> {
  const out = new Map<string, MuniAssignment>()
  for (const a of areas)
    for (const m of a.munis) {
      const prev = out.get(m.code)
      if (!prev || rank[m.kind] > rank[prev.kind]) out.set(m.code, { color: a.color, kind: m.kind })
    }
  return out
}

export const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f']
export const colorOf = (i: number) => PALETTE[i % PALETTE.length]
