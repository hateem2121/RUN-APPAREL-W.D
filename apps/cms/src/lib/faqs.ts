import {
  CERTIFICATION_LINES,
  CERTIFICATION_PROMISE,
  FACTS,
  LEAD_TIME,
  SHIPS_TO,
} from './companyFacts'

/**
 * The FAQ (PLAN.md D5), approved word for word by the owner on 2026-10-07.
 *
 * ⚠️ NOTHING HERE IS A NEW CLAIM. Each answer is the site's own words — a guide, the terms page,
 * the certification lines — and its `source` says which. The six standards answers open with one
 * sentence drawn from each organization's own website (read 2026-10-07) and end with who holds
 * it here, from `CERTIFICATION_LINES`; no garment is said to carry any label (PLAN.md G6).
 * Numbers come from `FACTS` and `LEAD_TIME`, never retyped (G5): `faqs.test.ts` fails a digit
 * typed into an answer that the constants do not supply.
 *
 * ⚠️ A QUESTION WAITS FOR ITS FACT. Payment terms, transit times, documents, color matching and
 * the rest waited for the owner's answers (F1–F15), given on 2026-10-07; each such entry's
 * `source` names its answer. A topic publishes only with five questions or more.
 *
 * ⚠️ GOOGLE NO LONGER SHOWS FAQ RICH RESULTS (its FAQPage page, read 2026-10-07: restricted to
 * government and health sites in 2023, not shown from 7 May 2026). The question data stays for
 * the reason `faqJsonLd` gives: answer engines assemble answers from that shape, and the data is
 * the visible page, word for word.
 */

/**
 * The figures the owner gave in writing for the FAQ (2026-10-07): the only numbers an answer
 * may state beyond `FACTS`, `LEAD_TIME` and the guides. `faqs.test.ts` allows these and no
 * others, so a figure is added here, with its answer, or not at all.
 */
export const OWNER_FIGURES = {
  /** F2: the example split within the minimum, the owner's draft sentence approved as written. */
  sizeSplit: '10 S, 20 M, 15 L, 5 XL',
  /** F15: how long after delivery a buyer has to report a problem. */
  reportProblemDays: '14',
} as const

export type FaqEntry = {
  /** Anchor id, lowercase and hyphens, unique across every FAQ page. */
  readonly id: string
  readonly question: string
  /** The direct answer, 50 words or fewer. */
  readonly answer: string
  /** Shown inside a native <details> under the answer. */
  readonly detail?: string
  /** Where the words come from. Never shown. */
  readonly source: string
  /**
   * The answer is a list of certificate and registry names (the owner's lines, word for word):
   * the reading-ease check skips it, as it skips the policies hub's (owner, 2026-10-07: "Treat
   * them as facts").
   */
  readonly facts?: true
}

export type FaqTopic = {
  readonly path: string
  /** The `<title>`; the layout adds " — RUN APPAREL". */
  readonly title: string
  readonly description: string
  /** The one `<h1>`, in two parts: plain, then the single serif accent. */
  readonly heading: string
  readonly headingAccent: string
  readonly entries: readonly FaqEntry[]
}

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

const MINIMUM = fact('Minimum')
const SAMPLE_DAYS = fact('Working days')
const CAPACITY = fact('Pieces per month')

/** The hub's own words (D5). The topic pages reuse its second sentence as their lede. */
export const FAQ_INDEX = {
  path: '/faq',
  title: 'FAQ',
  description:
    'Answers to what buyers ask RUN APPAREL before they write: orders and samples, quality and certifications, shipping, fabrics and printing.',
  heading: 'Questions,',
  headingAccent: 'answered plainly.',
  lede: 'Everything buyers ask us before they write. If your question isn’t here, ask us — we reply within 24 hours.',
  /**
   * The hub's "five we hear most", as anchors on the topic pages, in D5's order (O1, O2, S6, Q1,
   * W2). "Who owns the artwork I send?" took the fifth place from the bulk lead time, its stand-in,
   * when "Working with us" became a page (2026-10-07).
   */
  mostAsked: ['minimum-order', 'sample-time', 'countries', 'certifications', 'artwork'] as const,
} as const

/** The topic pages' lede: the hub's own second sentence. */
export const FAQ_TOPIC_LEDE = 'If your question isn’t here, ask us — we reply within 24 hours.'

