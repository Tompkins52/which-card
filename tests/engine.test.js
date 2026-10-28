/* Engine tests. Run: node tests/engine.test.js */
var assert = require('assert');
var E = require('../engine.js');

var data = {
  categories: [
    { id: 'gas', name: 'Gas', icon: 'pump', quick: true }, { id: 'groceries', name: 'Groceries', icon: 'cart', quick: true },
    { id: 'dining', name: 'Dining', icon: 'fork', quick: true }, { id: 'online', name: 'Online shopping', icon: 'box', quick: true },
    { id: 'warehouse', name: 'Warehouse club', icon: 'pallet', quick: true }, { id: 'superstore', name: 'Walmart or Target', icon: 'store', quick: true },
    { id: 'drugstore', name: 'Drugstore', icon: 'pill', quick: true }, { id: 'travel', name: 'Travel', icon: 'plane', quick: true },
    { id: 'wallet-pay', name: 'Phone wallet', icon: 'tap' }, { id: 'rotating', name: 'Rotating', icon: 'dots' }, { id: 'other', name: 'Everything else', icon: 'dots', quick: true }
  ],
  merchants: [
    { id: 'amazon', name: 'Amazon', category: 'online', online: true },
    { id: 'costco', name: 'Costco', category: 'warehouse', networks: ['Visa'], note: 'Visa only' },
    { id: 'costco-gas', name: 'Costco Gas', category: 'gas', also: ['warehouse'], networks: ['Visa'] },
    { id: 'walmart', name: 'Walmart', category: 'superstore' },
    { id: 'shell', name: 'Shell', category: 'gas', fuel: true },
    { id: 'jewel-osco', name: 'Jewel-Osco', category: 'groceries' }
  ],
  valuations: { programs: {
    cashback: { name: 'Cash back', unit: 'percent', cash: 1, travel: 1, transfer: 1 },
    'chase-ur': { name: 'Chase Ultimate Rewards', unit: 'points', cash: 1.0, travel: 1.25, transfer: 2.0 },
    'amex-mr': { name: 'Membership Rewards', unit: 'points', cash: 0.6, travel: 1.0, transfer: 2.0 }
  } },
  cards: [
    { id: 'prime', name: 'Prime Visa', issuer: 'Chase', network: 'Visa', type: 'personal', program: 'cashback', annualFee: 0, fxFee: 0, base: 1, color: '#111111',
      earn: [{ merchant: 'amazon', rate: 5 }, { category: 'gas', rate: 2 }, { category: 'dining', rate: 2 }] },
    { id: 'flex', name: 'Freedom Flex', issuer: 'Chase', network: 'Mastercard', type: 'personal', program: 'chase-ur', annualFee: 0, fxFee: 3, base: 1, color: '#222222',
      earn: [{ category: 'dining', rate: 3 }, { category: 'drugstore', rate: 3 }],
      rotating: { rate: 5, cap: 1500, capPeriod: 'quarter', activation: true, calendar: { '2026-Q4': { categories: ['gas'], activateBy: '2026-12-14', label: 'Gas stations' }, '2027-Q1': null } },
      benefits: { purchaseProtection: true, cellPhoneProtection: true } },
    { id: 'bcp', name: 'Blue Cash Preferred', issuer: 'American Express', network: 'American Express', type: 'personal', program: 'cashback', annualFee: 95, fxFee: 2.7, base: 1, color: '#333333',
      earn: [{ category: 'groceries', rate: 6, cap: 6000, capPeriod: 'year', excludes: ['superstore', 'warehouse'] }, { category: 'gas', rate: 3, excludes: ['warehouse', 'superstore'] }] },
    { id: 'gold', name: 'Amex Gold', issuer: 'American Express', network: 'American Express', type: 'personal', program: 'amex-mr', annualFee: 325, fxFee: 0, base: 1, color: '#444444',
      earn: [{ category: 'dining', rate: 4 }, { category: 'groceries', rate: 4, cap: 25000, capPeriod: 'year', excludes: ['superstore', 'warehouse'] }] },
    { id: 'custom', name: 'Custom Cash', issuer: 'Citi', network: 'Mastercard', type: 'personal', program: 'cashback', annualFee: 0, fxFee: 3, base: 1, color: '#555555',
      earn: [], choice: { slots: 1, rate: 5, auto: true, options: ['gas', 'groceries', 'dining'], cap: 500, capPeriod: 'cycle' } },
    { id: 'bofa', name: 'Customized Cash', issuer: 'Bank of America', network: 'Visa', type: 'personal', program: 'cashback', annualFee: 0, fxFee: 3, base: 1, color: '#666666',
      earn: [], choice: { slots: 1, rate: 3, options: ['gas', 'online', 'dining'], cap: 2500, capPeriod: 'quarter', secondTier: { rate: 2, categories: ['groceries', 'warehouse'], sharesCap: true } } },
    { id: 'altitude', name: 'Altitude Reserve', issuer: 'U.S. Bank', network: 'Visa', type: 'personal', program: 'cashback', annualFee: 400, fxFee: 0, base: 1, color: '#777777',
      earn: [{ category: 'wallet-pay', rate: 3 }] }
  ]
};

