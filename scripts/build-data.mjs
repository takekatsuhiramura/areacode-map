// Builds public/data/areas.json and public/data/municipalities.topo.json
// from the raw sources stored in data/source/.
//
//   yarn data:build
//
// Sources:
//   data/source/soumu-*.txt                 pdftotext -layout output of the MIC (総務省) area code list PDF
//   data/source/libphonenumber-ja-81.txt    libphonenumber geocoding data (ja), used for MA names / exchange hints
//   data/source/ntt-ma-names.json          official NTT East/West MA names, preferred when naming areas
//   data/source/municipalities-s0010.topo.json  Municipality boundaries (MLIT N03 via smartnews-smri/japan-topography)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'data/source')
const outDir = join(root, 'public/data')
mkdirSync(outDir, { recursive: true })

const soumuFile = readdirSync(srcDir).find((f) => f.startsWith('soumu-'))
const soumuLines = readFileSync(join(srcDir, soumuFile), 'utf8').split('\n')
const topo = JSON.parse(readFileSync(join(srcDir, 'municipalities-s0010.topo.json'), 'utf8'))
const nttNames = JSON.parse(readFileSync(join(srcDir, 'ntt-ma-names.json'), 'utf8'))
const libLines = readFileSync(join(srcDir, 'libphonenumber-ja-81.txt'), 'utf8').split('\n')

const norm = (s) =>
  s
    .replace(/[ヶケｹ]/g, 'ヶ')
    .replace(/[ッﾂ]/g, 'ツ')
    .replace(/龍/g, '竜')
    .replace(/澤/g, '沢')
    .replace(/﨑/g, '崎')
    .replace(/檮/g, '梼')
    .replace(/^篠山/, '丹波篠山')
    .replace(/\s+/g, '')

// ---------- boundaries ----------
const objKey = Object.keys(topo.objects)[0]
const allGeoms = topo.objects[objKey].geometries
const geoms = allGeoms.filter((g) => g.properties.N03_007)
const munis = geoms.map((g) => {
  const p = g.properties
  return {
    code: p.N03_007,
    pref: p.N03_001,
    gun: p.N03_003?.endsWith('郡') ? p.N03_003 : '',
    name: /[郡庁]$/.test(p.N03_003 ?? '') ? p.N03_004 : p.N03_003 || p.N03_004,
    geom: g,
  }
})
const byPref = new Map()
for (const m of munis) {
  if (!byPref.has(m.pref)) byPref.set(m.pref, [])
  byPref.get(m.pref).push(m)
}
const prefNames = [...byPref.keys()]

// ---------- parse Soumu list ----------
const entries = []
let cur = null
for (const line of soumuLines) {
  const m = line.match(/^\s*(\d+(?:-\d+)?)\s+(\S.*?)\s+(\d{1,5})\s+([A-E]+)\s*$/)
  if (m) {
    cur = { id: m[1], text: m[2], areaCode: m[3], exchange: m[4] }
    entries.push(cur)
  } else if (line.trim() && cur && !/^\s*(＜|（令和|番号区画|コード)/.test(line)) {
    cur.text += line.trim()
  }
}
for (const e of entries) e.text = e.text.replace(/（市外局番を除く[^）]*）/g, '')

function splitTop(s, seps) {
  const out = []
  let depth = 0
  let buf = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '（') depth++
    if (ch === '）') depth--
    if (depth === 0 && seps.includes(ch)) {
      out.push(buf)
      buf = ''
    } else buf += ch
  }
  if (buf) out.push(buf)
  return out.filter(Boolean)
}

const unresolved = []
const kindRank = { part: 0, most: 1, full: 2 }

