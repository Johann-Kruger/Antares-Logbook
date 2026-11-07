"""The guided order: crew -> contracts -> bait; then weather, stops, end of day
(bait used -> HACCP -> day report) with the bait balance; after the trip,
offload temps -> weigh sheet -> reports."""
from harness import App, check, done, fake_season, sign
import datetime, subprocess

app = App(seed=fake_season())
p = app.page
app.tap("#btnNewTrip"); p.fill("#tTripNo", "30"); app.tap('[data-a="save"]')
sign(app)
app.tap("#btnConfirmCrew"); app.tap('.sheet-backdrop:last-child [data-a="ok"]')
app.tap("#btnBack"); app.tap("#btnBack")
check("NEXT: Bait on board" in p.locator("#btnNext").inner_text(), "skipper-only crew: next step is bait")
app.tap("#btnNext")
p.fill("#bLoad", "40"); p.fill("#bKg", "20"); app.tap('.sheet [data-a="save"]')
check(p.locator("#btnNext").count() == 0 and p.locator("#btnLogStop").is_visible(), "setup done: LOG STOP is the main button")
check("40 boxes" in p.locator("#screen").inner_text(), "bait on board shown")

# Bait received mid-trip
app.tap("#btnBaitRecv"); p.fill("#bRecv", "5"); app.tap('.sheet [data-a="save"]')

# Day: weather, two stops
app.tap("#btnLogStop"); app.tap('[data-chips="wxWindDir"] [data-v="SE"]'); app.tap('.sheet [data-a="save"]')
p.wait_for_selector("#sAlb"); p.fill("#sAlb", "50"); app.tap('.sheet [data-a="save"]')
app.tap("#btnLogStop"); p.wait_for_selector("#sAlb"); p.fill("#sAlb", "19"); app.tap('.sheet [data-a="save"]')

# End of day
app.tap("#btnEndDay")
check("On board: 45 boxes" in p.locator(".sheet").last.inner_text(), "on board = loaded + received")
p.fill("#bUsed", "7"); p.dispatch_event("#bUsed", "input")
check("38 boxes" in p.locator("#bLeft").inner_text() and "760.0 kg" in p.locator("#bLeft").inner_text(), "balance in boxes and kg")
app.tap('.sheet [data-a="save"]')
check(p.locator(".sheet h2").last.inner_text().startswith("End of day"), "HACCP check follows the bait")
app.tap('.sheet [data-a="save"]')
txt = p.locator(".sheet pre").inner_text()
check("Catch: 69 LF" in txt and "on board 38 boxes" in txt and "HACCP: done, all OK" in txt and "SE" in txt, "day report text: %r" % txt)
pdf = app.download('.sheet [data-a="pdf"]')
ptxt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
check("DAILY REPORT" in ptxt and "69" in ptxt and "38 boxes" in ptxt, "day report PDF")
app.tap('.sheet [data-a="done"]')
today = datetime.date.today().isoformat()
check(p.locator('[data-dayrep="%s"]' % today).count() == 1 and p.locator("#btnEndDay").count() == 0, "day marked ended")
trip = [t for t in app.stored()["trips"] if t["tripNumber"] == "30"][0]
check([(e["type"], e["boxes"]) for e in trip["bait"]["entries"]] == [("load", "40"), ("received", "5"), ("used", "7")], "bait entries saved")

# End trip -> after-offload steps
app.tap("#btnEnd"); app.tap('.sheet [data-a="ok"]')
check("NEXT: Offload temps" in p.locator("#btnNext").inner_text(), "after ending: offload temperatures next")
app.tap("#btnNext")
p.fill('[id^="off_"]', "-1.5"); app.tap('.sheet [data-a="save"]')
check(p.locator("#wKg").count() == 1, "then straight to the weigh sheet")
p.fill("#wKg", "10"); p.press("#wKg", "Enter"); p.wait_for_timeout(100)
app.tap("#btnBack")
check("NEXT: Reports" in p.locator("#btnNext").inner_text(), "then reports")
app.tap("#btnNext")
check(p.locator("#btnDffe").count() == 1 and p.locator("[data-dayrep]").count() == 1, "reports screen with daily reports")
app.close()
done("test_guided_day")
