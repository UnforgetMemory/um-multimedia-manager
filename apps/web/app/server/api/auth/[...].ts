import { NuxtAuthHandler } from '#auth'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { useDb } from '~/server/utils/db'
import * as schema from '@umm/database/schema'

export default NuxtAuthHandler({
  secret: process.env.AUTH_SECRET || 'dev-secret-change-in-production',
  adapter: DrizzleAdapter(useDb(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  pages: {
    signIn: '/auth/login',
  },
  providers: [
    {
      id: 'credentials',
      name: 'Credentials',
      type: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        // TODO: 实现密码哈希验证（需用户注册流程）
        return null
      },
    },
  ],
  session: {
    strategy: 'database',
  },
})