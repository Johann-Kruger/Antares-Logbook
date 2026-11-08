"""No duplicate crew: matching on ID and names when saving, and the clean-up tool."""
from harness import App, check, done, fake_season
import copy

def person(i, name, surname, idn, **kw):
    d = {"id": i, "name": name, "surname": surname, "idNumber": idn, "role": "Crew", "nationality": "RSA",
         "contact": "", "kinName": "", "kinContact": "", "albRate": "", "yftRate": ""}
    d.update(kw); return d

seed = fake_season()
seed["trips"][1]["ended"] = False
seed["trips"][1]["crew"] = [person("c1", "Alex", "Testperson", "000", role="Skipper"),
                            person("c2", "Sam", "Fakename", "800101 5000 081", contact="000 111")]
seed["trips"][1]["contracts"] = {}
seed["knownCrew"] = [person("k1", "Sam", "Fakename", "8001015000081", contact="000 111"),
                     person("k2", "Jo", "Dupe", "", kinName="Mo"), person("k3", "JO", "dupe ", "7702025000082"),
                     person("k4", "Lerato", "Mokoena", "9001015000083"), person("k5", "Lereto", "Mokoena", ""),
                     person("k6", "Pat", "Twin", "1111111111111"), person("k7", "Pat", "Twin", "2222222222222")]
app = App(seed=seed)
p = app.page
p.wait_for_timeout(200)  # an open trip opens straight away
app.tap("#btnCrew")

# 1. Same ID as someone already on the trip (spacing differs) -> asked, update instead of a second copy
app.tap("#btnAddCrew")
p.fill("#cName", "Samuel"); p.fill("#cSurname", "Fakename"); p.fill("#cId", "8001015000081"); p.fill("#cKinName", "Kin A")
app.tap('.sheet [data-a="save"]')
check("same ID number" in p.locator(".sheet").last.inner_text(), "warned: same ID as a crew member on the trip")
app.tap('.sheet-backdrop:last-child [data-a="update"]')
crew = [t for t in app.stored()["trips"] if t["id"] == "t1"][0]["crew"]
check(len(crew) == 2 and crew[1]["name"] == "Samuel" and crew[1]["kinName"] == "Kin A", "existing record updated, no duplicate: %r" % [c["name"] for c in crew])

# 2. New person matching a saved known-crew record by name -> use the saved record (keeps its ID)
app.tap("#btnAddCrew")
p.fill("#cName", "Lerato"); p.fill("#cSurname", "Mokoena")
app.tap('.sheet [data-a="save"]')
check("Saved before?" in p.locator(".sheet").last.inner_text(), "warned: already in known crew")
app.tap('.sheet-backdrop:last-child [data-a="use"]')
s = app.stored()
crew = [t for t in s["trips"] if t["id"] == "t1"][0]["crew"]
check(crew[-1]["idNumber"] == "9001015000083", "saved ID brought in")
check(sum(1 for k in s["knownCrew"] if k["surname"] == "Mokoena" and k["name"] == "Lerato") == 1, "no second known-crew record")

# 3. Different person with a similar name -> save as new, and don't ask again
app.tap("#btnAddCrew")
p.fill("#cName", "Lereta"); p.fill("#cSurname", "Mokoena"); p.fill("#cId", "")
app.tap('.sheet [data-a="save"]')
app.tap('.sheet-backdrop:last-child [data-a="new"]')
check(len([t for t in app.stored()["trips"] if t["id"] == "t1"][0]["crew"]) == 4, "added as a different person")

# 4. Clean-up tool: known crew groups
app.tap("#btnMenu"); app.tap('[data-a="dups"]')
txt = p.locator(".sheet").last.inner_text()
check("Jo Dupe" in txt and "JO dupe" in txt, "same name, one without ID, grouped")
check("Pat Twin" not in txt, "same name but two different IDs are not duplicates")
grp = p.locator('[data-merge]').first.get_attribute("data-merge")
# keep the record with the ID, merge the next of kin from the other
p.locator('.sheet [data-group="%s"] input[type=radio]' % grp).nth(1).check()
p.locator('[data-merge="%s"]' % grp).click(); p.wait_for_timeout(150)
app.tap('.sheet-backdrop:last-child [data-a="ok"]')
kc = app.stored()["knownCrew"]
dupes = [k for k in kc if k["surname"].strip().lower() == "dupe"]
check(len(dupes) == 1 and dupes[0]["idNumber"] == "7702025000082" and dupes[0]["kinName"] == "Mo", "merged into one, blanks filled: %r" % dupes)
# The Mokoena records are different people: say so for each group left
for _ in range(5):
    p.wait_for_timeout(300)
    btn = p.locator('.sheet-backdrop:last-child [data-not]')
    if not btn.count(): break
    btn.first.click()
check(p.locator('[data-merge]').count() == 0, "nothing left to review")
if p.locator('.sheet [data-a="close"]').count(): app.tap('.sheet [data-a="close"]')
check(len(app.stored()["notDuplicates"]) >= 1, "not-duplicate choice remembered")
app.close()
done("test_duplicates")
