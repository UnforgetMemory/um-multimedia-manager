import { z } from 'zod'

export const usernameSchema = z
  .string()
  .min(6, '用户名至少 6 个字符')
  .max(16, '用户名最多 16 个字符')
  .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线')

export const passwordSchema = z
  .string()
  .min(6, '密码至少 6 个字符')
  .max(16, '密码最多 16 个字符')
  .regex(/^(?=.*[a-zA-Z])(?=.*\d)/, '密码必须包含至少一个字母和一个数字')

export const inviteCodeSchema = z.string().uuid('邀请码格式无效')

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
})

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  inviteCode: inviteCodeSchema,
})

export const createInviteCodeSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).default(7).optional(),
})