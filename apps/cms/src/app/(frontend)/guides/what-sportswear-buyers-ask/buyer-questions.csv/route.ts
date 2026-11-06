import { buyerQuestionsCsv, CSV_FILE_NAME } from '../../../../../lib/buyerQuestions'

export const dynamic = 'force-dynamic'

/**
 * `GET /guides/what-sportswear-buyers-ask/buyer-questions.csv` — the counts behind the C7 page, as a
 * file (owner approved the page's words on 6 Nov 2026: "the same counts are in a CSV file you can
 * download"). It is built from the SAME list as the page's chart and tables (`lib/buyerQuestions.ts`),
 * so the three cannot differ, and it holds topic counts only: no inquiry, buyer or word of theirs.
 *
 * The download is named `run-apparel-buyer-questions-2026.csv` (the main session's call, 6 Nov 2026);
 * the address keeps the generic `buyer-questions.csv`, and a new year's file gets a new name here.
 * A short cache: the counts change once, when the owner approves them, and a stale copy for five
 * minutes is harmless where a stale year is not.
 */
export function GET(): Response {
  return new Response(buyerQuestionsCsv(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${CSV_FILE_NAME}"`,
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  })
}
