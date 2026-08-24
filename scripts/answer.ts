import 'dotenv/config'
import { pool } from '../src/lib/db'
import { answerQuestion } from '../src/lib/rag'

async function main() {
    const question = process.argv[2] //Input handling lines 9-14
    const matterCode = process.argv[3] ?? null
    if (!question){
        console.error('usage: tsx scripts/answer.ts "your question" [matterCode]' )
        process.exit(1)
    }


    const { answer, sources, citationCheck } = await answerQuestion(question, matterCode)

    console.log('\n=== Answer ===')
    console.log(answer)

    console.log('\n=== Sources ===')
    for (const s of sources) console.log(`[${s.n}]: ${s.filename}`)

    console.log(`\n=== CITATION CHECK ===`)
    console.log(`cited ${citationCheck.citedCount} distinct source(s)`)
    if (citationCheck.invalid.length) console.log(`⚠ cited source(s) that don't exist: ${citationCheck.invalid.join(', ')}`)
    if (citationCheck.unused.length) console.log(`  retrieved but not cited: ${citationCheck.unused.join(', ')}`)

    await pool.end()
}
main()