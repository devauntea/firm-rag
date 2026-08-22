import 'dotenv/config'
import { pool, query } from '../src/lib/db'
import { embed, toVector } from '../src/lib/embed'

async function main() {
    const q = await embed(
        'what did the court say about staying proceedings during an arbitration appeal?',
        'search_query'
    )
    const vec = toVector(q)

    const rows  = await query<Record<string, string>>(
        `EXPLAIN ANALYZE
        SELECT id, content, embedding <=> $1::vector AS distance
        FROM chunks
        ORDER BY distance
        LIMIT 5`,
        [vec],
    )

    for (const row of rows) console.log(Object.values(row)[0])
    await pool.end()
}
main()

/* Seq Scan on chunks  (cost=0.00..106.44 rows=595 width=1198) (actual time=0.087..3.834 rows=595 loops=1)
Execution Time: 4.206 ms*/