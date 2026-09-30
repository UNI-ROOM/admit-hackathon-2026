import { readFileSync } from 'node:fs';
import { openDatabase } from '../src/db';
import { importSqliteSnapshot } from '../src/import-sqlite';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = await openDatabase(process.env.DATABASE_URL);
try {
  const snapshot = JSON.parse(readFileSync(0, 'utf8'));
  console.log('Imported and verified:', await importSqliteSnapshot(db, snapshot));
} finally { await db.close(); }