function resolveItem(rawItem, pref, entry) {
  const item = rawItem
  const found = []
  const add = (m, kind) => found.push({ m, kind })

  const open = item.indexOf('（')
  let head = open >= 0 ? item.slice(0, open) : item
  const qual = open >= 0 ? item.slice(open + 1, item.lastIndexOf('）')) : ''
  head = norm(head)

  if (head === '23区') {
    for (const m of byPref.get('東京都')) if (/^131\d\d$/.test(m.code)) add(m, 'full')
    return found
  }
  const list = byPref.get(pref) || []
  const cities = list.filter((m) => !m.gun)
  const guns = [...new Set(list.filter((m) => m.gun).map((m) => m.gun))]

  const qualMode = qual ? (/除く。?$/.test(qual) ? 'except' : 'only') : null
  const cityHit = cities
    .filter((m) => head.startsWith(norm(m.name)))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (cityHit) {
    const rest = head.slice(norm(cityHit.name).length)
    add(cityHit, !rest && !qual ? 'full' : !rest && qualMode === 'except' ? 'most' : 'part')
    return found
  }
  const gunHit = guns
    .filter((g) => head.startsWith(norm(g)))
    .sort((a, b) => b.length - a.length)[0]
  if (gunHit) {
    const towns = list.filter((m) => m.gun === gunHit)
    const rest = head.slice(norm(gunHit).length)
    if (rest) {
      const t = towns
        .filter((m) => rest.startsWith(norm(m.name)))
        .sort((a, b) => b.name.length - a.name.length)[0]
      if (t) add(t, qual || rest.length > norm(t.name).length ? 'part' : 'full')
      else unresolved.push(`${entry.id}: ${pref}${gunHit}${rest}`)
      return found
    }
    if (!qual) {
      for (const t of towns) add(t, 'full')
      return found
    }
    const body = qual.replace(/(を除く|に限る)。?$/, '')
    const names = splitTop(body, ['、', '及'])
      .map((n) => n.replace(/^び/, ''))
      .map((n) => ({ name: norm(n.replace(/（.*$/, '')), sub: n.includes('（') }))
    const named = new Map()
    for (const n of names) {
      const t = towns
        .filter((m) => n.name.startsWith(norm(m.name)))
        .sort((a, b) => b.name.length - a.name.length)[0]
      if (!t) unresolved.push(`${entry.id}: ${pref}${gunHit} ${n.name}`)
      else named.set(t.code, { t, sub: n.sub || n.name.length > norm(t.name).length })
    }
    for (const t of towns) {
      const n = named.get(t.code)
      if (qualMode === 'only') {
        if (n) add(t, n.sub ? 'part' : 'full')
      } else if (!n) add(t, 'full')
      else if (n.sub) add(t, 'most')
    }
    return found
  }
  unresolved.push(`${entry.id}: ${pref}${head}`)
  return found
}

const areas = entries.map((e) => {
  const byCode = new Map()
  let pref = ''
  for (let item of splitTop(e.text, ['、'])) {
    const p = prefNames.find((n) => item.startsWith(n))
    if (p) {
      pref = p
      item = item.slice(p.length)
    }
    for (const { m, kind } of resolveItem(item, pref, e)) {
      const prev = byCode.get(m.code)
      if (!prev || kindRank[kind] > kindRank[prev.kind]) byCode.set(m.code, { m, kind })
    }
  }
  return {
    id: e.id,
    areaCode: e.areaCode,
    exchange: e.exchange,
    description: e.text,
    munis: [...byCode.values()].map(({ m, kind }) => ({
      code: m.code,
      pref: m.pref,
      name: m.gun ? m.gun + m.name : m.name,
      kind,
    })),
  }
})

// ---------- MA names & exchange hints (libphonenumber) ----------
const lib = libLines
  .filter((l) => /^81\d+\|/.test(l))
  .map((l) => {
    const [p, name] = l.trim().split('|')
    return { prefix: p.slice(2), name }
  })

const stripSuffix = (n) => n.replace(/[市町村区郡]$/, '')
// Drop a leading 郡 name only for towns/villages (so 郡山市, 郡上市, 蒲郡市 stay intact)
const stripGun = (n) => n.replace(/^.*郡(?=.*[町村]$)/, '')
const areaCodes = [...new Set(areas.map((a) => a.areaCode))]
// Longest area code wins, so 880x numbers don't count toward area code 88
const ownerCode = (prefix) => areaCodes.filter((c) => prefix.startsWith(c)).sort((x, y) => y.length - x.length)[0]
const matchesName = (area, libName) =>
  area.munis.some((m) => {
    const bare = stripSuffix(norm(stripGun(m.name)))
    return bare.length >= 2 && (libName.includes(bare) || (libName.length >= 2 && bare.includes(libName)))
  })

const groups = new Map()
for (const a of areas) {
  if (!groups.has(a.areaCode)) groups.set(a.areaCode, [])
  groups.get(a.areaCode).push(a)
}

// MA names that cannot be derived from municipality / libphonenumber names
const nameOverrides = { 54: '十勝池田', 623: '三重', 627: '国東' }

