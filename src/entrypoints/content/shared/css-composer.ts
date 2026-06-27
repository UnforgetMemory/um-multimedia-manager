/** A named CSS chunk for composition. */
export interface CssChunk {
  name: string
  css: string
}

/**
 * Concatenate named CSS chunks into a single string with labelled section headers.
 * Each chunk is wrapped with a /* === name === *\/ header for readability in devtools.
 */
export function composeStyles(...chunks: CssChunk[]): string {
  return chunks.map(c => `/* === ${c.name} === */\n${c.css}\n`).join('\n')
}
