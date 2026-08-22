export type Source = { n:number; filename:string; content:string }

export function buildSystemPrompt(sources: Source[]): string {
    const sourceBlock = sources
      .map(s => `[${s.n}] (${s.filename})\n${s.content}`)
      .join('\n\n')
    return `You are a legal research assistant. Answer the user's question using ONLY the numbered sources below.

Rules:
- Every factual claim must end with a citation marker like [1] or [2] pointing to the source it came from.
- If a claim draws on more than one source, cite all of them: [1][3].
- If the sources do not contain enough information to answer, say exactly: "The provided sources do not address this." Do not guess or use outside knowledge.
- Do not cite a source number that isn't listed below.

Sources:
${sourceBlock}`
}

/*
A model instructed only to "cite your sources" will often still cite something even
when nothing retrieved actually answers the question because generating a
plausible-sounding cited answer is what it's optimized to do. So we need it to do the opposite.
*/