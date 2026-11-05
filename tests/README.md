# Browser tests

Each `test_*.py` opens `www/index.html` in headless Chromium (Playwright), seeds
`localStorage` with a **fake** season from `harness.py`, drives the app the way
the skipper would and checks the saved data. No real crew names, ID numbers or
permit numbers belong in these files.

```
python3 -m pip install -r tests/requirements.txt
python3 -m playwright install chromium
tests/run.sh
```

Set `CHROMIUM_PATH` to use a Chromium you already have. Off the phone,
`isNativeApp()` is false, so exports become browser downloads.
