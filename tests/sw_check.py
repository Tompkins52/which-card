"""Checks the service worker the way a phone meets it. Run from the repo root: python3 tests/sw_check.py

Assembles the site the way the deploy does (and stamps it), then in a headless browser:
the worker installs and caches the whole shell, the home-screen start address works offline with
the app's own font, and a new deploy replaces the whole shell at once (old cache gone, new page,
new styles, no mix of the two)."""
import functools
import http.server
import os
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SITE = tempfile.mkdtemp(prefix='wc-site-')


def assemble():
    for name in ['index.html', 'app.css', 'app.js', 'engine.js', 'sw.js', 'manifest.webmanifest']:
        shutil.copy(os.path.join(ROOT, name), SITE)
    for d in ['icons', 'data', 'fonts']:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(SITE, d), dirs_exist_ok=True)
    out = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'stamp_sw.py'), SITE], capture_output=True, text=True)
    if out.returncode:
        sys.exit(out.stdout + out.stderr)
    return out.stdout.strip().split()[-1]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'max-age=600')
        super().end_headers()


fails = []


def wait_until(page, js, timeout=15):
    """Polls a promise-returning expression until it is true (page.evaluate awaits promises)."""
    end = time.time() + timeout
    while time.time() < end:
        if page.evaluate(js):
            return True
        page.wait_for_timeout(250)
    return False


def check(ok, what):
    print(('ok    ' if ok else 'FAIL  ') + what)
    if not ok:
        fails.append(what)


first = assemble()
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=SITE))
BASE = 'http://127.0.0.1:%d/' % srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '?source=pwa', wait_until='networkidle')
    check(wait_until(page, "navigator.serviceWorker.ready.then(() => navigator.serviceWorker.controller !== null)"), 'the worker controls the page')
    keys = page.evaluate("caches.keys()")
    check(keys == [first], 'the worker installs under the stamped version (%s)' % ', '.join(keys))
    cached = page.evaluate("caches.open(%r).then(c => c.keys()).then(ks => ks.map(r => r.url.replace(location.origin, '')))" % first)
    for f in ['/', '/index.html', '/app.css', '/app.js', '/engine.js', '/fonts/archivo-wdth.woff2']:
        check(f in cached, 'cached: ' + f)

    # Offline, from the home-screen start address
    ctx.set_offline(True)
    page.goto(BASE + '?source=pwa', wait_until='load')
    page.wait_for_timeout(600)
    check(page.title() == 'Witch Card', 'offline start address opens the app (title %r)' % page.title())
    check(page.evaluate("document.fonts.check('800 20px \"Archivo WC\"')"), 'offline, the app font is there')
    page.goto(BASE + '?cat=gas', wait_until='load')
    check(page.title() == 'Witch Card', 'offline shortcut link opens the app')
    ctx.set_offline(False)

    # A new deploy: change the styles and the page, stamp again
    with open(os.path.join(SITE, 'app.css'), 'a') as f:
        f.write('\n/* deploy two */ body { outline: 0 solid rgb(1, 2, 3); }\n')
    with open(os.path.join(SITE, 'index.html'), encoding='utf-8') as f:
        html = f.read()
    with open(os.path.join(SITE, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html.replace('<title>Witch Card</title>', '<title>Witch Card</title><meta name="deploy" content="two">', 1))
    shutil.copy(os.path.join(ROOT, 'sw.js'), SITE)
    second = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'stamp_sw.py'), SITE], capture_output=True, text=True).stdout.strip().split()[-1]
    check(second != first, 'a changed shell gets a new version')
    page.goto(BASE + '?source=pwa', wait_until='networkidle')
    took_over = wait_until(page, "caches.keys().then(k => k.length === 1 && k[0] === %r)" % second) and \
        wait_until(page, "navigator.serviceWorker.getRegistration().then(r => r.active && r.active.state === 'activated' && !r.installing && !r.waiting)")
    check(took_over, 'the new worker took over and the old cache is gone')
    page.goto(BASE + '?source=pwa', wait_until='networkidle')
    page.wait_for_timeout(400)
    new_page = page.evaluate("!!document.querySelector('meta[name=deploy]')")
    new_css = page.evaluate("getComputedStyle(document.body).outlineColor") == 'rgb(1, 2, 3)'
    check(new_page and new_css, 'after the update, the page and its styles are both the new deploy')
    check(not errors, 'no page errors')
    browser.close()

srv.shutdown()
shutil.rmtree(SITE, ignore_errors=True)
if fails:
    sys.exit('%d service worker check(s) failed' % len(fails))
print('all service worker checks passed')
