/**
 * The smallest spreadsheet writer the tech-pack template needs (C1, owner approved 6 Nov 2026).
 *
 * WHY NOT A LIBRARY. The template is one fixed workbook: text cells, a few styles, merged title
 * bands, column widths and print settings. A spreadsheet package would be the website's largest
 * dependency for that, and the root rules ask for a Socket score before adding one. This writes the
 * Office Open XML parts (ECMA-376, SpreadsheetML) directly.
 *
 * ⚠️ STORED, NOT COMPRESSED, AND DATED ONCE. The zip entries use method 0 with a fixed date, so the
 * same workbook gives the same bytes on every run and in every runtime: a Worker has no zlib to
 * match Node's, and a test can pin the file by its hash. The cost is size, about 70 KB instead of
 * about 12 KB, which is nothing for a file a buyer downloads once.
 *
 * ⚠️ PLAIN WEB APIs ONLY (TextEncoder, Uint8Array, DataView), because the download route builds the
 * file inside the Worker.
 */

export type CellStyle =
  | 'plain'
  | 'band'
  | 'header'
  | 'input'
  | 'label'
  | 'note'
  | 'section'
  | 'given'
  | 'drawing'

/** One cell: its text (empty for an empty styled cell) and its style. */
export type Cell = { text: string; style: CellStyle } | null

export type Sheet = {
  /** The tab's name: 31 characters at most, none of \ / ? * [ ] : */
  name: string
  /** Each column's width in characters. */
  widths: readonly number[]
  rows: readonly (readonly Cell[])[]
  /** Row heights in points, by 0-based row index, where a row needs more than one line. */
  heights?: Readonly<Record<number, number>>
  /** Merged ranges, e.g. "A1:H1". */
  merges?: readonly string[]
  /** Rows kept on screen while scrolling and repeated on every printed page. */
  frozenRows: number
  /** 1-based rows after which a printed page ends. */
  breaks?: readonly number[]
  /** The printed page's footer, left part. */
  footer: string
}

export type Workbook = {
  title: string
  creator: string
  /** ISO date, fixed: the file's bytes must not change with the clock. */
  created: string
  sheets: readonly Sheet[]
}

const STYLE_INDEX: Record<CellStyle, number> = {
  plain: 0,
  band: 1,
  header: 2,
  input: 3,
  label: 4,
  note: 5,
  section: 6,
  given: 7,
  drawing: 8,
}

/** The brand's Paper & Ink colours (`packages/ui/src/tokens.css`), as Excel's ARGB. */
const INK = 'FF1D1F1A'
const VOLT = 'FFCDF345'
const WASH = 'FFE4E1D8'
const PAPER = 'FFF1EFEA'
const WHITE = 'FFFFFFFF'
const MUTED = 'FF62655A'
/** Ink at 55% over white, the brand's control edge. */
const EDGE = 'FF838580'

