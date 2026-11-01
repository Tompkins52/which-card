"""Draws the hard scan fixtures: made-up card faces photographed the hard way. Run from the repo root:
python3 tests/fixtures/make_cards.py

card-silver-counter.jpg  A silver card with light letters, small in a phone photo of a speckled
                         stone counter (the photo that the first reader could not read).
cam-silver.jpg           The same card filling the frame of the live camera view.
cam-gold.jpg             A gold card with dark letters on a wood table, in the live camera view.
"""
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
BOOK = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def stone(w, h, seed):
    """A speckled granite counter: beige with dark, cream and rust flecks at a few sizes."""
    rng = np.random.default_rng(seed)
    base = np.zeros((h, w, 3), np.float32) + np.array([196, 162, 116], np.float32)
    for size, colors, share in [(5, [(40, 34, 28), (64, 58, 52)], .30), (3, [(232, 214, 186), (150, 92, 48)], .25), (9, [(28, 24, 20)], .10)]:
        noise = Image.fromarray((rng.random((h // size + 1, w // size + 1)) * 255).astype(np.uint8)).resize((w, h), Image.NEAREST)
        noise = np.asarray(noise.filter(ImageFilter.GaussianBlur(size * .45)), np.float32)
        cut = np.percentile(noise, 100 - share * 100)
        mask = noise > cut
        pick = rng.integers(0, len(colors), (h, w))
        for i, c in enumerate(colors):
            m = mask & (pick == i)
            base[m] = c
    base += rng.normal(0, 9, base.shape)
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.8))


def wood(w, h, seed):
    rng = np.random.default_rng(seed)
    y = np.arange(h)[:, None] + np.zeros((1, w))
    grain = np.sin(y / 9.0 + np.sin(np.arange(w)[None, :] / 140.0) * 3) * 18 + rng.normal(0, 6, (h, w))
    img = np.zeros((h, w, 3), np.float32) + np.array([112, 74, 44], np.float32)
    img += grain[:, :, None] * np.array([1, .7, .45])
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))


def rounded(size, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], r, fill=255)
    return m


def silver_card(w=860):
    h = int(w / 1.586)
    top, bottom = np.array([186, 189, 193], np.float32), np.array([156, 160, 165], np.float32)
    t = np.linspace(0, 1, h)[:, None, None]
    face = top * (1 - t) + bottom * t + np.zeros((h, w, 3), np.float32)
    face[::3] -= 14  # the fine engraved lines of a metal-look card
    card = Image.fromarray(np.clip(face, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(card)
    for i in range(7):  # a big globe in the corner, a little darker than the card
        d.arc([-w * .35 + i * 26, h * .55 + i * 10, w * .75 - i * 26, h * 1.9 - i * 10], 180, 360, fill=(112, 116, 121), width=12)
    d.rounded_rectangle([w * .11, h * .30, w * .23, h * .47], 10, fill=(204, 196, 182))
    d.ellipse([w * .07, h * .08, w * .13, h * .18], outline=(238, 239, 241), width=6)
    light = (236, 237, 239)
    f1, f2, f3 = ImageFont.truetype(BOLD, int(w * .062)), ImageFont.truetype(BOLD, int(w * .072)), ImageFont.truetype(BOOK, int(w * .052))
    x = w * .47
    for ch in 'UNITED':
        d.text((x, h * .09), ch, font=f1, fill=light)
        x += d.textlength(ch, font=f1) + w * .018
    d.text((w * .62, h * .27), 'Gateway', font=f2, fill=light)
    d.text((w * .60, h * .41), 'MileagePlus', font=f3, fill=light)
    card.putalpha(rounded(card.size, int(w * .04)))
    return card


def gold_card(w=860):
    h = int(w / 1.586)
    t = np.linspace(0, 1, w)[None, :, None]
    face = np.array([222, 186, 98], np.float32) * (1 - t) + np.array([184, 146, 62], np.float32) * t + np.zeros((h, w, 3), np.float32)
    face += np.random.default_rng(7).normal(0, 5, (h, 1, 3))  # brushed metal
    card = Image.fromarray(np.clip(face, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(card)
    ink = (60, 46, 18)
    d.text((w * .08, h * .10), 'AMERICAN EXPRESS', font=ImageFont.truetype(BOLD, int(w * .056)), fill=ink)
    d.rounded_rectangle([w * .09, h * .38, w * .21, h * .55], 10, fill=(236, 214, 150))
    d.text((w * .55, h * .76), 'GOLD CARD', font=ImageFont.truetype(BOLD, int(w * .062)), fill=ink)
    card.putalpha(rounded(card.size, int(w * .04)))
    return card


def place(bg, card, cx, cy, angle):
    c = card.rotate(angle, resample=Image.BICUBIC, expand=True)
    bg.paste(c, (int(cx - c.width / 2), int(cy - c.height / 2)), c)
    return bg


def finish(img, path, blur=1.1, q=82, seed=3):
    img = img.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(img, np.float32) + np.random.default_rng(seed).normal(0, 4, (img.height, img.width, 3))
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(HERE, path), quality=q)
    print('wrote', path)


random.seed(1)
# A phone photo: portrait, the card in the upper middle, lots of counter around it.
photo = stone(1125, 2000, 11)
finish(place(photo, silver_card(830), 470, 905, 1.2), 'card-silver-counter.jpg')
# The live view: 4:3, the card filling the frame (84% of the width), a little counter around it.
finish(place(stone(1280, 960, 12), silver_card(1040), 640, 480, -1.5), 'cam-silver.jpg', blur=1.3)
finish(place(wood(1280, 960, 13), gold_card(1040), 640, 480, 2.0), 'cam-gold.jpg', blur=1.3)
