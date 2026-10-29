"""Stamps the service worker for a deploy. Run on the assembled site folder: python3 tools/stamp_sw.py site

1. Every file the service worker caches (SHELL in sw.js) must be in the folder. A missing file
   would make every phone's update fail, so the deploy stops here instead.
2. VERSION becomes a hash of those files, so any change to the app shell is a new service
   worker and every phone picks up the whole new shell at once. Nobody has to remember to bump it.
3. The same hash and the deploy time go into index.html (<meta name="build">), and the app shows
   them under About, so a phone can say exactly which build it has.
"""
import datetime
import hashlib
import os
import re
import sys


def main(folder):
    sw_path = os.path.join(folder, 'sw.js')
    sw = open(sw_path, encoding='utf-8').read()
    m = re.search(r'var SHELL = \[(.*?)\];', sw, re.S)
    if not m:
        sys.exit('stamp_sw: no SHELL list in sw.js')
    shell = re.findall(r"'([^']+)'", m.group(1))
    digest = hashlib.sha256()
    missing = []
    for entry in shell:
        rel = entry[2:] if entry.startswith('./') else entry
        path = os.path.join(folder, rel or 'index.html')
        if not os.path.isfile(path):
            missing.append(entry)
            continue
        digest.update(rel.encode('utf-8') + b'\0')
        with open(path, 'rb') as f:
            digest.update(f.read())
    if missing:
        sys.exit('stamp_sw: these files are cached by the service worker but missing from the site: ' + ', '.join(missing))
    version = 'wc-' + digest.hexdigest()[:12]
    stamped, n = re.subn(r"var VERSION = '[^']*';", "var VERSION = '%s';" % version, sw, count=1)
    if n != 1:
        sys.exit('stamp_sw: no VERSION line in sw.js')
    open(sw_path, 'w', encoding='utf-8').write(stamped)
    index_path = os.path.join(folder, 'index.html')
    index = open(index_path, encoding='utf-8').read()
    when = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    index, m = re.subn(r'<meta name="build" content="[^"]*">', '<meta name="build" content="%s %s">' % (version, when), index, count=1)
    if m != 1:
        sys.exit('stamp_sw: no build meta in index.html')
    open(index_path, 'w', encoding='utf-8').write(index)
    print('stamp_sw: %d shell files present, VERSION %s, built %s' % (len(shell), version, when))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