var Q4 = new Date('2026-10-28T12:00:00');
var Q1 = new Date('2027-01-15T12:00:00');
function st(wallet, prefs) { return { wallet: wallet, prefs: Object.assign({ priority: 'cash', redeem: {} }, prefs || {}) }; }
function ids(res) { return res.results.map(function (r) { return r.card.id; }); }

// 1. Merchant rule beats category rule
var r = E.recommend({ merchant: 'amazon', amount: 100 }, st([{ cardId: 'prime' }, { cardId: 'flex' }]), data, Q4);
assert.strictEqual(r.best.card.id, 'prime');
assert.strictEqual(r.best.rate, 5);
assert.strictEqual(Math.round(r.best.valueCents), 500);

// 2. Rotating applies only in the matching quarter, with an activation warning
r = E.recommend({ merchant: 'shell', amount: 50 }, st([{ cardId: 'prime' }, { cardId: 'flex' }]), data, Q4);
assert.strictEqual(r.best.card.id, 'flex');
assert.strictEqual(r.best.rate, 5);
assert.ok(r.best.warnings.some(function (w) { return /Activate/.test(w); }), 'activation warning');
r = E.recommend({ merchant: 'shell', amount: 50 }, st([{ cardId: 'prime' }, { cardId: 'flex', activated: { '2026-Q4': true } }]), data, Q4);
assert.strictEqual(r.best.warnings.length, 0);
r = E.recommend({ merchant: 'shell', amount: 50 }, st([{ cardId: 'prime' }, { cardId: 'flex' }]), data, Q1);
assert.strictEqual(r.best.card.id, 'prime', 'rotating does not carry into Q1');

// 3. Caps: blended rate past the cap, base rate when the cap is used up
var flexEntry = { cardId: 'flex', activated: { '2026-Q4': true }, purchases: [{ date: '2026-10-20T10:00:00', amount: 1450, pool: 'rotating' }] };
r = E.recommend({ merchant: 'shell', amount: 100 }, st([flexEntry]), data, Q4);
assert.strictEqual(Math.round(r.best.units), 50 * 5 + 50 * 1);
assert.ok(r.best.warnings.some(function (w) { return /cap/.test(w); }));
flexEntry.purchases[0].amount = 1500;
r = E.recommend({ merchant: 'shell', amount: 100 }, st([flexEntry]), data, Q4);
assert.strictEqual(r.best.effectiveRate, 1);
// a purchase last quarter does not count
flexEntry.purchases[0].date = '2026-07-20T10:00:00';
r = E.recommend({ merchant: 'shell', amount: 100 }, st([flexEntry]), data, Q4);
assert.strictEqual(r.best.effectiveRate, 5);

