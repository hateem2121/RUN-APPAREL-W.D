import { describe, expect, it } from 'vitest'
import { spamReasons } from './inquirySpam'

/*
 * Every example here is MADE UP in the shape of what reached production (75 rows read on
 * 2026-11-10, judged locally and never committed: the repository is public and those rows hold
 * real people's names and addresses). The robot's own fields are copied in shape, not in value.
 */
const buyer = {
  name: 'Sara Lindqvist',
  company: 'Nordkap Running AB',
  jobTitle: 'Head of product',
  subject: 'Request a quote',
  phone: '+46 70 123 4567',
  message:
    'We are a Swedish running brand looking for a partner for 300 singlets and 200 shorts per style. Could you share MOQ and sample lead times?',
}

describe('spamReasons — the robot that sent 61 of 69 spam rows', () => {
  const robot = {
    name: 'RobertFot',
    company: 'google',
    jobTitle: 'Hallo i write about your the prices',
    subject: 'Hallo i write about your the prices',
    phone: '+8316 89528415162',
    message: 'Hai, saya ingin tahu harga Anda.',
  }

  it('names every signal it finds', () => {
    expect(spamReasons(robot)).toEqual(['robot-company', 'job-is-subject', 'unknown-dial-code'])
  })

  it('still catches each signal alone, so the robot changing one field is not enough', () => {
    expect(spamReasons({ ...buyer, company: 'google' })).toEqual(['robot-company'])
    expect(
      spamReasons({ ...buyer, jobTitle: 'Hi about prices', subject: 'Hi about prices' }),
    ).toEqual(['job-is-subject'])
    expect(spamReasons({ ...buyer, phone: '+8455 81627723737' })).toEqual(['unknown-dial-code'])
  })
})

describe('spamReasons — the sales pitches seen in production', () => {
  it.each([
    ['a data seller', 'Hello, I am Ann from FreeB2BData. We are shutting down.'],
    ['a lead-generation pitch', 'Here’s how: Web Visitors Into Leads is a software widget'],
    ['a backlink seller', 'Best quality seo backlinks to upgrade your rank'],
    ['a shortened scam link', 'I am sending you my photos as I promised. https://tinyurl.com/abc'],
  ])('%s', (_, message) => {
    expect(spamReasons({ ...buyer, message })).toEqual(['sales-pitch'])
  })
})

/*
 * THE NEGATIVE CONTROLS: a caught buyer never reaches the team, so each rule is shown NOT to fire
 * on the nearest real thing. Quarantined rows are kept (status "spam"), which makes a false catch
 * recoverable — but only if someone looks, so the rules stay narrow.
 */
describe('spamReasons — real buyers pass', () => {
  it('a plain buyer', () => {
    expect(spamReasons(buyer)).toEqual([])
  })

  it('a buyer who WORKS at Google writes the name with a capital', () => {
    expect(spamReasons({ ...buyer, company: 'Google' })).toEqual([])
    expect(spamReasons({ ...buyer, company: 'Google LLC (merch team)' })).toEqual([])
  })

  it('every real calling-code shape: one, two and three digits, with or without spaces', () => {
    for (const phone of [
      '+1 415 555 0100', // NANP: the one-digit code shared by 25 countries
      '+44 7481 353077',
      '+92 300 1234567',
      '+880 1712 345678', // three digits
      '+923001234567', // typed with no space: no code group to judge, so no signal
      '4182185162', // no + at all: a number typed alone is kept as typed (joinPhone)
      '',
    ]) {
      expect(spamReasons({ ...buyer, phone }), phone).toEqual([])
    }
  })

  it('a job title and a subject that differ, or are both left empty', () => {
    expect(spamReasons({ ...buyer, jobTitle: '', subject: '' })).toEqual([])
    expect(spamReasons({ ...buyer, jobTitle: 'Owner', subject: 'Samples' })).toEqual([])
  })

  it('messages in other languages and scripts, short or long', () => {
    for (const message of [
      'Wir suchen einen Sportbekleidungshersteller für Radtrikots.',
      'ہمیں 500 ہوڈیز کی قیمت چاہیے',
      'Hola, quería saber el precio de 200 camisetas.',
      'Price?',
    ]) {
      expect(spamReasons({ ...buyer, message }), message).toEqual([])
    }
  })

  it('a buyer who mentions leads, SEO or a link to their own files', () => {
    expect(
      spamReasons({
        ...buyer,
        message:
          'Our SEO agency team needs 80 polos. Tech pack: https://drive.google.com/file/d/abc — leads time?',
      }),
    ).toEqual([])
  })
})
