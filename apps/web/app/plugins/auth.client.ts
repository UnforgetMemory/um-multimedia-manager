export default defineNuxtPlugin(() => {
  const { fetchSession } = useAuth()
  // Fetch session on client mount
  fetchSession()
})