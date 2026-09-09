# DECISION — Zaraz and Log Explorer, and why we are buying neither

**Decided 2026-08-30.** Short version:

> **No Zaraz: we have zero third-party tags for it to manage, and adopting it would
> cost the `no-transform` defence the viewer's CSP depends on.**
>
> **No Log Explorer: it cannot see Workers logs at all, and it is a paid add-on on a
> plan this account does not have. Use Workers Logpush → R2, a Tail Worker → Sentry,
> and Cloudflare Trace instead — all effectively $0.**

This file exists for the same reason as
[DECISION-UI-LIBRARIES.md](DECISION-UI-LIBRARIES.md): both questions are reasonable,
both recur, and both cost an afternoon each time they are researched from scratch.
On 2026-08-15 a session re-researched "should we adopt Tailwind?" while the answer had
already been decided and written down somewhere it could not find. The reasoning is
recorded below, not just the verdict, so a future session can check whether the
reasoning still holds rather than re-deriving it.

Both were assessed during the audit in
the 2026-08-30 Cloudflare + GitHub audit (kept privately — it records live infrastructure identifiers and is not part of this public repository).

---

## Zaraz — no

Zaraz moves third-party tags off the browser's main thread and out of the page's
`script-src`. It is a good product. It manages **tags**, and this project has none.

**Measured on the live page, 2026-08-30.** Every external host the viewer loads:

```
https://static.cloudflareinsights.com     ← Cloudflare's own Web Analytics beacon
https://media.wear-run.help               ← our own
https://cms.wear-run.help                 ← our own
```

A grep across `apps/viewer/index.html`, `apps/viewer/src` and `apps/cms/src` for every
major tag — Google Tag Manager, Google Analytics, `gtag`, Meta/Facebook, `fbq`,
Hotjar, Segment, Mixpanel, PostHog, Intercom, HubSpot, Microsoft Clarity — returns
**zero real hits**. `GET https://viewer.wear-run.help/cdn-cgi/zaraz/i.js` returns 404,
so it is not silently active either.

**Price is not the objection.** The free tier is 1,000,000 events/month and this site
would never approach it. The objection is architectural: Zaraz rewrites HTML at the
edge, and the viewer deliberately serves `index.html` with `no-transform`
(`apps/viewer/scripts/csp.mjs`, pinned by `csp.test.ts`). Adopting Zaraz means giving
that up to buy management of a set that is currently empty.

**Revisit when — and only when — a genuine third-party tag is added** (an ads pixel, a
chat widget, a CRM script). At that moment Zaraz becomes the *right* answer, precisely
because it keeps that tag out of `script-src`. Until then it manages nothing.

---

## Log Explorer — no

The assumption worth killing first: **Log Explorer cannot search your Workers' logs.**

Cloudflare enumerates the datasets it supports — HTTP requests, firewall events,
Gateway DNS, Zero Trust access, audit logs and so on, 25 in total. **Workers trace
events are not among them.** So the single thing you would most want to investigate —
why the CMS Worker threw — is the thing it cannot see.

Two further facts settle it:

- It is **a paid add-on on top of an Application Services or Zero Trust purchase**,
  with no free tier and no trial. That is roughly $20–25/month before per-GB usage,
  against a **$5/month** cap for the whole project.
- The zone is on the **Free** plan, so the purchase it attaches to does not exist.

Source: <https://developers.cloudflare.com/log-explorer/pricing/>

### What to do instead — all effectively $0

| Instead of | Use | Why it works here |
|---|---|---|
| Searching Worker logs | **Workers Trace Events Logpush → R2** | Cloudflare states Workers Trace Events Logpush is available on the **Workers Paid** plan, which this account already has. Volume sits inside R2's free tier. Use a dedicated bucket — not `run-apparel-viewer-media`, which `scripts/backup-r2.mjs` mirrors. |
| Being told about an exception | **A Tail Worker → Sentry** | Forward only records whose outcome is `exception`. Billed on CPU time, which is noise at this volume. Sentry is already wired for the browser and the shrink robot; the CMS and viewer Workers currently reach **nothing** — an unhandled exception lands in a 7-day log buffer and alerts no one. |
| "Did that rule actually fire?" | **Cloudflare Trace** | Free on **all** plans, including Free. It simulates a request and shows which rules evaluate, in order. This repo has asked that question repeatedly — the `/catalogue` Single Redirect confusion is the latest — and has never used it. Needs an Administrator role. |

**The gap worth closing first** is the middle row. It is not a tooling purchase; it is
that server-side exceptions in the two internet-facing Workers currently tell nobody.

---

## What would change these decisions

- **Zaraz** — the business adds a real third-party tag. Not before.
- **Log Explorer** — Cloudflare adds Workers trace events to its dataset list, *and*
  the project is on a paid Application Services plan for some other reason. Both, not
  either.

Re-measure before reversing either. The tag census above is a `grep` and a page load;
the dataset list is one documentation page.
