import { answerQuestion } from '@/lib/rag'
import { RateLimitError } from '@/lib/llm'
import { NextRequest, NextResponse } from 'next/server'

// Up to two tool rounds means up to three model calls; give them room on Vercel.
export const maxDuration = 60

const MAX_QUESTION_CHARS = 1000

export async function POST( req: NextRequest) {
    const body = await req.json()
    const question = body.question as string | undefined
    const userEmail = body.userEmail as string | undefined
    const matterCode = (body.matterCode as string | undefined) ?? null

    if (!question) {
        return NextResponse.json({ error: 'question is required'}, { status: 400 })
    }
    if (question.length > MAX_QUESTION_CHARS) {
        return NextResponse.json({ error: `question must be under ${MAX_QUESTION_CHARS} characters`}, { status: 400 })
    }
    if (!userEmail) {
        return NextResponse.json({ error: 'userEmail is required'}, { status: 400})
    }

    try {
        const result = await answerQuestion(question, userEmail, matterCode)
        return NextResponse.json(result)
    } catch (err) {
        // The public demo runs on free-tier model quotas. Hitting one is not an
        // outage, so say so plainly rather than returning a generic 503.
        if (err instanceof RateLimitError) {
            console.error('model rate limited:', err.message)
            return NextResponse.json(
                { error: 'The demo is getting a lot of questions right now. Try again in a minute.' },
                { status: 429 },
            )
        }
        // If the db or model is unreachable, answerQuestion throws (e.g. getaddrinfo
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
