"""
The buyer receipt's moving header: apps/cms/public/email/inquiry-received.gif (owner, 2026-11-10).

Run: ~/.venvs/imaging/bin/python apps/cms/scripts/make-receipt-gif.py
Needs Pillow and the brand's three faces installed (Archivo Expanded ExtraBold, IBM Plex Mono,
Instrument Serif Italic — all free on Google Fonts; this Mac has them in ~/Library/Fonts).

WHY A GIF: about 98% of mail clients play an animated GIF; CSS animation reaches about 34% and AMP
about 16% (caniemail.com, read 2026-11-10). Outlook on Windows shows only the FIRST frame, so frame
one is the whole message on its own: every word, and the dot already at "Received".

Paper & Ink, Night Shift (packages/ui/src/tokens.css): ink ground, the blueprint grid every 26px,
volt for the one moving thing. Drawn at 2x (1200 x 360) and shown at 600 x 180.
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = os.path.expanduser("~/Library/Fonts")
HEAD = ImageFont.truetype(os.path.join(FONTS, "Archivo_Expanded-ExtraBold.ttf"), 64)
SERIF = ImageFont.truetype(os.path.join(FONTS, "InstrumentSerif-Italic.ttf"), 70)
MONO = ImageFont.truetype(os.path.join(FONTS, "IBMPlexMono-Medium.ttf"), 26)
MONO_SMALL = ImageFont.truetype(os.path.join(FONTS, "IBMPlexMono-Medium.ttf"), 26)

W, H = 1200, 360
INK = (28, 31, 24)  # #1c1f18, the Night Shift ground
GRID = (44, 49, 38)  # #2c3126, the dark wash
TEXT = (236, 235, 228)  # #ecebe4
MUTED = (162, 166, 149)  # #a2a695
VOLT = (205, 243, 69)  # #cdf345

STOPS = [(120, "RECEIVED"), (560, "READING"), (1000, "REPLY < 24 H")]
TRACK_Y = 268


def base() -> Image.Image:
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 52):  # the 26px grid, at 2x
        d.line([(x, 0), (x, H)], fill=GRID, width=1)
    for y in range(0, H, 52):
        d.line([(0, y), (W, y)], fill=GRID, width=1)
    d.text((64, 44), "[ INQUIRY RECEIVED ]", font=MONO, fill=VOLT)
    d.text((64, 92), "WE HAVE IT.", font=HEAD, fill=TEXT)
    head_w = d.textlength("WE HAVE IT. ", font=HEAD)
    d.text((64 + head_w, 84), "thank you.", font=SERIF, fill=VOLT)
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
    main(sys.argv[1] if len(sys.argv) > 1 else "apps/cms/public/email/inquiry-received.gif")
