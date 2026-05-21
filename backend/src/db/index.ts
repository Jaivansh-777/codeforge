import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import { config } from '../config';
import { SCHEMA_SQL } from './schema';

let sql: ReturnType<typeof neon> | null = null;

export function getDb() {
  if (!sql) {
    if (!config.database.url) {
      return null;
    }
    sql = neon(config.database.url);
  }
  return sql;
}

export async function initDb() {
  const db = getDb();
  if (!db) {
    console.warn('No DATABASE_URL configured, running without database.');
    return;
  }
  try {
    const statements = SCHEMA_SQL.split(';').filter(s => s.trim().length > 0);
    for (const stmt of statements) {
      await db(stmt.trim());
    }
    console.log('Database schema initialized successfully.');
  } catch (err: any) {
    if (err?.code === '42P07') {
      console.log('Database schema already exists, skipping initialization.');
    } else if (err?.code === '42804' || err?.message?.includes('incompatible types')) {
      console.warn('Schema migration issue detected. Tables may already exist with different types.');
      console.warn('Run: DROP TABLE IF EXISTS users, snippets, execution_logs CASCADE; to reset.');
    } else {
      console.error('Failed to initialize database schema:', err.message || err);
    }
  }
}

export async function logExecution(data: {
  language: string;
  code: string;
  input?: string;
  output?: string;
  error?: string;
  execution_time_ms: number;
  memory_used_kb: number;
  cpu_time_ms?: number;
  exit_code?: number;
  status: string;
}) {
  const db = getDb();
  if (!db) return;
  try {
    const codeHash = createHash('sha256').update(data.code).digest('hex');
    await db(
      `INSERT INTO execution_logs (language, code_hash, input, output, error, execution_time_ms, memory_used_kb, cpu_time_ms, exit_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [data.language, codeHash, data.input || '', data.output || '', data.error || '',
       data.execution_time_ms, data.memory_used_kb, data.cpu_time_ms || 0, data.exit_code || 0, data.status]
    );
  } catch (err) {
    console.error('Failed to log execution:', err);
  }
}

export async function saveSnippet(data: {
  language: string;
  code: string;
  title?: string;
}) {
  const db = getDb();
  if (!db) return null;
  try {
    const result = await db(
      `INSERT INTO snippets (language, code, title)
       VALUES ($1, $2, $3)
       RETURNING id, title, language, created_at`,
      [data.language, data.code, data.title || 'Untitled']
    );
    const rows = result as Record<string, any>[];
    return rows[0] || null;
  } catch (err) {
    console.error('Failed to save snippet:', err);
    return null;
  }
}
