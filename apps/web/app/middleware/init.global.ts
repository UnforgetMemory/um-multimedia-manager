export default defineNuxtRouteMiddleware(async (to, from) => {
  if (to.path === '/auth/setup' || to.path.startsWith('/api/')) {
    return
  }

  try {
    const data = await $fetch<{ initialized: boolean }>('/api/system/init')
    if (!data.initialized) {
      return navigateTo('/auth/setup')
    }
  } catch {
    return navigateTo('/auth/setup')
  }
})