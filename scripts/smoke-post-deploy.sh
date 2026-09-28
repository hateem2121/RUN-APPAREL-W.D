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
d1=$(curl -s -A 'facebookexternalhit/1.1' https://wear-run.com/products/rxps/wine   | grep -o 'name="description" content="[^"]*"' | head -1)
d2=$(curl -s -A 'facebookexternalhit/1.1' https://wear-run.com/products/rxps/butter | grep -o 'name="description" content="[^"]*"' | head -1)
if [ -n "$d1" ] && [ "$d1" != "$d2" ]; then printf '  ✓ %-52s differ\n' "wine vs butter description"; ok=$((ok+1))
else printf '  ✗ %-52s identical\n' "wine vs butter description"; bad=$((bad+1)); fi

echo "── #23 / notFound: accidental 200s become 404 ──"
# Under the website's garment folder since the domain move (2026-09-28): a missing file
# there is two segments deep, which the viewer's 404 rule had to learn.
chk "GET /products/manifest.webmanifest" 404 "$(code https://wear-run.com/products/manifest.webmanifest)"

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
chk "/sw.js is not the SPA shell"       ok "$(nothtml https://wear-run.com/sw.js)"

# The .ico magic number, so a renamed PNG cannot pass.
ico=$(curl -s https://viewer.wear-run.help/favicon.ico | head -c 4 | xxd -p 2>/dev/null)
chk "favicon.ico carries the ICO magic" "00000100" "$ico"

sw=$(curl -s https://wear-run.com/sw.js)
if echo "$sw" | grep -q 'run-shell-'; then
  if echo "$sw" | grep -q '\.glb"'; then printf '  ✗ %-52s a .glb is in the shell\n' "service worker caches no garment"; bad=$((bad+1))
  else printf '  ✓ %-52s real worker, no .glb in SHELL\n' "service worker caches no garment"; ok=$((ok+1)); fi
else printf '  ✗ %-52s not the real service worker\n' "service worker caches no garment"; bad=$((bad+1)); fi

echo "── all 11 garments still serve ──"
for k in apex-flex-pullover the-aggressor-jersey the-aggressor-jersey-men arisan-sports-bra \
         armor-tech-jacket aero-tech-windbreaker classic-soccer-shirt minecut-motion \
         women-zip-up-vest x-milo-pro-bib x-milo-pro-skin-suit; do
  c=$(curl -s -r 0-99 -o /dev/null -w '%{http_code}' -H 'Referer: https://wear-run.com/' \
      "https://media.wear-run.com/${k}-2026-09-03-optimized.glb")
  [ "$c" = "206" ] && ok=$((ok+1)) || { printf '  ✗ %s -> %s\n' "$k" "$c"; bad=$((bad+1)); }
done
[ $bad -eq 0 ] && printf '  ✓ %-52s all 206\n' "11 garments"

echo "── The site, on wear-run.com since 2026-09-28, with one address ──"
# ⚠️ WRITTEN TO FAIL FIRST. Against production before the merge every line here fails
# (the apex 404s, nothing redirects); after the deploy all six pass. Calibrated, not
# assumed — the header of this file says why that matters.
# ⚠️ HELPERS, NOT AN INLINE `case`. A `case` written inside `$(...)` breaks: bash reads
# the `)` of the first pattern as the end of the command substitution, and the line then
# fails at RUNTIME with "syntax error near unexpected token `newline'"" while `bash -n`
# stays silent. That is why nothtml() above exists; these two are its siblings.
ishtml() { case "$(ctype "$1")" in *text/html*) echo ok;; *) echo nothtml;; esac; }
notpdf() { case "$(ctype "$1")" in *application/pdf*) echo pdf;; *) echo ok;; esac; }

