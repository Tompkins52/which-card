"""Builds a single-file preview of the app with the data inlined.
Useful for sharing a quick look before the site is live. Location and offline mode are off in the preview.
Run from the repo root: python3 tools/make_preview.py [out.html]"""
import base64
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview.html')
    index = read('index.html')
    body = re.search(r'<!--#APP-->(.*)<!--/APP-->', index, re.S).group(1)
    data = {}
    for name in ('categories', 'merchants', 'cards', 'bonuses', 'valuations'):
        data[name] = json.loads(read('data/%s.json' % name))
    css = read('app.css')
    # The font travels inside the page, so the preview needs nothing beside it.
    with open(os.path.join(ROOT, 'fonts', 'archivo-wdth.woff2'), 'rb') as f:
        font = base64.b64encode(f.read()).decode('ascii')
    css = re.sub(r'src: url\("fonts/archivo-wdth\.woff2"\)[^;]*;', 'src: url("data:font/woff2;base64,%s") format("woff2");' % font, css, count=1)
    engine = read('engine.js')
    app = read('app.js')
    inline = json.dumps(data, separators=(',', ':')).replace('</', '<\\/')
    page = ('<title>Which Card</title>\n'
            + '<style>\n' + css + '\n</style>\n'
            + body + '\n<script>\n' + engine + '\n</script>\n'
            + '<script>window.__PREVIEW=true;window.__WHICHCARD_DATA=' + inline + ';</script>\n'
            + '<script>\n' + app + '\n</script>\n')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    print('wrote', out, len(page), 'bytes')


if __name__ == '__main__':
    main()
