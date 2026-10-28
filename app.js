/* Which Card: app shell. Depends on engine.js (WhichCardEngine). */
(function () {
  'use strict';
  var E = window.WhichCardEngine;
  var PREVIEW = !!window.__PREVIEW;
  var STATE_KEY = 'whichcard.state.v1';
  var DATA_KEY = 'whichcard.data.v1';
  var DATA_FILES = ['categories', 'merchants', 'cards', 'bonuses', 'valuations'];
  var CONTACT = 'admin@tompkinssoftwaresystems.com';

  var data = null;
  var state = loadState();
  var ctx = { merchant: null, category: null, customName: '', amount: '', payMethod: state.prefs.payMethod || 'card' };
  var nearby = [];
  var view = 'pay';
  var onboarding = false;

  /* ---------- storage ---------- */
  function loadState() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { s = null; }
    s = s || {};
    s.wallet = s.wallet || [];
    s.prefs = s.prefs || {};
    if (!s.prefs.priority) s.prefs.priority = 'cash';
    if (!s.prefs.payMethod) s.prefs.payMethod = 'card';
    s.prefs.redeem = s.prefs.redeem || {};
    return s;
  }
  function saveState() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* storage may be unavailable */ } }
  function walletEntry(cardId) { for (var i = 0; i < state.wallet.length; i++) if (state.wallet[i].cardId === cardId) return state.wallet[i]; return null; }

  /* ---------- data ---------- */
  function loadData() {
    var inline = window.__WHICHCARD_DATA;
    if (inline) { data = normalizeData(inline); return Promise.resolve(data); }
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(DATA_KEY) || 'null'); } catch (e) { cached = null; }
    if (cached) data = normalizeData(cached);
    var fresh = fetchData().then(function (d) {
      if (!d) return data;
      var changed = !cached || cached.cards.version !== d.cards.version;
      data = normalizeData(d);
      try { localStorage.setItem(DATA_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
      if (cached && changed) { toast('Card data updated (' + fmtLongDate(d.cards.version) + ')'); renderAll(); }
      return data;
    });
    return cached ? Promise.resolve(data) : fresh;
  }
  function fetchData() {
    if (!navigator.onLine && typeof navigator.onLine === 'boolean') return Promise.resolve(null);
    return Promise.all(DATA_FILES.map(function (name) {
      return fetch('data/' + name + '.json?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(name); return r.json(); });
    })).then(function (parts) {
      var d = {}; DATA_FILES.forEach(function (n, i) { d[n] = parts[i]; }); return d;
    }).catch(function () { return null; });
  }
  function normalizeData(d) {
    var out = {
      categories: d.categories.categories, merchants: d.merchants.merchants, cards: d.cards.cards,
      bonuses: d.bonuses, valuations: d.valuations, version: d.cards.version, verified: d.cards.verified || d.cards.version
    };
    out.cards.forEach(function (c) { if (!c.color) c.color = issuerColor(c.issuer); });
    return out;
  }
  function issuerColor(issuer) {
    return { 'Chase': '#1B4F8A', 'American Express': '#2B6CB0', 'Capital One': '#8A1F2B', 'Citi': '#12365D', 'Discover': '#C8541D', 'Bank of America': '#9B1B30', 'Wells Fargo': '#8E1B1B', 'U.S. Bank': '#1E3A6B' }[issuer] || '#3C4A5A';
  }

  /* ---------- helpers ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (k === 'hidden') el.hidden = !!v;
      else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function icon(name, cls) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); if (cls) s.setAttribute('class', cls); s.innerHTML = '<use href="#i-' + name + '"/>'; return s; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function money(n) { return '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function cents(c) { return money(c / 100); }
  function fmtLongDate(s) { if (!s) return ''; var d = new Date(s + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function textColorFor(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 'light-text';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; return lum > 0.6 ? 'dark-text' : 'light-text';
  }
  // Original card art drawn from the card's own color and finish. No issuer artwork or logos are used.
  function shade(hex, amt) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '#777777'); var n = parseInt(m ? m[1] : '777777', 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function c(v) { v = Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)); return Math.max(0, Math.min(255, v)); }
    return '#' + [c(r), c(g), c(b)].map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  var artSeq = 0;
  function cardArt(card, width, opts) {
    opts = opts || {};
    var id = 'ca' + (++artSeq);
    var finish = card.finish || 'plastic';
    var base = card.color || '#3C4A5A';
    var c1, c2, c3, ink, chipA = '#E7C56A', chipB = '#B8902F';
    if (finish === 'silver') { c1 = '#F2F4F6'; c2 = '#C9D0D8'; c3 = '#9AA6B4'; ink = '#1B222B'; }
    else if (finish === 'gold') { c1 = '#F3E2A6'; c2 = '#D6B459'; c3 = '#A98528'; ink = '#2A2208'; chipA = '#FFF4CC'; chipB = '#C9A14A'; }
    else if (finish === 'black') { c1 = '#3A3F47'; c2 = '#17191E'; c3 = '#07080A'; ink = '#F3F4F6'; }
    else if (finish === 'metal') { c1 = shade(base, 0.35); c2 = base; c3 = shade(base, -0.45); ink = textColorFor(base) === 'dark-text' ? '#101418' : '#FFFFFF'; }
    else { c1 = shade(base, 0.22); c2 = base; c3 = shade(base, -0.3); ink = textColorFor(base) === 'dark-text' ? '#101418' : '#FFFFFF'; }
    var W = 320, H = 200, big = width >= 120, mid = width >= 60;
    var name = card.name || '';
    var lines = [];
    if (big) {
      var words = name.split(' '), line = '';
      words.forEach(function (w) { if ((line + ' ' + w).trim().length > 18 && line) { lines.push(line); line = w; } else line = (line + ' ' + w).trim(); });
      if (line) lines.push(line);
      lines = lines.slice(0, 2);
    }
    var net = { 'American Express': 'AMEX', 'Mastercard': 'MASTERCARD', 'Visa': 'VISA', 'Discover': 'DISCOVER', 'Store': 'STORE CARD' }[card.network] || (card.network || '').toUpperCase();
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + width + '" height="' + Math.round(width * H / W) + '" role="img" aria-label="' + escapeAttr(name) + '">' +
      '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset=".55" stop-color="' + c2 + '"/><stop offset="1" stop-color="' + c3 + '"/></linearGradient>' +
      '<linearGradient id="' + id + 's" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="' + (finish === 'black' ? '.08' : '.22') + '"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + id + 'c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + chipA + '"/><stop offset="1" stop-color="' + chipB + '"/></linearGradient>' +
      '<clipPath id="' + id + 'k"><rect width="' + W + '" height="' + H + '" rx="18"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + 'k)"><rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'g)"/>' +
      '<path d="M-40 0 L140 0 L60 200 L-120 200 Z" fill="url(#' + id + 's)"/>' +
      (finish === 'silver' || finish === 'gold' || finish === 'metal' ? '<path d="M0 120 Q160 60 320 150 L320 200 L0 200 Z" fill="#000" fill-opacity=".07"/>' : '') +
      '</g>' +
      '<rect x="28" y="' + (big ? 70 : 62) + '" width="52" height="38" rx="7" fill="url(#' + id + 'c)"/><path d="M28 ' + (big ? 89 : 81) + ' h52 M54 ' + (big ? 70 : 62) + ' v38" stroke="' + chipB + '" stroke-opacity=".7" stroke-width="2" fill="none"/>' +
      '<g fill="none" stroke="' + ink + '" stroke-opacity=".75" stroke-width="3" stroke-linecap="round" transform="translate(' + (big ? 100 : 92) + ',' + (big ? 89 : 81) + ')"><path d="M0-9a13 13 0 0 1 0 18"/><path d="M8-15a21 21 0 0 1 0 30"/><path d="M16-21a29 29 0 0 1 0 42"/></g>' +
      (mid ? '<text x="28" y="40" fill="' + ink + '" fill-opacity=".8" font-family="Figtree, Helvetica, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="2">' + escapeAttr((card.issuer || '').toUpperCase()) + '</text>' : '') +
      (big ? lines.map(function (l, i) { return '<text x="28" y="' + (142 + i * 24) + '" fill="' + ink + '" font-family="Bricolage Grotesque, Figtree, Helvetica, Arial, sans-serif" font-size="' + (lines.length > 1 ? 22 : 24) + '" font-weight="800">' + escapeAttr(l) + '</text>'; }).join('') : '') +
      '<text x="' + (W - 28) + '" y="' + (H - 22) + '" text-anchor="end" fill="' + ink + '" fill-opacity=".9" font-family="Figtree, Helvetica, Arial, sans-serif" font-size="' + (mid ? 16 : 26) + '" font-weight="800" font-style="italic" letter-spacing="1">' + net + '</text>' +
      '</svg>';
    var wrap = document.createElement('span');
    wrap.className = 'card-art' + (opts.cls ? ' ' + opts.cls : '');
    wrap.innerHTML = svg;
    return wrap;
  }
  function escapeAttr(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function rateText(r, unit, suffix) {
    var v = Math.round(r * 100) / 100;
    return unit === 'percent' ? v + '%' : v + 'x' + (suffix ? ' ' + unit : '');
  }
  function pctText(p) { return (Math.round(p * 10) / 10) + '%'; }
  function cat(id) { return E.categoryById(data, id) || { id: id, name: id, icon: 'dots' }; }
  var TINTS = { gas: '#E0801B', groceries: '#1F9D55', dining: '#D9443A', online: '#7C5CD6', warehouse: '#1C8DC9', superstore: '#D63E8C', drugstore: '#139E8C', travel: '#2F6FE0', transit: '#5A5DD6', streaming: '#E0366A', phone: '#0E9A73', 'home-improvement': '#E26A1B', other: '#5F6B7A', flights: '#2F6FE0', hotels: '#2F6FE0', 'rental-car': '#5A5DD6', entertainment: '#D63E8C', utilities: '#0E9A73', 'department-store': '#7C5CD6', fitness: '#1F9D55', 'ev-charging': '#139E8C', rent: '#5F6B7A', 'portal-travel': '#2F6FE0' };
  function tintFor(id) { return TINTS[id] || '#5F6B7A'; }
  function parseAmount(s) { var n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; }
  function quarterLabel(q) { var m = /^(\d{4})-Q(\d)$/.exec(q); return m ? 'Q' + m[2] + ' ' + m[1] : q; }
  function programName(id) { var p = data.valuations.programs[id]; return p ? p.name : id; }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg, action, fn) {
    var root = document.getElementById('toast-root'); clear(root);
    var t = h('div', { class: 'toast', role: 'status' }, msg, action ? h('button', { onclick: function () { fn(); clear(root); } }, action) : null);
    root.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { clear(root); }, action ? 6000 : 2600);
  }

  /* ---------- sheet ---------- */
  function openSheet(title, bodyNodes, opts) {
    opts = opts || {};
    var root = document.getElementById('sheet-root'); clear(root);
    var body = h('div', { class: 'sheet-body' }, h('div', { class: 'wrap stack' }, bodyNodes));
    var sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'grab' }),
      h('div', { class: 'wrap sheet-head' }, h('h2', null, title), opts.noClose ? null : h('button', { class: 'close', 'aria-label': 'Close', onclick: closeSheet }, icon('x'))),
      body);
    var back = h('div', { class: 'sheet-backdrop', onclick: function () { if (!opts.noClose) closeSheet(); } });
    root.appendChild(back); root.appendChild(sheet);
    document.body.style.overflow = 'hidden';
    return { sheet: sheet, body: body };
  }
  function closeSheet() { clear(document.getElementById('sheet-root')); document.body.style.overflow = ''; if (typeof sheetOnClose === 'function') { var f = sheetOnClose; sheetOnClose = null; f(); } }
  var sheetOnClose = null;

  /* ---------- first-run disclaimer ---------- */
  function mascotSvg() {
    return '<svg viewBox="0 0 240 180" width="200" height="150" role="img" aria-label="A goofy cartoon credit card">' +
      '<defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E7D5B"/><stop offset="1" stop-color="#12352B"/></linearGradient></defs>' +
      '<g transform="rotate(-8 120 95)">' +
      '<rect x="30" y="40" width="180" height="112" rx="14" fill="url(#mg)"/>' +
      '<rect x="30" y="62" width="180" height="16" fill="#0B241D" opacity=".9"/>' +
      '<rect x="46" y="118" width="38" height="24" rx="5" fill="#D4A84B"/><path d="M46 130h38M65 118v24" stroke="#A47E2C" stroke-width="2"/>' +
      '<circle cx="104" cy="104" r="17" fill="#fff"/><circle cx="150" cy="100" r="22" fill="#fff"/>' +
      '<circle cx="109" cy="106" r="7" fill="#101418"/><circle cx="144" cy="103" r="10" fill="#101418"/>' +
      '<circle cx="111" cy="103" r="2.5" fill="#fff"/><circle cx="147" cy="99" r="3" fill="#fff"/>' +
      '<path d="M90 86 q14 -10 26 -2" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M132 74 q18 -4 32 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M104 128 q30 22 60 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M128 139 q8 14 2 24 q-10 -6 -2 -24z" fill="#E86A6A"/>' +
      '<text x="182" y="146" text-anchor="end" fill="#fff" font-family="Figtree, Helvetica, Arial, sans-serif" font-size="11" font-weight="800" font-style="italic" opacity=".8">PAYS IN FULL</text>' +
      '</g>' +
      '<path d="M40 60 q-22 -4 -28 18" fill="none" stroke="#12352B" stroke-width="6" stroke-linecap="round"/><circle cx="12" cy="80" r="7" fill="#12352B"/>' +
      '<path d="M206 70 q22 -16 26 2" fill="none" stroke="#12352B" stroke-width="6" stroke-linecap="round"/><circle cx="232" cy="72" r="7" fill="#12352B"/>' +
      '</svg>';
  }
  function openDisclaimer() {
    var art = h('div', { class: 'mascot' }); art.innerHTML = mascotSvg();
    var nodes = [
      art,
      h('h2', { style: 'text-align:center' }, 'Quick word before we start'),
      h('p', { style: 'text-align:center' }, 'This was built for people who pay their statement in full every month so they never pay interest. Rewards are the only reason to pick one card over another.'),
      h('p', { class: 'muted', style: 'text-align:center' }, 'If you carry a balance and pay interest: no judgment, carry on exactly as you are. The rest of us appreciate you funding these rewards.'),
      h('button', { class: 'btn primary block', onclick: function () { state.disclaimed = true; saveState(); closeSheet(); } }, 'I pay in full. Let\u2019s go'),
      h('button', { class: 'btn block', onclick: function () { state.disclaimed = true; saveState(); closeSheet(); toast('Thank you for your service.'); } }, 'I pay interest')
    ];
    openSheet('Welcome', nodes, { noClose: true });
    sheetOnClose = null;
  }

  /* ---------- views ---------- */
  function showView(name) {
    view = name;
    ['pay', 'wallet', 'offers', 'more'].forEach(function (v) {
      document.getElementById('view-' + v).hidden = v !== name;
    });
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-view') === name); });
    window.scrollTo(0, 0);
    renderView(name);
  }
  function renderView(name) {
    if (name === 'pay') renderPay();
    else if (name === 'wallet') renderWallet();
    else if (name === 'offers') renderOffers();
    else if (name === 'more') renderMore();
  }
  function renderAll() { renderView(view); }

  /* ---------- Pay ---------- */
  function renderPay() {
    var empty = document.getElementById('pay-empty'), body = document.getElementById('pay-body');
    if (!state.wallet.length) { empty.hidden = false; body.hidden = true; return; }
    empty.hidden = true; body.hidden = false;
    renderBanner();
    renderWhere();
    document.getElementById('pm-card').classList.toggle('on', ctx.payMethod !== 'wallet');
    document.getElementById('pm-wallet').classList.toggle('on', ctx.payMethod === 'wallet');
    renderAnswer();
  }

  function renderBanner() {
    var root = document.getElementById('banner'); clear(root); root.hidden = true;
    var q = E.quarterOf(new Date());
    state.dismissed = state.dismissed || {};
    if (state.dismissed['activate:' + q]) return;
    var pending = [];
    state.wallet.forEach(function (entry) {
      var card = E.cardById(data, entry.cardId); if (!card || !card.rotating || !card.rotating.activation) return;
      var cal = card.rotating.calendar && card.rotating.calendar[q]; if (!cal) return;
      if (!(entry.activated && entry.activated[q])) pending.push({ card: card, entry: entry, cal: cal });
    });
    if (pending.length) {
      var p = pending[0];
      root.hidden = false;
      root.appendChild(h('div', { class: 'note warn', style: 'display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap' },
        h('span', null, h('b', null, p.card.name + ': '), 'activate the ' + quarterLabel(q) + ' ' + rateText(p.card.rotating.rate, E.unitFor(p.card.program, data)) + ' categories' + (p.cal.activateBy ? ' by ' + E.fmtDate(p.cal.activateBy) : '') + (pending.length > 1 ? ' (and ' + (pending.length - 1) + ' more)' : '')),
        h('span', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          h('button', { class: 'btn', style: 'min-height:36px;padding:6px 10px', onclick: function () { state.dismissed['activate:' + q] = true; saveState(); renderBanner(); } }, 'Later'),
          p.card.rotating.activationUrl ? h('a', { class: 'btn primary', style: 'min-height:36px;padding:6px 10px', href: p.card.rotating.activationUrl, target: '_blank', rel: 'noopener' }, 'Activate') : null,
          h('button', { class: 'btn', style: 'min-height:36px;padding:6px 10px', onclick: function () { p.entry.activated = p.entry.activated || {}; p.entry.activated[q] = true; saveState(); renderPay(); toast('Marked ' + p.card.name + ' as activated'); } }, 'Done, activated'))));
      return;
    }
    if (state.dismissed['perks:' + q]) return;
    var perkCards = [];
    state.wallet.forEach(function (entry) {
      var card = E.cardById(data, entry.cardId); if (!card) return;
      var c = perkCounts(card, entry, new Date());
      if (c.toActivate) perkCards.push({ card: card, entry: entry, n: c.toActivate });
    });
    if (!perkCards.length) return;
    var pk = perkCards[0];
    root.hidden = false;
    root.appendChild(h('div', { class: 'note', style: 'display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap' },
      h('span', null, h('b', null, pk.card.name + ': '), pk.n + (pk.n === 1 ? ' perk is' : ' perks are') + ' not activated yet' + (perkCards.length > 1 ? ' (other cards too)' : '')),
      h('span', { style: 'display:flex;gap:8px' },
        h('button', { class: 'btn', style: 'min-height:36px;padding:6px 10px', onclick: function () { state.dismissed['perks:' + q] = true; saveState(); renderBanner(); } }, 'Later'),
        h('button', { class: 'btn primary', style: 'min-height:36px;padding:6px 10px', onclick: function () { openCardDetail(pk.card.id); } }, 'Review'))));
  }

  function currentWhere() {
    if (ctx.merchant) { var m = E.merchantById(data, ctx.merchant); return { title: m ? m.name : ctx.merchant, sub: cat(m ? m.category : 'other').name, icon: cat(m ? m.category : 'other').icon }; }
    if (ctx.category) { var c = cat(ctx.category); return { title: ctx.customName || c.name, sub: ctx.customName ? c.name : c.desc, icon: c.icon }; }
    return null;
  }

  function renderWhere() {
    var root = document.getElementById('where'); clear(root);
    var w = currentWhere();
    if (w) {
      root.appendChild(h('button', { class: 'where-chip', onclick: function () { ctx.merchant = null; ctx.category = null; ctx.customName = ''; renderPay(); } },
        h('span', { class: 'ic', style: '--tint:' + tintFor(ctx.category || (ctx.merchant ? (E.merchantById(data, ctx.merchant) || {}).category : 'other')) }, icon(w.icon)),
        h('span', { class: 't' }, h('b', null, w.title), h('span', null, w.sub)),
        h('span', { class: 'change' }, 'Change')));
      if (nearby.length > 1) {
        root.appendChild(h('div', { class: 'nearby', style: 'margin-top:8px' }, nearby.slice(0, 5).map(function (n) {
          var same = n.merchant ? n.merchant === ctx.merchant : (!ctx.merchant && n.category === ctx.category && n.name === ctx.customName);
          if (same) return null;
          return h('button', { onclick: function () { applyNearby(n); } }, 'Not here? ' + n.name);
        })));
      }
      return;
    }
    var picker = h('div', { class: 'picker' });
    var input = h('input', { id: 'store-search', type: 'search', placeholder: 'Store, website or app', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Store name' });
    var suggest = h('ul', { class: 'suggest', hidden: true });
    input.addEventListener('input', function () { renderSuggest(input.value, suggest); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var first = suggest.querySelector('button');
        if (first) first.click();
        else if (input.value.trim()) { setWhere(null, 'other', input.value.trim()); }
      }
    });
    picker.appendChild(h('div', { class: 'search' }, icon('search'), input,
      PREVIEW ? null : h('button', { class: 'locate', 'aria-label': 'Find my store with location', onclick: locate }, icon('pin'))));
    picker.appendChild(suggest);
    if (nearby.length) {
      picker.appendChild(h('div', { class: 'nearby' }, nearby.slice(0, 5).map(function (n) { return h('button', { onclick: function () { applyNearby(n); } }, icon('pin', 'mini'), ' ' + n.name); })));
    }
    var quick = h('div', { class: 'quick', role: 'group', 'aria-label': 'Quick picks' });
    data.categories.filter(function (c) { return c.quick; }).forEach(function (c) {
      quick.appendChild(h('button', { style: '--tint:' + tintFor(c.id), onclick: function () { setWhere(null, c.id, ''); } }, h('span', { class: 'qi' }, icon(c.icon)), h('span', null, c.short)));
    });
    picker.appendChild(quick);
    root.appendChild(picker);
  }

  function renderSuggest(q, ul) {
    clear(ul);
    q = q.trim().toLowerCase();
    if (!q) { ul.hidden = true; return; }
    var hits = [];
    data.merchants.forEach(function (m) {
      var names = [m.name].concat(m.aliases || []);
      var score = 0;
      names.forEach(function (n) { n = n.toLowerCase(); if (n === q) score = Math.max(score, 3); else if (n.indexOf(q) === 0) score = Math.max(score, 2); else if (n.indexOf(q) >= 0) score = Math.max(score, 1); });
      if (score) hits.push({ score: score + (m.popular ? .5 : 0), m: m });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    var catHits = data.categories.filter(function (c) { return c.quick && c.name.toLowerCase().indexOf(q) >= 0; });
    var items = hits.slice(0, 6).map(function (x) {
      var c = cat(x.m.category);
      return h('li', null, h('button', { onclick: function () { setWhere(x.m.id, null, ''); } }, icon(c.icon), x.m.name, h('span', { class: 'cat' }, c.name)));
    });
    catHits.slice(0, 3).forEach(function (c) { items.push(h('li', null, h('button', { onclick: function () { setWhere(null, c.id, ''); } }, icon(c.icon), c.name, h('span', { class: 'cat' }, 'category')))); });
    if (!items.length) items.push(h('li', null, h('button', { onclick: function () { setWhere(null, 'other', q); } }, icon('dots'), 'Use "' + q + '" as everything else')));
    items.forEach(function (li) { ul.appendChild(li); });
    ul.hidden = false;
  }

  function setWhere(merchantId, categoryId, customName) {
    ctx.merchant = merchantId; ctx.category = categoryId; ctx.customName = customName || '';
    state.lastWhere = { merchant: merchantId, category: categoryId, customName: ctx.customName, at: Date.now() };
    saveState();
    renderPay();
    var amt = document.getElementById('amount');
    if (amt && !ctx.amount) { try { amt.focus({ preventScroll: true }); } catch (e) { amt.focus(); } }
  }
  function applyNearby(n) { setWhere(n.merchant || null, n.merchant ? null : n.category, n.merchant ? '' : n.name); }

  var lastWinner = null, interacted = false;
  document.addEventListener('pointerdown', function () { interacted = true; }, { once: true, passive: true });
  function countUp(el, target, unit) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var start = performance.now(), dur = 420;
    function step(t) {
      var k = Math.min(1, (t - start) / dur); k = 1 - Math.pow(1 - k, 3);
      el.textContent = rateText(target * (0.6 + 0.4 * k), unit);
      if (k < 1) requestAnimationFrame(step); else el.textContent = rateText(target, unit);
    }
    requestAnimationFrame(step);
  }

  function renderAnswer() {
    var root = document.getElementById('answer'); clear(root);
    var amount = parseAmount(ctx.amount);
    var where = currentWhere();
    var rc = { merchant: ctx.merchant, category: ctx.category || (ctx.merchant ? null : 'other'), amount: amount, payMethod: ctx.payMethod, abroad: !!state.prefs.abroad };
    var rec = E.recommend(rc, state, data);
    if (!rec.best) return;
    var best = rec.best, card = best.card;
    var tone = textColorFor(card.color);
    var changed = lastWinner !== card.id;
    lastWinner = card.id;
    var winner = h('div', { class: 'winner ' + tone + (changed ? ' reveal' : ''), style: '--card:' + card.color });
    if (changed && interacted && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { } }
    winner.appendChild(cardArt(card, 96, { cls: 'winner-art' }));
    winner.appendChild(h('div', { class: 'eyebrow' }, icon('check'), where ? 'Use this card' : 'For everything else, use'));
    winner.appendChild(h('div', { class: 'name' }, best.entry.nickname || card.name));
    var row = h('div', { class: 'wrow' });
    var unit = best.unit;
    var rateNum = h('span', null, rateText(best.effectiveRate, unit));
    var rateEl = h('div', { class: 'rate num' }, rateNum, unit !== 'percent' ? h('small', null, unit + ' · ' + pctText(best.effectivePercent) + ' value') : null);
    row.appendChild(rateEl);
    if (changed) countUp(rateNum, best.effectiveRate, unit);
    if (amount > 0) row.appendChild(h('div', { class: 'value num' }, (best.valueCents >= 0 ? cents(best.valueCents) : '-' + cents(-best.valueCents)) + (unit === 'percent' ? ' back' : ' value')));
    winner.appendChild(row);
    winner.appendChild(h('div', { class: 'why' }, best.reason + (best.entry.multiplier && best.entry.multiplier > 1 ? ' (incl. your ' + Math.round((best.entry.multiplier - 1) * 100) + '% boost)' : '')));
    if (amount > 0 && rec.results.length > 1 && rec.results[1].accepted) {
      var edge = best.valueCents - rec.results[1].valueCents;
      if (edge >= 1) winner.appendChild(h('div', { class: 'edge num' }, cents(edge) + ' more than your next best card'));
      else if (edge < 1 && edge > -1) winner.appendChild(h('div', { class: 'edge num' }, 'Ties with ' + (rec.results[1].entry.nickname || rec.results[1].card.name)));
    }
    var flags = h('div', { class: 'flags' });
    best.warnings.forEach(function (w) { flags.appendChild(h('span', { class: 'flag warn' }, w)); });
    if (best.goal) flags.appendChild(h('span', { class: 'flag good' }, best.goal.label + ': ' + money(best.goal.remaining) + ' to go'));
    if (best.cap && best.cap.left > 0 && best.cap.left < best.cap.cap) flags.appendChild(h('span', { class: 'flag' }, money(best.cap.left) + ' of cap left ' + best.cap.label));
    if (amount >= (state.prefs.protectionThreshold || 300)) best.protections.forEach(function (p) { flags.appendChild(h('span', { class: 'flag' }, p)); });
    if (flags.childNodes.length) winner.appendChild(flags);
    var actions = h('div', { class: 'winner-actions' });
    if (amount > 0) actions.appendChild(h('button', { class: 'btn', onclick: function () { logPurchase(best, amount); } }, icon('check'), 'I used it'));
    actions.appendChild(h('button', { class: 'btn', onclick: function () { openCardDetail(card.id); } }, 'Details'));
    winner.appendChild(actions);
    root.appendChild(winner);

    if (rec.results.length > 1) {
      var ul = h('ul', { class: 'others', 'aria-label': 'Your other cards' });
      rec.results.slice(1).forEach(function (r) {
        var li = h('li', { class: r.accepted ? '' : 'off', style: '--card:' + r.card.color });
        var btn = h('button', { onclick: function () { openCardDetail(r.card.id); } },
          h('span', { class: 'bar' }),
          h('span', { class: 'n' }, r.entry.nickname || r.card.name,
            h('span', { class: 'why' }, r.reason),
            r.warnings.length ? h('span', { class: r.accepted ? 'warn' : 'bad' }, r.warnings[0]) : null,
            r.goal ? h('span', { class: 'why' }, r.goal.label + ': ' + money(r.goal.remaining) + ' to go') : null),
          h('span', { class: 'r' }, r.accepted ? rateText(r.effectiveRate, r.unit) : '×',
            r.accepted ? h('small', null, amount > 0 ? (r.valueCents >= 0 ? cents(r.valueCents) : '-' + cents(-r.valueCents)) : (r.unit !== 'percent' ? pctText(r.effectivePercent) + ' value' : '')) : null));
        li.appendChild(btn); ul.appendChild(li);
      });
      root.appendChild(ul);
    }
    rec.notes.forEach(function (n) { root.appendChild(h('div', { class: 'note' }, n)); });
    if (!where) root.appendChild(h('p', { class: 'hint' }, 'Pick the store above to see the best card there.'));
    if (!PREVIEW && !state.prefs.location && !state.locationAsked && 'geolocation' in navigator) {
      root.appendChild(h('div', { class: 'note', style: 'display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap' },
        h('span', null, 'Find the store for you when you open the app?'),
        h('span', { style: 'display:flex;gap:8px' },
          h('button', { class: 'btn', onclick: function () { state.locationAsked = true; saveState(); renderAnswer(); } }, 'No'),
          h('button', { class: 'btn primary', onclick: function () { state.locationAsked = true; state.prefs.location = true; saveState(); renderAnswer(); locate(); } }, 'Yes'))));
    }
  }

  function logPurchase(res, amount) {
    var entry = res.entry;
    entry.purchases = entry.purchases || [];
    var rec = { date: new Date().toISOString(), amount: amount, pool: res.pool, category: ctx.category, merchant: ctx.merchant };
    entry.purchases.push(rec);
    if (entry.purchases.length > 400) entry.purchases.splice(0, entry.purchases.length - 400);
    (entry.goals || []).forEach(function (g) { if (!g.done) { g.progress = (Number(g.progress) || 0) + amount; if (g.progress >= g.target) g.done = true; } });
    saveState();
    ctx.amount = ''; var amt = document.getElementById('amount'); if (amt) amt.value = '';
    renderAnswer();
    toast('Logged ' + money(amount) + ' on ' + (entry.nickname || res.card.name), 'Undo', function () {
      var i = entry.purchases.indexOf(rec); if (i >= 0) entry.purchases.splice(i, 1);
      (entry.goals || []).forEach(function (g) { g.progress = Math.max(0, (Number(g.progress) || 0) - amount); if (g.progress < g.target) g.done = false; });
      saveState(); renderAnswer();
    });
  }

  /* ---------- location ---------- */
  var locating = false;
  function locate() {
    if (PREVIEW || !('geolocation' in navigator)) { toast('Location is not available here'); return; }
    if (locating) return;
    locating = true;
    var btn = document.getElementById('btn-locate'); btn.classList.add('busy');
    navigator.geolocation.getCurrentPosition(function (pos) {
      findNearby(pos.coords.latitude, pos.coords.longitude).then(function (list) {
        locating = false; btn.classList.remove('busy');
        nearby = list;
        if (!list.length) { toast('No store found at this spot. Pick it below.'); renderPay(); return; }
        var top = list[0];
        if (ctx.merchant || ctx.category) { renderPay(); return; }
        applyNearby(top);
        toast('Looks like ' + top.name + (list.length > 1 ? '. Not right? Tap another.' : ''));
      }).catch(function () { locating = false; btn.classList.remove('busy'); toast('Could not look up nearby stores'); });
    }, function (err) {
      locating = false; btn.classList.remove('busy');
      toast(err && err.code === 1 ? 'Location is off for this app in your phone settings' : 'Could not get your location');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  var OSM_MAP = [
    [/^amenity=fuel$/, 'gas'], [/^shop=(supermarket|grocery|greengrocer|butcher|bakery|deli|health_food|frozen_food)$/, 'groceries'],
    [/^amenity=(restaurant|fast_food|cafe|bar|pub|food_court|ice_cream|biergarten)$/, 'dining'], [/^shop=(coffee|tea|bakery)$/, 'dining'],
    [/^shop=wholesale$/, 'warehouse'], [/^shop=(department_store|variety_store|general)$/, 'superstore'],
    [/^(amenity=pharmacy|shop=chemist)$/, 'drugstore'], [/^shop=(doityourself|hardware|paint|garden_centre|trade)$/, 'home-improvement'],
    [/^amenity=(cinema|theatre|nightclub|casino)$/, 'entertainment'], [/^leisure=(fitness_centre|sports_centre)$/, 'fitness'],
    [/^tourism=(hotel|motel|guest_house|hostel)$/, 'hotels'], [/^amenity=(car_rental)$/, 'rental-car'], [/^amenity=(parking|parking_entrance)$/, 'transit'],
    [/^amenity=charging_station$/, 'ev-charging'], [/^shop=(convenience)$/, 'other'], [/^shop=(clothes|shoes|jewelry|fashion)$/, 'department-store']
  ];
  function findNearby(lat, lon) {
    var q = '[out:json][timeout:8];(nwr(around:120,' + lat + ',' + lon + ')[name][shop];nwr(around:120,' + lat + ',' + lon + ')[name][amenity];nwr(around:120,' + lat + ',' + lon + ')[name][leisure];nwr(around:120,' + lat + ',' + lon + ')[name][tourism];);out center tags 20;';
    return fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var out = [];
        (j.elements || []).forEach(function (el) {
          var t = el.tags || {}; var name = t.name || t.brand; if (!name) return;
          var la = el.lat || (el.center && el.center.lat), lo = el.lon || (el.center && el.center.lon);
          var dist = (la && lo) ? haversine(lat, lon, la, lo) : 999;
          var match = matchMerchant(name, t);
          var category = match ? match.category : null;
          if (!category) {
            Object.keys(t).some(function (k) { var kv = k + '=' + t[k]; return OSM_MAP.some(function (p) { if (p[0].test(kv)) { category = p[1]; return true; } return false; }); });
          }
          if (!category) return;
          out.push({ name: match ? match.name : name, merchant: match ? match.id : null, category: category, dist: dist });
        });
        var seen = {}; out = out.filter(function (o) { var k = o.merchant || o.name; if (seen[k]) return false; seen[k] = true; return true; });
        out.sort(function (a, b) { return a.dist - b.dist; });
        return out;
      });
  }
  function matchMerchant(name, tags) {
    var n = name.toLowerCase().replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ').trim();
    var fuel = tags && tags.amenity === 'fuel';
    var best = null;
    data.merchants.forEach(function (m) {
      [m.name].concat(m.aliases || []).forEach(function (a) {
        a = a.toLowerCase().replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!a) return;
        if (n === a || n.indexOf(a + ' ') === 0 || n.indexOf(' ' + a) >= 0 || (a.length > 4 && n.indexOf(a) >= 0)) {
          if (!best || a.length > best.len) best = { len: a.length, m: m };
        }
      });
    });
    if (!best) return null;
    var m = best.m;
    if (fuel) { var gasId = m.id + '-gas'; var g = E.merchantById(data, gasId); if (g) return g; if (!m.fuel && m.category !== 'gas') return null; }
    return m;
  }
  function haversine(a, b, c, d) { var R = 6371000, toR = Math.PI / 180, dLat = (c - a) * toR, dLon = (d - b) * toR; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * toR) * Math.cos(c * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }

  /* ---------- Wallet ---------- */
  function renderWallet() {
    var root = document.getElementById('view-wallet'); clear(root);
    root.appendChild(h('div', { class: 'section-head' }, h('h2', null, 'Your cards'), h('button', { class: 'link', onclick: function () { openAddCards(); } }, '+ Add a card')));
    if (!state.wallet.length) { root.appendChild(h('div', { class: 'empty' }, h('h2', null, 'No cards yet'), h('button', { class: 'btn primary', onclick: function () { openAddCards(); } }, 'Choose my cards'))); return; }
    var tiles = h('div', { class: 'tiles' });
    var q = E.quarterOf(new Date());
    state.wallet.forEach(function (entry) {
      var card = E.cardById(data, entry.cardId); if (!card) return;
      var badges = [];
      if (card.rotating && card.rotating.activation && card.rotating.calendar && card.rotating.calendar[q] && !(entry.activated && entry.activated[q])) badges.push(h('span', { class: 'badge warn' }, 'Activate ' + quarterLabel(q)));
      if (card.choice && !(entry.choices && entry.choices.length)) badges.push(h('span', { class: 'badge warn' }, 'Pick category'));
      var goal = (entry.goals || []).filter(function (g) { return !g.done; })[0];
      if (goal) badges.push(h('span', { class: 'badge good' }, money(Math.max(0, goal.target - (goal.progress || 0))) + ' to bonus'));
      var pc = perkCounts(card, entry, new Date());
      if (pc.toActivate) badges.push(h('span', { class: 'badge warn' }, pc.toActivate + (pc.toActivate === 1 ? ' perk' : ' perks') + ' to activate'));
      else if (pc.toUse) badges.push(h('span', { class: 'badge' }, pc.toUse + (pc.toUse === 1 ? ' credit' : ' credits') + ' to use'));
      tiles.appendChild(h('button', { class: 'tile', style: '--card:' + card.color, onclick: function () { openCardDetail(card.id); } },
        cardArt(card, 64),
        h('span', { class: 't' }, h('b', null, entry.nickname || card.name), h('span', null, E.cardSummary(card, data)), badges.length ? h('span', { style: 'display:flex;gap:6px;margin-top:4px;flex-wrap:wrap' }, badges) : null),
        h('span', { class: 'chev' }, icon('chev'))));
    });
    root.appendChild(tiles);
    root.appendChild(h('p', { class: 'hint' }, 'Tap a card to see how to get the most from it.'));
  }

  function openAddCards(intro) {
    var filter = { issuer: 'All', q: '' };
    var list = h('div', { class: 'card-list' });
    var issuers = ['All'];
    data.cards.forEach(function (c) { if (issuers.indexOf(c.issuer) < 0) issuers.push(c.issuer); });
    issuers.push('Business');
    var chips = h('div', { class: 'chips' });
    function drawChips() {
      clear(chips);
      issuers.forEach(function (i) { chips.appendChild(h('button', { class: filter.issuer === i ? 'on' : '', onclick: function () { filter.issuer = i; drawChips(); drawList(); } }, i)); });
    }
    function drawList() {
      clear(list);
      var q = filter.q.trim().toLowerCase();
      var shown = data.cards.filter(function (c) {
        if (c.hidden) return false;
        if (filter.issuer === 'Business') { if (c.type !== 'business') return false; }
        else if (c.type === 'business' && !q && filter.issuer === 'All') return false;
        else if (filter.issuer !== 'All' && c.issuer !== filter.issuer) return false;
        if (q && (c.name + ' ' + c.issuer).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      if (!shown.length) list.appendChild(h('p', { class: 'hint' }, 'No card matches. Try another name.'));
      shown.forEach(function (c) {
        var inWallet = !!walletEntry(c.id);
        list.appendChild(h('button', { class: 'card-row' + (inWallet ? ' in' : ''), style: '--card:' + c.color, onclick: function () { toggleCard(c); drawList(); } },
          cardArt(c, 56),
          h('span', null, h('b', null, c.name), h('span', null, c.issuer + (c.annualFee ? ' · $' + c.annualFee + '/yr' : ' · no annual fee'))),
          h('span', { class: 'add' }, inWallet ? 'Added' : 'Add')));
      });
    }
    var search = h('input', { class: 'field', type: 'search', placeholder: 'Search cards', 'aria-label': 'Search cards', autocomplete: 'off' });
    search.addEventListener('input', function () { filter.q = search.value; drawList(); });
    drawChips(); drawList();
    var nodes = [];
    if (intro) nodes.push(h('div', { class: 'hero-copy' }, h('div', { class: 'steps' }, h('i', { class: 'on' }), h('i')), h('p', { class: 'muted' }, 'Tap every card you carry. Just the names, never a card number.')));
    nodes.push(search, chips, list,
      h('div', { class: 'note buddy' }, h('b', null, 'Why do the cards look like that? '), 'Yeah, those are not the real card pictures. Is it because we are cheap a**es? Partially. Mostly it is because every one of those designs is trademarked, and the banks would keep our a**es in court until the sun burns out. That should tell you something, though: the sites with the real pictures have a deal with the bank and get paid every time you click. We get squat. Nobody pays for a spot here, nobody buys your info, and the only thing we want from you is 99 cents and a good pump story.'),
      h('button', { class: 'btn primary block', onclick: function () { closeSheet(); } }, 'Done'));
    openSheet(intro ? 'Your cards' : 'Add a card', nodes, { noClose: !!intro });
    sheetOnClose = function () {
      if (intro && state.wallet.length) { openPriority(true); }
      else { renderAll(); }
    };
  }
  function toggleCard(c) {
    var e = walletEntry(c.id);
    if (e) { state.wallet.splice(state.wallet.indexOf(e), 1); }
    else {
      var entry = { cardId: c.id, added: new Date().toISOString() };
      if (c.choice && !c.choice.auto) entry.choices = [];
      state.wallet.push(entry);
    }
    saveState();
  }

  function openPriority(intro) {
    var opts = [
      ['cash', 'Cash back', 'Count every point as what it is worth as cash. Simple and safe.'],
      ['travel', 'Points and miles', 'Value points at what they get you when moved to airline and hotel partners.'],
      ['bonus', 'Earning a bonus', 'Put any card with an unfinished welcome bonus or spend goal first.']
    ];
    var wrap = h('div', { class: 'options' });
    function draw() {
      clear(wrap);
      opts.forEach(function (o) {
        wrap.appendChild(h('button', { class: 'opt' + (state.prefs.priority === o[0] ? ' on' : ''), onclick: function () { state.prefs.priority = o[0]; saveState(); draw(); } },
          h('span', null, h('b', null, o[1]), h('span', null, o[2])), h('span', { class: 'tick' }, icon('check'))));
      });
    }
    draw();
    var nodes = [];
    if (intro) nodes.push(h('div', { class: 'hero-copy' }, h('div', { class: 'steps' }, h('i', { class: 'on' }), h('i', { class: 'on' })), h('p', { class: 'muted' }, 'What do you want from your cards? You can change this any time in More.')));
    nodes.push(wrap, h('button', { class: 'btn primary block', onclick: function () { closeSheet(); } }, intro ? 'Start using it' : 'Done'));
    openSheet('What matters most', nodes, { noClose: !!intro });
    sheetOnClose = function () { state.onboarded = true; saveState(); onboarding = false; showView('pay'); };
  }

  /* ---------- Perks ---------- */
  function perkPeriodKey(period, d) {
    if (period === 'month') return d.getFullYear() + '-' + (d.getMonth() + 1);
    if (period === 'quarter') return E.quarterOf(d);
    if (period === 'semiannual') return d.getFullYear() + (d.getMonth() < 6 ? 'H1' : 'H2');
    if (period === 'year') return String(d.getFullYear());
    return 'always';
  }
  function perkDone(entry, perk, now) {
    var st = entry.perkState && entry.perkState[perk.id];
    if (!st || !st.at) return false;
    if (perk.activation === 'activate' || !perk.period || perk.period === 'none' || perk.period === 'once') return true;
    return perkPeriodKey(perk.period, new Date(st.at)) === perkPeriodKey(perk.period, now || new Date());
  }
  function perkCounts(card, entry, now) {
    var toActivate = 0, toUse = 0;
    (card.perks || []).forEach(function (pk) {
      if (pk.keep === false) return;
      if (perkDone(entry, pk, now)) return;
      if (pk.activation === 'activate') toActivate++; else if (pk.period && pk.period !== 'none' && pk.period !== 'once') toUse++;
    });
    return { toActivate: toActivate, toUse: toUse };
  }
  function perkStatusLabel(pk) {
    if (pk.activation === 'activate') return 'Activated';
    var p = { month: 'Used this month', quarter: 'Used this quarter', semiannual: 'Used this half', year: 'Used this year', once: 'Used' };
    return p[pk.period] || 'Done';
  }
  function perksBox(card, entry, cardId) {
    var now = new Date();
    var all = card.perks || [];
    if (!all.length) return null;
    var showAll = !!(entry.showAllPerks);
    var list = all.filter(function (pk) { return showAll || pk.keep !== false; });
    var counts = perkCounts(card, entry, now);
    var box = h('div', { class: 'box perks' });
    box.appendChild(h('div', { class: 'section-head' }, h('h3', null, 'Perks and credits'),
      counts.toActivate ? h('span', { class: 'badge warn' }, counts.toActivate + ' to activate') : (counts.toUse ? h('span', { class: 'badge' }, counts.toUse + ' to use') : h('span', { class: 'badge good' }, 'All set'))));
    box.appendChild(h('p', { class: 'small muted' }, 'Everything the card gives you, on one screen. Flip the switch when you have activated or used one; the link opens the issuer page for it.'));
    var ul = h('ul', { class: 'perk-list' });
    list.forEach(function (pk) {
      var done = perkDone(entry, pk, now);
      var li = h('li', { class: done ? 'done' : '' });
      li.appendChild(h('div', { class: 'perk-main' },
        h('b', null, pk.name),
        pk.worth ? h('span', { class: 'worth' }, pk.worth) : null,
        h('span', { class: 'how' }, pk.how || ''),
        pk.note ? h('span', { class: 'how' }, pk.note) : null));
      var actions = h('div', { class: 'perk-actions' });
      var url = pk.activationUrl || card.benefitsUrl;
      if (url) actions.appendChild(h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, pk.activation === 'activate' ? 'Activate' : 'Open'));
      if (pk.activation === 'activate' || (pk.period && pk.period !== 'none')) {
        actions.appendChild(h('label', { class: 'perk-toggle' },
          h('button', { class: 'switch' + (done ? ' on' : ''), role: 'switch', 'aria-checked': done ? 'true' : 'false', 'aria-label': perkStatusLabel(pk), onclick: function () {
            entry.perkState = entry.perkState || {};
            if (done) delete entry.perkState[pk.id]; else entry.perkState[pk.id] = { at: new Date().toISOString() };
            saveState(); openCardDetail(cardId);
          } }),
          h('span', null, perkStatusLabel(pk))));
      } else actions.appendChild(h('span', { class: 'small muted' }, 'Applies automatically'));
      li.appendChild(actions);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (all.length !== list.length || showAll) box.appendChild(h('button', { class: 'btn ghost', onclick: function () { entry.showAllPerks = !showAll; saveState(); openCardDetail(cardId); } }, showAll ? 'Show the useful ones only' : 'Show all ' + all.length + ' perks'));
    if (card.benefitsUrl) box.appendChild(h('p', { class: 'small muted' }, h('a', { href: card.benefitsUrl, target: '_blank', rel: 'noopener' }, 'Full benefits page at the issuer')));
    return box;
  }

  /* ---------- Card detail ---------- */
  function openCardDetail(cardId) {
    var card = E.cardById(data, cardId); if (!card) return;
    var entry = walletEntry(cardId) || {};
    var inWallet = !!walletEntry(cardId);
    var unit = E.unitFor(card.program, data);
    var now = new Date(), q = E.quarterOf(now), nq = E.nextQuarterKey(now);
    var nodes = [];
    var tone = textColorFor(card.color);
    var hero = h('div', { class: 'detail-hero ' + tone, style: '--card:' + card.color },
      cardArt(card, 200, { cls: 'hero-art' }),
      h('div', { class: 'issuer' }, card.issuer + (card.network && card.network !== card.issuer ? ' · ' + card.network : '') + (card.type === 'business' ? ' · Business' : '')),
      h('h2', null, entry.nickname || card.name),
      h('div', { class: 'meta' },
        h('span', { class: 'flag' }, card.annualFee ? '$' + card.annualFee + ' annual fee' : 'No annual fee'),
        h('span', { class: 'flag' }, card.fxFee ? card.fxFee + '% foreign fee' : 'No foreign fee'),
        card.program !== 'cashback' ? h('span', { class: 'flag' }, programName(card.program)) : null));
    nodes.push(hero);
    if (card.bestFor) nodes.push(h('p', null, card.bestFor));
    if (inWallet) { var pb = perksBox(card, entry, cardId); if (pb) nodes.push(pb); }

    // Earning
    var earn = h('ul', { class: 'earn-list' });
    var rows = [];
    if (card.rotating) rows.push([rateText(card.rotating.rate, unit), 'Rotating categories', 'Changes each quarter' + (card.rotating.cap ? ', up to $' + card.rotating.cap.toLocaleString() + ' per quarter' : '')]);
    if (card.choice) {
      rows.push([rateText(card.choice.rate, unit), card.choice.auto ? 'Your top category each billing cycle (automatic)' : (card.choice.slots > 1 ? 'Categories you choose' : 'A category you choose'), card.choice.cap ? 'Up to $' + card.choice.cap.toLocaleString() + ' per ' + (card.choice.capPeriod === 'month' || card.choice.capPeriod === 'cycle' ? 'billing cycle' : card.choice.capPeriod) : '']);
      if (card.choice.secondTier) rows.push([rateText(card.choice.secondTier.rate, unit), card.choice.secondTier.categories.map(function (c) { return cat(c).name; }).join(', '), card.choice.secondTier.sharesCap ? 'Shares the cap above' : '']);
    }
    (card.earn || []).slice().sort(function (a, b) { return (a.merchant ? 1 : 0) - (b.merchant ? 1 : 0) || b.rate - a.rate; }).forEach(function (r) {
      var label = r.merchant ? (E.merchantById(data, r.merchant) || { name: r.merchant }).name : cat(r.category).name;
      if (r.label) label = r.label;
      var sub = [];
      if (r.until) sub.push('through ' + fmtLongDate(r.until) + (r.afterRate ? ', then ' + rateText(r.afterRate, unit) : ''));
      if (r.onlineOnly) sub.push('online orders only');
      if (r.walletPayOnly) sub.push('with Apple Pay or Google Pay');
      if (r.cap) sub.push('up to $' + r.cap.toLocaleString() + ' per ' + r.capPeriod);
      if (r.excludes && r.excludes.length) sub.push('not at ' + r.excludes.map(function (x) { return cat(x).name.toLowerCase(); }).join(' or '));
      if (r.note) sub.push(r.note);
      rows.push([rateText(r.rate, unit), label, sub.join(' · ')]);
    });
    rows.push([rateText(card.base, unit), 'Everything else', '']);
    rows.forEach(function (r) { earn.appendChild(h('li', null, h('span', { class: 'l' }, r[1], r[2] ? h('small', null, r[2]) : null), h('span', { class: 'r' }, r[0]))); });
    nodes.push(h('div', { class: 'box' }, h('h3', null, 'Earns'), earn));

    // Rotating calendar
    if (card.rotating && card.rotating.calendar) {
      var cal = card.rotating.calendar;
      var cur = cal[q], next = cal[nq];
      var box = h('div', { class: 'box' }, h('h3', null, quarterLabel(q)));
      if (cur) {
        box.appendChild(h('p', null, cur.label || (cur.categories || []).map(function (c) { return cat(c).name; }).concat((cur.merchants || []).map(function (m) { return (E.merchantById(data, m) || { name: m }).name; })).join(', ')));
        if (card.rotating.activation && inWallet) {
          var on = !!(entry.activated && entry.activated[q]);
          box.appendChild(h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { class: 't' }, h('b', null, on ? 'Activated' : 'Not activated yet'), h('span', null, cur.activateBy ? 'Activate by ' + E.fmtDate(cur.activateBy) : 'Activate on the issuer site')),
            h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': 'Activated this quarter', onclick: function () { entry.activated = entry.activated || {}; entry.activated[q] = !on; saveState(); openCardDetail(cardId); } })));
          if (!on && card.rotating.activationUrl) box.appendChild(h('a', { class: 'btn primary block', style: 'margin-top:10px', href: card.rotating.activationUrl, target: '_blank', rel: 'noopener' }, 'Activate on the ' + card.issuer + ' site'));
        }
        if (inWallet && card.rotating.cap) box.appendChild(capBar(entry, 'rotating', card.rotating.cap, card.rotating.capPeriod || 'quarter'));
      } else box.appendChild(h('p', { class: 'muted' }, 'No categories on file for this quarter.'));
      box.appendChild(h('p', { class: 'small muted', style: 'margin-top:10px' }, quarterLabel(nq) + ': ' + (next ? (next.label || (next.categories || []).map(function (c) { return cat(c).name; }).join(', ')) : 'not announced yet')));
      nodes.push(box);
    }

    // Choice categories
    if (card.choice && inWallet) {
      var cb = h('div', { class: 'box' }, h('h3', null, card.choice.auto ? 'The category you give this card' : 'Your ' + (card.choice.slots > 1 ? 'categories' : 'category')));
      if (card.choice.auto) cb.appendChild(h('p', { class: 'small', style: 'margin-bottom:8px' }, 'The issuer pays ' + rateText(card.choice.rate, unit) + ' on whichever eligible category you spend the most in each billing cycle, up to the cap. The trick is to use the card for one category only. Pick that category here so the app sends only that spending to it.'));
      {
        entry.choices = entry.choices || [];
        var opts = h('div', { class: 'chips', style: 'flex-wrap:wrap' });
        card.choice.options.forEach(function (o) {
          var on = entry.choices.indexOf(o) >= 0;
          opts.appendChild(h('button', { class: on ? 'on' : '', 'aria-pressed': on ? 'true' : 'false', onclick: function () {
            if (on) entry.choices.splice(entry.choices.indexOf(o), 1);
            else { entry.choices.push(o); while (entry.choices.length > card.choice.slots) entry.choices.shift(); }
            saveState(); openCardDetail(cardId);
          } }, E.categoryById(data, o) ? cat(o).name : (E.merchantById(data, o) || { name: o }).name));
        });
        cb.appendChild(h('p', { class: 'small muted', style: 'margin-bottom:8px' }, 'Pick ' + card.choice.slots + ' for ' + rateText(card.choice.rate, unit) + '. Match what you set on the issuer site.'));
        cb.appendChild(opts);
        var st2 = card.choice.secondTier;
        if (st2 && st2.slots) {
          entry.choices2 = entry.choices2 || [];
          var opts2 = h('div', { class: 'chips', style: 'flex-wrap:wrap' });
          st2.categories.forEach(function (o) {
            var on2 = entry.choices2.indexOf(o) >= 0;
            opts2.appendChild(h('button', { class: on2 ? 'on' : '', 'aria-pressed': on2 ? 'true' : 'false', onclick: function () {
              if (on2) entry.choices2.splice(entry.choices2.indexOf(o), 1);
              else { entry.choices2.push(o); while (entry.choices2.length > st2.slots) entry.choices2.shift(); }
              saveState(); openCardDetail(cardId);
            } }, E.categoryById(data, o) ? cat(o).name : (E.merchantById(data, o) || { name: o }).name));
          });
          cb.appendChild(h('p', { class: 'small muted', style: 'margin:12px 0 8px' }, 'Pick ' + st2.slots + ' for ' + rateText(st2.rate, unit) + '.'));
          cb.appendChild(opts2);
        }
      }
      if (card.choice.cap) cb.appendChild(capBar(entry, 'choice', card.choice.cap, card.choice.capPeriod || 'quarter'));
      nodes.push(cb);
    }

    // Caps on fixed rules
    if (inWallet) {
      (card.earn || []).forEach(function (r, idx) {
        if (!r.cap) return;
        var label = r.merchant ? (E.merchantById(data, r.merchant) || { name: r.merchant }).name : cat(r.category).name;
        nodes.push(h('div', { class: 'box' }, h('h3', null, label + ' cap'), capBar(entry, r.capGroup || ('earn:' + idx), r.cap, r.capPeriod)));
      });
    }

    // Goals
    if (inWallet) {
      var gb = h('div', { class: 'box' }, h('h3', null, 'Spend goals'));
      entry.goals = entry.goals || [];
      if (!entry.goals.length) gb.appendChild(h('p', { class: 'small muted' }, 'Working on a welcome bonus or an annual spend perk? Add it and this card moves up when you are close.'));
      entry.goals.forEach(function (g, i) {
        var pct = Math.min(100, Math.round(100 * (g.progress || 0) / (g.target || 1)));
        gb.appendChild(h('div', { class: 'stack', style: 'margin-top:8px' },
          h('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:baseline' }, h('b', null, g.label), h('span', { class: 'small muted num' }, money(g.progress || 0) + ' of ' + money(g.target) + (g.deadline ? ' by ' + E.fmtDate(g.deadline) : ''))),
          h('div', { class: 'prog' + (g.done ? ' full' : '') }, h('i', { style: 'width:' + pct + '%' })),
          h('div', { style: 'display:flex;gap:8px' },
            h('button', { class: 'btn', style: 'padding:6px 10px;min-height:36px', onclick: function () { editGoal(entry, g, cardId); } }, 'Edit'),
            h('button', { class: 'btn ghost', style: 'padding:6px 10px;min-height:36px', onclick: function () { entry.goals.splice(i, 1); saveState(); openCardDetail(cardId); } }, 'Remove'))));
      });
      gb.appendChild(h('button', { class: 'btn', style: 'margin-top:10px', onclick: function () { editGoal(entry, null, cardId); } }, icon('plus'), 'Add a goal'));
      nodes.push(gb);
    }

    // Boost (Bank of America Preferred Rewards and similar)
    if (inWallet && card.boostOptions) {
      var bb = h('div', { class: 'box' }, h('h3', null, card.boostLabel || 'Rewards boost'));
      var sel = h('select', { class: 'field', 'aria-label': card.boostLabel || 'Rewards boost' });
      sel.appendChild(h('option', { value: '1' }, 'None'));
      card.boostOptions.forEach(function (o) { sel.appendChild(h('option', { value: String(o.multiplier) }, o.label)); });
      sel.value = String(entry.multiplier || 1);
      sel.addEventListener('change', function () { entry.multiplier = parseFloat(sel.value); saveState(); });
      bb.appendChild(sel);
      nodes.push(bb);
    }

    // Tips and watch outs
    if (card.tips && card.tips.length) nodes.push(h('div', { class: 'box' }, h('h3', null, 'Get the most from it'), h('ul', { class: 'bullets' }, card.tips.map(function (t) { return h('li', null, t); }))));
    if (card.watchOut && card.watchOut.length) nodes.push(h('div', { class: 'box' }, h('h3', null, 'Watch out'), h('ul', { class: 'bullets warnl' }, card.watchOut.map(function (t) { return h('li', null, t); }))));
    if (card.credits && card.credits.length) nodes.push(h('div', { class: 'box' }, h('h3', null, 'Credits and perks'), h('ul', { class: 'bullets' }, card.credits.map(function (t) { return h('li', null, t); }))));

    // Protections
    var b = card.benefits || {};
    var prot = [];
    if (b.purchaseProtection) prot.push('Purchase protection');
    if (b.extendedWarranty) prot.push('Extended warranty');
    if (b.cellPhoneProtection) prot.push('Cell phone protection (pay the bill with this card)');
    if (b.rentalCarCDW) prot.push((b.rentalCarCDW === 'primary' ? 'Primary' : 'Secondary') + ' rental car coverage');
    if (b.tripDelay) prot.push('Trip delay coverage');
    if (b.loungeAccess) prot.push('Lounge access');
    if (prot.length) nodes.push(h('div', { class: 'box' }, h('h3', null, 'Protections'), h('ul', { class: 'bullets' }, prot.map(function (t) { return h('li', null, t); })), h('p', { class: 'small muted', style: 'margin-top:8px' }, 'Big purchase? These can be worth more than the points.')));

    // Points worth
    var p = data.valuations.programs[card.program];
    if (p && unit !== 'percent') {
      var kv = h('dl', { class: 'kv' });
      if (p.cash) kv.appendChild(h('div', { style: 'display:contents' }, h('dt', null, 'Cash or statement credit'), h('dd', null, p.cash + '¢ each')));
      if (p.travel) kv.appendChild(h('div', { style: 'display:contents' }, h('dt', null, 'Issuer travel site'), h('dd', null, p.travel + '¢ each')));
      if (p.transfer && p.transfer !== p.travel) kv.appendChild(h('div', { style: 'display:contents' }, h('dt', null, 'Transferred to partners'), h('dd', null, 'about ' + p.transfer + '¢ each')));
      var rb = h('div', { class: 'box' }, h('h3', null, 'What a ' + (unit === 'miles' ? 'mile' : 'point') + ' is worth'), kv);
      if (p.note) rb.appendChild(h('p', { class: 'small muted', style: 'margin-top:8px' }, p.note));
      rb.appendChild(h('p', { class: 'small muted', style: 'margin-top:6px' }, 'This app values them at ' + E.valuation(card.program, state.prefs, data, state.wallet) + '¢ based on your priority and the cards you hold. Change it in More.'));
      nodes.push(rb);
    }

    // Nickname, network and remove
    if (inWallet) {
      var nick = h('input', { class: 'field', type: 'text', placeholder: card.name, value: entry.nickname || '', 'aria-label': 'Nickname', maxlength: '40' });
      nick.addEventListener('change', function () { entry.nickname = nick.value.trim(); saveState(); });
      var box = h('div', { class: 'box stack' }, h('div', null, h('label', { class: 'lbl' }, 'Nickname (optional)'), nick));
      if (card.networkOptions && card.networkOptions.length > 1) {
        var ns = h('select', { class: 'field', 'aria-label': 'Card network' });
        card.networkOptions.forEach(function (n) { ns.appendChild(h('option', { value: n }, n)); });
        ns.value = entry.network || card.network;
        ns.addEventListener('change', function () { entry.network = ns.value; saveState(); });
        box.appendChild(h('div', null, h('label', { class: 'lbl' }, 'Network printed on your card'), ns, h('p', { class: 'small muted', style: 'margin-top:6px' }, 'This issuer puts some accounts on a different network. Check the logo on the card; it decides where the card is accepted.')));
      }
      nodes.push(box);
    }
    nodes.push(h('p', { class: 'small muted' }, 'Rates checked ' + fmtLongDate(card.verified || data.verified) + ' against the issuer. ', card.sourceUrl ? h('a', { href: card.sourceUrl, target: '_blank', rel: 'noopener' }, 'Issuer page') : null, ' · ', h('a', { href: 'mailto:' + CONTACT + '?subject=' + encodeURIComponent('Which Card: wrong number on ' + card.name) }, 'Report a wrong number')));
    if (inWallet) nodes.push(h('button', { class: 'btn danger block', onclick: function () { toggleCard(card); closeSheet(); renderAll(); toast('Removed ' + card.name); } }, 'Remove from wallet'));
    else nodes.push(h('button', { class: 'btn primary block', onclick: function () { toggleCard(card); closeSheet(); renderAll(); toast('Added ' + card.name); } }, 'Add to wallet'));
    openSheet(card.name, nodes);
    sheetOnClose = function () { renderAll(); };
  }

  function capBar(entry, pool, cap, period) {
    var used = E.spendInPool(entry, pool, period, new Date());
    var pct = Math.min(100, Math.round(100 * used / cap));
    return h('div', { class: 'stack', style: 'margin-top:10px' },
      h('div', { class: 'small muted num' }, money(used) + ' of $' + cap.toLocaleString() + ' used ' + ({ quarter: 'this quarter', month: 'this month', cycle: 'this cycle', year: 'this year' }[period] || '') + ' (from purchases you logged)'),
      h('div', { class: 'prog' + (pct >= 100 ? ' full' : '') }, h('i', { style: 'width:' + pct + '%' })));
  }

  function editGoal(entry, g, cardId) {
    var isNew = !g;
    g = g || { label: 'Welcome bonus', target: 4000, progress: 0, deadline: '' };
    var label = h('input', { class: 'field', type: 'text', value: g.label, 'aria-label': 'Goal name' });
    var target = h('input', { class: 'field', type: 'number', inputmode: 'decimal', value: g.target, 'aria-label': 'Spend needed' });
    var progress = h('input', { class: 'field', type: 'number', inputmode: 'decimal', value: g.progress || 0, 'aria-label': 'Spent so far' });
    var deadline = h('input', { class: 'field', type: 'date', value: g.deadline || '', 'aria-label': 'Deadline' });
    openSheet(isNew ? 'Add a goal' : 'Edit goal', [
      h('div', null, h('label', { class: 'lbl' }, 'What is it'), label),
      h('div', { class: 'grid2' }, h('div', null, h('label', { class: 'lbl' }, 'Spend needed ($)'), target), h('div', null, h('label', { class: 'lbl' }, 'Spent so far ($)'), progress)),
      h('div', null, h('label', { class: 'lbl' }, 'Deadline (optional)'), deadline),
      h('p', { class: 'small muted' }, 'Purchases you log with "I used it" count toward it automatically.'),
      h('button', { class: 'btn primary block', onclick: function () {
        g.label = label.value.trim() || 'Spend goal'; g.target = parseFloat(target.value) || 0; g.progress = parseFloat(progress.value) || 0; g.deadline = deadline.value; g.done = g.progress >= g.target && g.target > 0;
        if (isNew) entry.goals.push(g);
        saveState(); openCardDetail(cardId);
      } }, 'Save')
    ]);
    sheetOnClose = function () { openCardDetail(cardId); };
  }

  /* ---------- Offers ---------- */
  function renderOffers() {
    var root = document.getElementById('view-offers'); clear(root);
    var gaps = E.gaps(state, data);
    if (state.wallet.length) {
      var gs = h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Where your wallet is weak'), null),
        h('p', { class: 'small muted' }, 'Categories where a card you do not hold would out-earn your best. Nothing here is sponsored or linked for a referral; it is the same arithmetic the Pay screen uses.'));
      if (!gaps.length) gs.appendChild(h('div', { class: 'note good' }, 'Your cards already cover every everyday category well.'));
      else gaps.slice(0, 5).forEach(function (g) {
        gs.appendChild(h('button', { class: 'gap', onclick: function () { openCardDetail(g.card.id); } },
          h('span', null, h('b', null, g.category.name), h('span', null, g.card.name + (g.card.annualFee ? ' ($' + g.card.annualFee + '/yr)' : '') + ' pays ' + g.reason + '. Your best today: ' + pctText(g.minePct) + '.')),
          h('span', { class: 'pct num' }, pctText(g.pct))));
      });
      root.appendChild(gs);
    }

    var offers = (data.bonuses && data.bonuses.offers) || [];
    var os = h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Sign-up bonuses, as the banks publish them'), h('span', { class: 'small muted' }, 'as of ' + fmtLongDate(data.bonuses && data.bonuses.verified))));
    var sorted = offers.slice().sort(function (a, b) { return (valueOf(b)) - (valueOf(a)); });
    sorted.forEach(function (o) {
      var card = E.cardById(data, o.cardId);
      var have = !!walletEntry(o.cardId);
      os.appendChild(h('div', { class: 'offer', style: '--card:' + (card ? card.color : '#777') },
        h('div', { class: 'h' }, h('b', null, o.cardName), have ? h('span', { class: 'badge good' }, 'You have it') : null),
        h('div', { class: 'bonus num' }, o.cashBonus ? money(o.cashBonus) + ' cash' : o.bonus, o.bonusValueCents && !o.cashBonus ? h('span', { class: 'small muted', style: 'font-family:var(--font-body);font-weight:600' }, ' about ' + cents(o.bonusValueCents)) : null),
        h('div', { class: 'req' }, o.spend ? 'Spend ' + money(o.spend) + ' in ' + o.months + ' month' + (o.months === 1 ? '' : 's') : 'No spend requirement', o.annualFee ? ' · $' + o.annualFee + ' annual fee' + (o.firstYearFeeWaived ? ' (waived first year)' : '') : ' · no annual fee'),
        o.notes ? h('div', { class: 'small muted' }, o.notes) : null,
        h('div', { class: 'foot' }, o.sourceUrl ? h('a', { href: o.sourceUrl, target: '_blank', rel: 'noopener' }, 'Issuer page') : h('span'), card ? h('button', { class: 'link', style: 'color:var(--accent);font-weight:600', onclick: function () { openCardDetail(card.id); } }, 'How it earns') : null)));
    });
    if (!offers.length) os.appendChild(h('p', { class: 'hint' }, 'Nothing on file.'));
    os.appendChild(h('p', { class: 'small muted' }, 'Listed for reference only. Bonuses change often and some show only on the issuer site. Every link goes to the issuer; nobody pays for a spot here.'));
    root.appendChild(os);

    var rot = data.cards.filter(function (c) { return c.rotating && c.rotating.calendar; });
    if (rot.length) {
      var q = E.quarterOf(new Date()), nq = E.nextQuarterKey(new Date());
      var rs = h('div', { class: 'section' }, h('h2', null, 'Rotating categories'));
      rot.forEach(function (c) {
        var cur = c.rotating.calendar[q], next = c.rotating.calendar[nq];
        rs.appendChild(h('div', { class: 'box' }, h('h3', null, c.name),
          h('p', null, h('b', null, quarterLabel(q) + ': '), cur ? (cur.label || (cur.categories || []).map(function (x) { return cat(x).name; }).join(', ')) : 'not on file'),
          cur && cur.activateBy ? h('p', { class: 'small muted' }, 'Activate by ' + E.fmtDate(cur.activateBy)) : null,
          h('p', { class: 'small muted', style: 'margin-top:6px' }, quarterLabel(nq) + ': ' + (next ? (next.label || (next.categories || []).map(function (x) { return cat(x).name; }).join(', ')) : 'not announced yet'))));
      });
      root.appendChild(rs);
    }
  }
  function valueOf(o) { return o.cashBonus ? o.cashBonus * 100 : (o.bonusValueCents || 0); }

  /* ---------- More ---------- */
  function renderMore() {
    var root = document.getElementById('view-more'); clear(root);
    var s = h('div', { class: 'section' }, h('h2', null, 'What matters most'));
    var opts = [['cash', 'Cash back', 'Every point counted at its cash value'], ['travel', 'Points and miles', 'Points valued at transfer-partner rates'], ['bonus', 'Earning a bonus', 'Cards with an unfinished goal go first']];
    var ow = h('div', { class: 'options' });
    opts.forEach(function (o) {
      ow.appendChild(h('button', { class: 'opt' + (state.prefs.priority === o[0] ? ' on' : ''), onclick: function () { state.prefs.priority = o[0]; saveState(); renderMore(); } },
        h('span', null, h('b', null, o[1]), h('span', null, o[2])), h('span', { class: 'tick' }, icon('check'))));
    });
    s.appendChild(ow);
    root.appendChild(s);

    // Redemption per program
    var programs = {};
    state.wallet.forEach(function (e) { var c = E.cardById(data, e.cardId); if (c && E.unitFor(c.program, data) !== 'percent') programs[c.program] = true; });
    var pids = Object.keys(programs);
    if (pids.length) {
      var rs = h('div', { class: 'section' }, h('h2', null, 'How you redeem'), h('p', { class: 'small muted' }, 'Overrides the priority above for one program.'));
      pids.forEach(function (pid) {
        var p = data.valuations.programs[pid]; if (!p) return;
        var sel = h('select', { class: 'field', 'aria-label': p.name });
        sel.appendChild(h('option', { value: '' }, 'Follow my priority (' + E.valuation(pid, { priority: state.prefs.priority, redeem: {} }, data, state.wallet) + '¢)'));
        if (p.cash) sel.appendChild(h('option', { value: 'cash' }, 'Cash (' + p.cash + '¢)'));
        if (p.travel) sel.appendChild(h('option', { value: 'travel' }, 'Issuer travel site (' + p.travel + '¢)'));
        if (p.transfer && p.transfer !== p.travel) sel.appendChild(h('option', { value: 'transfer' }, 'Transfer partners (' + p.transfer + '¢)'));
        sel.value = state.prefs.redeem[pid] || '';
        sel.addEventListener('change', function () { if (sel.value) state.prefs.redeem[pid] = sel.value; else delete state.prefs.redeem[pid]; saveState(); });
        rs.appendChild(h('div', null, h('label', { class: 'lbl' }, p.name), sel));
      });
      root.appendChild(rs);
    }

    var ps = h('div', { class: 'section' }, h('h2', null, 'Paying'));
    ps.appendChild(h('div', { class: 'row' }, h('span', { class: 't' }, h('b', null, 'I usually pay with my phone'), h('span', null, 'Apple Pay or Google Pay. A few cards pay more this way.')),
      h('button', { class: 'switch' + (state.prefs.payMethod === 'wallet' ? ' on' : ''), role: 'switch', 'aria-checked': state.prefs.payMethod === 'wallet' ? 'true' : 'false', 'aria-label': 'Pay with phone by default', onclick: function () { state.prefs.payMethod = state.prefs.payMethod === 'wallet' ? 'card' : 'wallet'; ctx.payMethod = state.prefs.payMethod; saveState(); renderMore(); } })));
    ps.appendChild(h('div', { class: 'row' }, h('span', { class: 't' }, h('b', null, 'Find my store when I open the app'), h('span', null, PREVIEW ? 'Available in the installed app, not in this preview.' : 'Uses your location once per visit. Nothing is stored.')),
      h('button', { class: 'switch' + (state.prefs.location ? ' on' : ''), role: 'switch', 'aria-checked': state.prefs.location ? 'true' : 'false', 'aria-label': 'Use location', disabled: PREVIEW ? true : null, onclick: function () { state.prefs.location = !state.prefs.location; state.locationAsked = true; saveState(); renderMore(); if (state.prefs.location) locate(); } })));
    ps.appendChild(h('div', { class: 'row' }, h('span', { class: 't' }, h('b', null, 'I am outside the US'), h('span', null, 'Counts foreign transaction fees against each card.')),
      h('button', { class: 'switch' + (state.prefs.abroad ? ' on' : ''), role: 'switch', 'aria-checked': state.prefs.abroad ? 'true' : 'false', 'aria-label': 'Outside the US', onclick: function () { state.prefs.abroad = !state.prefs.abroad; saveState(); renderMore(); } })));
    root.appendChild(ps);

    var ts = h('div', { class: 'section' }, h('h2', null, 'Look'));
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme', style: 'display:flex' });
    [['system', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']].forEach(function (o) {
      seg.appendChild(h('button', { class: (state.prefs.theme || 'system') === o[0] ? 'on' : '', style: 'flex:1;justify-content:center', onclick: function () { state.prefs.theme = o[0]; saveState(); applyTheme(); renderMore(); } }, o[1]));
    });
    ts.appendChild(seg);
    root.appendChild(ts);

    var ds = h('div', { class: 'section' }, h('h2', null, 'Card data'));
    ds.appendChild(h('div', { class: 'row' }, h('span', { class: 't' }, h('b', null, 'Checked ' + fmtLongDate(data.verified)), h('span', null, data.cards.length + ' cards, ' + data.merchants.length + ' stores. Rates come from issuer pages and are reviewed daily.')),
      PREVIEW ? null : h('button', { class: 'btn', onclick: function () { toast('Checking for new data'); fetchData().then(function (d) { if (!d) { toast('Could not reach the data file'); return; } var changed = d.cards.version !== data.version; data = normalizeData(d); try { localStorage.setItem(DATA_KEY, JSON.stringify(d)); } catch (e) { } toast(changed ? 'Updated to ' + fmtLongDate(d.cards.version) : 'Already up to date'); renderMore(); }); } }, 'Refresh')));
    root.appendChild(ds);

    var ms = h('div', { class: 'section' }, h('h2', null, 'Move to another phone'), h('p', { class: 'small muted' }, 'Your cards and settings live only on this phone. Copy a setup code here and paste it on the other one.'));
    var codeArea = h('textarea', { class: 'field', rows: '3', placeholder: 'Paste a setup code', 'aria-label': 'Setup code' });
    ms.appendChild(h('div', { class: 'grid2' },
      h('button', { class: 'btn', onclick: function () { var code = exportCode(); codeArea.value = code; copyText(code).then(function () { toast('Setup code copied'); }, function () { toast('Code is in the box below. Select and copy it.'); }); } }, 'Copy my setup code'),
      h('button', { class: 'btn', onclick: function () { if (importCode(codeArea.value)) { toast('Setup loaded'); renderAll(); } else toast('That code did not work'); } }, 'Load a setup code')));
    ms.appendChild(codeArea);
    root.appendChild(ms);

    var as = h('div', { class: 'section' }, h('h2', null, 'About'),
      h('div', { class: 'box small' },
        h('p', null, h('b', null, 'Which Card'), ' by Tompkins Software Systems.'),
        h('p', { style: 'margin-top:8px' }, 'Nothing to sign up for. Your card list, purchases and settings stay on this phone. The only thing that leaves it is an anonymous nearby-places lookup when you use location.'),
        h('p', { style: 'margin-top:8px', class: 'pledge' }, 'Made by a cardholder, not a bank. No sponsors. No ads, ever. No subscription, ever. 99 cents once, for life.'),
        h('p', { style: 'margin-top:8px' }, h('b', null, 'About the card pictures. '), 'Drawn, not real. Partly because we are cheap a**es, mostly because the real designs are trademarked and we are not spending eternity in court over a picture. The sites with the real pictures have a deal with the bank and get paid when you click. We get squat, on purpose.'),
        h('p', { style: 'margin-top:8px' }, 'Independent of every bank and card network. No bank pays for placement, no referral links, no sponsored cards; the ranking is arithmetic on your own cards. Rates and terms change; the issuer’s agreement wins. Point values are estimates.'),
        h('p', { style: 'margin-top:8px' }, 'Questions or a wrong number: ', h('a', { href: 'mailto:' + CONTACT }, CONTACT))));
    as.appendChild(h('button', { class: 'btn block', onclick: openDisclaimer }, 'See the welcome note again'));
    as.appendChild(h('button', { class: 'btn danger block', onclick: function () { confirmReset(); } }, 'Erase everything on this phone'));
    root.appendChild(as);
  }
  function confirmReset() {
    openSheet('Erase everything?', [h('p', null, 'This removes your cards, goals and logged purchases from this phone. Card data comes back on the next load.'),
      h('button', { class: 'btn danger block', onclick: function () { try { localStorage.removeItem(STATE_KEY); } catch (e) { } state = loadState(); ctx = { merchant: null, category: null, customName: '', amount: '', payMethod: 'card' }; closeSheet(); showView('pay'); toast('Erased'); } }, 'Yes, erase'),
      h('button', { class: 'btn block', onclick: closeSheet }, 'Keep it')]);
  }
  function exportCode() { try { return 'WC1.' + btoa(unescape(encodeURIComponent(JSON.stringify({ wallet: state.wallet, prefs: state.prefs })))); } catch (e) { return ''; } }
  function importCode(code) {
    try {
      code = (code || '').trim(); if (code.indexOf('WC1.') !== 0) return false;
      var obj = JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
      if (!obj || !Array.isArray(obj.wallet)) return false;
      state.wallet = obj.wallet; state.prefs = obj.prefs || state.prefs; state.prefs.redeem = state.prefs.redeem || {}; state.onboarded = true; saveState(); return true;
    } catch (e) { return false; }
  }
  function copyText(t) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t); return Promise.reject(); }

  /* ---------- init ---------- */
  function readParams() {
    var p = new URLSearchParams(location.search);
    if (p.get('m')) { ctx.merchant = p.get('m'); ctx.category = null; }
    else if (p.get('cat')) { ctx.category = p.get('cat'); ctx.merchant = null; }
    if (p.get('amt')) ctx.amount = p.get('amt');
    if (p.get('m') || p.get('cat') || p.get('amt')) { try { history.replaceState(null, '', location.pathname); } catch (e) { } return true; }
    return false;
  }

  function bind() {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { showView(b.getAttribute('data-view')); }); });
    document.getElementById('btn-start').addEventListener('click', function () { openAddCards(true); });
    document.getElementById('btn-locate').addEventListener('click', function () { showView('pay'); if (ctx.merchant || ctx.category) { ctx.merchant = null; ctx.category = null; ctx.customName = ''; } locate(); });
    var amt = document.getElementById('amount');
    amt.addEventListener('input', function () {
      var v = amt.value.replace(/[^0-9.]/g, ''); var parts = v.split('.'); if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join(''); if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0, 2);
      if (v !== amt.value) amt.value = v; ctx.amount = v; renderAnswer();
    });
    amt.addEventListener('keydown', function (e) { if (e.key === 'Enter') amt.blur(); });
    document.getElementById('pm-card').addEventListener('click', function () { ctx.payMethod = 'card'; renderPay(); });
    document.getElementById('pm-wallet').addEventListener('click', function () { ctx.payMethod = 'wallet'; renderPay(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.prefs.location && view === 'pay' && !ctx.merchant && !ctx.category) locate(); });
  }

  function applyTheme() {
    var t = state.prefs.theme || 'system';
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function start() {
    bind();
    applyTheme();
    var fromParams = readParams();
    if (!fromParams && state.lastWhere && Date.now() - (state.lastWhere.at || 0) < 20 * 60 * 1000) {
      ctx.merchant = state.lastWhere.merchant; ctx.category = state.lastWhere.category; ctx.customName = state.lastWhere.customName || '';
    }
    document.getElementById('amount').value = ctx.amount || '';
    showView('pay');
    if (!state.wallet.length && !state.onboarded) { onboarding = true; }
    if (!state.disclaimed) openDisclaimer();
    else if (state.prefs.location && !ctx.merchant && !ctx.category) locate();
    if (!PREVIEW && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('A new version is ready', 'Reload', function () { location.reload(); }); });
        });
      }).catch(function () { /* no offline support */ });
    }
  }

  loadData().then(function () {
    if (!data) { document.getElementById('view-pay').innerHTML = '<div class="empty"><h2>Could not load card data</h2><p class="muted">Check your connection and reload.</p></div>'; return; }
    start();
  });
})();