const ORDERS: FaqTopic = {
  path: '/faq/orders-and-samples',
  title: 'FAQ: Orders and Samples',
  description: `RUN APPAREL's minimum order is ${MINIMUM} pieces per style, a sample takes ${SAMPLE_DAYS} working days, and the quote is free. Answers on orders and samples.`,
  heading: 'Orders',
  headingAccent: 'and samples.',
  entries: [
    {
      id: 'minimum-order',
      question: 'What is RUN APPAREL’s minimum order?',
      answer: `RUN APPAREL’s minimum order is ${MINIMUM} pieces per style.`,
      detail: `The same building, the same team and the same standard make the order whether it is a hundred pieces or a hundred thousand. Capacity is ${CAPACITY} pieces per month.`,
      source: 'minimum-order guide, FACTS',
    },
    {
      id: 'sample-time',
      question: 'How long does a sample take?',
      answer: `A sample takes ${SAMPLE_DAYS} working days. Bulk production starts only after you approve it.`,
      source: 'minimum-order guide, ORDER_PHASES',
    },
    {
      id: 'sample-fee',
      question: 'Is the sample fee credited back?',
      answer:
        'Yes. The sample fee is credited back against your bulk order. If no bulk order follows, we keep the fee.',
      source: 'minimum-order guide + owner (F1, 2026-10-07)',
    },
    {
      id: 'split-minimum',
      question: 'Can I split the minimum across sizes and colors?',
      answer: `Within the ${MINIMUM} you can typically split across sizes (for example ${OWNER_FIGURES.sizeSplit}). Color splits depend on the fabric and printing method; we confirm exact splits in your quote.`,
      source: 'owner (F2, 2026-10-07), the draft sentence approved as written',
    },
    {
      id: 'fewer-than-minimum',
      question: `Can I order fewer than ${MINIMUM} pieces?`,
      answer: `Yes, at a higher price per piece. ${MINIMUM} pieces per style is our standard minimum.`,
      source: 'owner (F3, 2026-10-07): "Do fewer than 50. But the cost increase."',
    },
    {
      id: 'payment-terms',
      question: 'What are your payment terms?',
      answer: 'We agree payment terms with each buyer.',
      source: 'owner (F4, 2026-10-07): "mutually agreed with the customer"',
    },
    {
      id: 'quote',
      question: 'How do I get a quote?',
      answer:
        'Send what you have — a sketch is enough. The quote is free, commits you to nothing, and states the fabric, trims, sizes and price.',
      source: 'minimum-order guide ("The quote"), contact page',
    },
    {
      id: 'what-to-send',
      question: 'What should I send to start?',
      answer:
        'Styles and quantities, your target fabric or a reference garment, any artwork, and the date you need it by. None of it is required to start the conversation.',
      source: 'order guide, word for word',
    },
    {
      id: 'lead-time',
      question: 'How long does bulk production take?',
      answer: LEAD_TIME,
      source: 'LEAD_TIME',
    },
    {
      id: 'prices',
      question: 'Why are there no prices on the website?',
      answer:
        'Every garment is made to order, so every price is quoted for that order. Prices, minimum quantities and lead times are quoted in writing for each inquiry.',
      source: 'terms page; llms.txt ("made to order")',
    },
  ],
}

/** Who holds each mark here, from the owner's certification lines (G6). */
const [PARENT_LINE, SUPPLIERS_LINE, SECP_LINE] = CERTIFICATION_LINES

