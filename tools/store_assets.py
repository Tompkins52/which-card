#!/usr/bin/env python3
"""Makes the Google Play listing package into store/: raw phone screens of the app with a sample wallet
standing at a store, captioned 1080x1920 screenshots, the 512 icon, the 1024x500 feature graphic, and
the listing text. Run from the repo root:

    python3 tools/store_assets.py            # everything
    python3 tools/store_assets.py raw        # just the raw screens (quick look)
"""
import base64
import functools
import http.server
import json
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'store')
RAW = os.path.join(OUT, 'raw')

# Phone: 360 x 760 CSS px at 3x = 1080 x 2280, cropped to 1080 x 1920 inside the caption frame.
W, H, SCALE = 360, 760, 3

# A downtown block with a gas station and a grocery store; the phone stands at one or the other.
HERE = {"latitude": 41.87860, "longitude": -87.63590, "accuracy": 15}
PLACES = {"elements": [
    {"type": "node", "lat": 41.87861, "lon": -87.63589, "tags": {"name": "Shell", "brand": "Shell", "amenity": "fuel"}},
    {"type": "way", "center": {"lat": 41.87920, "lon": -87.63630}, "tags": {"name": "Jewel-Osco", "shop": "supermarket"}},
]}
GROCERY = {"elements": [PLACES["elements"][1] | {"type": "node", "lat": 41.87861, "lon": -87.63589}]}
WALLET = ["chase-sapphire-reserve", "citi-costco-anywhere-visa", "amex-blue-cash-preferred",
          "chase-prime-visa", "wells-fargo-active-cash", "chase-freedom-unlimited"]
SEED = """(ids) => {
  const now = new Date(), at = now.toISOString();
  const quarter = now.getFullYear() + '-Q' + (Math.floor(now.getMonth() / 3) + 1);
  const wallet = ids.map((id) => {
    const e = { cardId: id, added: at, activated: {}, purchases: [] };
    if (id === 'chase-prime-visa') e.memberships = { 'amazon-prime': true };
    if (id === 'chase-sapphire-reserve') e.perkState = { 'apple-tv-music': { at }, 'dashpass': { at }, 'lyft-credit': { at }, 'travel-credit': { at } };
    e.activated[quarter] = true;
    return e;
  });
  const dismissed = {}; dismissed['perks:' + quarter] = true;
  localStorage.clear();
  localStorage.setItem('whichcard.state.v1', JSON.stringify({ wallet, customCards: [], trips: {}, dismissed,
    prefs: { priority: 'cash', payMethod: 'card', redeem: {}, theme: 'light', location: true, showAnywhere: true },
    disclaimed: true, onboarded: true, locationAsked: true }));
}"""

# (file, where the phone stands, what to do after the store is found, the caption)
SCREENS = [
    ('01-grocery', GROCERY, None, ('Open it at the register', 'It knows where you are standing and pulls out the card that earns the most there. Nothing to type.')),
    ('02-gas', PLACES, None, ('The rest of your wallet, ranked', 'Every card you own sits under the answer, best first, with the why.')),
    ('03-compare', PLACES, 'compare', ('Your wallet, weak to great', 'Compare grades the cards you already have at every kind of place.')),
    ('04-best', PLACES, 'best', ('Best cards for this store', 'From the whole catalog, yours marked. If you already hold the best one, it says so. Nobody pays for a spot.')),
    ('05-perks', PLACES, 'perks', ('Every perk on one screen', 'Credits, rotating categories and activation, with a switch for each and the bank’s own page.')),
    ('06-wallet', PLACES, 'wallet', ('Your cards, by name only', 'Never a number. The pictures are drawn, because nobody pays for a spot here.')),
]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return 'http://127.0.0.1:%d/' % srv.server_address[1]


def settle(page):
    page.wait_for_timeout(500)
    page.evaluate('document.fonts && document.fonts.ready')
    page.wait_for_timeout(1400)  # animations done


