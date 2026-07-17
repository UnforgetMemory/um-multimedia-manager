export default defineNuxtConfig({
  srcDir: 'app',
  ssr: true,
  nitro: {
    preset: 'cloudflare_pages',
  },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-07-01',
})