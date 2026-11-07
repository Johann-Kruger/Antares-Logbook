"""Voyage contract: crew sign on the phone, the PDF is filled in, edits void a signature, new trips start unsigned."""
from harness import App, check, done, fake_season, sign
import subprocess

def pdftext(path):
    return subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True).stdout

seed = fake_season()
seed["settings"].update({"owner": "Fakeco Fishing (Pty) Ltd", "crewListPort": "Test Harbour", "commLongfin": "123"})
app = App(seed=seed)
p = app.page
def trip1(): return [t for t in app.stored()["trips"] if t["id"] == "t1"][0]

p.locator('[data-trip="t1"]').click(); p.wait_for_timeout(200)
app.tap("#btnReopen"); app.tap('.sheet-backdrop:last-child [data-a="ok"]')
app.tap("#btnCrew"); app.tap("#btnAddCrew")
p.fill("#cName", "Sam"); p.fill("#cSurname", "Fakename"); p.fill("#cId", "X1234567")
p.fill("#cTel", "000 111 2222"); p.fill("#cKinName", "Kin Person"); p.fill("#cKinTel", "000 333 4444")
app.tap('.sheet [data-a="save"]')
check("contract not signed" in p.locator("#screen").inner_text(), "crew line shows the contract is unsigned")
check("Alex" not in p.locator("#btnSignContracts").inner_text() and "(1)" in p.locator("#btnSignContracts").inner_text(), "skipper isn't asked to sign")

# Sign in turn: contract opens, crew reads it and signs.
app.tap("#btnSignContracts")
txt = p.locator(".sheet").last.inner_text()
check("VOYAGE CONTRACT OF EMPLOYMENT – Vessel Testboat" in txt and "FAKECO FISHING (Pty) Ltd" in txt, "contract heading from settings")
check("departs Test Harbour" in txt and "R 123 / ton Longfin" in txt and "R _____ / ton Yellowfin" in txt and "R150 per day" in txt, "terms filled from settings")
check("X1234567" in txt and "Kin Person" in txt and "000 333 4444" in txt, "crew particulars shown")
app.tap('.sheet [data-a="sign"]')
sign(app)
p.wait_for_timeout(200)
c = trip1()["crew"][-1]
check(c["contractSig"].startswith("data:image/png;base64,") and c["contractSignedAt"], "signature saved on the crew member")
check(len(c["contractSig"]) < 40000, "signature kept small (%d chars)" % len(c["contractSig"]))
check("All contracts signed" in p.locator("#toast").inner_text(), "sequence finishes when everyone has signed")
check("contract ✓" in p.locator("#screen").inner_text() and p.locator("#btnSignContracts").count() == 0, "crew line shows signed")
check(trip1()["crew"][0].get("contractSig", "") == "", "skipper has no contract")

pdf = pdftext(app.download("#btnContractsPdf"))
check("VOYAGE CONTRACT OF EMPLOYMENT" in pdf and "Fakename" in pdf and "X1234567" in pdf and "Kin Person 000 333 4444" in pdf, "PDF particulars")
check("Repatriation" in pdf and "Fakeco Fishing will" in pdf and "Signed by Skipper/Fakeco Fishing Rep" in pdf, "PDF clauses")
check("1 of 1" in pdf and "Alex" not in pdf, "one page per crew member, skipper excluded")

# Changing a contract detail voids the signature; changing position does not.
p.locator('[data-crew]').last.click(); p.wait_for_timeout(150)
check("signed" in p.locator('.sheet [data-a="contract"]').inner_text(), "crew sheet shows signed contract")
app.tap('[data-chips="role"] [data-v="Cook"]'); app.tap('.sheet [data-a="save"]')
check(trip1()["crew"][-1]["contractSig"], "position change keeps the signature")
p.locator('[data-crew]').last.click(); p.wait_for_timeout(150)
p.fill("#cId", "X7654321"); app.tap('.sheet [data-a="save"]')
check(trip1()["crew"][-1]["contractSig"] == "", "ID change voids the signature")
check("sign the contract again" in p.locator("#toast").inner_text(), "skipper is told")

# End-trip sheet warns about unsigned contracts.
app.tap("#btnBack")
if p.locator("#btnEnd").count():
    app.tap("#btnEnd")
    check("Voyage contract not signed by Sam" in p.locator(".sheet").last.inner_text(), "end trip warns")
    app.tap('.sheet [data-a="cancel"]')
else:
    check(False, "could not reach the trip screen")
app.close()

# A saved signature survives a reload; a new trip carries the crew over unsigned.
seed2 = fake_season()
seed2["trips"][1]["crew"].append({"id": "c9", "name": "Kim", "surname": "Faker", "idNumber": "Y1", "role": "Crew",
                                   "contractSig": "data:image/png;base64,iVBORw0KGgo=", "contractSignedAt": "2026-10-22T05:00:00.000Z"})
seed2["trips"][0]["crew"].append({"id": "c8", "name": "Bad", "surname": "Sig", "role": "Crew", "contractSig": "javascript:alert(1)"})
app = App(seed=seed2)
p = app.page
app.tap("#btnNewTrip")
if p.locator("#tTripNo").count():
    p.fill("#tTripNo", "9"); app.tap('.sheet [data-a="save"]')
    p.wait_for_timeout(200)
    trips = app.stored()["trips"]
    kept = [t for t in trips if t["id"] == "t1"][0]["crew"][-1]
    bad = [t for t in trips if t["id"] == "t0"][0]["crew"][-1]
    new = [t for t in trips if t["tripNumber"] == "9"][0]
    check(kept["contractSig"].startswith("data:image/png") and kept["contractSignedAt"], "signed contract kept on its own trip")
    check(bad["contractSig"] == "" and bad["contractSignedAt"] == "", "invalid signature data dropped")
    kim = [c for c in new["crew"] if c["name"] == "Kim"]
    check(kim and kim[0]["contractSig"] == "" and kim[0]["contractSignedAt"] == "", "new trip starts with unsigned contracts")
else:
    check(False, "could not open the new trip sheet")
app.close()
done("test_voyage_contract")
