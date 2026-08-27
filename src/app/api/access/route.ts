import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Demo explainer endpoint. It reports the access matrix so testers can see
// which documents each account can reach and understand why an answer came
// back empty.
//
// A production system would NOT expose this. Revealing that a walled matter
// exists at all is itself a disclosure in an ethical-wall scenario, which is
// exactly why the answer API returns an empty result rather than a 403. This
// route exists to explain the demo, not to model real behavior.
export async function GET() {
    try {
        const users = await query<{ email: string; display_name: string; role: string }>(
            `SELECT email, display_name, role FROM users ORDER BY id`,
        )

        const matters = await query<{ code: string; name: string; practice: string }>(
            `SELECT code, name, practice FROM matters ORDER BY code`,
        )

        const documents = await query<{ matter_code: string; filename: string }>(
            `SELECT m.code AS matter_code, d.filename
             FROM documents d
             JOIN matters m ON m.id = d.matter_id
             ORDER BY d.filename`,
        )

        const access = await query<{ email: string; matter_code: string }>(
            `SELECT u.email, m.code AS matter_code
             FROM matter_access ma
             JOIN users u ON u.id = ma.user_id
             JOIN matters m ON m.id = ma.matter_id
             ORDER BY u.email, m.code`,
        )

        return NextResponse.json({ users, matters, documents, access })
    } catch (err) {
        console.error('access matrix lookup failed:', err)
        return NextResponse.json(
            { error: 'could not load access information' },
            { status: 503 },
        )
    }
}
