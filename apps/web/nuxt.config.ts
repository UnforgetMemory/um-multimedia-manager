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
    baseURL: process.env.NUXT_PUBLIC_AUTH_BASE_URL
      || process.env.AUTH_ORIGIN
      || '/api/auth',
  },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-07-01',
})