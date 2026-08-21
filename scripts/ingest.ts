import 'dotenv/config'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { extractText, getDocumentProxy } from 'unpdf'
import { pool, query } from '../src/lib/db'


const FILENAME_RE = /^matter([A-D])_(\d{2})_(.+)\.pdf$/

type Parsed = { matterCode: string; seq: number; title: string }

function parseFilename(filename: string): Parsed | null {
    const m = FILENAME_RE.exec(filename)
    if (!m) return null
    return {
        matterCode: m[1],
        seq: Number(m[2]),
        title: m[3].replace(/-/g,' '),
    }
}

/*file that doesn't match the convention something I want reported.
Ingest script should process the good files and tell clearly that
ones that are skipped and why.
*/

const CORPUS = process.env.CORPUS_DIR!

async function extract(path: string){
    const buf = new Uint8Array(await readFile(path))
    const pdf = await getDocumentProxy(buf)
    const { totalPages, text } = await extractText(pdf, { mergePages: true})
    return { pages: totalPages, text: text as string }
}

async function main(){
    const files = (await readdir(CORPUS))
        .filter(f => f.endsWith('.pdf'))
        .sort()
    for (const filename of files){
        const parsed = parseFilename(filename)
        if (!parsed) {
            console.warn(`SKIP ${filename} - does not match naming convention`)
            continue
        }

        const [matter] = await query<{id: number}>(
            'SELECT id FROM matters WHERE code = $1',
            [parsed.matterCode]
        )
        if (!matter) {
            console.warn(`SKIP ${filename} - no matter ${parsed.matterCode}`)
            continue
        }

        let pages: number | null = null
        let text = ''
        let status: 'ok' | 'empty' | 'error' = 'ok'
        let note: string | null = null

        try{
            const out = await extract(join(CORPUS, filename))
            pages = out.pages
            text = (out.text || '').trim()
            if (text.length === 0) {
                status = 'empty'
                note = 'no text layer - scanned document, needs OCR'
            }
        }catch(err){
            status = 'error'
            note = err instanceof Error ? err.message : String(err)
        }

        await query(
            `INSERT INTO documents
            (matter_id, filename, title, seq, page_count, char_count, raw_text, extraction_status, extraction_note)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (filename) DO UPDATE SET
            page_count = EXCLUDED.page_count,
            char_count = EXCLUDED.char_count,
            raw_text = EXCLUDED.raw_text,
            extraction_status = EXCLUDED.extraction_status,
            extraction_note = EXCLUDED.extraction_note`,
            [matter.id, filename, parsed.title, parsed.seq, pages, text.length, text || null, status, note]  
        )
        console.log(
            `${status.toUpperCase().padEnd(5)} ${filename} ` +
            `${pages ?? '?'}pp ${text.length} chars`,
        )
    }
    await pool.end()
}

main()
