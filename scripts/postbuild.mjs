// Static hosts without rewrite rules (e.g. GitHub Pages) serve 404.html for unknown paths such as /097.
// Serving the SPA entry as 404.html makes path routing work there too.
import { copyFileSync, writeFileSync } from 'node:fs'
import { loadEnv } from 'vite'

copyFileSync('dist/index.html', 'dist/404.html')

const { VITE_SITE_URL } = loadEnv('production', process.cwd(), 'VITE_')
if (!VITE_SITE_URL) {
  throw new Error('VITE_SITE_URL must be set to the public site URL.')
}

const siteUrl = new URL(VITE_SITE_URL)
if (!['http:', 'https:'].includes(siteUrl.protocol) || !siteUrl.pathname.endsWith('/') || siteUrl.search || siteUrl.hash) {
  throw new Error('VITE_SITE_URL must be an absolute HTTP(S) URL with a trailing slash and no query or hash.')
}

const sitemapUrl = new URL('sitemap.xml', siteUrl).href
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl.href}</loc>
  </url>
</urlset>
`

writeFileSync('dist/sitemap.xml', sitemap)
writeFileSync('dist/robots.txt', `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`)
