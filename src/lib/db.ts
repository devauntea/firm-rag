import {Pool} from 'pg';

export const pool  = new Pool({
    connectionString: process.env.DATABASE_URL,
})

export async function query<T = unknown>(
    text: string,
    params?: unknown[],
): Promise<T[]> {
    const res = await pool.query(text, params)
    return res.rows as T[]
}

/* Client vs Pool:
A Client is one connection you open and close.
A Pool keeps a set of connections and hands them out.

(Postgres connections are expensive, so we use a pool
to avoid opening and closing connections repeatedly.)
*/