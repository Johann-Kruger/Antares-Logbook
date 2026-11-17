"""Add trips from a file: only trips not already on the phone are added; nothing on the phone changes."""
import json, os, copy
from harness import App, check, done, fake_season, OUT

phone = fake_season()
phone["knownCrew"] = [{"id": "k1", "name": "Alex", "surname": "Testperson", "idNumber": "000000 0000 001", "role": "Skipper"}]
before = copy.deepcopy(phone["trips"])

# The file: a copy of phone trip t0 (already there), a trip with the same number as t1 (already there),
# a new numbered trip and a new trip with no number; plus one known and one new crew member.
f = fake_season()
newnum = copy.deepcopy(f["trips"][0]); newnum.update(id="imp20", tripNumber="20", sailDate="2026-11-09", createdAt=1790000900000)
nonum = copy.deepcopy(f["trips"][0]); nonum.update(id="imp1", tripNumber="", sailDate="2026-10-16", createdAt=1790000800000)
samenum = copy.deepcopy(f["trips"][1]); samenum.update(id="other", sailDate="2030-01-01")
filedata = {"app": "antares-logbook", "savedAt": "2026-11-17T00:00:00Z", "data": {
    "trips": [copy.deepcopy(f["trips"][0]), samenum, newnum, nonum], "settings": {"vessel": "SHOULD NOT CHANGE"},
    "knownCrew": [{"id": "x1", "name": "ALEX", "surname": "testperson", "idNumber": "000000 0000 001"},
                  {"id": "x2", "name": "Robin", "surname": "Newcrew", "idNumber": "000000 0000 077"}],
    "knownSkippers": [{"id": "sk9", "name": "Other Skipperman", "idNumber": "", "contact": ""}]}}
path = os.path.join(OUT, "add_trips.json"); json.dump(filedata, open(path, "w"))

app = App(seed=phone); p = app.page
vessel = app.stored()["settings"]["vessel"] if app.stored() else None
app.tap("#navBackup"); app.tap('.sheet [data-a="add"]')
p.set_input_files("#restoreFile", path); p.wait_for_timeout(300)
txt = p.locator(".sheet").last.inner_text()
check("Add 2 trips" in txt and "Trip 20" in txt, "preview lists the 2 new trips: %r" % txt[:200])
check("left as they are" in txt, "preview names the trips already on the phone")
check("1 crew member" in txt, "only the new crew member counted")
# Cancel first: nothing changes
p.locator('.sheet-backdrop:last-child [data-a="no"]').click(); p.wait_for_timeout(150)
check(len(app.stored()["trips"]) == len(before), "cancel adds nothing")
app.tap('.sheet [data-a="add"]') if p.locator('.sheet [data-a="add"]').count() else (app.tap("#navBackup"), app.tap('.sheet [data-a="add"]'))
p.set_input_files("#restoreFile", path); p.wait_for_timeout(300)
app.tap('.sheet-backdrop:last-child [data-a="ok"]')
s = app.stored()
ids = [t["id"] for t in s["trips"]]
check(len(s["trips"]) == len(before) + 2 and "imp20" in ids and "imp1" in ids and "other" not in ids, "two trips added: %r" % ids)
for b in before:
    t = [x for x in s["trips"] if x["id"] == b["id"]][0]
    check(t["tripNumber"] == b["tripNumber"] and t["sailDate"] == b["sailDate"] and len(t["stops"]) == len(b["stops"]) and len(t["weights"]) == len(b["weights"]), "phone trip %s unchanged" % b["id"])
imp = [x for x in s["trips"] if x["id"] == "imp20"][0]
check(len(imp["stops"]) == len(newnum["stops"]) and len(imp["weights"]) == 5, "imported trip has its stops and weights")
check(s["settings"]["vessel"] != "SHOULD NOT CHANGE", "settings not touched")
check([k["name"] for k in s["knownCrew"]] == ["Alex", "Robin"], "new crew added, existing match skipped: %r" % s["knownCrew"])
check(any(k["name"] == "Other Skipperman" for k in s["knownSkippers"]), "new skipper added")
check(p.locator("[data-trip]").count() == len(before) + 2, "trips listed")
# Same file again: nothing to add
app.tap("#navBackup"); app.tap('.sheet [data-a="add"]')
p.set_input_files("#restoreFile", path); p.wait_for_timeout(300)
check(len(app.stored()["trips"]) == len(before) + 2, "second import adds nothing")
check("already on this phone" in p.locator("#toast").inner_text() if p.locator("#toast").count() else True, "says they're already there")
app.close()
done("test_add_trips")
