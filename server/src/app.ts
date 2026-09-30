import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { type Database, type Queries } from './db';
import { LEVEL_ECHOES, levelScore, maxEchoesForLevel } from '../../shared/score';

type User = { id: string; email: string | null; nickname: string };
type BoardRow = { id: string; nickname: string; total: number; levels: number };
type Options = {
  db: Database; sendCode: (email: string, code: string) => Promise<void>;
  production?: boolean; origin?: string; now?: () => number;
};
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const boardSQL = `SELECT u.id, u.nickname, SUM(b.best)::integer total, COUNT(*)::integer levels
  FROM (SELECT user_id, level_id, MAX(score) best FROM runs WHERE level_id <= ${LEVEL_ECHOES.length} GROUP BY user_id, level_id) b
  JOIN users u ON u.id=b.user_id GROUP BY u.id ORDER BY total DESC, u.id ASC`;
const rankSQL = `SELECT id, total, levels, RANK() OVER (ORDER BY total DESC, id ASC)::integer rnk FROM (${boardSQL}) t`;

export function createApp({ db, sendCode, production = false, origin, now = Date.now }: Options) {
  const app = new Hono<{ Variables: { user: User | null } }>();
  const sessionTTL = 30 * 86400 * 1000;
  let boardCache: { until: number; rows: BoardRow[] } | undefined;
  const invalidate = () => { boardCache = undefined; };

  async function snapshot(u: User) {
    const [progress, best] = await Promise.all([
      db.one('SELECT max_level, tutorial_done FROM progress WHERE user_id=$1', [u.id]),
      db.all('SELECT level_id, MAX(score) score FROM runs WHERE user_id=$1 AND level_id <= $2 GROUP BY level_id', [u.id, LEVEL_ECHOES.length]),
    ]);
    return { user: { ...u, isGuest: !u.email }, progress, best: Object.fromEntries(best.map(r => [r.level_id, r.score])) };
  }

  async function newUser(tx: Queries): Promise<User> {
    const u: User = { id: randomUUID(), email: null, nickname: `Guest-${randomInt(1000, 10000)}` };
    await tx.run('INSERT INTO users VALUES ($1, $2, $3, $4)', [u.id, null, u.nickname, now()]);
    await tx.run('INSERT INTO progress (user_id, updated_at) VALUES ($1, $2)', [u.id, now()]);
    return u;
  }

  async function createSession(tx: Queries, old: string | undefined, u: User) {
    if (old) await tx.run('DELETE FROM sessions WHERE token=$1', [hash(old)]);
    const token = randomBytes(32).toString('hex');
    await tx.run('INSERT INTO sessions VALUES ($1, $2, $3, $4)', [hash(token), u.id, now(), now() + sessionTTL]);
    return token;
  }

  function cookie(c: Context, token: string) {
    setCookie(c, 'echo_sid', token, {
      httpOnly: true, secure: production, sameSite: 'Lax', path: '/', maxAge: sessionTTL / 1000,
    });
  }

  app.use('/api/*', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'body_too_large' }, 413) }));
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      const requestOrigin = c.req.header('Origin');
      if (c.req.header('Sec-Fetch-Site') === 'cross-site' || (origin && requestOrigin && requestOrigin !== origin)) {
        return c.json({ error: 'origin_forbidden' }, 403);
      }
      if (!['/api/session', '/api/auth/logout'].includes(c.req.path) && !c.req.header('Content-Type')?.startsWith('application/json')) {
        return c.json({ error: 'json_required' }, 400);
      }
    }
    const token = getCookie(c, 'echo_sid');
    const u = token ? await db.one<User>(`SELECT u.id,u.email,u.nickname FROM sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>$2`, [hash(token), now()]) : undefined;
    c.set('user', u || null);
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof z.ZodError || err instanceof SyntaxError) return c.json({ error: 'invalid_input' }, 400);
    console.error('API error:', err.name);
    return c.json({ error: 'internal_error' }, 500);
  });

  app.get('/api/health', async c => {
    try {
      await db.run('SELECT 1');
      return c.json({ ok: true, database: 'postgresql', uptime: process.uptime() });
    } catch {
      return c.json({ ok: false, error: 'database_unavailable' }, 503);
    }
  });

  app.post('/api/session', async c => {
    let u = c.get('user');
    if (!u) {
      const created = await db.transaction(async tx => {
        const user = await newUser(tx);
        return { user, token: await createSession(tx, getCookie(c, 'echo_sid'), user) };
      });
      u = created.user;
      cookie(c, created.token);
    }
    return c.json(await snapshot(u));
  });
  app.get('/api/me', async c => c.get('user') ? c.json(await snapshot(c.get('user')!)) : c.json({ error: 'unauthorized' }, 401));

  app.get('/api/me/rank', async c => {
    const u = c.get('user'); if (!u) return c.json({ error: 'unauthorized' }, 401);
    const rows = await db.all<{ id: string; total: number; levels: number; rnk: number }>(rankSQL);
    const mine = rows.find(r => r.id === u.id);
    return c.json({ rank: mine ? mine.rnk : null, total: mine?.total ?? 0, levels: mine?.levels ?? 0, players: rows.length });
  });

  app.post('/api/auth/request', async c => {
    if (!c.get('user')) return c.json({ error: 'unauthorized' }, 401);
    const { email } = z.object({ email: emailSchema }).parse(await c.req.json());
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const digest = hash(code + email);
    const allowed = await db.transaction(async tx => {
      // Serialize the global quota check, including across API processes.
      await tx.run('SELECT pg_advisory_xact_lock(820260931)');
      const previous = await tx.one('SELECT requested_at FROM login_codes WHERE email=$1', [email]);
      if (previous && now() - Number(previous.requested_at) < 60000) return false;
      const recent = await tx.one('SELECT COUNT(*)::integer n FROM login_codes WHERE requested_at>$1', [now() - 60000]);
      if (recent!.n >= 20) return false;
      await tx.run(`INSERT INTO login_codes VALUES ($1,$2,$3,0,$4) ON CONFLICT (email)
        DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0,requested_at=EXCLUDED.requested_at`,
      [email, digest, now() + 600000, now()]);
      return true;
    });
    if (!allowed) return c.json({ error: 'rate_limited' }, 429);
    try { await sendCode(email, code); }
    catch {
      await db.run('DELETE FROM login_codes WHERE email=$1 AND code_hash=$2', [email, digest]);
      return c.json({ error: 'mail_unavailable' }, 503);
    }
    return c.json({ ok: true });
  });

  app.post('/api/auth/verify', async c => {
    const sessionUser = c.get('user');
    if (!sessionUser) return c.json({ error: 'unauthorized' }, 401);
    const { email, code } = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).parse(await c.req.json());
    const verified = await db.transaction(async tx => {
      // Code consumption, guest merge and token rotation must commit together.
      await tx.run('SELECT pg_advisory_xact_lock(820260932)');
      const current = await tx.one<User>('SELECT id,email,nickname FROM users WHERE id=$1 FOR UPDATE', [sessionUser.id]);
      if (!current) return null;
      const entry = await tx.one('SELECT * FROM login_codes WHERE email=$1 FOR UPDATE', [email]);
      if (!entry || Number(entry.expires_at) <= now() || entry.attempts >= 5) return null;
      await tx.run('UPDATE login_codes SET attempts=attempts+1 WHERE email=$1', [email]);
      if (!timingSafeEqual(Buffer.from(hash(code + email)), Buffer.from(entry.code_hash))) return null;
      let target = await tx.one<User>('SELECT id,email,nickname FROM users WHERE email=$1', [email]);
      if (!target) {
        target = current.email ? await newUser(tx) : current;
        await tx.run('UPDATE users SET email=$1 WHERE id=$2', [email, target.id]);
        target = { ...target, email };
      }
      if (!current.email && target.id !== current.id) {
        await tx.run('UPDATE runs SET user_id=$1 WHERE user_id=$2', [target.id, current.id]);
        await tx.run(`UPDATE progress SET
          max_level=GREATEST(max_level,(SELECT max_level FROM progress WHERE user_id=$1)),
          tutorial_done=GREATEST(tutorial_done,(SELECT tutorial_done FROM progress WHERE user_id=$1)),
          updated_at=$2 WHERE user_id=$3`, [current.id, now(), target.id]);
        await tx.run('DELETE FROM sessions WHERE user_id=$1', [current.id]);
        await tx.run('DELETE FROM progress WHERE user_id=$1', [current.id]);
        await tx.run('DELETE FROM users WHERE id=$1', [current.id]);
      }
      await tx.run('DELETE FROM login_codes WHERE email=$1', [email]);
      return { user: target, token: await createSession(tx, getCookie(c, 'echo_sid'), target) };
    });
    if (!verified) return c.json({ error: 'invalid_code' }, 400);
    cookie(c, verified.token);
    invalidate();
    return c.json(await snapshot(verified.user));
  });

  app.post('/api/auth/logout', async c => {
    const token = getCookie(c, 'echo_sid');
    if (token) await db.run('DELETE FROM sessions WHERE token=$1', [hash(token)]);
    deleteCookie(c, 'echo_sid', { path: '/' });
    return c.json({ ok: true });
  });

  app.patch('/api/me', async c => {
    const u = c.get('user'); if (!u) return c.json({ error: 'unauthorized' }, 401);
    const { nickname } = z.object({ nickname: z.string().trim().min(2).max(16) }).parse(await c.req.json());
    await db.run('UPDATE users SET nickname=$1 WHERE id=$2', [nickname, u.id]);
    invalidate();
    return c.json(await snapshot({ ...u, nickname }));
  });

  app.put('/api/progress', async c => {
    const u = c.get('user'); if (!u) return c.json({ error: 'unauthorized' }, 401);
    const p = z.object({ maxLevel: z.number().int().min(1).max(LEVEL_ECHOES.length).optional(), tutorialDone: z.boolean().optional() }).parse(await c.req.json());
    await db.run(`UPDATE progress SET max_level=GREATEST(max_level,$1),tutorial_done=GREATEST(tutorial_done,$2),updated_at=$3 WHERE user_id=$4`,
      [p.maxLevel || 1, p.tutorialDone ? 1 : 0, now(), u.id]);
    return c.json({ ok: true });
  });

  app.post('/api/runs', async c => {
    const u = c.get('user'); if (!u) return c.json({ error: 'unauthorized' }, 401);
    const p = z.object({
      difficulty: z.enum(['easy', 'hard']).default('hard'),
      levelId: z.number().int().min(1).max(LEVEL_ECHOES.length), timeLeftMs: z.number().finite(),
      echoesUsed: z.number().int().min(0), deaths: z.number().int().min(0).max(100000), resets: z.number().int().min(0).max(100000),
    }).parse(await c.req.json());
    const maxEchoes = maxEchoesForLevel(p.levelId, p.difficulty);
    p.timeLeftMs = Math.round(Math.max(0, Math.min(10000, p.timeLeftMs)));
    p.echoesUsed = Math.min(maxEchoes, p.echoesUsed);
    const score = levelScore({ ...p, maxEchoes });
    await db.transaction(async tx => {
      await tx.run(`INSERT INTO runs (user_id,level_id,score,time_left_ms,echoes_used,deaths,resets,created_at,difficulty)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [u.id,p.levelId,score,p.timeLeftMs,p.echoesUsed,p.deaths,p.resets,now(),p.difficulty]);
      await tx.run('UPDATE progress SET max_level=GREATEST(max_level,$1),updated_at=$2 WHERE user_id=$3',
        [Math.min(p.levelId + 1, LEVEL_ECHOES.length), now(), u.id]);
    });
    invalidate();
    const best = (await db.one('SELECT MAX(score) best FROM runs WHERE user_id=$1 AND level_id=$2', [u.id,p.levelId]))!.best;
    const rank = (await db.all<BoardRow>(boardSQL)).findIndex(r => r.id === u.id) + 1;
    return c.json({ score, best, rank });
  });

  app.get('/api/leaderboard', async c => {
    const limit = z.coerce.number().int().min(1).max(100).parse(c.req.query('limit') || 10);
    if (!boardCache || boardCache.until <= now()) boardCache = { until: now() + 5000, rows: await db.all<BoardRow>(boardSQL + ' LIMIT 100') };
    return c.json(boardCache.rows.slice(0, limit).map(({ id, ...r }) => ({ ...r, isMe: id === c.get('user')?.id })));
  });
  return app;
}
