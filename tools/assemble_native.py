#!/usr/bin/env python3
"""Assemble the web app into native/www for the Android build.

Copies the same files the site deploy ships (index.html, app.css, app.js, engine.js, data, fonts,
vendor, img, icons, manifest), leaves out the service worker (the app's files are inside the package,
so nothing needs caching), and loads native.js, the bundled plugin glue, before the app scripts.
Run from the repo root or from native/.
"""
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NATIVE = os.path.join(ROOT, "native")
WWW = os.path.join(NATIVE, "www")


def main():
    if os.path.isdir(WWW):
        shutil.rmtree(WWW)
    os.makedirs(WWW)
    for name in ("app.css", "app.js", "engine.js", "manifest.webmanifest"):
        shutil.copy2(os.path.join(ROOT, name), WWW)
    for folder in ("data", "fonts", "vendor", "img", "icons"):
        shutil.copytree(os.path.join(ROOT, folder), os.path.join(WWW, folder))

    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        html = f.read()
    # native.js first, so window.WCNative exists when app.js runs.
    html, n = re.subn(r'(\s*)(<script src="engine\.js"></script>)', r'\1<script src="native.js"></script>\1\2', html, count=1)
    if n != 1:
        sys.exit("index.html: could not find the engine.js script tag to insert native.js before")
    html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
                        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">')
    with open(os.path.join(WWW, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    esbuild = os.path.join(NATIVE, "node_modules", ".bin", "esbuild")
    subprocess.check_call([esbuild, os.path.join(NATIVE, "src", "native.js"), "--bundle", "--format=iife", "--target=es2017",
                           "--minify", "--outfile=" + os.path.join(WWW, "native.js")], cwd=NATIVE)

    total = 0
    for dirpath, _, files in os.walk(WWW):
        for name in files:
            total += os.path.getsize(os.path.join(dirpath, name))
    print("native/www assembled: %.1f MB" % (total / 1e6))


if __name__ == "__main__":
    main()
