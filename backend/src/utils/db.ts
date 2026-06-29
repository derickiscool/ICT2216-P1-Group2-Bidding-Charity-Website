import { AsyncLocalStorage } from 'async_hooks';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bidforgood',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const transactionClient = new AsyncLocalStorage<PoolClient>();

export const query = async <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> => {
  const client = transactionClient.getStore();
  const res = client ? await client.query<T>(text, params) : await pool.query<T>(text, params);
  return res;
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

export const withTransaction = async <T>(fn: () => Promise<T>): Promise<T> => {
  const existingClient = transactionClient.getStore();
  if (existingClient) return fn();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await transactionClient.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const testConnection = async (): Promise<{ success: boolean; message: string; latency?: number }> => {
  try {
    const start = Date.now();
    await pool.query('SELECT NOW()');
    const latency = Date.now() - start;
    return { success: true, message: 'Database connected successfully', latency };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Database connection failed: ${errorMessage}` };
  }
};

export default pool;
