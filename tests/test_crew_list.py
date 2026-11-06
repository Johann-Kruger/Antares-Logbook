"""Crew member fields, the crew list PDF layout and persons-on-board count."""
from harness import App, check, done, fake_season
import subprocess

app = App(seed=fake_season())
p = app.page
p.locator('[data-trip="t1"]').click(); p.wait_for_timeout(200)
app.tap("#btnReopen"); app.tap('.sheet-backdrop:last-child [data-a="ok"]')
app.tap("#btnCrew"); app.tap("#btnAddCrew")
p.fill("#cName", "Sam"); p.fill("#cSurname", "Fakename"); p.fill("#cId", "X1234567")
p.fill("#cNat", "nam"); p.fill("#cTel", "000 111 2222"); p.fill("#cKin", "Kin Person 000 333 4444")
app.tap('[data-chips="role"] [data-v="Cook"]')
app.tap('.sheet [data-a="save"]')
c = [t for t in app.stored()["trips"] if t["id"] == "t1"][0]["crew"][-1]
check(c["nationality"] == "NAM" and c["contact"] == "000 111 2222" and c["nextOfKin"].startswith("Kin") and c["role"] == "Cook", "crew fields saved: %r" % c)
check(app.stored()["knownCrew"][-1]["nextOfKin"].startswith("Kin"), "remembered with all fields")
check("2 on board incl. skipper" in p.locator("#tbSub").inner_text(), "skipper on the list isn't counted twice")
pdf = app.download("#btnCrewPdf")
txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
check("CREW LIST" in txt and "Fakename" in txt and "NAM" in txt and "Cook" in txt and "Kin Person" in txt, "PDF has the crew row")
check("Persons on board (incl. skipper): 2" in txt, "PDF persons on board")
check("Alex" not in txt.split("Next of kin")[1], "skipper not repeated in the crew table")
app.close()
done("test_crew_list")
