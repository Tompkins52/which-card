"""Scan a card: a photo of a card, read on the phone by the bundled reader, becomes the right card.
Runs the real reader in a headless browser (the first run takes a while). Run from the repo root:
python3 tests/scan_check.py"""
import functools
import http.server
import os
import socketserver
import sys
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
FIX = os.path.join(ROOT, 'tests', 'fixtures')


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
BASE = 'http://127.0.0.1:%d/' % srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
fails, errors, outside = [], [], []


def check(ok, what):
    print(('ok    ' if ok else 'FAIL  ') + what)
    if not ok:
        fails.append(what)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    # Nothing may leave the phone while scanning: every request must be to the app's own server.
    page.on('request', lambda r: outside.append(r.url) if not (r.url.startswith(BASE) or r.url.startswith('blob:') or r.url.startswith('data:')) else None)
    page.goto(BASE + 'icons/icon-192.png')
    page.evaluate("localStorage.clear(); localStorage.setItem('whichcard.state.v1', JSON.stringify({wallet: [], customCards: [], disclaimed: true, onboarded: true, locationAsked: true, prefs: {priority: 'cash', payMethod: 'card', redeem: {}, location: false}}))")
    page.goto(BASE, wait_until='networkidle')
    page.click('.tabs button[data-view=wallet]')
    page.click('button:has-text("Add a card")')
    page.wait_for_selector('.sheet')
    check(page.locator('.sheet .scan-btn').count() == 1, 'Add a card offers Scan a card with the camera')
    with page.expect_file_chooser() as fc:
        page.click('.sheet .scan-btn')
    chooser = fc.value
    check(chooser.element.get_attribute('accept') == 'image/*' and chooser.element.get_attribute('capture') == 'environment', 'the button opens the back camera for a photo')
    t0 = time.time()
    chooser.set_files(os.path.join(FIX, 'card-sapphire.jpg'))
    page.wait_for_selector('.scan .card-row, .scan .note', timeout=180000)
    took = time.time() - t0
    rows = page.locator('.scan .card-row b').all_inner_texts()
    check(rows and rows[0] == 'Chase Sapphire Preferred', 'a photo of a Sapphire Preferred is read as one (took %.1f s, first time): %s' % (took, ', '.join(rows)))
    page.click('.scan .card-row >> nth=0')
    page.wait_for_timeout(300)
    check(page.evaluate("JSON.parse(localStorage.getItem('whichcard.state.v1')).wallet.map(e => e.cardId)") == ['chase-sapphire-preferred'], 'one tap adds it to the wallet')
    # Second card, same sheet, reader already loaded
    with page.expect_file_chooser() as fc:
        page.click('.sheet .scan-btn')
    t0 = time.time()
    fc.value.set_files(os.path.join(FIX, 'card-costco.jpg'))
    page.wait_for_selector('.scan .card-row, .scan .note', timeout=120000)
    took = time.time() - t0
    rows = page.locator('.scan .card-row b').all_inner_texts()
    check(rows and rows[0] == 'Costco Anywhere Visa', 'a second photo reads at once (took %.1f s): %s' % (took, ', '.join(rows)))
    check(took < 15, 'reading a card takes seconds, not minutes')
    check(not outside, 'nothing left the phone while scanning' + (': ' + outside[0] if outside else ''))
    check('photo stayed on this phone' in page.locator('.scan').inner_text(), 'it says the photo stayed on the phone')
    browser.close()

srv.shutdown()
check(not errors, 'no console errors' + (': ' + errors[0][:160] if errors else ''))
if fails:
    sys.exit(1)
print('all scan checks passed')
