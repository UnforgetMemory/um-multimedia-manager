export default defineEventHandler((event) => {
  const start = Date.now()
  const method = event.method
  const path = event.path

  event.node.res.on('finish', () => {
    const duration = Date.now() - start
    const status = event.node.res.statusCode
    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO'
    console.log(`[${level}] ${method} ${path} -> ${status} (${duration}ms)`)
  })
})