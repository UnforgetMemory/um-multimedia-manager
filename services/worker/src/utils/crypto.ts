const TOKEN_PREFIX = 'umm_pat_';

export async function generateToken(): Promise<{ raw: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = TOKEN_PREFIX + Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('');
  return { raw, hash: await hashToken(raw) };
}

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isValidTokenFormat(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX) && token.length > TOKEN_PREFIX.length;
}
