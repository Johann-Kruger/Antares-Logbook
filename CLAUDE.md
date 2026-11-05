# Antares Logbook

An offline tuna pole-and-line logbook for one vessel (Antares, Hout Bay). The skipper logs stops (time, GPS, albacore/yellowfin counts, tank, conditions) in the wheelhouse on an Android phone, enters the offload weigh sheet and crew list, and exports the DFFE catch statistics form. Johann (the repo owner and skipper) builds the APK on a Mac with `build_apk.sh`.

## Source and the one-file app

The app ships as one self-contained, offline file, `www/index.html`. It is generated: edit `src/head.html` (CSS + markup) and `src/app.js` (the app, one `"use strict"` IIFE), then run `python3 tools/build.py`. Commit both `src/` and the rebuilt `www/index.html`. The page has three `<script>` blocks: the error overlay, the vendored libraries (jsPDF, fflate — read-only), then the app. Nothing loads from the network.

The DFFE form is `src/dffe_template.xlsx` (DFFE's own sheet with its logo), embedded as base64 and filled by `buildDffeXlsx()` editing the sheet XML. Cell positions: header M3–Z7; days in rows 12,14…26 (numbers) with kg on the row below, offload weights row 28; days 9–16 in rows 29–44, offload row 45; comment A46; certified name S56, date AA56.

## Live data on the phone

The logbook lives in WebView `localStorage` under `antares_logbook_v1` and is the only copy. Change the state shape only through `normaliseState()` (fill defaults, keep every record). A logbook that can't be read is copied aside and saving stays locked until the skipper chooses. Updates install over the existing app: keep `appId` `com.antares.logbook` fixed; signing or keystore changes are owner-approved.

## Verifying a change

No Android SDK here. Run `python3 tools/build.py`, the syntax check `awk '/<script>/{n++; if(n==3){f=1; next}} /<\/script>/{f=0} f' www/index.html > /tmp/app.js && node --check /tmp/app.js`, and `tests/run.sh`. Behaviour changes get a test in `tests/` using the fake season in `harness.py`.

## Wheelhouse use

Big tap targets, high contrast (sun mode), confirmation before anything destructive, and no data loss from a stray tap or the back button.

## Git

Work on a branch and merge to `main` through a PR. Commit messages are one plain imperative sentence.
