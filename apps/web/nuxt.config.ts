export default defineNuxtConfig({
  srcDir: 'app',
  ssr: true,
  nitro: {
    preset: 'cloudflare_pages',
  },
  modules: ['@sidebase/nuxt-auth'],
  auth: {
    provider: {
      type: 'authjs',
    },
  },
  runtimeConfig: {
    authOrigin: process.env.CF_PAGES_URL || process.env.AUTH_ORIGIN || '',
    public: {},
  },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-07-01',
})