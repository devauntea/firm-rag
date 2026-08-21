import 'dotenv/config'
import { pool, query } from '../src/lib/db'
import { embed, toVector } from '../src/lib/embed'

const SAMPLES = [
    'The district court must stay its proceedings pending appeal of an order denying a motion to compel arbitration.',
    'Two contracts conflict over whether an arbitrator or a California court decides arbitrability.',
    'Each party shall hold the Confidential Information of the other party in strict confidence.',
    'The Clean Air Act requires EPA to evaluate state implementation plans.',
]

async function main(){
    await query('CREATE TABLE IF NOT EXISTS smoke (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, content text, embedding vector(768))')
    await query('TRUNCATE smoke RESTART IDENTITY')

    for (const s of SAMPLES){
        const v = await embed(s, 'search_document')
        await query('INSERT INTO smoke (content, embedding) VALUES ($1, $2)', [s, toVector(v)])
    }
    const q = await embed('what did the court say about staying proceedings during an arbitration appeal?', 'search_query')
    //question gets embedded
    
    const rows = await query<{ content: string; distance: number }>(
        `SELECT content, embedding <=> $1::vector AS distance
        FROM smoke
        ORDER BY distance
        LIMIT 4`,
        [toVector(q)]
    )//embeddings get compared with cosine similarity and sorted by distance producing the closest matches

    for (const r of rows){
        console.log(r.distance.toFixed(4), '', r.content.slice(0, 70))
    }
    await pool.end()
}
//DROP TABLE smoke;. Keeping test scaffolding separate from real data is a habit that pays off constantly.
//$ psql "postgres://firmrag:firmrag_dev@localhost:5433/firmrag" -c "DROP TABLE smoke;"

DROP TABLE
main()