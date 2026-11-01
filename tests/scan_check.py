"""Scan a card: point the camera at a card and the bundled reader, on the phone, names it.
Runs the real reader in a headless browser against a pretend camera that shows a test picture
(tests/fixtures, drawn by make_cards.py): a silver card with light letters on a speckled stone
counter, which the first reader could not read, and a gold card with dark letters. Also the photo
route, no camera at all, and closing the sheet mid-scan. The first run takes a while.
Run from the repo root: python3 tests/scan_check.py"""
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

# A pretend back camera: a canvas showing window.__fakeCam, streamed like a camera. No picture set
# means no camera on this device.
FAKE_CAMERA = """
(() => {
  window.__camOpen = 0; window.__camStopped = 0; window.__fakeCam = null;
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.getUserMedia = async () => {
    if (!window.__fakeCam) throw new DOMException('No camera here', 'NotFoundError');
    const img = new Image(); img.src = window.__fakeCam; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext('2d');
    const stream = cv.captureStream(15);
    const draw = () => { if (!stream.active) return; g.drawImage(img, 0, 0); requestAnimationFrame(draw); };
    draw();
    window.__camOpen++;
    stream.getTracks().forEach((t) => { const stop = t.stop.bind(t); t.stop = () => { window.__camStopped++; stop(); }; });
    return stream;
  };
})();
"""


def check(ok, what):
    print(('ok    ' if ok else 'FAIL  ') + what)
    if not ok:
        fails.append(what)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    ctx.add_init_script(FAKE_CAMERA)
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

    def wallet():
        return page.evaluate("JSON.parse(localStorage.getItem('whichcard.state.v1')).wallet.map(e => e.cardId)")

    def scan_live(picture, timeout=180000):
        page.evaluate('p => { window.__fakeCam = p; }', picture)
        t0 = time.time()
        page.click('.sheet .scan-btn')
        page.wait_for_selector('.scan .card-row, .scan .note', timeout=timeout)
        return time.time() - t0, page.locator('.scan .card-row b').all_inner_texts()

    # 1. The silver card with light letters, held in the frame: read live, first time (reader loads).
    page.evaluate("window.__fakeCam = 'tests/fixtures/cam-silver.jpg'")
    page.click('.sheet .scan-btn')
    page.wait_for_selector('.scan .cam video', timeout=10000)
    check(page.locator('.scan .cam-frame').count() == 1 and ('inside the frame' in page.inner_text('.scan') or 'reader ready' in page.inner_text('.scan')), 'the camera opens in the sheet with a card-shaped frame to hold the card in')
    t0 = time.time()
    page.wait_for_selector('.scan .card-row, .scan .note', timeout=180000)
    rows = page.locator('.scan .card-row b').all_inner_texts()
    check(rows[:1] == ['United Gateway'], 'a silver card with light letters is read live as the United Gateway (%.1f s, first time): %s' % (time.time() - t0, ', '.join(rows)))
    check(page.evaluate('window.__camStopped >= 1') and page.locator('.scan video').count() == 0, 'the camera turns off as soon as the card is read')
    page.click('.scan .card-row >> nth=0')
    page.wait_for_timeout(300)
    check(wallet() == ['chase-united-gateway'], 'one tap adds it to the wallet')

    # 2. A gold card with dark letters on a wood table, reader already loaded.
    took, rows = scan_live('tests/fixtures/cam-gold.jpg', 60000)
    check(rows[:1] == ['Amex Gold'], 'a gold card with dark letters is read too (%.1f s): %s' % (took, ', '.join(rows)))
    check(took < 15, 'reading a card takes seconds, not minutes')

    # 3. The photo route: a phone photo with the card small on a speckled counter.
    page.evaluate("window.__fakeCam = 'tests/fixtures/cam-silver.jpg'")
    page.click('.sheet .scan-btn')
    page.wait_for_selector('.scan .cam video', timeout=10000)
    with page.expect_file_chooser() as fc:
        page.click('.scan button:has-text("Take a photo instead")')
    check(fc.value.element.get_attribute('capture') == 'environment', '"Take a photo instead" opens the camera app for a photo')
    t0 = time.time()
    fc.value.set_files(os.path.join(FIX, 'card-silver-counter.jpg'))
    page.wait_for_selector('.scan .card-row, .scan .note', timeout=60000)
    rows = page.locator('.scan .card-row b').all_inner_texts()
    check(rows == ['United Gateway'], 'a photo of that card small on a stone counter is read, and only it is offered when it is clearly that card (%.1f s): %s' % (time.time() - t0, ', '.join(rows)))
    check('photo stayed on this phone' in page.locator('.scan').inner_text(), 'it says the photo stayed on the phone')

    # 4. No camera on the device: it says so and offers a photo.
    page.evaluate('window.__fakeCam = null')
    page.click('.sheet .scan-btn')
    page.wait_for_selector('.scan .note', timeout=10000)
    check('Could not open the camera' in page.inner_text('.scan') and page.locator('.scan button:has-text("Take a photo instead")').count() == 1, 'with no camera it says so and offers a photo instead')
    with page.expect_file_chooser() as fc:
        page.click('.scan button:has-text("Take a photo instead")')
    fc.value.set_files(os.path.join(FIX, 'card-sapphire.jpg'))
    page.wait_for_selector('.scan .card-row, .scan .note', timeout=60000)
    rows = page.locator('.scan .card-row b').all_inner_texts()
    check(rows[:1] == ['Chase Sapphire Preferred'], 'a photo of a Sapphire Preferred is still read as one: %s' % ', '.join(rows))

    # 5. Closing the sheet mid-scan turns the camera off.
    page.evaluate("window.__fakeCam = 'icons/icon-512.png'")
    before = page.evaluate('window.__camStopped')
    page.click('.sheet .scan-btn')
    page.wait_for_selector('.scan .cam video', timeout=10000)
    page.wait_for_timeout(800)
    page.click('.sheet .close')
    page.wait_for_timeout(300)
    check(page.evaluate('window.__camStopped') > before, 'closing the sheet while it looks turns the camera off')

    check(not outside, 'nothing left the phone while scanning' + (': ' + outside[0] if outside else ''))
    browser.close()

srv.shutdown()
check(not errors, 'no console errors' + (': ' + errors[0][:160] if errors else ''))
if fails:
    sys.exit(1)
print('all scan checks passed')
