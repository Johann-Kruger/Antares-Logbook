"""New trip -> log stops with GPS -> day details -> weights -> end trip, and the seeded season survives."""
from harness import App, check, done, fake_season, same_stops
import json

app = App(seed=fake_season())
p = app.page
check(p.locator("[data-trip]").count() == 2, "seeded trips listed")
app.tap("#btnNewTrip")
p.fill("#tTripNo", "9")
app.tap('[data-a="save"]')
# Start of trip: skipper signs, then confirms the crew brought over from the last trip
from harness import sign
sign(app)
check(p.get_by_text("Confirm crew list").count() == 1, "crew list from last trip offered for confirmation")
app.tap("#btnConfirmCrew"); app.tap('.sheet-backdrop:last-child [data-a="ok"]')
check(p.locator("#btnLogStop").is_visible(), "trip screen with LOG STOP after confirming crew")

# Log a stop: weather for the day first, then GPS fills in, fish via buttons
app.tap("#btnLogStop")
check(p.get_by_text("Start of the day").count() == 1, "weather asked before the day's first stop")
app.tap('[data-chips="wxWindDir"] [data-v="SE"]'); app.tap('[data-chips="wxWindKn"] [data-v="15-20"]')
app.tap('.sheet [data-a="save"]')
p.wait_for_function("() => document.querySelector('#gpsText') && /°/.test(document.querySelector('#gpsText').textContent)", timeout=15000)
app.tap('[data-step="ALB:10"]'); app.tap('[data-step="ALB:10"]'); app.tap('[data-step="ALB:1"]')
app.tap('[data-step="YFT:1"]')
app.tap('[data-chips="tank"] [data-v="3"]')
p.locator("details.more").first.evaluate("d => d.open = true")
p.fill("#sSst", "16.8")
check(p.locator('[data-chips="windDir"] .chip.on').get_attribute("data-v") == "SE", "stop wind taken from the day's weather")
app.tap('[data-a="save"]')
s = app.stored()
trip = [t for t in s["trips"] if t["tripNumber"] == "9"][0]
check(len(trip["stops"]) == 1, "stop saved")
st = trip["stops"][0]
check(st["alb"] == "21" and st["yft"] == "1" and st["tank"] == "3", "fish, yellowfin, tank saved: %r" % st)
check(abs(float(st["lat"]) + 34.6) < 0.001 and abs(float(st["lon"]) - 18.08) < 0.001, "GPS position saved")
check(st["sst"] == "16.8" and st["windDir"] == "SE", "conditions saved")

# Second stop keeps conditions and tank from the last one
app.tap("#btnLogStop")
p.wait_for_function("() => /°/.test(document.querySelector('#gpsText').textContent)", timeout=15000)
p.fill("#sAlb", "7")
app.tap('[data-a="save"]')
trip = [t for t in app.stored()["trips"] if t["tripNumber"] == "9"][0]
st2 = sorted(trip["stops"], key=lambda x: x["time"])[-1]
check(st2["tank"] == "3" and st2["sst"] == "16.8" and st2["windDir"] == "SE", "conditions carried to next stop")
check("28" in p.locator(".totals").first.inner_text(), "trip total shows 28")

# Stray tap outside a dirty stop sheet asks before discarding
app.tap("#btnLogStop")
p.fill("#sAlb", "5")
p.mouse.click(200, 20)
p.wait_for_timeout(200)
check(p.get_by_text("Discard what you've entered here?").count() == 1, "discard confirm shown")
app.tap('.sheet-backdrop:last-child [data-a="no"]')
app.tap('.sheet [data-a="cancel"]')
app.tap('.sheet-backdrop:last-child [data-a="ok"]')
trip = [t for t in app.stored()["trips"] if t["tripNumber"] == "9"][0]
check(len(trip["stops"]) == 2, "discarded stop not saved")

# Weights
app.tap("#btnWeights")
for w in ["10.2", "11.4", "9.9"]:
    p.fill("#wKg", w); p.press("#wKg", "Enter"); p.wait_for_timeout(100)
app.tap('[data-chips="sp"] [data-v="YFT"]')
p.fill("#wKg", "24.6"); app.tap("#btnAddW")
trip = [t for t in app.stored()["trips"] if t["tripNumber"] == "9"][0]
check([w["sp"] for w in trip["weights"]] == ["ALB", "ALB", "ALB", "YFT"], "weights saved with species")
app.tap("#btnBack")

# End trip
app.tap("#btnEnd")
app.tap('.sheet [data-a="ok"]')
trip = [t for t in app.stored()["trips"] if t["tripNumber"] == "9"][0]
check(trip["ended"] and trip["dischargeDate"], "trip ended with discharge date")
check(p.locator("#btnLogStop").count() == 0, "no LOG STOP on an ended trip")

# Seeded season untouched
s = app.stored()
orig = fake_season()
for t in orig["trips"]:
    got = [x for x in s["trips"] if x["id"] == t["id"]][0]
    check(same_stops(got["stops"], t["stops"]) and got["weights"] == t["weights"], "seeded trip %s unchanged" % t["tripNumber"])
app.close()
done("test_trip_flow")
