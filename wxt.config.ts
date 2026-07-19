import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  alias: {
    '@': './src',
  },
  publicDir: 'icons',
  manifest: {
    name: 'UMManager - 多媒体管理器',
    version: '5.2.1',
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
  },
  entrypointsDir: 'entrypoints',
  outDir: 'dist',
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
    base: '',
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: '[name].js',
        },
      },
    },
  }),
})
