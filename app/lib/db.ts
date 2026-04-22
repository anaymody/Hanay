import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

if (process.env.NODE_ENV !== 'production') {
  global.__pgPool = pool;
}

export async function query<T = any>(
  text: string,
  params: any[] = [],
): Promise<{ rows: T[]; rowCount: number | null }> {
  const res = await pool.query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount };
}
