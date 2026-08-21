const OLLAMA = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.EMBED_MODEL ?? 'nomic-embed-text'

export type EmbedTask = 'search_document' | 'search_query'

export async function embed(text: string, task: EmbedTask): Promise<number[]> {
    const res = await fetch(`${OLLAMA}/api/embed`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: MODEL,
            input: `${task}: ${text}`,
        }),
    })
    if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`)

    const data = await res.json()
    const vec: number[] = data.embeddings?.[0] ?? data.embedding
    if (!Array.isArray(vec)) throw new Error('no embeddings in response')
    if (vec.length !== 768) throw new Error(`expected 768 dims, got ${vec.length}`)
    return vec
}

export const toVector = (v: number[]) => `[${v.join(',')}]`

/*
nomic-embed-text was trained so that a stored passage and the question that should retrieve it are embedded asymmetrically
(documents get search_document, queries get search_query). Skipping the prefixes still works, but retrieval quality drops.
*/