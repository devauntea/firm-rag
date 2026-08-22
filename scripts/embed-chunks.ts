import 'dotenv/config'
import { pool, query } from '../src/lib/db'
import { embed, toVector } from '../src/lib/embed'
import { chunkText, estimateTokens } from '../src/lib/chunk'

async function main() {
  const docs = await query<{ id:number; matter_id:number; filename:string; raw_text:string }>(
    `SELECT id, matter_id, filename, raw_text
    FROM documents
    WHERE extraction_status = 'ok'
    ORDER BY filename`,
  )
  for (const doc of docs){
    const chunks = chunkText(doc.raw_text)
    console.log(`${doc.filename} -> ${chunks.length} chunks`)

    for (const c of chunks){
        const vec = await embed(c.content, 'search_document')
        await query(`INSERT INTO chunks (document_id, matter_id, ordinal, content, token_count, embedding)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (document_id, ordinal) DO UPDATE SET
                content = EXCLUDED.content,
                token_count = EXCLUDED.token_count,
                embedding = EXCLUDED.embedding`,
            [doc.id, doc.matter_id, c.ordinal, c.content, estimateTokens(c.content), toVector(vec)],
            )
        }
    }

  await pool.end()
}
main()