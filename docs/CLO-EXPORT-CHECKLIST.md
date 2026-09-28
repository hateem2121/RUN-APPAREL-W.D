# CLO export checklist — before you send a garment

**In plain words:** Eleven things to check in CLO before exporting a garment, so its 3D page comes out right the first time.

Written 2026-09-27 for the owner, from the census of all 43 garment exports and the
3D-quality investigation of the same day. Each item says **what to do**, **why**, and
**which garment showed the problem**. None of these can be fixed after export — the
website works with what the file contains — so the only place to fix them is CLO.

---

## Before you export

### 1. Attach every colour to its colourway

In CLO's Colorway editor, check that each colourway really changes the fabric colour.

- **Why:** the website reads each colour out of the file. If the colourways all point
  at the same fabric, all five buttons show the same garment.
- **Seen on:** *Matrix-Puff Jacket* and *Structure Polo Set* — five colourways each, but
  no fabric attached to any of them. Both stay drafts until they are re-exported.

### 2. Turn OFF "Diffuse Color Combined on Texture"

In the glTF export window, untick **Diffuse Color Combined on Texture**.

- **Why:** with it on, CLO paints the colour into one shared picture, and every
  colourway comes out white or the same.
- **Seen on:** the older exports replaced on 2026-09-03 (`raw/CANONICAL.json` records which
  export each live garment was built from).

### 3. Topstitch as **Texture**, not as 3D thread

Set topstitching to render as a texture.

- **Why:** 3D thread can be 99% of a file's triangles — one bib export had 34 million
  triangles, of which the whole visible garment was 11,128. It makes phones slow and
  adds nothing a buyer can see.
- **Seen on:** every current export already does this (0% thread in all 43). Keep it.

### 4. All colourways in ONE file

Export once, with every colourway inside it (CLO 2025.2 does this).

- **Why:** an older CLO wrote one file per colour, which the robot cannot join by itself.

### 5. Leather and coated fabric need a real roughness

Do not leave a leather or coated fabric at a single low roughness number.

- **Why:** a low number makes it look like shiny patent leather under the website's light.
- **Seen on:** *Armor-Tech Jacket* — roughness 0.40 with specular 0.6 in the export. The
  pipeline already raises it to 0.50; more than that has to come from CLO (a roughness
  map, or a higher number). *Aurora Longline Jacket* and *Vanta Core Jacket* (2026-09-27):
  the puffer fabric is roughness 0.20, so both look far glossier than CLO's own render —
  the pipeline leaves it, because it only corrects a fabric it has to fix for false metal.

### 6. Give printed logos their own ink colour

A logo or print should have its own colour and a normal roughness, not the cloth's.

- **Why:** CLO often writes the fabric colour into the print, so a logo can vanish into
  the cloth it sits on. The robot reports it; it never repaints a print by itself,
  because two automatic repaints were wrong (`.claude/rules/pipeline-materials.md`).
- **Seen on:** *Apex Flex Pullover* — the logo came out in the cloth's colour, at
  roughness 0.20 (shiny).

### 7. No weave or bump picture bigger than 4096 pixels

Keep fabric weave and bump maps at 4096 × 4096 or smaller.

- **Why:** phones cannot hold bigger pictures in graphics memory, so the pipeline shrinks
  them anyway — the extra size only makes the export slower to upload and process.
- **Seen on:** 27 of the 43 exports have at least one; *Endura Crop Top* has 54 and
  *Chevron V-Neck Soccer Jersey* 40.

### 8. Every texture must carry its picture

If CLO lists a texture with no image behind it, fix or remove it before export.

- **Why:** a texture with no picture crashes the 3D library in some browsers. The pipeline
  can hide a missing *shading* map; a missing *colour* map is the garment's own picture,
  and the robot refuses the file.
- **Seen on:** *Capsule Core Hoodie*, *Crimson Stride Pullover*, *Flex Fitted Training
  Vest*, *Structure Polo Set* and *Terra Active Zip* — one empty texture each (all were
  shading maps, so they still process).

### 9. Keep the export under 4 GB

Before exporting, shrink very large texture pictures (or export them as JPEG) so the finished
`.glb` stays well under 4 GB.

- **Why:** the glTF file format stores sizes as 32-bit numbers, so it cannot hold more than
  4 GB. CLO writes a bigger export anyway, and silently leaves out whatever does not fit —
  the file opens, but those pictures are simply not in it, so nothing can process it.
- **Seen on:** *Athletic V-Neck Jersey* (2026-09-27) — its pictures add up to 4,318,896,259
  bytes, over the 4,294,967,296 limit; CLO kept 256 MB and dropped 91 of its 103 textures. It
  stays a draft until it is re-exported.

### 10. Faded prints come out bold

A soft, faded print (a brush stroke, a watercolour, a marble effect) looks stronger on the
website than in CLO's render.

- **Why:** a known CLO limit — the export keeps the print's colour but not all of its
  softness. Accepted as it is (owner, 2026-09-27).
- **Seen on:** *Geovent Tennis Dress*, *Minecut Motion*'s marble, *Arisan Sports Bra*'s
  brush logo.

## After you export

### 11. Render one picture per colour, named by colourway

Save CLO's studio render for **each** colourway as `NAME_Colorway N.png`, at least 2000
pixels tall, in the garment's folder.

- **Why:** these pictures become the **HD IMAGE** button on each colour. A render named
  `(1)`, `(2)`… has to be matched to a colour by guessing its shade, and a render that
  cannot be matched is simply left off, so that colour gets no HD IMAGE button.
- **Seen on:** *Minecut Motion*, *Geovent Tennis Dress*, *X-Milo Pro Bib* and *Women's
  Athletic Tennis Dress* use `(N)` names; *The Aggressor Uniform* has renders for three
  of its five colours.

### Where the files go

One folder per garment in **3D Catalouge Products**, holding the CLO project (`.zprj`),
the export as **one** `.zip`, and the renders. Never two zips in one folder: the Mac
processing script (`scripts/process-local.mjs`) refuses a folder with two, rather than
guessing which one you meant.