const bareName = (m) => stripSuffix(norm(stripGun(m.name)))
for (const group of groups.values()) {
  const taken = new Set()
  for (const a of group) {
    const own = lib.filter((l) => ownerCode(l.prefix) === a.areaCode)
    const scored = a.munis.map((m) => {
      const bare = bareName(m)
      const hits = own.filter((l) => bare.length >= 2 && (l.name.includes(bare) || (l.name.length >= 2 && bare.includes(l.name))))
      return { m, hit: hits[0], count: hits.length }
    })
    scored.sort((x, y) => Math.min(kindRank[y.m.kind], 1) - Math.min(kindRank[x.m.kind], 1) || y.count - x.count)
    const candidates = []
    const strong = []
    for (const { m, hit } of scored) {
      const names = [...(hit ? [hit.name] : []), stripSuffix(stripGun(m.name))]
      candidates.push(...names)
      if (m.kind !== 'part') strong.push(...names)
    }
    if (a.description.startsWith('東京都23区')) candidates.unshift('東京23区')
    if (nameOverrides[a.id]) candidates.unshift(nameOverrides[a.id])
    const official = new Set([
      ...(nttNames.east[a.areaCode] ?? []),
      ...a.munis.flatMap((m) => nttNames.west[m.pref] ?? []),
    ])
    // Prefer an official NTT name, but only one derived from a (mostly) fully covered municipality
    const pick = strong.find((c) => !taken.has(c) && official.has(c)) ?? candidates.find((c) => !taken.has(c))
    a.name = pick ?? `${candidates[0] ?? a.id}(${a.id})`
    taken.add(a.name)
  }
}

for (const [code, group] of groups) {
  if (group.length < 2) continue
  for (const a of group) a.exchanges = []
  for (const l of lib) {
    if (ownerCode(l.prefix) !== code || l.prefix.length <= code.length) continue
    const hits = group.filter((a) => matchesName(a, l.name))
    if (hits.length === 1) hits[0].exchanges.push(l.prefix)
  }
  for (const a of group) if (!a.exchanges.length) delete a.exchanges
}

// ---------- adjacency graph colouring ----------
const arcOwners = new Map()
munis.forEach((m, i) => {
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk)
    else {
      const k = x < 0 ? ~x : x
      if (!arcOwners.has(k)) arcOwners.set(k, new Set())
      arcOwners.get(k).add(i)
    }
  }
  walk(m.geom.arcs)
})
const areasOfMuni = new Map()
areas.forEach((a, ai) =>
  a.munis.forEach((m) => {
    if (!areasOfMuni.has(m.code)) areasOfMuni.set(m.code, new Set())
    areasOfMuni.get(m.code).add(ai)
  }),
)
const adj = areas.map(() => new Set())
for (const owners of arcOwners.values()) {
  const o = [...owners]
  for (const i of o)
    for (const j of o) {
      if (i === j) continue
      for (const ai of areasOfMuni.get(munis[i].code) || [])
        for (const aj of areasOfMuni.get(munis[j].code) || []) if (ai !== aj) adj[ai].add(aj)
    }
}
const order = areas.map((_, i) => i).sort((a, b) => adj[b].size - adj[a].size)
const colorOf = new Array(areas.length).fill(-1)
let maxColor = 0
for (const i of order) {
  const used = new Set([...adj[i]].map((j) => colorOf[j]))
  let c = 0
  while (used.has(c)) c++
  colorOf[i] = c
  maxColor = Math.max(maxColor, c)
}
areas.forEach((a, i) => (a.color = colorOf[i]))

// ---------- diagnostics ----------
const covered = new Set(areas.flatMap((a) => a.munis.map((m) => m.code)))
const uncovered = munis.filter((m) => !covered.has(m.code))
console.log(`areas: ${areas.length}, municipalities: ${munis.length}, colours used: ${maxColor + 1}`)
console.log(`unresolved items: ${unresolved.length}`)
unresolved.forEach((u) => console.log('  ', u))
console.log(`municipalities not in any area: ${uncovered.length}`)
uncovered.forEach((m) => console.log('  ', m.code, m.pref + m.gun + m.name))
const empty = areas.filter((a) => !a.munis.length)
console.log(`areas with no municipalities: ${empty.length}`, empty.map((a) => a.id).join(','))

// ---------- write ----------
areas.sort((a, b) => a.areaCode.localeCompare(b.areaCode) || parseInt(a.id) - parseInt(b.id))
const areasMeta = {
  title: '固定電話 市外局番・番号区画(MA)データ',
  updated: soumuLines.join('\n').match(/（(令和.+?)現在）/)?.[1] ?? '',
  boundaries: '国土数値情報 行政区域データ N03-21 (2021-01-01)',
  generatedBy: 'scripts/build-data.mjs',
}
// One area per line keeps the file diff-friendly without bloating it
const areasJson = `{\n"meta": ${JSON.stringify(areasMeta)},\n"areas": [\n${areas.map((a) => JSON.stringify(a)).join(',\n')}\n]\n}\n`
writeFileSync(join(outDir, 'areas.json'), areasJson)

const outTopo = {
  ...topo,
  objects: {
    municipalities: {
      type: 'GeometryCollection',
      geometries: munis.map((m) => ({
        ...m.geom,
        properties: { c: m.code, p: m.pref, n: m.gun ? m.gun + m.name : m.name },
      })),
    },
  },
}
writeFileSync(join(outDir, 'municipalities.topo.json'), JSON.stringify(outTopo))
console.log('written to', outDir)
