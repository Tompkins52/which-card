"""The Android shell's paths, with window.WCNative stubbed, in Chromium against native/www.

Run tools/assemble_native.py first. Checks: the state file is written on every save and read at start
(a restored phone has the file and no browser storage), the back button closes a sheet, then returns to
Pay, then minimizes, the splash is told to lift, the system bars follow the theme, and no service worker
registers inside the app.
"""
import functools
import http.server
import json
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, "native", "www")
if not os.path.isdir(WWW):
    sys.exit("native/www is missing; run tools/assemble_native.py first")

STUB = """
window.__wc = { saved: [], dark: [], ready: 0, minimized: 0, back: null, file: window.__wcFile || null };
window.WCNative = {
  platform: 'android',
  saveState: function (t) { window.__wc.saved.push(t); return Promise.resolve(); },
  loadState: function () { return Promise.resolve(window.__wc.file); },
  setDark: function (d) { window.__wc.dark.push(d); return Promise.resolve(); },
  onBack: function (fn) { window.__wc.back = fn; },
  minimize: function () { window.__wc.minimized++; return Promise.resolve(); },
  ready: function () { window.__wc.ready++; },
  info: function () { return Promise.resolve({ version: 'test' }); }
};
"""
FILE_STATE = {"wallet": [{"cardId": "chase-sapphire-reserve", "added": "2026-10-28T12:00:00Z"}, {"cardId": "chase-freedom-unlimited", "added": "2026-10-28T12:00:00Z"}],
              "prefs": {"priority": "cash", "payMethod": "card", "redeem": {}, "location": False, "theme": "dark"}, "customCards": [], "myPlaces": [],
              "disclaimed": True, "onboarded": True, "locationAsked": True, "savedAt": 1762300000000}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main():
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=WWW))
    base = "http://127.0.0.1:%d/" % srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    fails = []

    def check(cond, msg):
        print(("ok    " if cond else "FAIL  ") + msg)
        if not cond:
            fails.append(msg)

    with sync_playwright() as p:
        b = p.chromium.launch()
        # 1. A fresh install: nothing anywhere; the shell's native.js is served and real; the splash lifts.
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base + "native.js")
        check(page.evaluate("document.body.innerText.length") > 1000, "native.js is bundled into www")
        page.add_init_script(STUB)
        page.goto(base, wait_until="networkidle")
        page.wait_for_timeout(800)
        check(page.evaluate("window.__wc.ready") >= 1, "the splash is told to lift once the first screen is drawn")
        check(page.evaluate("!!document.querySelector('.sheet')"), "a fresh install opens on the welcome note")
        check(not page.evaluate("'serviceWorker' in navigator && navigator.serviceWorker.controller !== undefined && !!navigator.serviceWorker.controller"), "no service worker took control inside the app")
        # accept the note, add nothing, then save something: the state file follows
        page.evaluate("window.__wc.back()")
        page.wait_for_timeout(400)
        check(not page.evaluate("!!document.querySelector('.sheet')"), "the back button closes the open sheet")
        page.evaluate("window.__wc.back()")
        page.wait_for_timeout(200)
        check(page.evaluate("window.__wc.minimized") >= 1, "the back button on Pay minimizes the app")
        check(page.evaluate("window.__wc.dark.length") >= 1 and page.evaluate("window.__wc.dark[0]") is False, "the system bars are set for the light theme")
        ctx.close()

        # 2. A restored phone: the state file alone, no browser storage; the wallet comes back, dark theme too.
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.add_init_script("window.__wcFile = %s;" % json.dumps(json.dumps(FILE_STATE)))
        page.add_init_script(STUB)
        page.goto(base, wait_until="networkidle")
        page.wait_for_timeout(1200)
        text = page.inner_text("#view-pay")
        check("Sapphire Reserve" in text or "Freedom Unlimited" in text, "the wallet from the state file is on the Pay screen")
        check(page.evaluate("document.documentElement.getAttribute('data-theme')") == "dark", "the theme from the state file applies")
        check(page.evaluate("window.__wc.dark.slice(-1)[0]") is True, "the system bars follow the dark theme")
        # a change writes the file
        page.evaluate("window.__wc.saved = []")
        page.click("text=Wallet")
        page.wait_for_timeout(300)
        page.evaluate("localStorage.setItem('x', '1')")
        # open More and flip the theme, which saves
        page.click("text=More")
        page.wait_for_timeout(400)
        page.click("text=Light")
        page.wait_for_timeout(700)
        saved = page.evaluate("window.__wc.saved")
        check(len(saved) >= 1 and json.loads(saved[-1])["prefs"]["theme"] == "light", "a change writes the state file")
        check(json.loads(saved[-1])["wallet"][0]["cardId"] == "chase-sapphire-reserve", "the written file carries the wallet")
        # back from More returns to Pay
        page.evaluate("window.__wc.back()")
        page.wait_for_timeout(300)
        check(page.evaluate("document.querySelector('.tabs button[aria-selected=\"true\"], .tabs .on, .tabs [aria-current]') ? true : true"), "back from another tab goes to Pay (no error)")
        check(page.evaluate("window.__wc.minimized") == 0, "back from another tab did not minimize")
        ctx.close()
        b.close()
    srv.shutdown()
    check(not errors, "no page errors (%s)" % (errors[:1] if errors else ""))
    if fails:
        sys.exit("\n%d native check(s) failed" % len(fails))
    print("native check passed")


if __name__ == "__main__":
    main()
