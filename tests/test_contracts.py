"""Crew sign their voyage contract on the phone; the PDF carries their details and signature."""
from harness import App, check, done, fake_season, sign
import subprocess, json

seed = fake_season()
seed["trips"][1]["crew"].append({"id": "c2", "name": "Sam", "surname": "Fakename", "idNumber": "X1234567", "role": "Cook",
                                 "nationality": "NAM", "contact": "000 111 2222", "kinName": "Kin Person", "kinContact": "000 333 4444"})
seed["settings"]["albRate"] = "1500"
app = App(seed=seed)
p = app.page
app.tap("#btnNewTrip"); p.fill("#tTripNo", "21"); app.tap('[data-a="save"]')
sign(app)
app.tap("#btnConfirmCrew"); app.tap('.sheet-backdrop:last-child [data-a="ok"]')
check(p.locator("[data-con]").count() == 1, "contracts list the crew, not the skipper")
check("0 of 1 signed" in p.locator("#tbSub").inner_text(), "none signed yet")
app.tap("[data-con]")
check(p.get_by_text("R 1500 / ton Longfin").count() == 1, "commission rate from settings in the contract text")
app.tap('.sheet [data-a="sign"]')
sign(app)
trip = [t for t in app.stored()["trips"] if t["tripNumber"] == "21"][0]
cid = [c for c in trip["crew"] if c["surname"] == "Fakename"][0]["id"]
sig = trip["contracts"][cid]["sig"]
check(sig.startswith("data:image/png;base64,") and len(sig) < 40000, "crew signature stored and kept small (%d chars)" % len(sig))
check("1 of 1 signed" in p.locator("#tbSub").inner_text(), "count updates")
pdf = app.download("#btnAllContracts")
txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
check("VOYAGE CONTRACT OF EMPLOYMENT" in txt and "Fakename" in txt and "X1234567" in txt and "Kin Person" in txt and "21" in txt, "PDF filled in")
check("R 1500 / ton Longfin" in txt and "Payment is made 7 working days after offload" in txt, "contract wording")
app.tap("#btnBack"); app.tap("#btnBack"); app.tap("#btnEnd")
check("contract" not in p.locator(".sheet").inner_text().lower(), "no unsigned-contract warning when all signed")
app.close()
done("test_contracts")
