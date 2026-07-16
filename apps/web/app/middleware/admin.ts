export default defineNuxtRouteMiddleware((to, from) => {
  const { user } = useAuth()
  if (!user.value) return navigateTo('/auth/login')
  if (user.value.role !== 'admin') return navigateTo('/dashboard')
})