import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth.js';
import syncRoutes from './routes/sync.js';
import marksRoutes from './routes/marks.js';
import itemsRoutes from './routes/items.js';
import tokensRoutes from './routes/tokens.js';

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS
app.use('/*', cors());

// Health check (no auth required)
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', version: '0.1.0' });
});

// All /api/* routes require auth
app.use('/api/*', authMiddleware);

app.route('/api/sync', syncRoutes);
app.route('/api/marks', marksRoutes);
app.route('/api/items', itemsRoutes);
app.route('/api/tokens', tokensRoutes);

export default app;
