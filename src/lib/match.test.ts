import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { matchDigits } from './match'
import type { AreaData } from './types'

const data: AreaData = JSON.parse(readFileSync('public/data/areas.json', 'utf8'))
const names = (d: string) => {
  const r = matchDigits(data, d)
  return r.status === 'ok' ? r.areas.map((a) => a.name) : r.status
}

describe('matchDigits', () => {
  it('does nothing for empty and "0"', () => {
    expect(matchDigits(data, '').status).toBe('empty')
    expect(matchDigits(data, '0').status).toBe('idle')
  })
  it('097 shows every 097x area, 0975 only Oita, 0977 only Beppu', () => {
    const all = names('097') as string[]
    expect(all).toEqual(expect.arrayContaining(['大分', '別府']))
    expect(all.length).toBeGreaterThan(5)
    expect(names('0975')).toEqual(['大分'])
    expect(names('0977')).toEqual(['別府'])
  })
  it('09 returns the whole 09x block', () => {
    expect((names('09') as string[]).length).toBeGreaterThan(50)
  })
  it('rejects non-geographic numbers with guidance', () => {
    for (const d of ['090', '080', '050', '0120', '0800', '0570', '1', '0990']) {
      const r = matchDigits(data, d)
      expect(r.status, d).toBe('error')
      if (r.status === 'error') expect(r.error.action).toContain('入力')
    }
  })
  it('keeps shorter area codes whose exchanges overlap longer ones', () => {
    expect(names('0839')).toEqual(expect.arrayContaining(['山口', '美祢']))
    expect(names('08397')).toEqual(['山口'])
    expect(names('01548')).toEqual(expect.arrayContaining(['釧路', '弟子屈']))
  })
  it('every area is reachable from each prefix of its own number', () => {
    for (const a of data.areas)
      for (const f of a.exchanges?.length ? a.exchanges : [a.areaCode])
        for (let n = 1; n <= f.length; n++) {
          const r = matchDigits(data, '0' + f.slice(0, n))
          expect(r.status === 'ok' && r.areas.some((x) => x.id === a.id), `${a.name} 0${f.slice(0, n)}`).toBe(true)
        }
  })
})
