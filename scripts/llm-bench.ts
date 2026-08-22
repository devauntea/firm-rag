import 'dotenv/config'
import { chat, tokensPerSecond } from '../src/lib/llm'

async function run(label: string) {
    const t0 = Date.now()
    const result = await chat([
        { role: 'system', content: 'Answer in 2-3 sentences.' },
        { role: 'user', content: 'What is the difference between a motion to dismiss and a motion for summary judgment?' },
    ])
    const wallMs = Date.now() - t0

    console.log(`\n--- ${label} ---`)
    console.log(result.content)
    console.log(`wall clock: ${wallMs}ms`)
    console.log(`load: ${(result.loadDurationNs / 1e6).toFixed(0)}ms`)
    console.log(`prompt eval: ${result.promptEvalCount} tokens in ${(result.promptEvalDurationNs / 1e6).toFixed(0)}ms`)
    console.log(`generation: ${result.evalCount} tokens in ${(result.evalDurationNs / 1e6).toFixed(0)}ms`)
    console.log(`throughput: ${tokensPerSecond(result.evalCount, result.evalDurationNs).toFixed(1)} tok/s`)
}

async function main() {
    await run('run 1 (cold - includes model load)')
    await run('run 2 (warm - model already in memory)')
}
/*
If you only ever measure a single cold request, you'll report a throughput number
that's actually dominatedby disk I/O and memory allocation, not the model's real generation speed.
you'll draw wrong conclusions from it ("this model is too slow to use," when actually only the *first* request was slow)
Measuring both, and knowing which number is which, is a how you get a real benchmark.
*/
main()