import { noteKey, type SpecGroupKey } from './specs.ts'

/**
 * THE ONE-LINE NOTES UNDER THE SPEC BULLETS (polish D10; owner's answers Q18 and Q46).
 *
 * Written 2026-10-04 by Claude, one line per term: the 158 different features of the 40 live
 * garments, their 12 fibres and 27 fits, and a sentence per weight band. Each line was checked
 * against the description of every garment that lists the term, and says only what the term
 * means for the buyer: it claims nothing those descriptions do not. So "Eco-poly stretch" does not
 * say "recycled" (R-AFP's fabric is plain polyester), and no fit promises a sport the garment's
 * description does not name. The owner approves the whole list at the end of the build (Q46),
 * before anything goes live.
 *
 * Keyed by `noteKey` (lower case, no percentages, no "Shell:" label), so one note serves every
 * garment that lists the term. US spelling and words, as the CMS text is since polish F15 (second
 * pass 2026-10-04): "odor", "paneling", "elastic", "pants". Plain words for a buyer: "not
 * see-through" rather than "opaque", and an abbreviation (DWR, DTF) spelled out. A term with no
 * note draws as a plain bullet with nothing to open.
 */

export const FIBRE_NOTES: Record<string, string> = {
  polyester: 'Strong, light and quick to dry; it holds its shape and color wash after wash.',
  'recycled polyester':
    'Polyester made from recycled plastic, such as used bottles, rather than new material.',
  spandex: 'The stretch in the fabric: it moves with the body and springs back.',
  'spandex stretch': 'The stretch in the fabric: it moves with the body and springs back.',
  nylon: 'Smooth, tough and light; it stands up to rubbing and dries fast.',
  'nylon (polyamide)': 'Nylon, also called polyamide: smooth, tough, light and quick to dry.',
  cotton: 'A soft, breathable natural fiber that feels good next to the skin.',
  'organic cotton':
    'Cotton grown without synthetic pesticides or fertilizers; soft and breathable.',
  'genuine leather (cowhide)':
    'Real cow leather: hard-wearing, it keeps the wind out and softens with wear.',
  polychloroprene: 'The chemical name for neoprene: a rubbery foam that keeps you warm when wet.',
  'polyester taslon':
    'A textured woven polyester for the outer shell: light, tough and wind-resistant.',
  'polyester taffeta': 'A smooth, light woven lining that slides easily over other clothes.',
}

export const FIT_NOTES: Record<string, string> = {
  'contoured, masculine-specific cut': 'Shaped to a man’s build, so it sits close without pulling.',
  'contoured, female-specific cut': 'Shaped to a woman’s build, so it sits close without pulling.',
  'kinetic athletic fit': 'Close to the body, with room where you bend and reach.',
  'tactical engineered fit': 'Cut for movement: room to reach and bend, with no extra fabric.',
  'tapered urban fit': 'Slim, narrowing toward the hem, for a clean city look.',
  'extended modern commuter fit': 'Cut longer than a standard jacket, for more coverage.',
  'articulated athletic fit': 'Shaped at the elbows so you can bend and reach without pulling.',
  'relaxed athletic fit': 'Roomier than an athletic fit, for easy movement and layering.',
  'streamlined aero fit': 'Close and smooth, so nothing flaps in the wind at speed.',
  'tapered pant silhouette': 'Pants that narrow from hip to ankle, for a neat line.',
  'relaxed flow fit': 'Loose and easy, so the fabric moves freely with you.',
  'athletic tapered fit': 'Close through the body and narrower toward the hem.',
  'skinny fit': 'Close to the body all the way down.',
  'relaxed, refined fit': 'Easy and comfortable, and cut clean enough to look smart.',
  'sleek athletic cut': 'Slim and smooth through the body, made to move in.',
  'cropped cut': 'Shorter than standard, ending above the waist.',
  'athletic fit': 'Close to the body without squeezing, so it moves with you.',
  'high-support compression': 'A firm, snug hold that supports the body and cuts down bounce.',
  'anatomical, low-bulk fit': 'Shaped to the body with little extra fabric, so nothing bunches.',
  'flexible compression fit': 'Snug and supportive, with enough stretch to move freely.',
  'athletic fit with ergonomic panel design':
    'A close fit with panels shaped to how the body moves.',
  'modern athletic fit': 'A close, clean athletic shape that does not squeeze.',
  'boxy fit': 'A square, roomy shape that hangs straight from the shoulders.',
  'tailored, secure fit': 'Cut close and neat, so it stays in place while you move.',
  'ergonomic athletic fit': 'An athletic fit shaped around how the body moves.',
  'aero race fit': 'Very close and smooth, to cut wind drag at race speed.',
  'race fit': 'Very close to the body, so nothing flaps or holds you back.',
}

