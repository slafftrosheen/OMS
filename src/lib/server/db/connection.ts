// src/lib/server/db/connection.ts
import pg from 'pg';
import { env } from '$env/dynamic/private';

const { Pool } = pg;

/**
 * PostgreSQL connection pool
 */
export const pool = new Pool({
  host: env.DB_HOST || 'localhost',
  port: parseInt(env.DB_PORT || '5432'),
  database: env.DB_NAME || 'reclame_oms',
  user: env.DB_USER || 'reclame_admin',
  password: env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✓ Database connection successful');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    return false;
  }
}

/**
 * Query helper with error handling
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0
    };
  } finally {
    client.release();
  }
}

/**
 * Transaction helper
 */
export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Graceful shutdown
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}

// Handle process termination
process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);
