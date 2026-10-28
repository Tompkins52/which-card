"""Draws the app icons (no external assets). Run from the repo root: python3 tools/make_icons.py"""
from PIL import Image, ImageDraw
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(ROOT, exist_ok=True)
INK = (20, 27, 34)
PAPER = (243, 245, 247)
GREEN = (46, 191, 120)


def card_icon(size, maskable=False):
    s = size * 4  # draw large, downsample for smooth edges
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=INK)
        pad = int(s * 0.22)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=INK)
        pad = int(s * 0.17)
    # Card: a rounded rectangle, slightly rotated, with a stripe and a check mark
    cw, ch = s - 2 * pad, int((s - 2 * pad) * 0.64)
    card = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, cw - 1, ch - 1], radius=int(ch * 0.14), fill=PAPER)
    cd.rectangle([0, int(ch * 0.22), cw, int(ch * 0.36)], fill=INK)
    cd.rounded_rectangle([int(cw * 0.08), int(ch * 0.58), int(cw * 0.34), int(ch * 0.72)], radius=int(ch * 0.05), fill=(200, 206, 212))
    card = card.rotate(-8, resample=Image.BICUBIC, expand=True)
    cx = (s - card.width) // 2
    cy = (s - card.height) // 2
    img.alpha_composite(card, (cx, cy))
    # Check badge
    r = int(s * 0.17)
    bx, by = s - pad - r + int(s * 0.04), s - pad - r + int(s * 0.04)
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=GREEN)
    w = int(s * 0.035)
    d.line([(bx - r * 0.45, by + r * 0.02), (bx - r * 0.1, by + r * 0.38), (bx + r * 0.5, by - r * 0.35)], fill=INK, width=w, joint='curve')
    return img.resize((size, size), Image.LANCZOS)


def shortcut(name, size=96):
    s = size * 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=INK)
    w = int(s * 0.07)
    c = PAPER
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
apple = Image.new('RGB', (180, 180), INK)
apple.paste(card_icon(180, maskable=True).convert('RGB'))
apple.save(os.path.join(ROOT, 'apple-touch-icon.png'))
for n in ['gas', 'groceries', 'dining', 'online']:
    shortcut(n).save(os.path.join(ROOT, 'shortcut-%s.png' % n))
print('icons written to', os.path.abspath(ROOT))
