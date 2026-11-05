"""The DFFE form fills the right cells from the stops and weights."""
from harness import App, check, done, fake_season
import openpyxl, warnings
warnings.filterwarnings("ignore")

seed = fake_season()
app = App(seed=seed)
p = app.page
p.locator('[data-trip="t1"]').click(); p.wait_for_timeout(200)
app.tap("#btnReports")
path = app.download("#btnDffe")
wb = openpyxl.load_workbook(path)
ws = wb.active
check(ws.title == "Catch Stats", "one Catch Stats sheet")
check(ws["S3"].value == "TESTBOAT" and ws["Z3"].value == "October" and ws["Z4"].value == 2026, "header vessel/month/year")
check(ws["A12"].value == 8, "trip number")
check(ws["B12"].value == "22/10/2026" and ws["B14"].value == "23/10/2026" and ws["B16"].value == "24/10/2026", "dates per day")
check(ws["B18"].value in (None, ""), "no fourth day")
trip = seed["trips"][1]
day1 = [s for s in trip["stops"] if s["date"] == "2026-10-22"]
check(ws["P12"].value == sum(int(s["alb"]) for s in day1), "ALB number day 1")
check(ws["P13"].value == round(sum(int(s["alb"]) for s in day1) * 10.5), "ALB kg day 1 = count x avg")
check(ws["S12"].value == sum(int(s["yft"]) for s in day1), "YFT number day 1")
check(ws["E12"].value == 34 and ws["H12"].value == 18, "start position degrees")
check(ws["J12"].value == "16.0-16.2", "SST range from stops: %r" % ws["J12"].value)
check(ws["C12"].value == 1 and ws["L12"].value == 12, "crew from the crew list, hours from settings")
check(ws["Q12"].value == 100 and ws["R12"].value == 0, "pole/line split")
check(ws["P28"].value == 52.5, "offload ALB weight: %r" % ws["P28"].value)
check("Trip 8" in ws["A46"].value, "comment line")
check(ws["S56"].value == "Test Skipper", "certified name")
import zipfile
z = zipfile.ZipFile(path)
check("xl/media/image1.png" in z.namelist() and "xl/drawings/drawing1.xml" in z.namelist(), "DFFE logo kept")
app.close()
done("test_dffe_export")
