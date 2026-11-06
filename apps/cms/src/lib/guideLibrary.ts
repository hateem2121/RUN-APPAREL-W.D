import { CUTTING_LINES, FACTS, PRECISION_MACHINES } from './companyFacts'
import type { Guide } from './guides'

/**
 * The buyer library (the owner's /be-ambitious plan of 2026-11-05; every word approved by him on
 * 2026-11-06, "All approved as written"). The new guides of waves 2 to 12, each drafted from its
 * research ledger, fact-checked against its sources, revised, and approved; the drafts and their
 * checks are private (`.superpowers/waves-2026-11-05/`, never committed).
 *
 * ⚠️ SPREAD AT THE END OF `GUIDES` (guides.ts): everything that holds the guides there (the route
 * folders, `GUIDE_PAGE_SOURCES`, the sitemap, llms.txt, bylines, `READ_NEXT`) holds these too, and
 * `guides.test.ts` checks them all.
 *
 * ⚠️ THE NUMBERS THE SITE ALREADY STATES ARE READ FROM ITS CONSTANTS, as in guides.ts. Every other
 * figure is a published standard range or a source's own figure, never one measured on our samples
 * (the owner's rule, 2026-11-05: "Standard ranges only").
 *
 * Three guides wait for facts from the owner's team (the inspection and testing guides, and the
 * report of what buyers asked). Bullets that point at them are added back when each one is
 * published, as the tech pack guide's three were when it joined with its download form (C1, the
 * last entry here, 2026-11-06).
 */
const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

const MINIMUM = fact('Minimum')
/** "three", for a sentence that spells the count (`CUTTING_LINES`, companyFacts.ts). */
const CUTTING_LINES_WORD =
  ['zero', 'one', 'two', 'three', 'four', 'five'][Number(CUTTING_LINES.value)] ??
  CUTTING_LINES.value

