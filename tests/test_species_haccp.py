"""Other species on a stop, a species the skipper adds, the tank carried forward,
the end-of-day HACCP check and its PDFs, and the DFFE columns for each species."""
from harness import App, check, done, fake_season, sign
import openpyxl, warnings, datetime
warnings.filterwarnings("ignore")

app = App(seed=fake_season())
p = app.page
app.tap("#btnNewTrip"); p.fill("#tTripNo", "20"); app.tap('[data-a="save"]')
sign(app)
trip = [t for t in app.stored()["trips"] if t["tripNumber"] == "20"][0]
check(trip["skipperSig"].startswith("data:image/png;base64,"), "signature stored")
check(len(trip["crew"]) == 1 and not trip["crewConfirmedAt"], "crew copied, not yet confirmed")
app.tap("#btnBack")
check(p.get_by_text("Crew list not confirmed yet.").count() == 1, "trip screen nags about crew")

# First stop: skip weather, log LF + bigeye + a new species
app.tap("#btnLogStop"); app.tap('.sheet [data-a="skip"]')
p.wait_for_selector('input[data-sp="BET"]')
p.fill("#sAlb", "30"); p.fill('input[data-sp="BET"]', "2")
app.tap('[data-chips="tank"] [data-v="4"]')
app.tap("#btnOtherSp")
p.fill("#nsName", "Dorado"); p.fill("#nsCode", "dol")
app.tap('.sheet-backdrop:last-child [data-a="add"]')
check(p.locator('input[data-sp="DOL"]').input_value() == "1", "new species counter added at 1")
app.tap('.sheet [data-a="save"]')
s = app.stored()
check(s["customSpecies"] == [{"code": "DOL", "name": "Dorado"}], "new species saved for later trips")
st = [t for t in s["trips"] if t["tripNumber"] == "20"][0]["stops"][0]
check(st["alb"] == "30" and st["other"] == {"BET": "2", "DOL": "1"} and st["tank"] == "4", "species counts and tank: %r" % st)

# Next stop: no weather question, tank 4 still selected
app.tap("#btnLogStop")
check(p.get_by_text("Start of the day").count() == 0, "weather asked only once a day")
check(p.locator('[data-chips="tank"] .chip.on').get_attribute("data-v") == "4", "tank carried forward")
p.fill("#sAlb", "12"); app.tap('.sheet [data-a="save"]')

# End-of-day HACCP: defaults all good, flip one, save
today = datetime.date.today().isoformat()
app.tap('[data-haccp="%s"]' % today)
check(p.locator('[data-chips="san:Holds clean"] .chip.on').get_attribute("data-v") == "Y", "sanitation defaults to Yes")
check(p.locator('#f0_catchTime').input_value().endswith("-" + p.locator('#f0_catchTime').input_value()[-5:]), "catch time range filled")
app.tap('[data-chips="san:Ice clean"] [data-v="N"]')
p.fill("#f0_tPrior", "18"); p.fill("#hDailyTemp", "17")
app.tap('.sheet [data-a="save"]')
h = [t for t in app.stored()["trips"] if t["tripNumber"] == "20"][0]["haccp"][today]
check(h["doneAt"] and h["san"]["Ice clean"] == "N" and h["san"]["Holds clean"] == "Y", "sanitation answers saved")
check([f["sp"] for f in h["fish"]] == ["ALB", "BET", "DOL"], "a fish inspection row per species: %r" % [f["sp"] for f in h["fish"]])
check(h["fish"][0]["tPrior"] == "18" and h["fish"][0]["decomposed"] == "N", "fish row values")

# Weights for bigeye, then reports
app.tap("#btnWeights")
app.tap('[data-chips="sp"] [data-v="BET"]')
p.fill("#wKg", "40"); p.press("#wKg", "Enter"); p.wait_for_timeout(100)
p.fill("#wKg", "44"); p.press("#wKg", "Enter"); p.wait_for_timeout(100)
app.tap("#btnBack"); app.tap("#btnReports")
fish_pdf = open(app.download("#btnFishPdf"), "rb").read()
san_pdf = open(app.download("#btnSanPdf"), "rb").read()
check(fish_pdf[:4] == b"%PDF" and san_pdf[:4] == b"%PDF", "HACCP PDFs made")
ws = openpyxl.load_workbook(app.download("#btnDffe")).active
check(ws["P12"].value == 42, "LF number")
check(ws["V12"].value == 2 and ws["V13"].value == 84 and ws["V28"].value == 84, "bigeye number, kg and offload: %r" % [ws["V12"].value, ws["V13"].value, ws["V28"].value])
check(ws["AE10"].value == "Dorado" and ws["AE12"].value == 1, "new species in the first spare column")
check(ws["K12"].value == "ALB BET DOL", "target lists species caught")
app.close()
done("test_species_haccp")
