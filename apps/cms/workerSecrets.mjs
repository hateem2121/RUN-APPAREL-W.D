/**
 * Which secrets each of the two Workers built from this code must hold.
 *
 * WHY (22 to 23 Nov 2026). The site-only Worker (wrangler.site.jsonc) is this same code built a
 * second time, and A SECOND WORKER GETS NONE OF THE FIRST ONE'S SECRETS. It went live holding
 * PAYLOAD_SECRET and SENTRY_DSN, which the deploy applies, and not CF_ANALYTICS_TOKEN, which was
 * put on the CMS Worker by hand on 7 Sep 2026. `Analytics.tsx` draws nothing without that token,
 * and says nothing either, so every website page went out with no Cloudflare analytics tag. The
 * Uptime check found it at 19:50 UTC on 22 Nov (issue #455); Uptime runs about four times a day,
 * so the gap was live for hours. The switch `front-door` = `full` ended it at 03:23 UTC on 23 Nov.
 *
 * So every secret of the CMS Worker is named here ONCE, either as one the site-only Worker must
 * hold too or as one it must not need, with the reason and the only files allowed to read it.
 * src/workerSecrets.test.ts fails when a secret is read somewhere this file does not name, which
 * is the moment to decide; the deploy's pre-live analytics check (ci.yml, beacon-probe.mjs) is
 * the proof on the real Worker.
 *
 * Names only. A value never belongs in this repository.
 */

/** The CMS Worker's secrets, as `wrangler secret list` named them on 23 Nov 2026. */
export const CMS_WORKER_SECRETS = Object.freeze([
  'CF_ANALYTICS_TOKEN',
  'PAYLOAD_SECRET',
  'RESEND_API_KEY',
  'SENTRY_DSN',
  'TEMPLATE_NOTICE_OWNER',
  'TURNSTILE_SECRET',
])

/**
 * The secrets the site-only Worker must hold as well, and who puts each one there.
 * `by: 'deploy'` is applied on every deploy (ci.yml, "Apply the site-only Worker's secret");
 * `by: 'hand'` was set once and each new version inherits it.
 */
export const SITE_ONLY_SECRETS = Object.freeze({
  PAYLOAD_SECRET: {
    by: 'deploy',
    why: 'Payload will not start without it, and a page reads the CMS.',
  },
  SENTRY_DSN: { by: 'deploy', why: 'A page that throws must still be reported.' },
  CF_ANALYTICS_TOKEN: {
    by: 'hand',
    why: 'Analytics.tsx draws the Cloudflare analytics tag on every page, and nothing without it.',
  },
})

/**
 * The secrets the site-only Worker does NOT hold, why that is safe, and the only source files
 * that may read each one. The door sends the site-only Worker GET and HEAD requests alone
 * (door.mjs forSiteOnly), so a secret read only while answering a POST is never needed there.
 */
export const NOT_ON_SITE_ONLY = Object.freeze({
  RESEND_API_KEY: {
    why: 'Mail is sent only while answering a form post, and every post goes to the CMS Worker.',
    readers: ['src/lib/formSubmission.ts', 'src/payload.config.ts'],
  },
  TURNSTILE_SECRET: {
    why: 'A Turnstile answer is checked only while answering the contact form post.',
    readers: ['src/app/(frontend)/contact/submit/route.ts'],
  },
  TEMPLATE_NOTICE_OWNER: {
    why: 'The owner is told about a template download only while answering that post.',
    readers: ['src/app/(frontend)/guides/tech-pack-template/download/route.ts'],
  },
})

/**
 * What a list of secret names is missing. Pure, so the same rule serves the test and any check
 * that reads the names off a real Worker.
 *
 * @param {Iterable<string>} held the names the Worker holds
 * @param {Iterable<string>} needed the names it must hold
 * @returns {string[]} the needed names that are not held, in the order given
 */
export function missingSecrets(held, needed) {
  const have = new Set(held)
  return [...needed].filter((name) => !have.has(name))
}