export const LIBRARY_GUIDES: readonly Guide[] = [
  // Wave 3, C8: signed by the merchandiser (owner, 2026-11-06).
  {
    path: '/guides/how-to-vet-a-clothing-manufacturer',
    title: 'How to Vet a Clothing Manufacturer',
    description:
      'Check a clothing factory before you pay: its company record, bank account, EU origin papers and certificates, where to verify each, and forced-labor rules.',
    heading: 'How to vet a clothing manufacturer,',
    headingAccent: 'before you pay.',
    lede: 'Before you pay a deposit, check the factory’s papers where they were issued: its company record, its bank account and each certificate it shows. This guide says where to look, using the regulators’ and the schemes’ own pages, and ends with what we can give you.',
    sections: [
      {
        heading: 'What to ask a factory for before you order',
        blocks: [
          {
            kind: 'text',
            text: 'Ask for the company’s registration, its tax status, its bank details, its export registration, and each certificate or audit with the holder’s name, number, scope and dates. Then check each one at its source, as ISO and Textile Exchange both advise for certificates. As amfori puts it, an audit is a snapshot of one point in time.',
          },
          {
            kind: 'table',
            caption: 'What to ask for, and where to check it',
            columns: ['Ask for', 'What it shows', 'Where to check it'],
            rows: [
              ['The company’s CUIN', 'That the company exists', 'The SECP’s online record'],
              ['Its tax number (NTN)', 'Its tax status', 'The FBR’s Active Taxpayer List'],
              ['Its bank details', 'Whose account you pay', 'Its bank’s letter'],
              ['Its REX number', 'That it can make out EU origin statements', 'The EU’s REX check'],
              ['Each certificate', 'What was checked, and where', 'The scheme’s own database'],
              ['Each social audit', 'What an auditor saw', 'The scheme’s own platform'],
              ['The factory address', 'Where your order is made', 'A visit or a video call'],
            ],
          },
          {
            kind: 'text',
            text: 'Ask, too, whether you are dealing with the factory or an agent, who owns the buildings, and the date and type of the latest social audit. For the questions on minimums and samples, see "What to ask any factory" in our guide to Pakistan, China and Türkiye.',
            links: [
              {
                phrase: 'our guide to Pakistan, China and Türkiye',
                href: '/guides/pakistan-vs-china-vs-turkey',
              },
            ],
          },
        ],
      },
      {
        heading: 'How to check that a company in Pakistan is registered',
        blocks: [
          {
            kind: 'text',
            text: 'Ask for the company’s CUIN, its registration number with the Securities and Exchange Commission of Pakistan (SECP). The SECP’s online record for that number shows the registered name, the date of incorporation, the registration office and whether the company is active. Pakistan’s Federal Board of Revenue (FBR) shows whether it is an active taxpayer.',
          },
          {
            kind: 'list',
            items: [
              'The record sits on the SECP’s eServices site, eservices.secp.gov.pk. Ask the factory for the link to its record, and check that the link opens there.',
              'The SECP’s name search is a different tool, for checking whether a name is available.',
              'Anyone can check the FBR’s list of active taxpayers online, by text message with the company’s seven-digit NTN, or by downloading the list.',
              'For a company in another country, use that country’s official register. In the UK, Companies House gives a company’s registered address and date of incorporation for free.',
              'Then compare the name on the record with the name on the invoice and on the bank account.',
            ],
          },
        ],
      },
      {
        heading: 'How to check that the bank account is the company’s',
        blocks: [
          {
            kind: 'text',
            text: 'The account should be in the company’s registered name. If an email changes the bank details, check by phone on a number you already had, never one in that email. Ask the factory for a letter from its bank that names the account holder. If a payment may be fraud, call your bank on its official number.',
          },
          {
            kind: 'list',
            items: [
              'The FBI’s Internet Crime Complaint Center, in its 2024 notice, advises a second channel to check any request to change account details.',
              'How to pay us, and our own rule on changed bank details, are in the order guide.',
            ],
            links: [{ phrase: 'the order guide', href: '/guides/how-a-private-label-order-works' }],
          },
        ],
      },
      {
        heading: 'How to check an exporter’s EU origin papers',
        blocks: [
          {
            kind: 'text',
            text: 'Garments from Pakistan enter the EU duty free under its GSP+ scheme when the exporter gives a statement on origin; our country guide has the detail. For a shipment worth more than €6,000, the exporter must be registered in the EU’s REX system, and anyone can check that a REX number is valid.',
            links: [{ phrase: 'our country guide', href: '/guides/pakistan-vs-china-vs-turkey' }],
          },
          {
            kind: 'list',
            items: [
              'REX, the EU’s Registered Exporter system, covers exports to the EU that use its GSP preferences.',
              'Below €6,000, the exporter can make out the statement without registering.',
              'Ask for the REX number and check it on the European Commission’s REX page.',
              'The EU’s renewed scheme from 1 January 2027 is covered in our country guide.',
            ],
          },
          { kind: 'legal', checked: '5 November 2026' },
        ],
      },
      {
        heading: 'What each certificate or audit checks, and how to verify it',
        blocks: [
          {
            kind: 'text',
            text: 'Certificates are issued by certification bodies; ISO, which writes the standards, issues none. An audit such as amfori BSCI grades a site and issues no certificate. For each one, check the holder’s name, the site’s address, the scope and the dates, then look it up in the scheme’s own system.',
          },
          {
            kind: 'table',
            caption: 'The schemes side by side',
            columns: ['Scheme', 'What it checks', 'How to verify it'],
            rows: [
              [
                'ISO 9001',
                'A company’s quality management: the way it plans its work and keeps improving it',
                'Search IAF CertSearch, or ask the body that issued the certificate. Accreditation is not compulsory, and a certification body without it may still be reputable.',
              ],
              [
                'OEKO-TEX STANDARD 100',
                'Textiles tested for harmful substances, in four product classes',
                'Enter the label number in OEKO-TEX’s Label Check. Each certificate is issued for one year.',
              ],
              [
                'GRS (Global Recycled Standard)',
                'Recycled content, tracked through each stage of the supply chain',
                'Find the company’s scope certificate on Textile Exchange’s public list, and check a transaction certificate issued after 1 October 2022 with its "Authenticate a Transaction" tool. Textile Exchange says the surest check is the certification body that issued it.',
              ],
              [
                'amfori BSCI',
                'Conditions for workers at a site, across 13 performance areas that include no child labor and no forced labor',
                'The audit ends in a grade from A to E. Full reports are open only to amfori members and the audited supplier, on amfori’s platform. A grade below B means a follow-up audit.',
              ],
              [
                'Sedex and SMETA',
                'SMETA is Sedex’s social audit, made on a site visit. Every audit covers labor standards and health and safety; a 4-Pillar audit adds the environment and business ethics',
                'Ask the site to share its audit with you on the Sedex platform. A site must be a Sedex member to upload and share one.',
              ],
              [
                'WRAP',
                'A factory’s labor practices; forced labor is a zero-tolerance item',
                'Enter the facility’s WRAP ID in WRAP’s online check, or find it on WRAP’s world map. A certification lasts one year.',
              ],
              [
                'SA8000',
                'Decent work, based on ILO conventions and national laws, from the protection of children and young workers to health and safety. The current version is SA8000:2026.',
                'Search SAI’s SA8000 list, which shows current and past certifications. Stakeholders recognize only certificates from audit firms validated by SAAS, SAI’s accreditation service.',
              ],
            ],
          },
          { kind: 'text', text: 'Look again if:' },
          {
            kind: 'list',
            items: [
              'the holder is a different company from the one you are buying from;',
              'the scope leaves out your product, or the site that makes it;',
              'the dates have run out: OEKO-TEX STANDARD 100 and WRAP run one year at a time.',
            ],
          },
        ],
      },
      {
        heading: 'Which forced-labor rules apply to your order',
        blocks: [
          {
            kind: 'text',
            text: 'The forced-labor laws of the US, the EU and Canada, and the US duty tied to them, are set out in our compliance guide.',
            links: [
              { phrase: 'our compliance guide', href: '/guides/sportswear-compliance-by-market' },
            ],
          },
          {
            kind: 'list',
            items: [
              'How companies check. The OECD’s due diligence guidance for the garment and footwear sector, from 2018, sets out how companies can check their supply chains. The International Labour Organization’s indicators of forced labor, revised in 2025, help spot it in practice. The forced-labor page of U.S. Customs and Border Protection (CBP) explains its enforcement.',
            ],
          },
          { kind: 'legal', checked: '5 November 2026' },
        ],
      },
      {
        heading: 'What the US Labor Department’s list says about Pakistan',
        blocks: [
          {
            kind: 'text',
            text: 'The US Department of Labor lists goods it has reason to believe are made with child labor or forced labor, with their source countries. As of 5 September 2024 it names 204 goods from 82 countries and areas. Pakistan has 17 entries, among them garments and textiles for child labor and cotton for forced labor.',
          },
          {
            kind: 'list',
            items: [
              'Soccer balls are listed for India only, not for Pakistan.',
              'The Department calls the list a resource for companies that carry out risk assessments.',
              'If you buy any of these goods from Pakistan, use the checks in this guide, and ask how the supplier keeps child labor and forced labor out of its own work and its supply chain.',
              'Our labor-rights policy is public, including how we check each new hire’s age.',
            ],
          },
          { kind: 'legal', checked: '5 November 2026' },
        ],
      },
      {
        heading: 'Checking the order before it ships',
        blocks: [
          {
            kind: 'text',
            text: 'Yes. An inspection company you hire can check the goods at our works before they leave. You pay the inspection company, and we give your inspector access at no charge. ISO 2859-1 sets out sampling by acceptance quality limit (AQL), and its 2026 edition replaces the 1999 one.',
          },
          {
            kind: 'list',
            items: ['The order guide describes the checks we make ourselves before shipping.'],
            links: [{ phrase: 'The order guide', href: '/guides/how-a-private-label-order-works' }],
          },
        ],
      },
      {
        heading: 'Checking a ball supplier’s FIFA claims',
        blocks: [
          {
            kind: 'text',
            text: 'FIFA’s Resource Hub is the public database of the FIFA Quality Programme, and it lists every FIFA-licensed provider. If a supplier says its balls carry a FIFA quality mark, check that the provider is listed there before relying on it. A ball tested to FIFA’s limits is a different claim from a ball that carries a mark.',
          },
          {
            kind: 'list',
            items: [
              'Our soccer-ball guide explains the three FIFA marks and what each one tests, and says who monitors our ball stitching.',
            ],
            links: [{ phrase: 'Our soccer-ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
        ],
      },
      {
        heading: 'What we can show you',
        stage: 'whole-stitching',
        blocks: [
          {
            kind: 'text',
            text: 'Here is what you can ask us for. We hold no certificate or audit in our own name: our sister company, DURUS INDUSTRIES, and our fabric and trim suppliers hold them, and our quality and certifications answers name each holder. Our registration, tax and export numbers, and a letter from our bank, are given on request.',
          },
          {
            kind: 'list',
            items: [
              'Who makes your order. RUN APPAREL and DURUS INDUSTRIES are sister companies. The same family is behind both. Each one is its own company. We make our clothes in the DURUS INDUSTRIES buildings in Sialkot.',
              'Company records. Each company is registered with the SECP. Ask us for our registration number and our tax number (NTN).',
              'Exporter. RUN APPAREL is the exporter on our shipments. Ask us for our REX number.',
              'Bank. Our bank can confirm our account name and IBAN in a letter.',
              'Social audit. DURUS INDUSTRIES can share its SMETA audit with you through Sedex, with the audit’s date and type.',
              'Certificates and test reports. Our FAQ on certificates says which copies and lab reports we can send.',
              'Cotton and fabric origin. On request, for each order, we give the papers you need to show where its cotton and fabric come from.',
              'References. We give buyer references, with that customer’s written okay.',
              'A visit. Come and see the stitching floor and the rest of the works, or ask us for a video call.',
            ],
          },
          { kind: 'text', text: 'activewear brand.' },
        ],
      },
    ],
    sources: [
      {
        name: 'European Commission, Transition Pathways: Forced labour regulation',
        url: 'https://transition-pathways.europa.eu/retail/legislation/forced-labour-regulation-0',
        date: '2025-11-24',
        kind: 'read',
      },
      {
        name: 'European Parliament, Legislative Observatory: summary of Regulation (EU) 2024/3015, procedure 2022/0269(COD)',
        url: 'https://oeil.europarl.europa.eu/oeil/en/document-summary?id=1799238',
        date: '2024-12-12',
        kind: 'read',
      },
      {
        name: 'International Labour Organization: ILO indicators of forced labour, 2025 revised edition',
        url: 'https://www.ilo.org/publications/ilo-indicators-forced-labour-1',
        date: '2025-11-18',
        kind: 'read',
      },
      {
        name: 'U.S. Department of Homeland Security: UFLPA Frequently Asked Questions',
        url: 'https://www.dhs.gov/uflpa-frequently-asked-questions',
        date: '2025-09-16',
        kind: 'read',
      },
      {
        name: 'U.S. Customs and Border Protection: Frequently Asked Questions, UFLPA enforcement',
        url: 'https://www.cbp.gov/trade/forced-labor/faqs-uflpa-enforcement',
        date: '2025-09-09',
        kind: 'read',
      },
      {
        name: 'U.S. Customs and Border Protection: Forced Labor',
        url: 'https://www.cbp.gov/trade/forced-labor',
        date: '2026-09-29',
        kind: 'read',
      },
      {
        name: 'U.S. Customs and Border Protection: Withhold Release Orders and Findings dashboard',
        url: 'https://www.cbp.gov/newsroom/stats/trade/withhold-release-orders-findings-dashboard',
        date: '2026-11-04',
        kind: 'read',
      },
      {
        name: 'U.S. Department of Labor, ILAB: List of Goods Produced by Child Labor or Forced Labor (2024 edition, as of 5 September 2024)',
        url: 'https://www.dol.gov/agencies/ilab/reports/child-labor/list-of-goods',
        date: '2024-09-05',
        kind: 'read',
      },
      {
        name: 'Office of the U.S. Trade Representative: USTR takes action in forced labor Section 301 investigations',
        url: 'https://ustr.gov/about/policy-offices/press-office/press-releases/2026/july/ustr-takes-action-forced-labor-section-301-investigations',
        date: '2026-07-23',
        kind: 'read',
      },
      {
        name: 'U.S. Customs and Border Protection, CSMS 69326983: Section 301 Forced Labor Import Duties',
        url: 'https://content.govdelivery.com/accounts/USDHSCBP/bulletins/421d887',
        date: '2026-07-23',
        kind: 'read',
      },
      {
        name: 'OECD: Due Diligence Guidance for Responsible Supply Chains in the Garment and Footwear Sector',
        url: 'https://www.oecd.org/en/publications/oecd-due-diligence-guidance-for-responsible-supply-chains-in-the-garment-and-footwear-sector_9789264290587-en.html',
        date: '2018-03-07',
        kind: 'read',
      },
      {
        name: 'Securities and Exchange Commission of Pakistan: eServices',
        url: 'https://eservices.secp.gov.pk/eServices/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Securities and Exchange Commission of Pakistan: eServices name search',
        url: 'https://eservices.secp.gov.pk/eServices/NameSearch.jsp',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Federal Board of Revenue, Pakistan: Active Taxpayer List (Income Tax)',
        url: 'https://www.fbr.gov.pk/categ/active-taxpayer-list-income-tax/51147/30859/71169',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'GOV.UK: Get information about a company',
        url: 'https://www.gov.uk/get-information-about-a-company',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'European Commission, Taxation and Customs Union: Registered Exporter system (REX)',
        url: 'https://taxation-customs.ec.europa.eu/online-services/online-services-and-databases-customs/registered-exporter-rex-system_en',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'European Commission, Access2Markets: REX system',
        url: 'https://trade.ec.europa.eu/access-to-markets/en/content/rex-system',
        date: '2026-10-14',
        kind: 'read',
      },
      {
        name: 'FBI, Internet Crime Complaint Center: Public Service Announcement I-050417-PSA',
        url: 'https://www.ic3.gov/PSA/2017/PSA170504',
        date: '2017-05-04',
        kind: 'read',
      },
      {
        name: 'FBI, Internet Crime Complaint Center: Business Email Compromise: The $55 Billion Scam, I-091124-PSA',
        url: 'https://www.ic3.gov/PSA/2024/PSA240911',
        date: '2024-09-11',
        kind: 'read',
      },
      {
        name: 'UK National Cyber Security Centre: Business payment fraud',
        url: 'https://www.ncsc.gov.uk/section/respond-recover/business-payment-fraud',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO: Certification',
        url: 'https://www.iso.org/certification.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO: ISO 9001:2026, Quality management systems, Requirements',
        url: 'https://www.iso.org/standard/9001',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'OEKO-TEX: STANDARD 100',
        url: 'https://www.oeko-tex.com/en/our-standards/oeko-tex-standard-100',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'OEKO-TEX: Label Check',
        url: 'https://www.oeko-tex.com/en/label-check',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Textile Exchange: Certificates',
        url: 'https://textileexchange.org/certificates/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Textile Exchange: How do I verify that a scope certificate or transaction certificate is valid?',
        url: 'https://textileexchange.org/faq/how-do-i-verify-that-a-scope-certification-sc-or-transaction-certificate-tc-is-valid-2/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Textile Exchange: What is the Global Recycled Standard (GRS)?',
        url: 'https://textileexchange.org/faq/what-is-the-global-recycled-standard-grs/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'amfori: amfori BSCI help topic',
        url: 'https://www.amfori.org/help-topic/amfori-bsci/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Sedex: SMETA audit',
        url: 'https://www.sedex.com/solutions/smeta-audit/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'WRAP: Certification',
        url: 'https://wrapcompliance.org/certification/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'WRAP: Verify a facility',
        url: 'https://www.mywrapcompliance.org/verify/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'WRAP: Certification FAQ',
        url: 'https://wrapcompliance.org/en/certification/faq/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Social Accountability International: SA8000',
        url: 'https://sa-intl.org/programs/sa8000/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Social Accountability International: SA8000 search',
        url: 'https://sa-intl.org/sa8000-search/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO: ISO 2859-1, Edition 3',
        url: 'https://www.iso.org/standard/2859-1',
        date: '2026-01-01',
        kind: 'read',
      },
      {
        name: 'FIFA: Resource Hub',
        url: 'https://inside.fifa.com/innovation/resource-hub',
        date: '2026-11-05',
        kind: 'read',
      },
    ],
  },
  // Wave 4, B3: signed by the merchandiser (owner, 2026-11-06).
  {
    path: '/guides/clothing-labels',
    title: 'Clothing Label Requirements and Label Types',
    description:
      'The rules for a clothing label in the US, EU, UK, Canada and Australia, plus woven, printed and tagless labels, hang tags, care symbols and QR codes.',
    heading: 'Clothing labels and the law,',
    headingAccent: 'market by market.',
    lede: 'A clothing label tells your customer what a garment is made of and how to look after it, and it has to meet the law of the country where it is sold. This guide sets out what five markets ask for, the labels we supply, and what a QR code can add.',
    sections: [
      {
        heading: 'What a clothing label must say',
        blocks: [
          {
            kind: 'text',
            text: 'It depends on where the garment is sold, because each market keeps its own list. The US, the EU, the UK and Canada all ask for the fiber content. Care instructions are compulsory in the US and Australia, and voluntary in Canada. Each market also sets the language, as the table below shows.',
          },
          {
            kind: 'table',
            caption: 'What the label must carry, in five markets',
            columns: ['Market', 'On the label', 'Language'],
            rows: [
              ['United States', 'Fiber content, origin, a name or RN, care', 'English'],
              [
                'European Union',
                'Fiber content, largest share first',
                'Usually each country’s official language',
              ],
              ['United Kingdom', 'Fiber content', 'English'],
              [
                'Canada',
                'Fiber content; the dealer’s identity',
                'English and French for fiber content, unless only one is used',
              ],
              [
                'Australia',
                'Care on most clothing; origin on imported clothing',
                'English for the origin; care in English words or ISO symbols',
              ],
            ],
          },
          {
            kind: 'text',
            text: 'This guide does not cover the EU countries’ own rules on care or origin labels, or whether Australia asks for fiber content.',
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'United States: fiber, origin and the RN',
        blocks: [
          {
            kind: 'text',
            text: 'A garment sold in the US carries the generic name of each fiber with its percentage by weight, the country where it was made, and a business name or an RN, the registration number the FTC issues. All of it must be in English, and it may share one label with the care instructions.',
          },
          {
            kind: 'list',
            items: [
              'Fiber names. A fiber under 5% of the weight is listed as "other fiber", unless it has a clear function; the rule’s own example is 4% spandex. The FTC also accepts the international names elastane, for spandex, and viscose, for the most common form of rayon. The stated shares may be off by up to 3% of the total fiber weight.',
              'Bamboo. Rayon made from bamboo may be labeled "rayon made from bamboo" or "viscose made from bamboo". A textile may be called bamboo only if it is made directly from actual bamboo fiber.',
              'Wool. Anything that contains wool, or is said to, also comes under the Wool Act.',
              'Where the origin goes. On a garment with a neck, the origin label sits at the inside center of the neck, midway between the shoulder seams, or close beside another label placed there. The country is always named on the front of the label. Use the country’s English name. Catalog and online listings must also say whether the garment was made in the USA, imported, or both.',
              'Customs marking. Customs law separately asks for every import, unless an exception applies, to be marked with the country of origin, in a conspicuous place and as legibly and permanently as the article allows. The mark must survive normal distribution and store handling.',
              'The RN. The FTC issues RNs only to businesses in the US. A garment made in Pakistan for the US market therefore carries a US company’s RN, or a business name instead.',
              'How long it stays on. The fiber label must stay on until the garment reaches the consumer. The care label’s longer rule is in the next section.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'United States: the care label',
        blocks: [
          {
            kind: 'text',
            text: 'The FTC’s Care Labeling Rule covers makers and importers of clothing. Their care label must stay attached and legible for the garment’s useful life. It gives a washing or a dry-cleaning instruction, and any warnings in plain words such as "Do not".',
          },
          {
            kind: 'list',
            items: [
              'Washing. A washing instruction says hand or machine, and gives a water temperature unless hot water is safe.',
              'The evidence. Before sale, the maker or importer must have a reasonable basis for the instructions. A successful test of the garment, or of a fair sample of it, counts. ASTM D3938 is a guide for working out and confirming the care instructions for apparel.',
              'What the rule leaves out. Footwear, gloves and hats.',
              'Symbols. The rule lets symbols from ASTM D5489-96c stand in for the words. Care symbols are explained further down this page.',
              'Where the rule stands. Its text was last amended in 2004. The FTC voted 5 to 0 in July 2021 to keep it, and closed its review on 8 December 2023. A March 2025 petition asks the FTC to allow digital care labels; as of 6 November 2026 the Federal Register shows no decision on it.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Labels on children’s clothing',
        blocks: [
          {
            kind: 'text',
            text: 'We make children’s clothing on request only. In the US, a product designed mainly for children aged 12 or under needs a tracking label. It goes on the product and its packaging, permanently where practicable, and names the maker or private labeler, the place and date of production, and the batch or run.',
          },
          {
            kind: 'list',
            items: ['Children’s drawstrings follow separate rules, set out in our trims guide.'],
            links: [{ phrase: 'our trims guide', href: '/guides/apparel-trims' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'European Union',
        blocks: [
          {
            kind: 'text',
            text: 'In the EU, a garment shows each fiber’s name and percentage by weight, largest first, usually in the official language or languages of each country where it goes on sale. The label must be durable, easy to read, visible and securely attached. Buyers must be able to see the fiber content before they buy, online too.',
          },
          {
            kind: 'list',
            items: [
              'Fiber names. The EU’s list includes "polyamide or nylon" and "elastane". The stated shares may differ from a lab’s results by up to 3%.',
              'Small shares. One fiber up to 5% of the total weight, or several up to 15% together, may be named "other fibres" with their total percentage, where they cannot easily be stated at manufacture.',
              'Marking. The law also allows the details to go straight onto the garment, for example by sewing or printing. For a separate label, the European Commission’s business guide gives "sewn in" as an example of a firm attachment.',
              'Animal parts. A garment with leather or other animal parts carries the words "Contains non-textile parts of animal origin".',
              'Who counts as the maker. A brand that sells under its own name or trademark counts as the manufacturer.',
              'Product safety. From 13 December 2024, the General Product Safety Regulation asks for an identifying number, such as a batch or serial number, on each product. The maker’s name and its postal and email addresses go on the product, its packaging or a document with it. A business based in the EU must be responsible for the product there.',
              'What may change. The EU’s textile labeling law covers fiber composition only. The European Commission’s page on it planned a proposal to revise the law by the second quarter of 2026; ask your adviser whether it has been made.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'United Kingdom',
        blocks: [
          {
            kind: 'text',
            text: 'In England, Scotland and Wales, the label must show the fiber content, including any fur or other animal parts, written in English. The EU’s 2011 textile law still applies there as assimilated law, alongside the UK’s own 2012 regulations. The UK’s published copy of that law lists no outstanding UK changes to it.',
          },
          { kind: 'list', items: ['Northern Ireland is not covered here.'] },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Canada',
        blocks: [
          {
            kind: 'text',
            text: 'Canada asks for the fiber content in English and French, except where only one official language is used, and for the dealer’s identity: a full name and address, or a CA number from the Competition Bureau. Care labels are voluntary there. A label that must be permanent has to stay legible through ten or more cleanings.',
          },
          {
            kind: 'list',
            items: [
              'Tolerance. Generally, a tolerance of 5% is allowed on the stated fiber shares of a blend, and none on a single-fiber fabric.',
              'Care symbols. The care-symbol standard the Bureau’s guide cites, CAN/CGSB-86.1-2003, is listed by the Government of Canada as withdrawn.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Australia',
        blocks: [
          {
            kind: 'text',
            text: 'Australia makes care labels compulsory for most clothing and household textiles. Its 2023 standard, now past its transition periods, offers two routes: the Australian and New Zealand standard, with the wording in English, or the ISO 3758:2012 care symbols. Imported clothing needs a trade description naming its country of origin, in English, attached as permanently as practicable.',
          },
          {
            kind: 'list',
            items: [
              'The two rules. Care labels: the Consumer Goods (Care Labelling) Information Standard 2023, in force from 5 September 2023. Origin: the Commerce (Trade Descriptions) Regulation 2016, whose latest compilation is dated 11 March 2019.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Woven, printed or tagless labels',
        blocks: [
          {
            kind: 'text',
            text: 'We supply woven labels, printed labels and tagless heat-transfer labels, and hang tags as well. Whichever you choose, the label has to last as long as the law asks. A US care label must last for as long as the garment is in use. In Canada, a permanent label must survive at least ten cleanings.',
          },
          {
            kind: 'list',
            items: [
              'Woven. Text and logo are woven into the label’s own threads.',
              'Printed. Text and logo are printed onto a strip of fabric.',
              'Tagless heat-transfer. The label is pressed onto the inside of the garment with heat, so there is no tag to cut out.',
              'Check it on your sample. Wash the sample the way its care label says, and check that the label stays on and stays readable.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Hang tags',
        blocks: [
          {
            kind: 'text',
            text: 'In the US, when the care label cannot be seen at the point of sale, the care instructions must also appear on a hang tag or on the outside of the package. If a hang tag names one fiber of several, it must say clearly that it does not give the full fiber content.',
          },
          {
            kind: 'list',
            items: [
              'Example wording. One of the rule’s own examples is "This tag does not disclose the product’s full fiber content."',
              'Easy-care garments. A garment that even the harshest care cannot harm needs no permanent care label. Instead, the words "wash or dry clean, any normal method" go on a hang tag, on the package or in another place the shopper will see.',
              'Your brand on the tag. Branding, barcodes and markings are agreed as part of your packaging; our packaging guide covers them.',
            ],
            links: [{ phrase: 'our packaging guide', href: '/guides/private-label-packaging' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Size labels',
        blocks: [
          {
            kind: 'text',
            text: 'A size label is your choice: none of the rules in this guide lists size among a label’s required details. ISO 8559-2, Size designation of clothes, sets primary and secondary dimensions for specified types of garments; its newest edition dates from 2025. We grade sizes from your size chart, or from our house chart if you have none.',
          },
          {
            kind: 'list',
            items: ['Size charts and grading are covered in our pattern-making guide.'],
            links: [
              { phrase: 'our pattern-making guide', href: '/guides/sportswear-pattern-making' },
            ],
          },
        ],
      },
      {
        heading: 'Care symbols',
        blocks: [
          {
            kind: 'text',
            text: 'Care symbols cover washing, bleaching, drying and ironing, plus professional dry and wet cleaning, in the international system, ISO 3758, Textiles, care labelling code using symbols. In most countries its five symbols are trademarks held by GINETEX and COFREET. In the US, the FTC’s rule accepts the symbols of ASTM D5489-96c in place of words.',
          },
          {
            kind: 'list',
            items: [
              'Why we show none. GINETEX says the symbols may not be reproduced, issued or used without a special license agreement with it. So this guide explains them in words, and links GINETEX’s own page under Sources.',
              'The editions. ISO 3758:2023, the fourth edition, replaced the 2012 edition. Australia’s 2023 standard still names the 2012 edition.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'QR codes and the Digital Product Passport',
        blocks: [
          {
            kind: 'text',
            text: 'We can put a QR code on your label or hang tag that links to your own page. It adds to the label without replacing it. EU fiber details must be on a durable label or marking, and the 2025 petition for digital US care labels had no published decision when we checked.',
          },
          {
            kind: 'list',
            items: [
              'The EU’s passport. The European Commission plans to adopt the textile rules for a Digital Product Passport in the fourth quarter of 2027, and says the timeline may change.',
              'How a buyer reaches it. Through a data carrier such as a QR code, which must be physically present on the product itself, or on its packaging or accompanying documents.',
              'What it may hold. Details such as fiber composition, repair, recycling and origin, as the final rules decide.',
              'When. Its requirements will normally apply no earlier than 18 months after the textile act enters into force.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Soccer balls: what can be printed on a ball',
        blocks: [
          {
            kind: 'text',
            text: 'We print what you ask for on your balls, and can add the size, "Made in Pakistan" and words for how each ball is built. In official competitions under FIFA, a confederation or a national association, no advertising may appear on the ball beyond the emblems of the competition and its organizer and the maker’s trademark.',
          },
          {
            kind: 'list',
            items: [
              'Size of those marks. The competition’s own rules may limit the size and number of those markings.',
              'FIFA marks on our balls. The right to print a FIFA quality mark comes with a FIFA license agreement. We have made balls carrying a buyer’s licensed FIFA quality mark; the license was the buyer’s.',
              'The number beside the mark. Each licensed ball shows its mark with a unique authorization number. FIFA protects its quality logos by trademark and copyright. How to check a supplier’s FIFA claim is in our guide to vetting a manufacturer.',
              'What the marks test. The three marks, and the tests behind each, are in our soccer ball guide.',
            ],
            links: [
              {
                phrase: 'our guide to vetting a manufacturer',
                href: '/guides/how-to-vet-a-clothing-manufacturer',
              },
              { phrase: 'our soccer ball guide', href: '/guides/how-soccer-balls-are-made' },
            ],
          },
        ],
      },
      {
        heading: 'On our floor',
        blocks: [
          {
            kind: 'text',
            text: 'You can send us your own labels, and we sew or apply them. You can also send the label’s legal wording, or ask us to draft it; either way, the brand or importer stays legally responsible for what it says. Custom labels have no set minimum, just like your other packaging.',
          },
          {
            kind: 'list',
            items: [
              'With your packaging. The packaging guide covers your labels and tags alongside bags and cartons.',
              'Lab reports. We can arrange a lab test report on your garment, at your cost.',
              'Care instructions. Our finished garments are wash-tested for shrinkage, colorfastness to washing and appearance after washing, which helps support the care instructions on your label.',
            ],
            links: [{ phrase: 'The packaging guide', href: '/guides/private-label-packaging' }],
          },
        ],
      },
      {
        heading: 'Before you send your label artwork',
        blocks: [
          {
            kind: 'text',
            text: 'Work through the list below for each market where the garment will be sold. Then send your label artwork with your spec, or have us draft the wording. Labels and tags are quoted along with your garments, and the same merchandiser handles them from start to shipment.',
          },
          {
            kind: 'list',
            items: [
              'The markets you sell in.',
              'Fiber content, with each fiber’s percentage.',
              'Care instructions, and the test behind them.',
              'Country of origin.',
              'Your business name, RN or CA number.',
              'The languages.',
              'Woven, printed or tagless; hang tags; a QR code.',
              'For children’s sizes, tracking labels.',
            ],
          },
          {
            kind: 'text',
            text: 'Send us your label artwork',
            links: [{ phrase: 'Send us your label artwork', href: '/contact' }],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'eCFR: 16 CFR Part 423, Care Labeling of Textile Wearing Apparel',
        url: 'https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-423',
        date: '2026-11-03',
        kind: 'read',
      },
      {
        name: 'Federal Trade Commission: FTC Votes to Reverse Course on Repeal of Fabric Care Labels',
        url: 'https://www.ftc.gov/node/73927',
        date: '2021-07-21',
        kind: 'read',
      },
      {
        name: 'Federal Register: Care Labeling Rule, termination of the review',
        url: 'https://www.federalregister.gov/documents/2023/12/08/2023-26966/care-labeling-rule',
        date: '2023-12-08',
        kind: 'read',
      },
      {
        name: 'Federal Register (govinfo): petition to allow digital labeling of apparel, 90 FR 12693',
        url: 'https://www.govinfo.gov/content/pkg/FR-2025-03-19/html/2025-04295.htm',
        date: '2025-03-19',
        kind: 'read',
      },
      {
        name: 'Federal Register: documents affecting 16 CFR Part 423, newest first',
        url: 'https://www.federalregister.gov/documents/search?conditions%5Bcfr%5D%5Btitle%5D=16&conditions%5Bcfr%5D%5Bpart%5D=423&order=newest',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ASTM International: D3938, guide for care instructions',
        url: 'https://store.astm.org/d3938-18r23.html',
        date: '2023-12-08',
        kind: 'read',
      },
      {
        name: 'eCFR: 16 CFR Part 303, Rules under the Textile Fiber Products Identification Act',
        url: 'https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-303',
        date: '2026-11-03',
        kind: 'read',
      },
      {
        name: 'Federal Trade Commission: Threading Your Way Through the Labeling Requirements Under the Textile and Wool Acts',
        url: 'https://www.ftc.gov/business-guidance/resources/threading-your-way-through-labeling-requirements-under-textile-wool-acts',
        date: '2025-01-01',
        kind: 'read',
      },
      {
        name: 'Federal Trade Commission: bamboo textiles',
        url: 'https://www.ftc.gov/bamboo-textiles',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'U.S. Consumer Product Safety Commission: Tracking Label FAQ',
        url: 'https://www.cpsc.gov/FAQ/Tracking-Label',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'eCFR: 19 CFR Part 134, Country of Origin Marking, 134.11 and 134.41',
        url: 'https://www.ecfr.gov/current/title-19/chapter-I/part-134',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Regulation (EU) No 1007/2011, textile fibre names and labelling (OJ L 272, 18.10.2011)',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011R1007',
        date: '2011-10-18',
        kind: 'read',
      },
      {
        name: 'European Commission, Your Europe: Textile label',
        url: 'https://europa.eu/youreurope/business/product-requirements/labels-markings/textile-label/index_en.htm',
        date: '2026-07-13',
        kind: 'read',
      },
      {
        name: 'European Commission: Review of Regulation (EU) 1007/2011',
        url: 'https://single-market-economy.ec.europa.eu/sectors/textiles-ecosystem/review-regulation-eu-10072011_en',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Regulation (EU) 2023/988, General Product Safety Regulation',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R0988',
        date: '2023-05-10',
        kind: 'read',
      },
      {
        name: 'European Commission: Digital Product Passport, textile apparel',
        url: 'https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/textile-apparel_en',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Regulation (EU) 2024/1781, establishing a framework for the setting of ecodesign requirements for sustainable products',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1781',
        date: '2024-06-28',
        kind: 'read',
      },
      {
        name: 'GOV.UK: Textile labelling',
        url: 'https://www.gov.uk/guidance/textile-labelling',
        date: '2020-12-31',
        kind: 'read',
      },
      {
        name: 'Business Companion (Chartered Trading Standards Institute): Labelling of textiles',
        url: 'https://www.businesscompanion.info/en/quick-guides/goods/labelling-of-textiles',
        date: '2026-07-01',
        kind: 'read',
      },
      {
        name: 'legislation.gov.uk: Regulation (EU) No 1007/2011, contents',
        url: 'https://www.legislation.gov.uk/eur/2011/1007/contents',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'legislation.gov.uk: Regulation (EU) No 1007/2011, Article 16 (UK version)',
        url: 'https://www.legislation.gov.uk/eur/2011/1007/article/16',
        date: '2020-12-31',
        kind: 'read',
      },
      {
        name: 'legislation.gov.uk: The Textile Products (Labelling and Fibre Composition) Regulations 2012',
        url: 'https://www.legislation.gov.uk/uksi/2012/1102/contents',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Competition Bureau Canada: Guide to the Textile Labelling and Advertising Regulations',
        url: 'https://competition-bureau.canada.ca/en/node/63',
        date: '2022-01-19',
        kind: 'read',
      },
      {
        name: 'Government of Canada Publications: CAN/CGSB-86.1-2003, Care labelling of textiles',
        url: 'https://publications.gc.ca/site/eng/9.839941/publication.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Federal Register of Legislation (Australia): Consumer Goods (Care Labelling) Information Standard 2023',
        url: 'https://legislation.gov.au/F2023L01187/asmade/2023-09-04/text/original/epub/OEBPS/document_1/document_1.html',
        date: '2023-09-04',
        kind: 'read',
      },
      {
        name: 'Federal Register of Legislation (Australia): Commerce (Trade Descriptions) Regulation 2016, compilation of 11 March 2019',
        url: 'https://www.legislation.gov.au/F2016L01907/2019-03-11/2019-03-11/text/original/epub/OEBPS/document_1/document_1.html',
        date: '2019-03-11',
        kind: 'read',
      },
      {
        name: 'Federal Register of Legislation (Australia): Commerce (Trade Descriptions) Regulation 2016, versions',
        url: 'https://www.legislation.gov.au/F2016L01907/latest/versions',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'GINETEX: Labelling (the care symbols and their owner)',
        url: 'https://www.ginetex.net/en/labelling/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Estonian Centre for Standardisation: ISO 3758:2023',
        url: 'https://www.evs.ee/en/iso-3758-2023',
        date: '2023-12-06',
        kind: 'read',
      },
      {
        name: 'Estonian Centre for Standardisation: EN ISO 8559-2',
        url: 'https://www.evs.ee/en/evs-en-iso-8559-2-2020',
        date: '2025-10-01',
        kind: 'read',
      },
      {
        name: 'IFAB, Laws of the Game, Law 2: The Ball',
        url: 'https://www.theifab.com/laws/latest/the-ball/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'FIFA: How to become a football licensee',
        url: 'https://inside.fifa.com/technical/football-technology/standards/footballs/how-to-become-a-football-licensee',
        date: '2026-02-10',
        kind: 'read',
      },
    ],
  },
  // Wave 4, B2: signed by the production (owner, 2026-11-06).
  {
    path: '/guides/apparel-trims',
    title: 'Apparel Trims: Zippers, Snaps and Drawcords',
    description:
      'Coil, molded and metal zippers and their sizes, snaps, drawcords, elastics, reflective and seam tapes, the tests to ask for, and the safety rules.',
    heading: 'Zippers, cords and other trims,',
    headingAccent: 'part by part.',
    lede: 'Trims are the zips, snaps, cords, elastics and tapes added to a garment’s main fabric, and its labels too. This guide says what each one is, which tests to ask for, the safety rules some of them carry, and what we fit.',
    sections: [
      {
        heading: 'What counts as a trim',
        blocks: [
          {
            kind: 'text',
            text: 'The FTC’s rules give a working list. Their trimmings include labels, waistbands and bindings, and elastic added in small amounts to hold or reinforce the garment. ASTM’s terms for fasteners add the closures: zippers, which it calls slide fasteners, buttons, snaps and hook-and-loop fasteners. Labels have their own guide; this one covers the rest.',
          },
          {
            kind: 'list',
            items: [
              'Labels. For fiber, care and origin labels, hang tags and QR codes, see Clothing labels.',
            ],
          },
        ],
      },
      {
        heading: 'Coil, molded or metal zippers',
        blocks: [
          {
            kind: 'text',
            text: 'Zippers are told apart by what their teeth are made of: metal, molded plastic, or a continuous plastic filament. The US tariff splits them the same way, and lists the slider, with or without its pull, as a separate part. We fit whichever type your spec names: coil, molded or metal.',
          },
          {
            kind: 'list',
            items: [
              'The parts to name. ASTM’s zipper tests use these names: the chain and its elements, the slider and its lock, the stops and, on a zipper that comes fully apart, the separable units.',
              'Pullers. We make custom zipper pullers in rubber or metal.',
              'Seen in 3D. Two of our reference garments, which you can turn in 3D, have zips worth a look: the Terra Active Zip polo’s semi-auto lock zip, which holds when its pull is down, and the Apex Flex Pullover’s invisible zip, set in a seam.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'How zipper sizes are named',
        blocks: [
          {
            kind: 'text',
            text: 'By a size designation. ASTM D3657 sets standard dimensions for each designation, for zippers of every material, and ASTM D2060 is the method for measuring a zipper’s dimensions, its chain width among them. We print no size chart here: the only charts we found were zipper makers’ own, and we never use a maker as a source.',
          },
          {
            kind: 'list',
            items: [
              'A study of width. A 2013 study in the Journal of Textile and Apparel tested five metal zippers of different chain widths for strength.',
              'In your quote. Your quote names the zipper and its size.',
            ],
          },
        ],
      },
      {
        heading: 'How to know a zipper will last',
        blocks: [
          {
            kind: 'text',
            text: 'Ask which tests it has passed. ASTM D2061 covers a zipper’s strength, and ASTM D2062 how it works, including opening, closing and sticking at the stops. Other ASTM methods cover washing and salt-spray corrosion. In Europe, EN 16732 sets performance levels and test methods for zippers.',
          },
          {
            kind: 'list',
            items: [
              'Washing. ASTM D2051 checks whether a zipper’s enamel or other decorative coating lasts through laundering. ASTM D2057 checks whether the zipper changes shade, or stains other fabric, in home washing.',
              'Salt spray. ASTM D2059 tests a zipper’s resistance to corrosion, and whether it still works afterwards.',
              'Matched to the care label. ASTM D3692 is a practice for choosing zippers that suit a garment’s care label, and it says the chosen zipper should be tested in a prototype.',
              'The European standard. Its current edition, EN 16732:2025, is listed as in force from 5 June 2025.',
            ],
          },
        ],
      },
      {
        heading: 'Snaps, eyelets and hook-and-loop',
        blocks: [
          {
            kind: 'text',
            text: 'Ask how hard the fastener is to pull open. ASTM D4846 measures the force needed to open a snap, pulled straight out or sideways, with the snaps attached as their producer specifies. Hook-and-loop fasteners are tested for shear and peel strength. We can make snaps that carry your logo.',
          },
          {
            kind: 'list',
            items: [
              'In the US tariff. Snap fasteners are grouped with press-studs, and hooks, eyes and eyelets of base metal share a line of their own.',
              'Nickel. Rivets and rivet buttons sold in the EU have a nickel limit; see the safety rules below.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Drawcords, toggles, cord locks and aglets',
        blocks: [
          {
            kind: 'text',
            text: 'US safety rules define a drawstring as a non-retractable cord, ribbon or tape that pulls parts of upper outerwear together to close them. A toggle or cord lock holds the cord in place, and an aglet is the tip that stops its end fraying. We make printed drawcords and custom aglets.',
          },
          {
            kind: 'list',
            items: [
              'Seen in 3D. Our garment pages show a hood with a drawcord, and a high hood you tighten with toggles.',
              'Children’s wear. The rules for drawstrings on children’s clothing are in the safety section below.',
            ],
          },
        ],
      },
      {
        heading: 'How elastic is tested',
        blocks: [
          {
            kind: 'text',
            text: 'ASTM D4964 measures the tension and elongation of wide and narrow elastic fabrics: the force it takes to stretch them, and how far they stretch. In the US tariff, narrow woven fabrics with 5% or more elastomeric yarn or rubber thread by weight have their own line.',
          },
          {
            kind: 'list',
            items: [
              'On the fiber label. How elastic shows on a US fiber label is in the section on trims and labels below.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Reflective trims and seam tapes',
        blocks: [
          {
            kind: 'text',
            text: 'We apply both reflective tape and seam-sealing tape in our own works. For reflective trim, ask which standard your design must meet. EN 17353, Enhanced visibility equipment for medium risk situations, leaves high-risk situations to EN ISO 20471, High visibility clothing. ASTM E810 measures how strongly reflective sheeting returns light.',
          },
          {
            kind: 'list',
            items: [
              'Seams on rain wear. Europe’s standard for clothing that protects against rain, EN 343, covered seams as well as fabrics; EN ISO 24232:2025 replaced it on 3 November 2025.',
              'More on both. Taped seams are explained in our glossary, and reflective prints in our printing guide.',
            ],
            links: [{ phrase: 'our printing guide', href: '/guides/garment-printing-methods' }],
          },
        ],
      },
      {
        heading: 'Trims on the fiber and care label',
        blocks: [
          {
            kind: 'text',
            text: 'Mostly, trims are left off the fiber label. US rules exempt them from fiber disclosure, unless decoration or elastic passes a set share of the surface. The EU leaves labels, and trimmings not integral to the product, out of a garment’s fiber composition. US care evidence, though, may cover each part along with the whole garment.',
          },
          {
            kind: 'list',
            items: [
              'Exclusive of elastic. Elastic that forms part of the main fabric, up to 20% of the surface, counts as a trim when the fiber content is followed by "exclusive of elastic".',
              'Exclusive of decoration. Decorative trim or a decorative design up to 15% of the surface, in a fiber other than the main fabric’s, is handled the same way, with "exclusive of decoration".',
              'The test guide. ASTM D3938 provides for evaluating the complete product and its components, so test the trims on a sample garment, through the care your label gives.',
              'The label itself. What a label must say, market by market, is the subject of our labels guide.',
            ],
            links: [{ phrase: 'our labels guide', href: '/guides/clothing-labels' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Safety rules: drawstrings and nickel',
        blocks: [
          {
            kind: 'text',
            text: 'In the US, hood and neck drawstrings on children’s outerwear in sizes 2T to 12 present a strangulation hazard. Upper outerwear for children in sizes 2T to 16 with drawstrings that fall short of ASTM F1816-97 counts as a substantial product hazard. In the EU, nickel release from zippers and rivets that touch the skin is limited.',
          },
          {
            kind: 'list',
            items: [
              'Waist and hem drawstrings. On children’s outerwear up to size 16, a waist or bottom drawstring may reach no more than 3 inches outside its channel, with the garment spread to its fullest width. Its free ends must carry no toggles, knots or other attachments. A continuous drawstring must be bar-tacked, so it cannot be pulled through its channel.',
              'Retractable cords. The current edition of the standard, ASTM F1816-18 (reapproved 2024), exempts fully retractable drawstrings.',
              'Europe’s drawstring standard. EN 14682 covers cords and drawstrings on children’s clothing up to age 14.',
              'The nickel limit. The EU rule names rivet buttons, tighteners, rivets, zippers and metal marks used in garments. Where they are in direct and prolonged contact with the skin, they may not release more than 0.5 micrograms of nickel per square centimeter per week, and a coating must hold that limit for at least two years of normal use.',
              'Our part. Children’s clothing is something we make on request. The tracking-label rule for children’s products is on the labels page.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Soccer balls: the valve',
        blocks: [
          {
            kind: 'text',
            text: 'A ball’s valve is where the air goes in, and whether the ball keeps that air is tested: loss of pressure is one of the tests behind FIFA’s quality marks. We fit several types of valve, and you choose one for each order. Our soccer ball guide gives the pressure a match ball needs, and the other tests.',
            links: [{ phrase: 'Our soccer ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
          {
            kind: 'list',
            items: [
              'Valve care. On request, we put a ball needle or a note on valve care in the box with your balls.',
            ],
          },
        ],
      },
      {
        heading: 'On our floor',
        blocks: [
          {
            kind: 'text',
            text: 'Trims you send us are sewn or applied on our floor, the same as the trims we source. For testing, a third-party lab can check your trims, quoted per order, and we pass on our trim suppliers’ own reports, whatever your market needs. Your quote states the trims.',
          },
        ],
      },
      {
        heading: 'Trims in your spec',
        blocks: [
          {
            kind: 'text',
            text: 'Name each trim in your tech pack or inquiry, with its type, size and finish, the tests you need, and whether the garment is for children or for sale in the EU. You see the bulk trims on the pre-production sample, before the bulk run. The list below covers what to state.',
          },
          {
            kind: 'list',
            items: [
              'Each trim by type: coil, molded or metal zipper; snap; drawcord; elastic; tape.',
              'The test methods you want, by number.',
              'Size, color and surface finish.',
              'Children’s sizes, if any.',
              'Sale in the EU, for the nickel rule.',
              'Your own trims or ours.',
              'Custom parts: logo snaps, pullers, aglets, printed drawcords.',
            ],
          },
          {
            kind: 'text',
            text: 'Send us your trim spec',
            links: [{ phrase: 'Send us your trim spec', href: '/contact' }],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'USITC: Harmonized Tariff Schedule of the United States, 2026 Revision 22, headings 5806, 8308, 9606 and 9607',
        url: 'https://hts.usitc.gov/',
        date: '2026-10-30',
        kind: 'read',
      },
      {
        name: 'Pamuk and Yıldız, The Effect of Chain Width on the Strength of the Metallic Slide Fasteners, Tekstil ve Konfeksiyon (Journal of Textile and Apparel) 23(3), 2013',
        url: 'https://ecc.isc.ac/showJournal/14728/51673/688713',
        date: '2013-01-01',
        kind: 'read',
      },
      {
        name: 'ASTM International: D2050, terminology for fasteners',
        url: 'https://store.astm.org/d2050-23.html',
        date: '2023-09-13',
        kind: 'read',
      },
      {
        name: 'ASTM International: D3657, zipper dimensions',
        url: 'https://store.astm.org/d3657-03r21.html',
        date: '2021-08-20',
        kind: 'read',
      },
      {
        name: 'ASTM International: D2060, measuring zipper dimensions',
        url: 'https://store.astm.org/d2060-14r22.html',
        date: '2022-04-14',
        kind: 'read',
      },
      {
        name: 'ASTM International: D2061, strength tests for zippers',
        url: 'https://store.astm.org/d2061-07r21.html',
        date: '2021-08-20',
        kind: 'read',
      },
      {
        name: 'ASTM International: D2062, operability of zippers',
        url: 'https://store.astm.org/d2062-03r21.html',
        date: '2021-07-12',
        kind: 'read',
      },
      {
        name: 'ASTM International: D2051, durability of finish of zippers to laundering',
        url: 'https://store.astm.org/d2051-14r22.html',
        date: '2022-03-10',
        kind: 'read',
      },
      {
        name: 'ASTM International: D2057, colorfastness of zippers to laundering',
        url: 'https://store.astm.org/d2057-05r22.html',
        date: '2022-03-11',
        kind: 'read',
      },
      {
        name: 'ASTM International: D2059, resistance of zippers to salt fog',
        url: 'https://store.astm.org/d2059_d2059m-03r22.html',
        date: '2022-03-15',
        kind: 'read',
      },
      {
        name: 'ASTM International: D3692, selection of zippers for care-labeled apparel',
        url: 'https://store.astm.org/d3692-89r21.html',
        date: '2021-07-08',
        kind: 'read',
      },
      {
        name: 'UNI: UNI EN 16732:2025, slide fasteners (zips)',
        url: 'https://store.uni.com/en/uni-en-16732-2025',
        date: '2025-06-05',
        kind: 'read',
      },
      {
        name: 'REACH, Regulation (EC) No 1907/2006, consolidated text of 22 June 2026, Annex XVII entry 27 (nickel)',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006R1907-20260622',
        date: '2026-06-22',
        kind: 'read',
      },
      {
        name: 'ASTM International: D4846, resistance to unsnapping of snap fasteners',
        url: 'https://store.astm.org/d4846-96r21.html',
        date: '2021-07-09',
        kind: 'read',
      },
      {
        name: 'ASTM International: D5169, shear strength of hook and loop fasteners',
        url: 'https://store.astm.org/d5169-98r21.html',
        date: '2021-07-09',
        kind: 'read',
      },
      {
        name: 'ASTM International: D5170, peel strength of hook and loop fasteners',
        url: 'https://store.astm.org/d5170-98r21.html',
        date: '2021-07-09',
        kind: 'read',
      },
      {
        name: 'eCFR: 16 CFR Part 1120, substantial product hazard list (drawstrings)',
        url: 'https://www.ecfr.gov/current/title-16/chapter-II/subchapter-B/part-1120',
        date: '2026-11-03',
        kind: 'read',
      },
      {
        name: 'U.S. Consumer Product Safety Commission: Drawstrings in Children’s Upper Outerwear',
        url: 'https://www.cpsc.gov/Business--Manufacturing/Business-Education/Business-Guidance/Drawstrings-in-Childrens-Upper-Outerwear',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ASTM International: F1816, drawstrings on children’s upper outerwear (F1816-18, reapproved 2024)',
        url: 'https://store.astm.org/f1816-18r24.html',
        date: '2024-11-11',
        kind: 'read',
      },
      {
        name: 'AFNOR: NF EN 14682, safety of children’s clothing, cords and drawstrings',
        url: 'https://www.boutique.afnor.org/en-gb/standard/nf-en-14682/safety-of-childrens-clothing-cords-and-drawstrings-on-childrens-clothing-sp/fa177350/1477',
        date: '2014-12-01',
        kind: 'read',
      },
      {
        name: 'ASTM International: D4964, tension and elongation of elastic fabrics',
        url: 'https://store.astm.org/d4964-96r20.html',
        date: '2020-08-06',
        kind: 'read',
      },
      {
        name: 'eCFR: 16 CFR Part 303, 303.12 trimmings',
        url: 'https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-303',
        date: '2026-11-03',
        kind: 'read',
      },
      {
        name: 'Regulation (EU) No 1007/2011, Annex VII',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011R1007',
        date: '2011-10-18',
        kind: 'read',
      },
      {
        name: 'eCFR: 16 CFR Part 423, 423.6(c)(3)',
        url: 'https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-423',
        date: '2026-11-03',
        kind: 'read',
      },
      {
        name: 'ASTM International: D3938, care instructions for apparel',
        url: 'https://store.astm.org/d3938-18r23.html',
        date: '2023-12-08',
        kind: 'read',
      },
      {
        name: 'Estonian Centre for Standardisation: EN 17353:2020+A1:2025, enhanced visibility equipment for medium risk situations',
        url: 'https://www.evs.ee/en/evs-en-17353-2020-a1-2025-consolidated',
        date: '2025-07-15',
        kind: 'read',
      },
      {
        name: 'Estonian Centre for Standardisation: EN ISO 20471:2013, high visibility clothing',
        url: 'https://www.evs.ee/en/evs-en-iso-20471-2013',
        date: '2013-04-02',
        kind: 'read',
      },
      {
        name: 'ASTM International: E810, retroreflection of retroreflective sheeting',
        url: 'https://store.astm.org/e0810-20r25.html',
        date: '2025-12-03',
        kind: 'read',
      },
      {
        name: 'Estonian Centre for Standardisation: EN 343:2019 and EN ISO 24232:2025, protection against rain',
        url: 'https://www.evs.ee/en/evs-en-iso-24232-2025',
        date: '2025-11-03',
        kind: 'read',
      },
      {
        name: 'FIFA: Quality Programme for Footballs',
        url: 'https://inside.fifa.com/technical/football-technology/standards/footballs/fifa-quality-programme-for-footballs',
        date: '2026-02-10',
        kind: 'read',
      },
    ],
  },
  // Wave 6, B1: signed by the production (owner, 2026-11-06).
  {
    path: '/guides/sportswear-fibers',
    title: 'Sportswear Fibers: Polyester, Nylon and More',
    description:
      'What polyester, nylon, spandex, cotton, wool, lyocell, modal, hemp and polypropylene do in sportswear, their names in US and EU rules, and how cost compares.',
    heading: 'Sportswear fibers,',
    headingAccent: 'named and compared.',
    lede: 'Every sportswear fabric starts as a fiber. This guide covers the fibers we use, what each does in a garment, what US and EU rules call them, and how to describe recycled fiber.',
    sections: [
      {
        heading: 'The fibers we use',
        blocks: [
          {
            kind: 'text',
            text: 'We use polyester, both new and recycled, along with nylon, spandex, cotton, merino wool, recycled wool, hemp, lyocell, modal and polypropylene. The table below shows what each one brings to a garment and how its cost usually compares with polyester. Each fiber is explained further down.',
          },
          {
            kind: 'table',
            caption: 'What each fiber brings, and its cost next to polyester',
            columns: ['Fiber', 'What it brings', 'Relative cost'],
            rows: [
              [
                'Polyester',
                'Holds its shape; takes up less water than nylon',
                'The base for this column',
              ],
              [
                'Recycled polyester',
                'Polyester’s chemistry, from recycled material',
                'Usually costs more than polyester',
              ],
              ['Nylon', 'Strong and hard-wearing', 'Usually costs more than polyester'],
              [
                'Spandex (elastane)',
                'Stretch that springs back',
                'Usually costs more than polyester',
              ],
              ['Cotton', 'Soft and breathable', 'Usually costs more than polyester'],
              [
                'Merino wool',
                'Warmth; wool sportswear suits outdoor sports',
                'Usually costs more than polyester',
              ],
              [
                'Recycled wool',
                'Wool’s warmth, from reclaimed fiber',
                'Usually costs more than polyester',
              ],
              [
                'Lyocell and modal',
                'Fibers made from plant cellulose',
                'Usually costs more than polyester',
              ],
              ['Hemp', 'A hard-wearing plant fiber', 'Usually costs more than polyester'],
              ['Polypropylene', 'Resists humidity and light', 'Usually costs more than polyester'],
            ],
          },
          {
            kind: 'text',
            text: 'The cost column compares one fiber with another. What else changes a garment’s price is covered in our cost guide. Which of our reference garments uses which fiber is in the fabrics guide’s table.',
            links: [
              { phrase: 'our cost guide', href: '/guides/cost-to-start-an-activewear-brand' },
              { phrase: 'the fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'What each fiber is called',
        blocks: [
          {
            kind: 'text',
            text: 'Man-made fibers have generic names set in law. US rules set their own names, such as polyester, nylon, spandex, olefin and rayon, and also accept the names in ISO 2076. The EU’s list includes polyester, "polyamide or nylon", elastane, polypropylene, viscose, modal and lyocell.',
          },
          {
            kind: 'table',
            caption: 'The same fiber under US and EU names',
            columns: ['Fiber', 'US name', 'EU name'],
            rows: [
              ['Polyester', 'Polyester', 'Polyester'],
              ['Nylon', 'Nylon', 'Polyamide or nylon'],
              ['Spandex', 'Spandex, or elastane', 'Elastane'],
              ['Polypropylene', 'Olefin', 'Polypropylene'],
              ['Viscose', 'Rayon, or viscose', 'Viscose'],
              ['Lyocell', 'Rayon, or lyocell', 'Lyocell'],
            ],
          },
          {
            kind: 'list',
            items: [
              'ISO 2076. The international list of generic names for man-made fibers, set by each fiber’s main polymer. The US rule still cites its 2013 edition, while ISO’s current edition dates from 2021 and is being revised.',
              'Brand names. On a US content label, a fiber’s trademark may appear only next to its generic name. This guide uses generic names only.',
              'Merino and recycled wool. The FTC’s word wool covers fiber from the fleece of the sheep or lamb, and the hair of the Angora goat, Cashmere goat, camel, alpaca, llama or vicuna. Title 16 of the US Code of Federal Regulations, which holds the FTC’s labeling rules, never uses the word merino. Recycled wool must be named "recycled wool".',
              'Shares and small amounts. How each fiber’s share goes on a label, and when a small share may be grouped, is set out in the labels guide.',
            ],
            links: [{ phrase: 'the labels guide', href: '/guides/clothing-labels' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Polyester or nylon',
        blocks: [
          {
            kind: 'text',
            text: 'Both are synthetic fibers with different strengths. Nylon, also called polyamide, has excellent resistance to wear and abrasion, but it tends to absorb moisture, which can change its properties. Polyester absorbs less water and keeps its size and shape better. Polyester is also the world’s most produced fiber, at 59% of all fiber made in 2025.',
          },
          {
            kind: 'list',
            items: [
              'In swimsuits, polyester fibers are used for shape that lasts.',
              'How a fabric moves sweat away from the skin is explained in the fabrics guide.',
            ],
            links: [
              { phrase: 'the fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'Is recycled polyester the same as polyester?',
        blocks: [
          {
            kind: 'text',
            text: 'As a fiber, it meets the same definition. US rules and EU law define polyester by its chemistry and say nothing about what it was made from. What differs is the raw material: in 2025, 97% of recycled polyester came from plastic bottles, and fiber recycled from old textiles was about 1% of all fiber.',
          },
          {
            kind: 'list',
            items: [
              'How much is made. About 9.7 million tonnes of recycled polyester were made in 2025, out of 82.5 million tonnes of polyester, so just under 12% of polyester was recycled.',
              'The figures move each year. For 2024, the report before gave a 12% share and 98% from bottles. Each figure on this page carries its year.',
              'Wear. One university study aged a set of fabrics and then tested them for abrasion: the recycled-polyester fabrics lost more mass than the standard polyester fabrics. It is one study of particular fabrics.',
              'Proof of recycled content. What we send to prove it is in the FAQ.',
            ],
            links: [{ phrase: 'the FAQ', href: '/faq/fabrics-and-printing#recycled-organic' }],
          },
        ],
      },
      {
        heading: 'Describing recycled fiber',
        blocks: [
          {
            kind: 'text',
            text: 'Name the fiber and give its share. The UK’s Competition and Markets Authority asks fashion businesses to describe each fabric by its objective properties, such as "recycled polyester", and to state the specific percentage of the relevant fibers. US guidance allows a recycled-content claim only for material recovered or otherwise diverted from the waste stream.',
          },
          {
            kind: 'list',
            items: [
              'One of our own garments. Our Apex Flex Pullover is 88% recycled polyester, with 12% spandex.',
              'The wider rules on environmental claims, market by market, are in our compliance guide.',
            ],
            links: [
              { phrase: 'Apex Flex Pullover', href: '/products/r-afp' },
              { phrase: 'our compliance guide', href: '/guides/sportswear-compliance-by-market' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Spandex or elastane',
        blocks: [
          {
            kind: 'text',
            text: 'They are one fiber with two names: spandex in the US, and elastane in ISO 2076 and EU law. It is a polyurethane fiber that, stretched to three times its length and released, springs back quickly and largely to its original length. It is sensitive to high temperatures.',
          },
          {
            kind: 'list',
            items: [
              'In a blend, it is used for its stretch, as the next sections show.',
              'Stretch and recovery tests are covered in the fabrics guide.',
            ],
            links: [
              { phrase: 'the fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'Cotton and wool',
        blocks: [
          {
            kind: 'text',
            text: 'Cotton was 18% of the world’s fiber output in 2025. Two sportswear studies compared it with nylon: in one, a nylon compression top left much less clothing wetness than cotton; the other found no appreciable decreases in core or skin temperature, or in sweat rate or loss, with nylon. Wool fabrics can keep skin dry under sweating.',
          },
          {
            kind: 'list',
            items: [
              'Wool outdoors. A 2025 paper describes wool sportswear as suited to outdoor sports. Knitted fabrics of 100% wool, though, spread liquid poorly across both faces.',
              'Merino and recycled wool are both fibers we use. Their names in US rules are in the names section above.',
              'Cotton and sweat. How cotton handles wicking and drying is in the fabrics guide.',
            ],
            links: [
              { phrase: 'the fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'Polypropylene, called olefin in the US',
        blocks: [
          {
            kind: 'text',
            text: 'US rules file polypropylene under the generic name olefin, a fiber whose polymer is at least 85% ethylene, propylene or other olefin units by weight, and the EU names it polypropylene. It is the main polyolefin used to make yarn, and textiles use it for its resistance to humidity and light. We use it too.',
          },
        ],
      },
      {
        heading: 'Viscose, modal, lyocell and bamboo',
        blocks: [
          {
            kind: 'text',
            text: 'These are regenerated cellulose fibers: plant cellulose is dissolved, then spun again into fiber. US rules call the family rayon, and allow the name lyocell for the kind made from an organic solution. Viscose is highly absorbent and soft. We use lyocell and modal.',
          },
          {
            kind: 'list',
            items: [
              'How they differ. EU law defines viscose as made by the viscose process, as filament or as cut fiber. Modal comes from a modified viscose process and has a high breaking force and a high wet modulus: it takes a strong pull to break, and it resists stretching when wet. Lyocell is spun from an organic solvent without forming chemical derivatives; one review names the process after its solvent, N-methylmorpholine N-oxide, or NMMO.',
              'Rayon and viscose. The FTC calls them the same thing.',
              'Bamboo. Rayon can be made from bamboo. The FTC’s words for such fabric are "rayon (or viscose) made from bamboo", and it allows the word bamboo on its own only for actual bamboo fiber. Labeling it is covered in the labels guide.',
              'Their share. Man-made cellulosic fibers made up 7% of all fiber produced in 2025.',
            ],
            links: [{ phrase: 'the labels guide', href: '/guides/clothing-labels' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Why fibers are blended',
        blocks: [
          {
            kind: 'text',
            text: 'A blend combines what each fiber does in one fabric. Elastane is blended in for its stretch. In one study reported in a 2025 review, a polypropylene and cotton fabric managed moisture well on both its inner and outer faces. Our Geovent Tennis Dress, for example, is 85% recycled polyester and 15% spandex.',
            links: [{ phrase: 'Geovent Tennis Dress', href: '/products/r-gtd' }],
          },
          {
            kind: 'list',
            items: [
              'The blends in our common knits are listed fabric by fabric in the fabrics guide.',
              'How a blend’s shares go on a label is in our labels guide.',
            ],
            links: [
              { phrase: 'the fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
              { phrase: 'our labels guide', href: '/guides/clothing-labels' },
            ],
          },
        ],
      },
      {
        heading: 'Inside a soccer ball',
        blocks: [
          {
            kind: 'text',
            text: 'A ball’s outer cover is made of PU, PVC or TPU, and its bladder, which holds the air, is latex, butyl or a wound bladder. PU stands for polyurethane and TPU for thermoplastic polyurethane, and US rules define spandex, the stretch fiber, as at least 85% segmented polyurethane. Our ball guide explains each part.',
            links: [{ phrase: 'Our ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
          {
            kind: 'text',
            text: 'Turn the Kaizen in 3D.',
            links: [{ phrase: 'the Kaizen in 3D', href: '/products/kaizen' }],
          },
        ],
      },
      {
        heading: 'From fiber to your garment',
        blocks: [
          {
            kind: 'text',
            text: 'Fiber becomes yarn, yarn becomes fabric, and fabric becomes your garment. We buy finished fabric: our suppliers knit and dye it, and we cut and sew. How fiber becomes yarn, and what yarn count and denier mean, is in our yarns guide.',
            links: [{ phrase: 'our yarns guide', href: '/guides/yarn-count-and-denier' }],
          },
          {
            kind: 'list',
            items: [
              'Choosing a fiber with us: see the FAQ.',
              'Knits and their weights are in our fabrics guide.',
            ],
            links: [
              { phrase: 'the FAQ', href: '/faq/fabrics-and-printing#choose-fabric' },
              { phrase: 'our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'US Federal Trade Commission, 16 CFR 303.7, generic names and definitions for manufactured fibers (eCFR)',
        url: 'https://www.ecfr.gov/current/title-16/part-303/section-303.7',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'US Federal Trade Commission, Threading Your Way Through the Labeling Requirements Under the Textile and Wool Acts',
        url: 'https://www.ftc.gov/business-guidance/resources/threading-your-way-through-labeling-requirements-under-textile-wool-acts',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'eCFR, Title 16 searched for merino (no results)',
        url: 'https://www.ecfr.gov/api/search/v1/results?query=merino&hierarchy[title]=16',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO 2076:2021, Textiles. Man-made fibres. Generic names',
        url: 'https://www.iso.org/standard/79685.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'US Federal Trade Commission, bamboo textiles',
        url: 'https://www.ftc.gov/bamboo-textiles',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Regulation (EU) No 1007/2011 on textile fibre names, Annex I, consolidated version of 15 February 2018',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02011R1007-20180215',
        date: '2018-02-15',
        kind: 'updated',
      },
      {
        name: 'Salopek Čubrić, Čubrić and Potočić Matković, swimwear materials, Polymers 13(15):2414',
        url: 'https://doi.org/10.3390/polym13152414',
        date: '2021-07-22',
        kind: 'published',
      },
      {
        name: 'Islam et al., review of sportswear materials, RSC Advances 15',
        url: 'https://doi.org/10.1039/d5ra07231j',
        date: '2025-12-19',
        kind: 'published',
      },
      {
        name: 'Chen and Wang, wool sportswear, Scientific Reports 15:29997',
        url: 'https://doi.org/10.1038/s41598-025-15179-2',
        date: '2025-08-16',
        kind: 'published',
      },
      {
        name: 'Afzal, Salman, Jamshaid, Mishra and Muller, polypropylene yarn, Scientific Reports',
        url: 'https://doi.org/10.1038/s41598-025-01000-7',
        date: '2025-05-20',
        kind: 'published',
      },
      {
        name: 'Varnaitė-Žuravliova and Baltušnikaitė-Guzaitienė, review of cellulose fibers, Journal of Functional Biomaterials 15(11):348',
        url: 'https://doi.org/10.3390/jfb15110348',
        date: '2024-11-16',
        kind: 'published',
      },
      {
        name: 'Textile Exchange, Materials Market Report 2026',
        url: 'https://textileexchange.org/knowledge-center/reports/materials-market-report-2026/',
        date: '2026-09-22',
        kind: 'published',
      },
      {
        name: 'Textile Exchange, Materials Market Report 2025',
        url: 'https://textileexchange.org/knowledge-center/reports/materials-market-report-2025/',
        date: '2025-09-18',
        kind: 'published',
      },
      {
        name: 'US Federal Trade Commission, Green Guides, 16 CFR 260.13, recycled content (eCFR)',
        url: 'https://www.ecfr.gov/current/title-16/part-260/section-260.13',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'UK Competition and Markets Authority, Complying with consumer law when making environmental claims in the fashion retail sector',
        url: 'https://www.gov.uk/government/publications/complying-with-consumer-law-when-making-environmental-claims-in-the-fashion-retail-sector/complying-with-consumer-law-when-making-environmental-claims-in-the-fashion-retail-sector',
        date: '2024-09-18',
        kind: 'published',
      },
      {
        name: 'Changes in Mechanical Properties of Fabrics Made of Standard and Recycled Polyester Yarns Due to Aging, Polymers 15(23):4511 (only if you keep the line)',
        url: 'https://doi.org/10.3390/polym15234511',
        date: '2023-11-23',
        kind: 'published',
      },
    ],
  },
  // Wave 6, B11: signed by the production (owner, 2026-11-06).
  {
    path: '/guides/yarn-count-and-denier',
    title: 'Yarn Count, Tex and Denier, Explained',
    description:
      'What Ne, tex and denier mean, a table to convert cotton count to denier, ring-spun, combed and textured yarn, and which yarn tests to ask for.',
    heading: 'Yarn count, tex and denier,',
    headingAccent: 'in plain words.',
    lede: 'Yarn is what a fabric is knitted or woven from, and its thickness, spinning and texture change how the fabric feels and wears. This guide explains each unit, how to convert between them, and what each yarn choice changes.',
    sections: [
      {
        heading: 'What yarn count, tex and denier mean',
        blocks: [
          {
            kind: 'text',
            text: 'All three state how heavy a yarn is for its length. Tex is grams per 1,000 meters and denier grams per 9,000 meters, so a bigger number means a coarser yarn. Cotton count, written Ne, works the other way round: it is the number of 840-yard hanks in a pound, so finer yarn has a higher count.',
          },
          {
            kind: 'list',
            items: [
              'Linear density is the standards’ name for this measure.',
              'Decitex, written dtex, is a tenth of a tex: grams per 10,000 meters.',
              'One system for all. ISO’s textiles committee approved the tex unit for all fibers and all types of yarn, and also decitex and millitex for fibers, and kilotex and decatex for coarse structures. ISO 1144, Textiles. Universal system for designating linear density (Tex System), sets out the Tex System, its units and its conversion tables.',
              'Single and folded yarn. "40/1 Ne" is a single yarn of count 40. Yarn made of several strands twisted together is called folded, or plied, and ISO 1139’s notation records the number of folds.',
              'Older systems. ISO 2947, Textiles. Integrated conversion table for replacing traditional yarn numbers by rounded values in the Tex System, gives rounded tex values to replace the six main traditional numbering systems.',
            ],
          },
        ],
      },
      {
        heading: 'Converting Ne, tex, dtex and denier',
        blocks: [
          {
            kind: 'text',
            text: 'Because tex and denier differ only in the length weighed, denier is always tex times nine, and decitex is tex times ten. Cotton count is indirect, so divide instead: tex is about 590.5 divided by Ne, and denier about 5,315 divided by Ne. ASTM D2260 and ISO 2947 give full tables.',
          },
          {
            kind: 'table',
            caption: 'Cotton count (Ne) in tex, decitex and denier',
            columns: ['Cotton count (Ne)', 'Tex', 'Decitex (dtex)', 'Denier'],
            rows: [
              ['20', '29.5', '295', '266'],
              ['24', '24.6', '246', '221'],
              ['30', '19.7', '197', '177'],
              ['40', '14.8', '148', '133'],
            ],
          },
          {
            kind: 'table',
            caption: 'Denier in decitex and tex',
            columns: ['Denier', 'Decitex (dtex)', 'Tex'],
            rows: [
              ['20', '22.2', '2.22'],
              ['40', '44.4', '4.44'],
              ['75', '83.3', '8.33'],
              ['150', '166.7', '16.67'],
            ],
          },
          {
            kind: 'text',
            text: 'The figures are rounded, and they rest on NIST’s factors: a yard is 0.9144 meters and a pound 0.4535924 kilograms. The rows show the arithmetic only.',
          },
          {
            kind: 'list',
            items: [
              'A range in two systems. A range from Ne 20 to Ne 40 runs from about 266 down to about 133 denier: the finer Ne 40 yarn has the smaller denier.',
              'ASTM D2260, Standard Tables of Conversion Factors and Equivalent Yarn Numbers Measured in Various Numbering Systems, gives the factors to convert a yarn’s number in one system to its number in others.',
            ],
          },
        ],
      },
      {
        heading: 'Is denier the same as GSM?',
        blocks: [
          {
            kind: 'text',
            text: 'No. Denier measures a yarn: the grams in 9,000 meters of it. GSM measures a fabric: the grams in one square meter of it. One is mass per length and the other mass per area, so neither can be turned into the other without knowing how the fabric is built.',
          },
          {
            kind: 'list',
            items: [
              'Fabric weight, how it is measured and what it is in ounces, is covered in our fabrics guide.',
            ],
            links: [
              { phrase: 'our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'Reading a yarn designation',
        blocks: [
          {
            kind: 'text',
            text: 'Under ISO 1139, a yarn’s designation gives its linear density in the Tex System, the number of filaments in a filament yarn, the direction and amount of twist, and the number of folds. Textured yarns fall outside it. A 2023 study, for example, designates one of its textured polyamide 6.6 yarns "PA 6.6 156 dtex f 42".',
          },
          {
            kind: 'list',
            items: [
              'ISO 1139 is titled Textiles. Designation of yarns; its second edition was published in 2025.',
              'A figure in denier, such as 75 denier, converts to decitex with the table above.',
            ],
          },
        ],
      },
      {
        heading: 'Spun or filament yarn',
        blocks: [
          {
            kind: 'text',
            text: 'Yarn is made either from continuous filaments or from staple fibers, which come in short, separate lengths. EU law, for example, defines viscose as made both as filament and as discontinuous fiber. Spun yarn is made from staple fibers, such as cotton or modal, on ring, rotor or air-jet machines.',
          },
          {
            kind: 'list',
            items: [
              'The fibers themselves, from polyester to modal, are explained in our fibers guide.',
              'Textured filament yarn has its own section below.',
            ],
            links: [{ phrase: 'our fibers guide', href: '/guides/sportswear-fibers' }],
          },
        ],
      },
      {
        heading: 'Ring-spun, open-end or air-jet',
        blocks: [
          {
            kind: 'text',
            text: 'The spinning method changes the yarn’s surface and strength. Ring-spun yarn is hairier than rotor or air-jet yarn, but more compact and stronger, and knits made from it resist abrasion better. Air-jet yarn is less hairy and more even, and its fabrics feel very smooth and pill less. Open-end, or rotor, yarn has its own structure.',
          },
          {
            kind: 'list',
            items: [
              'Why air-jet yarn is even. Its surface carries an evenly spread layer of wrapping fibers.',
            ],
          },
        ],
      },
      {
        heading: 'Carded or combed cotton',
        blocks: [
          {
            kind: 'text',
            text: 'Combing is an extra step that removes short fibers from cotton before spinning. Fibers shorter than 12 millimeters add hairiness but no strength, and fabric made from combed cotton has a very soft touch. The extra step, and the fiber it removes as waste, make combed cotton more expensive than carded.',
          },
          {
            kind: 'list',
            items: [
              'Combed and ring-spun are separate steps: combing prepares the fibers, and ring spinning is one of the ways to make them into yarn.',
            ],
          },
        ],
      },
      {
        heading: 'What textured yarn is',
        blocks: [
          {
            kind: 'text',
            text: 'Texturing gives smooth synthetic filaments a crimp, a wavy kink that makes them feel more like natural fibers. Smooth filaments are used mainly in technical products. The most important texturing process is false-twist texturing, because the yarn it starts from, partially oriented yarn, is about 60% of all filament yarn spun from melted polymer.',
          },
          {
            kind: 'list',
            items: [
              'With natural fibers. Once textured, filaments can be processed together with natural fibers.',
              'An example is the textured polyamide yarn in the designation section above.',
            ],
          },
        ],
      },
      {
        heading: 'How the yarn changes the fabric',
        blocks: [
          {
            kind: 'text',
            text: 'The yarn changes how a fabric feels, pills and wears, as the sections above show. The fiber plays a part too: one 2023 paper notes that polyamide filaments are generally considered highly abrasion resistant, and cotton and modal fibers moderately so. The table below sums up what this guide’s sources found.',
          },
          {
            kind: 'table',
            caption: 'What the yarn changes',
            columns: ['Yarn', 'What changes'],
            rows: [
              ['Ring-spun', 'Knits resist abrasion better'],
              ['Air-jet spun', 'A very smooth feel, less pilling'],
              ['Combed cotton', 'A very soft touch'],
              ['Textured filament', 'A feel closer to natural fibers'],
              ['Polyamide filament', 'Generally considered highly abrasion resistant'],
            ],
          },
        ],
      },
      {
        heading: 'Yarn tests you can ask for',
        blocks: [
          {
            kind: 'text',
            text: 'Three standard methods cover a yarn’s count and twist: ISO 2060 and ASTM D1907 for linear density, and ISO 2061 for twist. Name the method when you ask for a report. We arrange third-party lab reports on these tests, and you pay for them.',
          },
          {
            kind: 'list',
            items: [
              'ISO 2060:1994, Textiles. Yarn from packages. Determination of linear density (mass per unit length) by the skein method. It covers all types of yarn in package form.',
              'ASTM D1907/D1907M-12(2025), Standard Test Method for Linear Density of Yarn (Yarn Number) by the Skein Method, which gives the result in any of the traditional numbering systems and is suited to testing commercial shipments for acceptance.',
              'ISO 2061:2015, Textiles. Determination of twist in yarns. Direct counting method. It measures the direction of twist and the turns per unit length in spun and filament yarns, and does not suit open-end yarns or intermingled multifilament yarns.',
              'ISO 2062:2009, Textiles. Yarns from packages. Determination of single-end breaking force and elongation at break using constant rate of extension (CRE) tester. It measures the force that breaks a yarn and how far the yarn stretches before it breaks.',
              'Fabric tests, such as weight, stretch and air permeability, are covered by the fabrics guide.',
            ],
            links: [
              { phrase: 'the fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'Naming the yarn in your order',
        blocks: [
          {
            kind: 'text',
            text: 'You can specify the yarn count or denier, and your quote names it. Our fabric arrives finished, knitted and dyed by our suppliers, and we do the cutting and sewing. For the fiber and the fabric around the yarn, see our fibers and fabrics guides.',
            links: [
              { phrase: 'our fibers', href: '/guides/sportswear-fibers' },
              { phrase: 'fabrics guides', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'NIST, Guide for the Use of the SI (SP 811), Appendix B.9, conversion factors',
        url: 'https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9',
        date: '2025-08-18',
        kind: 'updated',
      },
      {
        name: 'NIST, Metric (SI) Prefixes',
        url: 'https://www.nist.gov/pml/owm/metric-si-prefixes',
        date: '2025-08-13',
        kind: 'updated',
      },
      {
        name: 'Cotton count (Ne) defined in a paper on printed electronics, Nature Communications',
        url: 'https://doi.org/10.1038/s41467-025-63636-3',
        date: '2025-09-29',
        kind: 'published',
      },
      {
        name: '40/1 Ne defined in a paper on microfiber recycling, iScience',
        url: 'https://doi.org/10.1016/j.isci.2024.111427',
        date: '2024-11-19',
        kind: 'published',
      },
      {
        name: 'ASTM D861-07(2024)e2, Standard Practice for Use of the Tex System to Designate Linear Density of Fibers, Yarn Intermediates, and Yarns',
        url: 'https://store.astm.org/d0861-07r24e02.html',
        date: '2024-08-07',
        kind: 'updated',
      },
      {
        name: 'ASTM D2260-24, Standard Tables of Conversion Factors and Equivalent Yarn Numbers Measured in Various Numbering Systems',
        url: 'https://store.astm.org/d2260-24.html',
        date: '2024-09-09',
        kind: 'updated',
      },
      {
        name: 'ISO 1144:2016, Textiles. Universal system for designating linear density (Tex System)',
        url: 'https://www.iso.org/standard/70774.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO 2947:1973, Textiles. Integrated conversion table for replacing traditional yarn numbers by rounded values in the Tex System',
        url: 'https://www.iso.org/standard/7996.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO 1139:2025, Textiles. Designation of yarns',
        url: 'https://www.iso.org/standard/89212.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO 2060:1994, Textiles. Yarn from packages. Determination of linear density (mass per unit length) by the skein method',
        url: 'https://www.iso.org/standard/6837.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ASTM D1907/D1907M-12(2025), Standard Test Method for Linear Density of Yarn (Yarn Number) by the Skein Method',
        url: 'https://store.astm.org/d1907_d1907m-12r25.html',
        date: '2025-06-11',
        kind: 'updated',
      },
      {
        name: 'ISO 2061:2015, Textiles. Determination of twist in yarns. Direct counting method',
        url: 'https://www.iso.org/standard/65146.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Regulation (EU) No 1007/2011 on textile fibre names, Annex I (viscose entry), consolidated version of 15 February 2018',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02011R1007-20180215',
        date: '2018-02-15',
        kind: 'updated',
      },
      {
        name: 'Tomljenović, Živičnjak and Mihaljević, differently spun modal yarns, Materials 16(4):1684',
        url: 'https://doi.org/10.3390/ma16041684',
        date: '2023-02-17',
        kind: 'published',
      },
      {
        name: 'NPTEL, Yarn Manufacture II (IIT Delhi), Introduction to combing',
        url: 'https://archive.nptel.ac.in/content/storage2/courses/116102038/combing/introduction%20to%20combing.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'NPTEL, Composite Materials and Structures (IIT Kanpur), Lecture 5: Terminologies',
        url: 'https://archive.nptel.ac.in/content/storage2/courses/101104010/lecture5/5_2.htm',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Ortega, Saynisch, Yurtseven and Gries, review of filament texturing, Fibers 12(4):36',
        url: 'https://doi.org/10.3390/fib12040036',
        date: '2024-04-07',
        kind: 'published',
      },
    ],
  },
  // Wave 7, B6: signed by the production (owner, 2026-11-06).
  {
    path: '/guides/sportswear-pattern-making',
    title: 'Sportswear Pattern Making: Ease and Grading',
    description:
      'How a sportswear pattern is made: blocks, negative ease for compression wear, grading, US and European size standards, and fit checks in 3D.',
    heading: 'How a sportswear pattern is made,',
    headingAccent: 'size by size.',
    lede: 'A sportswear pattern starts from body measurements and is graded to every size you order. This guide explains each step, the body-size standards used in the US and Europe, how fit is checked, and what to send us.',
    sections: [
      {
        heading: 'Where does a sportswear pattern start?',
        blocks: [
          {
            kind: 'text',
            text: 'From a block: a base pattern for one family of garments, then shaped to your style. We keep house blocks for each garment family, and a new style can start from one of ours. A 2026 study traced eight pairs of compression leggings sold in Australia: all came from a one-piece block, with little dart or seam shaping.',
          },
          {
            kind: 'list',
            items: [
              'What else the leggings shared. Every style had a longer back rise than the block, meaning more length from the crotch up to the back waist, and seven of the eight added a crotch gusset, a small panel set between the legs. The authors conclude that today’s leggings rely mainly on fabric stretch rather than pattern shaping.',
              'Under the block. Published tables of body measurements are there to help makers develop patterns that suit the people who will wear them.',
            ],
          },
        ],
      },
      {
        heading: 'What is ease, and why is it negative in compression wear?',
        blocks: [
          {
            kind: 'text',
            text: 'Ease is the difference between the body and the garment. A loose top is cut bigger than the body, and a compression garment is cut smaller, so the fabric stretches onto it. How much smaller depends on the body’s measurements, the fabric’s stretch and the pose, and one study finds no single fixed figure for it.',
          },
          {
            kind: 'list',
            items: [
              'Sizes start from the body. ISO 8559-2, in its 2025 edition, bases its size designation on body measurements.',
              'What compression wear is. Compression garments are elastic clothes made with a planned pressure gradient. They are commonly designed by reducing the pattern from the fabric’s elongation, how far it stretches.',
              'Why one rule is not enough. In a 2026 study of knitted compression sleeves, the same reduction rule gave very different compression with fabric direction and layering. The authors conclude that reducing the pattern from elongation alone may not give even compression.',
              'A common mix-up. Stretch reduction and ease are often confused, and one study of women’s upper-body stretch-knit patterns traces misfit to ease rules that are too simple.',
              'Our method. We set the reduction from the fabric mill’s stretch data. The two sections on fit below show how it is then checked.',
              'Related pages. How stretch and recovery are tested is in our fabrics guide, and our glossary describes the compression fits our garments use.',
            ],
            links: [
              { phrase: 'our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
              { phrase: 'our glossary', href: '/glossary#compression-fit' },
            ],
          },
        ],
      },
      {
        heading: 'How does grading work?',
        blocks: [
          {
            kind: 'text',
            text: 'Grading is how a pattern is made in every size. A 2005 study tested seven assumptions behind basic bodice grade rules against measurements of US Army women. None was supported, and grading on them gives sized garments that do not reflect the body’s measurements and proportions. Accurate grading improves fit and helps stop a sample being rejected before bulk.',
          },
          {
            kind: 'list',
            items: [
              'How we grade. We grade each style in software. The size chart is yours; where a buyer has none, we use our own house chart.',
              'Where the steps between body sizes come from. ISO 8559-3 sets out how tables of body measurements, and the intervals between sizes, are built. ISO 8559-4 works out how much of a target population a table covers.',
              'Athletic bodies. A 2023 study scanned 63 athletic women in 3D and compared them with the size charts of compression leggings from three brands. Nearly half of the women scanned fell between sizes for at least one measurement, and the authors conclude that current products do not cater for athletic women.',
              'Grading in 3D. In CLO 3D, grading rules are set and edited on the 3D garment itself.',
              'Sizes to order. Splitting the minimum, a section of our guide to minimum orders, covers planning the sizes in your order, the largest included.',
            ],
            links: [
              { phrase: 'our guide to minimum orders', href: '/guides/minimum-order-and-samples' },
            ],
          },
        ],
      },
      {
        heading: 'Which body-size standards do the US and Europe use?',
        blocks: [
          {
            kind: 'text',
            text: 'In the US, ASTM publishes tables of body measurements for women’s misses sizes 00 to 20 and plus sizes 14W to 40W, and for men by chest size, 34 to 52. In Europe, EN 13402-3 describes a sizing system based on body dimensions, and ISO 8559-2 has been adopted as EN ISO 8559-2:2025.',
          },
          {
            kind: 'list',
            items: [
              'Terms and dates. ASTM D5219-25 collects the terms for the body dimensions used in sizing. ISO 8559-2 was revised in September 2025, and Estonia’s standards body lists its own national edition as valid from 1 October 2025.',
              'Body measurements only. EN 13402-3’s example body measurement tables cover men, women, boys, girls and infants, and it leaves garment dimensions out. For shoppers, it pairs the sizing system with a standard size pictogram.',
              'EU law. A 2011 EU regulation on textile fiber names asked the European Commission to examine a uniform size labeling system for the whole EU. The regulation itself sets no such system.',
              'One unit system. ASTM’s tables give inch and metric values as separate systems, each used on its own, and warn that mixing values from the two may break conformance with the standard. Choose inches or centimeters for your chart and keep to it.',
              'Size labels. What a size label shows is covered in our labels guide.',
            ],
            links: [{ phrase: 'our labels guide', href: '/guides/clothing-labels' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'How do we check fit before a sample?',
        blocks: [
          {
            kind: 'text',
            text: 'On screen first. Before a sample is made, we fit the garment in CLO 3D on an avatar sized to your size chart, and we read three of the program’s maps. Each map shows a different side of the fit, as the list below explains, so a problem can be fixed in the pattern before any fabric is cut.',
          },
          {
            kind: 'list',
            items: [
              'Strain map. How far the garment stretches under force, shown in percent.',
              'Fit map. How tightly the garment sits, in steps up to areas shown in red and marked "Can’t Wear".',
              'Pressure map. The pressure the garment puts on the avatar.',
              'Every size at once. CLO’s grading review puts all graded sizes, garments and avatars, on one screen.',
              'What our 3D pages show you. That is explained in our 3D garment reference guide.',
            ],
            links: [
              { phrase: 'our 3D garment reference guide', href: '/guides/3d-garment-reference' },
            ],
          },
        ],
      },
      {
        heading: 'What can a 3D fit check not show?',
        blocks: [
          {
            kind: 'text',
            text: 'How a real body moves and gives. In one study, simulated comfort matched real fittings in a standing pose but differed in a forward-reaching pose, because of how the joints deform. Default avatars in CAD software are usually solid, so they leave out how a soft body meets tight clothing. That is why the fit is then confirmed on samples.',
          },
          {
            kind: 'list',
            items: [
              'Resizing the avatar. In CLO, changing the avatar’s size leaves the pattern’s size as it was. CLO says its default avatar can be adjusted and used when its size can come close to your fit model’s.',
              'Pressure as an estimate. One 2026 study built its own pressure estimate from CLO’s garment meshes, rather than treat the software’s pressure maps as physical measurements.',
              'A standard for digital fitting. ISO 20947-3:2023 sets a protocol for judging the gap between a virtual garment and a virtual body or fit mannequin.',
              'Fit rounds on samples. Each fit round on a sample ends with photos and measurements sent to you. The samples themselves, from the first sample to the size set, are listed in our minimum order guide.',
            ],
            links: [
              { phrase: 'our minimum order guide', href: '/guides/minimum-order-and-samples' },
            ],
          },
        ],
      },
      {
        heading: 'What should I send for sizing and fit?',
        blocks: [
          {
            kind: 'text',
            text: 'Send your size chart, and say whether it lists body or garment measurements. Name the base size, the size range and the points where each garment is measured: ISO 18890 defines the main measuring points, and you and we can agree more. For compression wear, name the fabric, because its stretch changes how much the pattern is reduced.',
          },
          {
            kind: 'list',
            items: [
              'A reference garment. If you have one, send it. It is welcome, and we hold on to it so a reorder matches the first run.',
              // Back with the tech pack guide (C1, 2026-11-06), in the draft's place.
              'Writing the measurements. How to set out each point of measure in a tech pack is in our tech pack guide.',
              'Who owns the pattern. Our minimum order guide covers pattern ownership.',
            ],
            links: [
              { phrase: 'our tech pack guide', href: '/guides/tech-pack-template' },
              { phrase: 'Our minimum order guide', href: '/guides/minimum-order-and-samples' },
            ],
          },
        ],
      },
      {
        heading: 'Soccer balls: how is a ball’s panel pattern laid out?',
        blocks: [
          {
            kind: 'text',
            text: 'A ball’s pattern is its set of panels. The conventional ball has 32, in pentagons and hexagons. When every panel is a pentagon or a hexagon, meeting three at each corner, there are always exactly 12 pentagons, so a 32-panel ball has 20 hexagons. Some newer tournament balls have fewer panels, down to six.',
          },
          {
            kind: 'list',
            items: [
              'What we make. Balls of 32, 18 or 12 panels, and balls with fewer panels, for example 8 or 6. Many new panel designs are in development.',
              'Joins and flight. After a 2013 wind-tunnel study of four tournament balls, its authors considered that, within the scope of their test, the speed at which a ball’s drag drops sharply depends more on the total length of its panel joins than on small designs on the panels.',
              'Related pages. How the joins are stitched or bonded is in our stitch and seam guide, and how panel shape changes a ball’s flight is in our ball guide.',
            ],
            links: [
              { phrase: 'our stitch and seam guide', href: '/guides/stitch-and-seam-types' },
              { phrase: 'our ball guide', href: '/guides/how-soccer-balls-are-made' },
            ],
          },
        ],
      },
      {
        heading: 'On our floor',
        blocks: [
          {
            kind: 'text',
            text: 'Our patterns are made in-house, with CLO 3D for the 3D fit and a 2D pattern system for the production pattern. The garment below is a close-fitting style, built the same way, whose page lists its fit as Race fit. Open it to turn it in 3D and see how close that pattern sits.',
          },
        ],
      },
      {
        heading: 'Choosing the fit for your order',
        blocks: [
          {
            kind: 'text',
            text: 'Three choices shape your pattern: which body-size standard your customers match, how close the garment should sit, and how many sizes you need. The sections above cover each one, and the number of pieces per size is part of your minimum order. Send us your size chart with those choices made, and we start your pattern from there.',
            links: [{ phrase: 'Send us your size chart', href: '/contact' }],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'ISO 8559-2:2025, Size designation of clothes, Part 2: Primary and secondary dimension indicators',
        url: 'https://www.iso.org/standard/85590.html',
        date: '2025-09-18',
        kind: 'published',
      },
      {
        name: 'Estonian Centre for Standardisation, EVS-EN ISO 8559-2:2025',
        url: 'https://www.evs.ee/en/evs-en-iso-8559-2-2025',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 8559-3:2018, Size designation of clothes, Part 3: Methodology for the creation of body measurement tables and intervals',
        url: 'https://www.iso.org/standard/67334.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 8559-4:2023, Size designation of clothes, Part 4: Determination of the coverage ratios of body measurement tables',
        url: 'https://www.iso.org/standard/80356.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 18890:2018, Clothing, Standard method of garment measurement',
        url: 'https://www.iso.org/standard/63693.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Swedish Institute for Standards, SS-EN 13402-3:2017, Size designation of clothes, Part 3: Size labelling based on body measurements and intervals',
        url: 'https://www.sis.se/en/produkter/clothing-industry/clothes/ss-en-13402-32017/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Regulation (EU) No 1007/2011 of the European Parliament and of the Council of 27 September 2011 on textile fibre names and related labelling and marking of the fibre composition of textile products, Article 24',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011R1007',
        date: '2011-09-27',
        kind: 'published',
      },
      {
        name: 'ASTM D5585-21, Standard Tables of Body Measurements for Adult Female Misses Figure Type, Size Range 00–20',
        url: 'https://store.astm.org/d5585-21.html',
        date: '2021-02-17',
        kind: 'updated',
      },
      {
        name: 'ASTM D6240/D6240M-24a, Standard Tables of Body Measurements for Adult Male, Chest Size Range 34–52 Short, Regular, and Tall',
        url: 'https://store.astm.org/d6240_d6240m-24a.html',
        date: '2024-10-18',
        kind: 'updated',
      },
      {
        name: 'ASTM D6960/D6960M-16(2023), Standard Tables for Body Measurements for Plus Women’s Figure Type, Size Range 14W–40W',
        url: 'https://store.astm.org/d6960_d6960m-16r23.html',
        date: '2023-08-07',
        kind: 'updated',
      },
      {
        name: 'ASTM D5219-25, Standard Terminology Relating to Body Dimensions for Apparel Sizing',
        url: 'https://store.astm.org/d5219-25.html',
        date: '2025-09-11',
        kind: 'updated',
      },
      {
        name: 'Bunford, Padhye, Underwood and Waldie, patternmaking and garment shaping in women’s sports compression leggings, International Journal of Fashion Design, Technology and Education',
        url: 'https://doi.org/10.1080/17543266.2026.2736301',
        date: '2026-10-15',
        kind: 'published',
      },
      {
        name: 'Navodhya, De Silva and Gill, The science of stretch-knit pattern construction: establishing ease distribution in a digital prototyping environment, Research Journal of Textile and Apparel',
        url: 'https://doi.org/10.1108/rjta-05-2025-0093',
        date: '2026-09-17',
        kind: 'published',
      },
      {
        name: 'Lee and Lee, limits of elongation-based design in knitted compression sleeves, Scientific Reports',
        url: 'https://doi.org/10.1038/s41598-026-60867-2',
        date: '2026-07-04',
        kind: 'published',
      },
      {
        name: 'Xiong and Tao, Compression Garments for Medical Therapy and Sports, Polymers 10(6):663',
        url: 'https://doi.org/10.3390/polym10060663',
        date: '2018-06-14',
        kind: 'published',
      },
      {
        name: 'Hatch, Brubacher, Gill and Fernando, sizing methodology for women’s sports compression garments, International Journal of Fashion Design, Technology and Education',
        url: 'https://doi.org/10.1080/17543266.2023.2275033',
        date: '2023-11-08',
        kind: 'published',
      },
      {
        name: 'Schofield and LaBat, Defining and Testing the Assumptions Used in Current Apparel Grading Practice, Clothing and Textiles Research Journal 23(3)',
        url: 'https://doi.org/10.1177/0887302x0502300301',
        date: '2005-06-01',
        kind: 'published',
      },
      {
        name: 'Islam and others, factors affecting apparel pattern grading accuracy, Tekstilec',
        url: 'https://doi.org/10.14502/tekstilec2020.63.166-184',
        date: '2020-09-28',
        kind: 'published',
      },
      {
        name: 'CLO Help Center, Garment Fit Maps',
        url: 'https://support.clo3d.com/hc/en-us/articles/360000436368-Garment-Fit-Maps',
        date: '2026-08-14',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, Does the Pattern change if I change the size of the Avatar?',
        url: 'https://support.clo3d.com/hc/en-us/articles/115013820488',
        date: '2024-05-29',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, Is it possible to have an Avatar that has the exact specs as my fit model?',
        url: 'https://support.clo3d.com/hc/en-us/articles/115013660427',
        date: '2026-07-19',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, Grading; and Grading Review',
        url: 'https://support.clo3d.com/hc/en-us/articles/360000742668-Grading',
        date: '2026-10-25',
        kind: 'updated',
      },
      {
        name: 'ISO 20947-3:2023, Performance evaluation protocol for digital fitting systems, Part 3: Digital fitting performance, Gap',
        url: 'https://www.iso.org/standard/77732.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Ushio, Kim and Takatera, avatar and body shape differences in comfort evaluation by 3D garment simulation, International Journal of Affective Engineering',
        url: 'https://doi.org/10.5057/ijae.ijae-d-25-00020',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Brake, Kyosev and Rose, 3D garment fit on solid and soft digital avatars',
        url: 'https://doi.org/10.25367/cdatp.2022.3.p97-103',
        date: '2022-09-03',
        kind: 'published',
      },
      {
        name: 'Jeon and Lee, estimating clothing pressure from digital garment-mesh deformation, Textiles 6(3):91',
        url: 'https://doi.org/10.3390/textiles6030091',
        date: '2026-07-24',
        kind: 'published',
      },
      {
        name: 'Hong and Asai, Effect of panel shape of soccer ball on its flight characteristics, Scientific Reports 4:5068',
        url: 'https://doi.org/10.1038/srep05068',
        date: '2014-05-29',
        kind: 'published',
      },
      {
        name: 'Lesniak and White, Soccer Balls, Golf Balls, and the Euler Identity, Missouri Journal of Mathematical Sciences',
        url: 'https://doi.org/10.35834/mjms/1513306833',
        date: '2017-11-01',
        kind: 'published',
      },
      {
        name: 'Asai and Seo, Aerodynamic drag of modern soccer balls, SpringerPlus 2:171',
        url: 'https://doi.org/10.1186/2193-1801-2-171',
        date: '2013-04-19',
        kind: 'published',
      },
    ],
  },
  // Wave 7, B4: signed by the production (owner, 2026-11-06).
  {
    path: '/guides/stitch-and-seam-types',
    title: 'Stitch and Seam Types in Sportswear',
    description:
      'Stitch classes 100 to 600, seam types, flatlock vs overlock vs coverstitch, how seam strength is tested, and how to write stitches in your spec.',
    heading: 'Stitch and seam types,',
    headingAccent: 'by the numbers.',
    lede: 'A seam comes down to two choices: the stitch, formed from one or more threads, and the seam type, which is how the fabric layers sit. Standards give both a number. This guide explains the numbers, the seams sportswear uses, and how to write them in your spec.',
    sections: [
      {
        heading: 'What do stitch numbers such as 301 and 401 mean?',
        blocks: [
          {
            kind: 'text',
            text: 'Each number names one stitch type. ASTM D6193 sorts stitches into six classes, numbered 100 to 600, and a three-digit number names one type within its class, so 301 belongs to the lockstitch class, 300. ISO 4915 also classifies stitch types for hand- and machine-sewn seams, and research on knit garments uses its numbers.',
          },
          {
            kind: 'table',
            caption: 'The six stitch classes in ASTM D6193',
            columns: ['Class', 'Name'],
            rows: [
              ['100', 'Chain stitch with one needle thread'],
              ['200', 'Hand stitch'],
              ['300', 'Lockstitch'],
              ['400', 'Multi-thread chain stitch'],
              ['500', 'Overlock stitch'],
              ['600', 'Covering chain stitch'],
            ],
          },
          {
            kind: 'list',
            items: [
              '101. One needle thread passes through the fabric and loops with itself on the underside.',
              '301, lockstitch. A needle thread and a bobbin thread interlace midway between the two surfaces of the fabric.',
              '401, chainstitch. The needle thread loops with a looper thread, and the loops are drawn against the underside of the bottom layer.',
              'The standards. ASTM D6193-16, reaffirmed in 2025, says how each stitch type is formed and what it is generally for, and draws each one. ISO 4915 dates from 1991; it was last confirmed in 2021 and went under systematic review again on 15 July 2026. The class lists on this page follow a 2019 textiles book chapter that lists the classes of ASTM D6193 and ISO 4916.',
            ],
          },
        ],
      },
      {
        heading: 'What are the seam types?',
        blocks: [
          {
            kind: 'text',
            text: 'A seam type describes how the layers of fabric lie where they are joined. ASTM D6193 has six seam classes, and ISO 4916 has eight, adding one for attaching separate items and one for single-ply construction. ISO gives each seam type its own number, such as 4.04.01, and ISO 4916 is read together with ISO 4915.',
          },
          {
            kind: 'table',
            caption: 'Seam classes, with one example of each',
            columns: ['Class', 'One example'],
            rows: [
              [
                'Superimposed (ISO 1, ASTM SS)',
                'Layers laid on top of each other and sewn with rows of 301 or 401 stitches a set distance from the edges (SSa-2)',
              ],
              [
                'Lapped (ISO 2, ASTM LS)',
                'Layers overlapped by a set distance and sewn with one or more rows of stitches (LSa-1)',
              ],
              [
                'Bound (ISO 3, ASTM BS)',
                'A binding strip folded over the edge of the fabric and sewn through both (BSa-1)',
              ],
              [
                'Flat (ISO 4, ASTM FS)',
                'Two turned edges butted together, with a row of stitches running across and covering them (FSc-1)',
              ],
              ['Ornamental (ISO 5, ASTM OS)', 'Decorative stitching, as ISO names the class'],
              [
                'Edge finishing (ISO 6, ASTM EF)',
                'The edge turned and stitched to the fabric, as in a hem (EFa-1)',
              ],
              ['Attaching separate items (ISO 7)', 'ISO only'],
              ['Single-ply construction (ISO 8)', 'ISO only'],
            ],
          },
          {
            kind: 'list',
            items: [
              'The standards. ISO 4916:1991 classifies stitched seams and illustrates the cross-section of each, and was last confirmed in 2022. ASTM D6193 draws its seam types in figures 70 to 288.',
            ],
          },
        ],
      },
      {
        heading: 'Which stitches and seams does sportswear use?',
        blocks: [
          {
            kind: 'text',
            text: 'In one study of knit garment worksheets, stitch 406 was used most, then 401. A second study by the same authors found the joining stitch, overlock 514, missing from knit sewing specs, and expected it was in fact the stitch used most. On knit tops, 406 was the stitch used most at hems and sleeve edges.',
          },
          {
            kind: 'list',
            items: [
              'Three common seam methods. A Cornell University study names overlock, flatlock and adhesive seams as the three typical seams of sportswear construction. Adhesive seams were the thinnest of the three.',
              'Bonded and taped seams. Our glossary explains both, and our trims guide covers seam-sealing tape.',
              'Bar-tacks. Bar-tack stitching, which reinforces points that take strain, is in our glossary.',
            ],
            links: [
              { phrase: 'Our glossary', href: '/glossary' },
              { phrase: 'our trims guide', href: '/guides/apparel-trims' },
              { phrase: 'our glossary', href: '/glossary#bar-tack' },
            ],
          },
        ],
      },
      {
        heading: 'Flatlock vs overlock: what is the difference?',
        blocks: [
          {
            kind: 'text',
            text: 'They are different stitch classes that make different seams. Overlock stitches are class 500, and one study joined layers laid on top of each other, a superimposed seam, with overlock 514. Flatlock machines form cover stitch 607, from class 600, and make most of the flat, elastic seams in activewear. Each has trade-offs.',
          },
          {
            kind: 'table',
            caption: 'Overlock and flatlock seams in published studies',
            columns: ['In the studies', 'Overlock', 'Flatlock'],
            rows: [
              ['Stitch class', '500, such as 514', '600, stitch 607'],
              ['Seam built', 'Superimposed', 'Lapped'],
              ['Moisture transport', 'Lower', 'Better'],
              ['Weight added', 'Less', 'The most, from dense stitching'],
              ['Warmth', 'Lower insulation', 'Higher insulation, lower air permeability'],
              ['Water vapor transport', 'No significant difference', 'No significant difference'],
              ['Burst strength on knit fabrics', 'Generally lower', 'Generally higher'],
            ],
          },
          {
            kind: 'list',
            items: [
              'The moisture study. Its flatlock seam was lapped and its overlock seam superimposed, so the stitch and the seam type changed together. Seams with fewer stitches per inch also moved moisture better.',
              'Fabric first. In a 2026 burst-strength study, the pairing of fabrics mattered more to seam strength than the stitch type did.',
              'In our glossary. Flatlock and overlock seams each have a one-line entry.',
            ],
            links: [{ phrase: 'our glossary', href: '/glossary' }],
          },
        ],
      },
      {
        heading: 'Flatlock vs coverstitch: what is the difference?',
        blocks: [
          {
            kind: 'text',
            text: 'Flatlock is a kind of cover stitch: both belong to class 600, the covering chain stitches. What differs is the job. Flatlock stitch 607 joins two pieces into one seam. In a study of knit specs, cover stitches 602 and 605 were used instead in the second step of a two-step seam, after overlock stitch 504.',
          },
          {
            kind: 'list',
            items: [
              'The seam in that study. It was ISO 4916 No. 4.04.01, and stitch 406 was also used in its second step.',
            ],
          },
        ],
      },
      {
        heading: 'Coverstitch vs serger: what is the difference?',
        blocks: [
          {
            kind: 'text',
            text: 'A serger is an overlock machine: it can stitch, trim and overcast an edge all at the same time. Overlock stitching is class 500, and coverstitch class 600. On knit garments the two do different jobs: the overlock stitch joins the pieces, and a cover stitch can follow as a second step, as shown above.',
          },
        ],
      },
      {
        heading: 'What makes a seam good?',
        blocks: [
          {
            kind: 'text',
            text: 'ASTM D6193 judges a sewn seam on strength, elasticity, durability, security and appearance, and the end use decides which matter most. A seam should stretch slightly more than the fabric it joins. Its security rests mainly on the stitch type, the stitch density and how easily the seam unravels.',
          },
          {
            kind: 'list',
            items: [
              'Strength. It rests on the fabric, the seam and stitch types, the stitch density, counted per inch, and the thread’s tension and strength.',
              'Seam engineering. It is used to choose the best combination of thread, stitch type, seam type and stitch density. ASTM D6193 warns that a wrong choice of any of the first three can make the seam fail, and with it the product.',
            ],
          },
        ],
      },
      {
        heading: 'How is a seam tested?',
        blocks: [
          {
            kind: 'text',
            text: 'Two standard tests measure the force a sewn seam takes when pulled across it: ISO 13935-2, the grab method, and ASTM D1683. Both are written for woven fabrics; ISO’s also covers stretch wovens, but straight seams only. On request, we arrange a seam strength report from an outside lab, quoted per order.',
          },
          {
            kind: 'list',
            items: [
              'New edition. ISO 13935-2’s third edition came out in April 2026, replacing the 2014 edition.',
              'Knit seams. A 2026 study of knit sportswear seams tested them by bursting instead.',
            ],
          },
        ],
      },
      {
        heading: 'How should I write stitches and seams in my spec?',
        blocks: [
          {
            kind: 'text',
            text: 'Give each seam its stitch number and seam class, as well as its name. In a study of 464 knit garment worksheets from small companies, only about 3 in 100 stitches carried an ISO 4915 number. The authors conclude that standard numbers can cut communication errors between production departments. We work from either system, ISO or ASTM, whichever you write.',
          },
          {
            kind: 'list',
            items: [
              'An example. Written out, a side seam could read: stitch 514, superimposed seam, ISO 4916 class 1.',
              // Back with the tech pack guide (C1, 2026-11-06), in the draft's place.
              'The rest of your spec. Our tech pack guide sets out what else a spec states.',
            ],
            links: [{ phrase: 'Our tech pack guide', href: '/guides/tech-pack-template' }],
          },
        ],
      },
      {
        heading: 'Soccer balls: what does the seam change?',
        blocks: [
          {
            kind: 'text',
            text: 'A ball’s seams are where its panels meet. FIFA says hand-stitched balls "have deep and strong seams that benefit the durability of the ball", and that machine stitching is often used for balls that meet the minimum quality requirements at a competitive price. In a 2025 study, stitched balls took up more water than stitchless balls.',
          },
          {
            kind: 'list',
            items: [
              'How water gets in. The study proposed two ways: absorption into the panel material, and ingress between the panels. FIFA changed its test requirements in 2015 to reflect the better water resistance that came with thermal bonding.',
              'Joints and drag. In a 2018 wind-tunnel study of ten recent match balls, drag at high speed tended to rise as the panel joints got longer, and the depth of the joints was the strongest guide to the critical speed where drag falls.',
              'World Cup balls. FIFA says every World Cup ball from 2006 on was made by thermal bonding.',
              'Hand stitching, in FIFA’s words. "On average, a worker can make two balls in 8 hours".',
              'The four builds. Our ball guide explains how each kind of ball is built.',
            ],
            links: [{ phrase: 'Our ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
        ],
      },
      {
        heading: 'On our floor',
        stage: 'whole-stitching',
        blocks: [
          {
            kind: 'text',
            text: 'Our stitching floor sews six kinds of stitching: overlock, cover-stitch, flatlock, lockstitch (301), chainstitch (401) and bar-tack. Bulk is sewn only once your sample is approved, and our FAQ says how seams are checked during production. One of our garments with flatlock seams turns in 3D below.',
            links: [{ phrase: 'our FAQ', href: '/faq/quality-and-certifications#checks' }],
          },
        ],
      },
      {
        heading: 'Choosing seams for your order',
        blocks: [
          {
            kind: 'text',
            text: 'Three questions help with a seam choice: how far the seam must stretch, whether it lies against the skin, and whether it must keep water out. The sections above, and our glossary’s seam entries, cover each one. Write your choices into your spec, with stitch numbers if you have them, and send it to us.',
            links: [{ phrase: 'send it to us', href: '/contact' }],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'ISO 4915:1991, Textiles, Stitch types, Classification and terminology',
        url: 'https://www.iso.org/standard/10932.html',
        date: '2026-07-15',
        kind: 'published',
      },
      {
        name: 'ISO 4916:1991, Textiles, Seam types, Classification and terminology',
        url: 'https://www.iso.org/standard/10934.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ASTM D6193-16(2025), Standard Practice for Stitches and Seams',
        url: 'https://store.astm.org/d6193-16r25.html',
        date: '2025-11-10',
        kind: 'updated',
      },
      {
        name: 'Gurarda, Seam Performance of Garments, IntechOpen (Tables 1 and 2)',
        url: 'https://doi.org/10.5772/intechopen.86436',
        date: '2019-05-22',
        kind: 'published',
      },
      {
        name: 'ASTM D1683/D1683M-22, Standard Test Method for Failure in Sewn Seams of Woven Fabrics',
        url: 'https://store.astm.org/d1683_d1683m-22.html',
        date: '2022-04-19',
        kind: 'updated',
      },
      {
        name: 'ISO 13935-2:2026, Textiles, Seam tensile properties of fabrics and made-up textile articles, Part 2: Determination of maximum force to seam rupture using the grab method',
        url: 'https://www.iso.org/standard/88344.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Lee and Ha, the usage of clothing stitches in cut and sewn knit garment fabrication, Family and Environment Research',
        url: 'https://doi.org/10.6115/fer.2019.007',
        date: '2019-02-19',
        kind: 'published',
      },
      {
        name: 'Lee and Ha, A Study on Current State in Stitches and Seams Usage for Building Smart Sewing Systems: Focused on Sewing Specification of Cut and Sewn Knit, Family and Environment Research',
        url: 'https://doi.org/10.6115/fer.2020.026',
        date: '2020-08-20',
        kind: 'published',
      },
      {
        name: 'Nemeša, Flatlock sewing machines, Tekstilna industrija',
        url: 'https://doi.org/10.5937/tekstind2302017n',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Maanvizhi, Prakash and Rameshbabu, Effect of Stitch Density and Stitch Type on the Moisture Management Properties of Seams for High Active Sportswear Application, Fibres & Textiles in Eastern Europe 28, 6(144)',
        url: 'https://doi.org/10.5604/01.3001.0014.3263',
        date: '2020-12-31',
        kind: 'published',
      },
      {
        name: 'Beaudette and Park, thermal comfort evaluation of seam types in athletic bodywear, ITAA Proceedings (Cornell University)',
        url: 'https://doi.org/10.31274/itaa_proceedings-180814-154',
        date: '2015-11-13',
        kind: 'published',
      },
      {
        name: 'Beaudette and Park, Impact of seam types on thermal properties of athletic bodywear, Textile Research Journal',
        url: 'https://doi.org/10.1177/0040517516648506',
        date: '2016-06-03',
        kind: 'published',
      },
      {
        name: 'Tama Birkocak, Aslan, Boğa, Özdemir and Acar, Evaluation of Seam Performance of Knitted Fabric Combinations in Sportswear, Süleyman Demirel University Journal of Natural and Applied Sciences 30(1)',
        url: 'https://doi.org/10.19113/sdufenbed.1782958',
        date: '2026-04-24',
        kind: 'published',
      },
      {
        name: 'Young, Clothing Management: Serger Sense, Utah State University Extension',
        url: 'https://digitalcommons.usu.edu/extension_histall/227',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'FIFA, The making of a football',
        url: 'https://inside.fifa.com/innovation/news/the-making-of-a-football',
        date: '2018-08-06',
        kind: 'published',
      },
      {
        name: 'Phillips, Harland, Mitchell and Lepper, static water uptake of leather and synthetic association footballs, Sports Engineering',
        url: 'https://doi.org/10.1007/s12283-025-00521-8',
        date: '2025-09-13',
        kind: 'published',
      },
      {
        name: 'Naito and others, Effect of seam characteristics on critical Reynolds number in footballs, Mechanical Engineering Journal 5(1)',
        url: 'https://doi.org/10.1299/mej.17-00369',
        date: '2018-01-19',
        kind: 'published',
      },
    ],
  },
  // Wave 8, B13: signed by the production (owner, 2026-11-06).
  {
    path: '/guides/outerwear-and-waterproof-fabrics',
    title: 'Waterproof and Breathable Outerwear Fabrics',
    description:
      'Ripstop, softshell, coated and membrane fabrics for outerwear, what water column and breathability ratings mean, the tests to name, and sealed seams.',
    heading: 'Outerwear and waterproof fabrics,',
    headingAccent: 'test by test.',
    lede: 'A jacket keeps rain out through its fabric, its finish and its seams. This guide covers the outerwear fabrics we use, what the ratings on a fabric sheet mean, and which tests to name in your spec.',
    sections: [
      {
        heading: 'The outerwear fabrics we make',
        blocks: [
          {
            kind: 'text',
            text: 'We make outerwear in ripstop, softshell, PU-coated (polyurethane-coated) fabric and membrane-laminated fabric, and other options as well. Ripstop’s woven grid stops a tear spreading, softshell adds stretch, and a coating or a laminated membrane keeps water out. The sections below explain how each works and which tests rate it.',
          },
          {
            kind: 'list',
            items: [
              'Shell and lining. Our Metro-Shield Suit pairs a textured woven polyester shell with a polyester taffeta lining. Both fabrics are described in our fabrics guide.',
            ],
            links: [
              { phrase: 'Metro-Shield Suit', href: '/products/r-mss' },
              { phrase: 'our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'How a fabric keeps rain out',
        blocks: [
          {
            kind: 'text',
            text: 'Waterproof breathable fabrics come in three types: a high-density fabric, a coated fabric, or a fabric laminated with a membrane. Coated fabrics keep water out well but let little water vapor through. Membranes are fixed to a support fabric under heat and pressure, and they work in one of two ways.',
          },
          {
            kind: 'list',
            items: [
              'Microporous membranes let water vapor pass out from the body and keep liquid water from coming in.',
              'Non-porous membranes, which attract water, move the vapor through by diffusion.',
              'How they are judged. By hydrostatic pressure, by water contact angle, the angle a drop makes on the surface, and by water-vapor transfer rate. The next sections explain the tests behind these figures.',
            ],
          },
        ],
      },
      {
        heading: 'Water-repellent, water-resistant or waterproof?',
        blocks: [
          {
            kind: 'text',
            text: 'Name the test in your spec, not only the word, because each test answers a different question. A spray test rates how well the surface resists wetting and does not measure water passing through. Rain tests predict how much rain gets through a garment fabric. A hydrostatic test measures resistance to water under pressure.',
          },
          {
            kind: 'table',
            caption: 'Which test answers which question',
            columns: ['Test', 'What it measures'],
            rows: [
              [
                'ISO 4920 and AATCC TM22 (spray)',
                'Surface wetting; suits checking a water-repellent finish',
              ],
              [
                'ISO 9865 (Bundesmann rain shower)',
                'Water repellency under an artificial rain shower',
              ],
              ['AATCC TM35 (rain) and TM42 (impact)', 'Rain penetrating a garment fabric'],
              [
                'ISO 811 and AATCC TM127 (hydrostatic)',
                'Resistance to water pressing on the fabric',
              ],
              ['ISO 1420 (hydrostatic)', 'The same, for rubber- or plastics-coated fabrics'],
            ],
          },
        ],
      },
      {
        heading: 'What a water column rating means',
        blocks: [
          {
            kind: 'text',
            text: 'A water column, or hydrostatic head, is the fabric’s resistance to water pushed against it under pressure, found with a hydrostatic test such as ISO 811. A figure in millimeters of water is a pressure: one millimeter of water equals 9.80665 pascals. A test report should name the method that gave the figure.',
          },
          {
            kind: 'list',
            items: [
              'Which fabrics ISO 811 covers. Every fabric meant to be water resistant, with or without a water-repellent finish. ISO confirmed its 2018 edition as current in September 2025.',
              'Other units. One pound per square inch (psi) is 6,894.757 pascals, or about 703 millimeters of water.',
            ],
          },
        ],
      },
      {
        heading: 'What a breathability rating means',
        blocks: [
          {
            kind: 'text',
            text: 'Breathability figures come from different tests. ISO 11092 measures water-vapor resistance on a sweating hot plate; ISO published its third edition in May 2026. ASTM E96 measures water-vapor transmission instead, and says a result under one set of conditions cannot predict a result under another. Ask which test, and which edition, gave a figure.',
          },
          {
            kind: 'list',
            items: [
              'Two kinds of number. ISO 11092 gives a resistance and ASTM E96 a transmission rate, so the two figures are not the same kind.',
              'The old edition. ISO withdrew ISO 11092:2014 on 22 May 2026, when the 2026 edition replaced it.',
              'Hot plates and garments. ASTM F1868, another sweating hot plate method, says its values may or may not indicate a material’s relative merit.',
              'Quick checks. ISO 15496 is a simple check for use in a plant, not for classifying fabrics against the physiological values that product standards set.',
              'Warmth and air. ISO 11092 also measures thermal resistance. Air passing through a fabric is a different property, which our fabrics guide explains.',
            ],
            links: [
              { phrase: 'our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'Water-repellent finishes (DWR)',
        blocks: [
          {
            kind: 'text',
            text: 'A durable water repellent, or DWR, is a finish that makes a textile repel water; fluorinated ones repel stains too. In one peer-reviewed Swedish study, short-chain fluorinated and non-fluorinated DWRs both showed excellent water repellency and durability in some cases, but the non-fluorinated ones could not repel oil.',
          },
          {
            kind: 'list',
            items: [
              'Your order. Which water repellent a fabric gets depends on the order; your quote states the water repellent.',
              'An oil test. AATCC TM118, an oil repellency test, detects a fluorochemical finish or another compound that gives a low-energy surface.',
              'PFAS. New York’s environmental regulator describes PFAS as fluorinated organic chemicals with at least one fully fluorinated carbon atom, used for stain resistance and for water and oil repellency. Our compliance guide sets out each market’s rules on PFAS in clothing.',
            ],
            links: [
              { phrase: 'Our compliance guide', href: '/guides/sportswear-compliance-by-market' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'How long waterproofing lasts',
        blocks: [
          {
            kind: 'text',
            text: 'RMIT University researchers put waterproof breathable fabrics used in sailing apparel through simulated hard, wet wear. Afterwards, heavier and thicker fabrics tended to need more water pressure before they leaked. The researchers noted in 2017 that there were no standard methods for testing how long waterproofing lasts in those conditions. Agree the test and its conditions with us in writing.',
          },
        ],
      },
      {
        heading: 'Sealed seams',
        blocks: [
          {
            kind: 'text',
            text: 'Stitching leaves holes that rain can get through. Taped seams have tape sealed over the stitching to close them, and bonded seams join the panels with heat-bonded tape. We apply seam-sealing tape on our own floor, and reflective tape there too.',
          },
          {
            kind: 'list',
            items: [
              'Europe’s rain standard. EN 343:2019 set requirements for ready-made garments, materials and seams of protective clothing against precipitation, fog and ground humidity. It was withdrawn on 3 November 2025, the day EN ISO 24232:2025 became valid; that standard is the European adoption of ISO 24232:2024.',
              'What the new standard covers. Materials and ready-made garments for the same weather, rain and snow included; footwear, gloves and separate headwear are left out.',
              'Tapes as trims. Our trims guide covers seam tape and reflective tape as trims.',
            ],
            links: [{ phrase: 'Our trims guide', href: '/guides/apparel-trims' }],
          },
        ],
      },
      {
        heading: 'Coated fabric and customs codes',
        blocks: [
          {
            kind: 'text',
            text: 'Construction can change a fabric’s customs code. Under the UK tariff’s notes, heading 5903 leaves out a plastics-coated fabric whose coating cannot be seen with the naked eye, among other exclusions. A fabric bonded to a plastic film counts as laminated even if the film cannot be seen in the cross-section. Your broker confirms the full national code.',
          },
          {
            kind: 'list',
            items: [
              'Garments. Garments made of such fabrics have their own headings: 6210 for woven and 6113 for knitted. HS codes are explained in our shipping guide.',
            ],
            links: [{ phrase: 'our shipping guide', href: '/guides/shipping-and-import-duties' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Your spec and lab reports',
        blocks: [
          {
            kind: 'text',
            text: 'Write into your spec the test, its edition and the result required for each property you care about. For hydrostatic, rain, spray and breathability tests, we can obtain third-party lab reports at your cost. Send us your spec, or a reference garment, with your inquiry.',
          },
          {
            kind: 'list',
            items: [
              'Soccer balls. For FIFA’s water absorption test and the rest of its ball tests, see our ball guide.',
            ],
            links: [{ phrase: 'our ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
        ],
      },
    ],
    garments: {
      heading: 'Seen on our reference garments',
      after: 'The outerwear fabrics we make',
      picks: [
        { slug: 'r-kmj', shows: 'Softshell' },
        { slug: 'r-mss', shows: 'Taped seams' },
        { slug: 'r-vcj', shows: 'DWR finish' },
      ],
    },
    sources: [
      {
        name: 'ISO 811:2018, resistance to water penetration, hydrostatic pressure test',
        url: 'https://committee.iso.org/standard/65149.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'ISO 4920:2012, resistance to surface wetting, spray test',
        url: 'https://committee.iso.org/standard/50706.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'ISO 9865:1991, water repellency, Bundesmann rain-shower test',
        url: 'https://committee.iso.org/standard/17742.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'ISO 1420:2016, rubber- or plastics-coated fabrics, resistance to penetration by water',
        url: 'https://committee.iso.org/standard/61707.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'AATCC TM127, water resistance, hydrostatic pressure test',
        url: 'https://members.aatcc.org/store/tm127/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC TM22, water repellency, spray test',
        url: 'https://members.aatcc.org/store/tm22/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC TM35, water resistance, rain test',
        url: 'https://members.aatcc.org/store/tm35/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC TM42, water resistance, impact penetration test',
        url: 'https://members.aatcc.org/store/tm42/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 11092:2026, thermal and water-vapor resistance, sweating guarded-hotplate test',
        url: 'https://committee.iso.org/standard/85998.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO 11092:2014 (withdrawn 2026-05-22)',
        url: 'https://committee.iso.org/standard/65962.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ASTM F1868, thermal and evaporative resistance, sweating hot plate',
        url: 'https://www.astm.org/Standards/F1868.htm',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ASTM E96/E96M, water vapor transmission of materials',
        url: 'https://www.astm.org/Standards/E96.htm',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 15496:2018, water vapor permeability, quick quality-control method',
        url: 'https://committee.iso.org/standard/65150.html',
        date: '2026-11-06',
        kind: 'published',
      },
      {
        name: 'ISO 24232:2024, protective clothing, protection against rain',
        url: 'https://committee.iso.org/standard/78153.html',
        date: '2026-11-06',
        kind: 'published',
      },
      {
        name: 'Estonian Centre for Standardisation, EVS-EN ISO 24232:2025',
        url: 'https://www.evs.ee/en/evs-en-iso-24232-2025',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Estonian Centre for Standardisation, EVS-EN 343:2019 (withdrawn)',
        url: 'https://www.evs.ee/en/evs-en-343-2019',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Chang and Liu, review of waterproof breathable membranes, Materials 16(15):5339',
        url: 'https://doi.org/10.3390/ma16155339',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Troynikov, Nawaz and Watson, durability of waterproof textiles in sailing apparel, Textile Research Journal 88(24)',
        url: 'https://doi.org/10.1177/0040517517732079',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Schellenberger et al., durable water repellents for outdoor fabrics, Chemosphere 193',
        url: 'https://doi.org/10.1016/j.chemosphere.2017.11.027',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'AATCC TM118, oil repellency',
        url: 'https://members.aatcc.org/store/tm118/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'New York State Department of Environmental Conservation, PFAS in Apparel Law',
        url: 'https://dec.ny.gov/environmental-protection/help-for-businesses/pfas-in-apparel-law',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'UK Integrated Online Tariff, chapter 59 notes',
        url: 'https://www.trade-tariff.service.gov.uk/chapters/59',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'UK Integrated Online Tariff, headings 6210 and 6113',
        url: 'https://www.trade-tariff.service.gov.uk/headings/6210',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'NIST, Guide for the Use of the SI (SP 811), Appendix B.9, conversion factors',
        url: 'https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9',
        date: '2026-11-05',
        kind: 'read',
      },
    ],
  },
  // Wave 8, B12: signed by the production (owner, 2026-11-06).
  {
    path: '/guides/dyeing-and-color-matching',
    title: 'Fabric Dyeing, Finishes and Color Matching',
    description:
      'Which dye suits polyester, nylon or cotton, how a lab dip is approved and checked under D65 light, colorfastness tests for sport, and fabric finishes.',
    heading: 'Dyeing and color matching,',
    headingAccent: 'from lab dip to bulk.',
    lede: 'This guide follows your color from the lab dip to the bulk fabric. It explains how each fiber takes dye, how a color is judged, which tests show whether it lasts, and which finishes you can ask for.',
    sections: [
      {
        heading: 'From your color to the bulk fabric',
        blocks: [
          {
            kind: 'text',
            text: 'Our fabric suppliers dye the fabric, and we check color by eye in our color cabinet, under D65 daylight and other lights. A lab dip is fabric dyed to match your color. You approve a lab dip before bulk; your quote states the time. The steps below show the path.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              'You send the color you want, for example a Pantone reference.',
              'Our fabric supplier dyes the lab dip, and we check it in our color cabinet before it reaches you.',
              'You approve the lab dip.',
              'When the bulk fabric is dyed, we check its shade against your approved lab dip in the cabinet, lot by lot.',
            ],
          },
          {
            kind: 'list',
            items: [
              'A printed color is approved on a strike-off instead.',
              'Swatches can reach you before the sample too.',
            ],
            links: [
              { phrase: 'strike-off', href: '/guides/garment-printing-methods' },
              { phrase: 'before the sample', href: '/guides/minimum-order-and-samples' },
            ],
          },
        ],
      },
      {
        heading: 'Which dye suits which fiber',
        blocks: [
          {
            kind: 'text',
            text: 'The dye class follows the fiber. Polyester takes disperse dyes; nylon takes acid dyes, held by ionic bonds; cotton takes reactive dyes, which bond covalently with the fiber. Disperse dyes also work on nylon. For a blend, ask how each fiber in it is dyed.',
          },
          {
            kind: 'table',
            caption: 'Fiber, dye class and dye bath',
            columns: ['Fiber', 'Dye class', 'Dye bath'],
            rows: [
              ['Polyester', 'Disperse', '130 °C, or below 100 °C with carriers'],
              ['Nylon', 'Acid', 'Acidic; ionic bonds hold the dye'],
              ['Cotton', 'Reactive', 'Alkaline; the dye bonds covalently'],
            ],
          },
          {
            kind: 'list',
            items: [
              'Washing. Acid dyes generally show poor wash fastness but better lightfastness, so a wash test on dyed nylon is worth asking for. Some reactive dye stays unfixed on the surface of cotton and washes off easily.',
              'Polyester. Its fibers repel water by nature, which makes them harder to dye. Carriers are dyeing aids that let the dyeing run below 100 °C.',
              'Each fiber in depth is in our fibers guide.',
            ],
            links: [{ phrase: 'our fibers guide', href: '/guides/sportswear-fibers' }],
          },
        ],
      },
      {
        heading: 'Judging a lab dip by eye',
        blocks: [
          {
            kind: 'text',
            text: 'Two standards describe judging a color by eye. ASTM D1729, a practice for visual color appraisal, notes that the International Commission on Illumination (CIE) recommends simulated average daylight, D65. AATCC EP9 gives a procedure for comparing a textile with its standard by eye and describing the difference. Our own check is visual too.',
          },
          {
            kind: 'list',
            items: [
              'What D65 is. The CIE’s standard illuminant D65 represents average daylight, at a correlated color temperature of about 6,500 kelvin.',
              'Pantone. How we match a Pantone color is in our FAQ.',
            ],
            links: [{ phrase: 'our FAQ', href: '/faq/fabrics-and-printing#pantone' }],
          },
        ],
      },
      {
        heading: 'Why a color can match in one light and not another',
        blocks: [
          {
            kind: 'text',
            text: 'Two samples can match under one light and differ under another. The CIE calls colors that differ in spectrum yet share the same tristimulus values, the three numbers that describe a color, "metameric". Such a match breaks down when the light or the observer changes, so agree the approval lights first.',
          },
          {
            kind: 'list',
            items: [
              'A number for the mismatch. The CIE’s metamerism index expresses it as a color difference, caused by swapping the reference light for a test light.',
              'Screens. A screen shows color differently again; our 3D guide explains why a render cannot settle color.',
            ],
            links: [{ phrase: 'our 3D guide', href: '/guides/3d-garment-reference' }],
          },
        ],
      },
      {
        heading: 'How a color difference is graded',
        blocks: [
          {
            kind: 'text',
            text: 'By eye with a gray scale, or by instrument with a formula. ISO 105-A02’s gray scale has five steps of paired gray chips, or nine with half steps, for grading color change. ISO 105-J03 calculates a difference and lets the tolerance depend on how close a match the end use needs.',
          },
          {
            kind: 'list',
            items: [
              'After a colorfastness test. AATCC EP1 uses a gray scale to judge the change in color. AATCC EP7 is its instrument alternative, except for tests that involve solutions containing fluorescent whitening agents.',
              'A newer formula. CIEDE2000, published as ISO/CIE 11664-6, extends the CIE 1976 L\\*a\\*b\\* color-difference formula with corrections.',
            ],
          },
        ],
      },
      {
        heading: 'Will the color last in sport?',
        blocks: [
          {
            kind: 'text',
            text: 'How long a color lasts depends on the dye, the fiber and what the garment meets. Standard tests cover daylight, chlorinated pool water, sweat and sea water, and results are graded with a gray scale. We can have any of them run by a third-party lab, with the report paid for by you.',
          },
          {
            kind: 'table',
            caption: 'Colorfastness tests for sport',
            columns: ['The color meets', 'Test'],
            rows: [
              ['Daylight', 'ISO 105-B02, with a xenon lamp standing in for daylight (D65)'],
              ['Pool water', 'ISO 105-E03 or AATCC TM162'],
              ['Sweat', 'ISO 105-E04'],
              ['Sea water', 'AATCC TM106'],
            ],
          },
          {
            kind: 'list',
            items: [
              'Swimwear. ISO 105-E03’s active chlorine strengths of 50 and 100 milligrams per liter are meant for swimwear.',
              'Washing and rubbing tests are in our printing guide.',
              'Our own checks on fabric when it arrives are in the fabrics guide.',
            ],
            links: [
              { phrase: 'our printing guide', href: '/guides/garment-printing-methods' },
              { phrase: 'the fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'Finishes on request',
        blocks: [
          {
            kind: 'text',
            text: 'Any finish on request; your quote states it. Each finish has its own tests. AATCC’s wicking methods measure how liquid moves along or through a fabric, and ISO 20743 measures antibacterial activity, whatever the agent and however it was applied. Water repellents are covered in the outerwear guide.',
            links: [
              { phrase: 'the outerwear guide', href: '/guides/outerwear-and-waterproof-fabrics' },
            ],
          },
          {
            kind: 'list',
            items: [
              'Wicking tests. AATCC TM197 and TM213 test vertical wicking, to distances and to times; TM198 tests horizontal wicking; TM195 classifies liquid moisture management. Our fabrics guide explains wicking itself.',
              'Killing bacteria. If a finish is meant or implied to kill bacteria, AATCC TM100 says quantitative evaluation is necessary; AATCC TM147 gives only a rough estimate.',
            ],
            links: [
              { phrase: 'Our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
        ],
      },
      {
        heading: 'Claims about an antibacterial finish',
        blocks: [
          {
            kind: 'text',
            text: 'In the US, an article treated with a pesticide only to protect the article itself is exempt from registration, if the pesticide is registered for that use. The EPA says that exemption covers protecting the product, not public health. In the EU, a treated article whose maker claims biocidal properties must carry a label saying so.',
          },
          {
            kind: 'list',
            items: [
              'The EU label also names the active substances.',
              'Environmental claims about a dye or a finish are covered in our compliance guide.',
            ],
            links: [
              { phrase: 'our compliance guide', href: '/guides/sportswear-compliance-by-market' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'What to send us',
        blocks: [
          {
            kind: 'text',
            text: 'Start with three things in your inquiry: the color you want matched, the lights it will be seen under, and any test or finish you need. Name each test by its number, as this page does, so the lab tests exactly what you mean.',
          },
        ],
      },
    ],
    sources: [
      {
        name: 'Berradi et al., textile dyes and their removal, Heliyon 5(11):e02711',
        url: 'https://doi.org/10.1016/j.heliyon.2019.e02711',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Negi, review of dyes and fibers, Polymers 17(7):871',
        url: 'https://doi.org/10.3390/polym17070871',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Śmigiel-Kamińska et al., disperse dyes, Molecules 24(3):613',
        url: 'https://doi.org/10.3390/molecules24030613',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Al-Etaibi and El-Apasery, dyeing polyester with disperse dyes, Polymers 16(4):453',
        url: 'https://doi.org/10.3390/polym16040453',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ASTM D1729-22, visual appraisal of colors and color differences',
        url: 'https://store.astm.org/d1729-22.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO/CIE 11664-2:2022, colorimetry, CIE standard illuminants',
        url: 'https://committee.iso.org/standard/77215.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'CIE, International Lighting Vocabulary, 17-23-008 metameric colour stimuli',
        url: 'https://cie.co.at/eilvterm/17-23-008',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'CIE 080-1989, special metamerism index: change in observer',
        url: 'https://www.cie.co.at/publications/special-metamerism-index-change-observer',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'CIE, International Lighting Vocabulary, 17-23-007 metamerism index',
        url: 'https://cie.co.at/node/6868',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC EP9, visual assessment of color difference of textiles',
        url: 'https://members.aatcc.org/store/ep9/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 105-J03:2009, calculation of color differences',
        url: 'https://committee.iso.org/standard/51385.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'ISO/CIE 11664-6:2022, CIEDE2000 color-difference formula',
        url: 'https://cie.co.at/publications/colorimetry-part-6-ciede2000-colour-difference-formula-1',
        date: '2026-11-06',
        kind: 'published',
      },
      {
        name: 'ISO 105-A02:1993, gray scale for assessing change in color',
        url: 'https://committee.iso.org/standard/3785.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'AATCC EP1, gray scale for color change',
        url: 'https://members.aatcc.org/store/ep1/459/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC EP7, instrumental assessment of color change',
        url: 'https://members.aatcc.org/store/ep7/464/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 105-B02:2014, color fastness to artificial light, xenon arc lamp',
        url: 'https://committee.iso.org/standard/65209.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'ISO 105-E03:2010, color fastness to chlorinated water (swimming-pool water)',
        url: 'https://committee.iso.org/standard/52252.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'AATCC TM162, colorfastness to chlorinated pool water',
        url: 'https://members.aatcc.org/store/tm162/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 105-E04:2013, color fastness to perspiration',
        url: 'https://committee.iso.org/standard/57973.html',
        date: '2026-11-05',
        kind: 'published',
      },
      {
        name: 'AATCC TM106, colorfastness to sea water',
        url: 'https://members.aatcc.org/store/tm106/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC TM197, TM213 and TM198, vertical and horizontal wicking of textiles',
        url: 'https://members.aatcc.org/store/tm197/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC TM195, liquid moisture management of textile fabrics',
        url: 'https://members.aatcc.org/store/tm195/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 20743:2021, antibacterial activity of textile products',
        url: 'https://committee.iso.org/standard/79819.html',
        date: '2026-11-06',
        kind: 'published',
      },
      {
        name: 'AATCC TM100, antibacterial finishes on textile materials',
        url: 'https://members.aatcc.org/store/tm100/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC TM147, antibacterial activity, parallel streak method',
        url: 'https://members.aatcc.org/store/tm147/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'US Code of Federal Regulations, 40 CFR 152.25, exemptions (treated articles)',
        url: 'https://www.ecfr.gov/current/title-40/section-152.25',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'US Environmental Protection Agency, Consumer Products Treated with Pesticides',
        url: 'https://www.epa.gov/safepestcontrol/consumer-products-treated-pesticides',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Regulation (EU) No 528/2012 on biocidal products, Article 58, as amended by Regulation (EU) No 334/2014',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32012R0528',
        date: '2026-11-05',
        kind: 'read',
      },
    ],
  },
  // Wave 10, B5: signed by the production (owner, 2026-11-06).
  {
    path: '/guides/garment-cutting',
    title: 'Garment Cutting Process: Markers and Knives',
    description:
      'How a garment is cut: the marker and marker efficiency, spreading the plies, straight and band knives, die cutting, automatic cutters and ball panels.',
    heading: 'How a garment is cut,',
    headingAccent: 'layer by layer.',
    lede: 'Cutting turns rolls of fabric into the pieces a garment is sewn from, and it decides how much fabric an order needs. This guide explains the marker, spreading, the knives, the die press and the automatic cutter, and how soccer ball panels are cut.',
    sections: [
      {
        heading: 'What happens in a garment cutting room?',
        blocks: [
          {
            kind: 'text',
            text: 'The fabric is spread in layers on a cutting table, a marker showing every pattern piece goes on top, and the stack is cut along it with knives or a computer-controlled cutter. Cutters adjust their technique to the type of fabric and the style of garment. The cut pieces then go on to be sewn.',
          },
          {
            kind: 'list',
            items: [
              'The plan comes first. A 2025 paper that has not been peer reviewed describes cut order planning: deciding which orders and sizes are cut together.',
              'The details are checked. A 2025 article on garment production calls checking a style’s details before cutting critically important.',
            ],
          },
        ],
      },
      {
        heading: 'What is a marker, and what is marker efficiency?',
        blocks: [
          {
            kind: 'text',
            text: 'A marker is the plan of every pattern piece for one cut, laid out to fit the fabric’s width. Marker efficiency is how well that plan uses the fabric: the higher it is, the less fabric is wasted. Fabric width, the way the fabric is spread and the mix of sizes in the marker change it.',
          },
          {
            kind: 'list',
            items: [
              'Mixing sizes. In a 2024 study, varying both the marker’s width and the ratio of sizes in it gave higher efficiency than the factory’s own markers for one style. Our guide to minimum orders explains how to split an order across sizes.',
              'More than one marker. One cutting order may need several lays and markers, and choosing the right plan is one of the cutting room’s main challenges.',
              'Cost. The cut-planning paper ties the cost of cutting to the combined length of the pieces’ edges and the speed of cutting. What sets your price per piece, fabric use included, is in our cost guide.',
              'Our markers. Our marker software nests the pieces of the patterns we make in-house. Our pattern making guide explains how those patterns are made and graded.',
            ],
            links: [
              { phrase: 'our cost guide', href: '/guides/cost-to-start-an-activewear-brand' },
              { phrase: 'Our pattern making guide', href: '/guides/sportswear-pattern-making' },
              { phrase: 'Our guide to minimum orders', href: '/guides/minimum-order-and-samples' },
            ],
          },
        ],
      },
      {
        heading: 'How is fabric spread before cutting?',
        blocks: [
          {
            kind: 'text',
            text: 'Spreading lays the fabric on the cutting table in plies, one layer on top of another. How high the stack goes and how long each spread runs are set when the cut is planned. How the plies face each other matters too: in one study, spreading them face to face gave higher marker efficiency.',
          },
          {
            kind: 'list',
            items: [
              'Relaxed first. At our works, knit fabric is left to relax before it is spread.',
              'One lot for each garment. We cut all the pieces of one garment from the same fabric lot or roll. How the shade of bulk fabric is checked is in our dyeing guide.',
              'Planning by experience. A 2026 study describes cut planning that, in many small and medium-sized garment makers, remains manual and based on experience, which leads to significant material waste. Its method aims to improve how rolls are chosen and spread.',
            ],
            links: [{ phrase: 'our dyeing guide', href: '/guides/dyeing-and-color-matching' }],
          },
        ],
      },
      {
        heading: 'Straight knife or band knife: what is the difference?',
        blocks: [
          {
            kind: 'text',
            text: 'A straight knife moves its blade up and down. It cuts tall stacks and sharp curves, and RMIT University calls it the workhorse of larger cutting rooms. With a band knife the roles swap. Its blade stays in place while the operator moves the fabric past it, and it cuts more accurately than a straight knife.',
          },
          {
            kind: 'list',
            items: [
              'Ours. We cut with both kinds of knife.',
              'Stack heights. RMIT gives a straight knife stacks between 10 and 35 cm high. A round knife has a round blade, is best suited to stacks lower than a quarter of its blade’s diameter, and finds notches and corners hard. Notches are the small cuts in a piece’s edge that line it up with the next piece for sewing.',
              'Heat. At high speed a straight knife’s blade heats up, and that heat could affect synthetic fibers.',
              'Drill holes. A drill marks a point such as a pocket or a dart through every ply, and the hole must stay hidden from outside once the garment is finished.',
            ],
          },
        ],
      },
      {
        heading: 'When is die cutting used?',
        blocks: [
          {
            kind: 'text',
            text: 'A die is a rigid blade in the shape of one pattern piece, such as a collar or a pocket, and it cuts the piece’s notches with it. Dies are expensive to set up, so die cutting suits a piece that is cut the same way many times.',
          },
          {
            kind: 'list',
            items: [
              'Ours. Our cutting room has a die press; the soccer ball section below shows what it cuts.',
            ],
          },
        ],
      },
      {
        heading: 'What does an automatic cutter do?',
        blocks: [
          {
            kind: 'text',
            text: 'An automatic cutter is a computer-controlled machine that cuts through many plies of fabric at once along the marker. A paper from 2000 on planning the spreading tables that feed such a cutter starts from the point that poor planning leaves the cutter idle and delays the cut pieces for sewing.',
          },
          { kind: 'list', items: ['Ours. We have one in our cutting room.'] },
        ],
      },
      {
        heading: 'Soccer balls: how are the panels cut?',
        blocks: [
          {
            kind: 'text',
            text: 'We die-cut the panels of every ball we make, stitched, thermobonded or hybrid, from cover material already printed and laminated to its backing layers. A study of ball makers in Sialkot describes the same two steps in the standard process there: cloth layers glued to an artificial-leather sheet, then panels cut with a metal die and a hydraulic press.',
          },
          {
            kind: 'list',
            items: [
              'Why pentagons waste more. Hexagons cover a flat sheet with no gaps, and pentagons cannot, so cutting them leaves more of the sheet behind. With the traditional die, the study says, even experienced cutters typically waste 20 to 24% of the laminated sheet.',
              'A die that wastes less. The researchers designed a die that fits more pentagons on a sheet, and estimated that it lowers the cover cost of each pentagon by 6.76%.',
              'Printed first. In the study’s account of that process, logos are printed on the panels after they are cut, the reverse of our order. How we print a ball is in our printing guide.',
              'Shapes and builds. The panel counts we make, and the geometry of a 32-panel ball, are covered where we explain pattern making. How the panels are joined is in our ball guide.',
            ],
            links: [
              { phrase: 'our printing guide', href: '/guides/garment-printing-methods' },
              { phrase: 'our ball guide', href: '/guides/how-soccer-balls-are-made' },
              {
                phrase: 'where we explain pattern making',
                href: '/guides/sportswear-pattern-making',
              },
            ],
          },
        ],
      },
      {
        heading: 'Is the print put on before cutting or after?',
        blocks: [
          {
            kind: 'text',
            text: 'Both happen at our works, and the design decides which. For an all-over design, the fabric or the panels are printed before they are cut. A placement print goes on the cut pieces or on the finished garment. Either way, we still cut and sew the garment.',
          },
          {
            kind: 'list',
            items: [
              'Print and build. An all-over print describes where the design sits, and cut and sew describes how the garment is built, so one garment can be both. Our glossary defines cut and sew and placement prints.',
              'The methods. Each printing method, and the fabric it suits, is explained in our printing guide.',
              'Knitted to shape. A 2026 review of compression garments traces a move from traditional cut and sew toward newer knitting technologies, flatbed, circular and seam-free among them.',
            ],
            links: [
              { phrase: 'Our glossary', href: '/glossary' },
              { phrase: 'our printing guide', href: '/guides/garment-printing-methods' },
            ],
          },
        ],
      },
      {
        heading: 'On our floor',
        blocks: [
          {
            kind: 'text',
            text: `We buy our fabric finished from suppliers, who make (knit or weave) and dye it. Cutting is the third of the five stages on our factory page, and the page closes that stage with a check of dimensional accuracy. Our works has ${CUTTING_LINES_WORD} cutting lines, on the same site where we print, stitch, check and pack.`,
          },
          {
            kind: 'list',
            items: [
              'Fabric from you. Supplying your own fabric is covered in our minimum order guide.',
              'Scraps. What happens to the scraps from cutting is set out in our environmental policy.',
            ],
            links: [
              { phrase: 'our minimum order guide', href: '/guides/minimum-order-and-samples' },
              { phrase: 'our environmental policy', href: '/policies/environmental' },
            ],
          },
        ],
      },
      {
        heading: 'What helps your order cut well?',
        blocks: [
          {
            kind: 'text',
            text: 'Send your pattern or size chart, how many pieces you want in each size, and the fabric’s width if you supply the fabric. The size mix and the width shape the marker, as explained above, and so how much fabric your order uses. With those in hand, we plan the cut.',
            links: [{ phrase: 'Send your pattern or size chart', href: '/contact' }],
          },
          {
            kind: 'list',
            items: [
              'Sizes and grading. Grading your size chart is explained under "How does grading work?" in the pattern making guide.',
            ],
            links: [
              { phrase: 'the pattern making guide', href: '/guides/sportswear-pattern-making' },
            ],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'ONET OnLine, Textile Cutting Machine Setters, Operators, and Tenders (51-6062.00), US Department of Labor',
        url: 'https://www.onetonline.org/link/details/51-6062.00',
        date: '2026-10-06',
        kind: 'updated',
      },
      {
        name: 'RMIT University, fashion learning toolbox, Cutting machines (Internet Archive copy)',
        url: 'https://web.archive.org/web/20060828194441/http://www.dlsweb.rmit.edu.au/toolbox/fashion/pages/fabrics/machines/cutting.htm',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Pamuk and Yildiz, factors in marker plan efficiency, Tekstil ve Konfeksiyon 26(4):430-435 (Ege University repository)',
        url: 'https://hdl.handle.net/11454/16595',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Nilanto Md Alimul Razy, Md Nazrul Islam, Morsalin Sayed, Md Sharif Ahmed and Shadman Ahmed Khan, Investigation of marker efficiency combining different size garments and using different width materials, Tekstilna industrija 72(3):40-45',
        url: 'https://doi.org/10.5937/tekstind2403040N',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Dumishllari and Guxho, Influence of Lay Plan Solution in Fabric Efficiency and Consume in Cutting Section, Autex Research Journal 16(4):222-227',
        url: 'https://doi.org/10.1515/aut-2015-0055',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Ta, Ngo and Le, Proposing solutions to support the accounting of cutting tables used in garment manufacturing, Vinh University Journal of Science (Tạp chí Khoa học) 55(2A):102-114',
        url: 'https://doi.org/10.56824/vujs.2026a005a',
        date: '2026-06-20',
        kind: 'published',
      },
      {
        name: 'Chrisnanto and Chrisnanto, cut order planning (preprint, not peer reviewed), arXiv 2508.16611',
        url: 'https://arxiv.org/abs/2508.16611',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Wong, Chan and Ip, Effects of Spreading-Table Quantities on the Spreading-Table Planning of Computerized Fabric-Cutting System, Research Journal of Textile and Apparel 4(1):25-36',
        url: 'https://doi.org/10.1108/rjta-04-01-2000-b003',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Arsoy, Cutting Room Software: Enhancing Efficiency in Garment Production, Fibres and Textiles 32(1):92-95',
        url: 'https://doi.org/10.15240/tul/008/2025-1-018',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Atkin, Chaudhry, Chaudry, Khandelwal and Verhoogen, Organizational Barriers to Technology Adoption: Evidence from Soccer-Ball Producers in Pakistan, The Quarterly Journal of Economics 132(3):1101-1164',
        url: 'https://doi.org/10.1093/qje/qjx010',
        date: '2017-03-09',
        kind: 'published',
      },
      {
        name: 'Hossain, Potluri, Abeykoon and Fernando, From Material to Manufacture: A State-of-the-Art Review of Compression Garment Technologies for Medical and Sports Use, Textiles 6(1):7',
        url: 'https://doi.org/10.3390/textiles6010007',
        date: '2026-01-07',
        kind: 'published',
      },
    ],
  },
  // Wave 10, C4: signed by the merchandiser (owner, 2026-11-06).
  {
    path: '/guides/sportswear-compliance-by-market',
    title: 'Apparel Compliance: US, EU, UK and Canada',
    description:
      'Laws on clothing and soccer balls in the US, EU, UK and Canada: chemicals, PFAS, children’s products, forced labor, environmental claims and textile EPR.',
    heading: 'What the law asks of your order,',
    headingAccent: 'market by market.',
    lede: 'The law where your garments are sold decides what they may contain, what they must prove and what your brand may claim about them. This guide sets out those rules for the US, EU, UK and Canada, each dated by the day we read it.',
    sections: [
      {
        heading: 'Which rules reach a sportswear order in each market?',
        blocks: [
          {
            kind: 'text',
            text: 'Six kinds of rule reach a clothing order: limits on chemicals, extra rules for children’s products, flammability, forced labor, environmental claims and, in the EU, who pays for textile waste. The table shows where each applies, and the sections below take them one by one. Label wording has a guide of its own.',
            links: [{ phrase: 'a guide of its own', href: '/guides/clothing-labels' }],
          },
          {
            kind: 'table',
            caption: 'Where each rule applies (read 6 November 2026)',
            columns: ['Rule', 'United States', 'European Union', 'United Kingdom', 'Canada'],
            rows: [
              [
                'Chemicals in clothing',
                'PFAS laws in some states, New York’s from 1 January 2025',
                'REACH limits; PFHxA from 10 October 2026',
                'Great Britain’s own copy of the REACH limits',
                'Lead in clothing for children under 14',
              ],
              [
                'Children’s products',
                'A certificate from tests at a CPSC-accepted lab; eFiling from 8 July 2026',
                'Toy law, for toys; the new regulation applies from 1 August 2030',
                'Toy law, for toys',
                'Lead and phthalate limits',
              ],
              [
                'Flammability',
                '16 CFR 1610',
                'Not covered in this guide',
                'Not covered in this guide',
                'Textile Flammability Regulations',
              ],
              [
                'Forced labor',
                'Import ban',
                'Market ban from 14 December 2027',
                'Yearly statement at £36 million turnover or more',
                'Import ban; yearly report for listed or larger businesses',
              ],
              [
                'Environmental claims',
                'FTC Green Guides',
                'Generic claims banned from 27 September 2026',
                'CMA Green Claims Code',
                'Product claims need adequate and proper testing',
              ],
              [
                'Textile waste (EPR)',
                'Not covered in this guide',
                'Schemes by 17 April 2028; France already has one',
                'Not covered in this guide',
                'Not covered in this guide',
              ],
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Which chemicals are restricted in clothing sold in the EU and UK?',
        blocks: [
          {
            kind: 'text',
            text: 'Under REACH, the EU’s chemicals law, azo dyes that release listed amines are barred above 30 mg/kg (milligrams per kilogram) in textiles with prolonged skin contact. Nonylphenol ethoxylates (NPE) are barred in washable textiles from 3 February 2021, and a list of hazardous substances in clothing from 1 November 2020.',
          },
          {
            kind: 'list',
            items: [
              'Formaldehyde. That list caps it at 75 mg/kg. Jackets and coats had a higher limit, 300 mg/kg, until 1 November 2023.',
              'Outside that list. Non-textile fasteners and decorations, and second-hand clothing, are not covered by it.',
              'PFHxA. PFHxA is one of the PFAS, the per- and polyfluoroalkyl substances. It is barred in consumer clothing from 10 October 2026 at 25 parts per billion or more, with a threshold of 1,000 parts per billion for related substances. Other consumer textiles follow from 10 October 2027, and goods placed on the market before each date are not affected. The listed exceptions include some protective equipment and medical devices.',
              'Rubber and plastic parts. In the plasticized material of articles, four phthalates (DEHP, DBP, BBP and DIBP) are barred at 0.1% or more, alone or together, from 7 July 2020, with listed exceptions. Polycyclic aromatic hydrocarbons (PAHs) are barred above 1 mg/kg in rubber or plastic parts that touch the skin, from 27 December 2015, and the law names sport equipment among such articles.',
              'Great Britain. Its own copy of the restriction list keeps the NPE and hazardous-substance entries. No PFHxA entry was found in it, and the UK’s PFAS plan says the government will consider further restrictions.',
              'What PFAS do in a fabric. Our outerwear guide explains why some water repellents use them.',
            ],
            links: [
              { phrase: 'Our outerwear guide', href: '/guides/outerwear-and-waterproof-fabrics' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Which US states restrict PFAS in clothing?',
        blocks: [
          {
            kind: 'text',
            text: 'New York bars the sale of new apparel with intentionally added PFAS after 1 January 2025. Maine bars textile articles with intentionally added PFAS from 1 January 2026, with exceptions, and Vermont already bars such textiles and textile articles; for apparel, the legislature’s own summary of Act 54 gives 1 July 2026. From 1 January 2032, Minnesota bars every product with intentionally added PFAS, except uses it rules unavoidable.',
          },
          {
            kind: 'list',
            items: [
              'Outdoor wear for severe wet conditions. New York’s ban reaches it from 1 January 2028. Maine’s 2026 ban leaves it out. From 1 January 2029, if PFAS were added to such apparel on purpose, Maine allows its sale only with a disclosure that reads "Made with PFAS chemicals.".',
              'Vermont’s fluorine test. Vermont also counts as regulated PFAS the presence of PFAS in a product or product component at or above 100 parts per million (ppm), as measured in total organic fluorine. The level falls to 50 ppm from 1 July 2027.',
              'Minnesota today. Its bans that began on 1 January 2025 leave clothing out.',
              'New York’s advice. It asks retailers to check with the manufacturer or supplier that PFAS are not intentionally added to a product.',
              'Other states. This list holds only the states whose own law we read; ask your adviser about every other state where you sell.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Do sportswear fabrics need a flammability test?',
        blocks: [
          {
            kind: 'text',
            text: 'In the US, clothing fabric must meet 16 CFR 1610, which sorts fabric into classes; Class 1 is acceptable for clothing. Plain-surface fabrics of 2.6 ounces per square yard or more need no test, and neither do fabrics made entirely of polyester, nylon, wool, acrylic, modacrylic or olefin. Spandex is not on that list.',
          },
          {
            kind: 'list',
            items: [
              'Spandex blends. A polyester and spandex blend is not made entirely of listed fibers, so only the weight rule above can spare it a test, and that rule covers plain-surface fabric only.',
              'GSM and ounces. Our fabrics guide converts GSM to ounces.',
              'Outside the rule. Hats, gloves up to 14 inches long, footwear and interlining fabrics are outside it, each on conditions the rule sets.',
              'The certificate. The US Consumer Product Safety Commission (CPSC) says adult clothing that is not exempt from testing needs a General Certificate of Conformity; for test-exempt adult clothing it will not pursue a missing one.',
              'Canada. Its Textile Flammability Regulations set minimum flame-spread times for clothing fabric: for fabric without a raised surface, more than 3.5 seconds. They do not apply to children’s sleepwear in sizes up to and including 14X.',
            ],
            links: [
              { phrase: 'Our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'What extra rules apply to children’s clothing?',
        blocks: [
          {
            kind: 'text',
            text: 'A US children’s product, one made mainly for children 12 or under, must have a Children’s Product Certificate based on tests at a CPSC-accepted lab. Its accessible parts may hold no more than 100 ppm of lead, and paint or coatings no more than 90 ppm. Canada caps lead at 90 mg/kg in clothing for children under 14.',
          },
          {
            kind: 'list',
            items: [
              'Filing the certificate. Importers file certificates electronically with US Customs and Border Protection (CBP) from 8 July 2026; for goods entered from a foreign trade zone, from 8 January 2027.',
              'Dyed fabric. CPSC has determined that textiles, dyed or undyed and spandex among them, do not exceed the lead limits unless they carry treatments or applications that are not made entirely of dyes.',
              'Phthalates. The US limit of 0.1% on certain phthalates in accessible plasticized parts applies to children’s toys and child care articles.',
              'Labels and drawstrings. Our labels guide sets out the tracking label a children’s product carries, and our trims guide the drawstring rules.',
            ],
            links: [
              { phrase: 'our trims guide', href: '/guides/apparel-trims' },
              { phrase: 'Our labels guide', href: '/guides/clothing-labels' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Soccer balls: which of these rules reach a ball?',
        blocks: [
          {
            kind: 'text',
            text: 'In the EU and Great Britain, sports equipment for children over 20 kg is not treated as a toy, and the new EU toy law, which applies from 1 August 2030, keeps that line. A ball’s plastic and rubber parts fall under the EU limits on PAHs and, in plasticized material, on four phthalates.',
          },
          {
            kind: 'list',
            items: [
              'Toys under the new EU law. It covers products made for play by children under 14, even when play is not their only use. Some of its articles already apply from 1 January 2026.',
              'A lower PAH limit for toys. For toys and childcare articles, the PAH limit is 0.5 mg/kg.',
              'United States. A ball meant mainly for children aged 12 and younger counts as a children’s product, so the lead limit and the certificate above apply. Whether such a ball is also a children’s toy under the phthalate rule is not settled on any CPSC page we read, and its phthalates page names beach balls for children. Ask your lab.',
              'Canada. The vinyl in toys for children under 14, and in child care articles, is capped at 1,000 mg/kg of DEHP, DBP or BBP.',
              'Sialkot. The history of child labor in Sialkot’s ball making, and who monitors our stitching hall, are in our ball guide.',
            ],
            links: [{ phrase: 'our ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Which forced-labor laws apply to an order?',
        blocks: [
          {
            kind: 'text',
            text: 'US law prohibits imports of goods produced wholly or partly by forced labor, and so does Canada’s. The EU’s ban on placing such products on its market takes effect on 14 December 2027. Some markets also make larger businesses report each year on forced-labor risk in their supply chains.',
          },
          {
            kind: 'list',
            items: [
              'US: goods linked to Xinjiang. The Uyghur Forced Labor Prevention Act treats goods from China’s Xinjiang region, and goods with Xinjiang inputs made elsewhere, as barred unless the importer proves otherwise. Clothing and cotton goods are among the sectors it treats as high priority. Proof must be clear and convincing.',
              'How CBP enforces it. CBP enforces these rules and lists, on a public dashboard, the orders it has issued to hold back goods.',
              'A US duty on Pakistan. The US Trade Representative’s forced-labor action of July 2026 added a duty on goods from Pakistan; the rate is in our country guide.',
              'The EU. Under Regulation (EU) 2024/3015, authorities can order a product made with forced labor off the market, and have it withdrawn and disposed of. The European Commission is to publish a regularly updated database of forced-labor risks.',
              'The UK. A company or partnership that carries on business in the UK, supplies goods or services and has a total turnover of £36 million or more must prepare a slavery and human trafficking statement for each financial year.',
              'Canada. A business that makes, sells, distributes or imports goods must report by 31 May each year on its steps to prevent forced labor and child labor in its supply chains, if it is listed on a Canadian stock exchange, or does business or has assets in Canada and meets two of three size tests: C$20 million in assets, C$40 million in revenue, 250 employees.',
              'Australia. An entity with consolidated revenue of at least A$100 million that is Australian, or carries on business in Australia, must report on modern slavery.',
              'Checking a factory. How to check a supplier against these risks, and which of our papers you can see, is in our vetting guide.',
            ],
            links: [
              { phrase: 'our vetting guide', href: '/guides/how-to-vet-a-clothing-manufacturer' },
              { phrase: 'our country guide', href: '/guides/pakistan-vs-china-vs-turkey' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'What can a brand claim about the environment?',
        blocks: [
          {
            kind: 'text',
            text: 'From 27 September 2026, EU law bans generic claims such as "eco-friendly" or "green" unless the trader can show recognized excellent environmental performance. The UK’s code asks for claims that are truthful, clear and substantiated. The US Federal Trade Commission advises against unqualified general claims, and Canada requires proper testing behind product claims.',
          },
          {
            kind: 'list',
            items: [
              'More EU bans. A sustainability label must rest on a certification scheme or be set up by public authorities. A claim about the whole product is banned when it concerns only one aspect of it, and so is a claim of neutral or reduced impact that rests on offsetting emissions.',
              'The Green Claims Directive. A separate, proposed EU directive on green claims had not been adopted when we checked; the European Parliament’s record shows it awaiting the Council’s first-reading position.',
              'UK: fines and liability. The Competition and Markets Authority (CMA) can fine a business up to 10% of its global turnover under the rules in force from April 2025. A manufacturer that labels a product with a false or misleading environmental claim can be liable along with the retailer.',
              'UK: fashion. The CMA asks fashion brands to set out clearly the criteria that decide which items go into a "green" collection.',
              'US: recycled content. Under the FTC’s Green Guides, a product made partly of recycled material should make clear how much of it is recycled.',
              'US: "free of" claims. A claim that a product is free of a substance can still deceive if the product contains another substance with similar environmental risks.',
              'Canada. Changes to its Competition Act that received Royal Assent on 26 March 2026 removed the requirement for environmental claims to rest on an internationally recognized methodology.',
              'Australia. The government’s business portal advises against broad, unqualified claims such as "eco-friendly".',
              'France. The words "biodégradable" (biodegradable) and "respectueux de l’environnement" (environmentally friendly) may not appear on a new consumer product or its packaging, and neither may an equivalent environmental claim.',
              'Antibacterial claims. The rules on treated articles are in our dyeing guide.',
            ],
            links: [{ phrase: 'our dyeing guide', href: '/guides/dyeing-and-color-matching' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'What is textile EPR, and who counts as the producer?',
        blocks: [
          {
            kind: 'text',
            text: 'Under extended producer responsibility (EPR), producers pay fees to schemes that collect and treat their used products. Every EU country must set up such schemes for textile and footwear products by 17 April 2028, and write the rules into national law by 17 June 2027. France already runs one.',
          },
          {
            kind: 'list',
            items: [
              'The producer. It can be the business that first supplies imported textile products in an EU country, or a seller outside the EU that sells to that country at a distance. A country may require such a seller to appoint an authorized representative there by written mandate.',
              'Which goods. All knitted and woven apparel, chapters 61 and 62 of the customs tariff, is in scope.',
              'Fees. They are to be based on the weight of the products, and their number where that fits, and to vary with the ecodesign requirements set under the EU’s Ecodesign for Sustainable Products Regulation, or with other EU law that sets common sustainability criteria.',
              'France’s scheme. Its producer organization for textiles, footwear and household linen is approved until 31 December 2028.',
              'Unsold clothing. From 19 July 2026, large companies may not destroy unsold apparel in the EU, apart from exceptions the European Commission sets. Medium-sized companies follow from 19 July 2030, and micro and small ones are exempt.',
              'Other markets. Textile EPR in the US, the UK and Canada is outside this guide; ask your adviser where you sell.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'What must clothing sold in France show?',
        blocks: [
          {
            kind: 'text',
            text: 'Larger sellers in France must tell shoppers the country where each main step took place: weaving, dyeing and printing, and making. They must also give the share of recycled material, and add a warning about plastic microfibers released in washing when synthetic fiber is over half the weight. The duty reached smaller companies in steps from 2023.',
          },
          {
            kind: 'list',
            items: [
              'The law’s own word. It calls the first step "tissage", weaving.',
              'Who it reaches. Producers, importers and other sellers with turnover above €10 million that place at least 10,000 units of these products on the French market each year. It began with the largest, from 1 January 2023, and reached that level on 1 January 2025.',
              'The environmental cost display. France’s display of a garment’s environmental cost is voluntary and in force from 1 October 2025.',
              'Ultra-fast fashion. A law of 8 July 2026 targets "mode ultra-express", ultra-fast fashion. Its penalties through eco-contributions apply from 1 September 2026 and its advertising ban from 1 January 2027. A decree sets the thresholds that decide which businesses it reaches. The penalty amounts change by year: read them in the law on Légifrance.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'On our floor',
        blocks: [
          {
            kind: 'text',
            text: 'We arrange the tests and papers below on request, and you pay for each lab test. Which of them your order needs depends on where you sell and on how old the wearers are. Clothing for children is made only when a buyer asks for it.',
          },
          {
            kind: 'list',
            items: [
              'US children’s products. You, as the importer, issue the Children’s Product Certificate; we arrange the testing it rests on, at a CPSC-accepted lab.',
              'EU and UK chemicals. Third-party lab tests for the restricted substances that apply to your order, plus any reports that the makers of the fabric and trims already have.',
              'PFAS. For each order, a written statement from the fabric or finish supplier that no PFAS was intentionally added, and a lab test.',
              'Soccer balls. PAH and phthalate tests for the EU, and lead tests for a children’s ball sold in the US or Canada, through a third-party lab and quoted per order.',
              'France. Your quote names the country of each step: our suppliers make (knit or weave) and dye the fabric, and we print and make the garments.',
              'EU textile EPR. Every product we make reaches shoppers under your brand, so the EU and French textile EPR duties sit with your brand or your importer.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'What should I tell you about my markets?',
        blocks: [
          {
            kind: 'text',
            text: 'Name every country where you will sell, the youngest age your products are for, and any environmental claim you plan to print. Those three answers decide which sections of this guide apply to your order. Send them with your spec, and ask for the tests and papers you need.',
            links: [{ phrase: 'Send them with your spec', href: '/contact' }],
          },
          {
            kind: 'list',
            items: [
              'The label itself. Our labels guide covers what each market requires a label to say.',
            ],
            links: [{ phrase: 'Our labels guide', href: '/guides/clothing-labels' }],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'Commission Regulation (EC) No 552/2009 (REACH Annex XVII, entry 43, azo dyes)',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009R0552',
        date: '2009-06-26',
        kind: 'published',
      },
      {
        name: 'Commission Regulation (EU) 2016/26 (REACH Annex XVII, entry 46a, nonylphenol ethoxylates)',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0026',
        date: '2016-01-14',
        kind: 'published',
      },
      {
        name: 'Commission Regulation (EU) 2018/1513 (REACH Annex XVII, entry 72, substances in clothing)',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32018R1513',
        date: '2018-10-12',
        kind: 'published',
      },
      {
        name: 'Commission Regulation (EU) 2024/2462 (REACH Annex XVII, entry 79, PFHxA)',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R2462',
        date: '2024-09-20',
        kind: 'published',
      },
      {
        name: 'Commission Regulation (EU) 2018/2005 (REACH Annex XVII, entry 51, phthalates)',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32018R2005',
        date: '2018-12-18',
        kind: 'published',
      },
      {
        name: 'Commission Regulation (EU) No 1272/2013 (REACH Annex XVII, entry 50, PAHs)',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R1272',
        date: '2013-12-07',
        kind: 'published',
      },
      {
        name: 'Directive 2009/48/EC on the safety of toys, Annex I',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009L0048',
        date: '2009-06-30',
        kind: 'published',
      },
      {
        name: 'Regulation (EU) 2025/2509 on the safety of toys',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2509',
        date: '2025-12-12',
        kind: 'published',
      },
      {
        name: 'Directive (EU) 2024/825 on empowering consumers for the green transition',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024L0825',
        date: '2024-03-06',
        kind: 'published',
      },
      {
        name: 'European Parliament, Legislative Observatory, procedure 2023/0085(COD), Green Claims Directive',
        url: 'https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2023/0085(COD',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Directive (EU) 2025/1892 amending the Waste Framework Directive (textile EPR)',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025L1892',
        date: '2025-09-26',
        kind: 'published',
      },
      {
        name: 'Regulation (EU) 2024/1781, Ecodesign for Sustainable Products Regulation',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1781',
        date: '2024-06-28',
        kind: 'published',
      },
      {
        name: 'Regulation (EU) 2024/3015 on prohibiting products made with forced labour on the Union market',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R3015',
        date: '2024-12-12',
        kind: 'published',
      },
      {
        name: 'Légifrance, Code de l’environnement, articles R541-227, R541-228 and R541-230 (in force from 8 April 2024, Décret n° 2024-316) †',
        url: 'https://www.legifrance.gouv.fr/codes/id/LEGISCTA000049384739',
        date: '2024-04-08',
        kind: 'updated',
      },
      {
        name: 'Légifrance, Décret n° 2022-748 du 29 avril 2022, initial text, article 3 (the phase-in dates) †',
        url: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000045726094',
        date: '2022-04-30',
        kind: 'published',
      },
      {
        name: 'Légifrance, Décret n° 2025-957 du 6 septembre 2025 (environmental cost of textiles) †',
        url: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000052212871',
        date: '2025-09-06',
        kind: 'published',
      },
      {
        name: 'Légifrance, arrêté du 23 décembre 2022 (approval of the textile producer organization) †',
        url: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000046821065',
        date: '2022-12-28',
        kind: 'published',
      },
      {
        name: 'Légifrance, LOI n° 2026-602 du 8 juillet 2026 visant à réduire l’impact environnemental de l’industrie textile †',
        url: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054399113',
        date: '2026-07-09',
        kind: 'published',
      },
      {
        name: 'legislation.gov.uk, REACH Annex XVII (as it applies in Great Britain)',
        url: 'https://www.legislation.gov.uk/eur/2006/1907/annex/XVII',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'GOV.UK (Defra), PFAS Plan: building a safer future together',
        url: 'https://www.gov.uk/government/publications/pfas-plan/pfas-plan-building-a-safer-future-together',
        date: '2026-08-17',
        kind: 'updated',
      },
      {
        name: 'legislation.gov.uk, Toys (Safety) Regulations 2011, Schedule 1',
        url: 'https://www.legislation.gov.uk/uksi/2011/1881/schedule/1',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Competition and Markets Authority, Green Claims Code: environmental claims on goods and services',
        url: 'https://www.gov.uk/government/publications/green-claims-code-making-environmental-claims/environmental-claims-on-goods-and-services',
        date: '2021-09-20',
        kind: 'published',
      },
      {
        name: 'Competition and Markets Authority, new consumer protection regime comes into force',
        url: 'https://www.gov.uk/government/news/cma-to-boost-consumer-and-business-confidence-as-new-consumer-protection-regime-comes-into-force',
        date: '2025-04-07',
        kind: 'published',
      },
      {
        name: 'Competition and Markets Authority, Making green claims: getting it right across the supply chain',
        url: 'https://www.gov.uk/government/publications/making-green-claims-getting-it-right-across-the-supply-chain/making-green-claims-getting-it-right-across-the-supply-chain',
        date: '2026-01-22',
        kind: 'published',
      },
      {
        name: 'Competition and Markets Authority, greenwashing: tailored guide for fashion brands',
        url: 'https://www.gov.uk/government/news/greenwashing-cma-issues-tailored-guide-for-fashion-brands',
        date: '2024-09-18',
        kind: 'published',
      },
      {
        name: 'legislation.gov.uk, Modern Slavery Act 2015, section 54',
        url: 'https://www.legislation.gov.uk/ukpga/2015/30/section/54',
        date: '2026-11-06',
        kind: 'updated',
      },
      {
        name: 'legislation.gov.uk, Modern Slavery Act 2015 (Transparency in Supply Chains) Regulations 2015, regulation 2',
        url: 'https://www.legislation.gov.uk/uksi/2015/1833/regulation/2/made',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'eCFR, 16 CFR 1610.1 and 1610.4, Standard for the Flammability of Clothing Textiles',
        url: 'https://www.ecfr.gov/current/title-16/part-1610',
        date: '2026-11-04',
        kind: 'updated',
      },
      {
        name: 'CPSC, Clothing FAQ †',
        url: 'https://www.cpsc.gov/FAQ/Clothing',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'eCFR, 16 CFR 1303.1, lead in paint',
        url: 'https://www.ecfr.gov/current/title-16/part-1303/section-1303.1',
        date: '2026-11-04',
        kind: 'updated',
      },
      {
        name: 'eCFR, 16 CFR 1500.91, materials determined not to exceed lead limits',
        url: 'https://www.ecfr.gov/current/title-16/part-1500/section-1500.91',
        date: '2026-11-04',
        kind: 'updated',
      },
      {
        name: 'CPSC, Children’s Product Certificate (CPC) †',
        url: 'https://www.cpsc.gov/Business--Manufacturing/Testing-Certification/Childrens-Product-Certificate-CPC',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Federal Register, Certificates of Compliance, final rule, 90 FR 1800',
        url: 'https://www.federalregister.gov/documents/2025/01/08/2024-30826/certificates-of-compliance',
        date: '2025-01-08',
        kind: 'published',
      },
      {
        name: 'Federal Register, Certificates of Compliance; Correction',
        url: 'https://www.federalregister.gov/documents/2025/09/24/2025-18521/certificates-of-compliance-correction',
        date: '2025-09-24',
        kind: 'published',
      },
      {
        name: 'eCFR, 16 CFR part 1110, Certificates of Compliance',
        url: 'https://www.ecfr.gov/current/title-16/part-1110',
        date: '2026-11-04',
        kind: 'updated',
      },
      {
        name: 'CPSC, Phthalates business guidance †',
        url: 'https://www.cpsc.gov/Business--Manufacturing/Business-Education/Business-Guidance/Phthalates-Information',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'CPSC, Phthalates FAQ †',
        url: 'https://www.cpsc.gov/FAQ/Phthalates',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'New York State Department of Environmental Conservation, PFAS in Apparel Law',
        url: 'https://dec.ny.gov/environmental-protection/help-for-businesses/pfas-in-apparel-law',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Maine Revised Statutes, Title 38, §1614',
        url: 'https://legislature.maine.gov/statutes/38/title38sec1614.html',
        date: '2026-10-05',
        kind: 'updated',
      },
      {
        name: 'Vermont Statutes, 9 V.S.A. § 2494f',
        url: 'https://legislature.vermont.gov/statutes/section/09/063/02494f',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Vermont Statutes, 9 V.S.A. § 2494e (definitions)',
        url: 'https://legislature.vermont.gov/statutes/section/09/063/02494e',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Vermont Office of Legislative Counsel, Act No. 54 (H.238), Act Summary, 2025',
        url: 'https://legislature.vermont.gov/Documents/2026/Docs/ACTS/ACT054/ACT054%20Act%20Summary.pdf',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Minnesota Statutes, section 116.943',
        url: 'https://www.revisor.mn.gov/statutes/cite/116.943',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'eCFR, 16 CFR part 260, FTC Guides for the Use of Environmental Marketing Claims (260.4, 260.9, 260.13)',
        url: 'https://www.ecfr.gov/current/title-16/part-260',
        date: '2026-11-04',
        kind: 'updated',
      },
      {
        name: 'Competition Bureau Canada, Environmental claims and greenwashing',
        url: 'https://competition-bureau.canada.ca/en/how-we-foster-competition/education-and-outreach/environmental-claims-and-greenwashing',
        date: '2026-10-27',
        kind: 'updated',
      },
      {
        name: 'Justice Laws, Textile Flammability Regulations (SOR/2016-194)',
        url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2016-194/FullText.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Justice Laws, Consumer Products Containing Lead Regulations (SOR/2018-83)',
        url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2018-83/FullText.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Justice Laws, Phthalates Regulations (SOR/2016-188)',
        url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2016-188/FullText.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Justice Laws, Fighting Against Forced Labour and Child Labour in Supply Chains Act',
        url: 'https://laws-lois.justice.gc.ca/eng/acts/F-10.6/FullText.html',
        date: '2026-10-19',
        kind: 'updated',
      },
      {
        name: 'Canada Border Services Agency, Memorandum D9-1-6',
        url: 'https://www.cbsa-asfc.gc.ca/publications/dm-md/d9/d9-1-6-eng.html',
        date: '2021-05-28',
        kind: 'published',
      },
      {
        name: 'Federal Register of Legislation (Australia), Modern Slavery Act 2018, compilation of 7 November 2024',
        url: 'https://www.legislation.gov.au/C2018A00153/2024-11-07/2024-11-07/text/original/epub/OEBPS/document_1/document_1.html',
        date: '2024-11-07',
        kind: 'updated',
      },
      {
        name: 'business.gov.au, Promote your sustainable business',
        url: 'https://business.gov.au/marketing-and-advertising/promote-your-sustainable-business',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'European Commission, Transition Pathways, Forced Labour Regulation',
        url: 'https://transition-pathways.europa.eu/retail/legislation/forced-labour-regulation-0',
        date: '2025-11-24',
        kind: 'updated',
      },
      {
        name: 'European Parliament, Legislative Observatory, summary of Regulation (EU) 2024/3015',
        url: 'https://oeil.europarl.europa.eu/oeil/en/document-summary?id=1799238',
        date: '2024-12-12',
        kind: 'published',
      },
      {
        name: 'U.S. Department of Homeland Security, UFLPA frequently asked questions',
        url: 'https://www.dhs.gov/uflpa-frequently-asked-questions',
        date: '2025-09-16',
        kind: 'updated',
      },
      {
        name: 'U.S. Customs and Border Protection, UFLPA enforcement FAQs',
        url: 'https://www.cbp.gov/trade/forced-labor/faqs-uflpa-enforcement',
        date: '2025-09-09',
        kind: 'updated',
      },
      {
        name: 'U.S. Customs and Border Protection, Forced labor',
        url: 'https://www.cbp.gov/trade/forced-labor',
        date: '2026-09-29',
        kind: 'updated',
      },
      {
        name: 'U.S. Customs and Border Protection, Withhold Release Orders and Findings dashboard',
        url: 'https://www.cbp.gov/newsroom/stats/trade/withhold-release-orders-findings-dashboard',
        date: '2026-11-04',
        kind: 'updated',
      },
      {
        name: 'Office of the U.S. Trade Representative, forced labor Section 301 action',
        url: 'https://ustr.gov/about/policy-offices/press-office/press-releases/2026/july/ustr-takes-action-forced-labor-section-301-investigations',
        date: '2026-07-23',
        kind: 'published',
      },
    ],
  },
  // Wave 11, B7: signed by the production (owner, 2026-11-06).
  {
    path: '/guides/apparel-manufacturing-machinery',
    title: 'Apparel Machinery and Sewing Machine Types',
    description:
      'The machines that make sportswear and soccer balls: cutting, the types of industrial sewing machine, pressing and packing, and how a sewing line runs.',
    heading: 'The machines that make sportswear,',
    headingAccent: 'area by area.',
    lede: 'A garment passes through a cutting room, a sewing line, and pressing and packing, and each area has its own machines. This guide walks the line in order and names the machines on our floor, with a link to the guide that covers each one’s work.',
    sections: [
      {
        heading: 'What machines does it take to make sportswear, from fabric to carton?',
        blocks: [
          {
            kind: 'text',
            text: 'A different set in each area: knives and computer-controlled cutters in the cutting room, sewing machines on the line, and pressing machines toward the end. NC State University’s apparel manufacturing course covers the same areas in that order. The table lists what we run in each area, and where each machine’s work is explained.',
          },
          {
            kind: 'table',
            caption: 'Machines on our floor, area by area',
            columns: ['Area', 'Our machines', 'Explained in'],
            rows: [
              [
                'Pattern and 3D',
                'CLO 3D and a 2D pattern CAD system',
                'Software guide; pattern-making guide',
              ],
              [
                'Cutting',
                'Automatic computer-controlled cutter, straight knife, band knife, die press',
                'Cutting guide',
              ],
              [
                'Sewing',
                'Machines for six stitch types, plus buttonhole, button-sewing, zigzag, blind-hem and multi-needle elastic machines, and snap, rivet and eyelet presses',
                'Stitch and seam guide',
              ],
              [
                'Printing',
                'Heat presses (all seven print methods are done on our site)',
                'Printing guide',
              ],
              ['Pressing', 'Fusing press, steam irons or steam presses', 'This page'],
              [
                'End of the line',
                'Needle or metal detector on request, tagging and packing',
                'Inspection and packaging guides',
              ],
              [
                'Soccer balls',
                'Lamination, die press, hand and machine stitching, thermobonding molds, inflation',
                'Ball guide',
              ],
            ],
          },
        ],
      },
      {
        heading: 'What machines are in a cutting room?',
        blocks: [
          {
            kind: 'text',
            text: 'A cutting room cuts many layers of fabric at once into the parts of a garment. The patterns are laid on top of the layers, and the cut is made with electric or manual knives or with computer-controlled machines. Ours has an automatic, computer-controlled cutter, a straight knife, a band knife and a die press.',
          },
          {
            kind: 'list',
            items: [
              'How each one cuts. Our cutting guide explains when a knife, the cutter or the die press is used, and how the pattern pieces are laid out before the cut.',
            ],
            links: [{ phrase: 'Our cutting guide', href: '/guides/garment-cutting' }],
          },
        ],
      },
      {
        heading: 'What are the main types of industrial sewing machine?',
        stage: 'whole-stitching',
        blocks: [
          {
            kind: 'text',
            text: 'An industrial sewing line uses different machines for different jobs. Serging (overlock) and flat-bed felling machines, with one needle or two, join and reinforce garment pieces. Special machines make buttonholes and tacks, or attach buttons and zippers. Which stitch each machine forms is explained in our stitch and seam guide.',
            links: [{ phrase: 'our stitch and seam guide', href: '/guides/stitch-and-seam-types' }],
          },
          {
            kind: 'list',
            items: [
              'Flatlock work surfaces. A flat-bed flatlock suits large flat parts. On an arm-fed flatlock, the work feeds off the arm for narrow parts, or up the arm for small, short tubes.',
              'Add-on devices. Flatlocks are often fitted with extra devices, such as a fabric edge trimmer, a thread chain trimmer, a tape binder or a tape feeder.',
            ],
          },
          {
            kind: 'text',
            text: 'Beyond the machines for the six stitch types in our stitch guide, our sewing floor has these:',
            links: [{ phrase: 'our stitch guide', href: '/guides/stitch-and-seam-types' }],
          },
          {
            kind: 'list',
            items: [
              'Buttonhole and button-sewing machines.',
              'Snap, rivet and eyelet presses.',
              'Zigzag and blind-hem machines.',
              'Multi-needle elastic machines.',
            ],
          },
          {
            kind: 'list',
            items: [
              'Machine safety. ISO 10821 sets safety requirements for industrial sewing machines and identifies their hazards, and ISO lists it as current, last confirmed in 2015. It is a standard you can ask any factory about. Our health and safety policy is published on this site.',
              'Automatic sewing. Robots and automatic sewing units are covered in our technology guide.',
            ],
            links: [
              { phrase: 'Our health and safety policy', href: '/policies/health-and-safety' },
              { phrase: 'our technology guide', href: '/guides/apparel-manufacturing-technology' },
            ],
          },
        ],
      },
      {
        heading: 'What machines press and finish a garment?',
        blocks: [
          {
            kind: 'text',
            text: 'Presses finish what the sewing line makes. Pressing machines, such as steam and hydraulic presses, remove wrinkles and shape garments. The machine is chosen to suit the garment’s properties, for example how much heat it can take. Ours are a fusing press, steam irons or steam presses, and heat presses for prints and labels that go on with heat.',
          },
          {
            kind: 'list',
            items: [
              'What a fusing press does. It bonds a fusible interlining to the fabric with heat and pressure.',
              'Prints applied with heat. Our printing guide explains each print method, including the ones pressed on.',
              'Tapes. Our trims guide covers the reflective and seam-sealing tapes we apply, and our outerwear guide how a sealed seam keeps water out.',
            ],
            links: [
              { phrase: 'Our printing guide', href: '/guides/garment-printing-methods' },
              { phrase: 'Our trims guide', href: '/guides/apparel-trims' },
              { phrase: 'our outerwear guide', href: '/guides/outerwear-and-waterproof-fabrics' },
            ],
          },
        ],
      },
      {
        heading: 'How are finished garments checked and packed?',
        stage: 'whole-tagging',
        blocks: [
          {
            kind: 'text',
            text: 'Checks run along the line as well as at its end. Operators watch for defective stitching and broken threads as they sew. Finished garments are then hung or folded, packaged and tagged for delivery. On request, they also pass a needle or metal detector before packing.',
          },
          {
            kind: 'list',
            items: [
              'Our inspections. The inspections made along our line and at its end are listed on our factory page.',
              'Packing. Branded packing, and where it happens on our site, is in our packaging guide.',
            ],
            links: [
              { phrase: 'our factory page', href: '/inside-the-factory' },
              { phrase: 'our packaging guide', href: '/guides/private-label-packaging' },
            ],
          },
        ],
      },
      {
        heading: 'How is a sewing line organized: bundles or teams?',
        blocks: [
          {
            kind: 'text',
            text: 'Factories organize sewing in different ways. In the progressive bundle system, the work is split into small tasks, and unfinished work piles up along the line. In modular production, a team of multi-skilled workers sews all or part of a garment. A 2013 study matching production systems to product lines found mixed results, some against traditional assumptions.',
          },
          {
            kind: 'list',
            items: [
              'How common each was. In the US in 1992, most garments were assembled on progressive bundle systems, and fewer than one in ten in modules.',
              'A third system. In a 2023 study of men’s hoodie jackets in Bangladesh, a unit production system did better than the progressive bundle system. Its authors add that results may vary from factory to factory and from style to style.',
              'What a system changes. That study measured nine things, from floor space and output to product quality and work in progress.',
              'Why US makers moved. In the US, the business units that took up modules were the ones that had adopted the information systems retailers increasingly asked for.',
              'On our floor. Bulk orders run on progressive bundle lines, and small runs are sewn by teams, the modular way.',
              'In our glossary. Both systems have their own entries.',
            ],
            // The two entries joined the glossary with C1 and C6 (2026-11-06); until then this point
            // named entries the glossary did not have yet.
            links: [{ phrase: 'our glossary', href: '/glossary#progressive-bundle-system' }],
          },
        ],
      },
      {
        heading: 'Soccer balls: what does a ball line use?',
        stage: 'whole-ball-stitching',
        blocks: [
          {
            kind: 'text',
            text: 'A ball line has machines of its own. FIFA describes a ball’s layered cover material being printed and then cut into panels. For thermal bonding, the panels go into a mold that a machine heats, pressing and gluing them together, and the method takes much less labor than stitching. Our line runs these steps:',
          },
          {
            kind: 'list',
            items: [
              'Before cutting, the cover material and its backing layers are laminated together, and the cover is printed.',
              'A press die-cuts the printed cover material into panels, for every build.',
              'The panels are stitched by hand in our stitching hall, stitched by machine, or thermobonded in molds.',
              'The bladder is fitted, and the ball is inflated.',
              'Each finished ball is weighed, measured for size or roundness, and checked for pressure and bounce.',
            ],
          },
          {
            kind: 'list',
            items: [
              'Builds and tests. The four builds, and how FIFA tests a ball for its quality marks, are explained in our ball guide.',
              'Panels and print. How the panels are cut is in our cutting guide, and how a ball is printed in our printing guide.',
            ],
            links: [
              { phrase: 'our ball guide', href: '/guides/how-soccer-balls-are-made' },
              { phrase: 'our cutting guide', href: '/guides/garment-cutting' },
              { phrase: 'our printing guide', href: '/guides/garment-printing-methods' },
            ],
          },
        ],
      },
      {
        heading: 'On our floor',
        blocks: [
          {
            kind: 'text',
            text: `Our works has ${PRECISION_MACHINES.value} precision machines and ${CUTTING_LINES.value} cutting lines. Our garments are cut, printed, stitched, checked and packed on one site. Our factory page walks through the five stages there, each with a checkpoint, and our about page shows the team behind them.`,
            links: [
              { phrase: 'Our factory page', href: '/inside-the-factory' },
              { phrase: 'our about page', href: '/about' },
            ],
          },
        ],
      },
      {
        heading: 'Planning the machines for your order',
        blocks: [
          {
            kind: 'text',
            text: 'Three things in your spec point to the machines your order needs: the stitch for each seam, any trims that need a press, and your quantity, which sets whether a bundle line or a team sews it. With those three answered, send us your spec.',
            links: [{ phrase: 'send us your spec', href: '/contact' }],
          },
          {
            kind: 'list',
            items: [
              'Seeing the floor. Our FAQ explains how to visit us, in person or by video call.',
              'Checking any factory. Our vetting guide lists the questions to put to any factory and the documents to request.',
            ],
            links: [
              { phrase: 'Our FAQ', href: '/faq/working-with-us#factory-visit' },
              { phrase: 'Our vetting guide', href: '/guides/how-to-vet-a-clothing-manufacturer' },
            ],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'NC State University, Academic Catalog 2026-2027, FTM 318 Fashion Development Processes',
        url: 'https://catalog.ncsu.edu/search/?P=FTM%20318',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ONET OnLine (U.S. Department of Labor), 51-6062.00 Textile Cutting Machine Setters, Operators, and Tenders',
        url: 'https://www.onetonline.org/link/details/51-6062.00',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ONET OnLine (U.S. Department of Labor), 51-6031.00 Sewing Machine Operators',
        url: 'https://www.onetonline.org/link/details/51-6031.00',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ONET OnLine (U.S. Department of Labor), 51-6021.00 Pressers, Textile, Garment, and Related Materials',
        url: 'https://www.onetonline.org/link/details/51-6021.00',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Nemeša, Flatlock sewing machines, Tekstilna industrija',
        url: 'https://doi.org/10.5937/tekstind2302017n',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO 10821:2005, Industrial sewing machines, Safety requirements for sewing machines, units and systems',
        url: 'https://www.iso.org/standard/2103.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Berg, Appelbaum, Bailey and Kalleberg, Modular Production: Improving Performance in the Apparel Industry, in The American Workplace, Cambridge University Press',
        url: 'https://doi.org/10.1017/CBO9780511620027.004',
        date: '2010-02-01',
        kind: 'published',
      },
      {
        name: 'Dunlop and Weil, Diffusion and Performance of Modular Production in the U.S. Apparel Industry, in The American Workplace, Cambridge University Press',
        url: 'https://doi.org/10.1017/cbo9780511620027.003',
        date: '2000-04-24',
        kind: 'published',
      },
      {
        name: 'Kincade, Kim and Kanakadurga, An Empirical Investigation of Apparel Production Systems and Product Line Groups through the Use of Collar Designs, Journal of Textile and Apparel, Technology and Management 8(1)',
        url: 'https://jtatm.textiles.ncsu.edu/index.php/JTATM/article/view/3337',
        date: '2013-04-01',
        kind: 'published',
      },
      {
        name: 'Hossain and others, A Comparative Study Between Unit Production System and Progressive Bundle System in Apparel Production, IEOM Society',
        url: 'https://doi.org/10.46254/ba06.20230076',
        date: '2023-12-26',
        kind: 'published',
      },
      {
        name: 'FIFA, The Making of a Football',
        url: 'https://inside.fifa.com/innovation/news/the-making-of-a-football',
        date: '2018-08-06',
        kind: 'published',
      },
      {
        name: 'Sheffield Hallam University, Sports Engineering Research Group, Engineering Sport blog, How Are Footballs Made?',
        url: 'https://engineeringsport.co.uk/2012/07/03/how-are-footballs-made/',
        date: '2012-07-03',
        kind: 'published',
      },
    ],
  },
  // Wave 11, B9: signed by the Content Team (owner, 2026-11-06).
  {
    path: '/guides/apparel-design-software',
    title: 'Apparel Design Software: CAD, 3D and PLM',
    description:
      'What pattern CAD, 3D garment software and PLM each do, which pattern and 3D files to send a factory, and how our 3D pages are made.',
    heading: 'The software behind a garment,',
    headingAccent: 'file by file.',
    lede: 'Several kinds of software carry a garment from a sketch to the factory floor. This guide explains what each one does and which files move between them, then covers who can open each file and which files to send us.',
    sections: [
      {
        heading: 'What software is used to develop a garment, from sketch to factory?',
        blocks: [
          {
            kind: 'text',
            text: 'Pattern CAD, 3D garment software, tech-pack tools and PLM each handle one part of the work. Pattern CAD draws and corrects the flat pieces; 3D software turns them into a garment on screen; a tech pack gathers the specification; and PLM (product lifecycle management) shares product data with everyone working on a product.',
          },
          {
            kind: 'table',
            caption: 'Kinds of software, and the files they use',
            columns: ['Kind', 'What it does', 'Files'],
            rows: [
              [
                '2D pattern CAD',
                'Draws, corrects and grades flat patterns',
                'DXF-AAMA or DXF-ASTM, with grade rules',
              ],
              [
                '3D garment software',
                'Turns patterns into a garment on screen',
                'Its own project files; glTF (GLB) for the web',
              ],
              [
                'Tech-pack tools',
                'Gathers the garment’s specification',
                'PDF, spreadsheets, or a tech pack made in CLO',
              ],
              [
                'PLM',
                'Shares product data with everyone on a product',
                'Modules for many processes',
              ],
              [
                'Open-source pattern software',
                'Drafts patterns, under an open license',
                'Each project’s own; PDF among them',
              ],
            ],
          },
          {
            kind: 'list',
            items: [
              'What is changing. Our technology guide covers newer tools, AI among them.',
              'Laying out the cut. Marker making, the step that lays pattern pieces out for cutting, is explained in our cutting guide.',
            ],
            links: [
              { phrase: 'Our technology guide', href: '/guides/apparel-manufacturing-technology' },
              { phrase: 'our cutting guide', href: '/guides/garment-cutting' },
            ],
          },
        ],
      },
      {
        heading: 'What is 2D pattern CAD, and which pattern file should I send?',
        blocks: [
          {
            kind: 'text',
            text: 'Pattern CAD is where flat pattern pieces are drawn and corrected; NC State and FIT teach systems such as Gerber AccuMark and Lectra. CLO and Browzwear both import DXF patterns in the AAMA or ASTM form, and Browzwear notes that a standard DXF holds less information.',
          },
          {
            kind: 'list',
            items: [
              'Grade rules. They can sit inside the DXF file or travel beside it as a separate rule file. CLO exports one size group per DXF file, so a style graded in several size groups comes as several files. Grading itself is explained in our pattern-making guide.',
              'The standard behind it. ASTM D6673 set out how CAD systems exchange pattern pieces: DXF for the pieces, and a formatted text file for the grade rule tables. ASTM withdrew it in 2019 with no replacement.',
              'What a pattern file leaves out. The standard did not carry cutter or plotter instructions, or a complete plan for laying out a marker.',
              'Style3D. Its help center says it reads DXF files made by its home market’s CAD software, except in special cases.',
            ],
            links: [
              { phrase: 'our pattern-making guide', href: '/guides/sportswear-pattern-making' },
            ],
          },
        ],
      },
      {
        heading: 'CLO 3D, Browzwear, Style3D or Marvelous Designer: what is the difference?',
        blocks: [
          {
            kind: 'text',
            text: 'CLO and Marvelous Designer come from one maker and share their core technology. The maker designed Marvelous Designer for entertainment and CLO for fashion, and lists features CLO adds, such as DXF-AAMA patterns and avatars that change size. FIT teaches 3D fitting in Browzwear. We found no independent comparison of these programs, so this page ranks none.',
          },
          {
            kind: 'list',
            items: [
              'More that CLO adds. Its maker also lists tailor-style avatar measuring, a tech pack feature, stitching visuals and advanced CAD tools.',
              'Native files. A CLO project file (ZPRJ) bundles the avatar and the garment, and a CLO garment file (ZPAC) holds the simulated garment with its 2D patterns, seamlines and fabrics. Browzwear’s BW is one file with all the relevant information about the garment.',
              'Exports for the web. CLO exports glTF, with all colorways in one file or a file for each. Browzwear’s VStitcher and Lotta export glTF version 2. Style3D Studio exports a garment as OBJ or FBX, and its fabrics as GLB.',
              'Patterns for production. CLO’s maker says its DXF-AAMA and DXF-ASTM import and export is what lets production-ready patterns go to a manufacturer.',
            ],
          },
        ],
      },
      {
        heading: 'Who can open a 3D garment file?',
        blocks: [
          {
            kind: 'text',
            text: 'That depends on the file. A CLO file can be viewed and shared on CLO-SET, CLO’s separate cloud service, after a free sign-up for simple use and sharing, with only an email address. A Browzwear BW file needs no special preparation to email or link. A GLB file uses glTF, a royalty-free format for 3D models in engines and apps.',
          },
          {
            kind: 'list',
            items: [
              'Rendering in the cloud. Browzwear’s Stylezone renders BW files in the cloud, with no VStitcher or Lotta installed.',
              'One standard. glTF 2.0 is also an international standard, ISO/IEC 12113:2022, and a whole 3D scene can be stored as one binary.glb file.',
              'Colorways in one file. A ratified glTF extension lets one file hold several material variants of a product, such as its colors, and switch between them quickly.',
            ],
          },
        ],
      },
      {
        heading: 'Is there open-source pattern software?',
        blocks: [
          {
            kind: 'text',
            text: 'Yes. Seamly2D and Valentina are open-source pattern-making programs that draft from standard size tables or from one person’s measurements. FreeSewing drafts made-to-measure patterns in the browser, and its project says it does not scale or grade them. Each project publishes its own license.',
          },
          {
            kind: 'list',
            items: [
              'Licenses. Seamly2D is released under the GPLv3+ license and runs on Windows, macOS and Linux. GitLab lists Valentina’s license as GNU GPL v3.0. FreeSewing’s core library is MIT-licensed, and the project allows commercial use of its patterns. The MIT License grants its permissions "free of charge".',
              'For a range of sizes. A made-to-measure pattern is drafted for one person, so a production range still needs grading. Our pattern-making guide explains it.',
              'Exports. FreeSewing exports to a range of formats, PDF among them. If a factory will cut from your pattern, check that your program can export DXF-AAMA or DXF-ASTM.',
            ],
            links: [
              { phrase: 'Our pattern-making guide', href: '/guides/sportswear-pattern-making' },
            ],
          },
        ],
      },
      {
        heading: 'What do tech-pack tools and PLM do?',
        blocks: [
          {
            kind: 'text',
            text: 'More than one kind of program can make a tech pack. FIT teaches technical design students to build full tech packages with digital imaging and software, and CLO can turn a 3D garment into a tech pack through CLO-SET. PLM goes wider: it shares product data among the people and processes across a product’s life.',
          },
          {
            kind: 'list',
            items: [
              'What researchers report. PLM comes in modules for many industry processes, and the authors of a 2015 study say it shortens lead times and cuts inventory.',
              'The risk. A 2021 study describes fashion as new to PLM, and warns that a lack of clear implementation guidelines significantly raises the risk of failure.',
              'On our floor. We do not use a PLM system. Our tech packs are made in spreadsheets, as PDF files or with CLO’s tech pack.',
              // Back with the tech pack guide (C1, 2026-11-06), in the draft's place.
              'What goes in one. Our tech pack guide lists what a tech pack holds and has a free template.',
            ],
            links: [{ phrase: 'Our tech pack guide', href: '/guides/tech-pack-template' }],
          },
        ],
      },
      {
        heading: 'How far can 3D go before a physical sample?',
        blocks: [
          {
            kind: 'text',
            text: '3D helps a team see and discuss a garment early. In a 2026 study, makers of firefighting gear found it useful for pattern work and for talking with customers, but limited with composite materials and garments of several layers. A 2024 study notes that in-person fit sessions are still irreplaceable.',
          },
          {
            kind: 'list',
            items: [
              'Fabric data. A 2020 paper says virtual fit and drape are not yet fully validated, and that experts report the same fabric simulating very differently in different makers’ software. Fabric measurements are not standardized, so fabric data does not carry over cleanly between programs and test devices.',
              'Moving a 3D garment. A garment moved from one program to another may drape differently there.',
              'Fit on screen. How we check fit in CLO before a sample, and the limits of that check, are in our pattern-making guide.',
              'Color. Color is confirmed on a physical sample, for the reasons our 3D guide gives.',
            ],
            links: [
              { phrase: 'our pattern-making guide', href: '/guides/sportswear-pattern-making' },
              { phrase: 'our 3D guide', href: '/guides/3d-garment-reference' },
            ],
          },
        ],
      },
      {
        heading: 'From CLO 3D to a garment page',
        blocks: [
          {
            kind: 'text',
            text: 'Our 3D garment pages are made from CLO 3D files. Each colorway is exported from CLO 3D, combined into one 3D file in the open glTF format, made smaller, and its print is checked before it goes on the garment page. The pages show the garment only, without an avatar.',
          },
          {
            kind: 'list',
            items: [
              'Our pattern tools. We draft production patterns in a 2D pattern CAD system and fit them in CLO 3D, as our pattern-making guide explains.',
              'Your garment in 3D. On request, we build a 3D page of your garment, from your own CLO file or from our pattern for it.',
              'Our soccer ball. The Kaizen ball’s 3D page was made in Rhino, Blender and other tools rather than in CLO 3D.',
              'Marker making. Marker software lays out our pattern pieces for cutting. We use no AI tool in our pattern work, from drafting to marker making.',
              'Using a 3D page. What you can check on one of our 3D pages, and how, is in our 3D guide.',
            ],
            links: [
              { phrase: 'our pattern-making guide', href: '/guides/sportswear-pattern-making' },
              { phrase: 'our 3D guide', href: '/guides/3d-garment-reference' },
            ],
          },
        ],
      },
      {
        heading: 'Sending us your files',
        blocks: [
          {
            kind: 'text',
            text: 'Send the files your team already works in. We take CLO projects, DXF patterns with their grade rules, and flat drawings as PDF or Illustrator files, and other 3D files on request. CLO projects come to us through a WeTransfer or Drive share link.',
          },
          {
            kind: 'list',
            items: [
              'Other 3D files. We take files from Browzwear, from Style3D and from Marvelous Designer on request.',
              'The inquiry form. The file types it takes, and how to send larger files by link, are listed in our printing guide’s section on sending artwork.',
              'Pattern ownership. The minimum order guide answers who owns a pattern.',
              'Send us your files. The inquiry form opens with this topic already chosen.',
            ],
            links: [
              { phrase: 'our printing guide', href: '/guides/garment-printing-methods' },
              { phrase: 'The minimum order guide', href: '/guides/minimum-order-and-samples' },
              { phrase: 'inquiry form', href: '/contact' },
            ],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'NC State University, Academic Catalog 2026-2027, FTM 317 Computer-Aided-Design for Apparel',
        url: 'https://catalog.ncsu.edu/search/?P=FTM%20317',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Fashion Institute of Technology, Undergraduate Catalog 2026-27, Technical Design (TC) courses',
        url: 'https://catalog.fitnyc.edu/undergraduate/courses/tc/',
        date: '2026-09-01',
        kind: 'updated',
      },
      {
        name: 'Fashion Institute of Technology, Catalog, NCC 010 Introduction to CLO’s 3D Garment Visualization',
        url: 'https://catalog.fitnyc.edu/search/?search=CLO+3D',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'CLO Help Center, What is the difference between CLO and Marvelous Designer?',
        url: 'https://support.clo3d.com/hc/en-us/articles/115012666547-What-is-the-difference-between-CLO-and-Marvelous-Designer',
        date: '2026-10-06',
        kind: 'updated',
      },
      {
        name: 'Marvelous Designer Help Center, There is another similar software called CLO, what is the difference?',
        url: 'https://support.marvelousdesigner.com/hc/en-us/articles/47358306734361-There-is-another-similar-software-called-CLO-what-is-the-difference',
        date: '2026-09-29',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, CLO File Formats',
        url: 'https://support.clo3d.com/hc/en-us/articles/115000470688-CLO-File-Formats',
        date: '2026-09-22',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, glTF 2.0 (GLTF/GLB) File',
        url: 'https://support.clo3d.com/hc/en-us/articles/360051525034-glTF-2-0-GLTF-GLB-File',
        date: '2026-08-14',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, 2D Pattern (DXF) Import/Export',
        url: 'https://support.clo3d.com/hc/en-us/articles/115000493067-2D-Pattern-DXF-Import-Export',
        date: '2026-11-04',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, using CLO with another company’s 2D CAD system',
        url: 'https://support.clo3d.com/hc/en-us/articles/115013367108-I-use-a-2D-CAD-system-from-another-software-company-Can-I-still-use-CLO',
        date: '2025-10-17',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, sharing CLO files with people who do not use CLO',
        url: 'https://support.clo3d.com/hc/en-us/articles/115013360027',
        date: '2026-10-01',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, CLO-SET and CLO’s other services',
        url: 'https://support.clo3d.com/hc/en-us/articles/115012666347-What-other-services-do-you-have-other-than-CLO',
        date: '2026-09-30',
        kind: 'updated',
      },
      {
        name: 'CLO Help Center, Tech Pack via CLO-SET',
        url: 'https://support.clo3d.com/hc/en-us/articles/360013304233--CLOSET-Techpack',
        date: '2026-09-24',
        kind: 'updated',
      },
      {
        name: 'Browzwear Help Center, Browzwear File Types',
        url: 'https://help.browzwear.com/en/articles/13065254-browzwear-file-types',
        date: '2025-12-09',
        kind: 'updated',
      },
      {
        name: 'Browzwear Help Center, glTF Support',
        url: 'https://help.browzwear.com/en/articles/13065798-gltf-support',
        date: '2026-09-30',
        kind: 'updated',
      },
      {
        name: 'Browzwear Help Center, Uploading Without Lotta or VStitcher',
        url: 'https://help.browzwear.com/en/articles/13065777-uploading-without-lotta-or-vstitcher',
        date: '2026-08-26',
        kind: 'updated',
      },
      {
        name: 'Style3D Studio Help Center, Is Style3D compatible with DXF files from other CAD software',
        url: 'https://help.style3d.com/studio/en/4152/7977/cc93',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Style3D Studio Help Center, How to Use Third-Party Garment Files in Studio',
        url: 'https://help.style3d.com/studio/en/4152/f7e8/c8bb',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ASTM D6673-10, Standard Practice for Sewn Products Pattern Data Interchange, Data Format (Withdrawn 2019)',
        url: 'https://store.astm.org/d6673-10.html',
        date: '2019-01-09',
        kind: 'updated',
      },
      {
        name: 'The Khronos Group, glTF',
        url: 'https://www.khronos.org/gltf/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'The Khronos Group, KHR_materials_variants (glTF extension)',
        url: 'https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_variants/README.md',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Seamly2D project, README',
        url: 'https://github.com/FashionFreedom/Seamly2D',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Valentina project',
        url: 'https://gitlab.com/smart-pattern/valentina',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'FreeSewing, About FreeSewing',
        url: 'https://freesewing.eu/docs/about/',
        date: '2026-09-19',
        kind: 'updated',
      },
      {
        name: 'FreeSewing, Can I use FreeSewing patterns for commercial purposes?',
        url: 'https://freesewing.eu/docs/about/faq/commercial-use/',
        date: '2026-09-19',
        kind: 'updated',
      },
      {
        name: 'FreeSewing, @freesewing/core package',
        url: 'https://www.npmjs.com/package/@freesewing/core',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Open Source Initiative, The MIT License',
        url: 'https://opensource.org/license/mit',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'D’Avolio, Bandinelli and Rinaldi, Improving new product development in the fashion industry through product lifecycle management, International Journal of Fashion Design, Technology and Education',
        url: 'https://doi.org/10.1080/17543266.2015.1005697',
        date: '2015-02-02',
        kind: 'published',
      },
      {
        name: 'Fani, Falchi, Bindi and Bandinelli, Implementation framework for PLM: a case study in the fashion industry, International Journal of Advanced Manufacturing Technology',
        url: 'https://doi.org/10.1007/s00170-021-06623-4',
        date: '2021-01-25',
        kind: 'published',
      },
      {
        name: 'Istook and Jung, Comparison of Objective Measurement Methods of Fabric Tensile Properties for 3D Virtual Garment Software, ITAA Annual Conference Proceedings',
        url: 'https://doi.org/10.31274/itaa.12158',
        date: '2020-12-28',
        kind: 'published',
      },
      {
        name: 'Yang and Baytar, Fit models’ roles in identifying fit issues in the apparel technical design process, Fashion and Textiles',
        url: 'https://doi.org/10.1186/s40691-024-00398-4',
        date: '2024-09-19',
        kind: 'published',
      },
      {
        name: 'Jung, Porterfield and Kwon, Three-dimensional virtual prototyping for designing firefighting gear, Fashion and Textiles',
        url: 'https://doi.org/10.1186/s40691-026-00469-8',
        date: '2026-05-12',
        kind: 'published',
      },
    ],
  },
  // Wave 12, C5: signed by the merchandiser (owner, 2026-11-06).
  {
    path: '/guides/how-to-order-team-kits',
    title: 'How to Order Team Kits: Colors, Numbers, Sizes',
    description:
      'How to order a soccer team kit: the rules on colors, numbers and names, collecting a squad’s sizes, checking the list, matching balls, and reorders.',
    heading: 'How to order team kits,',
    headingAccent: 'from team list to reorder.',
    lede: 'A team order is one design made in many sizes, with a number and often a name on every shirt. This guide covers what the game’s rules say about kit, how to gather a squad’s sizes and names, how we check them with you, and how a reorder stays the same.',
    sections: [
      {
        heading: 'What does a soccer kit include?',
        blocks: [
          {
            kind: 'text',
            text: 'Under the Laws of the Game, a player’s compulsory kit is a shirt with sleeves, shorts, socks, shin guards and footwear. Goalkeepers may wear tracksuit bottoms. We supply the whole kit apart from footwear: we make the garments, and the socks and shin guards come from partner makers.',
          },
          {
            kind: 'list',
            items: [
              'Undershirts and tights. An undershirt must be the main color of the shirt sleeve, or copy the sleeve’s pattern exactly. Undershorts or tights take the shorts’ main color, or that of their lowest part, and all players on a team wear the same color.',
              'Tape on socks. Any tape or other material worn over a sock must be the color of the part it covers.',
              'Goalkeepers. Their kit is planned as a color of its own; the next section explains why.',
              'Other team garments. Training tops, bibs and the rest of our team range are on our teamwear page.',
            ],
            links: [{ phrase: 'our teamwear page', href: '/custom-teamwear-manufacturer' }],
          },
        ],
      },
      {
        heading: 'Which colors can our kit be?',
        blocks: [
          {
            kind: 'text',
            text: 'Both teams must wear colors that set them apart from each other and the match officials, and each goalkeeper must differ from everyone else on the field. Other bodies add rules of their own. In England, Northumberland FA quotes Rule 19 of The FA’s Standard Code of Rules, which bars black or very dark shirts, even for goalkeepers.',
          },
          {
            kind: 'list',
            items: [
              'Registering colors in England. The same rule has every team register its shirt and shorts colors with its league’s secretary, and Berks & Bucks FA asks for this each season. Northumberland FA adds that the ban on dark shirts covers all-black shirt backs too.',
              'US high schools. From the 2026-27 season, the national federation’s rules say the home team wears dark socks. In Ohio, visiting teams wear white and home teams dark. There, teammates’ jerseys, shorts and socks are similar in color, design and pattern. The goalkeeper’s jersey differs in color from every teammate and opposing field player.',
              'An away kit. Choose your goalkeeper colors and an away kit before you order, and check both against your league’s rules, so every color is approved at once.',
              'Matching a color. How a color is matched and approved before bulk is covered by our guide to minimum orders. Our dyeing guide describes the color check itself.',
            ],
            links: [
              { phrase: 'Our dyeing guide', href: '/guides/dyeing-and-color-matching' },
              { phrase: 'our guide to minimum orders', href: '/guides/minimum-order-and-samples' },
            ],
          },
          {
            kind: 'text',
            text: 'Rules checked on 6 November 2026. Your league or school association has the final word.',
          },
        ],
      },
      {
        heading: 'Where do numbers and names go?',
        blocks: [
          {
            kind: 'text',
            text: 'The game’s laws usually allow a player’s number and name on kit, plus the team crest. Competitions set the details. In Ohio high schools, each back carries a different number at least 6 inches high. The front repeats it on the jersey or the shorts, at least 4 inches high, and every number is in a solid contrasting color.',
          },
          {
            kind: 'list',
            items: [
              'The national rule. The US high-school federation’s rules allow the front number on the jersey, the shorts or both.',
              'Names on youth shirts in England. Berks & Bucks FA’s guidance says clubs should not put names or nicknames on youth shirts, while adult football allows them. It adds that no FA rule forbids names on under-18 shirts, but the FA recommends written consent from every player and their parent or caregiver, because a name makes a young player instantly identifiable.',
              'Sponsors on youth kit in England. Berks & Bucks FA says youth kits may carry no reference to products or services relating to alcohol or gambling, among others.',
              'Slogans. No kit may carry political, religious or personal slogans.',
              'How they are put on. Names and numbers are printed, and our printing guide says which methods suit them. Whether they count toward your minimum is answered on our teamwear page.',
            ],
            links: [
              { phrase: 'our printing guide', href: '/guides/garment-printing-methods' },
              { phrase: 'our teamwear page', href: '/custom-teamwear-manufacturer' },
            ],
          },
        ],
      },
      {
        heading: 'How do we collect the squad’s sizes and names?',
        blocks: [
          {
            kind: 'text',
            text: 'Measure the players, not their old shirts: the international size standard designates clothing sizes from body measurements. Put every player on one team list with a name, a number and a size. Before production, we send the full list back for you to check, with a picture of one shirt for each layout.',
          },
          {
            kind: 'list',
            items: [
              'How to measure. ISO 8559-1 sets out the body measurements used for sizing and how to take them. Size charts and grading are covered by our pattern making guide.',
              `Youth and adult sizes. One design made in any mix of youth and adult sizes counts as one style toward the ${MINIMUM}-piece minimum, and your quote confirms the split.`,
              'Children’s sizes. Kit in children’s sizes is made at your request, and our compliance guide gives the rules for children’s products.',
              'Repeated numbers. Check the list for a number used twice before you send it. In Ohio high schools, every back number must differ.',
              'Spare shirts. Order a few without names. Names and numbers can be added to spares in a later order, at a cost stated in your quote.',
              'Trying the fit. Players can try on the size set before bulk; our minimum order guide lists every sample.',
            ],
            links: [
              { phrase: 'our pattern making guide', href: '/guides/sportswear-pattern-making' },
              { phrase: 'our compliance guide', href: '/guides/sportswear-compliance-by-market' },
              { phrase: 'our minimum order guide', href: '/guides/minimum-order-and-samples' },
            ],
          },
        ],
      },
      {
        heading: 'How do we make sure a reorder matches?',
        blocks: [
          {
            kind: 'text',
            text: 'We keep your club’s patterns, samples, artwork, print files and number font, so you do not have to send them again for a reorder. Each new lot of fabric is compared by eye with the lab dip you approved, under the lights of our color cabinet. Your quote for each reorder is written fresh.',
          },
          {
            kind: 'list',
            items: [
              'The reorder minimum. What a reorder needs, and what a smaller order costs, are explained in the minimum order guide.',
              'Colors over time. Our dyeing guide follows a lab dip from first dye to approval.',
              'New players mid-season. Shirts for them can join a later order, with names and numbers added as above.',
            ],
            links: [
              { phrase: 'the minimum order guide', href: '/guides/minimum-order-and-samples' },
              { phrase: 'Our dyeing guide', href: '/guides/dyeing-and-color-matching' },
            ],
          },
        ],
      },
      {
        heading: 'Soccer balls: can our club’s balls match the kit?',
        blocks: [
          {
            kind: 'text',
            text: `Yes. A club ball can carry your crest on its panels and come in your colors, with a minimum of ${MINIMUM} balls per order. Kit and balls can go in one quote and one shipment. Your league decides which ball size each age group plays with, and our ball guide gives England’s and the United States’ ages.`,
            links: [{ phrase: 'our ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
          {
            kind: 'list',
            items: [
              'How balls travel. Which balls ship inflated and which deflated is in our shipping guide.',
              'Builds and quality marks. Each way of building a ball, and the tests behind FIFA’s marks, are covered by the ball guide too.',
              'See one in 3D. Our Kaizen ball turns in 3D on its own page.',
            ],
            links: [
              { phrase: 'Kaizen ball', href: '/products/kaizen' },
              { phrase: 'our shipping guide', href: '/guides/shipping-and-import-duties' },
              { phrase: 'the ball guide', href: '/guides/how-soccer-balls-are-made' },
            ],
          },
        ],
      },
      {
        heading: 'On our floor',
        blocks: [
          {
            kind: 'text',
            text: 'We make kit for clubs, academies and schools. Their shirts and shorts are cut, printed and sewn on our one site in Sialkot. Each club’s order has one merchandiser as its point of contact, from the tech pack to the shipment.',
          },
        ],
      },
      {
        heading: 'Planning your team order',
        blocks: [
          {
            kind: 'text',
            text: 'Settle four things before you send an inquiry: the kit’s colors, checked against your league’s rules; the full team list of names, numbers and sizes; the pieces each player needs; and how many spare shirts to hold. Send them with your crest, and we quote the whole kit, with balls if you want them.',
            links: [{ phrase: 'Send them with your crest', href: '/contact' }],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'IFAB, Laws of the Game, Law 4: The Players’ Equipment',
        url: 'https://www.theifab.com/laws/latest/the-players-equipment/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Berks & Bucks FA, Kit Regulations',
        url: 'https://bucksfa.freshdesk.com/support/solutions/articles/7000083904-kit-regulations',
        date: '2023-09-06',
        kind: 'updated',
      },
      {
        name: 'Berks & Bucks FA, Player names in Youth Football',
        url: 'https://bucksfa.freshdesk.com/support/solutions/articles/7000083565',
        date: '2023-09-06',
        kind: 'updated',
      },
      {
        name: 'Northumberland FA, Kit regulations (quoting Rule 19 of The FA’s Standard Code of Rules)',
        url: 'https://www.northumberlandfa.com/news/2022/jun/29/kit-regulations',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'NFHS, Coach responsibility for bench decorum reinforced in high school soccer rules changes',
        url: 'https://www.nfhs.org/stories/coach-responsibility-for-bench-decorum-reinforced-in-high-school-soccer-rules-changes',
        date: '2025-03-10',
        kind: 'published',
      },
      {
        name: 'NFHS, Soccer rules (2026-27 rules changes)',
        url: 'https://nfhs.org/sports/soccer/rules',
        date: '2026-03-16',
        kind: 'published',
      },
      {
        name: 'Ohio High School Athletic Association, Uniform Regulations, Soccer',
        url: 'https://www.ohsaa.org/Sports-Tournaments/Soccer/Uniform-Regulations-Soccer',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO 8559-1:2017, Size designation of clothes, Part 1: Anthropometric definitions for body measurement',
        url: 'https://www.iso.org/standard/61686.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'ISO 8559-2:2025, Size designation of clothes, Part 2: Primary and secondary dimension indicators',
        url: 'https://www.iso.org/standard/85590.html',
        date: '2026-11-06',
        kind: 'read',
      },
    ],
  },
  // Wave 12, B8: signed by the Content Team (owner, 2026-11-06).
  {
    path: '/guides/apparel-manufacturing-technology',
    title: 'What’s Changing in Apparel Manufacturing',
    description:
      'The EU product passport, QR codes and RFID tags, 3D sampling, AI, sewing robots, recycled fiber and new dyeing: what each changes for your order, and when.',
    heading: 'What’s changing in apparel manufacturing,',
    headingAccent: 'and what it means for you.',
    lede: 'Changes in how clothing is made, labeled and sold, from the EU’s product passport to new ways to dye and recycle fiber. For each one: what it changes for your order, when, and whether we use it today.',
    sections: [
      {
        heading: 'The changes at a glance',
        blocks: [
          {
            kind: 'text',
            text: 'Some of these changes are already in use on our floor, some are available when you ask, and the EU passport is a set of rules still being written. The table sums up the eight clothing changes; each section below explains one of them with its sources, and the last covers soccer balls.',
          },
          {
            kind: 'table',
            caption: 'Eight changes, what each means for your order, and where we stand',
            columns: ['Change', 'For your order', 'When', 'Status'],
            rows: [
              [
                'The EU’s Digital Product Passport',
                'Nothing to add yet',
                'Adoption planned for late 2027, then at least 18 months',
                'Rules coming',
              ],
              [
                'QR codes, RFID and NFC',
                'A hang tag or label may need both codes',
                'Industry goal: checkouts able to read 2D codes by late 2027',
                'QR codes in use; RFID and NFC tags on request',
              ],
              [
                '3D sampling',
                'Fit and print placement checked on screen first',
                'Now',
                'In use at RUN',
              ],
              [
                'AI in patterns and markers',
                'Nothing changes for your order today',
                'Research stage',
                'Made without AI tools at RUN',
              ],
              [
                'Robots that sew',
                'Nothing changes yet',
                'Gradually',
                'Sewing is done by people at machines',
              ],
              [
                'Fabric recycled from textiles',
                'Blends are harder to recycle',
                'Now, on request',
                'Available on request, quoted per order',
              ],
              [
                'Dope dyeing and waterless dyeing',
                'Ask early which colors are available',
                'Now, on request',
                'Available on request from our fabric suppliers',
              ],
              [
                'PFAS rules',
                'Name the finish you want in your spec',
                'In force now in some markets',
                'Water repellent set per order',
              ],
            ],
          },
        ],
      },
      {
        heading: 'What is the EU’s Digital Product Passport, and when will clothing need one?',
        blocks: [
          {
            kind: 'text',
            text: 'The Digital Product Passport is an online record of a product, linked to the item by a data carrier, for example a QR code. The European Commission aims to adopt the clothing rules in the last quarter of 2027, and warns that its timeline may change. After that, businesses normally get at least 18 months before the rules apply.',
          },
          {
            kind: 'list',
            items: [
              'The timeline so far. The EU’s passport registry became operational on 20 July 2026. On 14 July 2026 the Commission adopted Implementing Decision (EU) 2026/1736, which lists six harmonized standards for passports, among them the standards for data carriers and unique identifiers. The Commission’s indicative timeline puts a decision on the remaining two in November 2026.',
              'Textiles first. The Commission’s working plan for 2025 to 2030 ranks textiles and apparel first among its product groups. Its general timeline gives the third or fourth quarter of 2027 for the textile rules.',
              'The arithmetic. If the clothing rules are adopted late in 2027, they would normally apply in 2029 at the earliest.',
              'Who must provide it. Mainly whoever places the clothing on the EU market. Suppliers in the chain may face specific requirements to provide information.',
              'What it may hold. Depending on the final act: product identification, fiber composition, origin, information on use and repair, and end-of-life information. It will work alongside the EU’s textile labeling rules, which are under review.',
              'What the EU is studying. The Joint Research Centre is preparing a study on textiles to inform future ecodesign rules. Its topics include durability, repairability, recyclability and recycled content, and substances of concern. None of it is a rule yet.',
              'For your order. Nothing to add yet: the clothing rules have not been adopted.',
              'When. Adoption planned for late 2027, then at least 18 months.',
              'Status. Rules coming.',
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'What will a passport ask of the factory that makes my clothes?',
        blocks: [
          {
            kind: 'text',
            text: 'Each product group’s act chooses its passport data from a list in the EU’s ecodesign law. That list includes identifiers for the manufacturer and for each facility where the product was made, following the ISO/IEC 15459 series. Suppliers may have to provide information, and the clothing act will decide what applies.',
          },
          {
            kind: 'list',
            items: [
              'Must or may. Each act says which items from that list must be included and which may be. An item on the list is a duty only once an act makes it one.',
              'Where the data carrier goes. Physically on the product, or else on its packaging or the papers that come with it, as each act specifies. The law prefers the product itself, so the data stay reachable for the product’s whole life.',
              'What you can do now. Keep the facts a passport may ask for, such as fiber composition and origin, with each order’s records. Our labels guide deals with fiber composition on the label, and our compliance guide with origin rules by market.',
            ],
            links: [
              { phrase: 'Our labels guide', href: '/guides/clothing-labels' },
              { phrase: 'our compliance guide', href: '/guides/sportswear-compliance-by-market' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'QR code, RFID or NFC: which goes on my label?',
        blocks: [
          {
            kind: 'text',
            text: 'For the EU passport, a QR code is the Commission’s own example of a data carrier, and the law also allows barcodes and other device-read media. GS1, which writes global barcode standards, reports an industry goal: all retail checkout systems should be able to read a defined set of 2D codes by the end of 2027.',
          },
          {
            kind: 'list',
            items: [
              'QR codes. GS1 US calls the move from 1D UPC barcodes to 2D codes such as QR codes "Sunrise 2027". It calls 2027 a milestone, and says not every 2D capability has to be in place by then. GS1’s list of codes for checkouts includes a QR code carrying a GS1 Digital Link web address.',
              'RFID. An RFID tag encoded to GS1’s standard carries an EPC, GS1’s format for a unique identifier given to a product. GS1 US publishes apparel guidelines on where the EPC tag goes and on checking RFID shipments.',
              'NFC. Short-range radio, with a typical range of up to 2 cm. In reader mode, a device can read NFC tags that hold web addresses.',
              'What the EU law says. Its definition of a data carrier covers barcodes, 2D symbols and other media read by a device, and names no single technology.',
              'For your order. A hang tag or label may need both codes: GS1’s standard for products scanned at checkout requires the linear barcode beside the 2D code until all retailers are ready to scan 2D codes alone. A retailer may ask for RFID tags fixed to its own placement guideline.',
              'When. Industry goal: checkouts able to read 2D codes by late 2027.',
              'Status. QR codes in use; RFID and NFC tags on request. Our QR codes go on labels or hang tags and link to a page of yours, and the tags on our own reference garments carry QR codes that open their 3D pages. For RFID and NFC, we fix tags that you or your retailer supply, or we source and encode tags to the retailer’s specification, placed where its guideline says.',
              'The label itself. What else a label carries is in our labels guide.',
            ],
            links: [{ phrase: 'our labels guide', href: '/guides/clothing-labels' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Can I check my garment in 3D before the first sample?',
        blocks: [
          {
            kind: 'text',
            text: 'Yes, on request. 3D sampling simulates a garment on screen from its pattern and fabric data before any cloth is cut. In a 2025 University of Zagreb study of woven fabrics, the average gap between the simulated and the real prototypes’ deformation was up to 6%, and the authors stress that the result depends on reliable fabric measurements.',
          },
          {
            kind: 'list',
            items: [
              'What it cannot settle. Color still needs a physical sample, as our 3D guide explains.',
              'On our floor. Our patterns are drawn in-house and fitted on screen in CLO 3D, and our pattern making guide describes the fit checks. Our software guide tells how a 3D page is built, one of your own garment included, and which files you can send.',
              'For your order. Fit and print placement checked on screen first.',
              'When. Now.',
              'Status. In use at RUN.',
            ],
            links: [
              { phrase: 'our 3D guide', href: '/guides/3d-garment-reference' },
              { phrase: 'our pattern making guide', href: '/guides/sportswear-pattern-making' },
              { phrase: 'Our software guide', href: '/guides/apparel-design-software' },
            ],
          },
        ],
      },
      {
        heading: 'Is AI drawing patterns and planning the cut?',
        blocks: [
          {
            kind: 'text',
            text: 'Mostly in research so far. Researchers have applied deep learning to nesting pattern pieces in a marker, to reduce the unused area of the layout. A 2026 study describes the automated making of garment patterns with construction details as a field with limited research, and its author says such a system can shorten pattern development.',
          },
          {
            kind: 'list',
            items: [
              'What was tested. The 2026 system was evaluated on a dataset of garment images, not on a factory floor.',
              'For your order. Nothing changes for your order today. Marker planning decides how much fabric a style uses, as our cutting guide explains.',
              'When. Research stage.',
              'Status. Made without AI tools at RUN: our patterns, their grading and our markers. The nesting is done by marker software.',
            ],
            links: [{ phrase: 'our cutting guide', href: '/guides/garment-cutting' }],
          },
        ],
      },
      {
        heading: 'Will robots sew my order?',
        blocks: [
          {
            kind: 'text',
            text: 'Not quickly, by the International Labour Organization’s reading. In August 2021 it expected levels of automation in Asia’s garment industry to keep growing, though at a relatively modest rate. On our floor, people do the sewing at machines, and our machinery guide lists those machines.',
            links: [
              { phrase: 'our machinery guide', href: '/guides/apparel-manufacturing-machinery' },
            ],
          },
          {
            kind: 'list',
            items: [
              'For your order. No change yet.',
              'When. Gradually, on a forecast that dates from August 2021.',
              'Status. Sewing is done by people at machines.',
            ],
          },
        ],
      },
      {
        heading: 'Can my garments be made from recycled clothing?',
        blocks: [
          {
            kind: 'text',
            text: 'Yes, on request. In 2023 the EU’s Joint Research Centre found that textile recycling was mostly turning used clothing and home textiles into cleaning rags and insulation. A 2021 review found that fibers recovered by shredding mostly went into lower-grade uses, while chemical recycling could return polyester to the quality of new fiber, with the dyes removed.',
          },
          {
            kind: 'list',
            items: [
              'Closed loops. The same 2023 report found closed-loop plants, which recycle textiles back into textiles, emerging in the EU, mainly for factory waste.',
              'How much there is. The market figures for recycled polyester, year by year, are in our fibers guide.',
              'EU law. The EU’s 2025 directive on textile waste says producers should finance the scaling up of fiber-to-fiber recycling. The producer’s duties and deadlines are set out by our compliance guide.',
              'For your order. Blends are harder to recycle: the same review advises avoiding them where possible. Before you print any claim about recycled content, read the claims section of our compliance guide.',
              'When. Now, on request.',
              'Status. Available on request, quoted per order. Our recycled polyester today is made from plastic bottles, and fabric recycled from textiles can be sourced for your order.',
            ],
            links: [
              { phrase: 'our fibers guide', href: '/guides/sportswear-fibers' },
              { phrase: 'our compliance guide', href: '/guides/sportswear-compliance-by-market' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'What are dope dyeing and waterless dyeing?',
        blocks: [
          {
            kind: 'text',
            text: 'In dope dyeing, also called spin dyeing, the color goes into the polymer as the fiber is spun. A 2021 review found it was not widely used, because undyed fiber is easier to make in bulk and dye later. Waterless dyeing dissolves the dye in supercritical carbon dioxide in place of water. Both kinds of fabric are available on request.',
          },
          {
            kind: 'list',
            items: [
              'In EU permit rules. The EU’s 2022 best-available-techniques conclusions for the textile industry, the reference for permit conditions at the plants they cover, list spin-dyed man-made fibers among materials that need less processing.',
              'Waterless dyeing’s cost. The same review put the pressure it needs at 170 to 270 bar, and found its energy and equipment costs made it unappealing for many companies.',
              'For your order. With dope-dyed fiber, the color is decided before the fiber is spun, so ask early which colors are available.',
              'When. Now, on request.',
              'Status. Available on request from our fabric suppliers, with the details in your quote. Our fabric arrives already dyed by the suppliers who make it.',
              'Matching a color. Lab dips and how a color is checked are covered in our dyeing guide.',
            ],
            links: [{ phrase: 'our dyeing guide', href: '/guides/dyeing-and-color-matching' }],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'What do the PFAS rules change for water-repellent kit?',
        blocks: [
          {
            kind: 'text',
            text: 'Some per- and polyfluoroalkyl substances (PFAS) are now restricted in clothing. The EU restricts one of them, PFHxA, in consumer clothing, and New York bars apparel with PFAS added on purpose. Our compliance guide gives each market and its dates, and the finishes themselves are a topic of our outerwear guide.',
            links: [
              { phrase: 'Our compliance guide', href: '/guides/sportswear-compliance-by-market' },
              { phrase: 'our outerwear guide', href: '/guides/outerwear-and-waterproof-fabrics' },
            ],
          },
          {
            kind: 'list',
            items: [
              'For your order. Name the finish you want in your spec. The water repellent is set for each order.',
              'Papers to ask for. The supplier statements and lab tests we arrange on PFAS are listed in our compliance guide.',
              'When. In force now in some markets, with later dates in our compliance guide.',
              'Status. Water repellent set per order.',
            ],
            links: [
              { phrase: 'our compliance guide', href: '/guides/sportswear-compliance-by-market' },
            ],
          },
          { kind: 'legal', checked: '6 November 2026' },
        ],
      },
      {
        heading: 'Soccer balls: what changes with a sensor inside?',
        blocks: [
          {
            kind: 'text',
            text: 'At the 2022 World Cup, FIFA placed an inertial measurement unit, a motion sensor, in the center of the match ball. It sent ball data to the video operation room 500 times a second, so officials could find the exact kick point. We can make soccer balls with a sensor inside on request.',
          },
          {
            kind: 'list',
            items: [
              'Builds and quality marks. How balls are built, and how FIFA’s quality program tests them, are explained in the ball guide.',
            ],
            links: [{ phrase: 'the ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
        ],
      },
      {
        heading: 'How we keep this page current',
        blocks: [
          {
            kind: 'text',
            text: 'This page changes more often than most of our guides, so it carries two dates: when its words last changed, and when it was last reviewed. We review it every three months, the pace we keep for guides about laws, and each source below shows the date we read it or its own date.',
            links: [
              {
                phrase: 'the pace we keep for guides about laws',
                href: '/guides/how-we-write-our-guides',
              },
            ],
          },
        ],
      },
      {
        heading: 'What can we ask you for today?',
        blocks: [
          {
            kind: 'text',
            text: 'Choose what your order needs now: QR codes on your labels or hang tags, RFID or NFC tags to your retailer’s guideline, a 3D check before your first sample, fabric recycled from textiles, or dope-dyed fabric. Send your spec with your choices marked, and we quote each one with your order.',
            links: [{ phrase: 'Send your spec with your choices marked', href: '/contact' }],
          },
        ],
      },
    ],
    reviewed: '2026-11-06',
    sources: [
      {
        name: 'European Commission, Digital Product Passport for textile and apparel',
        url: 'https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/textile-apparel_en',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'European Commission, Digital Product Passport',
        url: 'https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Commission Implementing Decision (EU) 2026/1736 of 14 July 2026 on harmonised standards for digital product passports drafted in support of Regulation (EU) 2024/1781',
        url: 'https://eur-lex.europa.eu/eli/dec_impl/2026/1736/oj',
        date: '2026-07-15',
        kind: 'published',
      },
      {
        name: 'Regulation (EU) 2024/1781 of the European Parliament and of the Council of 13 June 2024 establishing a framework for the setting of ecodesign requirements for sustainable products (ESPR): Art. 2(29), Art. 4(4), Art. 10(1)(b), recital 37, Annex III',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1781',
        date: '2024-06-28',
        kind: 'published',
      },
      {
        name: 'European Commission, Ecodesign for Sustainable Products and Energy Labelling Working Plan 2025-2030, COM(2025) 187',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52025DC0187',
        date: '2025-04-16',
        kind: 'published',
      },
      {
        name: 'European Parliament, Legislative Train Schedule, Revision of the textile labelling regulation',
        url: 'https://www.europarl.europa.eu/legislative-train/theme-a-european-green-deal/file-textile-labeling-regulation',
        date: '2026-10-25',
        kind: 'updated',
      },
      {
        name: 'EU Transition Pathways, EU calls textile stakeholders to shape future sustainable products',
        url: 'https://transition-pathways.europa.eu/textiles/news/eu-calls-textile-stakeholders-shape-future-sustainable-products',
        date: '2026-03-20',
        kind: 'published',
      },
      {
        name: 'European Commission, Joint Research Centre, Preparatory Study on Textile Products',
        url: 'https://susproc.jrc.ec.europa.eu/product-bureau/product-groups/467/home',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'GS1, Migration to a single GS1 conformant 2D barcode for retailer private label and in-store labelled products, Position Paper Release 2.0.0',
        url: 'https://ref-pd.gs1.org/docs/2025/single-2D-barcode-for-private-label-products',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'GS1 US, Sunrise 2027',
        url: 'https://www.gs1us.org/industries-and-insights/by-topic/sunrise-2027',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'GS1 US, RFID implementation resources',
        url: 'https://www.supplychain.gs1us.org/rfid/rfid-implementation-resources',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'NFC Forum, NFC technology',
        url: 'https://nfc-forum.org/learn/nfc-technology/',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Mahnić Naglić, Petrak and Tomljenović, Analysis of Woven Fabric Mechanical Properties in the Context of Sustainable Clothing Development Process, Polymers 17(15):2013',
        url: 'https://doi.org/10.3390/polym17152013',
        date: '2025-07-23',
        kind: 'published',
      },
      {
        name: 'Alsabhi, Automating the creation of fashion patterns using deep learning algorithms, Frontiers in Artificial Intelligence 9',
        url: 'https://doi.org/10.3389/frai.2026.1828627',
        date: '2026-08-19',
        kind: 'published',
      },
      {
        name: 'Salama, Aly, Abed and Eladly, marker efficiency evaluation with optimized deep learning, Textile Research Journal 93(17-18)',
        url: 'https://doi.org/10.1177/00405175231171720',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'International Labour Organization, What future for Asia’s garment industry post-COVID?',
        url: 'https://www.ilo.org/resource/article/what-future-asia-garment-industry-post-covid',
        date: '2021-08-04',
        kind: 'published',
      },
      {
        name: 'Huygens and others, Techno-scientific assessment of the management options for used and waste textiles in the European Union, JRC134586',
        url: 'https://ideas.repec.org/p/ipt/iptwpa/jrc134586.html',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'Palacios-Mateo, van der Meer and Seide, Analysis of the polyester clothing value chain to identify key intervention points for sustainability, Environmental Sciences Europe 33:2',
        url: 'https://doi.org/10.1186/s12302-020-00447-x',
        date: '2021-01-06',
        kind: 'published',
      },
      {
        name: 'Directive (EU) 2025/1892 amending Directive 2008/98/EC on waste, recital 35',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025L1892',
        date: '2025-09-26',
        kind: 'published',
      },
      {
        name: 'Balakrishnan and others, Effect of Colorants and Process Parameters on the Properties of Dope-Dyed Polylactic Acid Multifilament Yarns, Polymers 14(22):5021',
        url: 'https://doi.org/10.3390/polym14225021',
        date: '2022-11-19',
        kind: 'published',
      },
      {
        name: 'Commission Implementing Decision (EU) 2022/2508, best available techniques (BAT) conclusions for the textiles industry',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022D2508',
        date: '2022-12-09',
        kind: 'published',
      },
      {
        name: 'Commission Regulation (EU) 2024/2462 amending Annex XVII to REACH as regards PFHxA',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R2462',
        date: '2024-09-20',
        kind: 'published',
      },
      {
        name: 'New York State Department of Environmental Conservation, PFAS in apparel law',
        url: 'https://dec.ny.gov/environmental-protection/help-for-businesses/pfas-in-apparel-law',
        date: '2026-11-06',
        kind: 'read',
      },
      {
        name: 'FIFA, Semi-automated offside technology (FIFA World Cup 2022)',
        url: 'https://inside.fifa.com/innovation/world-cup-2022/semi-automated-offside-technology',
        date: '2023-07-17',
        kind: 'updated',
      },
    ],
  },
  // Wave 5, C1: signed by the merchandiser (owner, 2026-11-06).
  {
    path: '/guides/tech-pack-template',
    title: 'Free Sportswear Tech Pack Template and Guide',
    description:
      'What goes in a sportswear tech pack, how to write measurements a factory can follow, which tests to name, and a free template to download.',
    heading: 'Your tech pack, page by page,',
    headingAccent: 'with a free template.',
    lede: 'A tech pack tells a factory how to make your garment, but you can start without one: we complete it for you, free with your order, from your sketch or reference garment. Here is what goes into one, with a free template to fill in.',
    sections: [
      {
        heading: 'What a tech pack is',
        blocks: [
          {
            kind: 'text',
            text: 'A tech pack is the document that gives a factory the instructions and specifications for making a garment. A 2026 study from Pakistan’s National Textile University says it serves as a contract between design, production and the client. Its research found a tech pack’s parts are needed to get the right information from customers.',
          },
          {
            kind: 'list',
            items: [
              'Written for the maker. The Fashion Institute of Technology in New York teaches its students to describe a garment’s construction in language that is clear to the manufacturer.',
              'Who owns it. Our FAQ answers who owns the tech pack and artwork you send.',
              'A tech pack we complete for you. Who owns it is agreed in your quote, like a pattern we make for you.',
            ],
            links: [{ phrase: 'Our FAQ', href: '/faq/working-with-us#artwork' }],
          },
        ],
      },
      {
        heading: 'The parts of a sportswear tech pack',
        blocks: [
          {
            kind: 'text',
            text: 'College courses that teach tech packs list these parts: flat drawings, detail callouts, specification sheets and a bill of materials. They also cover construction notes on seams, stitches per inch, thread and findings such as zippers, and fabric qualities with wash standards for pilling, bleeding and shrinkage.',
          },
          {
            kind: 'list',
            items: [
              'Artwork. Each print’s file, position, size and colors. The decoration method is chosen with our printing guide.',
              'Colors. Each colorway, with a Pantone reference for every color in it. A lab dip or a strike-off is signed off before bulk.',
              'Labels and packing. What each label says and where it goes, and how each piece is packed. Our packaging guide covers both.',
            ],
            links: [
              { phrase: 'our printing guide', href: '/guides/garment-printing-methods' },
              { phrase: 'A lab dip or a strike-off', href: '/guides/minimum-order-and-samples' },
              { phrase: 'What each label says', href: '/guides/clothing-labels' },
              { phrase: 'Our packaging guide', href: '/guides/private-label-packaging' },
            ],
          },
        ],
      },
      {
        heading: 'The free template',
        blocks: [
          {
            kind: 'text',
            text: 'The template is a blank tech pack with a page for each part, to fill in and send with your inquiry, free to use for your own products; all rights are reserved. To download it, fill in the short form below; your company email is needed.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              'Cover: brand, style name and number, garment type, season, quantities, delivery date, size range, the countries you sell in, revision number and date, and your contact details.',
              'Flats: front and back drawings, plus the side or inside where it helps, with a numbered callout for each detail.',
              'Bill of materials: each fabric with its composition and its weight in GSM, then thread, trims, labels and packaging, with who supplies each. A yarn count or denier can go here if you want to set one. We can sew in or apply labels and trims you send us.',
              'Colorways: one column per colorway, giving each color’s Pantone reference.',
              'Artwork and placement: one row per artwork, with its file name, its position measured from a fixed point on the garment, its size, its colors and its decoration method.',
              'Measurements: each point of measure, how to measure it, and every size, in centimeters and inches, with a tolerance column marked "agreed for your order".',
              'Construction: seam by seam, the seam and stitch type, its ISO number if you use one, the thread, the stitches per inch and the finish.',
              'Labels: which labels you need and where each one goes, with its artwork.',
              'Packing: how each piece is folded and bagged, with hang tag and carton marks.',
              'Tests: each test by name, and the result you need.',
              'Sample comments: a page each for the first sample, the size set, the pre-production sample and the top-of-production sample, with fit notes and photos.',
              'Revision log: each change, with its date and who made it.',
            ],
          },
          // The form the section's words point to ("fill in the short form below").
          { kind: 'download', template: 'tech-pack' },
        ],
      },
      {
        heading: 'Body measurements and garment measurements',
        blocks: [
          {
            kind: 'text',
            text: 'The ISO sizing standards describe the body. ISO 8559-1 sets out how to take body measurements, and ISO 8559-2 sets the body dimensions that name a size, for the garment types it specifies. ISO 8559-3, on body measurement tables, leaves garment dimensions out. Your tech pack gives the finished garment’s own measurements.',
          },
          {
            kind: 'list',
            items: [
              'Your size chart. Send the chart your customers already know. Without one, we grade from our house chart.',
              'Extended sizes. For the largest sizes, see Splitting the minimum in our minimum order guide.',
            ],
            links: [
              { phrase: 'our minimum order guide', href: '/guides/minimum-order-and-samples' },
            ],
          },
        ],
      },
      {
        heading: 'Writing the measurements',
        blocks: [
          {
            kind: 'text',
            text: 'For each point of measure, write where it is and how to measure it, because the industry measures garments in more than one way. Give the values for one size, then grade them across your full size range on a grading sheet. Put the unit beside every value.',
          },
          {
            kind: 'list',
            items: [
              'Fit points for tops. One college course lists neck drop, shoulder slope, armhole, chest width, waist and collar spread.',
              'Stretch and weight. A fabric’s properties change the pattern, the sewing, the finishing and the fit, so name the fabric on the measurement page.',
              'Tolerance. How far a measurement may vary is agreed for your order, so the template leaves that column blank.',
              'Fit rounds. After each fit, we send you the results as photos and measurements.',
            ],
          },
        ],
      },
      {
        heading: 'Seams and stitches',
        blocks: [
          {
            kind: 'text',
            text: 'Name the seam and the stitch at every seam, with the stitches per inch, the thread and the seam treatment. A stitch can be named by number as well as by name: ISO 4915 classifies stitch types and ISO 4916 seam types. We work from the ISO or ASTM numbers you write.',
          },
          {
            kind: 'list',
            items: [
              'Common seams. Our glossary explains several common seams, from flatlock to bar-tack.',
              'Seam strength. On request, an outside lab tests seam strength, quoted per order.',
            ],
            links: [
              { phrase: 'flatlock', href: '/glossary#flatlock-seam' },
              { phrase: 'bar-tack', href: '/glossary#bar-tack' },
            ],
          },
        ],
      },
      {
        heading: 'Tests to name in your tech pack',
        blocks: [
          {
            kind: 'text',
            text: 'If shrinkage or color matters, write the test into your tech pack, with the result you need. AATCC TM135 measures how a fabric’s length and width change in home laundering; AATCC TM150 does the same for a finished garment. For color, our printing guide explains the tests below.',
            links: [{ phrase: 'our printing guide', href: '/guides/garment-printing-methods' }],
          },
          {
            kind: 'list',
            items: [
              'Stretch garments. AATCC says TM150 may not suit garments made of certain stretch fabrics.',
              'Color in the wash. AATCC TM61 or ISO 105-C06.',
              'Color that rubs off. AATCC TM8.',
              'Color and sweat. AATCC TM15.',
              'Reports. For a lab report on your order, see our FAQ on certificates and test reports.',
            ],
            links: [
              {
                phrase: 'our FAQ on certificates and test reports',
                href: '/faq/quality-and-certifications#order-certificates',
              },
            ],
          },
        ],
      },
      {
        heading: 'A spec for a soccer ball',
        blocks: [
          {
            kind: 'text',
            text: 'Our template is for garments. For a soccer ball, list its build, cover material, bladder, valve, size and print colors; you choose the valve for each order. For the panels, give the count: we make 32, 18 and 12 panels, and fewer, such as 8 or 6. How soccer balls are made describes each build.',
            links: [
              { phrase: 'How soccer balls are made', href: '/guides/how-soccer-balls-are-made' },
            ],
          },
          { kind: 'list', items: ['New panel designs. More are in development.'] },
        ],
      },
      {
        heading: 'Starting from a sketch or a sample',
        blocks: [
          {
            kind: 'text',
            text: 'You do not need a tech pack to get a quote. Send a sketch or a reference garment, and we complete the tech pack for you, free of charge, with your order. If you work in CLO 3D, send its file with your tech pack by a share link, such as WeTransfer or Drive.',
          },
          {
            kind: 'list',
            items: [
              'A reference garment is welcome, and we keep it so your reorder matches.',
              'Before the sample. On request, we can show you your garment in 3D, to turn on screen, before we make the sample.',
              'What else helps a quote. See What helps us quote faster, in our order guide.',
              'Sending it back. The inquiry form takes Excel (.xlsx) and PDF files, among others, so you can attach the filled-in template.',
            ],
            links: [
              { phrase: 'show you your garment in 3D', href: '/guides/3d-garment-reference' },
              { phrase: 'our order guide', href: '/guides/how-a-private-label-order-works' },
              { phrase: 'The inquiry form', href: '/contact' },
            ],
          },
        ],
      },
    ],
    sources: [
      {
        name: 'Ramzan, Maryam, Khawar, Imran, Qureshi and Iqbal, The role of standardized technical packages in ensuring consistency and accuracy in apparel product development, AUTEX Research Journal 26(1)',
        url: 'https://doi.org/10.1515/aut-2025-0059',
        date: '2026-01-06',
        kind: 'read',
      },
      {
        name: 'Fashion Institute of Technology: Technical Design, degree outcomes',
        url: 'https://www.fitnyc.edu/academics/academic-divisions/business-and-technology/technical-design/degree-details/outcomes.php',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Coast Community College District: FASH A155 Technical Packages, Course Outline of Record',
        url: 'https://catalog.cccd.edu/courses/fash-a155/',
        date: '2026-02-25',
        kind: 'read',
      },
      {
        name: 'West Valley College: FDAT 066 Technical Design',
        url: 'https://westvalley.edu/catalog/courses/fashion-design-and-apparel-technology/fdat066.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'BSI Knowledge: BS EN ISO 8559-1:2020, identical to ISO 8559-1:2017, Size designation of clothes, anthropometric definitions for body measurement',
        url: 'https://knowledge.bsigroup.com/products/size-designation-of-clothes-anthropometric-definitions-for-body-measurement',
        date: '2021-01-31',
        kind: 'read',
      },
      {
        name: 'BSI Knowledge: ISO 8559-2:2025, Size designation of clothes, primary and secondary dimension indicators',
        url: 'https://knowledge.bsigroup.com/products/size-designation-of-clothes-part-2-primary-and-secondary-dimension-indicators',
        date: '2025-09-18',
        kind: 'read',
      },
      {
        name: 'BSI Knowledge: BS ISO 8559-3:2018, Size designation of clothes, methodology for the creation of body measurement tables and intervals',
        url: 'https://knowledge.bsigroup.com/products/size-designation-of-clothes-methodology-for-the-creation-of-body-measurement-tables-and-intervals',
        date: '2018-11-30',
        kind: 'read',
      },
      {
        name: 'BSI Knowledge: BS 3870-1:1991, identical to ISO 4915:1991, Stitches and seams, classification and terminology of stitch types',
        url: 'https://knowledge.bsigroup.com/products/stitches-and-seams-classification-and-terminology-of-stitch-types',
        date: '1991-11-29',
        kind: 'read',
      },
      {
        name: 'BSI Knowledge: BS 3870-2:1991, identical to ISO 4916:1991, Stitches and seams, classification and terminology of seam types',
        url: 'https://knowledge.bsigroup.com/products/stitches-and-seams-classification-and-terminology-of-seam-types',
        date: '1991-11-29',
        kind: 'read',
      },
      {
        name: 'AATCC: TM135, dimensional changes of fabrics after home laundering',
        url: 'https://members.aatcc.org/store/tm135/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC: TM150, dimensional changes of garments after home laundering',
        url: 'https://members.aatcc.org/store/tm150/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC: TM61, colorfastness to laundering, accelerated',
        url: 'https://members.aatcc.org/store/tm61/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC: TM8, colorfastness to rubbing',
        url: 'https://members.aatcc.org/store/tm8/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC: TM15, colorfastness to perspiration',
        url: 'https://members.aatcc.org/store/tm15/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'BSI Knowledge: BS EN ISO 105-C06:2010, identical to ISO 105-C06:2010, colour fastness to domestic and commercial laundering',
        url: 'https://knowledge.bsigroup.com/products/textiles-tests-for-colour-fastness-colour-fastness-to-domestic-and-commercial-laundering',
        date: '2010-04-30',
        kind: 'read',
      },
    ],
  },
]
