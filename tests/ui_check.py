"""Walks the app on a phone-sized viewport and saves screenshots. Fails on console errors.
Run from the repo root: python3 tests/ui_check.py [outdir]"""
import http.server
import os
import socketserver
import sys
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)
import random
PORT = random.randint(8800, 8999)
socketserver.TCPServer.allow_reuse_address = True


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    os.chdir(ROOT)
    with socketserver.TCPServer(('127.0.0.1', PORT), Quiet) as httpd:
        httpd.serve_forever()


threading.Thread(target=serve, daemon=True).start()
time.sleep(0.5)
errors = []


def shot(page, path, **kw):
    # Finish any running animation first so a sheet is never caught half way in.
    page.screenshot(path=path, animations='disabled', **kw)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'fonts.g' not in m.text else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:%d/' % PORT)
    page.wait_for_selector('.sheet .mascot')
    shot(page, os.path.join(OUT, '00-disclaimer.png'))
    page.click('.sheet button:has-text("I pay in full")')
    page.wait_for_selector('#btn-start')
    shot(page, os.path.join(OUT, '00-intro.png'))
    page.click('#btn-start')
    page.wait_for_selector('.sheet')
    shot(page, os.path.join(OUT, '01-onboarding.png'))

    def add(term, name):
        page.fill('.sheet input[type=search]', term)
        page.click('.sheet .card-row:has-text("%s")' % name)

    add('Freedom Flex', 'Chase Freedom Flex')
    add('Prime Visa', 'Prime Visa')
    add('Blue Cash Preferred', 'Blue Cash Preferred')
    add('Costco', 'Costco Anywhere')
    add('Custom Cash', 'Custom Cash')
    page.fill('.sheet input[type=search]', '')
    shot(page, os.path.join(OUT, '02-added.png'))
    page.click('.sheet button.btn:has-text("Done")')
    page.wait_for_selector('.sheet button:has-text("Yes, with Prime")')
    shot(page, os.path.join(OUT, '02b-prime-question.png'))
    page.click('.sheet button:has-text("Yes, with Prime")')
    page.wait_for_selector('.sheet .opt')
    shot(page, os.path.join(OUT, '03-priority.png'))
    page.click('.sheet button:has-text("Start using it")')
    page.wait_for_selector('#pay-body:not([hidden])')
    shot(page, os.path.join(OUT, '04-pay-empty.png'))

    page.click('.quick button:has-text("Gas")')
    page.wait_for_timeout(200)
    shot(page, os.path.join(OUT, '05-gas.png'))
    assert page.locator('#amount').count() == 0, 'there is no amount to type'
    winner = page.inner_text('.winner .name')
    print('gas winner:', winner)

    page.click('.where-chip')
    page.fill('#store-search', 'costco')
    page.click('.suggest button:has-text("Costco")')
    page.wait_for_timeout(200)
    shot(page, os.path.join(OUT, '06-costco.png'))
    print('costco winner:', page.inner_text('.winner .name'))
    print('others:', page.inner_text('.others').replace('\n', ' / '))
    over = page.evaluate('document.documentElement.scrollHeight - innerHeight')
    assert over <= 1, 'the Pay screen scrolls by %dpx' % over
    assert page.locator('#answer .pocket .others li').count() == 4, 'every other card is in the pocket'

    # The rest of the wallet opens the whole ranking; Best cards opens the best cards for the store
    page.click('#answer .pocket .more')
    page.wait_for_selector('.sheet .best-list li')
    shot(page, os.path.join(OUT, '07-best-costco.png'))
    assert 'Best cards for Costco' in page.inner_text('.sheet h2'), 'best cards sheet title'
    page.click('.sheet .close')
    page.wait_for_timeout(200)

    page.click('.where-chip')
    page.click('.quick button:has-text("Groceries")')
    page.wait_for_timeout(200)
    shot(page, os.path.join(OUT, '08-groceries.png'))
    print('groceries winner:', page.inner_text('.winner .name'))

    page.click('.tabs button[data-view=wallet]')
    page.wait_for_timeout(200)
    shot(page, os.path.join(OUT, '09-wallet.png'))
    page.click('.tile:has-text("Freedom Flex")')
    page.wait_for_selector('.sheet')
    page.wait_for_timeout(200)
    shot(page, os.path.join(OUT, '10-detail.png'), full_page=False)
    assert 'Perks and credits' in page.inner_text('.sheet'), 'perks box missing'
    assert page.get_attribute('.sheet a:has-text("Activate on the Chase site")', 'href').startswith('https://www.chase'), 'activation link missing'
    page.click('.perk-list li:has-text("DashPass") .switch')
    page.wait_for_timeout(200)
    assert 'All set' in page.inner_text('.sheet .perks'), 'perk toggle did not register'
    page.click('.sheet .close')

    page.click('.tabs button[data-view=offers]')
    page.wait_for_timeout(1300)
    shot(page, os.path.join(OUT, '11-offers.png'))
    # Compare: a weak-good-great scale for every kind of place, a dot on each, no card named
    scales = page.locator('.scale')
    assert scales.count() == 12 and page.locator('.scale .dot').count() == 12, 'a scale with a dot for each kind of place'
    assert all(t in page.inner_text('.scale >> nth=0') for t in ['Weak', 'Good', 'Great']), 'scale labels'
    page.click('.scale-link:has-text("Best cards for groceries")')
    page.wait_for_selector('.sheet .best-list li')
    page.wait_for_timeout(500)
    shot(page, os.path.join(OUT, '11b-best-groceries.png'))
    assert page.locator('.sheet .best-list li').count() >= 5, 'best cards for groceries listed'
    page.click('.sheet .best-row >> nth=0')
    page.wait_for_selector('.sheet .detail-hero')
    page.click('.sheet .close')
    page.wait_for_selector('.sheet .best-list', timeout=3000)
    page.click('.sheet .close')
    page.wait_for_timeout(200)

    page.click('.tabs button[data-view=more]')
    page.wait_for_timeout(200)
    shot(page, os.path.join(OUT, '12-more.png'))

    page.emulate_media(color_scheme='dark')
    page.click('.tabs button[data-view=pay]')
    page.wait_for_timeout(200)
    shot(page, os.path.join(OUT, '13-dark-pay.png'))

    # Shortcut URL (an old amount in it is ignored)
    page.goto('http://127.0.0.1:%d/?cat=dining&amt=32' % PORT)
    page.wait_for_selector('.winner')
    shot(page, os.path.join(OUT, '14-shortcut-dining.png'))
    print('dining winner:', page.inner_text('.winner .name'))

    page.emulate_media(color_scheme='light')

    # Choice card: add Bank of America Customized Cash, pick Gas, see it win at a gas station
    page.click('.tabs button[data-view=wallet]')
    page.click('button:has-text("Add a card")')
    page.wait_for_selector('.sheet')
    add('Customized', 'Customized Cash')
    page.click('.sheet button.btn:has-text("Done")')
    page.wait_for_timeout(200)
    page.click('.tile:has-text("Customized Cash")')
    page.wait_for_selector('.sheet')
    page.click('.sheet .chips button:has-text("Gas")')
    page.wait_for_timeout(200)
    page.click('.sheet button:has-text("Add a goal")')
    page.wait_for_selector('.sheet input[aria-label="Spend needed"]')
    page.fill('.sheet input[aria-label="Spend needed"]', '1000')
    page.fill('.sheet input[aria-label="Spent so far"]', '250')
    page.click('.sheet button:has-text("Save")')
    page.wait_for_timeout(200)
    shot(page, os.path.join(OUT, '15-choice-goal.png'))
    assert '$250.00 of $1,000.00' in page.inner_text('.sheet'), 'goal progress missing'
    page.click('.sheet .close')
    page.wait_for_timeout(200)
    assert 'to bonus' in page.inner_text('#view-wallet'), 'goal badge missing on the wallet'
    page.click('.tabs button[data-view=pay]')
    page.click('.where-chip')
    page.click('.quick button:has-text("Gas")')
    page.wait_for_timeout(200)
    print('gas winner with BofA on gas:', page.inner_text('.winner .name'))
    shot(page, os.path.join(OUT, '16-gas-bofa.png'))

    # Bonus priority puts the goal card first
    page.click('.tabs button[data-view=more]')
    page.click('.opt:has-text("Earning a bonus")')
    page.click('.tabs button[data-view=pay]')
    page.wait_for_timeout(200)
    assert 'Customized Cash' in page.inner_text('.winner .name'), 'goal card should lead in bonus mode'
    assert 'to go' in page.inner_text('#answer-more'), 'goal flag missing'

    # Best card anywhere, in Best cards for the store you are at
    page.click('.tabs button[data-view=pay]')
    page.click('.where-chip')
    page.fill('#store-search', 'whole foods')
    page.click('.suggest button:has-text("Whole Foods")')
    page.wait_for_timeout(200)
    page.click('#answer .pocket .more')
    page.wait_for_selector('.anywhere')
    page.wait_for_timeout(300)
    page.evaluate("document.querySelector('.anywhere').scrollIntoView({block:'center'})")
    page.wait_for_timeout(200)
    shot(page, os.path.join(OUT, '19-anywhere.png'))
    print('anywhere:', page.inner_text('.anywhere').replace('\n', ' / ')[:400])
    page.fill('.anywhere input[type=range]', '150')
    page.dispatch_event('.anywhere input[type=range]', 'input')
    page.dispatch_event('.anywhere input[type=range]', 'change')
    page.wait_for_timeout(300)
    print('anywhere at 150 trips:', page.inner_text('.anywhere').replace('\n', ' / ')[:400])
    shot(page, os.path.join(OUT, '20-anywhere-150.png'))
    page.click('.sheet .close')
    page.wait_for_timeout(200)

    # Custom card
    page.click('.tabs button[data-view=wallet]')
    page.click('#view-wallet button:has-text("Add a card")')
    page.wait_for_selector('.sheet')
    page.click('.sheet button:has-text("My card isn")')
    page.wait_for_selector('.sheet input[aria-label="Card name"]')
    page.fill('.sheet input[aria-label="Card name"]', 'Elgin Credit Union Visa')
    page.fill('.sheet input[aria-label="Rate on everything else"]', '1.5')
    page.click('.sheet button:has-text("Add a category")')
    page.fill('.sheet input[aria-label="Rate"]', '4')
    page.click('.sheet button:has-text("Add to my wallet")')
    page.wait_for_timeout(300)
    assert 'Elgin Credit Union Visa' in page.inner_text('#view-wallet'), 'custom card missing from wallet'
    page.click('.tabs button[data-view=pay]')
    page.click('.where-chip')
    page.click('.quick button:has-text("Gas")')
    page.wait_for_timeout(300)
    assert 'Elgin Credit Union' in page.text_content('#answer'), 'custom card not ranked'
    shot(page, os.path.join(OUT, '18-custom-card.png'))

    # Setup code round trip
    page.click('.tabs button[data-view=more]')
    page.click('button:has-text("Copy my setup code")')
    page.wait_for_timeout(200)
    code = page.input_value('textarea[aria-label="Setup code"]')
    assert code.startswith('WC1.'), 'setup code missing'
    page.click('button:has-text("Erase everything")')
    page.click('.sheet button:has-text("Yes, erase")')
    page.wait_for_timeout(300)
    assert not page.is_hidden('#pay-empty'), 'wallet should be empty after erase'
    page.click('.tabs button[data-view=more]')
    page.fill('textarea[aria-label="Setup code"]', code)
    page.click('button:has-text("Load a setup code")')
    page.wait_for_timeout(200)
    page.click('.tabs button[data-view=wallet]')
    page.wait_for_timeout(200)
    assert 'Customized Cash' in page.inner_text('#view-wallet'), 'setup code did not restore the wallet'
    shot(page, os.path.join(OUT, '17-restored.png'))

    # Body never wider than the viewport
    w = page.evaluate('document.documentElement.scrollWidth')
    assert w <= 390, 'horizontal overflow: %d' % w
    browser.close()

if errors:
    print('console errors:')
    for e in errors:
        print(' ', e)
    sys.exit(1)
print('ui check passed; screenshots in', OUT)
