"""Draws the app icons. Run from the repo root: python3 tools/make_icons.py

The main icon is an SVG, a marigold card wearing a witch hat on a plum tile, rendered by the
headless browser the tests use (Playwright). The shortcut icons are drawn with Pillow."""
from PIL import Image, ImageDraw
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(ROOT, exist_ok=True)
# Witch Card's own colors: a plum tile, a marigold card, an ink witch hat with a lavender band.
PLUM_TOP = (88, 44, 132)
PLUM = (42, 22, 64)
INK = (30, 19, 40)
MARIGOLD = (246, 166, 35)
CREAM = (255, 236, 186)
WHITE = (255, 255, 255)
LAVENDER = (246, 239, 252)


def icon_svg(maskable=False):
    """The icon at 512 units. The maskable version fills the square and keeps the art inside the safe circle."""
    tile = '<rect width="512" height="512" fill="url(#tg)"/>' if maskable else '<rect width="512" height="512" rx="112" fill="url(#tg)"/>'
    scale = 0.86 if maskable else 1.0
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
        '<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5C2E8A"/><stop offset="1" stop-color="#2A1640"/></linearGradient>'
        '<linearGradient id="ih" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3C2459"/><stop offset="1" stop-color="#140B1C"/></linearGradient></defs>'
        + tile +
        '<g transform="translate(256 256) scale(%s) translate(-256 -256)"><g transform="rotate(-10 250 300)">' % scale +
        # the card, tilted as if just pulled out, with its shadow, chip, tap mark and a stripe
        '<rect x="96" y="210" width="316" height="198" rx="26" fill="#000" opacity=".28" transform="translate(8 16)"/>'
        '<rect x="96" y="210" width="316" height="198" rx="26" fill="#F6A623"/>'
        '<rect x="128" y="276" width="62" height="48" rx="9" fill="#FFECBA"/>'
        '<g fill="none" stroke="#1E1328" stroke-width="9" stroke-linecap="round" transform="translate(212 300)">'
        '<path d="M0-16a22 22 0 0 1 0 32"/><path d="M14-28a38 38 0 0 1 0 56"/><path d="M28-40a54 54 0 0 1 0 80"/></g>'
        '<rect x="128" y="358" width="140" height="16" rx="8" fill="#D6880A"/>'
        # the witch hat
        '<path d="M118 214 Q 150 120 186 52 Q 214 4 276 30 Q 284 36 270 40 Q 236 36 222 76 Q 206 140 246 214 Z" fill="url(#ih)" stroke="#B994EE" stroke-width="5" stroke-linejoin="round"/>'
        '<path d="M124 190 Q 182 202 240 190 L 232 164 Q 182 175 134 164 Z" fill="#B994EE"/>'
        '<ellipse cx="182" cy="214" rx="112" ry="22" fill="url(#ih)" stroke="#B994EE" stroke-width="5"/>'
        '</g></g></svg>')


def render_icons(jobs):
    """jobs: (file name, size, maskable, opaque). Renders each with headless Chromium."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={'width': 512, 'height': 512})
        for name, size, maskable, opaque in jobs:
            svg = icon_svg(maskable).replace('width="512" height="512"', 'width="%d" height="%d"' % (size, size), 1)
            bg = '#2A1640' if opaque else 'transparent'
            page.set_content('<html><body style="margin:0;background:%s">%s</body></html>' % (bg, svg))
            page.screenshot(path=os.path.join(ROOT, name), clip={'x': 0, 'y': 0, 'width': size, 'height': size}, omit_background=not opaque)
        browser.close()


def plum_tile(s, rounded=True):
    """A plum square, lighter at the top, rounded unless it is the maskable icon."""
    tile = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    grad = Image.new('RGBA', (1, s))
    for y in range(s):
        t = y / max(1, s - 1)
        grad.putpixel((0, y), tuple(int(PLUM_TOP[i] + (PLUM[i] - PLUM_TOP[i]) * t) for i in range(3)) + (255,))
    grad = grad.resize((s, s))
    mask = Image.new('L', (s, s), 0)
    md = ImageDraw.Draw(mask)
    if rounded:
        md.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
    else:
        md.rectangle([0, 0, s, s], fill=255)
    tile.paste(grad, (0, 0), mask)
    return tile


def shortcut(name, size=96):
    s = size * 4
    img = plum_tile(s)
    d = ImageDraw.Draw(img)
    w = int(s * 0.07)
    c = CREAM
    if name == 'gas':
        d.rounded_rectangle([s * 0.22, s * 0.2, s * 0.58, s * 0.8], radius=int(s * 0.05), outline=c, width=w)
        d.rectangle([s * 0.3, s * 0.28, s * 0.5, s * 0.42], fill=c)
        d.line([(s * 0.58, s * 0.4), (s * 0.72, s * 0.4), (s * 0.72, s * 0.7)], fill=c, width=w)
    elif name == 'groceries':
        d.line([(s * 0.18, s * 0.25), (s * 0.28, s * 0.25), (s * 0.36, s * 0.62), (s * 0.74, s * 0.62), (s * 0.8, s * 0.38), (s * 0.32, s * 0.38)], fill=c, width=w, joint='curve')
        d.ellipse([s * 0.36, s * 0.7, s * 0.46, s * 0.8], fill=c)
        d.ellipse([s * 0.64, s * 0.7, s * 0.74, s * 0.8], fill=c)
    elif name == 'dining':
        d.line([(s * 0.3, s * 0.2), (s * 0.3, s * 0.8)], fill=c, width=w)
        d.line([(s * 0.22, s * 0.2), (s * 0.22, s * 0.4)], fill=c, width=w)
        d.line([(s * 0.38, s * 0.2), (s * 0.38, s * 0.4)], fill=c, width=w)
        d.arc([s * 0.22, s * 0.3, s * 0.38, s * 0.5], 0, 180, fill=c, width=w)
        d.line([(s * 0.66, s * 0.2), (s * 0.66, s * 0.8)], fill=c, width=w)
        d.arc([s * 0.56, s * 0.18, s * 0.76, s * 0.5], 90, 270, fill=c, width=w)
    else:  # online
        d.polygon([(s * 0.5, s * 0.2), (s * 0.78, s * 0.33), (s * 0.78, s * 0.67), (s * 0.5, s * 0.8), (s * 0.22, s * 0.67), (s * 0.22, s * 0.33)], outline=c, width=w)
        d.line([(s * 0.22, s * 0.33), (s * 0.5, s * 0.46), (s * 0.78, s * 0.33)], fill=c, width=w)
        d.line([(s * 0.5, s * 0.46), (s * 0.5, s * 0.8)], fill=c, width=w)
    return img.resize((size, size), Image.LANCZOS)


render_icons([
    ('icon-192.png', 192, False, False),
    ('icon-512.png', 512, False, False),
    ('maskable-512.png', 512, True, True),
    ('apple-touch-icon.png', 180, True, True),
])
for n in ['gas', 'groceries', 'dining', 'online']:
    shortcut(n).save(os.path.join(ROOT, 'shortcut-%s.png' % n))
print('icons written to', os.path.abspath(ROOT))
