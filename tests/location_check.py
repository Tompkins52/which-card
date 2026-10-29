"""Opening the app at a store: with location on, it says where you are standing and answers for that store,
fast. The phone's position and the four public map services are faked, so this runs anywhere.
Run from the repo root: python3 tests/location_check.py [outdir]"""
import functools
import http.server
import json
import os
import socketserver
import sys
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
server = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
BASE = 'http://127.0.0.1:%d/' % server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

# A made-up block downtown: a Shell station, a Jewel-Osco 70 meters away, and another Jewel-Osco 300 meters north.
HERE = {'latitude': 41.87860, 'longitude': -87.63590, 'accuracy': 15}
THERE = {'latitude': 41.88130, 'longitude': -87.63590, 'accuracy': 15}
SHELL = {'type': 'node', 'lat': 41.87861, 'lon': -87.63589, 'tags': {'name': 'Shell', 'brand': 'Shell', 'amenity': 'fuel'}}
JEWEL = {'type': 'way', 'bounds': {'minlat': 41.87900, 'minlon': -87.63660, 'maxlat': 41.87940, 'maxlon': -87.63600}, 'tags': {'name': 'Jewel-Osco', 'shop': 'supermarket'}}
# A big warehouse: 220 m by 160 m, its center 130 m from the west door.
COSTCO = {'type': 'way', 'bounds': {'minlat': 41.89000, 'minlon': -87.65000, 'maxlat': 41.89144, 'maxlon': -87.64735}, 'tags': {'name': 'Costco', 'shop': 'wholesale'}}
AT_COSTCO_DOOR = {'latitude': 41.89072, 'longitude': -87.64995, 'accuracy': 12}
ACROSS = {'latitude': 41.87980, 'longitude': -87.63590, 'accuracy': 20}  # 45 m north of Jewel's edge, 130 m from Shell
JEWEL_THERE = {'type': 'way', 'center': {'lat': 41.88131, 'lon': -87.63590}, 'tags': {'name': 'Jewel-Osco', 'shop': 'supermarket'}}
ANSWER = json.dumps({'elements': [SHELL, JEWEL, JEWEL_THERE, COSTCO]})
PHOTON = json.dumps({'features': [
    {'properties': {'name': 'Shell', 'osm_key': 'amenity', 'osm_value': 'fuel'}, 'geometry': {'coordinates': [-87.63589, 41.87861]}},
    {'properties': {'name': 'Jewel-Osco', 'osm_key': 'shop', 'osm_value': 'supermarket', 'extent': [-87.63660, 41.87940, -87.63600, 41.87900]}, 'geometry': {'coordinates': [-87.63630, 41.87920]}},
    {'properties': {'name': 'Costco', 'osm_key': 'shop', 'osm_value': 'wholesale', 'extent': [-87.65000, 41.89144, -87.64735, 41.89000]}, 'geometry': {'coordinates': [-87.64868, 41.89072]}},
    {'properties': {'name': 'Wacker Drive', 'osm_key': 'highway', 'osm_value': 'primary'}, 'geometry': {'coordinates': [-87.63600, 41.87870]}}]})
EMPTY = json.dumps({'elements': []})
# What a busy server sends: a 200 with no places and a note that the search ran out of time.
BUSY = json.dumps({'elements': [], 'remark': 'runtime error: Query timed out in "query" at line 1 after 16 seconds.'})
WALLET = ['citi-costco-anywhere-visa', 'amex-blue-cash-preferred', 'wells-fargo-active-cash']
MINUTE = 60 * 1000

failures, errors = [], []


def check(ok, what):
    print(('ok    ' if ok else 'FAIL  ') + what)
    if not ok:
        failures.append(what)


