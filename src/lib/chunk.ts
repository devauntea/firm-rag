const SEPARATORS = ['\n\n', '\n', '. ', ' ']

export type Chunk = { content: string; ordinal: number }

function stripNoise(text: string): string {
    return text
      .split('\n')
      .filter(line =>{
        const t = line.trim()
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*(AM|PM)$/i.test(t)) return false
        if (/^Page \d+ of \d+/i.test(t)) return false
        return true
      })
      .join('\n')
}

function mergePieces(pieces: string[], sep: string, size: number, overlap: number): string[] {
    const chunks: string[] = []
    let current:string[] = []
    let currentLen = 0

    for (const piece of pieces){
        const addedLen = piece.length + (current.length ? sep.length : 0)
        if( currentLen + addedLen > size && current.length > 0){
            chunks.push(current.join(sep))
            while (currentLen > overlap && current.length > 1){
                currentLen -= current[0].length + sep.length
                current.shift()
            }
        }
        current.push(piece)
        currentLen += addedLen
    }
    if (current.length) chunks.push(current.join(sep))
    return chunks
}
/*mergePieces greedily packs consecutive pieces back together,
joined by the same separator they were split on,
until adding the next one would exceed your target size
at which point it closes out the current chunk and starts a new one*/


function recursiveSplit(text: string, seps: string[], size: number, overlap: number): string[] {
    if (text.length <= size) return [text]

    const [sep, ...rest] = seps
    const pieces = text.split(sep)
    const merged = mergePieces(pieces, sep, size, overlap)

    const result: string[] = []
    for (const m of merged){
        if (m.length > size && rest.length > 0) {
            result.push(...recursiveSplit(m, rest, size, overlap))
        } else {
            result.push(m)
        }
    }
    return result
}

export function chunkText(
    text: string,
    opts: {chunkSize?: number; overlap?: number } = {}
): Chunk[] {
    const chunkSize = opts.chunkSize ?? 1200
    const overlap = opts.overlap ?? 150

    const clean = stripNoise(text)
    const pieces = recursiveSplit(clean, SEPARATORS, chunkSize, overlap)
      .map(p => p.trim())
      .filter(p => p.length > 0)

    return pieces.map((content, ordinal) => ({ content, ordinal }))
}

// A rough approximation, not a real tokenizer for either qwen2.5
export function estimateTokens(text:string): number {
    return Math.ceil(text.length / 4)
}