const DWR = 'A durable water-repellent (DWR) coating that makes rain bead up and roll off.'
const DTF = 'Direct-to-film (DTF): the design is printed on film, then heat-pressed on.'
const EVA = 'Light foam padding that softens knocks and keeps its shape.'
const SCREEN = 'Ink pressed through a stencil: bold, solid color that lasts.'
const SUBLIMATION = 'The design is dyed into the fabric, so it will not crack or peel.'
const STRETCH_POLY = 'A stretchy polyester knit made to move with you.'
const NOT_SEE_THROUGH = 'Holds its shape, and does not turn see-through with wear.'

export const FEATURE_NOTES: Record<string, string> = {
  // R-AJM, R-AU, R-AJ (American football)
  'double mesh interlock': 'A two-layer mesh knit: airy, yet tough enough for contact.',
  'eva foam pad': EVA,
  'eva padding': EVA,
  'silicone printing': 'A raised, rubbery print whose sharp edges hold up to contact.',
  'contrasting ribbed v-neck trim': 'A stretchy ribbed V-neck edge in a second color.',
  'padded pants with run elastic waistband':
    'Pants with foam pads at hip, thigh and knee, and an elastic waistband.',
  'double interlock knit': 'A thick, smooth double knit that keeps its shape.',
  // R-KMJ, R-ATJ, R-MSS, R-ALJ, R-VCJ (softshells and the leather jacket)
  'hydro-repellent softshell': 'A stretchy outer fabric that makes rain bead up and roll off.',
  'structural scuba hood with visor':
    'A close hood that holds its shape, with a peak to keep rain off.',
  'core ventilation system': 'Vents that let body heat out, so you do not overheat on the move.',
  'shock-cord hem': 'An elastic cord in the hem that you pull to seal out wind.',
  'reinforced bonded seams':
    'Seams joined with heat-bonded tape, for strength and a better seal against rain.',
  '1.2 mm cowhide leather': 'Real cowhide, 1.2 mm thick: tough, yet light enough to move in.',
  'multi-point adjustable storm hood': 'A weather hood you tighten at several points to fit close.',
  'waterproof utility zippers': 'Zippers that keep the rain out.',
  'adjustable velcro cuffs': 'Hook-and-loop tabs that tighten the cuffs against wind and rain.',
  '3d articulated shoulder panels': 'Shaped shoulder panels that let you lift and reach freely.',
  'ripstop softshell outer shell':
    'A tough outer shell woven with a grid that stops small tears spreading.',
  'thermal-regulating fleece lining':
    'A soft fleece lining that keeps you warm without overheating.',
  'reinforced knee panels': 'Extra layers at the knees, where pants wear out first.',
  'taped waterproof seams': 'Tape sealed over the seams, so rain cannot get through stitch holes.',
  'windproof membrane': 'A thin layer inside the fabric that stops the wind getting through.',
  'high-neck scuba hood with toggles':
    'A high, close hood you tighten with toggles against the wind.',
  'dual-entry utility pockets': 'Pockets you can reach into from two sides.',
  'adjustable storm cuffs': 'Cuffs you tighten to keep out wind and rain.',
  'matte memory-shine finish': 'A matte finish with a soft, low sheen.',
  'thermal regulating fabric': 'Fabric that keeps you warm in the cold without overheating.',
  'adjustable scuba hood system': 'A close-fitting hood you adjust to sit snug around your face.',
  'dwr weather-resistant finish': DWR,
  'tactical chest zippers': 'Zips across the chest, easy to reach on the move.',
  'dual-layer storm cuffs': 'An inner and an outer cuff that keep wind and rain out together.',
  '3d engineered paneling': 'Panels shaped to the body, so the jacket keeps its form as you move.',
  // R-PPS, R-ATW (sherpa, windbreaker)
  'high-loft sherpa fleece': 'Thick, fluffy fleece that traps warm air like a sheep’s wool.',
  'bonded mesh lining': 'A mesh lining fused to the fleece, so the two work as one layer.',
  'durable ripstop overlays':
    'Patches of tough ripstop, woven with a grid that stops tears spreading.',
  'zippered chest pocket': 'A zipped chest pocket that keeps small things safe.',
  'double-needle reinforced stitching': 'Two parallel rows of stitches, for seams that last.',
  'ultralight wind-resistant shell': 'A very light outer layer that keeps the wind off.',
  'ventilated back yoke': 'Vents across the upper back that let heat out.',
  'breathable mesh lining': 'An airy mesh inside that lets heat and sweat escape.',
  'dwr water-repellent finish': DWR,
  'packable construction': 'Folds up small enough to pack away.',
  // R-ET, R-CCH, R-CSP (tracksuit, hoodie, pullover)
  'pullover hood with drawcord': 'A pull-over hoodie, with a cord to tighten the hood.',
  'contrast raglan sleeves': 'Sleeves in a second color, sewn on a diagonal for free arm movement.',
  'tapered pant with ribbed cuffs': 'Pants that narrow to stretchy ribbed ankle cuffs.',
  'elastic waist': 'A stretchy waistband that is easy to pull on and stays put.',
  'wrinkle-resistant fabric': 'Fabric that resists creasing, so it looks neat after travel.',
  'screen print': SCREEN,
  'soft-touch tech fleece': 'A smooth, soft fleece that stays light and warm.',
  'structured raglan paneling': 'Diagonal sleeve seams that shape the shoulders and let arms move.',
  'wide bell sleeves': 'Sleeves that flare wider toward the wrist.',
  'oversized hood construction': 'A big, roomy hood for a relaxed look.',
  'ribbed hemline': 'A stretchy ribbed edge at the hem that holds the shape.',
  'high-density screen print': 'A thick, raised screen print with crisp edges.',
  'brushed thermal fleece interior': 'A soft, brushed inside that traps warmth.',
  'stand-up mock neck': 'A short collar that stands up to keep the neck warm.',
  'half-zip ventilation': 'A half-length zip you open to cool down.',
  'ribbed cuffs and hem': 'Stretchy ribbed cuffs and hem that hold their shape.',
  'double-stitch construction': 'Seams sewn twice, for extra strength.',
  // R-TAZ (half-zip polo)
  'modern blade collar': 'A clean, flat collar with a sharp edge.',
  'semi-auto lock zipper placket':
    'A zip that locks when the pull is down, so it will not slide open.',
  'split-hem construction': 'Short side slits at the hem for easy movement.',
  'odor-resistant moisture wicking': 'Moves sweat off the skin and helps keep smells down.',
  '4-way stretch mobility': 'Stretches across and along the fabric, so it moves every way you do.',
  // R-ZT, R-CAT (yoga tights)
  'squat-proof opacity': 'Does not turn see-through when it stretches, even in a deep squat.',
  'color-lock dyeing': 'A dyeing method that holds the color through many washes.',
  'poly stretch knit': 'A stretchy polyester knit that moves with you and keeps its shape.',
  'fade and pill resistant': 'Resists fading and the little bobbles that form with wear.',
  'compression architecture': 'A firm, supportive hold built into the knit.',
  'high-rise ergonomic waistband': 'A tall, shaped waistband that stays in place as you move.',
  'hydrophobic fiber technology': 'Fibers that push sweat away instead of soaking it up.',
  'puri knit fabric': 'A knit that holds its shape and is not see-through, even in hot yoga.',
  'shape and opacity retention': NOT_SEE_THROUGH,
  // R-PRS, R-IFS, R-HFJ, R-AFP (running shirt, sweatshirt, training tops)
  'quarter-zip airflow regulation': 'A quarter-length zip you open to let air in as you heat up.',
  'mesh knit and piqué knit panels':
    'Airy mesh and textured piqué panels, for airflow and structure.',
  'recycled polyester': 'The fabric is made from recycled plastic, such as used bottles.',
  'side pocket': 'A pocket at the side for small things.',
  'metal zip': 'A sturdy metal zip.',
  'flex jersey knit': 'A soft, stretchy jersey that moves with you.',
  'clean crew neckline': 'A simple round neckline.',
  'precision-finished cuffs and hem': 'Neatly finished cuffs and hem that keep their shape.',
  'fade-resistant color': 'Color that resists fading, wash after wash.',
  'digital printing':
    'Designs printed straight from a digital file, with fine detail and many colors.',
  'power knit and waffle knit panels':
    'A smooth stretch knit and a textured waffle knit, for drape and feel.',
  'poly stretch fabric': 'A stretchy polyester fabric that moves with you.',
  'upper stitch detailing': 'Visible stitching across the upper body, for a crafted look.',
  'waffle knit': 'A grid-textured knit that feels soft and holds warmth.',
  'invisible zip': 'A zip hidden in the seam, for a clean look.',
  'convertible stand collar': 'A collar that stands up when zipped and falls open when unzipped.',
  'eco-poly stretch': STRETCH_POLY,
  // Printing, on many garments
  'dtf print': DTF,
  'dtf print and embroidery':
    'A direct-to-film (DTF) heat-pressed print, plus stitched embroidery.',
  'screen printing': SCREEN,
  'full sublimation print':
    'The design is dyed into the fabric all over, so it will not crack or peel.',
  'sublimation printing': SUBLIMATION,
  'digital sublimation print': SUBLIMATION,
  // R-WCT, R-ECT, R-WZU, R-ASB (crop tops, vest, sports bra)
  'compression interlock': 'A firm, close knit that hugs and supports the body.',
  'athletic spandex': 'A high-stretch fabric that moves with the body.',
  'moisture-wicking blend': 'A fabric blend that moves sweat away from the skin.',
  'ventilated cropped cut': 'A shorter cut that lets air in to keep you cool.',
  'single jersey knit': 'A light, smooth knit, like a classic T-shirt.',
  'thumb holes': 'Holes at the cuffs for your thumbs, to keep the sleeves in place.',
  'breathable contoured coverage':
    'Breathable fabric shaped to the body, so you are covered but cool.',
  'matching high-waist shorts':
    'Shorts in the same fabric that sit high on the waist, worn as a set.',
  'eco-power mesh': 'A strong, stretchy mesh that keeps you cool.',
  'reversible zip': 'A zip that works from either side, so you can wear the vest two ways.',
  'mesh panel construction': 'Mesh panels that let air through where you heat up most.',
  'elastane strap': 'A strap made with elastane (spandex): it holds firm and stretches with you.',
  'high-support compression': 'A firm, supportive hold that cuts down bounce.',
  'spacer knit fabric': 'A cushioned two-layer knit that breathes and pulls sweat away.',
  'moisture-wicking': 'Moves sweat off the skin, so you stay drier.',
  'strappy back design': 'Several straps across the back for support and airflow.',
  // R-SNP (wetsuit)
  'laminated high-stretch neoprene':
    'Stretchy neoprene with fabric bonded on, for warmth that moves.',
  'ergonomic neckline': 'A neckline shaped so you can turn your head freely.',
  'anatomically engineered panels': 'Panels shaped to the body, for a close fit in the water.',
  'reinforced chest and shoulder zones':
    'Tougher material at the chest and shoulders, where wear is hardest.',
  'flatlock and bonded seams': 'Flat stitched and glued seams that last and do not rub.',
  // R-XMT, R-MXT (training vest, training top)
  'breathable mesh panels': 'Mesh panels that let air in where you heat up.',
  'sleeveless athletic design': 'No sleeves, for full arm movement and airflow.',
  'temperature-regulating performance':
    'Made to keep you comfortable as your body heats up and cools down.',
  'flatlock stitching': 'Flat seams that sit smooth against the skin and do not chafe.',
  'full-length front zipper': 'A zip all the way down, for easy on and off and quick cooling.',
  'invisible side zip panels': 'Side panels with hidden zips, for a clean look.',
  'moisture-wicking quick-dry fabric': 'Moves sweat off the skin and dries fast.',
  // R-VPJ, R-CSS, R-FFT, R-CVN, R-SRS (soccer)
  'interlock knit': 'A smooth double knit that is soft and keeps its shape.',
  'sponsor logo zones': 'Areas kept clear for sponsor logos.',
  'diagonal chest and shoulder panels':
    'Solid-color panels set at an angle across the chest and shoulders.',
  'cotton-poly balance fabric':
    'A cotton and polyester blend: soft like cotton, tough like polyester.',
  'fold-over polo collar': 'A classic folded polo collar.',
  'aero liner mesh': 'A light, airy mesh that keeps players from overheating.',
  'adjustable sides': 'Sides that tighten, for a closer fit than a loose bib.',
  'lightweight 80–100 gsm build': 'A very light fabric, 80–100 grams per square meter.',
  'quick-dry lightweight fabric': 'A light fabric that dries fast.',
  'contrast sleeve panels': 'Sleeves in a second color.',
  '6-panel construction': 'Built from six panels for a shaped fit.',
  'cylindrical sleeve piping for airflow':
    'Rounded piping along the sleeves that moves air around the neck.',
  'v-shape collar': 'A V-shaped collar that opens at the neck.',
  'folded sleeve and waist hems':
    'Folded, stitched hems at the sleeves and waist, for a clean finish.',
  'eco velocity jersey interlock': 'A smooth, light double-knit jersey.',
  // R-MRP, R-TTP, R-GTD, R-BCD, R-MM, R-WSA (tennis)
  'suitable for tennis and pickleball':
    'Made for the court: it works for both tennis and pickleball.',
  'recycled interlock knit': 'A smooth double knit made from recycled polyester.',
  'eco poly stretch': STRETCH_POLY,
  'engineered seam placement': 'Seams placed to support movement and stay out of the way.',
  'flex jersey panels': 'Stretchy jersey panels where the body bends.',
  'poly-stretch interlock': 'A stretchy polyester double knit that keeps its shape.',
  'bra and skirt set': 'A matching sports bra and skirt, worn together.',
  'high-flexibility construction': 'Made to stretch and bend with every shot.',
  '22-panel faceted construction': 'Made from 22 angled panels, like the facets of a cut diamond.',
  'interlock spandex': 'A smooth, stretchy double knit that moves with you.',
  'textured compression belt': 'A firm, textured waistband that holds the dress in place.',
  'conical skirt construction': 'A skirt cut in a cone shape, wider at the hem.',
  // R-XMP, RXPS (cycling)
  'multi-density chamois pad': 'A seat pad with firmer and softer zones, for long rides.',
  'breathable mesh bib straps': 'Airy mesh shoulder straps that hold the shorts in place.',
  'silicone leg grippers': 'Silicone bands at the leg ends that stop them riding up.',
  'moisture-wicking fabric': 'Fabric that moves sweat off the skin, so you stay drier.',
  'moisture management': 'Moves sweat away from the skin, to keep you dry.',
  'four-way stretch': 'Stretches across and along the fabric, so it moves every way you do.',
  'quick-dry handle': 'A smooth feel that dries fast.',
}

