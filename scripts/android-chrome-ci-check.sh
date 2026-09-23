#!/usr/bin/env bash
#
# Resolves a chromedriver build matching whatever Chrome version the booted AVD image
# actually ships, then runs android-chrome.mjs's real check.
#
# WHY THIS IS ITS OWN FILE, NOT INLINE IN android-chrome.yml's `script:` BLOCK.
# ⚠️ MEASURED 2026-09-23, CI run 35833033931: `reactivecircus/android-emulator-runner`'s
# `script:` input does NOT run a multi-line block as one shell session. Its log shows each
# line of the YAML block scalar invoked as its OWN, INDEPENDENT `/usr/bin/sh -c '<line>'` —
# confirmed directly: `echo "On-device Chrome:"` and the following `CHROME_VERSION=$(...)`
# line appeared as two SEPARATE `[command]/usr/bin/sh -c` entries in the log. A shell
# variable set on one line is therefore invisible to the next, and a control-flow keyword
# spanning multiple lines (`if` ... `fi`) fails immediately with
# "Syntax error: end of file unexpected (expecting \"fi\")", because sh sees only the one
# line containing `if` and never the lines closing it. Putting the whole thing in a real
# file, invoked as ONE line (`bash scripts/android-chrome-ci-check.sh`), sidesteps this
# entirely — the action still only ever runs "one line", but that line is a single `bash`
# invocation of a file with normal shell semantics inside it.
#
# WHY THE VERSION CANNOT BE DECIDED BEFORE THIS RUNS. Measured 2026-09-23, CI run
# 35832507117: this AVD image's Chrome build is FROZEN at 113.0.5672.136 — long before
# Chrome-for-Testing's catalog begins (it starts around Chrome 115) — so installing
# chromedriver@stable (a current ~154.x build) ahead of time made ChromeDriver refuse
# every session outright: "This version of ChromeDriver only supports Chrome version 154.
# Current browser version is 113.0.5672.136." The on-device version can only be read once
# the emulator has booted, which is why this script runs INSIDE the emulator step.
set -eu

echo "On-device Chrome:"
CHROME_VERSION=$(adb shell dumpsys package com.android.chrome | grep -m1 versionName | tr -d '\r' | cut -d= -f2)
echo "  ${CHROME_VERSION}"
if [ -z "${CHROME_VERSION}" ]; then
  echo "::error::com.android.chrome not found on this AVD image — see this script's header comment"
  exit 1
fi
CHROME_MAJOR="${CHROME_VERSION%%.*}"

DRIVER_DIR="${RUNNER_TEMP}/chromedriver-matched"
mkdir -p "${DRIVER_DIR}"

# Two sources, tried in order. The classic chromedriver hosting still serves the exact
# range this old AVD image needs — verified directly on 2026-09-23: major 113 resolves to
# 113.0.5672.63, and its linux64 build downloads with a 200. Chrome-for-Testing (via the
# @puppeteer/browsers CLI installed by the workflow step before this one) is the fallback
# for any future AVD image whose Chrome is new enough to be inside its range instead.
LEGACY_VERSION=$(curl -fsS "https://chromedriver.storage.googleapis.com/LATEST_RELEASE_${CHROME_MAJOR}" 2>/dev/null || true)
if [ -n "${LEGACY_VERSION}" ]; then
  echo "Matching chromedriver (legacy hosting): ${LEGACY_VERSION}"
  curl -fsSL "https://chromedriver.storage.googleapis.com/${LEGACY_VERSION}/chromedriver_linux64.zip" -o "${DRIVER_DIR}/cd.zip"
  unzip -q -o "${DRIVER_DIR}/cd.zip" -d "${DRIVER_DIR}"
else
  echo "No legacy build for major ${CHROME_MAJOR}; trying Chrome for Testing"
  node "${RUNNER_TEMP}/puppeteer-browsers/node_modules/@puppeteer/browsers/lib/main-cli.js" \
    install "chromedriver@${CHROME_MAJOR}" --path "${DRIVER_DIR}"
fi

CHROMEDRIVER_BIN=$(find "${DRIVER_DIR}" -type f -name chromedriver | head -1)
chmod +x "${CHROMEDRIVER_BIN}"
export PATH="$(dirname "${CHROMEDRIVER_BIN}"):${PATH}"

node scripts/android-chrome.mjs "http://10.0.2.2:4173/"
