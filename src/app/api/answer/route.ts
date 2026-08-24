import { answerQuestion } from '@/lib/rag'
import { NextRequest, NextResponse } from 'next/server'

export async function POST( req: NextRequest) {
    const body = await req.json()
    const question = body.question as string | undefined
    const matterCode = (body.matterCode as string | undefined) ?? null

    if (!question) {
        return NextResponse.json({ error: 'question is required'}, { status: 400 })
    }

    try {
        const result = await answerQuestion(question, matterCode)
        return NextResponse.json(result)
    } catch (err) {
        // If db or Ollama is unreachable, answerQuestion throws (e.g. getaddrinfo
        // ENOTFOUND db when the database container is stopped). Production Next.js
        // suppresses the real error from the client for security, so without this
        // catch the caller gets an empty-body 500 with zero information. Log the
        // real error server-side, return a specific, honest status to the caller.
        console.error('answerQuestion failed:', err)
        return NextResponse.json(
            { error: 'search is temporarily unavailable' },
            { status: 503 },
        )
    }
}