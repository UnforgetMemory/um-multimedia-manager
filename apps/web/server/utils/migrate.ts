import { sql } from 'drizzle-orm'

const MIGRATION_SQL: string[] = [
  'CREATE TABLE IF NOT EXISTS `accounts` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`type` text NOT NULL,`provider` text NOT NULL,`provider_account_id` text NOT NULL,`refresh_token` text,`access_token` text,`expires_at` integer,`token_type` text,`scope` text,`id_token` text,`session_state` text)',
  'CREATE TABLE IF NOT EXISTS `api_tokens` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`token_hash` text NOT NULL,`description` text,`last_used_at` text,`expires_at` text,`created_at` text NOT NULL)',
  'CREATE TABLE IF NOT EXISTS `media_items` (`id` text PRIMARY KEY NOT NULL,`platform` text NOT NULL,`media_type` text NOT NULL,`provider_self_id` text NOT NULL,`title` text NOT NULL,`original_title` text,`cover_url` text,`description` text,`metadata` text,`linked_ids` text,`created_at` text NOT NULL,`updated_at` text NOT NULL)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `idx_media_unique` ON `media_items` (`platform`,`media_type`,`provider_self_id`)',
  'CREATE TABLE IF NOT EXISTS `sessions` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`expires_at` text NOT NULL,`session_token` text NOT NULL)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `sessions_session_token_unique` ON `sessions` (`session_token`)',
  'CREATE TABLE IF NOT EXISTS `sync_logs` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`sync_type` text NOT NULL,`item_count` integer NOT NULL,`status` text NOT NULL,`created_at` text NOT NULL)',
  'CREATE TABLE IF NOT EXISTS `user_marks` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`media_item_id` text NOT NULL,`status` integer DEFAULT 0 NOT NULL,`rating` real,`comment` text,`created_at` text NOT NULL,`updated_at` text NOT NULL)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `idx_user_mark_unique` ON `user_marks` (`user_id`,`media_item_id`)',
  'CREATE INDEX IF NOT EXISTS `idx_user_marks_user` ON `user_marks` (`user_id`)',
  'CREATE TABLE IF NOT EXISTS `users` (`id` text PRIMARY KEY NOT NULL,`name` text,`email` text,`email_verified` text,`image` text,`role` text DEFAULT \'user\' NOT NULL,`created_at` text NOT NULL)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`)',
  'CREATE TABLE IF NOT EXISTS `verification_tokens` (`identifier` text NOT NULL,`token` text NOT NULL,`expires_at` text NOT NULL,PRIMARY KEY(`identifier`, `token`))',
  'CREATE TABLE IF NOT EXISTS `invite_codes` (`code` text PRIMARY KEY NOT NULL,`created_by` text NOT NULL,`expires_at` text NOT NULL,`used_at` text,`used_by` text)',
]

/** Run the list of DDL statements against a db handle. Testable because db handle is passed in. */
export async function applyStatements(
  run: (stmt: ReturnType<typeof sql.raw>) => Promise<unknown>,
): Promise<{ success: boolean; error?: string }> {
  try {
    for (const stmt of MIGRATION_SQL) {
      await run(sql.raw(stmt))
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Unknown error' }
  }
}

/** Production wrapper — resolves D1 from the event then delegates to applyStatements. */
export async function runMigration(event: any): Promise<{ success: boolean; error?: string }> {
  try {
    const { useDb } = await import('./db')
    const db = useDb(event)
    return applyStatements((stmt) => db.run(stmt))
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Unknown error' }
  }
}