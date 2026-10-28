"""Daily data check.

For every card and offer, fetches the issuer page listed as its source, hashes the visible text,
and compares it with the hash from the last run. A changed page means a human should re-read it
and confirm the numbers in data/cards.json. The script also flags entries that have not been
re-verified for a while and rotating cards with no categories on file for the coming quarter.

It never changes card data by itself. Bank pages change their wording constantly, so an automatic
rewrite would be wrong more often than right. The job's output is a to-do list for a person.

Run from the repo root:
    python3 tools/check_sources.py --report report.md --flags flags.json
    python3 tools/check_sources.py --update-hashes   (after reviewing, so a change is reported once)
"""
import argparse
import hashlib
import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = os.path.join(ROOT, 'data')
HASHES = os.path.join(DATA, 'source-hashes.json')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
STALE_CARD_DAYS = 90
STALE_OFFER_DAYS = 45
QUARTER_WARNING_DAYS = 30


def load(name):
    with open(os.path.join(DATA, name + '.json'), encoding='utf-8') as f:
        return json.load(f)


def visible_text(raw):
    raw = re.sub(r'(?is)<(script|style|noscript|svg|head)[^>]*>.*?</\1>', ' ', raw)
    raw = re.sub(r'(?s)<!--.*?-->', ' ', raw)
    text = re.sub(r'<[^>]+>', ' ', raw)
    text = html.unescape(text)
    text = re.sub(r'\d{1,2}/\d{1,2}/\d{2,4}', '', text)      # dates in footers change daily
    text = re.sub(r'\s+', ' ', text).strip().lower()
    return text


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9'})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read(3_000_000).decode('utf-8', 'ignore')
            return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, ''
    except Exception as e:  # timeouts, DNS, TLS
        return 0, str(e)


def quarter_of(d):
    return '%d-Q%d' % (d.year, (d.month - 1) // 3 + 1)


def next_quarter(d):
    q = (d.month - 1) // 3 + 1
    y = d.year
    if q == 4:
        return '%d-Q1' % (y + 1)
    return '%d-Q%d' % (y, q + 1)


def quarter_end(d):
    q = (d.month - 1) // 3
    m = q * 3 + 3
    if m == 12:
        return date(d.year, 12, 31)
    return date(d.year, m + 1, 1) - timedelta(days=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--report', default='')
    ap.add_argument('--flags', default='')
    ap.add_argument('--update-hashes', action='store_true')
    ap.add_argument('--skip-fetch', action='store_true', help='only run the date checks')
    args = ap.parse_args()

    today = date.today()
    cards = load('cards')['cards']
    offers = load('bonuses').get('offers', [])
    try:
        with open(HASHES, encoding='utf-8') as f:
            hashes = json.load(f)
    except Exception:
        hashes = {}

    flags = []  # dicts: kind, subject, detail
    urls = {}
    for c in cards:
        urls.setdefault(c['sourceUrl'], []).append('card ' + c['name'])
    for o in offers:
        if o.get('sourceUrl'):
            urls.setdefault(o['sourceUrl'], []).append('offer ' + o['cardName'])

    new_hashes = dict(hashes)
    if not args.skip_fetch:
        for url, subjects in sorted(urls.items()):
            status, body = fetch(url)
            entry = {'checked': today.isoformat(), 'status': status}
            if status == 200 and body:
                digest = hashlib.sha256(visible_text(body).encode('utf-8')).hexdigest()
                entry['hash'] = digest
                old = hashes.get(url, {}).get('hash')
                if old and old != digest:
                    flags.append({'kind': 'changed', 'subject': ', '.join(subjects), 'detail': 'The source page changed since the last check. Re-read it and confirm the rates: ' + url})
                elif not old:
                    entry['first'] = today.isoformat()
            elif status in (401, 403, 429, 503):
                entry['hash'] = hashes.get(url, {}).get('hash')
                flags.append({'kind': 'blocked', 'subject': ', '.join(subjects), 'detail': 'The issuer page refused the automated check (HTTP %d). Open it by hand: %s' % (status, url)})
            else:
                entry['hash'] = hashes.get(url, {}).get('hash')
                flags.append({'kind': 'unreachable', 'subject': ', '.join(subjects), 'detail': 'Could not load the source page (status %s). It may have moved: %s' % (status, url)})
            new_hashes[url] = entry

    for c in cards:
        try:
            v = date.fromisoformat(c['verified'])
        except Exception:
            v = today - timedelta(days=999)
        if (today - v).days > STALE_CARD_DAYS:
            flags.append({'kind': 'stale', 'subject': 'card ' + c['name'], 'detail': 'Last verified %s. Re-check the issuer page and update "verified".' % c['verified']})
        rot = c.get('rotating')
        if rot:
            cal = rot.get('calendar', {})
            cur, nxt = quarter_of(today), next_quarter(today)
            if not cal.get(cur):
                flags.append({'kind': 'rotating', 'subject': 'card ' + c['name'], 'detail': 'No rotating categories on file for the current quarter %s.' % cur})
            if (quarter_end(today) - today).days <= QUARTER_WARNING_DAYS and not cal.get(nxt):
                flags.append({'kind': 'rotating', 'subject': 'card ' + c['name'], 'detail': 'The quarter ends on %s and %s is not on file yet. Issuers usually announce it a few weeks ahead.' % (quarter_end(today).isoformat(), nxt)})
    for o in offers:
        try:
            v = date.fromisoformat(o['verified'])
        except Exception:
            v = today - timedelta(days=999)
        if (today - v).days > STALE_OFFER_DAYS:
            flags.append({'kind': 'stale-offer', 'subject': 'offer ' + o['cardName'], 'detail': 'Offer last checked %s. Welcome offers change often.' % o['verified']})

    if args.update_hashes:
        with open(HASHES, 'w', encoding='utf-8') as f:
            json.dump(new_hashes, f, indent=2, sort_keys=True)
            f.write('\n')

    lines = ['# Card data review for %s' % today.isoformat(), '']
    if not flags:
        lines.append('Nothing to review. All source pages match the last check and nothing is stale.')
    else:
        order = ['changed', 'rotating', 'stale', 'stale-offer', 'blocked', 'unreachable']
        titles = {'changed': 'Source pages that changed', 'rotating': 'Rotating categories', 'stale': 'Cards not verified recently',
                  'stale-offer': 'Welcome offers not checked recently', 'blocked': 'Pages that blocked the check', 'unreachable': 'Pages that could not be loaded'}
        for kind in order:
            group = [f for f in flags if f['kind'] == kind]
            if not group:
                continue
            lines.append('## ' + titles[kind])
            lines.append('')
            for f in group:
                lines.append('- **%s**: %s' % (f['subject'], f['detail']))
            lines.append('')
        lines.append('After confirming a page, update the numbers if they changed, set that entry\'s `verified` date to today, and commit. The next run clears the flag.')
    report = '\n'.join(lines) + '\n'
    print(report)
    if args.report:
        with open(args.report, 'w', encoding='utf-8') as f:
            f.write(report)
    if args.flags:
        with open(args.flags, 'w', encoding='utf-8') as f:
            json.dump({'date': today.isoformat(), 'count': len(flags), 'flags': flags}, f, indent=2)
    return 0


if __name__ == '__main__':
    sys.exit(main())
