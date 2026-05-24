import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  alias: {
    '@': './src',
  },
  publicDir: 'icons',
  manifest: {
    name: 'UMM - 多媒体管理器',
    version: '1.4.1',
    description: '常见影视音乐平台的观看/收听记录管理工具，支持数据导入、清洗、合并和导出，提供 WebDAV 备份和第三方平台数据抓取功能。',
    permissions: [
      'storage',
      'notifications',
      'alarms',
      'contextMenus',
      'downloads',
      'scripting',
      'activeTab'
    ],
    host_permissions: [
      '*://movie.douban.com/*',
      '*://music.douban.com/*',
      '*://search.douban.com/*',
      '*://www.imdb.com/*',
      '*://neodb.social/*',
      '*://audiences.me/*',
      '*://*.m-team.cc/*',
      '*://ourbits.club/*',
      '*://hdhome.org/*',
      '*://hdarea.club/*',
      '*://pterclub.net/*',
      '*://web5.mukaku.com/*',
      '<all_urls>'
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
      sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self';"
    }
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
