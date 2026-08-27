/**
 * SPA visual probe — serves dist statically, shims chrome.* APIs, renders
 * options & popup in real Edge (headed), screenshots + computed styles.
 * Usage: node scripts/tmp-spa-probe.mjs <distDir> <outDir>
 */
import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve(process.argv[2] ?? 'dist/chrome-mv3')
const out = path.resolve(process.argv[3] ?? 'tmp-probe')
fs.mkdirSync(out, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/') p = '/options.html'
  let file = path.join(dist, p)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, p, 'index.html')
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
console.log('serving', dist, '→', base)

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  channel: 'msedge',
  viewport: { width: 1280, height: 900 },
})

async function probe(name, file, theme) {
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`   [console.${m.type()}]`, m.text().slice(0, 160)) })
  page.on('pageerror', e => console.log('   [pageerror]', String(e).slice(0, 300)))
  page.on('requestfailed', r => console.log('   [reqfail]', r.url().slice(-80), r.failure()?.errorText))
  page.on('response', r => { if (r.status() >= 400) console.log('   [http', r.status(), ']', r.url().slice(-80)) })
  await page.addInitScript(([t]) => {
    localStorage.setItem('umm:appearance', JSON.stringify({ theme: t }))
    const noop = () => {}
    function stub() {
      return new Proxy(function () {}, {
        get(_t, p) {
          if (p === 'addListener' || p === 'removeListener') return noop
          if (p === 'hasListener') return () => false
          if (p === 'then') return undefined
          if (p === Symbol.toPrimitive) return () => ''
          return stub()
        },
        apply() { return stub() },
      })
    }
    window.chrome = stub()
  }, [theme])
  await page.goto(`${base}/${file}`)
  await page.waitForTimeout(1800)
  await page.setViewportSize({ width: name === 'popup' ? 620 : 1280, height: name === 'popup' ? 500 : 900 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(out, `${name}-${theme}.png`) })
  const dump = await page.evaluate(() => {
    const pick = (el, props) => { if (!el) return null; const cs = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)])) }
    const o = { htmlClass: document.documentElement.className, body: pick(document.body, ['background-color', 'color']), samples: [] }
    const sels = ['.umm-panel', '[class*="bg-card"]', '.umm-btn--primary', 'h1', 'h2', 'h3', 'button', '.umm-stagger > *']
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (i > 1) return
        const d = pick(el, ['background-color', 'color', 'border-color'])
        d.text = (el.textContent || '').replace(/\s+/g, ' ').slice(0, 26)
        o.samples.push({ sel, ...d })
      })
    }
    return o
  })
  fs.writeFileSync(path.join(out, `${name}-${theme}.json`), JSON.stringify(dump, null, 2))
  console.log(`[${name}-${theme}] class="${dump.htmlClass}" body=${dump.body['background-color']}/${dump.body.color}`)
  for (const s of dump.samples) console.log(`   ${s.sel} → bg=${s['background-color']} color=${s.color} "${s.text}"`)
  await page.close()
}

// Close browser and server even on probe failure — avoid a dangling Edge process
try {
  await probe('options', 'options.html', 'dark')
  await probe('options', 'options.html', 'light')
  await probe('popup', 'popup.html', 'dark')
  await probe('popup', 'popup.html', 'light')
} finally {
  await ctx.close()
  server.close()
}
console.log('done →', out)
