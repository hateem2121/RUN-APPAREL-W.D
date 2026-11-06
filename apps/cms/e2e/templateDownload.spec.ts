import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from './offlineMedia'

/**
 * The tech pack guide's download form and the three guide tools (C1 and C6, owner approved every
 * word on 6 Nov 2026), in a real browser against the real route and database.
 *
 * What would have to break for these to fail: the form posting nowhere, the route not storing or not
 * answering with the workbook, the browser saving something that is not an .xlsx, the script's own
 * check letting an empty form through, a refusal's notice not reaching the page, the privacy link
 * pointing at a section that does not exist, or a tool showing a figure other than the draft's.
 * The unit tests (`route.test.ts`, `guideTools.test.ts`) hold the branches a browser cannot reach.
 */

const GUIDE = '/guides/tech-pack-template'

async function fillForm(page: Page) {
  await page.locator('#template-name').fill('Test Buyer')
  await page.locator('#template-email').fill('buyer@e2e.example')
  await page.locator('#template-company').fill('E2E Club')
  await page.locator('#template-country').fill('Canada')
}

/** A saved file is a zip (an .xlsx is one) whose first entry is the content-types part. */
async function looksLikeTheWorkbook(path: string) {
  const bytes = await readFile(path)
  return (
    bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) &&
    bytes.subarray(30, 30 + '[Content_Types].xml'.length).toString() === '[Content_Types].xml'
  )
}

test.describe('the tech pack template download', () => {
  test('with scripting off, a filled form saves the workbook and the page stays put', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, acceptDownloads: true })
    const page = await context.newPage()
    await page.goto(GUIDE)
    await fillForm(page)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download the template' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('RUN-APPAREL-tech-pack-template.xlsx')
    expect(await looksLikeTheWorkbook(await download.path())).toBe(true)
    await expect(page).toHaveURL(new RegExp(`${GUIDE}$`))
    await context.close()
  })

  test('with scripting on, it saves the same workbook and says so on the page', async ({
    page,
  }) => {
    await page.goto(GUIDE)
    await fillForm(page)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download the template' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('RUN-APPAREL-tech-pack-template.xlsx')
    expect(await looksLikeTheWorkbook(await download.path())).toBe(true)
    await expect(
      page.getByRole('status').filter({ hasText: 'Your template is downloading.' }),
    ).toBeVisible()
  })

  test('an empty form is stopped in the page, in the form’s words, with focus on the first box', async ({
    page,
  }) => {
    await page.goto(GUIDE)
    let posted = false
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`${GUIDE}/download`)) posted = true
    })
    await page.getByRole('button', { name: 'Download the template' }).click()
    await expect(page.getByText('Enter your name.')).toBeVisible()
    await expect(page.getByText('Enter your company email address.')).toBeVisible()
    await expect(page.getByText('Enter your company’s name.')).toBeVisible()
    await expect(page.getByText('Enter your country.')).toBeVisible()
    await expect(page.locator('#template-name')).toBeFocused()
    await expect(page.locator('#template-name')).toHaveAttribute('aria-invalid', 'true')
    expect(posted, 'an empty form reached the server').toBe(false)
  })

  test('the updates box starts unticked, and the four needed boxes are required', async ({
    page,
  }) => {
    await page.goto(GUIDE)
    await expect(page.getByLabel('Send me occasional updates')).not.toBeChecked()
    // By id: a needed box's label ends in its "*", so a label locator is fragile here.
    for (const id of ['name', 'email', 'company', 'country']) {
      await expect(page.locator(`#template-${id}`)).toHaveAttribute('required', '')
    }
    await expect(page.locator('#template-job')).not.toHaveAttribute('required', '')
    await expect(page.locator('#template-whatsapp')).not.toHaveAttribute('required', '')
  })

  test('a refusal comes back as its own message, focused', async ({ page }) => {
    await page.goto(`${GUIDE}?error=too-many#template-problem`)
    const notice = page.locator('#template-problem')
    await expect(notice).toHaveText(
      'That is several downloads in a short time. Please wait a few minutes and try again.',
    )
    await expect(notice).toBeFocused()
    // NEGATIVE CONTROL: with no code there is no notice at all.
    await page.goto(GUIDE)
    await expect(page.locator('#template-problem')).toHaveCount(0)
  })

  test('the line beside the button links to the privacy page’s own section', async ({ page }) => {
    await page.goto(GUIDE)
    const link = page.getByRole('link', { name: 'Privacy notice.' })
    await expect(link).toHaveAttribute('href', '/privacy#template-downloads')
    await page.goto('/privacy#template-downloads')
    await expect(page.locator('h2#template-downloads')).toHaveText('Template downloads')
    await expect(page.locator('nav.legal__toc a[href="#template-downloads"]')).toHaveText(
      'Template downloads',
    )
  })
})

test.describe('the guides’ small tools (C6)', () => {
  test('the GSM converter shows the draft’s figure, both ways', async ({ page }) => {
    await page.goto('/guides/sportswear-fabrics-and-weights#gsm-converter')
    const tool = page.locator('#gsm-converter')
    await tool.getByLabel('Fabric weight (grams per square meter)').fill('180')
    await expect(tool.locator('output')).toHaveText('180 GSM is 5.31 ounces per square yard.')
    await tool.getByText('Ounces per square yard (oz/yd²)').click()
    await tool.getByLabel('Fabric weight (ounces per square yard)').fill('5,3')
    await expect(tool.locator('output')).toHaveText('5.3 ounces per square yard is 179.7 GSM.')
  })

  test('the carton calculator rounds once, after the total', async ({ page }) => {
    await page.goto('/guides/shipping-and-import-duties#cbm-calculator')
    const tool = page.locator('#cbm-calculator')
    await tool.getByLabel('Length, in centimeters').fill('55')
    await tool.getByLabel('Width, in centimeters').fill('35')
    await tool.getByLabel('Height, in centimeters').fill('30')
    await tool.getByLabel('Number of cartons').fill('25')
    await expect(tool.locator('output')).toHaveText(
      'One carton: 0.058 cubic meters (CBM), or 2.04 cubic feet. All 25 cartons: 1.444 cubic meters, or 50.99 cubic feet.',
    )
    await tool.getByLabel('Number of cartons').fill('2.5')
    await expect(
      tool.getByText('The number of cartons must be a whole number, 1 or more.'),
    ).toBeVisible()
  })

  test('the ball size lookup answers from the chosen country’s list', async ({ page }) => {
    await page.goto('/guides/how-soccer-balls-are-made#ball-size-lookup')
    const tool = page.locator('#ball-size-lookup')
    await tool.getByLabel('Age group, as The FA names it').selectOption('Under 12 (Year 7)')
    await expect(tool.locator('output')).toHaveText(
      'Under 12 (Year 7): size 4 (The FA’s FutureFit table).',
    )
    await tool.getByText('United States').click()
    // A change of country rebuilds the list and clears the answer.
    await expect(tool.locator('output')).toHaveText('')
    await expect(
      tool.getByLabel('Age group, as US Youth Soccer names it').locator('option'),
    ).toHaveCount(13)
    await tool.getByLabel('Age group, as US Youth Soccer names it').selectOption('13 and under')
    await expect(tool.locator('output')).toHaveText(
      '13 and under: size 5 (US Youth Soccer, Rule 303).',
    )
  })
})
