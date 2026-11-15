"""
The buyer receipt's moving header: apps/cms/public/email/inquiry-received.gif (owner, 2026-11-10).

Run: ~/.venvs/imaging/bin/python apps/cms/scripts/make-receipt-gif.py
     ~/.venvs/imaging/bin/python apps/cms/scripts/make-receipt-gif.py --lang ru
Needs Pillow and the brand's three faces installed (Archivo Expanded ExtraBold, IBM Plex Mono,
Instrument Serif Italic — all free on Google Fonts; this Mac has them in ~/Library/Fonts).

THE RUSSIAN BANNER (inquiry-received-ru.gif, owner 2026-11-15, for a buyer who wrote from
/ru/contact). Archivo and Instrument Serif have no Cyrillic, so it uses the site's own companions
from packages/ui/fonts (cyrillic.css): Roboto Flex at weight 800 and its widest committed width,
at the site's size-adjust 99%, and Cormorant Italic at 125%. Those files are Cyrillic-only subsets,
so every other character (space, full stop, digits, "<") is drawn from the brand face, exactly as
the browser's unicode-range does; a first render without that showed "NO GLYPH" boxes for the full
stops. `require_glyphs` stops the script on any character a face lacks. The English banner is
drawn by the same code path as before, byte for byte (SHA-256 compared, 2026-11-15).

WHY A GIF: about 98% of mail clients play an animated GIF; CSS animation reaches about 34% and AMP
about 16% (caniemail.com, read 2026-11-10). Outlook on Windows shows only the FIRST frame, so frame
one is the whole message on its own: every word, and the dot already at "Received".

Paper & Ink, Night Shift (packages/ui/src/tokens.css): ink ground, the blueprint grid every 26px,
volt for the one moving thing. Drawn at 2x (1200 x 360) and shown at 600 x 180.
"""

import os
import sys

LANG = "en"
if "--lang" in sys.argv:
    LANG = sys.argv[sys.argv.index("--lang") + 1]
    del sys.argv[sys.argv.index("--lang") : sys.argv.index("--lang") + 2]

from PIL import Image, ImageDraw, ImageFont

FONTS = os.path.expanduser("~/Library/Fonts")
HEAD = ImageFont.truetype(os.path.join(FONTS, "Archivo_Expanded-ExtraBold.ttf"), 64)
SERIF = ImageFont.truetype(os.path.join(FONTS, "InstrumentSerif-Italic.ttf"), 70)
MONO = ImageFont.truetype(os.path.join(FONTS, "IBMPlexMono-Medium.ttf"), 26)
MONO_SMALL = ImageFont.truetype(os.path.join(FONTS, "IBMPlexMono-Medium.ttf"), 26)

UI_FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../packages/ui/fonts")
HEAD_RU = ImageFont.truetype(os.path.join(UI_FONTS, "roboto-flex-cyrillic-wdth-100-125.woff2"), round(64 * 0.99))
HEAD_RU.set_variation_by_axes([800, 125])  # weight, width (the subset's widest)
SERIF_RU = ImageFont.truetype(os.path.join(UI_FONTS, "cormorant-italic-500-cyrillic.woff2"), round(70 * 1.25))

# The Russian words, reviewed 2026-11-15 by a helper briefed as a senior Russian B2B editor:
# «ПРИНЯТО.» (not «МЫ ПОЛУЧИЛИ.», which wants an object and repeats ПОЛУЧ- three times) and
# «ОТВЕТ ЗА 24 ЧАСА» (in this mono face «Ч» reads as a 4, so «< 24 Ч» read "24 4").
WORDS = {
    "en": {"label": "[ INQUIRY RECEIVED ]", "head": "WE HAVE IT.", "accent": "thank you.",
           "stops": ["RECEIVED", "READING", "REPLY < 24 H"]},
    "ru": {"label": "[ ЗАПРОС ПОЛУЧЕН ]", "head": "ПРИНЯТО.", "accent": "спасибо.",
           "stops": ["ПОЛУЧЕН", "ЧИТАЕМ", "ОТВЕТ ЗА 24 ЧАСА"]},
}[LANG]

W, H = 1200, 360
INK = (28, 31, 24)  # #1c1f18, the Night Shift ground
GRID = (44, 49, 38)  # #2c3126, the dark wash
TEXT = (236, 235, 228)  # #ecebe4
MUTED = (162, 166, 149)  # #a2a695
VOLT = (205, 243, 69)  # #cdf345

STOPS = list(zip([120, 560, 1000], WORDS["stops"]))
TRACK_Y = 268


def cyrillic(ch: str) -> bool:
    return "\u0400" <= ch <= "\u045f"


