// Two backends behind one chat() function:
//   LLM_PROVIDER=ollama (default)  local Ollama, the original Day 3 setup
//   LLM_PROVIDER=groq              Groq's hosted, OpenAI-compatible API, used by the public demo
// rag.ts never knows which one answered.
const PROVIDER = process.env.LLM_PROVIDER ?? 'ollama'
const OLLAMA = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const GROQ = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1'
// CHAT_MODEL may be a comma-separated list. On Groq each model has its own
// free-tier tokens-per-minute budget, so a 429 on one falls through to the next.
const CHAT_MODELS = (
    process.env.CHAT_MODEL ?? (PROVIDER === 'groq' ? 'qwen/qwen3.8-27b,openai/gpt-oss-120b' : 'qwen2.5:7b')
)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
// Longest we'll hold a request open waiting out a rate limit before giving up.
const MAX_RATE_LIMIT_WAIT_MS = 20_000

export type ChatMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string
    tool_calls?: ToolCall[]
    tool_call_id?: string
}

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

// Thrown when the hosted provider rate-limits us, so the API route can tell
// the caller "try again shortly" instead of a generic failure.
export class RateLimitError extends Error {
    constructor(message: string, readonly retryAfterMs: number | null = null) {
        super(message)
    }
}

export async function chat(messages: ChatMessage[], tools?: unknown[]): Promise<ChatResult> {
    if (PROVIDER !== 'groq') return chatOllama(messages, tools)

    // Try each model once; if every one is rate limited, wait out the shortest
    // suggested delay (if it's short enough) and try the list one more time.
    let shortestWait: number | null = null
    for (let pass = 0; pass < 2; pass++) {
        for (const model of CHAT_MODELS) {
            try {
                return await chatGroq(model, messages, tools)
            } catch (err) {
                if (!(err instanceof RateLimitError)) throw err
                const wait = err.retryAfterMs ?? MAX_RATE_LIMIT_WAIT_MS
                shortestWait = shortestWait === null ? wait : Math.min(shortestWait, wait)
            }
        }
        if (pass === 0 && shortestWait !== null && shortestWait <= MAX_RATE_LIMIT_WAIT_MS) {
            await new Promise((r) => setTimeout(r, shortestWait! + 250))
        } else break
    }
    throw new RateLimitError('all chat models rate limited', shortestWait)
}

async function chatOllama(messages: ChatMessage[], tools?: unknown[]): Promise<ChatResult> {
    const res = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ model: CHAT_MODELS[0], messages, tools, stream: false}),
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

// OpenAI wire format differs from Ollama's in two ways that matter here:
// tool-call arguments travel as a JSON string, and every tool result must
// name the tool_call_id it answers.
async function chatGroq(model: string, messages: ChatMessage[], tools?: unknown[]): Promise<ChatResult> {
    const key = process.env.GROQ_API_KEY
    if (!key) throw new Error('GROQ_API_KEY is not set')

    const wire = messages.map((m) => ({
        role: m.role,
        content: m.content ?? '',
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls?.length
            ? {
                  tool_calls: m.tool_calls.map((c) => ({
                      id: c.id,
                      type: 'function',
                      function: { name: c.function.name, arguments: JSON.stringify(c.function.arguments) },
                  })),
              }
            : {}),
    }))

    const started = Date.now()
    const res = await fetch(`${GROQ}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: wire, tools, temperature: 0 }),
    })
    if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'))
        throw new RateLimitError(await res.text(), Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null)
    }
    if (!res.ok) throw new Error(`chat failed: ${res.status} ${await res.text()}`)

    const data = await res.json()
    const msg = data.choices[0].message
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map(
        (c: { id: string; function: { name: string; arguments: string } }) => ({
            id: c.id,
            function: { name: c.function.name, arguments: safeParse(c.function.arguments) },
        }),
    )
    return {
        content: msg.content ?? '',
        toolCalls,
        evalCount: data.usage?.completion_tokens ?? 0,
        evalDurationNs: (Date.now() - started) * 1e6,
        promptEvalCount: data.usage?.prompt_tokens ?? 0,
        promptEvalDurationNs: 0,
        loadDurationNs: 0,
    }
}

// Tool arguments are model output, i.e. untrusted input. Malformed JSON
// becomes an empty object, which executeSearchTool treats as "no query".
function safeParse(s: string): Record<string, unknown> {
    try {
        const v = JSON.parse(s)
        return v && typeof v === 'object' ? v : {}
    } catch {
        return {}
    }
}

export function tokensPerSecond(evalCount: number, evalDurationNs: number): number {
    return evalCount / (evalDurationNs / 1e9)
}
