# Antares Logbook

Offline tuna pole-and-line logbook for the fishing vessel **Antares**
(HTB278, Hout Bay), packaged as an installable Android app. Built on the same
approach as the Iingwane electronic logbook.

The skipper logs every stop at sea: time, GPS position, albacore and yellowfin
counts, tank, and conditions (SST, wind, sea, drift, school depth, bait). At the
end of the trip it takes the offload weigh sheet and crew list, and produces:

- the **DFFE tuna pole and line catch statistics form** (.xlsx, DFFE's own layout)
- the stop log and weight sheet as CSV
- the crew list as PDF
- each crew member's voyage contract (Ntoza Fishing's contract of employment), read and
  signed on the phone at the start of the trip, as PDF

Everything works offline. Data is stored on the phone (`localStorage`), so make
regular backups in the app (menu → Backup & restore).

## Project layout

- `www/index.html` — the app (one self-contained file, generated)
- `src/head.html`, `src/app.js` — the app source; `src/vendor/` — jsPDF, fflate
- `src/dffe_template.xlsx` — the blank DFFE form the app fills in
- `tools/build.py` — assembles `www/index.html` from `src/`
- `android/` — the Capacitor Android wrapper; `build_apk.sh` builds the APK
- `tests/` — browser tests (see `tests/README.md`)

## Building the APK

See [`BUILD_INSTRUCTIONS.md`](./BUILD_INSTRUCTIONS.md). Short version:

```
./build_apk.sh
```

The APK lands on your Desktop. Install it **over** the existing app; uninstalling
wipes the logbook.
