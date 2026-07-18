import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    globals: true,
    include: ['test/**/*.test.ts'],
    exclude: ['test/server/api/**', 'node_modules', '.nuxt'],
    setupFiles: ['test/setup.ts'],
  },
})