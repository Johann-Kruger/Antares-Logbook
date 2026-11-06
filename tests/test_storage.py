"""A damaged logbook is never written over; backup and restore round-trip."""
from harness import App, check, done, fake_season, same_stops, KEY
import json

app = App()
p = app.page
p.evaluate("k => localStorage.setItem(k, '{not json')", KEY); p.reload(); p.wait_for_timeout(300)
check(p.get_by_text("could not be read").count() >= 1, "recovery message shown")
check(p.evaluate("k => localStorage.getItem(k)", KEY) == "{not json", "damaged data left untouched")
check(p.evaluate("k => Object.keys(localStorage).some(x => x.startsWith(k + '_corrupt_'))", KEY), "copy kept")
app.close()

app = App(seed=fake_season())
p = app.page
p.locator("#btnBackupNow").click()
with p.expect_download() as d:
    p.locator("#btnBackupNow").click()
import os
from harness import OUT
path = os.path.join(OUT, d.value.suggested_filename); d.value.save_as(path)
data = json.load(open(path))
check(len(data["data"]["trips"]) == 2, "backup holds both trips")
p.evaluate("k => localStorage.clear()"); p.reload(); p.wait_for_timeout(300)
check(p.locator("[data-trip]").count() == 0, "cleared")
app.tap("#btnMenu"); app.tap('[data-a="backup"]')
p.set_input_files("#restoreFile", path); p.wait_for_timeout(300)
app.tap('.sheet-backdrop:last-child [data-a="ok"]')
check(p.locator("[data-trip]").count() == 2, "restored trips listed")
check(same_stops(app.stored()["trips"][0]["stops"], fake_season()["trips"][0]["stops"]), "stops restored exactly")
app.close()
done("test_storage")
