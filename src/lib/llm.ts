const OLLAMA  = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const CHAT_MODEL = process.env.CHAT_MODEL ?? 'qwen2.5:7b'

export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: ToolCall[]}

export type ChatResult = {
    content: string
    toolCalls: ToolCall[]
    evalCount: number
    evalDurationNs: number
    promptEvalCount: number
    promptEvalDurationNs: number
    loadDurationNs: number
}

export type ToolCall = {
    id: string
    function: { name: string, arguments: Record<string, unknown>}
}

export async function chat(messages: ChatMessage[], tools?: unknown[]): Promise<ChatResult> {
    const res = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ model: CHAT_MODEL, messages, tools, stream: false}),
    })
    if (!res.ok) throw new Error(`chat failed: ${res.status} ${await res.text()}`)

    const data = await res.json()
    return {
        toolCalls: data.message.tool_calls ?? [],
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