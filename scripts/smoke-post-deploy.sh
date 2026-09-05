#!/usr/bin/env bash
#
# Post-deploy verification against PRODUCTION. Each check is a claim the deployed
# code makes about the live site, measured rather than assumed.
#
# WHY THIS EXISTS SEPARATELY FROM THE TEST SUITE. Every assertion here has a unit or
# e2e test behind it — and a test proves the CODE is right, never that the DEPLOY
# landed. `Media.read: isAuthenticated` was written, tested and green for hours while
# https://cms.wear-run.help/api/media went on answering 200 with all 66 documents to
# anyone, because nothing had shipped. Only a request to the live host can tell those
# two states apart.
#
# ⚠️ IT WAS WRITTEN TO FAIL FIRST. Run against the pre-deploy site it failed 8 of its
# 21 assertions and passed the 13 already true; after the deploy, 21/21. A post-deploy
# check that has never failed is a post-deploy check nobody has calibrated.
#
# ⚠️ AND THE FIRST VERSION OF IT MEASURED NOTHING ON THREE CHECKS. It asserted
# `/favicon.ico -> 200`, `/llms.txt -> 200`, `/sw.js -> 200`. All three returned 200
# BEFORE any of those files existed, because the viewer is an SPA and its 404 handling
# answers every unknown path with index.html — measured: content-type `text/html`,
# body starting `<!doctype html>`. A status code proves nothing here. The checks below
# read the CONTENT TYPE and the BYTES instead, including the .ico magic number, so a
# renamed file or a fallback page cannot pass.
#
# Usage:  bash scripts/smoke-post-deploy.sh     (exit 0 = all good)
set -uo pipefail
ok=0; bad=0
chk() { # chk "label" expected actual
  if [ "$2" = "$3" ]; then printf '  ✓ %-52s %s\n' "$1" "$3"; ok=$((ok+1))
  else printf '  ✗ %-52s got %s, expected %s\n' "$1" "$3" "$2"; bad=$((bad+1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "── PP3-N-02: the model inventory must stop being public ──"
chk "GET /api/media (anonymous)"        403 "$(code 'https://cms.wear-run.help/api/media?limit=1')"
chk "GET /api/products (control)"       403 "$(code 'https://cms.wear-run.help/api/products?limit=1')"
chk "public viewer payload still works" 200 "$(code 'https://cms.wear-run.help/api/public/viewer/rxps/wine')"

echo "── PP3-K-04: each colourway gets its own description ──"
d1=$(curl -s -A 'facebookexternalhit/1.1' https://viewer.wear-run.help/rxps/wine   | grep -o 'name="description" content="[^"]*"' | head -1)
d2=$(curl -s -A 'facebookexternalhit/1.1' https://viewer.wear-run.help/rxps/butter | grep -o 'name="description" content="[^"]*"' | head -1)
if [ -n "$d1" ] && [ "$d1" != "$d2" ]; then printf '  ✓ %-52s differ\n' "wine vs butter description"; ok=$((ok+1))
else printf '  ✗ %-52s identical\n' "wine vs butter description"; bad=$((bad+1)); fi

echo "── #23 / notFound: accidental 200s become 404 ──"
chk "GET /manifest.webmanifest" 404 "$(code https://viewer.wear-run.help/manifest.webmanifest)"

echo "── new static assets ──"
# ⚠️ STATUS CODE PROVES NOTHING HERE. The viewer is an SPA: every unknown path
# returns 200 with index.html, so `favicon.ico -> 200` was true BEFORE any of these
# files existed. Measured pre-deploy: all three returned 200 with
# content-type text/html and a body starting `<!doctype html>`. Check the TYPE and
# the CONTENT, never the status.
ctype() { curl -s -o /dev/null -w '%{content_type}' "$1"; }
nothtml() { case "$(ctype "$1")" in *text/html*) echo html;; *) echo ok;; esac; }
chk "/favicon.ico is not the SPA shell" ok "$(nothtml https://viewer.wear-run.help/favicon.ico)"
chk "/llms.txt is not the SPA shell"    ok "$(nothtml https://viewer.wear-run.help/llms.txt)"
chk "/sw.js is not the SPA shell"       ok "$(nothtml https://viewer.wear-run.help/sw.js)"

# The .ico magic number, so a renamed PNG cannot pass.
ico=$(curl -s https://viewer.wear-run.help/favicon.ico | head -c 4 | xxd -p 2>/dev/null)
chk "favicon.ico carries the ICO magic" "00000100" "$ico"

sw=$(curl -s https://viewer.wear-run.help/sw.js)
if echo "$sw" | grep -q 'run-shell-'; then
  if echo "$sw" | grep -q '\.glb"'; then printf '  ✗ %-52s a .glb is in the shell\n' "service worker caches no garment"; bad=$((bad+1))
  else printf '  ✓ %-52s real worker, no .glb in SHELL\n' "service worker caches no garment"; ok=$((ok+1)); fi
else printf '  ✗ %-52s not the real service worker\n' "service worker caches no garment"; bad=$((bad+1)); fi

echo "── all 11 garments still serve ──"
for k in apex-flex-pullover the-aggressor-jersey the-aggressor-jersey-men arisan-sports-bra \
         armor-tech-jacket aero-tech-windbreaker classic-soccer-shirt minecut-motion \
         women-zip-up-vest x-milo-pro-bib x-milo-pro-skin-suit; do
  c=$(curl -s -r 0-99 -o /dev/null -w '%{http_code}' -H 'Referer: https://viewer.wear-run.help/' \
      "https://media.wear-run.help/${k}-2026-09-03-optimized.glb")
  [ "$c" = "206" ] && ok=$((ok+1)) || { printf '  ✗ %s -> %s\n' "$k" "$c"; bad=$((bad+1)); }
done
[ $bad -eq 0 ] && printf '  ✓ %-52s all 206\n' "11 garments"

echo
echo "PASS $ok   FAIL $bad"
exit $([ $bad -eq 0 ] && echo 0 || echo 1)
