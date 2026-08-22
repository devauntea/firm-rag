import 'dotenv/config'
import { pool, query } from '../src/lib/db'
import { embed, toVector } from '../src/lib/embed'

async function main() {
    const question = process.argv[2]
    const matterCode = process.argv[3] ?? null
    if (!question) {
        console.error('usage: tsx scripts/query.ts  "your question" [matter_code]')
        process.exit(1)
    }

    const q = await embed(question, 'search_query')
    const vec = toVector(q)

    const rows = await query<{ filename: string; distance: number; content: string }>(
        `SELECT d.filename, c.embedding <=> $1::vector AS distance, c.content
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        JOIN matters m ON m.id = c.matter_id
        WHERE ($2::text IS NULL OR m.code = $2)
        ORDER BY distance
        LIMIT 6`,
        [vec, matterCode],
    )
    for (const r of rows){
        console.log(r.distance.toFixed(4), r.filename)
        console.log('   ', r.content.slice(0, 140).replace(/\s+/g, ' '))
    }
    await pool.end()
}
main()