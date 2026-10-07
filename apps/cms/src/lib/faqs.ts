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
 * the rest need the owner's answers (OWNER-FACTS F1–F15); none is written until they arrive. A
 * topic publishes only with five questions or more, which is why "Working with us" (four
 * answerable today) is not a page yet.
 *
 * ⚠️ GOOGLE NO LONGER SHOWS FAQ RICH RESULTS (its FAQPage page, read 2026-10-07: restricted to
 * government and health sites in 2023, not shown from 7 May 2026). The question data stays for
 * the reason `faqJsonLd` gives: answer engines assemble answers from that shape, and the data is
 * the visible page, word for word.
 */

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
   * The hub's "five we hear most", as anchors on the topic pages, in D5's order (O1, O2, S6, Q1).
   * D5's fifth, "Who owns the artwork I send?", lives on "Working with us", which waits for the
   * owner's answers; the bulk lead time stands in until it is a page (shown to the owner).
   */
  mostAsked: ['minimum-order', 'sample-time', 'countries', 'certifications', 'lead-time'] as const,
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
      answer: 'Yes. The sample fee is credited back against your bulk order.',
      source: 'minimum-order guide',
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
      source: 'ORDER_PHASES step 6',
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
  ],
}

/**
 * Which buyer guides each topic sends a reader on to (D5's "Related guides"), and so which topic
 * each guide's "Answers" points back at (Task 3.4). One table, read both ways, so a guide and its
 * topic cannot disagree. The 3D guide answers to orders and samples until "Working with us" exists.
 */
export const FAQ_GUIDES: Readonly<Record<string, readonly string[]>> = {
  '/faq/orders-and-samples': [
    '/guides/how-a-private-label-order-works',
    '/guides/minimum-order-and-samples',
    '/guides/3d-garment-reference',
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

/** The topic pages, in the hub's order. "Working with us" joins with its fifth answer. */
export const FAQ_TOPICS: readonly FaqTopic[] = [ORDERS, QUALITY, SHIPPING, FABRICS]

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
