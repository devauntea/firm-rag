const OLLAMA  = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const CHAT_MODEL = process.env.CHAT_MODEL ?? 'qwen2.5:7b'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ChatResult = {
    content: string
    evalCount: number
    evalDurationNs: number
    promptEvalCount: number
    promptEvalDurationNs: number
    tokenCount: number
}

export async function chat(messages: ChatMessage[]): Promise<ChatResult> {
    const res = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ model: CHAT_MODEL, messages, stream: false}),
    })
    if (!res.ok) throw new Error(`chat failed: ${res.status} ${await res.text()}`)

    const data = await res.json()
    return {
        content: data.message.content,
        evalCount: data.eval_count,
        evalDurationNs: data.eval_duration,
        promptEvalCount: data.prompt_eval_count,
        promptEvalDurationNs: data.prompt_eval_duration,
        loadDurationNs: data.load_duration,
    }
}

export function tokensPerSecond(evalCount: number, evalDurationNs: number): number {
    return evalCount / (evalDurationNs / 1e9)
}