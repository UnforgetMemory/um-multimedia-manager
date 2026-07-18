export default defineNuxtRouteMiddleware(async (to, from) => {
  // Skip init check for setup page itself and API routes
  if (to.path === '/auth/setup' || to.path.startsWith('/api/')) {
    return
  }

  try {
    const data = await $fetch<{ initialized: boolean }>('/api/system/init')
    if (!data.initialized) {
      return navigateTo('/auth/setup')
    }
  } catch {
    // If API call fails, let the user proceed to login
    // The setup page handles DB connectivity on its own
  }
})