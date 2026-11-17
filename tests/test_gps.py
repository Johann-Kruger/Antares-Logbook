"""GPS at sea: the receiver keeps running while a trip is open, a stop waits for satellites
with a countdown instead of giving up after 25 s, and rough or old fixes are labelled."""
from harness import App, check, done, fake_season

# Replace the browser's geolocation with a controllable fake before the app loads.
FAKE = """
window.__gps = { watchers:{}, n:0, starts:0, clears:0 };
navigator.geolocation.watchPosition = function(ok, err){ var id = ++__gps.n; __gps.watchers[id] = {ok:ok, err:err}; __gps.starts++; return id; };
navigator.geolocation.clearWatch = function(id){ delete __gps.watchers[id]; __gps.clears++; };
navigator.geolocation.getCurrentPosition = function(){ throw new Error("should not be used"); };
window.__fix = function(lat, lon, acc){ Object.values(__gps.watchers).forEach(function(w){ w.ok({coords:{latitude:lat, longitude:lon, accuracy:acc}}); }); };
window.__gpsErr = function(code){ Object.values(__gps.watchers).forEach(function(w){ w.err({code:code}); }); };
window.__active = function(){ return Object.keys(__gps.watchers).length; };
"""

def open_app(seed, clock=False):
    app = App()
    app.ctx.add_init_script(FAKE)
    if clock: app.page.clock.install()
    app.page.evaluate("([k,v]) => localStorage.setItem(k, v)", ["antares_logbook_v1", __import__("json").dumps(seed)])
    app.page.reload()
    run(app, 400)
    return app

def run(app, ms):
    try: app.page.clock.run_for(ms)
    except Exception: app.page.wait_for_timeout(ms)

def tap(app, sel):
    app.page.locator(sel).first.click(); run(app, 400)

def new_stop(app):
    tap(app, "#btnLogStop")
    if app.page.get_by_text("Start of the day").count():
        tap(app, '[data-chips="wxWindDir"] [data-v="SE"]'); tap(app, '.sheet [data-a="save"]')

def cancel_stop(app):
    tap(app, '.sheet [data-a="cancel"]')
    if app.page.locator('.sheet [data-a="ok"]').count(): tap(app, '.sheet [data-a="ok"]')

seed = fake_season()
check(all(t["ended"] for t in seed["trips"]), "fake season starts with only ended trips")
app = open_app(seed); p = app.page
check(p.evaluate("__active()") == 0, "GPS stays off with no open trip")
app.close()

seed = fake_season(); seed["trips"][-1]["ended"] = False
app = open_app(seed, clock=True); p = app.page
check(p.evaluate("__active()") == 1, "GPS runs while a trip is open")
if p.locator('[data-trip="%s"]' % seed["trips"][-1]["id"]).count(): tap(app, '[data-trip="%s"]' % seed["trips"][-1]["id"])

# A stop with no fix yet waits and counts up, rather than failing at 25 s.
new_stop(app)
run(app, 30000)
txt = p.locator("#gpsText").inner_text()
check("Waiting for satellites" in txt and "30 s" in txt, "countdown shows while waiting (%r)" % txt)
p.evaluate("__gpsErr(3)"); run(app, 4000)
check(p.evaluate("__active()") == 1, "receiver restarts after a timeout error")
p.evaluate("__fix(-33.1234567, 16.7654321, 12)"); run(app, 500)
txt = p.locator("#gpsText").inner_text()
check("33" in txt and "GPS position" in txt, "fix arriving later fills the stop (%r)" % txt)
check(p.locator("#sLatD").input_value() == "33", "manual position filled from fix")
cancel_stop(app)

# The next stop within 30 s takes the warm fix immediately.
run(app, 10000)
new_stop(app)
check("GPS position" in p.locator("#gpsText").inner_text(), "warm fix used straight away")
cancel_stop(app)

# Only a rough (approximate-location) fix: after 2 min it is used but labelled.
run(app, 60000)
p.evaluate("__fix(-33.2, 16.8, 2500)")
new_stop(app); run(app, 121000)
txt = p.locator("#gpsText").inner_text()
check("rough position" in txt and "Precise location" in txt, "rough fix labelled (%r)" % txt)
cancel_stop(app)

# Nothing at all for over 10 min: clear advice.
run(app, 11 * 60000)
new_stop(app); run(app, 121000)
txt = p.locator("#gpsText").inner_text()
check("No position" in txt and "clear view of the sky" in txt, "no-fix advice (%r)" % txt)
cancel_stop(app)

# Permission denied is reported, not waited on.
p.evaluate("__gpsErr(1)"); run(app, 100)
check(p.evaluate("__active()") == 0, "denied stops the receiver")
new_stop(app)
p.evaluate("__gpsErr(1)"); run(app, 200)
check("permission denied" in p.locator("#gpsText").inner_text(), "denied explained")
check(not app.errors, "no page errors %r" % app.errors)
app.close()
done("test_gps")
