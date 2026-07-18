/** Cloudflare Email Service REST API wrapper for the web panel (Cloudflare Pages). */
export interface SendEmailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

interface CfEmailResponse {
  success: boolean
  errors?: { message: string }[]
}

let _accountId: string | null = null
let _apiToken: string | null = null

function getConfig() {
  if (!_accountId) {
    _accountId = process.env.CF_ACCOUNT_ID || process.env.NUXT_CF_ACCOUNT_ID || null
  }
  if (!_apiToken) {
    _apiToken = process.env.CF_API_TOKEN || process.env.NUXT_CF_API_TOKEN || null
  }
  return { accountId: _accountId, apiToken: _apiToken }
}

/** Send a transactional email via Cloudflare Email Sending REST API. */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const { accountId, apiToken } = getConfig()

  if (!accountId || !apiToken) {
    return { success: false, error: 'Email service not configured (CF_ACCOUNT_ID / CF_API_TOKEN)' }
  }

  const fromDomain = options.to.split('@')[1] || 'umm.pages.dev'

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: { address: `noreply@${fromDomain}`, name: 'UMM' },
          to: [{ address: options.to }],
          subject: options.subject,
          text: options.text,
          html: options.html || options.text.replace(/\n/g, '<br>'),
        }),
      },
    )

    const result: CfEmailResponse = await response.json()

    if (!result.success) {
      const msg = result.errors?.[0]?.message || 'Unknown email error'
      return { success: false, error: msg }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to send email' }
  }
}

export function generateVerificationToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function buildVerificationUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/api/auth/verify-email?token=${token}`
}