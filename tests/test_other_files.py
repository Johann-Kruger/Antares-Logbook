"""Stop log CSV, weight CSV and crew list PDF are produced for a seeded trip."""
from harness import App, check, done, fake_season
import csv

app = App(seed=fake_season())
p = app.page
p.locator('[data-trip="t0"]').click(); p.wait_for_timeout(200)
app.tap("#btnReports")
rows = list(csv.reader(open(app.download("#btnStopsCsv"))))
check(rows[0][0] == "Trip" and len(rows) == 1 + 6, "stop log has a row per stop")
check(rows[-1][9] == str(sum(int(r[6]) for r in rows[1:])), "running trip total in last row")
wrows = list(csv.reader(open(app.download("#btnWeightsCsv"))))
check(len(wrows) == 1 + 5 + 1 and wrows[-1][1] == "Total", "weights CSV with total row")
pdf = open(app.download("#btnCrewPdf2"), "rb").read()
check(pdf[:4] == b"%PDF" and len(pdf) > 1000, "crew list PDF")
app.close()
done("test_other_files")
