"""Skipper chosen per trip and remembered; deleting a whole trip; weigh sheet PDF."""
from harness import App, check, done, fake_season, sign
import subprocess, copy

# Old logbook: no skippers saved yet -> the settings skipper becomes the first saved skipper, old trips keep him
seed = fake_season()
app = App(seed=seed); p = app.page

# New trip with a new skipper -> saved for later, signs, and appears on documents
app.tap("#btnNewTrip")
check(p.locator('#skList .chip.on').inner_text() == "Test Skipper", "last trip's skipper preselected")
app.tap('#skList [data-sk="new"]')
check(p.locator("#tSkName").input_value() == "", "new skipper clears the fields")
p.fill("#tSkName", "Relief Skipperman"); p.fill("#tSkId", "X0000001"); p.fill("#tSkTel", "000 222 3333")
app.tap('.sheet [data-a="save"]')
check("Relief Skipperman" in p.locator(".sheet").last.inner_text(), "signature sheet names the trip's skipper")
sign(app)
s = app.stored()
t = sorted(s["trips"], key=lambda x: x["createdAt"])[-1]
check(t["skipper"] == {"name": "Relief Skipperman", "idNumber": "X0000001", "contact": "000 222 3333"}, "trip skipper saved: %r" % t["skipper"])
check(t["skipperSig"].startswith("data:image/png"), "skipper signed")
check([k["name"] for k in s["knownSkippers"]] == ["Test Skipper", "Relief Skipperman"], "settings skipper carried over, new one remembered: %r" % s["knownSkippers"])
check(all(x["skipper"]["name"] == "Test Skipper" for x in s["trips"] if x is not t), "existing trips keep their skipper")
if p.locator('.sheet [data-a="cancel"]').count(): p.locator('.sheet [data-a="cancel"]').last.click(); p.wait_for_timeout(150)
app.tap("#btnCrew")
txt = subprocess.run(["pdftotext", "-layout", app.download("#btnCrewPdf"), "-"], capture_output=True, text=True).stdout
check("Relief Skipperman" in txt and "X0000001" in txt, "crew list PDF uses the trip skipper")
app.close()

# Next trip offers both, preselects the last one; changing skipper on a trip asks for a new signature
app = App(seed=s); p = app.page
p.wait_for_timeout(200)
app.tap("#btnTripEdit")
check(p.locator("#skList .chip").count() == 3, "both saved skippers + new")
p.locator('#skList .chip', has_text="Test Skipper").click()
check(p.locator("#tSkName").input_value() == "Test Skipper", "picking a saved skipper fills the details")
app.tap('.sheet [data-a="save"]')
check(p.locator("#sigPad").count() == 1 or "signature" in p.locator(".sheet").last.inner_text().lower(), "new skipper asked to sign")
t = [x for x in app.stored()["trips"] if not x["ended"]][0]
check(t["skipper"]["name"] == "Test Skipper" and t["skipperSig"] == "", "skipper changed, old signature cleared")
app.close()

# Delete a trip: needs the trip number typed; others untouched
seed = fake_season()
app = App(seed=seed); p = app.page
n0 = len(app.stored()["trips"])
p.locator('[data-trip="t0"]').click(); p.wait_for_timeout(200)
num = [x for x in app.stored()["trips"] if x["id"] == "t0"][0]["tripNumber"]
app.tap("#btnDeleteTrip")
app.tap('.sheet [data-a="del"]')
check(len(app.stored()["trips"]) == n0, "not deleted without typing the number")
p.fill("#delWord", "999")
app.tap('.sheet [data-a="del"]')
check(len(app.stored()["trips"]) == n0, "wrong number doesn't delete")
p.fill("#delWord", num)
app.tap('.sheet [data-a="del"]')
s = app.stored()
check(len(s["trips"]) == n0 - 1 and not any(x["id"] == "t0" for x in s["trips"]), "trip deleted")
check(p.locator("#btnNewTrip").count() + p.locator("[data-trip]").count() > 0, "back on the trip list")
app.close()

# Weigh sheet PDF
seed = fake_season()
t1 = seed["trips"][1]
t1["weights"] = [{"id": "w%d" % i, "sp": "ALB", "kg": str(10 + i % 7), "len": ""} for i in range(23)] + [{"id": "y1", "sp": "YFT", "kg": "41.5", "len": ""}]
app = App(seed=seed); p = app.page
p.locator('[data-trip="t1"]').click(); p.wait_for_timeout(200)
app.tap("#btnReports")
txt = subprocess.run(["pdftotext", "-layout", app.download("#btnWeighPdf"), "-"], capture_output=True, text=True).stdout
alb = sum(10 + i % 7 for i in range(23))
check("WEIGH SHEET" in txt and "23 fish" in txt and "%.1f kg" % alb in txt, "ALB totals on the PDF")
check("41.5" in txt and "TOTAL: 24 fish" in txt and "%.1f kg" % (alb + 41.5) in txt, "YFT and grand total")
check("Test Skipper" in txt, "skipper name under the signature")
app.close()
done("test_skipper_trip")
