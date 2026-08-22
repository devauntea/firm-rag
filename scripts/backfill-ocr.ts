import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { pool, query } from '../src/lib/db'

async function main() {
    const text = (await readFile('.ocr-scratch/full.txt', 'utf-8')).trim()
    await query(
        `UPDATE documents
        SET raw_text = $1,
            char_count = $2,
            extraction_status = 'ok',
            extraction_note = 'recovered via Tesseract OCR at 300dpi'
        WHERE filename = 'matterB_03_aluminum-co-v-employment-appeal-board-SCANNED.pdf'`,   
        [text, text.length],
    )
    console.log('updated, chars:', text.length)
    await pool.end()
}
main()