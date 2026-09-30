import { Pool, type PoolClient, type QueryResultRow } from 'pg';

export class Queries {
  constructor(protected connection: Pool | PoolClient) {}

  async all<T extends QueryResultRow = Record<string, any>>(sql: string, values: unknown[] = []): Promise<T[]> {
    return (await this.connection.query<T>(sql, values)).rows;
  }

  async one<T extends QueryResultRow = Record<string, any>>(sql: string, values: unknown[] = []): Promise<T | undefined> {
    return (await this.all<T>(sql, values))[0];
  }

  async run(sql: string, values: unknown[] = []): Promise<void> {
    await this.connection.query(sql, values);
  }
}

export class Database extends Queries {
  constructor(private pool: Pool) { super(pool); }

  async transaction<T>(work: (tx: Queries) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new Queries(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() { await this.pool.end(); }
}

export async function openDatabase(connectionString: string, schema = 'public') {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('Invalid database schema');
  const pool = new Pool({
    connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    options: `-c search_path=${schema} -c statement_timeout=10000 -c idle_in_transaction_session_timeout=15000`,
  });
  pool.on('error', error => console.error('Idle PostgreSQL connection error:', error.name));
  const db = new Database(pool);
  try {
    await db.transaction(async tx => {
      // Multiple API processes may start together during deployment.
      await tx.run('SELECT pg_advisory_xact_lock(820260930)');
      await tx.run(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await tx.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT UNIQUE, nickname TEXT NOT NULL, created_at BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
          created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS login_codes (
          email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at BIGINT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0, requested_at BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runs (
          id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
          level_id INTEGER NOT NULL, score INTEGER NOT NULL, time_left_ms INTEGER,
          echoes_used INTEGER, deaths INTEGER, resets INTEGER, created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS runs_user_level ON runs(user_id, level_id);
        CREATE TABLE IF NOT EXISTS progress (
          user_id TEXT PRIMARY KEY REFERENCES users(id), max_level INTEGER NOT NULL DEFAULT 1,
          tutorial_done INTEGER NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL
        );
      `);
    });
    return db;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
