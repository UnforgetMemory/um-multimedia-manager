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
    public: {
      auth: {
        baseURL: process.env.NUXT_PUBLIC_AUTH_BASE_URL
          || process.env.AUTH_ORIGIN
          || process.env.CF_PAGES_URL
          || 'https://localhost/api/auth',
        disableInternalRouting: false,
        originEnvKey: 'AUTH_ORIGIN',
      },
    },
  },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-07-01',
})