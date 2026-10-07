import { FAQ_TOPICS, faqVisibleAnswer } from '../src/lib/faqs'
import { GLOSSARY_TERMS } from '../src/lib/glossary'
import { expect, test } from './offlineMedia'

/**
 * The FAQ and the glossary (PLAN.md D5, D6), held in a real browser: what would have to break for
 * a buyer — or an answer engine — to read something the page does not say.
 */

test.describe('the FAQ', () => {
  test('a topic page’s question data is the page, word for word', async ({ page }) => {
    const topic = FAQ_TOPICS[1]
    if (!topic) throw new Error('no FAQ topic')
    await page.goto(topic.path)
    const data = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((all) => all.map((script) => JSON.parse(script.textContent ?? '{}')))
    const faq = data.find((entry) => entry['@type'] === 'FAQPage')
    expect(faq, 'no FAQPage data on the page').toBeDefined()
    const pairs = (faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[]).map(
      (question) => [question.name, question.acceptedAnswer.text],
    )
    expect(pairs).toEqual(topic.entries.map((entry) => [entry.question, faqVisibleAnswer(entry)]))
    // …and every one of those words is on the page, the detail included while it is closed.
    const text = (await page.locator('main').textContent()) ?? ''
    for (const entry of topic.entries) expect(text).toContain(entry.answer)
  })

  test('"More detail" opens in place, and an answer link lands on its question', async ({
    page,
  }) => {
    await page.goto('/faq/quality-and-certifications#gots')
    const entry = page.locator('#gots')
    await expect(entry).toBeInViewport()
    const more = entry.locator('details')
    await expect(more.locator('p')).toBeHidden()
    await more.locator('summary').click()
    await expect(more.locator('p')).toBeVisible()
  })

  test('the hub emits no question data: each answer has one home', async ({ page }) => {
    await page.goto('/faq')
    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((all) => all.map((script) => JSON.parse(script.textContent ?? '{}')['@type']))
    expect(types).not.toContain('FAQPage')
    await expect(page.locator('.faq-most__row')).toHaveCount(5)
  })
})

test.describe('the glossary', () => {
  test('every term is in the page, and the filter narrows it', async ({ page }) => {
    await page.goto('/glossary')
    await expect(page.locator('[data-glossary-term]')).toHaveCount(GLOSSARY_TERMS.length)
    const box = page.getByLabel('Filter terms')
    await box.fill('sublimation')
    await expect(page.locator('#sublimation')).toBeVisible()
    await expect(page.locator('#gsm')).toBeHidden()
    await expect(page.locator('.glossary-filter__count')).toContainText(
      `of ${GLOSSARY_TERMS.length} terms`,
    )
    await box.fill('')
    await expect(page.locator('#gsm')).toBeVisible()
  })

  test('a letter jumps to its first term', async ({ page }) => {
    await page.goto('/glossary')
    await page.locator('.glossary-letters a', { hasText: /^D$/ }).click()
    await expect(page).toHaveURL(/#dtf$/)
    await expect(page.locator('#dtf')).toBeInViewport()
  })
})

test.describe('with scripting off', () => {
  test.use({ javaScriptEnabled: false })

  test('the glossary shows every term, and no filter box that could do nothing', async ({
    page,
  }) => {
    await page.goto('/glossary')
    await expect(page.locator('[data-glossary-term]')).toHaveCount(GLOSSARY_TERMS.length)
    await expect(page.getByLabel('Filter terms')).toHaveCount(0)
  })
})
