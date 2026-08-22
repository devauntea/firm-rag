import type { Source } from './prompt'

export function verifyCitations(answer: string, sources: Source[]) {
    const cited = new Set(
        [...answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]))
    )
    const valid = new Set(sources.map(s => s.n))

    const invalid = [...cited].filter(n => !valid.has(n))
    const unused = [...valid].filter(n => !cited.has(n))

    return { citedCount: cited.size, invalid, unused }
}