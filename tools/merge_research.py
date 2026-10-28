"""One-time merge of the research files into data/cards.json, bonuses.json and valuations.json.
Usage: python3 tools/merge_research.py /path/to/research_dir"""
import hashlib
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = os.path.join(ROOT, 'data')
TODAY = '2026-10-28'

ISSUER_HUE = {'Chase': 212, 'American Express': 205, 'Capital One': 355, 'Citi': 210, 'Discover': 24, 'Bank of America': 348,
              'Wells Fargo': 0, 'U.S. Bank': 220, 'Synchrony': 200, 'TD Bank': 140, 'Goldman Sachs': 220, 'JPMorgan Chase': 212,
              'Barclays': 200, 'Cardless': 260, 'Apple': 220}
OVERRIDES = {
    'chase-sapphire-reserve': '#0B1F33', 'chase-sapphire-preferred': '#1F3F77', 'chase-freedom-unlimited': '#1D6BC4', 'chase-freedom-flex': '#2C7BE5',
    'chase-freedom-rise': '#3E8FE8', 'chase-prime-visa': '#0F3D6B', 'chase-amazon-visa': '#2A5C8A', 'chase-ink-business-preferred': '#2F4858',
    'chase-ink-business-cash': '#3B6E8F', 'chase-ink-business-unlimited': '#4C7FA3', 'chase-united-explorer': '#1C3F95', 'chase-world-of-hyatt': '#2A2A5A',
    'chase-marriott-bonvoy-boundless': '#7A1F3D', 'chase-ihg-one-rewards-premier': '#4B2E83', 'chase-disney-premier-visa': '#1E5AA8', 'chase-aeroplan': '#B0162B',
    'chase-southwest-plus': '#C9461E', 'chase-southwest-priority': '#A33A17', 'chase-slate-edge': '#5B6670',
    'amex-gold': '#C9A227', 'amex-platinum': '#9AA5B1', 'amex-green': '#2E6B4F', 'amex-blue-cash-preferred': '#2B6CB0', 'amex-blue-cash-everyday': '#4A90D9',
    'amex-everyday': '#3A7BD5', 'amex-everyday-preferred': '#2458A6', 'amex-cash-magnet': '#4F6D8F', 'amex-blue-business-plus': '#3577B8', 'amex-blue-business-cash': '#5C9BD6',
    'amex-business-gold': '#B8942A', 'amex-business-platinum': '#7E8A96', 'amex-delta-blue': '#9BB3CF', 'amex-delta-gold': '#B79B3A', 'amex-delta-platinum': '#7E8894',
    'amex-delta-reserve': '#2B2F3A', 'amex-hilton-honors': '#2458A6', 'amex-hilton-surpass': '#1C3F7A', 'amex-hilton-aspire': '#111827',
    'amex-marriott-bonvoy-brilliant': '#4A1A2C', 'amex-marriott-bonvoy-bevy': '#8A2B4C',
    'capital-one-savor': '#8A1F2B', 'capital-one-quicksilver': '#8E9BA8', 'capital-one-quicksilverone': '#6F7D8A', 'capital-one-venture': '#1F4E79',
    'capital-one-venture-x': '#0D2238', 'capital-one-ventureone': '#4D7EAD', 'capital-one-spark-cash-plus': '#2E4A62', 'capital-one-spark-cash-select': '#3F5F7A',
    'capital-one-spark-miles': '#1B3A55',
    'citi-double-cash': '#12365D', 'citi-custom-cash': '#1E5A8E', 'citi-strata-premier': '#3C3B6E', 'citi-strata-elite': '#1B1B3A', 'citi-strata': '#5A5A8E',
    'citi-rewards-plus': '#2F6DB5', 'citi-simplicity': '#6B7280', 'citi-costco-anywhere-visa': '#B52E31', 'citi-aadvantage-platinum-select': '#9A1B2D',
    'discover-it-cash-back': '#E8701B', 'discover-it-chrome': '#C25A14', 'discover-it-miles': '#B4541A', 'discover-it-student-cash-back': '#F08A3E',
    'bofa-customized-cash-rewards': '#9B1B30', 'bofa-unlimited-cash-rewards': '#7A1526', 'bofa-travel-rewards': '#1E3A8A', 'bofa-premium-rewards': '#1F2937',
    'bofa-premium-rewards-elite': '#0F172A',
    'wells-fargo-active-cash': '#8E1B1B', 'wells-fargo-autograph': '#2B2B2B', 'wells-fargo-autograph-journey': '#1A1A1A', 'wells-fargo-attune': '#1F6F5F',
    'bilt-mastercard': '#1A1A1A',
    'us-bank-cash-plus': '#1E3A6B', 'us-bank-altitude-go': '#2F5F8F', 'us-bank-altitude-connect': '#1E4F78', 'us-bank-altitude-reserve': '#0B1F3A',
    'us-bank-shopper-cash-rewards': '#3A6EA5', 'us-bank-smartly': '#2E4A7A',
    'target-circle-card': '#CC0000', 'apple-card': '#1C1C1E', 'paypal-cashback-mastercard': '#003087', 'sams-club-mastercard': '#1F6BB0',
    'amazon-store-card': '#232F3E', 'verizon-visa': '#2B2B2B', 'best-buy-visa': '#1F3C88'
}
PERCENT_PROGRAMS = {'cashback', 'discover-cashback', 'apple-cash', 'amazon-points', 'target-circle', 'paypal-cashback', 'synchrony-cashback', 'best-buy-rewards', 'verizon-dollars'}
PERCENT_NAMES = {'cashback': 'Cash back', 'discover-cashback': 'Discover cash back', 'apple-cash': 'Apple Cash daily cash', 'amazon-points': 'Amazon rewards',
                 'target-circle': 'Target Circle', 'paypal-cashback': 'PayPal cash back', 'synchrony-cashback': 'Cash back',
                 'best-buy-rewards': 'My Best Buy rewards (Best Buy certificates)', 'verizon-dollars': 'Verizon Dollars (spend with Verizon)'}