def state(location, last_where=None, asked=True):
    s = {'wallet': [{'cardId': c, 'added': '2026-10-28T12:00:00Z'} for c in WALLET],
         'prefs': {'priority': 'cash', 'payMethod': 'card', 'redeem': {}, 'location': location},
         'customCards': [], 'disclaimed': True, 'onboarded': True, 'locationAsked': asked, 'dismissed': {}}
    if last_where:
        s['lastWhere'] = last_where
    return s


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              geolocation=HERE, permissions=['geolocation'])
    # How each map service behaves: ok, empty (a real answer with nothing in it), fail (an error page),
    # busy (a 200 with no places and a timeout note), or hang (never answers).
    mode = {'photon': 'ok', 'de': 'ok', 'coffee': 'ok', 'kumi': 'ok'}
    asked, held = [], []

    def all_modes(m, photon=None):
        mode.update(photon=photon or m, de=m, coffee=m, kumi=m)

    def map_server(route):
        url = route.request.url
        host = 'photon' if 'photon.komoot.io' in url else 'coffee' if 'private.coffee' in url else 'kumi' if 'kumi.systems' in url else 'de'
        asked.append(host)
        if mode[host] == 'hang':
            held.append(route)
        elif mode[host] == 'fail':
            route.fulfill(status=502, body='<h1>502 Gateway Timeout</h1>This Overpass API server is currently at capacity.')
        elif mode[host] == 'busy':
            route.fulfill(status=200, content_type='application/json', body=BUSY)
        elif mode[host] == 'empty':
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'features': []}) if host == 'photon' else EMPTY)
        else:
            route.fulfill(status=200, content_type='application/json', body=PHOTON if host == 'photon' else ANSWER)
    ctx.route('**/api/interpreter', map_server)
    ctx.route('**/photon.komoot.io/**', map_server)
    page = ctx.new_page()
    # Failed and cancelled lookups are on purpose; the browser logs them.
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'fonts.g' not in m.text
            and 'status of 502' not in m.text and 'ERR_FAILED' not in m.text else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    def seed(s):
        # Seed the storage from a page that does not run the app, so an earlier lookup cannot write over it.
        page.goto(BASE + 'README.md', wait_until='domcontentloaded')
        page.evaluate('s => { localStorage.clear(); localStorage.setItem("whichcard.state.v1", JSON.stringify(s)); }', s)

    def open_with(s, path=''):
        seed(s)
        page.goto(BASE + path, wait_until='networkidle')
        page.wait_for_timeout(700)

    def where_text():
        return page.locator('#where').inner_text().replace('\n', ' ')

    def winner():
        el = page.locator('.winner .name')
        return el.inner_text() if el.count() else ''

    def release_held():
        # Routes the page has already moved on from are gone; aborting them is a no-op.
        for route in held:
            try:
                route.abort()
            except Exception:
                pass
        del held[:]
        page.wait_for_timeout(100)

    # 1. Location not asked yet: the question sits at the top of the Pay screen, and one tap finds the store.
    open_with(state(False, asked=False))
    check(page.locator('#banner .note.ask').is_visible(), 'the location question is at the top of the Pay screen')
    page.screenshot(path=os.path.join(OUT, 'loc-1-ask.png'))
    page.click('#banner button:has-text("Use my location")')
    page.wait_for_selector('.where-chip.here', timeout=8000)
    page.wait_for_timeout(400)
    check("You’re at".upper() in where_text().upper() and 'Shell' in where_text(), 'it says "You\'re at Shell"')
    check(winner() == 'Costco Anywhere Visa', 'it answers for Shell before any amount is typed')
    check(page.locator('.nearby button:has-text("Jewel-Osco")').count() == 1, 'the store next door is one tap away')
    check(not page.locator('#banner .note.ask').count(), 'the question goes away once answered')
    page.screenshot(path=os.path.join(OUT, 'loc-2-found.png'))
    page.click('.nearby button:has-text("Jewel-Osco")')
    page.wait_for_timeout(300)
    check('Jewel-Osco' in where_text() and winner() == 'Amex Blue Cash Preferred', 'tapping the store next door answers for it')

    # 2. Location on: opening the app looks right away, even with a store from ten minutes ago.
    old = {'merchant': 'jewel-osco', 'category': None, 'customName': '', 'located': True, 'at': int(time.time() * 1000) - 10 * MINUTE}
    seed(state(True, old))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.here', timeout=8000)
    page.wait_for_timeout(300)
    check('Shell' in where_text(), 'on open it looks again and finds Shell instead of the store from ten minutes ago')
    check(page.evaluate('document.getElementById("amount") !== document.activeElement'), 'the keyboard stays down when the store is found on its own')

    # 3. A place you have been before answers from this phone, with no map lookup.
    del asked[:]
    t0 = time.time()
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.here', timeout=8000)
    took = time.time() - t0
    check('Shell' in where_text() and not asked, 'a return visit answers from this phone without asking the map')
    check(took < 2.0, 'a return visit answers in under 2 seconds (took %.1f)' % took)

    # 4. A store picked by hand a minute ago is kept: no lookup over a choice just made.
    picked = {'merchant': 'walmart', 'category': None, 'customName': '', 'located': False, 'at': int(time.time() * 1000) - MINUTE}
    open_with(state(True, picked))
    page.wait_for_timeout(800)
    check('Walmart' in where_text() and "You’re at" not in where_text(), 'a store picked by hand a minute ago stays put')

    # 5. Coming back to the app a few minutes later somewhere else looks again, and the old amount is cleared.
    open_with(state(True))
    page.wait_for_selector('.where-chip.here', timeout=8000)
    page.fill('#amount', '45')
    page.wait_for_timeout(200)
    ctx.set_geolocation(THERE)
    page.evaluate("""() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      const real = Date.now.bind(Date); Date.now = () => real() + 5 * 60 * 1000;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    page.wait_for_function('(document.querySelector(".where-chip.here b") || {}).textContent === "Jewel-Osco"', timeout=8000)
    check(page.input_value('#amount') == '', 'the amount from the last store is cleared at the new one')
    check(winner() == 'Amex Blue Cash Preferred', 'it answers for the new store')
    ctx.set_geolocation(HERE)

    # 6. The place index answers first; the Overpass servers can all be down or slow.
    mode.update(photon='ok', de='fail', coffee='hang', kumi='hang')
    del asked[:]
    seed(state(True))
    t0 = time.time()
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.here', timeout=8000)
    took = time.time() - t0
    release_held()
    check('Shell' in where_text() and winner() == 'Costco Anywhere Visa' and took < 3.0, 'with the main map server at capacity, the place index answers in seconds (took %.1f)' % took)
    page.click('.nearby button:has-text("Jewel-Osco")')
    page.wait_for_timeout(300)
    check('Jewel-Osco' in where_text(), 'the store next door came from the place index too')

    # 6b. Three services are asked at once; when the index is down and one server fails, another answers.
    mode.update(photon='fail', de='fail', coffee='ok', kumi='ok')
    del asked[:]
    open_with(state(True))
    page.wait_for_selector('.where-chip.here', timeout=8000)
    check('Shell' in where_text() and sorted(asked[:3]) == ['coffee', 'de', 'photon'], 'three services are asked at once, and when two fail the third answers')

    # 7. One hangs: the other's answer is used within seconds.
    mode.update(photon='fail', de='hang', coffee='ok', kumi='ok')
    del asked[:]
    seed(state(True))
    t0 = time.time()
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.here', timeout=8000)
    took = time.time() - t0
    release_held()
    check('Shell' in where_text() and took < 4.0, 'when one map server hangs, another answers within seconds (took %.1f)' % took)

    # 8. The first two servers fail: the third is asked at once and answers.
    mode.update(photon='fail', de='fail', coffee='fail', kumi='ok')
    del asked[:]
    open_with(state(True))
    page.wait_for_selector('.where-chip.here', timeout=8000)
    check('Shell' in where_text() and 'kumi' in asked, 'when two map servers fail, the third answers')

    # 9. A busy server's "timed out" answer is not taken as "no stores here".
    mode.update(photon='fail', de='busy', coffee='ok', kumi='ok')
    open_with(state(True))
    page.wait_for_selector('.where-chip.here', timeout=8000)
    check('Shell' in where_text(), 'a busy server\'s empty "timed out" answer is skipped and the real answer is used')
    all_modes('busy')
    open_with(state(True))
    page.wait_for_selector('.toast:has-text("did not answer")', timeout=8000)
    saved = page.evaluate('JSON.parse(localStorage.getItem("whichcard.places.v2") || "{\\"spots\\":[]}").spots.length')
    check(saved == 0, 'when every server is busy, it says the map did not answer and saves nothing')

    # 9b. Real empty answers: an early empty one does not end the search, and when all are empty it says so at once.
    mode.update(photon='empty', de='hang', coffee='ok', kumi='ok')
    seed(state(True))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.here', timeout=8000)
    release_held()
    check('Shell' in where_text(), 'an empty answer from one service does not end the search; a later full one is used')
    all_modes('empty')
    seed(state(True))
    t0 = time.time()
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.toast:has-text("No store found")', timeout=8000)
    took = time.time() - t0
    check(took < 5, 'when every service answers with nothing, it says no store was found at once (took %.1f)' % took)

    # 10. All four fail: the app says so at once and the last store comes back.
    all_modes('fail')
    old = {'merchant': 'chipotle', 'category': None, 'customName': '', 'located': True, 'at': int(time.time() * 1000) - 5 * MINUTE}
    open_with(state(True, old))
    page.wait_for_timeout(600)
    check('Chipotle' in where_text(), 'when every map server fails, the last store comes back')

    # 11. All hang: after 8 seconds it says the map is slow and keeps looking; after 60 it gives up.
    all_modes('hang')
    seed(state(True))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.finding', timeout=5000)
    t0 = time.time()
    page.wait_for_selector('.where-chip.finding:has-text("map is slow")', timeout=15000)
    slow = time.time() - t0
    page.click('.tabs button[data-view="more"]')
    note = page.locator('.lookup-note').inner_text() if page.locator('.lookup-note').count() else ''
    check('Position in' in note and 'asked' in note and 'Not finished' in note, 'while it looks, More already shows the lookup so far: %s' % note[:140])
    page.click('.tabs button[data-view="pay"]')
    page.wait_for_selector('.toast:has-text("did not answer")', timeout=70000)
    took = time.time() - t0
    release_held()
    check(6 < slow < 10, 'after about 8 seconds it says the map is slow and keeps looking (took %.1f)' % slow)
    check(56 < took < 64 and page.locator('#store-search').count() == 1, 'after about 60 seconds it gives up and shows the store search (took %.1f)' % took)

    # 12. "Pick it" stops the lookup and opens the store search; a late answer is ignored.
    all_modes('hang')
    seed(state(True))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.finding', timeout=8000)
    check(page.locator('.answer-wait').count() == 1, 'while it looks, the answer waits instead of guessing')
    page.screenshot(path=os.path.join(OUT, 'loc-3-finding.png'))
    page.click('.where-chip.finding .change')
    page.wait_for_timeout(300)
    for route in held:
        try:
            route.fulfill(status=200, content_type='application/json', body=ANSWER)
        except Exception:
            pass
    del held[:]
    page.wait_for_timeout(800)
    check(page.locator('#store-search').count() == 1 and not page.locator('.where-chip.here').count(), '"Pick it" stops the lookup and shows the store search')

    # 13. More shows the last lookup; turning location off forgets the stores this phone remembered.
    all_modes('ok')
    open_with(state(True))
    page.wait_for_selector('.where-chip.here', timeout=8000)
    kept = page.evaluate('!!localStorage.getItem("whichcard.places.v2")')
    page.click('.tabs button[data-view="more"]')
    note = page.locator('.lookup-note').inner_text() if page.locator('.lookup-note').count() else ''
    check('Found Shell' in note and 'Position in' in note and ('places' in note or 'saved on an earlier visit' in note), 'More shows the last lookup: %s' % note[:160])
    page.screenshot(path=os.path.join(OUT, 'loc-4-more.png'))
    page.click('button[aria-label="Use location"]')
    page.wait_for_timeout(200)
    gone = page.evaluate('!localStorage.getItem("whichcard.places.v2") && !localStorage.getItem("whichcard.lookup.v1")')
    check(kept and gone, 'stores found nearby are kept on the phone, and turning location off forgets them')

    # 14. Only a rough fix (cell towers, 400 meters): it waits a few seconds for better, then answers anyway.
    ctx.set_geolocation(dict(HERE, accuracy=400))
    seed(state(True))
    t0 = time.time()
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.here', timeout=10000)
    took = time.time() - t0
    check(3.5 < took < 7, 'a rough fix waits about 4 seconds for a better one, then answers (took %.1f)' % took)
    ctx.set_geolocation(HERE)

    # 14b. Across the street from the nearest store: not sure, so the stores near you are offered to tap.
    all_modes('ok')
    ctx.set_geolocation(ACROSS)
    open_with(state(True))
    page.wait_for_selector('.near-label', timeout=8000)
    chips = page.locator('.picker .nearby button')
    first = chips.first.inner_text().replace('\n', ' ') if chips.count() else ''
    check(not page.locator('.where-chip.here').count() and 'Tap the one' in page.locator('.near-label').inner_text() and first.startswith('Jewel-Osco') and 'ft' in first,
          'across the street it does not claim a store; it offers the ones near you, closest first (%s)' % first)
    check(page.locator('.winner').count() == 1 and 'For everything else' in page.locator('.winner').inner_text(), 'until you pick one, the answer is the everything-else card')
    page.screenshot(path=os.path.join(OUT, 'loc-6-near.png'))
    chips.first.click()
    page.wait_for_timeout(300)
    check('Jewel-Osco' in where_text() and "You’re at" in where_text() and winner() == 'Amex Blue Cash Preferred', 'tapping a store near you makes it the store')

    # 14c. Inside a big store, far from its center: sure, because the position is inside its footprint.
    ctx.set_geolocation(AT_COSTCO_DOOR)
    open_with(state(True))
    page.wait_for_selector('.where-chip.here', timeout=8000)
    check('Costco' in where_text(), 'inside a big store, 130 m from its center, it still says you are at it (footprint)')
    page.click('.tabs button[data-view="more"]')
    note = page.locator('.lookup-note').inner_text() if page.locator('.lookup-note').count() else ''
    check('Found Costco' in note, 'the lookup note says so: %s' % note[-60:])
    ctx.set_geolocation(HERE)

    # 14d. A place the map does not know: pick its kind, name it, and the spot is remembered.
    all_modes('ok')
    ctx.set_geolocation(ACROSS)
    open_with(state(True))
    page.wait_for_selector('.near-label', timeout=8000)
    page.click('.quick button:has-text("Dining")')
    page.wait_for_selector('.note.remember', timeout=3000)
    check('Remember this spot' in page.locator('.note.remember').inner_text(), 'a store picked by hand, with the phone placed, offers to remember the spot')
    page.fill('.note.remember input', "Norman's")
    page.click('.note.remember button:has-text("Remember")')
    page.wait_for_timeout(400)
    check("You’re at" in where_text() and "Norman" in where_text() and 'Dining' in where_text(), 'once remembered it says you are at it, by name: %s' % where_text()[:60])
    page.screenshot(path=os.path.join(OUT, 'loc-7-remembered.png'))
    # Back at the same spot later, with every map service down, it still knows.
    all_modes('fail')
    seed(dict(state(True), myPlaces=page.evaluate('JSON.parse(localStorage.getItem("whichcard.state.v1")).myPlaces')))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.here', timeout=8000)
    check("Norman" in where_text() and winner() == 'Costco Anywhere Visa', 'back at that spot it says you are at it, even with the map down, and answers for dining')
    page.click('.tabs button[data-view="more"]')
    check(page.locator('.my-places li', has_text="Norman's").count() == 1, 'More lists the spot you remembered')
    page.click('.my-places button[aria-label="Forget Norman\'s"]')
    page.wait_for_timeout(200)
    check(page.locator('.my-places').count() == 0, 'and can forget it')
    all_modes('ok')
    ctx.set_geolocation(HERE)

    # 15. The location test under More runs each step on the phone and reports it.
    all_modes('ok')
    mode.update(de='fail')
    open_with(state(True))
    page.wait_for_selector('.where-chip.here', timeout=8000)
    page.click('.tabs button[data-view="more"]')
    page.click('button:has-text("Test location on this phone")')
    page.wait_for_selector('.test-lines p:has-text("Done.")', timeout=60000)
    report = page.locator('.test-lines').inner_text()
    check('Permission: granted' in report and 'Position in' in report and 'photon.komoot.io: 3 places' in report and 'overpass-api.de: error 502' in report
          and 'at capacity' in report and 'overpass.private.coffee: 4 places' in report and 'Shell (1 m)' in report and 'Sure enough' in report,
          'the location test reports the permission, the position and each map service: ' + report.replace(chr(10), ' | ')[:700])
    page.screenshot(path=os.path.join(OUT, 'loc-5-test.png'))
    page.click('.sheet .close')
    mode.update(de='ok')

    # 16. A rough first fix 80 meters off, then a precise one: answered again from the same list, no second lookup.
    OFF = {'latitude': 41.87932, 'longitude': -87.63590, 'accuracy': 120}
    ctx.set_geolocation(OFF)
    del asked[:]
    seed(state(True))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.here', timeout=8000)
    first = len(asked)
    ctx.set_geolocation(HERE)
    page.wait_for_timeout(2500)
    check(len(asked) == first and 'Shell' in where_text(), 'a better fix inside the searched area answers again without a second lookup (%d then %d requests, at %s)' % (first, len(asked), where_text()[:40]))
    ctx.set_geolocation(HERE)

    browser.close()

server.shutdown()
check(not errors, 'no console errors' + (': ' + '; '.join(errors[:3]) if errors else ''))
if failures:
    sys.exit(1)
print('all location checks passed')
