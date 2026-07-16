import { users } from '@umm/database/schema'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = useDb()
  return await db.select({
    id: users.id, name: users.name, email: users.email,
    role: users.role, createdAt: users.createdAt,
  }).from(users).orderBy(desc(users.createdAt)).all()
})