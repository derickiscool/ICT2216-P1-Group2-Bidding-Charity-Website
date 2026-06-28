import { Pool } from 'pg';
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

export const query = async (text: string, params?: unknown[]) => {
  const res = await pool.query(text, params);
  return res;
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
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
