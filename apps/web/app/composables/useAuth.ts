import type { AuthUser } from '~/server/utils/auth'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  lastRefreshedAt: number | null
}

export function useAuth() {
  const authState = useState<AuthState>('auth', () => ({
    user: null,
    loading: true,
    lastRefreshedAt: null,
  }))

  async function fetchSession() {
    try {
      authState.value.loading = true
      const data = await $fetch<{ user: AuthUser | null }>('/api/auth/session')
      authState.value.user = data.user
      authState.value.lastRefreshedAt = Date.now()
    } catch {
      authState.value.user = null
    } finally {
      authState.value.loading = false
    }
  }

  async function signIn(
    provider: string,
    options: {
      email: string
      password: string
      redirect?: boolean
      callbackUrl?: string
    },
  ) {
    if (provider !== 'credentials') {
      throw new Error(`Unsupported provider: ${provider}`)
    }

    try {
      const data = await $fetch<{ user: AuthUser } | null>(
        '/api/auth/callback/credentials',
        {
          method: 'POST',
          body: {
            email: options.email,
            password: options.password,
            redirect: false,
          },
        },
      )

      if (data?.user) {
        authState.value.user = data.user
        authState.value.lastRefreshedAt = Date.now()
      }

      if (options.redirect !== false) {
        await navigateTo(options.callbackUrl || '/dashboard')
      }

      return data
    } catch (err: any) {
      authState.value.user = null
      throw err
    }
  }

  async function signOut() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore
    }
    authState.value.user = null
    authState.value.lastRefreshedAt = null
    await navigateTo('/auth/login')
  }

  // Fetch session on first call if not loaded
  if (import.meta.client && authState.value.loading && authState.value.lastRefreshedAt === null) {
    // Defer to next tick to avoid SSR mismatch
    nextTick(() => fetchSession())
  }

  // On server, try to get session from SSR context
  if (import.meta.server) {
    // The session is fetched during SSR via the plugin
  }

  return {
    user: computed(() => authState.value.user),
    loading: computed(() => authState.value.loading),
    lastRefreshedAt: computed(() => authState.value.lastRefreshedAt),
    signIn,
    signOut,
    fetchSession,
  }
}