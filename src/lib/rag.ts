import { pool, query } from './db'
import { embed, toVector } from './embed'
import { chat, type ChatMessage } from './llm'
import { buildSystemPrompt, type Source } from './prompt'
import { verifyCitations } from './verify-citations'

const VALID_MATTER = new Set(['A', 'B', 'C', 'D'])

async function executeSearchTool(args: Record<string, unknown>, userEmail: string): Promise<Source[]> {
    const searchQuery = typeof args.query === 'string' ? args.query : null
    if (!searchQuery) return []

    const rawMatter = typeof args.matterCode === 'string' ? args.matterCode : null
    const matterCode = rawMatter && VALID_MATTER.has(rawMatter) ? rawMatter : null

    console.log(JSON.stringify({
        event: 'tool_search',
        userEmail,
        requestedMatter: rawMatter,
        acceptedMatter: matterCode,
        query: searchQuery,
    }))

    const vec = toVector(await embed(searchQuery, 'search_query'))

    const rows = await query<{ filename: string; content: string }>(
        `SELECT d.filename, c.content
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        JOIN matters m ON m.id = c.matter_id
        JOIN matter_access ma on ma.matter_id = m.id
        JOIN users u on u.id = ma.user_id
        WHERE u.email = $2
            AND ($3::text IS NULL OR m.code = $3)
        ORDER BY c.embedding <=> $1::vector
        LIMIT 6`,
        [vec, userEmail, matterCode],
    ) //If u.email doesn't match a user with a matter_access row for that chunk's matter, the join simply produces no row for that chunk at all
    return rows.map((r, i) => ({n: i + 1, filename: r.filename, content: r.content }))
}

const SEARCH_TOOL = {
    type: 'function',
    function: {
        name: 'search_documents',
        description: 'Search the firm document corpus for chunks matching a query, optionally scoped to one matter (A, B, C, or D).',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'search query text' },
                matterCode: { type: 'string', description: 'optional matter code: A, B, C, or D'},
            },
            required: ['query']
        },
    },
}
    
    const MAX_TOOL_ROUNDS = 2

export async function answerQuestion(question: string, userEmail: string, matterCode: string | null = null) {
    const initialSources = await executeSearchTool({ query: question, matterCode: matterCode ?? undefined}, userEmail)

    const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(initialSources) },
        { role: 'user', content: question },
    ]
    
    let sources = initialSources
    let result = await chat(messages, [SEARCH_TOOL])

    for (let round = 0; round < MAX_TOOL_ROUNDS && result.toolCalls.length > 0; round++) {
        const call = result.toolCalls[0]
        const toolSources = await executeSearchTool(call.function.arguments, userEmail)
        
        messages.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls })
        messages.push({ role: 'tool', content: JSON.stringify(toolSources) })
        sources = toolSources.length > 0 ? toolSources : sources

        result = await chat(messages, [SEARCH_TOOL])
    }
    
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