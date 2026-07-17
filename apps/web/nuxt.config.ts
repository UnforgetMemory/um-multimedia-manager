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
        baseURL: process.env.CF_PAGES_URL
          ? `${process.env.CF_PAGES_URL}/api/auth`
          : '/api/auth',
        disableInternalRouting: false,
        originEnvKey: 'AUTH_ORIGIN',
      },
    },
  },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-07-01',
})