MERCHANT_RENAMES = {'exxon-mobil': 'mobil'}
STORE_ONLY = {'target-circle-card': ['target', 'target-online'], 'amazon-store-card': ['amazon', 'whole-foods'], 'amazon-secured-card': ['amazon'],
              'best-buy-credit-card': ['best-buy', 'best-buy-online'], 'lowes-rewards-credit-card': ['lowes']}
ISSUER_RENAMES = {'bilt-blue': 'Bilt', 'bilt-obsidian': 'Bilt', 'bilt-palladium': 'Bilt', 'target-circle-card': 'Target (TD Bank)', 'target-circle-mastercard': 'Target (TD Bank)'}


def hsl_to_hex(h, s, l):
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h / 360.0, l, s)
    return '#%02X%02X%02X' % (round(r * 255), round(g * 255), round(b * 255))


NAME_FIXES = {
    'Costco Anywhere Visa Card by Citi': 'Costco Anywhere Visa', 'Target Circle Card (Target Credit Card)': 'Target Circle Card',
    'Target Circle Card (Target Mastercard)': 'Target Circle Mastercard', 'Amazon Store Card (Prime Store Card)': 'Amazon Store Card',
    'Citi / AAdvantage Platinum Select World Elite Mastercard': 'Citi AAdvantage Platinum Select',
    'Bank of America Customized Cash Rewards': 'BofA Customized Cash Rewards', 'Bank of America Unlimited Cash Rewards': 'BofA Unlimited Cash Rewards',
    'Bank of America Travel Rewards': 'BofA Travel Rewards', 'Bank of America Premium Rewards': 'BofA Premium Rewards', 'Bank of America Premium Rewards Elite': 'BofA Premium Rewards Elite',
}


AMEX_NAMES = {
    'amex-platinum': 'Amex Platinum', 'amex-gold': 'Amex Gold', 'amex-green': 'Amex Green', 'amex-business-gold': 'Amex Business Gold',
    'amex-business-platinum': 'Amex Business Platinum', 'amex-blue-business-plus': 'Amex Blue Business Plus', 'amex-blue-business-cash': 'Amex Blue Business Cash',
    'amex-blue-cash-everyday': 'Amex Blue Cash Everyday', 'amex-blue-cash-preferred': 'Amex Blue Cash Preferred', 'amex-cash-magnet': 'Amex Cash Magnet',
    'amex-everyday': 'Amex EveryDay', 'amex-everyday-preferred': 'Amex EveryDay Preferred',
    'amex-delta-skymiles-blue': 'Delta SkyMiles Blue (Amex)', 'amex-delta-skymiles-gold': 'Delta SkyMiles Gold (Amex)', 'amex-delta-skymiles-platinum': 'Delta SkyMiles Platinum (Amex)',
    'amex-delta-skymiles-reserve': 'Delta SkyMiles Reserve (Amex)', 'amex-hilton-honors': 'Hilton Honors (Amex)', 'amex-hilton-honors-surpass': 'Hilton Honors Surpass (Amex)',
    'amex-hilton-honors-aspire': 'Hilton Honors Aspire (Amex)', 'amex-marriott-bonvoy-bevy': 'Marriott Bonvoy Bevy (Amex)', 'amex-marriott-bonvoy-brilliant': 'Marriott Bonvoy Brilliant (Amex)',
    'us-bank-altitude-reserve': 'U.S. Bank Altitude Reserve', 'capital-one-spark-cash-select': 'Capital One Spark Cash Select', 'capital-one-spark-cash-plus': 'Capital One Spark Cash Plus',
}