/**
 * A sentence for the weight. Neoprene and leather are sold by thickness and padding by its own
 * grams; a fabric's grams per square meter are put in a band by the middle of the range, in the
 * words of the site's own GSM guide ("how heavy a fabric is", apps/cms/src/lib/guides.ts, whose
 * ranges run from mesh at 100 GSM to fleece at 350). A band says how the fabric feels, never what
 * it is for: the "very light" band holds a windbreaker, a softshell and a training bib (checked
 * against all 40 live garments 2026-10-04), so "for hot days" would be wrong for two of them.
 */
export function weightNote(gsm: string): string | null {
  const text = gsm.toLowerCase()
  if (/\bmm\b/.test(text)) {
    return text.includes('neoprene')
      ? 'Neoprene is sold by thickness: thicker is warmer, thinner bends more easily.'
      : 'Measured by thickness: thicker is tougher, thinner is lighter and softer.'
  }
  const numbers = [...text.matchAll(/\d+/g)].map((match) => Number(match[0]))
  if (numbers.length === 0 || !/gsm|g\/m/.test(text)) return null
  if (text.includes('insulation')) {
    return 'The weight of the padding inside, in grams per square meter: more grams, more warmth.'
  }
  const middle = (Math.min(...numbers) + Math.max(...numbers)) / 2
  const band =
    middle < 120
      ? 'very light and thin'
      : middle < 170
        ? 'light, an easy layer'
        : middle < 230
          ? 'mid-weight, solid yet easy to move in'
          : middle < 300
            ? 'heavier, sturdy and hard-wearing'
            : 'heavy and thick, for warmth'
  return `How heavy the fabric is, in grams per square meter: ${band}.`
}

/** The note for one bullet, or null. What `specGroups` is given by the CMS. */
export function specNote(group: SpecGroupKey, text: string): string | null {
  if (group === 'weight') return weightNote(text)
  const notes = group === 'fabric' ? FIBRE_NOTES : group === 'fit' ? FIT_NOTES : FEATURE_NOTES
  return notes[noteKey(text)] ?? null
}