def raw_screens(pw, base):
    os.makedirs(RAW, exist_ok=True)
    b = pw.chromium.launch()
    for name, places, then, _ in SCREENS:
        ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=SCALE, is_mobile=True, has_touch=True,
                            color_scheme='light', geolocation=HERE, permissions=['geolocation'])
        page = ctx.new_page()
        # Later routes are checked first, so the catch-all goes in before the two answers.
        page.route(lambda url: not url.startswith(base), lambda route, request: route.abort())  # nothing else leaves the machine
        page.route('**/api/interpreter', lambda route, request, p=places: route.fulfill(status=200, content_type='application/json', body=json.dumps(p)))
        page.route('**/photon.komoot.io/**', lambda route, request: route.fulfill(status=200, content_type='application/json', body='{"features":[]}'))
        page.goto(base + 'icons/icon-192.png', wait_until='domcontentloaded')
        page.evaluate(SEED, WALLET)
        page.goto(base + 'index.html', wait_until='load')
        page.wait_for_selector('.where-chip.here', timeout=15000)
        settle(page)
        if then == 'compare':
            page.locator(".tabs button[data-view='offers']").click()
        elif then == 'best':
            page.locator('#answer button.more').first.click()
            page.wait_for_selector('.sheet .best-row', timeout=5000)
        elif then == 'perks':
            page.locator(".tabs button[data-view='wallet']").click()
            settle(page)
            page.locator('.tile', has_text='Sapphire Reserve').first.click()
            settle(page)
            page.evaluate("""() => { const item = [...document.querySelectorAll('.perk-list > *')].find((e) => e.textContent.includes('Apple TV')); if (item) item.scrollIntoView({block: 'center'}); }""")
        elif then == 'wallet':
            page.locator(".tabs button[data-view='wallet']").click()
        settle(page)
        page.screenshot(path=os.path.join(RAW, name + '.png'))
        print('store/raw/%s.png' % name)
        ctx.close()
    b.close()


def font_css():
    # The font goes in as a data URL: the graphics are set_content pages, and the local server sends no CORS header.
    with open(os.path.join(ROOT, 'fonts', 'archivo-wdth.woff2'), 'rb') as f:
        css = "@font-face { font-family: 'Archivo'; src: url('data:font/woff2;base64,%s') format('woff2-variations'); font-weight: 100 900; font-stretch: 62%% 125%%; }\n" % base64.b64encode(f.read()).decode('ascii')
    return css + "* { box-sizing: border-box; } body { margin: 0; font-family: 'Archivo', sans-serif; -webkit-font-smoothing: antialiased; }\n"


def data_url(path):
    with open(path, 'rb') as f:
        return 'data:image/%s;base64,%s' % ('webp' if path.endswith('.webp') else 'png', base64.b64encode(f.read()).decode('ascii'))


def shoot(b, html, w, h, path):
    page = b.new_page(viewport={'width': w, 'height': h})
    page.set_content(html, wait_until='load')
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(300)
    page.screenshot(path=path, clip={'x': 0, 'y': 0, 'width': w, 'height': h})
    page.close()
    print(os.path.relpath(path, ROOT))


SKY = 'linear-gradient(170deg, #2C1647 0%, #1D0F34 55%, #241238 100%)'
STARS = ''.join('<i style="left:%d%%;top:%d%%;transform:scale(%.2f)"></i>' % (x, y, s) for x, y, s in
                [(8, 6, .8), (22, 14, .5), (37, 4, 1), (55, 10, .6), (70, 3, .9), (86, 9, .5), (94, 18, .8), (14, 24, .6), (48, 20, .5), (78, 26, 1), (5, 40, .7), (92, 44, .6)])


