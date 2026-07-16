export async function generateToken(): Promise<{ raw: string; hash: string }> {
  const prefix = 'umm_pat_'
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const raw = prefix + Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')

  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hashHex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return { raw, hash: hashHex }
}