/**
 * Cloudflare Turnstile on the contact form (owner, 11 Nov 2026, after the Cloudflare audit).
 *
 * ⚠️ THIS REVERSES PART OF 10 NOV, KNOWINGLY. `inquirySpam.ts` records that the owner chose checks of
 * our own over Turnstile so the privacy notice could say a visit contacts nobody. Asked again on
 * 11 Nov with that decision and its numbers in front of him (69 of 69 spam caught, 0 of 4 buyers),
 * the owner chose to add it. The promise is kept as far as it can be: Turnstile loads only once a
 * visitor starts filling in the form (`TurnstileOnInteract.tsx`), so a plain visit to any page,
 * /contact included, still contacts nobody, and `e2e/consent.spec.ts` still holds that.
 *
 * ⚠️ A CATCH IS QUARANTINED, NEVER DROPPED, AS WITH `inquirySpam.ts`. A failed or missing token marks
 * the inquiry "spam": stored, not emailed, visible in the admin. A missing token is also what a buyer
 * with scripting off sends, which is why it must never be refused outright.
 *
 * ⚠️ AN OUTAGE IS NEVER THE BUYER'S FAULT. No secret set, a network error, a 5xx or a slow answer
 * all read "unchecked", and the inquiry goes on exactly as before Turnstile existed.
 */

/** The widget made 11 Nov 2026 (invisible, domain wear-run.com). Public by design: it is in the page. */
export const TURNSTILE_SITEKEY = '0x4AAAAAAF8kW9pIU3Z62udl'

/** Explicit rendering, so nothing runs until `TurnstileOnInteract` asks (Cloudflare: load from this exact URL). */
export const TURNSTILE_SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** The hidden field Turnstile adds to the form with its token. */
export const TURNSTILE_FIELD = 'cf-turnstile-response'

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Longer than this, checking costs the buyer more than the check is worth. */
const VERIFY_TIMEOUT_MS = 3000

export type TurnstileVerdict = 'passed' | 'failed' | 'missing' | 'unchecked'

/**
 * Ask Cloudflare whether the form's token is real (Turnstile, "Validate the token", read 11 Nov 2026:
 * server-side validation is mandatory; tokens last 300 s and are single-use).
 */
export async function checkTurnstile({
  token,
  secret,
  remoteip,
  fetcher = fetch,
  timeoutMs = VERIFY_TIMEOUT_MS,
}: {
  token: unknown
  secret: string | undefined
  remoteip?: string | null
  fetcher?: typeof fetch
  timeoutMs?: number
}): Promise<TurnstileVerdict> {
  if (!secret?.trim()) return 'unchecked'
  if (typeof token !== 'string' || token.trim() === '') return 'missing'
  const body = new URLSearchParams({ secret: secret.trim(), response: token.trim() })
  if (remoteip) body.set('remoteip', remoteip)
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const res = await fetcher(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: abort.signal,
    })
    if (!res.ok) {
      console.error(`[turnstile] siteverify answered ${res.status}; inquiry not judged`)
      return 'unchecked'
    }
    const data = (await res.json()) as { success?: unknown }
    return data.success === true ? 'passed' : 'failed'
  } catch (error) {
    console.error('[turnstile] siteverify unreachable; inquiry not judged', error)
    return 'unchecked'
  } finally {
    clearTimeout(timer)
  }
}

/** The spam reasons a verdict adds (stored with the inquiry, so the admin shows why it was held). */
export function turnstileSpamReasons(verdict: TurnstileVerdict): string[] {
  return verdict === 'failed' || verdict === 'missing' ? [`turnstile-${verdict}`] : []
}
