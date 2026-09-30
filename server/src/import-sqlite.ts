import { z } from 'zod';
import type { Database } from './db';

const columns = {
  users: ['id', 'email', 'nickname', 'created_at'],
  sessions: ['token', 'user_id', 'created_at', 'expires_at'],
  login_codes: ['email', 'code_hash', 'expires_at', 'attempts', 'requested_at'],
  runs: ['id', 'user_id', 'level_id', 'score', 'time_left_ms', 'echoes_used', 'deaths', 'resets', 'created_at'],
  progress: ['user_id', 'max_level', 'tutorial_done', 'updated_at'],
};
const row = z.record(z.string(), z.union([z.string(), z.number().int(), z.null()]));
const snapshotSchema = z.object({
  users: z.array(row), sessions: z.array(row), login_codes: z.array(row), runs: z.array(row), progress: z.array(row),
});

/** One-time import. Refuses to overwrite or merge a populated PostgreSQL database. */
export async function importSqliteSnapshot(db: Database, input: unknown) {
  const snapshot = snapshotSchema.parse(input);
  return db.transaction(async tx => {
    await tx.run('LOCK TABLE users, sessions, login_codes, runs, progress IN ACCESS EXCLUSIVE MODE');
    for (const table of Object.keys(columns) as (keyof typeof columns)[]) {
      const count = await tx.one(`SELECT COUNT(*)::integer n FROM ${table}`);
      if (count!.n !== 0) throw new Error(`Import requires an empty database: ${table}`);
      const fields = columns[table];
      for (const row of snapshot[table]) {
        if (fields.some(field => !(field in row))) throw new Error(`Missing column in ${table}`);
        await tx.run(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')})`, fields.map(field => row[field]));
      }
      const imported = await tx.all(`SELECT ${fields.join(',')} FROM ${table}`);
      const normalize = (r: Record<string, unknown>) => JSON.stringify(fields.map(f => r[f] === null ? null : String(r[f])));
      const expected = snapshot[table].map(normalize).sort();
      const actual = imported.map(normalize).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Import verification failed: ${table}`);
    }
    await tx.run("SELECT setval(pg_get_serial_sequence('runs','id'),COALESCE((SELECT MAX(id) FROM runs),1),(SELECT COUNT(*)>0 FROM runs))");
    return Object.fromEntries(Object.entries(snapshot).map(([table, rows]) => [table, rows.length]));
  });
}
