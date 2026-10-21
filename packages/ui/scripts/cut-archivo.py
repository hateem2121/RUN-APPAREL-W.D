"""
Cut Archivo's width axis to the range the site uses, 100-125%, from the installed
@fontsource-variable/archivo files, and record what was cut from what.

Why (2026-10-21): the latin file is 90,104 B and every page asks for it first. Nothing on either app
sets a width under 100% (font-stretch is 100, 105, 110 or 122%), and the narrow half of the axis is
most of the file: latin 90,104 -> 62,596 B. Rendered in Chromium at every weight (400-900) and width
the site uses, 30 of 5.1 million pixels differed, by at most 4 levels of 255.

Only the width axis is cut. Cutting the weight axis to 400-900 saved 2.5 KB and MOVED weights 400 and
500 by up to 139 levels: 400 is not one of the font's masters (100, 600, 900), so the new end is an
approximation. The width default, 100%, is a master, so its cut is exact.

Needs fonttools and brotli (`pip install fonttools brotli`); CI does not run this, it checks the
result (apps/cms/src/archivoCut.test.ts). Run from the repo root after the font package changes:

    python3 packages/ui/scripts/cut-archivo.py

The SAVE TIME IS NOT WRITTEN: fonttools stamps it into the header by default, and two runs of the
same cut then differ byte for byte, so the recorded hashes could never be reproduced.
"""

import hashlib
import json
import pathlib
import re

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parents[3]
PACKAGE = ROOT / "apps" / "viewer" / "node_modules" / "@fontsource-variable" / "archivo"
OUT = ROOT / "packages" / "ui" / "fonts"
SUBSETS = ("latin", "latin-ext", "vietnamese")
WIDTH = (100, 125)


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    version = json.loads((PACKAGE / "package.json").read_text())["version"]
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "package": "@fontsource-variable/archivo",
        "version": version,
        "wdth": list(WIDTH),
        "files": {},
    }
    for subset in SUBSETS:
        source = PACKAGE / "files" / f"archivo-{subset}-wdth-normal.woff2"
        target = OUT / f"archivo-{subset}-wdth-100-125.woff2"
        font = TTFont(source, recalcTimestamp=False)
        cut = instancer.instantiateVariableFont(font, {"wdth": WIDTH})
        cut.flavor = "woff2"
        cut.recalcTimestamp = False
        cut.save(target)
        manifest["files"][subset] = {
            "source": sha256(source),
            "cut": sha256(target),
            "bytes": [source.stat().st_size, target.stat().st_size],
        }
        print(f"{subset}: {source.stat().st_size} -> {target.stat().st_size} B")
    # Short number lists on one line, as the repo's formatter (Biome) lays them out, so a fresh cut
    # passes `pnpm lint` without a formatting pass.
    text = json.dumps(manifest, indent=2)
    text = re.sub(r"\[\s*(\d+),\s*(\d+)\s*\]", r"[\1, \2]", text)
    (OUT / "archivo.json").write_text(text + "\n")
    (OUT / "OFL.txt").write_text((PACKAGE / "LICENSE").read_text())


if __name__ == "__main__":
    main()
