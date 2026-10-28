"""Opening the app at a store: with location on, it says where you are standing and answers for that store.
The phone's position and the OpenStreetMap lookup are both faked, so this runs anywhere.
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

HERE = {'latitude': 41.98002, 'longitude': -88.30002}
SHELL = {'type': 'node', 'lat': 41.98, 'lon': -88.30, 'tags': {'name': 'Shell', 'brand': 'Shell', 'amenity': 'fuel'}}
JEWEL = {'type': 'way', 'center': {'lat': 41.9806, 'lon': -88.3004}, 'tags': {'name': 'Jewel-Osco', 'shop': 'supermarket'}}
JEWEL_CLOSE = {'type': 'way', 'center': {'lat': 41.98002, 'lon': -88.30001}, 'tags': {'name': 'Jewel-Osco', 'shop': 'supermarket'}}
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
    places = {'elements': [SHELL, JEWEL], 'fail': False}

    def overpass(route):
        if places['fail']:
            route.fulfill(status=504, body='busy')
        else:
            time.sleep(0.3)
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'elements': places['elements']}))
    ctx.route('https://overpass-api.de/**', overpass)
    page = ctx.new_page()
    # The failed lookup in check 5 is on purpose; the browser logs its 504.
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'fonts.g' not in m.text and 'status of 504' not in m.text else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    def open_with(s, path=''):
        # Seed the storage from a page that does not run the app, so an earlier lookup cannot write over it.
        page.goto(BASE + 'README.md', wait_until='domcontentloaded')
        page.evaluate('s => { localStorage.clear(); localStorage.setItem("whichcard.state.v1", JSON.stringify(s)); }', s)
        page.goto(BASE + path, wait_until='networkidle')
        page.wait_for_timeout(700)

    def where_text():
        return page.locator('#where').inner_text().replace('\n', ' ')

    def winner():
        el = page.locator('.winner .name')
        return el.inner_text() if el.count() else ''

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
    page.goto(BASE + 'README.md', wait_until='domcontentloaded')
    page.evaluate('s => { localStorage.clear(); localStorage.setItem("whichcard.state.v1", JSON.stringify(s)); }', state(True, old))
    places['elements'] = [SHELL, JEWEL]
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.finding, .where-chip.here', timeout=5000)
    saw_finding = page.locator('.where-chip.finding').count() > 0
    if saw_finding:
        page.screenshot(path=os.path.join(OUT, 'loc-3-finding.png'))
    page.wait_for_selector('.where-chip.here', timeout=8000)
    page.wait_for_timeout(300)
    check('Shell' in where_text(), 'on open it looks again and finds Shell instead of the store from ten minutes ago')
    check(page.evaluate('document.getElementById("amount") !== document.activeElement'), 'the keyboard stays down when the store is found on its own')

    # 3. A store picked by hand a minute ago is kept: no lookup over a choice just made.
    picked = {'merchant': 'walmart', 'category': None, 'customName': '', 'located': False, 'at': int(time.time() * 1000) - MINUTE}
    open_with(state(True, picked))
    page.wait_for_timeout(800)
    check('Walmart' in where_text() and "You’re at" not in where_text(), 'a store picked by hand a minute ago stays put')

    # 4. Coming back to the app after a few minutes away looks again, and a new store clears the old amount.
    open_with(state(True))
    page.wait_for_selector('.where-chip.here', timeout=8000)
    page.fill('#amount', '45')
    page.wait_for_timeout(200)
    places['elements'] = [SHELL, JEWEL_CLOSE]
    page.evaluate("""() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      const real = Date.now.bind(Date); Date.now = () => real() + 5 * 60 * 1000;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    page.wait_for_function('document.querySelector(".where-chip.here") && document.querySelector("#where").innerText.includes("Jewel-Osco")', timeout=8000)
    check(page.input_value('#amount') == '', 'the amount from the last store is cleared at the new one')
    check(winner() == 'Amex Blue Cash Preferred', 'it answers for the new store')

    # 5. The lookup fails: the last store comes back and the app says why.
    places['fail'] = True
    old = {'merchant': 'chipotle', 'category': None, 'customName': '', 'located': True, 'at': int(time.time() * 1000) - 5 * MINUTE}
    open_with(state(True, old))
    page.wait_for_timeout(1200)
    check('Chipotle' in where_text(), 'when the lookup fails, the last store comes back')
    places['fail'] = False

    # 6. "Pick it" stops the lookup and opens the store search; the late answer is ignored.
    held = []
    ctx.unroute('https://overpass-api.de/**')
    ctx.route('https://overpass-api.de/**', lambda route: held.append(route))
    page.goto(BASE + 'README.md', wait_until='domcontentloaded')
    page.evaluate('s => { localStorage.clear(); localStorage.setItem("whichcard.state.v1", JSON.stringify(s)); }', state(True))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.where-chip.finding', timeout=8000)
    check(page.locator('.answer-wait').count() == 1, 'while it looks, the answer waits instead of guessing')
    page.screenshot(path=os.path.join(OUT, 'loc-3-finding.png'))
    page.click('.where-chip.finding .change')
    page.wait_for_timeout(300)
    for route in held:
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'elements': [SHELL]}))
    page.wait_for_timeout(800)
    check(page.locator('#store-search').count() == 1 and not page.locator('.where-chip.here').count(), '"Pick it" stops the lookup and shows the store search')

    browser.close()

server.shutdown()
check(not errors, 'no console errors' + (': ' + '; '.join(errors[:3]) if errors else ''))
if failures:
    sys.exit(1)
print('all location checks passed')
