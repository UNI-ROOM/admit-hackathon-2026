import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { createApp } from './app';
import { openDatabase } from './db';
import { sendCode } from './mail';
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = await openDatabase(process.env.DATABASE_URL);
const app = createApp({ db, sendCode, production: process.env.NODE_ENV === 'production', origin: process.env.PUBLIC_ORIGIN });
const server = serve({ fetch: app.fetch, hostname: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3000) });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close(async () => { await db.close(); process.exit(0); });
});