const QUALITY: FaqTopic = {
  path: '/faq/quality-and-certifications',
  title: 'FAQ: Quality and Certifications',
  description:
    'Which certifications and audits cover RUN APPAREL’s production, who holds each one, and what Sedex, SMETA, ISO 9001, OEKO-TEX, GOTS, GRS and amfori BSCI mean.',
  heading: 'Quality',
  headingAccent: 'and certifications.',
  entries: [
    {
      id: 'certifications',
      question: 'Which certifications and audits cover RUN APPAREL’s production?',
      answer: `${PARENT_LINE} ${SUPPLIERS_LINE}`,
      detail: `${SECP_LINE} ${CERTIFICATION_PROMISE}`,
      source: 'CERTIFICATION_LINES, CERTIFICATION_PROMISE, word for word',
      facts: true,
    },
    {
      id: 'sedex-smeta',
      question: 'What are Sedex and SMETA?',
      answer:
        'Sedex runs a platform where suppliers share information about working conditions with their customers. SMETA is Sedex’s social audit: an auditor visits a site and checks labor, health and safety, environment and business ethics.',
      detail:
        'Our parent company, DURUS INDUSTRIES, is SEDEX-registered and SMETA-audited. SMETA is an audit, not a certificate.',
      source: 'sedex.com (read 2026-10-07) + CERTIFICATION_LINES',
    },
    {
      id: 'iso-9001',
      question: 'What does ISO 9001 mean for my order?',
      answer:
        'ISO 9001 is the international standard for quality management: how a company plans, checks and keeps improving its work. Our fabric and trim suppliers hold ISO 9001 certification.',
      source: 'iso.org (read 2026-10-07; no edition named) + CERTIFICATION_LINES',
    },
    {
      id: 'oeko-tex',
      question: 'What is OEKO-TEX?',
      answer:
        'OEKO-TEX STANDARD 100 is a label for textiles tested for harmful substances, from yarn to the finished item. Our fabric and trim suppliers hold OEKO-TEX certification.',
      source: 'oeko-tex.com (read 2026-10-07) + CERTIFICATION_LINES',
    },
    {
      id: 'gots',
      question: 'What is GOTS?',
      answer:
        'GOTS, the Global Organic Textile Standard, certifies textiles made with organic fibers, with environmental and social rules for every company that processes them.',
      detail:
        'A product can be labeled GOTS-certified only when every company in its production is certified, including the garment maker. Our fabric and trim suppliers hold GOTS certification; RUN APPAREL does not.',
      source: 'global-standards.org (read 2026-10-07) + CERTIFICATION_LINES',
    },
    {
      id: 'grs',
      question: 'What is GRS?',
      answer:
        'GRS, the Global Recycled Standard, verifies recycled content and tracks it through each stage of the supply chain, with social, environmental and chemical rules.',
      detail:
        'A finished product carries a GRS claim only when every stage is certified. Our fabric and trim suppliers hold GRS certification.',
      source: 'textileexchange.org (read 2026-10-07) + CERTIFICATION_LINES',
    },
    {
      id: 'amfori-bsci',
      question: 'What is amfori BSCI?',
      answer:
        'amfori BSCI is a social audit that checks working conditions at a production site. It is not a certification. Our fabric and trim suppliers have amfori BSCI audits.',
      source: 'amfori.org (read 2026-10-07) + CERTIFICATION_LINES',
    },
    {
      id: 'checks',
      question: 'What checks happen before an order ships?',
      answer:
        'Every order is checked before it is packed: testing, inspection under light and a final check before packing.',
      detail:
        'We check seams, measurements, print and color during production and before packing, and inspect to the AQL level you choose. You get photos before the order ships.',
      source: 'ORDER_PHASES step 6; detail: owner (F6, 2026-10-07)',
    },
    {
      id: 'order-certificates',
      question: 'Can I get certificates and test reports for my order?',
      answer:
        'Yes. We can send copies of our suppliers’ certificates, and transaction certificates where every company in the chain is certified. We can also arrange lab test reports, paid for by you.',
      source: 'owner (F5, 2026-10-07)',
    },
    {
      id: 'market-certification',
      question: 'Can you meet a certification my market requires?',
      answer: CERTIFICATION_PROMISE,
      source: 'CERTIFICATION_PROMISE',
    },
  ],
}

const SHIPPING: FaqTopic = {
  path: '/faq/shipping-and-importing',
  title: 'FAQ: Shipping and Importing',
  description:
    'How RUN APPAREL ships from Pakistan, which Incoterms it quotes (EXW, FOB, CFR, CIF, DDP), who pays import duty, and how garments are packed.',
  heading: 'Shipping',
  headingAccent: 'and importing.',
  entries: [
    {
      id: 'how-we-ship',
      question: 'How do you ship orders from Pakistan?',
      answer:
        'By air courier, air freight or sea freight, or your own forwarder collects the order. The shipping method, terms and cost are stated in your quote.',
      source: 'shipping guide',
    },
    {
      id: 'incoterms',
      question: 'Which price terms (Incoterms) do you quote?',
      answer: 'EXW, FOB, CFR, CIF and DDP. FOB, CFR and CIF are used for sea freight.',
      detail:
        'EXW: you collect the goods from our building. FOB: we load the goods onto the ship at the port in Pakistan. CFR and CIF: we pay the sea freight to your port, and under CIF the insurance too. DDP: we deliver to your door with the import duty and tax already paid. These terms follow the International Chamber of Commerce rules, called Incoterms.',
      source: 'shipping guide',
    },
    {
      id: 'import-duty',
      question: 'Who pays import duty?',
      answer:
        'Under EXW, FOB, CFR and CIF, you do, when the goods arrive in your country. Under DDP, we do, and it is part of the price. The amount depends on your country and the garment, not on us.',
      source: 'shipping guide, word for word',
    },
    {
      id: 'own-forwarder',
      question: 'Can I use my own freight forwarder?',
      answer: 'Yes. Your shipping agent collects the order from us.',
      source: 'shipping guide',
    },
    {
      id: 'countries',
      question: 'Which countries do you ship to?',
      answer: SHIPS_TO,
      source: 'SHIPS_TO',
    },
    {
      id: 'packing',
      question: 'How are the garments packed?',
      answer:
        'The way you want them, under your brand: neck and care labels, hang tags, bags and cartons. There is no set minimum for custom packaging.',
      source: 'packaging guide',
    },
    {
      id: 'transit-time',
      question: 'How long does shipping take?',
      answer:
        'It depends on how your order travels: air courier, air freight or sea. We confirm the transit time in your quote.',
      source: 'owner (F7, 2026-10-07): no numbers on the site',
    },
    {
      id: 'shipping-documents',
      question: 'Which documents come with a shipment?',
      answer:
        'A commercial invoice, a packing list, a certificate of origin, and the air waybill or bill of lading.',
      source: 'owner (F8, 2026-10-07)',
    },
  ],
}

