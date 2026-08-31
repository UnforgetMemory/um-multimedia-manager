import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'
import { devVersionSegment } from './src/utils/dev-version'

/**
 * Extension version — single source inside this config; kept in sync with
 * package.json (npm run package:* updates both).
 */
const VERSION = '5.14.2'

const PROD_NAME = 'UMManager - 多媒体管理器'
const DEV_NAME = `${PROD_NAME} (DEV)`

/**
 * Is this a dev build (npm run build:dev)?
 * WXT CLI sets UMM_DEV=1 via the package.json script; the env var is checked
 * here because defineConfig only accepts a static object — manifest alone
 * can be a function, but the outDir and other top-level fields cannot.
 */
const isDevBuild = !!process.env.UMM_DEV

/** Full human-readable dev version, e.g. "5.12.0-dev.20260819.1425". */
function devVersionName(): string {
  const now = new Date()
  const y = now.getFullYear()
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${VERSION}-dev.${y}${mo}${d}.${hh}${mm}`
}

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  alias: {
    '@': './src',
  },
  publicDir: 'icons',
  // WXT appends the browser-mv suffix: 'dist' → dist/chrome-mv3,
  // 'dist-dev' → dist-dev/chrome-mv3.
  outDir: isDevBuild ? 'dist-dev' : 'dist',
  manifest: (env) => ({
    name: isDevBuild || env.command === 'serve' ? DEV_NAME : PROD_NAME,
    version: isDevBuild ? `${VERSION}.${devVersionSegment(new Date())}` : VERSION,
    // chrome://extensions displays version_name instead of version when
    // present — carry the full timestamp there for dev builds only.
    ...(isDevBuild ? { version_name: devVersionName() } : {}),
    // Runtime floor: Promise.withResolvers (requestQueue.ts) is Chrome 119+.
    // Declaring it prevents a broken install on older Chrome instead of
    // failing at runtime (ADR-009 / optimization-blueprint E3).
    minimum_chrome_version: '119',
    description: '常见影视音乐平台的观看/收听记录管理工具，支持数据导入、清洗、合并和导出，提供 WebDAV 备份和第三方平台数据抓取功能。',
    permissions: [
      'storage',
      'notifications',
      'alarms',
      'contextMenus',
      'scripting',
      'activeTab'
    ],
    host_permissions: [
      '*://movie.douban.com/*',
      '*://music.douban.com/*',
      '*://book.douban.com/*',
      '*://search.douban.com/*',
      '*://www.douban.com/*',
      '*://*.doubanio.com/*',
      '*://www.imdb.com/*',
      '*://neodb.social/*',
      '*://audiences.me/*',
      '*://*.m-team.cc/*',
      '*://ourbits.club/*',
      '*://hdhome.org/*',
      '*://hdarea.club/*',
      '*://pterclub.net/*',
      '*://www.pthome.net/*',
      '*://www.haidan.cc/*',
      '*://web5.mukaku.com/*',
      '*://www.sehuatang.net/*',
      '*://www.sehuatang.org/*',
      '*://sehuatang.net/*',
      '*://sehuatang.org/*',
      '*://javdb.com/*',
      '*://ptsbao.club/*',
      '*://pt.btschool.club/*',
      '*://discfan.net/*',
      '*://hhanclub.net/*',
      '*://hddolby.com/*',
      '*://hdfans.org/*',
      '*://pt.soulvoice.club/*',
      '*://hdtime.org/*',
      '*://piggo.me/*',
      '*://www.bilibili.com/*',
      '*://search.bilibili.com/*',
      '*://www.themoviedb.org/*',
      '*://bgm.tv/*',
      '*://bangumi.tv/*',
      '*://chii.in/*',
      '*://www.youtube.com/*',
      '*://m.youtube.com/*',
      // WebDAV sync - common providers (background fetch requires explicit host_permissions)
      'https://dav.jianguoyun.com/*',
      'https://webdav.jianguoyun.com/*',
      'https://dav.smzdm.com/*',
      'https://dav.sourceforge.net/*',
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
      sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self';"
    },
    options_page: 'options.html',
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
  }),
  entrypointsDir: 'entrypoints',
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
    base: '',
    server: {
      watch: {
        // Scratch dirs written during dev sessions: agent memory files use
        // atomic-write temp files that crashed chokidar with EBUSY (kill the
        // dev server); visual-probe artifacts spam chokidar. Neither is part
        // of the module graph — never watch them. (Function form: chokidar
        // v4+ dropped glob support in `ignored`.)
        ignored: (path: string) => path.includes('.um.agents') || path.includes('tmp-fixture'),
      },
    },
    build: {
      target: 'es2022',
      // Disable Vite's modulepreload tags in popup.html/options.html — Chrome's
      // preload scanner flags extension-page preloads of non-web-accessible
      // chunks as "cross-world extension resource mismatch" noise. Extension
      // pages load chunks locally, so preloading gains nothing.
      modulePreload: false,
      rolldownOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: '[name].js',

        },
      },
    },
  }),
})