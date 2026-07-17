export default defineNuxtPlugin(async () => {
  const authState = useState<{
    user: { id: string; name: string | null; email: string | null; role: string; image: string | null } | null
    loading: boolean
    lastRefreshedAt: number | null
  }>('auth')

  try {
    const event = useRequestEvent()
    if (event) {
      const user = await getSessionUser(event)
      authState.value = {
        user,
        loading: false,
        lastRefreshedAt: Date.now(),
      }
    }
  } catch {
    authState.value = {
      user: null,
      loading: false,
      lastRefreshedAt: null,
    }
  }
})