const FABRICS: FaqTopic = {
  path: '/faq/fabrics-and-printing',
  title: 'FAQ: Fabrics and Printing',
  description:
    'The fabrics RUN APPAREL works with, what GSM means, the seven printing methods in its own building, and how to choose a fabric for your garment.',
  heading: 'Fabrics',
  headingAccent: 'and printing.',
  entries: [
    {
      id: 'fabrics',
      question: 'Which fabrics do you work with?',
      answer:
        'Single jersey, interlock, pique, mesh, French terry, fleece, birdseye mesh, rib, waffle and jacquard. We are not limited to these. We make fabric to your own structure, weight and properties.',
      source: 'fabrics guide',
    },
    {
      id: 'gsm',
      question: 'What does GSM mean?',
      answer: 'GSM means grams per square meter: how heavy a fabric is.',
      detail:
        'Single jersey is usually 120 to 200 GSM, French terry 200 to 280 GSM and fleece 200 to 350 GSM.',
      source: 'fabrics guide',
    },
    {
      id: 'printing-methods',
      question: 'Which printing methods do you offer?',
      answer:
        'Seven, all inside our own building: screen printing, sublimation, DTF, DTG, heat transfer vinyl, embroidery and special inks.',
      source: 'printing guide',
    },
    {
      id: 'sublimation',
      question: 'What is sublimation printing?',
      answer:
        'Heat turns the dye into the fabric, so the print becomes part of the cloth. It suits polyester and all-over designs, such as team jerseys.',
      source: 'printing guide, word for word',
    },
    {
      id: 'screen-or-dtf',
      question: 'What is the difference between screen printing and DTF?',
      answer:
        'Screen printing pushes ink through a mesh screen onto the garment; it suits bold designs in a few colors, and larger runs. DTF prints the design on a film that is pressed on with heat; it works on most fabrics and colors.',
      source: 'printing guide',
    },
    {
      id: 'embroidery',
      question: 'Do you do embroidery?',
      answer: 'Yes, in our own building. Embroidery suits logos and badges.',
      source: 'printing guide',
    },
    {
      id: 'choose-fabric',
      question: 'How do I choose the right fabric?',
      answer:
        'Tell us what the garment is for, or send a reference garment; your quote names the fabric.',
      source: 'order guide and fabrics guide',
    },
    {
      id: 'pantone',
      question: 'Can you match a Pantone color?',
      answer:
        'Yes. We match the Pantone color you give us, and you approve a lab dip (dyed fabric) or a strike-off (a print sample) before bulk production.',
      source: 'owner (F9, 2026-10-07)',
    },
    {
      id: 'recycled-organic',
      question: 'Can you use recycled or organic fabric?',
      answer:
        'Yes. We source recycled and organic fabrics from certified suppliers, and you get the certificates that prove it.',
      source: 'owner (F10, 2026-10-07)',
    },
    {
      id: 'own-fabric',
      question: 'Can I send my own fabric?',
      answer: 'Yes. We can cut, make and trim garments from fabric you send us.',
      source: 'owner (F11, 2026-10-07)',
    },
  ],
}

/**
 * "Working with us" (PLAN.md D5), a page since the owner's answers of 2026-10-07 (F12–F15).
 * The plan's hours question (W5) is left out: the hours live in Site Settings, and an entry here
 * is fixed text that the question data and llms-full.txt repeat.
 */
