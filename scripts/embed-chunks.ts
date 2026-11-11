import 'dotenv/config'
import { pool, query } from '../src/lib/db'
import { embedMany, toVector } from '../src/lib/embed'
import { chunkText, estimateTokens } from '../src/lib/chunk'

// Embed in batches: one HTTP call per batch instead of per chunk, which is
// what keeps a hosted provider's free-tier request limit out of the way.
const BATCH = 50

async function embedWithRetry(texts: string[]): Promise<number[][]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await embedMany(texts, 'search_document')
    } catch (err) {
      if (attempt >= 5 || !String(err).includes('429')) throw err
      const waitMs = 15_000 * (attempt + 1)
      console.log(`  rate limited, waiting ${waitMs / 1000}s`)
      await new Promise((r) => setTimeout(r, waitMs))
    }
  }
}

async function main() {
  const docs = await query<{ id:number; matter_id:number; filename:string; raw_text:string }>(
    `SELECT id, matter_id, filename, raw_text
    FROM documents
    WHERE extraction_status = 'ok'
    ORDER BY filename`,
  )
  let total = 0
  for (const doc of docs){
    const chunks = chunkText(doc.raw_text)
    console.log(`${doc.filename} -> ${chunks.length} chunks`)
    total += chunks.length

    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH)
      const vecs = await embedWithRetry(batch.map((c) => c.content))
      for (const [j, c] of batch.entries()) {
        await query(`INSERT INTO chunks (document_id, matter_id, ordinal, content, token_count, embedding)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (document_id, ordinal) DO UPDATE SET
                content = EXCLUDED.content,
                token_count = EXCLUDED.token_count,
                embedding = EXCLUDED.embedding`,
            [doc.id, doc.matter_id, c.ordinal, c.content, estimateTokens(c.content), toVector(vecs[j])],
            )
      }
    }
  }
  console.log(`total chunks: ${total}`)

  await pool.end()
}
main()