def has_glyph(font: ImageFont.FreeTypeFont, ch: str) -> bool:
    """A face that lacks a character draws its .notdef box: the same bitmap as a code point no
    face has. Compared as raw masks, so a missing glyph cannot pass as 'drawn'."""
    missing = "\U0010fffd"
    return bytes(font.getmask(ch)) != bytes(font.getmask(missing)) or font.getmask(ch).size != font.getmask(missing).size


def require_glyphs(text: str, cyr_font, latin_font) -> None:
    for ch in text:
        if ch == " ":
            continue
        font = cyr_font if cyrillic(ch) else latin_font
        if not has_glyph(font, ch):
            raise SystemExit(f"no glyph for {ch!r} in {font.getname()}")


def run(d: ImageDraw.ImageDraw, x: float, y: float, text: str, cyr_font, latin_font, fill, latin_dy: float = 0) -> float:
    """Draw text as the browser does with unicode-range: Cyrillic from the companion face, every
    other character from the brand face."""
    require_glyphs(text, cyr_font, latin_font)
    for ch in text:
        font, dy = (cyr_font, 0) if cyrillic(ch) else (latin_font, latin_dy)
        d.text((x, y + dy), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font)
    return x


def base() -> Image.Image:
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 52):  # the 26px grid, at 2x
        d.line([(x, 0), (x, H)], fill=GRID, width=1)
    for y in range(0, H, 52):
        d.line([(0, y), (W, y)], fill=GRID, width=1)
    require_glyphs(WORDS["label"] + "".join(WORDS["stops"]), MONO, MONO)
    d.text((64, 44), WORDS["label"], font=MONO, fill=VOLT)
    if LANG == "en":
        d.text((64, 92), WORDS["head"], font=HEAD, fill=TEXT)
        head_w = d.textlength(WORDS["head"] + " ", font=HEAD)
        d.text((64 + head_w, 84), WORDS["accent"], font=SERIF, fill=VOLT)
    else:
        x = run(d, 64, 92, WORDS["head"] + " ", HEAD_RU, HEAD, TEXT)
        run(d, x, 72, WORDS["accent"], SERIF_RU, SERIF, VOLT, latin_dy=12)
    # The dimension line: a track with end ticks, and a stop for each step.
    d.line([(STOPS[0][0], TRACK_Y), (STOPS[-1][0], TRACK_Y)], fill=MUTED, width=2)
    for x, name in STOPS:
        d.line([(x, TRACK_Y - 10), (x, TRACK_Y + 10)], fill=MUTED, width=2)
        w = d.textlength(name, font=MONO_SMALL)
        d.text((x - w / 2, TRACK_Y + 22), name, font=MONO_SMALL, fill=TEXT if x == STOPS[0][0] else MUTED)
    # "Received" is done: a solid volt stop.
    r = 11
    d.ellipse([STOPS[0][0] - r, TRACK_Y - r, STOPS[0][0] + r, TRACK_Y + r], fill=VOLT)
    return img


def frame(dot_x: float, ring: float) -> Image.Image:
    img = base()
    d = ImageDraw.Draw(img)
    # The volt trail behind the travelling dot.
    d.line([(STOPS[0][0], TRACK_Y), (dot_x, TRACK_Y)], fill=VOLT, width=4)
    r = 9
    d.ellipse([dot_x - r, TRACK_Y - r, dot_x + r, TRACK_Y + r], fill=VOLT)
    if ring > 0:
        rr = 9 + 22 * ring
        shade = tuple(int(VOLT[i] * (1 - ring) + INK[i] * ring) for i in range(3))
        d.ellipse([dot_x - rr, TRACK_Y - rr, dot_x + rr, TRACK_Y + rr], outline=shade, width=3)
    return img


def ease(t: float) -> float:
    return 1 - (1 - t) ** 3  # ease-out: quick start, gentle arrival


def main(out: str) -> None:
    start, end = STOPS[0][0], STOPS[1][0]
    frames, durations = [], []
    # Frame one, held: everything readable, the dot at "Received" (Outlook stops here).
    frames.append(frame(start, 0))
    durations.append(1400)
    for i in range(1, 15):  # travel to "Reading"
        frames.append(frame(start + (end - start) * ease(i / 14), 0))
        durations.append(50)
    for i in range(1, 11):  # a pulse at "Reading"
        frames.append(frame(end, i / 10))
        durations.append(60)
    frames.append(frame(end, 0))
    durations.append(1600)
    small = [f.resize((W // 2, H // 2), Image.LANCZOS).quantize(colors=32, dither=Image.NONE) for f in frames]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    small[0].save(out, save_all=True, append_images=small[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print(out, os.path.getsize(out), "bytes,", len(small), "frames")


if __name__ == "__main__":
    default = "apps/cms/public/email/inquiry-received.gif" if LANG == "en" else "apps/cms/public/email/inquiry-received-ru.gif"
    main(sys.argv[1] if len(sys.argv) > 1 else default)