const WORKING: FaqTopic = {
  path: '/faq/working-with-us',
  title: 'FAQ: Working with Us',
  description:
    'How working with RUN APPAREL goes: the order steps, who owns your artwork, how designs are protected, factory visits, NDAs and order problems.',
  heading: 'Working',
  headingAccent: 'with us.',
  entries: [
    {
      id: 'order-steps',
      question: 'How does an order work, step by step?',
      answer:
        'A private label order at RUN APPAREL has four stages and eight steps. At every step you know whose move it is: yours or ours. Nothing goes into bulk production until you sign off a sample.',
      source: 'order guide lede, word for word',
    },
    {
      id: 'artwork',
      question: 'Who owns the artwork I send?',
      answer:
        'You do. Tech packs, artwork and samples you send us remain your property. We use them only to quote and to manufacture for you.',
      source: 'order guide, word for word',
    },
    {
      id: 'protect-designs',
      question: 'How do you protect my designs?',
      answer:
        'Only the team working on your order sees your files. Your patterns and artwork are never made for anyone else. We keep your patterns and samples for your next order.',
      source: 'owner (F12, 2026-10-07)',
    },
    {
      id: 'factory-visit',
      question: 'Can I visit the factory?',
      answer:
        'Yes. Email us to arrange a visit. If you cannot travel, we can show you the factory on a video call.',
      source: 'owner (F13, 2026-10-07)',
    },
    {
      id: 'reply-time',
      question: 'How quickly do you reply?',
      answer: 'Within 24 hours.',
      source: 'the reply promise (replyPromise.test.ts)',
    },
    {
      id: 'nda',
      question: 'Will you sign an NDA?',
      answer: 'Yes. We sign a buyer’s NDA, and we have our own if you need one.',
      source: 'owner (F14, 2026-10-07)',
    },
    {
      id: 'order-problem',
      question: 'What happens if there is a problem with my order?',
      answer: `Tell us within ${OWNER_FIGURES.reportProblemDays} days of delivery, with photos. Depending on the problem, we remake the pieces or give you a credit.`,
      source: 'owner (F15, 2026-10-07)',
    },
  ],
}

/**
 * Which buyer guides each topic sends a reader on to (D5's "Related guides"), and so which topic
 * each guide's "Answers" points back at (Task 3.4). One table, read both ways, so a guide and its
 * topic cannot disagree. The plan's split (D5): the order guide and the 3D guide answer to
 * "Working with us", listed first so their "Answers" link goes there; the minimum guide to orders
 * and samples.
 */
export const FAQ_GUIDES: Readonly<Record<string, readonly string[]>> = {
  '/faq/working-with-us': [
    '/guides/how-a-private-label-order-works',
    '/guides/3d-garment-reference',
  ],
  '/faq/orders-and-samples': [
    '/guides/minimum-order-and-samples',
    '/guides/how-a-private-label-order-works',
  ],
  '/faq/quality-and-certifications': ['/guides/how-a-private-label-order-works'],
  '/faq/shipping-and-importing': [
    '/guides/shipping-and-import-duties',
    '/guides/private-label-packaging',
  ],
  '/faq/fabrics-and-printing': [
    '/guides/sportswear-fabrics-and-weights',
    '/guides/garment-printing-methods',
  ],
}

/** The first topic that names a guide: where that guide's "Answers" link goes. */
export function faqTopicForGuide(guidePath: string): string | undefined {
  return Object.keys(FAQ_GUIDES).find((topic) => FAQ_GUIDES[topic]?.includes(guidePath))
}

/** The topic pages, in the hub's order. */
export const FAQ_TOPICS: readonly FaqTopic[] = [ORDERS, QUALITY, SHIPPING, FABRICS, WORKING]

/** Every address the FAQ answers on: the hub, then each topic. */
export const FAQ_PATHS: readonly string[] = [
  FAQ_INDEX.path,
  ...FAQ_TOPICS.map((topic) => topic.path),
]

/** The topic at an address. Throws on one `FAQ_TOPICS` does not hold: a typo, caught at build. */
export function faqTopicAt(path: string): FaqTopic {
  const topic = FAQ_TOPICS.find((entry) => entry.path === path)
  if (!topic) throw new Error(`faqs.ts has no topic at ${path}`)
  return topic
}

/** An entry anywhere in the FAQ, with the topic it lives on (the hub's "most asked"). */
export function faqEntryById(id: string): { topic: FaqTopic; entry: FaqEntry } {
  for (const topic of FAQ_TOPICS) {
    const entry = topic.entries.find((candidate) => candidate.id === id)
    if (entry) return { topic, entry }
  }
  throw new Error(`faqs.ts has no entry "${id}"`)
}

/** The words a reader sees for one entry, in order: what the question data must equal. */
export function faqVisibleAnswer(entry: FaqEntry): string {
  return entry.detail ? `${entry.answer} ${entry.detail}` : entry.answer
}
