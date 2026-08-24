import { pool, query } from './db'
import { embed, toVector } from './embed'
import { chat } from './llm'
import { buildSystemPrompt, type Source } from './prompt'
import { verifyCitations } from './verify-citations'

export async function answerQuestion(question: string, matterCode: string | null = null) {
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
        { role: 'system', content: buildSystemPrompt(sources)},
        { role: 'user', content: question },
    ])

    const citationCheck = verifyCitations(result.content, sources)
    
    return { answer: result.content, sources, citationCheck }
}

/*
answerQuestion() is the shared retrieval and generation logic behind
the RAG pipeline: it embeds the question, retrieves the closest
matching chunks (optionally scoped to one matter), builds a citation
enforcing prompt from those chunks, gets an answer from the model, and
checks that every citation it produced points at a real source. Both
the CLI script and the API route call this same function, so there is
one place this logic can be wrong instead of two.
*/