export const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters XML 1.0 refuses (control characters other than tab, newline and return).
    // biome-ignore lint/suspicious/noControlCharactersInRegex: these are the characters being removed
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(index: number): string {
  let name = ''
  let n = index + 1
  while (n > 0) {
    const rest = (n - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
<font><sz val="10"/><color rgb="${INK}"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="${INK}"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="13"/><color rgb="${VOLT}"/><name val="Arial"/><family val="2"/></font>
<font><sz val="9"/><color rgb="${MUTED}"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="${INK}"/><name val="Arial"/><family val="2"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${INK}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${WASH}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${PAPER}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${WHITE}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="${EDGE}"/></left><right style="thin"><color rgb="${EDGE}"/></right><top style="thin"><color rgb="${EDGE}"/></top><bottom style="thin"><color rgb="${EDGE}"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="49" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="49" fontId="1" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="bottom"/></xf>
<xf numFmtId="49" fontId="3" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>
`

function sheetXml(sheet: Sheet, first: boolean): string {
  const lastColumn = columnName(Math.max(sheet.widths.length, 1) - 1)
  const rowCount = Math.max(sheet.rows.length, 1)
  const cols = sheet.widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('')
  const rows = sheet.rows
    .map((row, r) => {
      const height = sheet.heights?.[r]
      const cells = row
        .map((cell, c) => {
          if (!cell) return ''
          const ref = `${columnName(c)}${r + 1}`
          const s = STYLE_INDEX[cell.style]
          if (cell.text === '') return `<c r="${ref}" s="${s}"/>`
          return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.text)}</t></is></c>`
        })
        .join('')
      const ht = height ? ` ht="${height}" customHeight="1"` : ''
      return `<row r="${r + 1}"${ht}>${cells}</row>`
    })
    .join('')
  const pane =
    sheet.frozenRows > 0
      ? `<pane ySplit="${sheet.frozenRows}" topLeftCell="A${sheet.frozenRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="B${sheet.frozenRows + 2}" sqref="B${sheet.frozenRows + 2}"/>`
      : ''
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : ''
  // `&P of &N` is Excel's page number and count; `&` itself must be escaped as XML.
  const footer = `&amp;L&amp;8${escapeXml(sheet.footer).replace(/&amp;/g, '&amp;&amp;')}&amp;R&amp;8Page &amp;P of &amp;N`
  // After headerFooter, as the schema orders a worksheet's parts.
  const breaks = sheet.breaks?.length
    ? `<rowBreaks count="${sheet.breaks.length}" manualBreakCount="${sheet.breaks.length}">${sheet.breaks.map((r) => `<brk id="${r}" max="16383" man="1"/>`).join('')}</rowBreaks>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastColumn}${rowCount}"/><sheetViews><sheetView${first ? ' tabSelected="1"' : ''} showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>${footer}</oddFooter></headerFooter>${breaks}</worksheet>
`
}

/** The workbook's parts, in the order they are zipped: the content types first, as Office writes them. */
export function workbookParts(book: Workbook): [string, string][] {
  const n = book.sheets.length
  const sheetIds = book.sheets.map((_, i) => i + 1)
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetIds.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>
`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>
`
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(book.title)}</dc:title><dc:creator>${escapeXml(book.creator)}</dc:creator><cp:lastModifiedBy>${escapeXml(book.creator)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${book.created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${book.created}</dcterms:modified></cp:coreProperties>
`
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>${escapeXml(book.creator)}</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><Company>${escapeXml(book.creator)}</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>
`
  const definedNames = book.sheets
    .map((sheet, i) =>
      sheet.frozenRows > 0
        ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${sheet.name.replace(/'/g, "''")}'!$1:$${sheet.frozenRows}</definedName>`
        : '',
    )
    .join('')
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${book.sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${definedNames ? `<definedNames>${definedNames}</definedNames>` : ''}</workbook>
`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetIds.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>
`
  return [
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRels],
    ['docProps/core.xml', core],
    ['docProps/app.xml', app],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', workbookRels],
    ['xl/styles.xml', STYLES],
    ...book.sheets.map(
      (sheet, i) =>
        [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet, i === 0)] as [string, string],
    ),
  ]
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 as zip uses it (IEEE 802.3). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** A zip of stored (uncompressed) entries, every one dated `date` at midnight. */
export function storedZip(entries: readonly [string, Uint8Array][], date: Date): Uint8Array {
  const dosDate =
    ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name)
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed: 2.0
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, 0, true) // method: stored
    lv.setUint16(10, 0, true) // time: midnight
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)

    locals.push(local, data)
    centrals.push(central)
    offset += local.length + data.length
  }
  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + end.length)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** The workbook as .xlsx bytes. */
export function buildXlsx(book: Workbook): Uint8Array {
  const encoder = new TextEncoder()
  return storedZip(
    workbookParts(book).map(([name, xml]) => [name, encoder.encode(xml)] as [string, Uint8Array]),
    new Date(book.created),
  )
}