// 4. Network acceptance: Costco rejects Amex and the Amex card sinks to the bottom
r = E.recommend({ merchant: 'costco', amount: 200 }, st([{ cardId: 'bcp' }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(r.best.card.id, 'prime');
assert.strictEqual(r.results[1].accepted, false);
assert.ok(r.notes.length === 1);

// 5. Priority changes the valuation and the ranking
var w = [{ cardId: 'gold' }, { cardId: 'prime' }];
r = E.recommend({ category: 'dining', amount: 100 }, st(w, { priority: 'cash' }), data, Q4);
assert.strictEqual(r.best.card.id, 'gold');  // 4 x 0.6 = 2.4 beats 2
assert.strictEqual(Math.round(r.best.valueCents), 240);
r = E.recommend({ category: 'dining', amount: 100 }, st(w, { priority: 'travel' }), data, Q4);
assert.strictEqual(Math.round(r.best.valueCents), 800);
r = E.recommend({ category: 'dining', amount: 100 }, st(w, { priority: 'travel', redeem: { 'amex-mr': 'cash' } }), data, Q4);
assert.strictEqual(Math.round(r.best.valueCents), 240, 'per-program override wins');

// 6. Choice cards
r = E.recommend({ merchant: 'shell', amount: 40 }, st([{ cardId: 'bofa', choices: ['online'] }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(r.best.card.id, 'prime');
r = E.recommend({ merchant: 'shell', amount: 40 }, st([{ cardId: 'bofa', choices: ['gas'] }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(r.best.card.id, 'bofa');
assert.strictEqual(r.best.rate, 3);
r = E.recommend({ merchant: 'costco', amount: 40 }, st([{ cardId: 'bofa', choices: ['gas'] }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(r.best.rate, 2, 'second tier at warehouse clubs');
r = E.recommend({ merchant: 'jewel-osco', amount: 40 }, st([{ cardId: 'custom' }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(r.best.rate, 1, 'an automatic-category card earns base until the holder names its category');
r = E.recommend({ merchant: 'jewel-osco', amount: 40 }, st([{ cardId: 'custom', choices: ['groceries'] }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(r.best.card.id, 'custom');
assert.ok(r.best.warnings.some(function (x) { return /one category/.test(x); }));

// 7. Exclusions: grocery bonus does not apply at Walmart; gas bonus does not apply at Costco Gas for the Amex
r = E.recommend({ merchant: 'walmart', amount: 80 }, st([{ cardId: 'bcp' }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(r.best.card.id, 'prime');
assert.strictEqual(r.results[1].rate, 1);
r = E.evaluateCard(E.cardById(data, 'bcp'), {}, { merchant: 'costco-gas', amount: 50 }, { priority: 'cash' }, data, Q4);
assert.strictEqual(r.rate, 1);
assert.strictEqual(r.accepted, false);

// 8. Bonus priority puts the card with an open goal first
r = E.recommend({ category: 'dining', amount: 30 }, st([{ cardId: 'gold' }, { cardId: 'prime', goals: [{ label: 'Welcome bonus', target: 4000, progress: 1000, deadline: '2027-01-31' }] }], { priority: 'bonus' }), data, Q4);
assert.strictEqual(r.best.card.id, 'prime');
assert.strictEqual(r.best.goal.remaining, 3000);
r = E.recommend({ category: 'dining', amount: 30 }, st([{ cardId: 'gold' }, { cardId: 'prime', goals: [{ label: 'Welcome bonus', target: 4000, progress: 4000 }] }], { priority: 'bonus' }), data, Q4);
assert.strictEqual(r.best.card.id, 'gold', 'a met goal no longer boosts');

// 9. Abroad: foreign fee counts against the card
r = E.recommend({ category: 'dining', amount: 100, abroad: true }, st([{ cardId: 'flex' }, { cardId: 'gold' }], { priority: 'cash' }), data, Q4);
assert.strictEqual(r.best.card.id, 'gold');  // flex: 3 pts x 1c = 300 - 300 fee = 0; gold: 4 x 0.6 = 240
assert.ok(r.results[1].warnings.some(function (x) { return /foreign/.test(x); }));

// 10. Phone wallet rule
r = E.recommend({ category: 'other', amount: 100, payMethod: 'wallet' }, st([{ cardId: 'altitude' }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(r.best.card.id, 'altitude');
r = E.recommend({ category: 'other', amount: 100, payMethod: 'card' }, st([{ cardId: 'altitude' }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(r.best.rate, 1);

// 11. No amount still ranks by effective value
r = E.recommend({ category: 'groceries' }, st([{ cardId: 'gold' }, { cardId: 'bcp' }], { priority: 'cash' }), data, Q4);
assert.strictEqual(r.best.card.id, 'bcp');
assert.strictEqual(r.best.effectivePercent, 6);

// 12. Gaps: a wallet with only the Prime card is missing a grocery card
var g = E.gaps(st([{ cardId: 'prime' }]), data, Q4);
assert.ok(g.some(function (x) { return x.category.id === 'groceries' && x.card.id === 'bcp'; }), 'grocery gap found');

// 13. Multiplier (Preferred Rewards style boost)
r = E.recommend({ merchant: 'shell', amount: 100 }, st([{ cardId: 'bofa', choices: ['gas'], multiplier: 1.75 }, { cardId: 'prime' }]), data, Q4);
assert.strictEqual(Math.round(r.best.units * 100) / 100, 525);

// 14. Quarter helpers
assert.strictEqual(E.quarterOf(Q4), '2026-Q4');
assert.strictEqual(E.nextQuarterKey(Q4), '2027-Q1');
assert.strictEqual(E.periodKey('year', Q4), 'year:2026');

console.log('engine tests passed');

// 15. Day-and-time windows (Friday and Saturday 6 PM to 6 AM Eastern)
data.cards.push({ id: 'elite', name: 'Strata Elite', issuer: 'Citi', network: 'Mastercard', type: 'personal', program: 'cashback', annualFee: 595, fxFee: 0, base: 1.5, color: '#111111',
  earn: [{ category: 'dining', rate: 6, when: { days: [5, 6], start: 18, end: 6, tz: 'America/New_York' }, label: 'Citi Nights dining' }, { category: 'dining', rate: 3 }] });
var fridayNight = new Date('2026-10-30T23:30:00-04:00');   // Friday 11:30 PM Eastern
var saturdayEarly = new Date('2026-10-31T03:00:00-04:00'); // Saturday 3 AM Eastern, still inside the Friday window
var sundayEarly = new Date('2026-11-01T03:00:00-04:00');   // Sunday 3 AM, inside the Saturday window
var mondayEarly = new Date('2026-11-02T03:00:00-05:00');   // Monday 3 AM, outside
var tuesdayDinner = new Date('2026-11-03T19:00:00-05:00'); // Tuesday 7 PM, outside
r = E.evaluateCard(E.cardById(data, 'elite'), {}, { category: 'dining', amount: 100 }, { priority: 'cash' }, data, fridayNight);
assert.strictEqual(r.rate, 6);
r = E.evaluateCard(E.cardById(data, 'elite'), {}, { category: 'dining', amount: 100 }, { priority: 'cash' }, data, saturdayEarly);
assert.strictEqual(r.rate, 6);
r = E.evaluateCard(E.cardById(data, 'elite'), {}, { category: 'dining', amount: 100 }, { priority: 'cash' }, data, sundayEarly);
assert.strictEqual(r.rate, 6);
r = E.evaluateCard(E.cardById(data, 'elite'), {}, { category: 'dining', amount: 100 }, { priority: 'cash' }, data, mondayEarly);
assert.strictEqual(r.rate, 3);
r = E.evaluateCard(E.cardById(data, 'elite'), {}, { category: 'dining', amount: 100 }, { priority: 'cash' }, data, tuesdayDinner);
assert.strictEqual(r.rate, 3);

// 16. Network override on the wallet entry
r = E.evaluateCard(E.cardById(data, 'flex'), { network: 'Visa' }, { merchant: 'costco', amount: 100 }, { priority: 'cash' }, data, Q4);
assert.strictEqual(r.accepted, true);

console.log('window and network tests passed');

// 17. Membership-dependent rates
data.cards.push({ id: 'primev', name: 'Prime Visa', issuer: 'Chase', network: 'Visa', type: 'personal', program: 'cashback', annualFee: 0, fxFee: 0, base: 1, color: '#111111',
  earn: [{ merchant: 'amazon', rate: 5, requires: 'amazon-prime' }, { merchant: 'amazon', rate: 3, unless: 'amazon-prime' }] });
r = E.evaluateCard(E.cardById(data, 'primev'), { memberships: { 'amazon-prime': true } }, { merchant: 'amazon', amount: 100 }, { priority: 'cash' }, data, Q4);
assert.strictEqual(r.rate, 5);
r = E.evaluateCard(E.cardById(data, 'primev'), { memberships: { 'amazon-prime': false } }, { merchant: 'amazon', amount: 100 }, { priority: 'cash' }, data, Q4);
assert.strictEqual(r.rate, 3);
r = E.evaluateCard(E.cardById(data, 'primev'), {}, { merchant: 'amazon', amount: 100 }, { priority: 'cash' }, data, Q4);
assert.strictEqual(r.rate, 3, 'unanswered counts as no membership');
console.log('membership tests passed');
