import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The container's base image is pinned by digest, and nothing refreshes it.
 *
 * Pinning is correct: `node:24-slim` is a moving tag that picks up Node patch releases
 * and rebuilt system libraries, and `sharp` links against those — a change in the WebP
 * encoder shows up as printed artwork looking different for no reason anyone can trace
 * to a commit. Never refreshing it is not correct: base images are rebuilt mainly to
 * carry operating-system security fixes.
 *
 * ⚠️ NOTHING MEASURED THE AGE UNTIL 2026-08-29, and the comment beside the pin was
 * itself wrong — it claimed Dependabot's `docker` ecosystem refreshed it, which was
 * never true (`.github/dependabot.yml` declares only npm and github-actions, both at
 * `open-pull-requests-limit: 0` by a deliberate quiet-mode decision). So the pin was
 * 15 days stale with a note saying it was handled.
 *
 * The security scanner does check the base image, but only on the shrink deploy and
 * only for problems that already have fixes. Nothing said the pin had aged.
 *
 * ⚠️ THIS TEST GOES RED WITH TIME RATHER THAN WITH A CODE CHANGE, which is unusual here
 * and is the point — it is the calendar reminder, enforced the way every other budget in
 * this repo is. The window is deliberately generous: this should be a nudge on a quiet
 * day, not a block during a release.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const DOCKERFILE = join(REPO_ROOT, 'apps', 'shrink', 'Dockerfile')

/** Refresh window. Monthly is the intent; 45 days leaves room to not be urgent. */
const MAX_AGE_DAYS = 45

/** Parse `# PINNED-ON: YYYY-MM-DD` out of the Dockerfile. */
function pinnedOn(dockerfile: string): Date | null {
  const match = /^#\s*PINNED-ON:\s*(\d{4})-(\d{2})-(\d{2})\s*$/m.exec(dockerfile)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function ageInDays(pinned: Date, now: Date): number {
  return Math.floor((now.getTime() - pinned.getTime()) / 86_400_000)
}

describe('the container base image pin', () => {
  it('records when it was last refreshed', async () => {
    /*
     * Without the date there is nothing to measure, and the gate below would pass by
     * finding nothing — the failure shape this repo has recorded five times.
     */
    expect(pinnedOn(await readFile(DOCKERFILE, 'utf8'))).toBeInstanceOf(Date)
  })

  it('is still pinned by digest, not by a moving tag', async () => {
    const source = await readFile(DOCKERFILE, 'utf8')
    expect(source).toMatch(/^FROM node:24-slim@sha256:[0-9a-f]{64}$/m)
  })

  it(`has been refreshed within the last ${MAX_AGE_DAYS} days`, async () => {
    const pinned = pinnedOn(await readFile(DOCKERFILE, 'utf8'))
    if (!pinned) throw new Error('no PINNED-ON date — the test above explains why')
    const age = ageInDays(pinned, new Date())

    expect(
      age,
      `The container base image was pinned ${age} days ago and nothing refreshes it.\n` +
        'Base images are rebuilt mainly for OS security fixes, so this is the reminder.\n\n' +
        'To refresh:\n' +
        '  docker pull node:24-slim\n' +
        '  docker inspect --format="{{index .RepoDigests 0}}" node:24-slim\n' +
        '  # put that digest in apps/shrink/Dockerfile, update PINNED-ON to today,\n' +
        '  # then rebuild the image and confirm it still starts.\n\n' +
        'Do NOT unpin it, and do NOT add a docker ecosystem to dependabot.yml — see\n' +
        'the comment beside the pin for why both of those are wrong here.',
    ).toBeLessThanOrEqual(MAX_AGE_DAYS)
  })

  it('⚠️ CONTROL: the age check can actually fail', () => {
    // A date-based gate that cannot go red is a comment.
    const old = new Date(Date.UTC(2020, 0, 1))
    expect(ageInDays(old, new Date(Date.UTC(2020, 2, 1)))).toBeGreaterThan(MAX_AGE_DAYS)
  })

  it('⚠️ CONTROL: it does not fire on a fresh pin', () => {
    const now = new Date(Date.UTC(2026, 7, 29))
    expect(ageInDays(new Date(Date.UTC(2026, 7, 20)), now)).toBeLessThanOrEqual(MAX_AGE_DAYS)
  })
})