chk "GET / on wear-run.com is the site"    200 "$(code https://wear-run.com/)"
chk "/ is HTML, not a PDF or a 404"        ok  "$(ishtml https://wear-run.com/)"
# Launched 2026-09-25 (SITE_INDEXING=visible): the home page must no longer ask to be left
# out of search, and the sitemap must list the site's pages rather than nothing.
chk "/ no longer carries noindex"          ok  "$(curl -s https://wear-run.com/ | grep -q 'content="noindex' && echo noindex || echo ok)"
chk "sitemap lists the pages"              ok  "$(curl -s https://wear-run.com/sitemap.xml | grep -qF '<loc>https://wear-run.com/products</loc>' && echo ok || echo empty)"
chk "sitemap lists a garment colour"       ok  "$(curl -s https://wear-run.com/sitemap.xml | grep -qF '<loc>https://wear-run.com/products/rxps/wine</loc>' && echo ok || echo missing)"
chk "garment page is the 3D viewer"        ok  "$(curl -s https://wear-run.com/products/rxps/wine | grep -q 'data-cf-beacon\|id="root"' && echo ok || echo other)"
chk "www -> apex, same path"               "308 https://wear-run.com/products" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://www.wear-run.com/products)"
chk "old site -> wear-run.com, same path"  "308 https://wear-run.com/products" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://wear-run.help/products)"
chk "old www -> wear-run.com, same path"   "308 https://wear-run.com/products" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://www.wear-run.help/products)"
chk "printed QR tag -> its garment page"   "301 https://wear-run.com/products/rxps/wine" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://viewer.wear-run.help/rxps/wine)"
chk "cms public page -> wear-run.com"      "308 https://wear-run.com/products" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://cms.wear-run.help/products)"
chk "/admin is the site's 404"             404 "$(code https://wear-run.com/admin)"
chk "/admin shows no login"                ok  "$(curl -s https://wear-run.com/admin | grep -q '404 · PAGE NOT FOUND' && echo ok || echo login)"
chk "cms /admin is still the admin"        200 "$(code https://cms.wear-run.help/admin)"
chk "www /catalogue is retired (410)"      410 "$(code https://www.wear-run.help/catalogue)"
chk "www /catalogue is not a PDF"          ok  "$(notpdf https://www.wear-run.help/catalogue)"
chk "www /profile is retired (410)"        410 "$(code https://www.wear-run.help/profile)"
chk "www /profile is not a PDF"            ok  "$(notpdf https://www.wear-run.help/profile)"
chk "catalogue. refuses without a code"    404 "$(code https://catalogue.wear-run.help/)"
chk "profile. refuses without a code"      404 "$(code https://profile.wear-run.help/)"
# The same two documents on wear-run.com (decided 2026-09-17). Written to fail first:
# before that deploy both lines answer 000 (no such name).
chk "catalogue.wear-run.com refuses too"   404 "$(code https://catalogue.wear-run.com/)"
chk "profile.wear-run.com refuses too"     404 "$(code https://profile.wear-run.com/)"
# Two Cloudflare redirect rules that live in no file and that old emails still use
# (docs/CLOUDFLARE-SETUP.md → 11.8). `cut` keeps scheme+host, so the target's path may
# change without this going red.
chk "wear-run.help/map still redirects"    "302 https://maps.app.goo.gl" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://wear-run.help/map | cut -d/ -f1-3)"
chk "wear-run.help/meeting still redirects" "301 https://app.apollo.io" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://wear-run.help/meeting | cut -d/ -f1-3)"
# wear-run.com hands these back to wear-run.help, where the two rules above live
# (apps/cms/siteHostRules.mjs, HANDED_BACK_TO_HELP).
chk "wear-run.com/map -> wear-run.help"    "308 https://wear-run.help/map" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://wear-run.com/map)"
chk "wear-run.com/catalogue -> .help 410"  410 "$(code -L https://wear-run.com/catalogue)"

echo
echo "PASS $ok   FAIL $bad"
exit $([ $bad -eq 0 ] && echo 0 || echo 1)
