// Generates public/favicon.svg, apple-touch-icon.png and ogp.png.
//   yarn assets:build
// Phone icon: Font Awesome Free (CC BY 4.0). The OGP image uses system Japanese fonts.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { feature } from 'topojson-client'
import { faPhone } from '@fortawesome/free-solid-svg-icons/faPhone'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')
const [iw, ih, , , iconPath] = faPhone.icon
const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f']

const iconAt = (size, box, color) => {
  const s = box / Math.max(iw, ih)
  const x = (size - iw * s) / 2
  const y = (size - ih * s) / 2
  return `<g transform="translate(${x} ${y}) scale(${s})"><path fill="${color}" d="${iconPath}"/></g>`
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#1f6feb"/>${iconAt(128, 72, '#fff')}</svg>\n`
writeFileSync(join(pub, 'favicon.svg'), favicon)
writeFileSync(
  join(pub, 'apple-touch-icon.png'),
  new Resvg(favicon.replace('rx="28"', 'rx="0"'), { fitTo: { mode: 'width', value: 180 } }).render().asPng(),
)

// ---- OGP ----
const topo = JSON.parse(readFileSync(join(pub, 'data/municipalities.topo.json'), 'utf8'))
const areas = JSON.parse(readFileSync(join(pub, 'data/areas.json'), 'utf8')).areas
const colorByCode = new Map()
for (const a of areas.filter((a) => a.areaCode === '3'))
  for (const m of a.munis) if (m.kind !== 'part') colorByCode.set(m.code, PALETTE[a.color % PALETTE.length])

const fc = feature(topo, topo.objects.municipalities)
const merc = ([lon, lat]) => [lon, -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI)]
const ring = (r) => 'M' + r.map(merc).map((p) => p.join(' ')).join('L') + 'Z'
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
const bboxOf = (pts) => {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const [x, y] of pts) {
    b.minX = Math.min(b.minX, x)
    b.maxX = Math.max(b.maxX, x)
    b.minY = Math.min(b.minY, y)
    b.maxY = Math.max(b.maxY, y)
  }
  return b
}
const items = fc.features.map((f) => {
  const ps = polys(f.geometry)
  return { code: f.properties.c, bb: bboxOf(ps.flatMap((p) => p[0]).map(merc)), d: ps.map((p) => p.map(ring).join('')).join('') }
})

// center the map on the colored area and clip to the map panel
const target = bboxOf(items.filter((i) => colorByCode.has(i.code)).flatMap((i) => [[i.bb.minX, i.bb.minY], [i.bb.maxX, i.bb.maxY]]))
const box = { x: 650, y: 0, w: 550, h: 630 }
const k = Math.min((box.w * 0.8) / (target.maxX - target.minX), (box.h * 0.8) / (target.maxY - target.minY))
const tx = box.x + box.w / 2 - ((target.minX + target.maxX) / 2) * k
const ty = box.y + box.h / 2 - ((target.minY + target.maxY) / 2) * k
const view = {
  minX: (box.x - tx) / k, maxX: (box.x + box.w - tx) / k,
  minY: (box.y - ty) / k, maxY: (box.y + box.h - ty) / k,
}
const visible = items.filter((i) => i.bb.maxX > view.minX && i.bb.minX < view.maxX && i.bb.maxY > view.minY && i.bb.minY < view.maxY)

const paths = visible
  .map((i) => `<path d="${i.d}" fill="${colorByCode.get(i.code) ?? '#ffffff'}" />`)
  .join('')

const ogp = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#d6e2ee"/>
<clipPath id="m"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath>
<g clip-path="url(#m)"><g transform="translate(${tx} ${ty}) scale(${k})" stroke="#4a5663" stroke-width="${0.5 / k}" stroke-linejoin="round">${paths}</g></g>
<rect x="0" y="0" width="650" height="630" fill="#ffffff"/>
<rect x="60" y="90" width="120" height="120" rx="28" fill="#1f6feb"/>
<g transform="translate(60 90)">${iconAt(120, 68, '#fff')}</g>
<text x="60" y="320" font-family="Hiragino Sans, Noto Sans CJK JP, Noto Sans JP, sans-serif" font-weight="700" font-size="66" fill="#1b2430">市外局番マップ</text>
<text x="60" y="395" font-family="Hiragino Sans, Noto Sans CJK JP, Noto Sans JP, sans-serif" font-size="30" fill="#4a5663">固定電話の市外局番の先頭を入力すると、</text>
<text x="60" y="440" font-family="Hiragino Sans, Noto Sans CJK JP, Noto Sans JP, sans-serif" font-size="30" fill="#4a5663">該当する地域が地図に色分けされます。</text>
<text x="60" y="545" font-family="Hiragino Sans, Noto Sans CJK JP, Noto Sans JP, sans-serif" font-weight="700" font-size="54" fill="#1f6feb">03 → 東京</text>
</svg>`
writeFileSync(
  join(pub, 'ogp.png'),
  new Resvg(ogp, { font: { loadSystemFonts: true } }).render().asPng(),
)
console.log('assets written')
