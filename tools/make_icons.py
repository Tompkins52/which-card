"""Draws the app icons and the flying mascot from the mascot art.
Run from the repo root: python3 tools/make_icons.py [source-art]

The source is the cartoon mascot art (icons/mascot-1024.jpg, kept in the repo); pass the original
higher-res picture instead to rebuild at best quality. The main icons are crops of it, and
img/witch-fly.webp is the character cut out of the sky for the welcome animation. The four
shortcut icons are drawn with Pillow. Needs Pillow, numpy and scipy."""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = os.path.normpath(os.path.join(HERE, '..', 'icons'))
IMG = os.path.normpath(os.path.join(HERE, '..', 'img'))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ICONS, 'mascot-1024.jpg')
os.makedirs(IMG, exist_ok=True)

im = Image.open(SRC).convert('RGB')
a = np.asarray(im).astype(int)
corner = a[2, 2]
m = np.abs(a - corner).sum(2) > 60
ys, xs = np.nonzero(m)
tile = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
W, H = tile.size
ta = np.asarray(tile).astype(int)

# The art's own rounded corners: how far in they reach along the top edge.
row = ta[1]
nz = np.nonzero(np.abs(row - corner).sum(1) > 60)[0]
R_ART = int(nz.min()) if len(nz) and nz.min() > 2 else 0


def rounded(s, frac=0.22):
    """The tile at s px with our own rounded corners cut to transparency."""
    img = tile.resize((s, s), Image.LANCZOS)
    mk = Image.new('L', (s * 4, s * 4), 0)
    ImageDraw.Draw(mk).rounded_rectangle([0, 0, s * 4 - 1, s * 4 - 1], radius=int(s * 4 * frac), fill=255)
    mk = mk.resize((s, s), Image.LANCZOS)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.paste(img, (0, 0), mk)
    return out


def cornerfilled(s):
    """The tile at s px filling the whole square: the art's rounded corners get sky sampled nearby.
    For the maskable icon and the apple touch icon, whose corners the platforms shape themselves."""
    img = tile.resize((s, s), Image.LANCZOS)
    if not R_ART:
        return img
    r = int(np.ceil(R_ART * s / W)) + 2
    px = img.load()
    for cx, cy, sx, sy in [(r, r, 1, 1), (s - 1 - r, r, -1, 1), (r, s - 1 - r, 1, -1), (s - 1 - r, s - 1 - r, -1, -1)]:
        fill = px[int(cx - sx * r * .35), int(cy - sy * r * .35)]
        for y in range(r + 2):
            for x in range(r + 2):
                px_x = (cx - sx * r) + sx * x
                px_y = (cy - sy * r) + sy * y
                if (px_x - cx) ** 2 + (px_y - cy) ** 2 > r * r:
                    px[px_x, px_y] = fill
    return img


def cutout():
    """The character (card, hat, limbs, broom) cut out of the sky, for the welcome animation.
    The sky is flooded in from the edges; near-black outline pixels fence it off the character."""
    dark = ta.max(2) < 55
    barrier = ndimage.binary_dilation(dark, iterations=2)
    lab, _ = ndimage.label(~barrier)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    border.discard(0)
    fg = ~np.isin(lab, list(border))
    fg = ndimage.binary_opening(fg, iterations=2)
    fg = ndimage.binary_closing(fg, iterations=2)
    objs, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, objs, range(1, n + 1))
    fg = objs == (np.argmax(sizes) + 1)  # the character is the one big connected piece
    ys2, xs2 = np.nonzero(fg)
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))
    cut = tile.convert('RGBA')
    cut.putalpha(alpha)
    pad = 10
    cut = cut.crop((max(0, xs2.min() - pad), max(0, ys2.min() - pad), min(W, xs2.max() + pad), min(H, ys2.max() + pad)))
    w = 760
    return cut.resize((w, int(cut.size[1] * w / cut.size[0])), Image.LANCZOS)


# Witch Card's own colors for the shortcut icons: a plum tile with cream line art.
PLUM_TOP = (88, 44, 132)
PLUM = (42, 22, 64)
CREAM = (255, 236, 186)


def plum_tile(s, rounded_tile=True):
    """A plum square, lighter at the top, rounded unless it is the maskable icon."""
    tile_img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    grad = Image.new('RGBA', (1, s))
    for y in range(s):
        t = y / max(1, s - 1)
        grad.putpixel((0, y), tuple(int(PLUM_TOP[i] + (PLUM[i] - PLUM_TOP[i]) * t) for i in range(3)) + (255,))
    grad = grad.resize((s, s))
    mask = Image.new('L', (s, s), 0)
    md = ImageDraw.Draw(mask)
    if rounded_tile:
        md.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
    else:
        md.rectangle([0, 0, s, s], fill=255)
    tile_img.paste(grad, (0, 0), mask)
    return tile_img


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


if W > 1200:  # a fresh higher-res source: keep a 1024 copy in the repo as the standing source
    tile.resize((1024, 1024), Image.LANCZOS).save(os.path.join(ICONS, 'mascot-1024.jpg'), quality=90)
rounded(512).save(os.path.join(ICONS, 'icon-512.png'))
rounded(192).save(os.path.join(ICONS, 'icon-192.png'))
cornerfilled(512).save(os.path.join(ICONS, 'maskable-512.png'))
cornerfilled(180).save(os.path.join(ICONS, 'apple-touch-icon.png'))
cutout().save(os.path.join(IMG, 'witch-fly.webp'), quality=88, method=6)
for n in ['gas', 'groceries', 'dining', 'online']:
    shortcut(n).save(os.path.join(ICONS, 'shortcut-%s.png' % n))
print('icons written to', ICONS, 'and', IMG)
