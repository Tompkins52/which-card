"""Prints a compact table of every card's earning rules for a human review pass.
Run from the repo root: python3 tools/review_table.py"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
cards = json.load(open(os.path.join(ROOT, 'cards.json')))['cards']
for c in cards:
    rules = []
    for r in c.get('earn', []):
        key = r.get('merchant') or r.get('category')
        extra = ''
        if r.get('cap'):
            extra += ' cap%s/%s' % (r['cap'], r.get('capPeriod'))
        if r.get('excludes'):
            extra += ' -' + ','.join(r['excludes'])
        if r.get('when'):
            extra += ' when'
        if r.get('note'):
            extra += ' (' + r['note'][:40] + ')'
        rules.append('%s=%s%s' % (key, r['rate'], extra))
    if c.get('choice'):
        ch = c['choice']
        rules.insert(0, 'CHOICE%s=%s[%s]%s' % ('(auto)' if ch.get('auto') else '', ch['rate'], ','.join(ch['options']), (' cap%s/%s' % (ch['cap'], ch.get('capPeriod'))) if ch.get('cap') else ''))
    if c.get('rotating'):
        rot = c['rotating']
        cal = rot.get('calendar', {})
        rules.insert(0, 'ROT=%s %s' % (rot['rate'], {k: (v or {}).get('label') for k, v in cal.items()}))
    print('%-40s %-16s %-16s fee=%-4s fx=%-3s base=%-4s net=%-16s %s' % (c['id'], c['issuer'][:16], c['program'], c['annualFee'], c['fxFee'], c['base'], c['network'], ' | '.join(rules)))
