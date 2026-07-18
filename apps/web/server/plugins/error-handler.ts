import type { H3Error, H3Event } from 'h3'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request:error', (event: H3Event, error: H3Error) => {
    const path = event.path ?? 'unknown'
    const method = event.method ?? 'UNKNOWN'
    console.error(`[ERROR] ${method} ${path}: ${error.message}`)
  })
})