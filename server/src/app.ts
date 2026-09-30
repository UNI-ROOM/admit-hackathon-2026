import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { LEVEL_ECHOES, levelScore } from '../../shared/score';

type User = { id: string; email: string | null; nickname: string };
type Options = { db: Database.Database; sendCode: (email: string, code: string) => Promise<void>; production?: boolean; origin?: string; now?: () => number };
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const boardSQL = `SELECT u.id, u.nickname, SUM(b.best) total, COUNT(*) levels FROM (SELECT user_id, level_id, MAX(score) best FROM runs GROUP BY user_id, level_id) b JOIN users u ON u.id=b.user_id GROUP BY u.id ORDER BY total DESC, u.id ASC`;
export function createApp({ db, sendCode, production = false, origin, now = Date.now }: Options) {
  const app = new Hono<{ Variables: { user: User | null } }>();
  const sessionTTL = 30 * 86400 * 1000;
  let boardCache: { until: number; rows: any[] } | undefined;
  const invalidate = () => { boardCache = undefined; };
  const snapshot = (u: User) => ({ user: { ...u, isGuest: !u.email }, progress: db.prepare('SELECT max_level, tutorial_done FROM progress WHERE user_id=?').get(u.id), best: Object.fromEntries((db.prepare('SELECT level_id, MAX(score) score FROM runs WHERE user_id=? GROUP BY level_id').all(u.id) as any[]).map(r => [r.level_id, r.score])) });
  const newUser = () => {
    const u: User = { id: randomUUID(), email: null, nickname: `Гость-${randomInt(1000, 10000)}` };
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(u.id, null, u.nickname, now());
    db.prepare('INSERT INTO progress (user_id, updated_at) VALUES (?, ?)').run(u.id, now());
    return u;
  };
  function session(c: any, u: User) {
    const old = getCookie(c, 'echo_sid');
    if (old) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(old));
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(hash(token), u.id, now(), now() + sessionTTL);
    setCookie(c, 'echo_sid', token, { httpOnly: true, secure: production, sameSite: 'Lax', path: '/', maxAge: sessionTTL / 1000 });
  }
  app.use('/api/*', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'body_too_large' }, 413) }));
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      const requestOrigin = c.req.header('Origin');
      if (c.req.header('Sec-Fetch-Site') === 'cross-site' || (origin && requestOrigin && requestOrigin !== origin)) return c.json({ error: 'origin_forbidden' }, 403);
      if (Number(c.req.header('Content-Length') || 0) > 4096) return c.json({ error: 'body_too_large' }, 413);
      if (c.req.path !== '/api/session' && c.req.path !== '/api/auth/logout' && !c.req.header('Content-Type')?.startsWith('application/json')) return c.json({ error: 'json_required' }, 400);
    }
    const token = getCookie(c, 'echo_sid');
    const u = token ? db.prepare('SELECT u.id,u.email,u.nickname FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?').get(hash(token), now()) as User | undefined : undefined;
    c.set('user', u || null);
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof z.ZodError || err instanceof SyntaxError) return c.json({ error: 'invalid_input' }, 400);
    console.error('API error:', err.name);
    return c.json({ error: 'internal_error' }, 500);
  });
  app.get('/api/health', c => c.json({ ok: true, uptime: process.uptime() }));
  app.post('/api/session', c => {
    let u = c.get('user');
    if (!u) { u = db.transaction(newUser)(); session(c, u); }
    return c.json(snapshot(u));
  });
  app.get('/api/me', c => c.get('user') ? c.json(snapshot(c.get('user')!)) : c.json({ error: 'unauthorized' }, 401));
  app.post('/api/auth/request', async c => {
    if (!c.get('user')) return c.json({ error: 'unauthorized' }, 401);
    const { email } = z.object({ email: emailSchema }).parse(await c.req.json());
    const previous = db.prepare('SELECT requested_at FROM login_codes WHERE email=?').get(email) as any;
    if (previous && now() - previous.requested_at < 60000) return c.json({ error: 'rate_limited' }, 429);
    // Global persisted cap bounds mail abuse even when guests rotate sessions.
    const recent = db.prepare('SELECT COUNT(*) n FROM login_codes WHERE requested_at>?').get(now() - 60000) as any;
    if (recent.n >= 20) return c.json({ error: 'rate_limited' }, 429);
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const digest = hash(code + email);
    db.prepare('INSERT OR REPLACE INTO login_codes VALUES (?, ?, ?, 0, ?)').run(email, digest, now() + 600000, now());
    try { await sendCode(email, code); }
    catch { db.prepare('DELETE FROM login_codes WHERE email=? AND code_hash=?').run(email, digest); return c.json({ error: 'mail_unavailable' }, 503); }
    return c.json({ ok: true });
  });
  app.post('/api/auth/verify', async c => {
    const current = c.get('user');
    if (!current) return c.json({ error: 'unauthorized' }, 401);
    const { email, code } = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).parse(await c.req.json());
    const entry = db.prepare('SELECT * FROM login_codes WHERE email=?').get(email) as any;
    if (!entry || entry.expires_at <= now() || entry.attempts >= 5) return c.json({ error: 'invalid_code' }, 400);
    db.prepare('UPDATE login_codes SET attempts=attempts+1 WHERE email=?').run(email);
    if (!timingSafeEqual(Buffer.from(hash(code + email)), Buffer.from(entry.code_hash))) return c.json({ error: 'invalid_code' }, 400);
    const u = db.transaction(() => {
      let target = db.prepare('SELECT id,email,nickname FROM users WHERE email=?').get(email) as User | undefined;
      if (!target) {
        target = current.email ? newUser() : current;
        db.prepare('UPDATE users SET email=? WHERE id=?').run(email, target.id);
        target = { ...target, email };
      }
      if (!current.email && target.id !== current.id) {
        db.prepare('UPDATE runs SET user_id=? WHERE user_id=?').run(target.id, current.id);
        db.prepare('UPDATE progress SET max_level=MAX(max_level,(SELECT max_level FROM progress WHERE user_id=?)), tutorial_done=MAX(tutorial_done,(SELECT tutorial_done FROM progress WHERE user_id=?)),updated_at=? WHERE user_id=?').run(current.id, current.id, now(), target.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(current.id);
        db.prepare('DELETE FROM progress WHERE user_id=?').run(current.id);
        db.prepare('DELETE FROM users WHERE id=?').run(current.id);
      }
      db.prepare('DELETE FROM login_codes WHERE email=?').run(email);
      return target;
    })();
    session(c, u); invalidate();
    return c.json(snapshot(u));
  });
  app.post('/api/auth/logout', c => {
    const token = getCookie(c, 'echo_sid');
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
    deleteCookie(c, 'echo_sid', { path: '/' });
    return c.json({ ok: true });
  });
  app.patch('/api/me', async c => {
    const u = c.get('user'); if (!u) return c.json({ error: 'unauthorized' }, 401);
    const { nickname } = z.object({ nickname: z.string().trim().min(2).max(16) }).parse(await c.req.json());
    db.prepare('UPDATE users SET nickname=? WHERE id=?').run(nickname, u.id); invalidate();
    return c.json(snapshot({ ...u, nickname }));
  });
  app.put('/api/progress', async c => {
    const u = c.get('user'); if (!u) return c.json({ error: 'unauthorized' }, 401);
    const p = z.object({ maxLevel: z.number().int().min(1).max(LEVEL_ECHOES.length).optional(), tutorialDone: z.boolean().optional() }).parse(await c.req.json());
    db.prepare('UPDATE progress SET max_level=MAX(max_level,?),tutorial_done=MAX(tutorial_done,?),updated_at=? WHERE user_id=?').run(p.maxLevel || 1, p.tutorialDone ? 1 : 0, now(), u.id);
    return c.json({ ok: true });
  });
  app.post('/api/runs', async c => {
    const u = c.get('user'); if (!u) return c.json({ error: 'unauthorized' }, 401);
    const p = z.object({ levelId: z.number().int().min(1).max(LEVEL_ECHOES.length), timeLeftMs: z.number().finite(), echoesUsed: z.number().int().min(0), deaths: z.number().int().min(0).max(100000), resets: z.number().int().min(0).max(100000) }).parse(await c.req.json());
    const maxEchoes = LEVEL_ECHOES[p.levelId - 1];
    p.timeLeftMs = Math.round(Math.max(0, Math.min(10000, p.timeLeftMs)));
    p.echoesUsed = Math.min(maxEchoes, p.echoesUsed);
    const score = levelScore({ ...p, maxEchoes });
    db.prepare('INSERT INTO runs (user_id,level_id,score,time_left_ms,echoes_used,deaths,resets,created_at) VALUES (?,?,?,?,?,?,?,?)').run(u.id,p.levelId,score,p.timeLeftMs,p.echoesUsed,p.deaths,p.resets,now());
    db.prepare('UPDATE progress SET max_level=MAX(max_level,?),updated_at=? WHERE user_id=?').run(Math.min(p.levelId + 1, LEVEL_ECHOES.length), now(), u.id);
    invalidate();
    const best = (db.prepare('SELECT MAX(score) best FROM runs WHERE user_id=? AND level_id=?').get(u.id,p.levelId) as any).best;
    const rank = (db.prepare(boardSQL).all() as any[]).findIndex(r => r.id === u.id) + 1;
    return c.json({ score, best, rank });
  });
  app.get('/api/leaderboard', c => {
    const limit = z.coerce.number().int().min(1).max(100).parse(c.req.query('limit') || 10);
    if (!boardCache || boardCache.until <= now()) boardCache = { until: now() + 5000, rows: db.prepare(boardSQL + ' LIMIT 100').all() };
    return c.json(boardCache.rows.slice(0, limit).map(({ id, ...r }) => ({ ...r, isMe: id === c.get('user')?.id })));
  });
  return app;
}
