"""Defects: raise by area, review at the start of a trip (pending / closed out), running report."""
from harness import App, check, done, fake_season, sign
import subprocess

app = App(seed=fake_season())
p = app.page
# Raise two defects from the menu, alongside (no trip at sea)
app.tap("#btnMenu"); app.tap('[data-a="defects"]')
for area, title, prio in [("Engine room", "Port bilge pump not starting", "High"), ("Galley", "Stove igniter loose", "Low")]:
    app.tap("#btnNewDefect")
    app.tap('[data-chips="dcat"] [data-v="%s"]' % area)
    p.fill("#dTitle", title)
    app.tap('[data-chips="dprio"] [data-v="%s"]' % prio)
    app.tap('.sheet [data-a="save"]')
d = app.stored()["defects"]
check(len(d) == 2 and d[0]["category"] == "Engine room" and d[0]["status"] == "open" and d[0]["raisedTrip"] == "Alongside", "defects raised: %r" % d[:1])
check("2 open" in p.locator("#tbSub").inner_text(), "open count")
app.tap("#btnBack")

# New trip: departure check, then the defects review before the crew list
app.tap("#btnNewTrip"); p.fill("#tTripNo", "40"); app.tap('[data-a="save"]')
sign(app)
check("NEXT" in p.locator("#btnNext").inner_text(), "guided")
app.tap('.sheet [data-a="done"]'); app.tap('.sheet-backdrop:last-child [data-a="ok"]')  # sail anyway
check(p.locator(".sheet h2").last.inner_text().startswith("Defects review"), "defects review follows the departure check")
pump = [x for x in app.stored()["defects"] if x["title"].startswith("Port bilge")][0]["id"]
app.tap('[data-chips="rv:%s"] [data-v="closed"]' % pump)
p.fill("#rvn_%s" % pump, "new pump fitted")
app.tap('.sheet [data-a="save"]')
d = {x["title"][:4]: x for x in app.stored()["defects"]}
check(d["Port"]["status"] == "closed" and d["Port"]["closedTrip"] == "Trip 40" and d["Port"]["closedNote"] == "new pump fitted", "closed out with trip and note")
check(d["Stov"]["status"] == "open" and d["Stov"]["updates"][-1]["trip"] == "Trip 40" and d["Stov"]["updates"][-1]["status"] == "open", "still pending recorded for the trip")
trip = [t for t in app.stored()["trips"] if t["tripNumber"] == "40"][0]
check(trip["defectsReviewedAt"], "trip marks the review done")
check(p.locator("#btnConfirmCrew").count() == 1, "then on to the crew list")
app.tap("#btnBack")

# Raise one at sea, then the running report
app.tap("#btnDefects"); app.tap("#btnNewDefect")
app.tap('[data-chips="dcat"] [data-v="Tackle"]'); p.fill("#dTitle", "Two poles cracked"); app.tap('[data-chips="dprio"] [data-v="Medium"]')
app.tap('.sheet [data-a="save"]')
check([x for x in app.stored()["defects"] if x["category"] == "Tackle"][0]["raisedTrip"] == "Trip 40", "raised during the trip")
txt = subprocess.run(["pdftotext", "-layout", app.download("#btnDefectPdf"), "-"], capture_output=True, text=True).stdout
check("RUNNING REPORT" in txt and "Port bilge pump" in txt and "Closed" in txt and "Two poles cracked" in txt and "OPEN" in txt and "new pump fitted" in txt, "running report PDF")
app.close()
done("test_defects")
