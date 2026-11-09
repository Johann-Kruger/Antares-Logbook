"""Known crew: edit details from the list, updates reach open trips, duplicates reviewed from the same page."""
from harness import App, check, done, fake_season

def person(i, name, surname, idn, **kw):
    d = {"id": i, "name": name, "surname": surname, "idNumber": idn, "role": "Crew", "nationality": "RSA",
         "contact": "", "kinName": "", "kinContact": "", "albRate": "", "yftRate": ""}
    d.update(kw); return d

seed = fake_season()
seed["trips"][1]["ended"] = False
seed["trips"][1]["crew"] = [dict(person("c9", "Sam", "Fakename", "8001015000081"), knownId="k1")]
seed["knownCrew"] = [person("k1", "Sam", "Fakename", "8001015000081"), person("k2", "Lee", "Other", "7001015000082")]
app = App(seed=seed)
p = app.page
p.wait_for_timeout(200)
app.tap("#navKnownCrew")
txt = p.locator(".sheet").last.inner_text()
check("Fakename" in txt and "Other" in txt and p.locator("#btnKnownDups").count() == 0, "list shown, no duplicate banner")
app.tap('[data-kid="k1"]')
p.fill("#kTel", "000 999 8888"); p.fill("#kKinName", "New Kin"); p.fill("#kAlbRate", "1500")
app.tap('[data-chips="krole"] [data-v="Cook"]')
app.tap('.sheet [data-a="save"]')
s = app.stored()
k = [x for x in s["knownCrew"] if x["id"] == "k1"][0]
check(k["contact"] == "000 999 8888" and k["kinName"] == "New Kin" and k["albRate"] == "1500" and k["role"] == "Cook", "known record edited: %r" % k)
c = [t for t in s["trips"] if t["id"] == "t1"][0]["crew"][0]
check(c["contact"] == "000 999 8888" and c["role"] == "Cook", "open trip's copy updated too")
check(len(s["trips"][0]["crew"]) == 0 or all(x.get("contact") != "000 999 8888" for x in s["trips"][0]["crew"]), "ended trip left alone")
check(p.locator("[data-kid]").count() == 2, "back on the known crew list")

# Edit Lee so he matches Sam -> asked; merge into one
app.tap('[data-kid="k2"]')
p.fill("#kId", "8001015000081")
app.tap('.sheet [data-a="save"]')
check("Already in known crew?" in p.locator(".sheet").last.inner_text(), "warned when an edit matches someone else")
app.tap('.sheet-backdrop:last-child [data-a="merge"]')
kc = app.stored()["knownCrew"]
check(len(kc) == 1 and kc[0]["id"] == "k2" and kc[0]["kinName"] == "New Kin", "merged into one, blanks filled: %r" % kc)
c = [t for t in app.stored()["trips"] if t["id"] == "t1"][0]["crew"][0]
check(c["knownId"] == "k2", "trip crew re-pointed to the kept record")

# Forget asks first
app.tap('[data-kid="k2"]'); app.tap('.sheet [data-a="forget"]')
app.tap('.sheet-backdrop:last-child [data-a="ok"]')
check(app.stored()["knownCrew"] == [], "forgotten after confirming")
app.close()

# Duplicates in known crew: flagged on the list and reviewed from it; no separate menu item
seed = fake_season()
seed["knownCrew"] = [person("k1", "Jo", "Dupe", ""), person("k2", "JO", "dupe", "7702025000082")]
app = App(seed=seed); p = app.page
app.open_drawer() if hasattr(app, "open_drawer") else None
check(p.locator("#navDups").count() == 0, "no separate remove-duplicates menu item")
app.tap("#navKnownCrew")
check(p.locator("text=DUPLICATE?").count() == 2, "both records flagged")
app.tap("#btnKnownDups")
p.locator("[data-merge]").first.click(); p.wait_for_timeout(150)
app.tap('.sheet-backdrop:last-child [data-a="ok"]')
p.wait_for_timeout(300)
check(len(app.stored()["knownCrew"]) == 1, "duplicate removed")
check("Known crew (1)" in p.locator(".sheet").last.inner_text(), "returns to the known crew list")
app.close()
done("test_known_crew")
