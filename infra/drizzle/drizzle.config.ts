import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: '../../packages/database/src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
});