def captioned(b):
    """1080 x 1920: the night-sky band with the caption, the phone below it, cropped at the bottom."""
    out = os.path.join(OUT, 'screenshots')
    os.makedirs(out, exist_ok=True)
    for name, _, _, (head, sub) in SCREENS:
        img = data_url(os.path.join(RAW, name + '.png'))
        html = '<html><head><style>' + font_css() + """
          body { width: 1080px; height: 1920px; background: @SKY; position: relative; overflow: hidden; color: #F3F1F6; }
          i { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: #FFE9B8; opacity: .6; }
          .cap { position: absolute; left: 80px; right: 80px; top: 104px; }
          h1 { margin: 0; font-size: 78px; line-height: 1.04; font-weight: 800; font-stretch: 104%; letter-spacing: -0.02em; }
          p { margin: 28px 0 0; font-size: 36px; line-height: 1.35; font-weight: 500; color: rgba(243,241,246,0.82); }
          .phone { position: absolute; left: 90px; top: 540px; width: 900px; height: 1700px; border-radius: 66px; background: #121114; padding: 18px; box-shadow: 0 40px 120px rgba(0,0,0,0.5); }
          .phone img { width: 864px; height: 1824px; border-radius: 50px; display: block; object-fit: cover; object-position: top; }
        </style></head><body>@STARS
          <div class="cap"><h1>@HEAD</h1><p>@SUB</p></div>
          <div class="phone"><img src="@IMG"></div>
        </body></html>""".replace('@SKY', SKY).replace('@STARS', STARS).replace('@HEAD', head).replace('@SUB', sub).replace('@IMG', img)
        shoot(b, html, 1080, 1920, os.path.join(out, name + '.png'))


def icon_and_feature(b):
    from PIL import Image
    Image.open(os.path.join(ROOT, 'native', 'assets', 'icon-only.png')).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-512.png'))
    print('store/icon-512.png')
    witch = data_url(os.path.join(ROOT, 'img', 'witch-fly.webp'))
    shot = data_url(os.path.join(RAW, '01-grocery.png'))
    html = '<html><head><style>' + font_css() + """
      body { width: 1024px; height: 500px; background: @SKY; position: relative; overflow: hidden; color: #F3F1F6; }
      i { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #FFE9B8; opacity: .6; }
      .moon { position: absolute; left: 610px; top: 36px; width: 130px; height: 130px; border-radius: 50%; background: radial-gradient(circle at 36% 30%, #FFD67E, #FDBD4C 58%, #EDA32C); box-shadow: 0 0 60px rgba(253,189,76,.35); }
      .witch { position: absolute; left: 560px; top: 120px; width: 210px; }
      .name { position: absolute; left: 56px; top: 118px; font-size: 84px; font-weight: 820; font-stretch: 106%; letter-spacing: -0.025em; line-height: 1; }
      .tag { position: absolute; left: 58px; top: 232px; font-size: 30px; font-weight: 500; color: rgba(243,241,246,0.84); line-height: 1.3; width: 440px; }
      .phone { position: absolute; right: 36px; top: 60px; width: 220px; height: 486px; border-radius: 30px; background: #121114; padding: 9px; box-shadow: 0 30px 80px rgba(0,0,0,0.5); transform: rotate(-5deg); }
      .phone img { width: 202px; height: 468px; border-radius: 22px; display: block; object-fit: cover; object-position: top; }
    </style></head><body>@STARS
      <div class="moon"></div><img class="witch" src="@WITCH">
      <div class="name">Witch Card</div>
      <div class="tag">Which of your cards to use, where you are standing.</div>
      <div class="phone"><img src="@SHOT"></div>
    </body></html>""".replace('@SKY', SKY).replace('@STARS', STARS).replace('@WITCH', witch).replace('@SHOT', shot)
    path = os.path.join(OUT, 'feature-graphic-1024x500.png')
    shoot(b, html, 1024, 500, path)
    Image.open(path).convert('RGB').save(path)  # Play wants no alpha channel


if __name__ == '__main__':
    base = serve()
    with sync_playwright() as pw:
        raw_screens(pw, base)
        if 'raw' in sys.argv:
            sys.exit(0)
        b = pw.chromium.launch()
        captioned(b)
        icon_and_feature(b)
        b.close()
