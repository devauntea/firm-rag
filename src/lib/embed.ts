// Two backends behind one embed() function:
//   EMBED_PROVIDER=ollama (default)  local nomic-embed-text, the original setup
//   EMBED_PROVIDER=gemini            Google's hosted gemini-embedding-001, used by the public demo
// Both produce 768-dim vectors, so the vector(768) column never changes.
// Vectors from different models are NOT comparable: switching providers
// means re-running embed-chunks so documents and queries share one space.
const PROVIDER = process.env.EMBED_PROVIDER ?? 'ollama'
const OLLAMA = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env.EMBED_MODEL ?? 'nomic-embed-text'
const GEMINI_MODEL = process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001'
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
const DIM = 768

export type EmbedTask = 'search_document' | 'search_query'

export async function embed(text: string, task: EmbedTask): Promise<number[]> {
    const [vec] = await embedMany([text], task)
    return vec
}

export async function embedMany(texts: string[], task: EmbedTask): Promise<number[][]> {
    const vecs = PROVIDER === 'gemini' ? await embedGemini(texts, task) : await embedOllama(texts, task)
    for (const v of vecs) {
        if (!Array.isArray(v)) throw new Error('no embeddings in response')
        if (v.length !== DIM) throw new Error(`expected ${DIM} dims, got ${v.length}`)
    }
    return vecs
}

async function embedOllama(texts: string[], task: EmbedTask): Promise<number[][]> {
    const res = await fetch(`${OLLAMA}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, input: texts.map((t) => `${task}: ${t}`) }),
    })
    if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`)
    const data = await res.json()
    return data.embeddings
}

async function embedGemini(texts: string[], task: EmbedTask): Promise<number[][]> {
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('GEMINI_API_KEY is not set')
    const taskType = task === 'search_query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT'

    const res = await fetch(`${GEMINI}/${GEMINI_MODEL}:batchEmbedContents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
            requests: texts.map((text) => ({
                model: `models/${GEMINI_MODEL}`,
                content: { parts: [{ text }] },
                taskType,
                outputDimensionality: DIM,
            })),
        }),
    })
    if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`)
    const data = await res.json()
    return data.embeddings.map((e: { values: number[] }) => e.values)
}

export const toVector = (v: number[]) => `[${v.join(',')}]`

/*
Both models are trained for asymmetric retrieval: a stored passage and the
question that should retrieve it are embedded differently. nomic-embed-text
takes that as a text prefix (search_document / search_query); Gemini takes
it as a taskType field. Skipping it still works, but retrieval quality drops.
Cosine distance (<=>) ignores vector length, so Gemini's truncated 768-dim
vectors don't need renormalizing for ranking.
*/
