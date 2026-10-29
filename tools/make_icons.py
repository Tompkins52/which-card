"""Draws the app icons (no external assets). Run from the repo root: python3 tools/make_icons.py"""
from PIL import Image, ImageDraw
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(ROOT, exist_ok=True)
# Which Card's own colors: a plum tile, a marigold card, a white check.
PLUM_TOP = (88, 44, 132)
PLUM = (42, 22, 64)
INK = (30, 19, 40)
MARIGOLD = (246, 166, 35)
CREAM = (255, 236, 186)
WHITE = (255, 255, 255)
LAVENDER = (246, 239, 252)


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


def card_icon(size, maskable=False):
    s = size * 4  # draw large, downsample for smooth edges
    img = plum_tile(s, rounded=not maskable)
    d = ImageDraw.Draw(img)
    pad = int(s * (0.22 if maskable else 0.16))
    # A marigold card, tilted as if just pulled out, with a chip and a tap mark
    cw, ch = s - 2 * pad, int((s - 2 * pad) * 0.63)
    card = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, cw - 1, ch - 1], radius=int(ch * 0.12), fill=MARIGOLD)
    cd.rounded_rectangle([int(cw * 0.1), int(ch * 0.3), int(cw * 0.3), int(ch * 0.56)], radius=int(ch * 0.05), fill=CREAM)
    w = max(2, int(s * 0.016))
    for i, r in enumerate([0.07, 0.12, 0.17]):
        box = [int(cw * 0.36 - r * cw), int(ch * 0.43 - r * cw), int(cw * 0.36 + r * cw), int(ch * 0.43 + r * cw)]
        cd.arc(box, -40, 40, fill=INK, width=w)
    cd.rounded_rectangle([int(cw * 0.1), int(ch * 0.74), int(cw * 0.56), int(ch * 0.84)], radius=int(ch * 0.05), fill=(214, 136, 10))
    card = card.rotate(10, resample=Image.BICUBIC, expand=True)
    shadow = Image.new('RGBA', card.size, (0, 0, 0, 0))
    shadow.paste((20, 8, 30, 110), (0, 0), card.split()[3])
    cx = (s - card.width) // 2 - int(s * 0.03)
    cy = (s - card.height) // 2 - int(s * 0.02)
    img.alpha_composite(shadow, (cx + int(s * 0.015), cy + int(s * 0.035)))
    img.alpha_composite(card, (cx, cy))
    # The check: this is the one to use
    r = int(s * 0.15)
    bx, by = s - pad - int(r * 0.55), s - pad - int(r * 0.45)
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=WHITE)
    lw = int(s * 0.034)
    d.line([(bx - r * 0.45, by + r * 0.02), (bx - r * 0.1, by + r * 0.38), (bx + r * 0.5, by - r * 0.35)], fill=PLUM, width=lw, joint='curve')
    return img.resize((size, size), Image.LANCZOS)


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


card_icon(192).save(os.path.join(ROOT, 'icon-192.png'))
card_icon(512).save(os.path.join(ROOT, 'icon-512.png'))
card_icon(512, maskable=True).save(os.path.join(ROOT, 'maskable-512.png'))
apple = Image.new('RGB', (180, 180), PLUM)
apple.paste(card_icon(180, maskable=True).convert('RGB'))
apple.save(os.path.join(ROOT, 'apple-touch-icon.png'))
for n in ['gas', 'groceries', 'dining', 'online']:
    shortcut(n).save(os.path.join(ROOT, 'shortcut-%s.png' % n))
print('icons written to', os.path.abspath(ROOT))
