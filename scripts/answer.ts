import 'dotenv/config'
import { pool, query } from '../src/lib/db'
import { embed, toVector } from '../src/lib/embed'
import { chat } from '../src/lib/llm'
import { buildSystemPrompt, type Source } from '../src/lib/prompt'
import { verifyCitations } from '../src/lib/verify-citations'

async function main() {
    const question = process.argv[2]
    const matterCode = process.argv[3] ?? null
    if (!question){
        console.error('usage: tsx scripts/answer.ts "your question" [matterCode]' )
        process.exit(1)
    }

    const q = await embed(question, 'search_query')
    const vec = toVector(q)

    const rows = await query<{ filename: string; content: string }>(
        `SELECT d.filename, c.content
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        JOIN matters m ON m.id = c.matter_id
        WHERE ($2::text IS NULL OR m.code = $2)
        ORDER BY c.embedding <=> $1::vector
        LIMIT 6`,
        [vec, matterCode],
    )

    const sources: Source[] = rows.map((r, i) => ({ n: i + 1, filename: r.filename, content: r.content }))
    const result = await chat([
        { role: 'system', content: buildSystemPrompt(sources) },
        { role: 'user', content: question },
    ])
    console.log('\n=== Answer ===')
    console.log(result.content)

    console.log('\n=== Sources ===')
    for (const s of sources) console.log(`[${s.n}]: ${s.filename}`)

    const v = verifyCitations(result.content, sources)
    console.log(`\n=== CITATION CHECK ===`)
    console.log(`cited ${v.citedCount} distinct source(s)`)
    if (v.invalid.length) console.log(`⚠ cited source(s) that don't exist: ${v.invalid.join(', ')}`)
    if (v.unused.length) console.log(`  retrieved but not cited: ${v.unused.join(', ')}`)

    await pool.end()
}
//same retrieval mechanism as query.ts but
//the results become numbered Source objects fed into a prompt
main()