def clean_name(n, card_id=None):
    if card_id in AMEX_NAMES:
        return AMEX_NAMES[card_id]
    n = NAME_FIXES.get(n, n)
    if n in ('Apple Card', 'Target Circle Card', 'Target Circle Mastercard', 'Amazon Store Card', 'Amazon Secured Card'):
        return n
    n = re.sub(r'\s*\(.*?\)\s*', ' ', n).strip()
    stripped = re.sub(r'\s+(Credit Card|Card)$', '', n)
    if ' ' in stripped:
        n = stripped
    n = n.replace(' Visa Signature', '').replace(' Rewards Credit', '')
    n = n.replace('\u00ae', '').replace('\u2120', '').replace('\u2122', '')
    return n.strip()


def color_for(card):
    if card['id'] in OVERRIDES:
        return OVERRIDES[card['id']]
    hue = ISSUER_HUE.get(card['issuer'], 210)
    n = int(hashlib.sha1(card['id'].encode()).hexdigest(), 16)
    return hsl_to_hex((hue + (n % 25) - 12) % 360, 0.45 + (n % 20) / 100.0, 0.26 + (n % 12) / 100.0)


def main(src):
    cards, notes = [], []
    seen = set()
    for name in sorted(os.listdir(src)):
        if not name.endswith('.json') or name in ('bonuses.json', 'valuations.json', 'perks.json'):
            continue
        with open(os.path.join(src, name), encoding='utf-8') as f:
            doc = json.load(f)
        notes.extend(doc.get('notes', []))
        for c in doc['cards']:
            if c['id'] in seen:
                print('duplicate', c['id'], 'in', name)
                continue
            seen.add(c['id'])
            cards.append(c)
    vals, bon = {'programs': {}}, {'verified': TODAY, 'offers': []}
    if os.path.exists(os.path.join(src, 'valuations.json')):
        with open(os.path.join(src, 'valuations.json'), encoding='utf-8') as f:
            vals = json.load(f)
    else:
        print('no valuations.json yet; using placeholders')
    if os.path.exists(os.path.join(src, 'bonuses.json')):
        with open(os.path.join(src, 'bonuses.json'), encoding='utf-8') as f:
            bon = json.load(f)
    else:
        print('no bonuses.json yet; offers empty')

    perks = {}
    perks_path = os.path.join(src, 'perks.json')
    if os.path.exists(perks_path):
        with open(perks_path, encoding='utf-8') as f:
            perks = json.load(f).get('cards', {})
    PERK_IDS = {'amex-delta-platinum': 'amex-delta-skymiles-platinum', 'amex-delta-reserve': 'amex-delta-skymiles-reserve', 'amex-hilton-surpass': 'amex-hilton-honors-surpass',
                'amex-hilton-aspire': 'amex-hilton-honors-aspire', 'chase-southwest-priority': 'chase-southwest-rapid-rewards-priority'}
    for old_id, new_id in PERK_IDS.items():
        if old_id in perks:
            perks[new_id] = perks.pop(old_id)
    if 'bilt-mastercard' in perks:
        bilt = perks.pop('bilt-mastercard')
        for bid, tier in (('bilt-blue', 'Blue'), ('bilt-obsidian', 'Obsidian'), ('bilt-palladium', 'Palladium')):
            keep = []
            for pk in bilt.get('perks', []):
                text = (pk.get('name', '') + ' ' + (pk.get('note') or '') + ' ' + (pk.get('worth') or ''))
                if tier == 'Blue' and ('Not on Blue' in text or 'Palladium' in pk.get('name', '') or 'Obsidian' in pk.get('name', '') or 'Palladium only' in text or pk['id'] in ('cell-phone-protection', 'travel-protections')):
                    continue
                if tier == 'Obsidian' and ('Palladium' in pk.get('name', '') or 'Palladium only' in text):
                    continue
                keep.append(dict(pk))
            perks[bid] = {'benefitsUrl': bilt.get('benefitsUrl'), 'perks': keep}
    for c in cards:
        pk = perks.get(c['id'])
        if not pk:
            continue
        pk['perks'] = [x for x in pk.get('perks', []) if x.get('id') != 'quarterly-5x' and (x.get('worth') or '').lower() != 'ended' and not (x.get('note') or '').lower().startswith('ended')]
        if pk.get('benefitsUrl'):
            c['benefitsUrl'] = pk['benefitsUrl']
        if pk.get('perks'):
            c['perks'] = pk['perks']
        if pk.get('activationUrl') and c.get('rotating'):
            c['rotating']['activationUrl'] = pk['activationUrl']

    programs = vals['programs']
    for pid, p in programs.items():
        p.setdefault('unit', 'miles' if 'miles' in pid or pid in ('delta-skymiles', 'united-miles', 'american-aadvantage', 'alaska-miles', 'capital-one-miles', 'aeroplan-points') and 'points' not in pid else 'points')
    for pid in PERCENT_PROGRAMS:
        programs.setdefault(pid, {'name': PERCENT_NAMES[pid], 'unit': 'percent', 'cash': 1, 'travel': 1, 'transfer': 1, 'note': ''})
        programs[pid]['unit'] = 'percent'
    if 'chase-ur' in programs:
        programs['chase-ur']['transferRequires'] = ['chase-sapphire-preferred', 'chase-sapphire-reserve', 'chase-ink-business-preferred']
        programs['chase-ur']['note'] = (programs['chase-ur'].get('note') or '') + ' Freedom and no-fee Ink points only transfer to partners if you also hold a Sapphire or Ink Preferred card.'
    if 'citi-ty' in programs:
        programs['citi-ty']['transferRequires'] = ['citi-strata-premier', 'citi-strata-elite']
        programs['citi-ty']['note'] = (programs['citi-ty'].get('note') or '') + ' Double Cash, Custom Cash and Strata points transfer to the full partner list only alongside a Strata Premier or Strata Elite.'
    CLOSED = {'citi-custom-cash', 'wells-fargo-attune', 'us-bank-altitude-reserve', 'us-bank-shopper-cash-rewards', 'chase-slate-edge', 'amex-everyday', 'amex-everyday-preferred',
              'amex-cash-magnet', 'amex-green', 'citi-simplicity'}
    for c in cards:
        if c['id'] in CLOSED:
            c['closed'] = True
    programs.setdefault('british-airways-avios', {'name': 'Avios (British Airways, Aer Lingus, Iberia)', 'unit': 'points', 'cash': 0, 'travel': 1.5, 'transfer': 1.5,
                                                  'note': 'Best on short-haul partner flights and off-peak British Airways awards; Avios move freely between the three programs.'})
    programs.setdefault('disney-rewards', {'name': 'Disney Rewards Dollars', 'unit': 'percent', 'cash': 1, 'travel': 1, 'transfer': 1,
                                           'note': 'Worth $1 each only toward Disney purchases or as a statement credit against Disney, Disney+, Hulu and ESPN charges.'})
    EXTRA_PROGRAMS = {
        'navy-federal-rewards': ('Navy Federal rewards points', 'points', 1, 1, 1, 'Worth 1 cent each as cash back or travel; no transfer partners.'),
        'usaa-rewards': ('USAA rewards points', 'points', 0.7, 1, 1, 'Worth 1 cent toward travel and about 0.7 cent as cash.'),
        'penfed-rewards': ('PenFed points', 'points', 0, 1, 1, 'No cash option; about 1 cent toward travel and gift cards, more on some travel redemptions.'),
        'flying-blue-miles': ('Flying Blue miles', 'miles', 0, 1.2, 1.2, 'Air France and KLM awards; watch the monthly Promo Rewards.'),
        'norwegian-points': ('Norwegian Cruise Line points', 'points', 0, 1, 1, 'Worth 1 cent each as cruise credit only.'),
        'royal-caribbean-points': ('Royal Caribbean points', 'points', 0, 1, 1, 'Worth 1 cent each as cruise credit, 5,000 point minimum.'),
        'choice-privileges': ('Choice Privileges points', 'points', 0, 0.8, 0.8, 'Best on cheap Comfort and Quality Inn nights; about 0.8 cent each.'),
        'onekey-cash': ('OneKeyCash', 'percent', 1, 1, 1, 'Spends like dollars, but only at Expedia, Hotels.com and Vrbo, and it expires after 18 months idle.'),
        'skypass-miles': ('Korean Air SKYPASS miles', 'miles', 0, 1.3, 1.3, 'Strong value on Korean Air long-haul awards.'),
        'harley-davidson-points': ('Harley-Davidson points', 'points', 0, 1, 1, 'Worth 1 cent each as gift cards; they expire after three years.'),
        'hawaiian-miles': ('HawaiianMiles', 'miles', 0, 1.2, 1.2, 'Now part of the Alaska and Hawaiian program; check the current merger rules.'),
        'frontier-miles': ('Frontier Miles', 'miles', 0, 1, 1, 'Low value; best on Frontier sale fares.'),
        'wyndham-rewards': ('Wyndham Rewards points', 'points', 0, 1.1, 1.1, 'Fixed award chart; 7,500 points a night at many properties.'),
        'carnival-funpoints': ('Carnival FunPoints', 'points', 0, 1, 1, 'Worth 1 cent each toward a Carnival cruise.'),
        'priceline-points': ('Priceline points', 'points', 0, 1, 1, 'Worth 1 cent each toward Priceline bookings.'),
        'emirates-skywards': ('Emirates Skywards miles', 'miles', 0, 1.2, 1.2, 'Emirates awards; fuel surcharges apply.'),
        'rei-rewards': ('REI Co-op rewards', 'percent', 1, 1, 1, 'Paid once a year as a Co-op Member Reward usable at REI.'),
        'cabelas-club-points': ('CLUB points (Bass Pro and Cabela\'s)', 'percent', 1, 1, 1, 'Spendable only at Bass Pro Shops and Cabela\'s.'),
        'kohls-rewards': ('Kohl\'s Rewards', 'percent', 1, 1, 1, 'Paid as Kohl\'s Cash, spendable only at Kohl\'s.'),
        'bjs-rewards': ('BJ\'s rewards', 'percent', 1, 1, 1, 'Spendable at BJ\'s.'),
        'key-rewards': ('Key Rewards', 'percent', 1, 1, 1, 'Spendable at Williams Sonoma, Pottery Barn and West Elm.'),
        'macys-star-rewards': ('Macy\'s Star Money', 'percent', 1, 1, 1, 'Spendable only at Macy\'s.'),
        'amtrak-guest-rewards': ('Amtrak Guest Rewards points', 'points', 0, 2.5, 2.5, 'About 2.5 cents each on Amtrak fares.'),
        'best-western-rewards': ('Best Western Rewards points', 'points', 0, 0.6, 0.6, 'About 0.6 cent each on Best Western nights.'),
        'gm-rewards': ('GM Rewards points', 'points', 0, 1, 1, 'Worth 1 cent each toward a GM vehicle or service.'),
        'fidelity-rewards': ('Fidelity Rewards points', 'points', 1, 1, 1, 'Worth 1 cent each deposited to a Fidelity account.'),
        'aaa-rewards': ('AAA rewards', 'percent', 1, 1, 1, 'Cash back as a statement credit.'),
        'sephora-rewards': ('Sephora rewards', 'percent', 1, 1, 1, 'Spendable only at Sephora.'),
        'ulta-rewards': ('Ultamate Rewards points', 'points', 0, 2, 2, 'Worth about 2 cents each at Ulta.'),
        'ikea-rewards': ('IKEA rewards', 'percent', 1, 1, 1, 'Spendable at IKEA.'),
        'caesars-rewards': ('Caesars Rewards', 'points', 0, 1, 1, 'Reward Credits spendable at Caesars properties.'),
        'jcpenney-rewards': ('JCPenney Rewards', 'percent', 1, 1, 1, 'Spendable only at JCPenney.'),
        'tjx-rewards': ('TJX Rewards', 'percent', 1, 1, 1, 'Spendable at T.J. Maxx, Marshalls, HomeGoods and Sierra.'),
        'incircle-points': ('InCircle points', 'points', 0, 1, 1, 'Neiman Marcus gift cards, about 1 cent each.'),
        'meijer-rewards': ('Meijer rewards', 'percent', 1, 1, 1, 'Paid as Meijer certificates.'),
        'wayfair-rewards': ('Wayfair rewards', 'percent', 1, 1, 1, 'Spendable only at Wayfair.'),
        'mylowes-money': ('MyLowe\'s Money', 'percent', 1, 1, 1, 'Spendable at Lowe\'s; expires twice a year.'),
        'caesars-reward-credits': ('Caesars Reward Credits', 'points', 0, 1, 1, 'About 1 cent each at Caesars properties.'),
        'speedy-rewards': ('Speedy Rewards points', 'points', 0, 0.1, 0.1, 'About a tenth of a cent each at Speedway.'),
        'scheels-rewards': ('Scheels rewards', 'percent', 1, 1, 1, 'Spendable at Scheels.'),
        'shell-credits': ('Shell fuel credits', 'percent', 1, 1, 1, 'Spendable only against Shell purchases.'),
        'victorias-secret-rewards': ('Victoria\'s Secret rewards', 'points', 0, 0.5, 0.5, 'Store rewards only.'),
        'navyist-rewards': ('Navyist and Gap Good Rewards', 'points', 0, 1, 1, 'Spendable at Gap, Old Navy, Banana Republic and Athleta.'),
    }
    for pid, (name, unit, cash, travel, transfer, note) in EXTRA_PROGRAMS.items():
        programs.setdefault(pid, {'name': name, 'unit': unit, 'cash': cash, 'travel': travel, 'transfer': transfer, 'note': note})
    programs.setdefault('bofa-points', {'name': 'Bank of America points', 'unit': 'points', 'cash': 1, 'travel': 1, 'transfer': 1,
                                        'note': 'Worth 1 cent each as a statement credit (Travel Rewards points go against travel and dining purchases; Premium Rewards points can be cash).'})
    if 'capital-one-miles' in programs:
        programs['capital-one-miles']['cash'] = 1.0
        programs['capital-one-miles']['note'] = 'Worth 1 cent each as a statement credit against any travel purchase from the last 90 days (a plain check pays 0.5 cent), 1 cent through Capital One Travel, and more when transferred to airline and hotel partners.'
    # Points programs that are really cash back on specific cards
    for c in cards:
        prog = c.get('program', 'cashback')
        if prog in ('bofa-points', 'us-bank-points', 'wells-fargo-points') and 'cash' in c['name'].lower():
            c['program'] = 'cashback'
        if prog not in programs and prog not in PERCENT_PROGRAMS:
            print('program missing from valuations, adding placeholder:', prog)
            programs[prog] = {'name': prog, 'unit': 'points', 'cash': 1, 'travel': 1, 'transfer': 1, 'note': ''}
    FINISHES = {
        'amex-platinum': 'silver', 'amex-business-platinum': 'silver', 'apple-card': 'silver', 'bilt-palladium': 'silver', 'capital-one-quicksilver': 'silver',
        'amex-gold': 'gold', 'amex-business-gold': 'gold', 'amex-delta-skymiles-gold': 'gold',
        'citi-strata-elite': 'black', 'amex-delta-skymiles-reserve': 'black', 'amex-hilton-honors-aspire': 'black', 'amex-marriott-bonvoy-brilliant': 'black',
        'bofa-premium-rewards-elite': 'black', 'us-bank-altitude-reserve': 'black', 'bilt-obsidian': 'black', 'chase-united-club': 'black', 'amex-centurion': 'black',
        'chase-sapphire-reserve': 'metal', 'chase-sapphire-preferred': 'metal', 'capital-one-venture-x': 'metal', 'capital-one-venture': 'metal', 'citi-strata-premier': 'metal',
        'amex-delta-skymiles-platinum': 'metal', 'chase-ink-business-preferred': 'metal', 'capital-one-venture-x-business': 'metal', 'chase-united-quest': 'metal',
    }
    for c in cards:
        if c.get('sourceUrls'):
            c['sourceUrls'] = [u for u in c['sourceUrls'] if 'cardpointers' not in u.lower() and 'maxrewards' not in u.lower()]
        c['name'] = clean_name(c['name'], c['id'])
        c['color'] = color_for(c)
        if c['id'] in FINISHES:
            c['finish'] = FINISHES[c['id']]
        if c['id'] == 'apple-card':
            c['color'] = '#E9ECEF'
        if c['id'].startswith('chase-ihg'):
            c['network'] = 'Mastercard'
        c.setdefault('verified', TODAY)
        c.setdefault('earn', [])
        c.setdefault('type', 'personal')
        c.setdefault('fxFee', 0)
        c.setdefault('annualFee', 0)
        c.setdefault('base', 1)
        c.setdefault('tips', [])
        c.setdefault('watchOut', [])
        for k in ('choice', 'rotating'):
            if c.get(k) is None and k in c:
                del c[k]
        if c.get('choice') and c['choice'].pop('automatic', False):
            c['choice']['auto'] = True
        ch = c.get('choice')
        if ch:
            if not ch.get('options') and ch.get('merchantOptions'):
                ch['options'] = ch.pop('merchantOptions')
            ch.pop('optionLabels', None)
            if ch.get('cap') is None:
                ch.pop('cap', None); ch.pop('capPeriod', None)
            if ch.get('secondTier') is None:
                ch.pop('secondTier', None)
            tier_cats = set((ch.get('secondTier') or {}).get('categories', []))
            # rules that duplicate the choice block or its second tier
            c['earn'] = [r for r in c['earn'] if r.get('category') not in ('choice', 'rotating') and not (r.get('category') in tier_cats and r.get('rate') == (ch.get('secondTier') or {}).get('rate'))]
        else:
            c['earn'] = [r for r in c['earn'] if r.get('category') not in ('choice', 'rotating')]
        for r in c['earn']:
            if 'merchantNote' in r:
                r['note'] = r.pop('merchantNote')
            if r.get('merchant') in MERCHANT_RENAMES:
                r['merchant'] = MERCHANT_RENAMES[r['merchant']]
            note = (r.get('note') or '').lower()
            # portal-only and ticket-portal rules become merchant rules so they never apply to ordinary stores
            if r.get('category') == 'entertainment' and 'capital one entertainment' in note:
                r.pop('category'); r['merchant'] = 'capital-one-entertainment'; r['label'] = 'Capital One Entertainment'
            if r.get('category') == 'dining' and 'capital one dining' in note:
                r.pop('category'); r['merchant'] = 'capital-one-dining'; r['label'] = 'Capital One Dining'
            for portal in ('capital-one-travel', 'citi-travel', 'chase-travel', 'amex-travel'):
                if r.get('merchant') == portal and ('flight' in note or 'air' in note) and 'hotel' not in note:
                    r['merchant'] = portal + '-flights'
            if r.get('category') == 'dining' and 'friday and saturday' in note:
                r['when'] = {'days': [5, 6], 'start': 18, 'end': 6, 'tz': 'America/New_York'}
                r['label'] = 'Citi Nights dining (Fri and Sat 6 PM to 6 AM ET)'
            if r.get('cap') is None:
                r.pop('cap', None); r.pop('capPeriod', None)
            if r.get('excludes') == []:
                r.pop('excludes')
        if c.get('rotating') and c['rotating'].get('calendar'):
            for q, entry in c['rotating']['calendar'].items():
                if entry and entry.get('label'):
                    entry['label'] = re.sub(r'\s*\((?=[^)]*(?:January|February|March|April|May|June|July|August|September|October|November|December|activation))[^)]*\)', '', entry['label']).strip()
                if entry and entry.get('activateBy') is None:
                    entry.pop('activateBy', None)
        if c.get('network') == 'store':
            c['network'] = 'Store'
        if c['id'] in STORE_ONLY:
            c['onlyAt'] = STORE_ONLY[c['id']]
        elif c.get('network') == 'Store':
            ms = [r['merchant'] for r in c['earn'] if r.get('merchant')]
            if ms:
                c['onlyAt'] = ms
        if c['id'] in ISSUER_RENAMES:
            c['issuer'] = ISSUER_RENAMES[c['id']]
        if c.get('issuer') == 'other':
            for guess, label in (('fnbo-', 'FNBO'), ('barclays-', 'Barclays'), ('elan-', 'Elan'), ('aaa-', 'Bread Financial'), ('sephora', 'Bread Financial'), ('ulta', 'Bread Financial'),
                                 ('ikea', 'Bread Financial'), ('victorias', 'Bread Financial'), ('caesars', 'Bread Financial'), ('best-western', 'First Bank & Trust'), ('shell-', 'First Bank & Trust')):
                if c['id'].startswith(guess) or guess in c['id']:
                    c['issuer'] = label
                    break
        b = c.get('benefits') or {}
        c['benefits'] = {k: v for k, v in b.items() if v}
        if c['issuer'] == 'Capital One' and c['type'] == 'personal':
            c['networkOptions'] = sorted({c['network'], 'Visa', 'Mastercard', 'Discover'})
        if c['issuer'] == 'Bank of America':
            c['boostLabel'] = 'BofA Rewards tier (formerly Preferred Rewards)'
            c['boostOptions'] = [{'label': 'Member (10% more)', 'multiplier': 1.10}, {'label': 'Preferred Plus or legacy Gold (25% more)', 'multiplier': 1.25},
                                 {'label': 'Preferred Honors or legacy Platinum (50% more)', 'multiplier': 1.5}, {'label': 'Premier or legacy Platinum Honors (75% more)', 'multiplier': 1.75}]
        for field in ('tips', 'watchOut', 'credits', 'bestFor'):
            v = c.get(field)
            if isinstance(v, list):
                c[field] = [s.replace('\u2014', ',').replace('\u2013', '-') for s in v]
            elif isinstance(v, str):
                c[field] = v.replace('\u2014', ',').replace('\u2013', '-')
        c['tips'] = [t for t in c['tips'] if '% total' not in t]
        for pk in c.get('perks', []):
            for field in ('name', 'worth', 'how', 'note'):
                if isinstance(pk.get(field), str):
                    pk[field] = pk[field].replace('\u2014', ',').replace('\u2013', '-')
        if c.get('perks') and c.get('credits'):
            del c['credits']  # the perks list supersedes the short credit strings
    ISSUER_ORDER = ['Chase', 'American Express', 'Capital One', 'Citi', 'Discover', 'Bank of America', 'Wells Fargo', 'U.S. Bank']
    PORTALS = {'Chase': 'Chase Travel', 'American Express': 'Amex Travel', 'Capital One': 'Capital One Travel', 'Citi': 'Citi Travel',
               'U.S. Bank': 'U.S. Bank Travel Center', 'Bank of America': 'BofA Travel Center', 'Wells Fargo': 'Wells Fargo Travel', 'Bilt': 'Bilt Travel', 'Discover': 'Capital One Travel'}
    for c in cards:
        if c['id'] == 'amex-gold':
            for r in c['earn']:
                if r.get('category') == 'portal-travel':
                    r.pop('category'); r['merchant'] = 'amex-travel'; r['label'] = 'Prepaid hotels on Amex Travel'
        for r in c['earn']:
            if r.get('category') == 'portal-travel' and not r.get('label'):
                r['label'] = PORTALS.get(c['issuer'], 'issuer travel site')
        if c['issuer'] == 'Capital One':
            c['name'] = re.sub(r' (Cash )?Rewards$', '', c['name'])
    cards.sort(key=lambda c: (ISSUER_ORDER.index(c['issuer']) if c['issuer'] in ISSUER_ORDER else 99, c['issuer'], c['type'], c['name']))

    with open(os.path.join(DATA, 'cards.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': TODAY, 'verified': TODAY, 'notes': notes, 'cards': cards}, f, indent=1, ensure_ascii=False)
        f.write('\n')
    with open(os.path.join(DATA, 'valuations.json'), 'w', encoding='utf-8') as f:
        json.dump({'verified': vals.get('verified', TODAY), 'sourceUrl': vals.get('sourceUrl', ''), 'programs': programs}, f, indent=1, ensure_ascii=False)
        f.write('\n')
    OFFER_IDS = {'capital-one-savor': 'capital-one-savor-cash-rewards', 'bilt-mastercard': 'bilt-blue', 'chase-southwest-plus': 'chase-southwest-rapid-rewards-plus'}
    card_ids = {c['id'] for c in cards}
    for o in bon.get('offers', []):
        o.setdefault('verified', TODAY)
        if o['cardId'] in OFFER_IDS:
            o['cardId'] = OFFER_IDS[o['cardId']]
        if o['cardId'] == 'bilt-blue':
            o['cardName'] = 'Bilt Blue'
        if o['cardId'] not in card_ids:
            for c in cards:
                if c['name'].lower().replace('card', '').strip() == (o.get('cardName') or '').lower().replace('card', '').strip():
                    o['cardId'] = c['id']
                    break
        for c in cards:
            if c['id'] == o['cardId']:
                o['cardName'] = c['name']
        if not o.get('bonus'):
            o['bonus'] = 'No welcome offer'
        for k in ('spend', 'months'):
            if o.get(k) is None:
                o[k] = 0
        if 'notes' in o and o['notes']:
            o['notes'] = o['notes'].replace('\u2014', ',')
    with open(os.path.join(DATA, 'bonuses.json'), 'w', encoding='utf-8') as f:
        json.dump(bon, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('merged', len(cards), 'cards,', len(bon.get('offers', [])), 'offers,', len(programs), 'programs')


if __name__ == '__main__':
    main(sys.argv[1])
