export default defineNuxtConfig({
  srcDir: 'app',
  ssr: true,
  nitro: {
    preset: 'cloudflare_pages',
  },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-07-01',
})