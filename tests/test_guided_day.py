"""The guided order: crew -> contracts -> bait; then weather, stops, end of day
(bait used -> HACCP -> day report) with the bait balance; after the trip,
offload temps -> weigh sheet -> reports."""
from harness import App, check, done, fake_season, sign
import datetime, subprocess

seed = fake_season()
seed["settings"].update(fcoName="Test Officer", fcoPhone="082 000 0000", fcoEmail="fco@example.invalid")
app = App(seed=seed)
p = app.page
app.tap("#btnNewTrip"); p.fill("#tTripNo", "30"); app.tap('[data-a="save"]')
sign(app)
# Departure check opens first, with the bait on board in it
check(p.locator(".sheet h2").last.inner_text() == "Departure check", "departure check comes first after signing")
p.fill("#dBaitBoxes", "40"); p.fill("#dBaitKg", "20"); p.fill("#dBaitType", "pilchard")
for k in ["vmsOnAt", "vmsConfirmedAt", "permitAt", "rswAt"]:
    app.tap('[data-tick="%s"]' % k)
p.fill("#dRsw", "-1"); p.fill("#dFuel", "3000"); p.fill("#dWater", "1000")
app.tap('[data-send="WhatsApp"]')
url = p.evaluate("() => window.__lastNoticeUrl")
check(url.startswith("https://wa.me/27820000000?text=") and "DEPARTURE%20NOTIFICATION" in url and "Persons%20on%20board" in url, "WhatsApp message to the FCO: %s" % url[:60])
check("Notified" in p.locator("#depBody").inner_text(), "FCO notice recorded")
check("Bait%20on%20board%3A%2040%20boxes%20pilchard" in url, "bait in the FCO message")
app.tap('.sheet [data-a="done"]')
check(p.locator("#btnConfirmCrew").count() == 1, "then on to the crew list")
app.tap("#btnConfirmCrew"); app.tap('.sheet-backdrop:last-child [data-a="ok"]')
app.tap("#btnBack"); app.tap("#btnBack")
dep = [t for t in app.stored()["trips"] if t["tripNumber"] == "30"][0]["departure"]
check(dep["doneAt"] and dep["fuel"] == "3000" and dep["rswTemp"] == "-1" and dep["fcoHow"] == "WhatsApp", "departure check saved: %r" % dep)
check(p.locator("#btnNext").count() == 0 and p.locator("#btnLogStop").is_visible(), "setup done: LOG STOP is the main button")
check("40 boxes" in p.locator("#screen").inner_text(), "bait on board shown")

# Bait received mid-trip
app.tap("#btnBaitNav"); p.fill("#bRecv", "5"); app.tap('.sheet [data-a="save"]')

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
check(p.locator('[data-dayclosed="%s"]' % today).count() == 1 and p.locator("#btnEndDay").count() == 0, "day marked closed")
trip = [t for t in app.stored()["trips"] if t["tripNumber"] == "30"][0]
check([(e["type"], e["boxes"]) for e in trip["bait"]["entries"]] == [("load", "40"), ("received", "5"), ("used", "7")], "bait entries saved")

# End trip -> after-offload steps
app.tap("#btnEnd"); app.tap('.sheet [data-a="ok"]')
check(p.locator(".sheet h2").last.inner_text() == "Landing notice", "landing notice opens on End trip")
p.fill("#lTime", "15:30"); p.dispatch_event("#lTime", "change")
app.tap('[data-send="Email"]')
url = p.evaluate("() => window.__lastNoticeUrl")
check(url.startswith("mailto:fco%40example.invalid?subject=Landing") and "15%3A30" in url and "69%20Longfin" in url, "landing email: %s" % url[:70])
app.tap('.sheet [data-a="close"]')
check("NEXT: Offload temps" in p.locator("#btnNext").inner_text(), "then offload temperatures")
app.tap("#btnNext")
p.fill('[id^="off_"]', "-1.5"); app.tap('.sheet [data-a="save"]')
check(p.locator("#wKg").count() == 1, "then straight to the weigh sheet")
p.fill("#wKg", "10"); p.press("#wKg", "Enter"); p.wait_for_timeout(100)
app.tap("#btnBack")
check("NEXT: Reports" in p.locator("#btnNext").inner_text(), "then reports")
app.tap("#btnNext")
check(p.locator("#btnDffe").count() == 1 and p.locator("[data-dayrep]").count() == 1, "reports screen with daily reports")
import subprocess
rec = subprocess.run(["pdftotext", "-layout", app.download("#btnDepPdf"), "-"], capture_output=True, text=True).stdout
check("DEPARTURE & LANDING RECORD" in rec and "3000 L" in rec and "by WhatsApp" in rec and "by Email" in rec, "departure & landing record PDF")
app.close()
done("test_guided_day")
