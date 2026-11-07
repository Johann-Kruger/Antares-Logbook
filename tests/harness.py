"""Shared Playwright harness for www/index.html. All people and numbers here are FAKE."""
import functools, http.server, json, os, socketserver, sys, tempfile, threading
from playwright.sync_api import sync_playwright

WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "www")
KEY = "antares_logbook_v1"
CHROME = os.environ.get("CHROMIUM_PATH") or None
OUT = tempfile.mkdtemp(prefix="antares_tests_")

class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def start_server():
    srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=WWW))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, "http://127.0.0.1:%d" % srv.server_address[1]

def fake_season():
    """Two ended trips and nothing at sea, in the shape the app saves."""
    trips = []
    sid = 0
    for t, (no, days) in enumerate([("7", ["2026-10-17", "2026-10-18"]), ("8", ["2026-10-22", "2026-10-23", "2026-10-24"])]):
        stops = []
        for di, d in enumerate(days):
            for k in range(3):
                sid += 1
                stops.append({"id": "s%d" % sid, "date": d, "time": "%02d:%02d" % (8 + k * 3, 10 * k), "lat": "-34.6%02d" % (sid % 60),
                              "lon": "18.0%02d" % (sid % 60), "gpsNote": "", "alb": str(5 + sid), "yft": "1" if sid % 4 == 0 else "0",
                              "tank": str(1 + k), "sst": "16.%d" % k, "windDir": "SE", "windKn": "10-15", "sea": "Slight",
                              "driftDir": "NW", "driftKn": "1", "schoolDepth": "45", "bait": "", "notes": ""})
        trips.append({"id": "t%d" % t, "createdAt": 1790000000000 + t * 1000, "tripNumber": no, "sailDate": days[0], "sailTime": "05:00",
                      "dischargeDate": days[-1], "ended": True, "notes": "",
                      "crew": [{"id": "c1", "name": "Alex", "surname": "Testperson", "idNumber": "000000 0000 001", "role": "Skipper"}],
                      "stops": stops, "days": {}, "weights": [{"id": "w%d" % i, "sp": "ALB", "kg": "10.5", "len": ""} for i in range(5)]})
    return {"schemaVersion": 1, "settings": {"vessel": "TESTBOAT", "registrationNo": "TEST-REG", "rightsHolder": "Test Fishing",
            "rightNo": "TPL00000", "permitNo": "0000000", "skipper": "Test Skipper", "contact": "000", "email": "test@example.invalid",
            "port": "Testport", "observer": "N", "defaultCrew": "9", "defaultHours": "12", "gear": "P", "liveBait": "N",
            "baitCondition": "", "polePct": "100"}, "trips": trips, "knownCrew": [], "lastConditions": {}, "backupAt": ""}

class App:
    def __init__(self, seed=None, geo=(-34.6, 18.08)):
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch(executable_path=CHROME)
        self.ctx = self.browser.new_context(viewport={"width": 412, "height": 860}, accept_downloads=True,
                                            geolocation={"latitude": geo[0], "longitude": geo[1]}, permissions=["geolocation"])
        self.srv, self.url = start_server()
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.goto(self.url + "/index.html")
        if seed is not None:
            self.page.evaluate("([k,v]) => localStorage.setItem(k, v)", [KEY, json.dumps(seed)])
            self.page.reload()
        self.page.wait_for_timeout(300)

    def stored(self):
        return json.loads(self.page.evaluate("k => localStorage.getItem(k)", KEY) or "null")

    def tap(self, sel):
        el = self.page.locator(sel).first
        # Centre it first so the fixed bottom button bar can't cover it.
        el.evaluate("e => e.scrollIntoView({block: 'center'})")
        el.click(); self.page.wait_for_timeout(150)

    def download(self, sel):
        with self.page.expect_download() as d:
            self.page.locator(sel).first.click()
        path = os.path.join(OUT, d.value.suggested_filename)
        d.value.save_as(path)
        return path

    def close(self):
        assert not self.errors, self.errors
        self.browser.close(); self.pw.stop(); self.srv.shutdown()

def same_stops(saved, original):
    """Every original field kept; new fields added on load (e.g. other={}) are allowed."""
    if len(saved) != len(original): return False
    return all(all(a.get(k) == v for k, v in b.items()) and a.get("other", {}) == b.get("other", {}) for a, b in zip(saved, original))

def sign(app):
    """Draws a squiggle on the signature pad and saves it."""
    p = app.page
    p.wait_for_selector("#sigPad")
    box = p.locator("#sigPad").bounding_box()
    p.mouse.move(box["x"] + 30, box["y"] + 100); p.mouse.down()
    for i in range(1, 12):
        p.mouse.move(box["x"] + 30 + i * 20, box["y"] + 100 + (25 if i % 2 else -25))
    p.mouse.up()
    app.tap('.sheet [data-a="save"]')

def to_crew(app):
    """After a new trip the departure check opens first; close it and go to the crew list."""
    app.tap('.sheet [data-a="cancel"]')
    app.tap("#btnCrew")

checks = {"n": 0, "fail": 0}
def check(cond, msg):
    checks["n"] += 1
    if not cond:
        checks["fail"] += 1
        print("FAIL:", msg)
def done(name):
    if checks["fail"]:
        print("%s: %d of %d checks FAILED" % (name, checks["fail"], checks["n"])); sys.exit(1)
    print("%s: all %d checks passed" % (name, checks["n"]))
