"""Checks the data files for shape and cross-reference errors.
Run from the repo root: python3 tools/validate_data.py
Exit code 1 on any error, so CI can block a bad commit."""
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
PERIODS = {'quarter', 'month', 'cycle', 'year'}
NETWORKS = {'Visa', 'Mastercard', 'American Express', 'Discover', 'Store'}
TYPES = {'personal', 'business'}
CDW = {'primary', 'secondary', False}


def load(name):
    with open(os.path.join(ROOT, name + '.json'), encoding='utf-8') as f:
        return json.load(f)


def main():
    errors, warnings = [], []
    today = date.today()
    cats = load('categories')['categories']
    merch = load('merchants')['merchants']
    cards_doc = load('cards')
    cards = cards_doc['cards']
    bonuses = load('bonuses')
    vals = load('valuations')
    cat_ids = {c['id'] for c in cats}
    merch_ids = {m['id'] for m in merch}
    prog_ids = set(vals['programs'].keys())
    card_ids = set()
    slug = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')

    for c in cats:
        for k in ('id', 'name', 'short', 'icon', 'desc'):
            if k not in c:
                errors.append('category %s missing %s' % (c.get('id'), k))
    for m in merch:
        if not slug.match(m['id']):
            errors.append('merchant id not kebab-case: %s' % m['id'])
        if m['category'] not in cat_ids:
            errors.append('merchant %s has unknown category %s' % (m['id'], m['category']))
        for a in m.get('also', []):
            if a not in cat_ids:
                errors.append('merchant %s has unknown secondary category %s' % (m['id'], a))
        if m.get('parent') and m['parent'] not in merch_ids:
            errors.append('merchant %s has unknown parent %s' % (m['id'], m['parent']))
        for n in m.get('networks', []):
            if n not in NETWORKS:
                errors.append('merchant %s has unknown network %s' % (m['id'], n))

    for c in cards:
        cid = c.get('id', '?')
        if cid in card_ids:
            errors.append('duplicate card id %s' % cid)
        card_ids.add(cid)
        if not slug.match(cid):
            errors.append('card id not kebab-case: %s' % cid)
        for k in ('name', 'issuer', 'network', 'type', 'program', 'annualFee', 'fxFee', 'base', 'sourceUrl', 'verified'):
            if k not in c:
                errors.append('card %s missing %s' % (cid, k))
        if c.get('network') not in NETWORKS:
            errors.append('card %s has unknown network %s' % (cid, c.get('network')))
        for m in c.get('onlyAt', []):
            if m not in merch_ids:
                errors.append('card %s onlyAt has unknown merchant %s' % (cid, m))
        for pk in c.get('perks', []):
            for k in ('id', 'name', 'activation'):
                if k not in pk:
                    errors.append('card %s perk missing %s: %s' % (cid, k, pk))
            if pk.get('activation') not in ('activate', 'auto', 'book'):
                errors.append('card %s perk %s has unknown activation %s' % (cid, pk.get('id'), pk.get('activation')))
            if pk.get('period') not in (None, 'year', 'month', 'quarter', 'semiannual', 'once', 'none'):
                errors.append('card %s perk %s has unknown period %s' % (cid, pk.get('id'), pk.get('period')))
        if c.get('type') not in TYPES:
            errors.append('card %s has unknown type %s' % (cid, c.get('type')))
        if c.get('program') not in prog_ids:
            errors.append('card %s has program %s with no valuation entry' % (cid, c.get('program')))
        if not re.match(r'^#[0-9a-fA-F]{6}$', c.get('color', '#000000')):
            errors.append('card %s has a bad color %s' % (cid, c.get('color')))
        for r in c.get('earn', []):
            if 'rate' not in r or not isinstance(r['rate'], (int, float)):
                errors.append('card %s earn rule missing numeric rate: %s' % (cid, r))
            if 'category' in r:
                if r['category'] not in cat_ids:
                    errors.append('card %s earn rule has unknown category %s' % (cid, r['category']))
                if r['category'] in ('rotating', 'choice'):
                    errors.append('card %s uses %s inside earn; use the rotating or choice block instead' % (cid, r['category']))
            elif 'merchant' in r:
                if r['merchant'] not in merch_ids:
                    errors.append('card %s earn rule has unknown merchant %s' % (cid, r['merchant']))
            else:
                errors.append('card %s earn rule has neither category nor merchant: %s' % (cid, r))
            if r.get('cap') and r.get('capPeriod') not in PERIODS:
                errors.append('card %s earn rule has cap without a valid capPeriod' % cid)
            for x in r.get('excludes', []):
                if x not in cat_ids:
                    errors.append('card %s earn rule excludes unknown category %s' % (cid, x))
            for mm in r.get('merchants', []):
                if mm not in merch_ids:
                    errors.append('card %s select-merchants rule has unknown merchant %s' % (cid, mm))
        ch = c.get('choice')
        if ch:
            for k in ('slots', 'rate', 'options'):
                if k not in ch:
                    errors.append('card %s choice block missing %s' % (cid, k))
            for o in ch.get('options', []):
                if o not in cat_ids and o not in merch_ids:
                    errors.append('card %s choice option unknown category or merchant %s' % (cid, o))
            if ch.get('cap') and ch.get('capPeriod') not in PERIODS:
                errors.append('card %s choice cap without valid capPeriod' % cid)
            st = ch.get('secondTier')
            if st:
                for o in st.get('categories', []):
                    if o not in cat_ids:
                        errors.append('card %s second tier unknown category %s' % (cid, o))
        rot = c.get('rotating')
        if rot:
            for k in ('rate', 'calendar'):
                if k not in rot:
                    errors.append('card %s rotating block missing %s' % (cid, k))
            if rot.get('cap') and rot.get('capPeriod') not in PERIODS:
                errors.append('card %s rotating cap without valid capPeriod' % cid)
            for q, entry in rot.get('calendar', {}).items():
                if not re.match(r'^\d{4}-Q[1-4]$', q):
                    errors.append('card %s rotating calendar key %s is not YYYY-Qn' % (cid, q))
                if entry is None:
                    continue
                for x in entry.get('categories', []):
                    if x not in cat_ids:
                        errors.append('card %s rotating %s unknown category %s' % (cid, q, x))
                for x in entry.get('merchants', []):
                    if x not in merch_ids:
                        errors.append('card %s rotating %s unknown merchant %s' % (cid, q, x))
            cur_q = '%d-Q%d' % (today.year, (today.month - 1) // 3 + 1)
            if cur_q not in rot.get('calendar', {}) or rot['calendar'].get(cur_q) is None:
                warnings.append('card %s has no rotating categories for the current quarter %s' % (cid, cur_q))
        b = c.get('benefits', {})
        if 'rentalCarCDW' in b and b['rentalCarCDW'] not in CDW:
            errors.append('card %s rentalCarCDW must be primary, secondary or false' % cid)
        for field in ('tips', 'watchOut', 'credits'):
            for line in c.get(field, []):
                if '\u2014' in line:
                    errors.append('card %s %s contains an em dash' % (cid, field))
        if '\u2014' in c.get('bestFor', ''):
            errors.append('card %s bestFor contains an em dash' % cid)
        try:
            v = date.fromisoformat(c['verified'])
            if (today - v).days > 120:
                warnings.append('card %s was last verified %s' % (cid, c['verified']))
        except Exception:
            errors.append('card %s has an unreadable verified date' % cid)

    for o in bonuses.get('offers', []):
        if o.get('cardId') not in card_ids:
            warnings.append('offer for %s has no matching card in cards.json' % o.get('cardId'))
        for k in ('cardName', 'issuer', 'bonus', 'spend', 'months', 'annualFee', 'sourceUrl', 'verified'):
            if k not in o:
                errors.append('offer %s missing %s' % (o.get('cardId'), k))
    for pid, p in vals['programs'].items():
        for k in ('name', 'unit', 'cash', 'travel', 'transfer'):
            if k not in p:
                errors.append('valuation %s missing %s' % (pid, k))

    for w in warnings:
        print('warning:', w)
    for e in errors:
        print('error:', e)
    print('%d categories, %d merchants, %d cards, %d offers, %d programs; %d errors, %d warnings' % (
        len(cats), len(merch), len(cards), len(bonuses.get('offers', [])), len(vals['programs']), len(errors), len(warnings)))
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
