/* Witch Card: app shell. Depends on engine.js (WhichCardEngine, the engine's name from before the rename). */
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
  var ctx = { merchant: null, category: null, customName: '', payMethod: state.prefs.payMethod || 'card' };
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
    s.customCards = s.customCards || [];
    s.myPlaces = s.myPlaces || [];
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
      categories: d.categories.categories, merchants: d.merchants.merchants, catalog: d.cards.cards.slice(),
      bonuses: d.bonuses, valuations: d.valuations, version: d.cards.version, verified: d.cards.verified || d.cards.version
    };
    out.catalog.forEach(function (c) { if (!c.color) c.color = issuerColor(c.issuer); });
    out.valuations.programs['custom-points'] = out.valuations.programs['custom-points'] || { name: 'Points (your estimate)', unit: 'points', cash: 1, travel: 1, transfer: 1, note: 'Valued at 1 cent each unless you change it in More.' };
    out.cards = out.catalog.concat(state.customCards || []);
    return out;
  }
  function rebuildCards() { if (data) data.cards = data.catalog.concat(state.customCards || []); }
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
  // The three stops of a card's face, its ink, and its chip, from the card's color and finish.
  function cardColors(card) {
    var finish = card.finish || 'plastic';
    var base = card.color || '#3C4A5A';
    var c1, c2, c3, ink, chipA = '#F2D07A', chipB = '#B8902F';
    if (finish === 'silver') { c1 = '#F2F4F6'; c2 = '#C9D0D8'; c3 = '#9AA6B4'; ink = '#1B222B'; }
    else if (finish === 'gold') { c1 = '#F3E2A6'; c2 = '#D6B459'; c3 = '#A98528'; ink = '#2A2208'; chipA = '#FFF4CC'; chipB = '#C9A14A'; }
    else if (finish === 'black') { c1 = '#3A3F47'; c2 = '#17191E'; c3 = '#07080A'; ink = '#F3F4F6'; }
    else if (finish === 'metal') { c1 = shade(base, 0.35); c2 = base; c3 = shade(base, -0.45); ink = textColorFor(base) === 'dark-text' ? '#101418' : '#FFFFFF'; }
    else { c1 = shade(base, 0.22); c2 = base; c3 = shade(base, -0.3); ink = textColorFor(base) === 'dark-text' ? '#101418' : '#FFFFFF'; }
    return { finish: finish, c1: c1, c2: c2, c3: c3, ink: ink, chipA: chipA, chipB: chipB };
  }
  // opts.bare leaves the card's name off the face, for the big cards that print the name beside them.
  function cardArt(card, width, opts) {
    opts = opts || {};
    var id = 'ca' + (++artSeq);
    var col = cardColors(card), finish = col.finish;
    var c1 = col.c1, c2 = col.c2, c3 = col.c3, ink = col.ink, chipA = col.chipA, chipB = col.chipB;
    var W = 320, H = 200, big = width >= 120 && !opts.bare, mid = width >= 60;
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
      (mid ? '<text x="28" y="40" fill="' + ink + '" fill-opacity=".82" font-family="Archivo WC, Archivo, Helvetica, Arial, sans-serif" font-size="15" font-weight="700" font-stretch="112%" letter-spacing="2">' + escapeAttr((card.issuer || '').toUpperCase()) + '</text>' : '') +
      (big ? lines.map(function (l, i) { return '<text x="28" y="' + (142 + i * 24) + '" fill="' + ink + '" font-family="Archivo WC, Archivo, Helvetica, Arial, sans-serif" font-size="' + (lines.length > 1 ? 22 : 24) + '" font-weight="800" font-stretch="106%">' + escapeAttr(l) + '</text>'; }).join('') : '') +
      '<text x="' + (W - 28) + '" y="' + (H - 22) + '" text-anchor="end" fill="' + ink + '" fill-opacity=".9" font-family="Archivo WC, Archivo, Helvetica, Arial, sans-serif" font-size="' + (mid ? 16 : 26) + '" font-weight="850" font-style="italic" font-stretch="112%" letter-spacing="1">' + net + '</text>' +
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
    stopCamera();
    var root = document.getElementById('sheet-root'); clear(root);
    var body = h('div', { class: 'sheet-body' }, h('div', { class: 'wrap stack' }, bodyNodes));
    var sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'grab' }),
      // quietHead: the body carries its own big title (card detail), so the head is just the close button.
      h('div', { class: 'wrap sheet-head' + (opts.quietHead ? ' quiet' : '') }, opts.quietHead ? null : h('h2', null, title), opts.noClose ? null : h('button', { class: 'close', 'aria-label': 'Close', onclick: closeSheet }, icon('x'))),
      body);
    var back = h('div', { class: 'sheet-backdrop', onclick: function () { if (!opts.noClose) closeSheet(); } });
    root.appendChild(back); root.appendChild(sheet);
    document.body.style.overflow = 'hidden';
    return { sheet: sheet, body: body };
  }
  function closeSheet() { stopCamera(); clear(document.getElementById('sheet-root')); document.body.style.overflow = ''; if (typeof sheetOnClose === 'function') { var f = sheetOnClose; sheetOnClose = null; f(); } }
  var sheetOnClose = null;

  /* ---------- first-run disclaimer ---------- */
  // The mascot: a goofy plum card dressed as a witch, riding a broom. Arms take the text color so they show in dark mode.
  function mascotSvg() {
    return '<svg viewBox="-40 -66 296 274" width="214" height="198" role="img" aria-label="A goofy cartoon credit card dressed as a witch, riding a broom">' +
      '<defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8A55C9"/><stop offset="1" stop-color="#3B1A60"/></linearGradient>' +
      '<linearGradient id="mh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A2F6E"/><stop offset="1" stop-color="#170D20"/></linearGradient></defs>' +
      '<path d="M4 172 L 244 138" stroke="#7A4A22" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M11.2 165.1 L -26.8 156.2 Q -36 176 -21.2 195.8 L 12.8 176.9 Z" fill="#E8B04B"/>' +
      '<path d="M11 168 L -28 164 M11.5 171 L -30 176 M12 174 L -26 188" stroke="#B9802A" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
      '<path d="M9 163.5 L 17.5 162.3 L 19.2 178.2 L 10.6 179.4 Z" fill="#5B2E86"/>' +
      '<g transform="rotate(-8 120 95)">' +
      '<rect x="30" y="40" width="180" height="112" rx="14" fill="url(#mg)"/>' +
      '<rect x="30" y="62" width="180" height="16" fill="#24103A" opacity=".9"/>' +
      '<rect x="46" y="118" width="38" height="24" rx="5" fill="#F6A623"/><path d="M46 130h38M65 118v24" stroke="#B87400" stroke-width="2"/>' +
      '<circle cx="104" cy="104" r="17" fill="#fff"/><circle cx="150" cy="100" r="22" fill="#fff"/>' +
      '<circle cx="109" cy="106" r="7" fill="#101418"/><circle cx="144" cy="103" r="10" fill="#101418"/>' +
      '<circle cx="111" cy="103" r="2.5" fill="#fff"/><circle cx="147" cy="99" r="3" fill="#fff"/>' +
      '<path d="M90 86 q14 -10 26 -2" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M132 74 q18 -4 32 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M104 128 q30 22 60 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M128 139 q8 14 2 24 q-10 -6 -2 -24z" fill="#E86A6A"/>' +
      '<text x="198" y="57" text-anchor="end" fill="#fff" font-family="Archivo WC, Archivo, Helvetica, Arial, sans-serif" font-size="10.5" font-weight="800" font-style="italic" font-stretch="112%" letter-spacing=".6" opacity=".85">PAYS IN FULL</text>' +
      '<g transform="rotate(-7 89 40) translate(-4 0) translate(89 40) scale(1.2) translate(-89 -40)">' +
      '<path d="M64 39 Q 78 4 92 -22 Q 104 -42 126 -30 Q 129 -28 124 -26 Q 110 -28 104 -14 Q 98 8 114 39 Z" fill="url(#mh)" stroke="#6A4A96" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M67 32 Q 89 35.5 110.5 32 L 107.4 24 Q 89 27.5 70.2 24 Z" fill="#F6A623"/>' +
      '<rect x="84" y="24.6" width="10" height="8.6" rx="1.6" fill="none" stroke="#1E1328" stroke-width="2"/>' +
      '<ellipse cx="89" cy="40" rx="46" ry="8" fill="url(#mh)" stroke="#6A4A96" stroke-width="1.2"/>' +
      '</g></g>' +
      '<path d="M40 60 q-22 -4 -28 18" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="12" cy="80" r="7" fill="currentColor"/>' +
      '<path d="M206 70 q22 -16 26 2" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="232" cy="72" r="7" fill="currentColor"/>' +
      '</svg>';
  }
  // The witch hat, on its own: it lands on the card to use. Same shape as the mascot's.
  var hatSeq = 0;
  function hatSvg() {
    var id = 'wh' + (++hatSeq);
    return '<svg viewBox="38 -44 102 96" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A2F6E"/><stop offset="1" stop-color="#170D20"/></linearGradient></defs>' +
      '<path d="M64 39 Q 78 4 92 -22 Q 104 -42 126 -30 Q 129 -28 124 -26 Q 110 -28 104 -14 Q 98 8 114 39 Z" fill="url(#' + id + ')" stroke="#7A5AA8" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M67 32 Q 89 35.5 110.5 32 L 107.4 24 Q 89 27.5 70.2 24 Z" fill="#F6A623"/>' +
      '<rect x="84" y="24.6" width="10" height="8.6" rx="1.6" fill="none" stroke="#1E1328" stroke-width="2"/>' +
      '<ellipse cx="89" cy="40" rx="46" ry="8" fill="url(#' + id + ')" stroke="#7A5AA8" stroke-width="1.6"/>' +
      '</svg>';
  }
  function openDisclaimer() {
    var art = h('div', { class: 'mascot' }); art.innerHTML = mascotSvg();
    var nodes = [
      art,
      h('p', { class: 'mascot-note' }, 'No magic. Just math.'),
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
    var changing = view !== name;
    view = name;
    ['pay', 'wallet', 'offers', 'more'].forEach(function (v) {
      var el = document.getElementById('view-' + v);
      el.hidden = v !== name;
      if (v === name && changing) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
    });
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-view') === name); });
    window.scrollTo(0, 0);
    renderView(name);
  }
  // A dot on the Wallet tab while a reminder there is waiting.
  function markTabs() {
    var probe = h('div'); renderReminder(probe, function () { });
    var b = document.querySelector('.tabs button[data-view=wallet]');
    if (b) b.classList.toggle('dot', probe.childNodes.length > 0);
  }
  function renderView(name) {
    markTabs();
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
    renderAnswer();
  }

  function renderBanner() {
    var root = document.getElementById('banner'); clear(root); root.hidden = true;
    if (!state.prefs.location && !state.locationAsked && canLocate()) {
      root.hidden = false;
      root.appendChild(h('div', { class: 'note ask' },
        h('b', null, 'Let it find the store for you?'),
        h('span', null, 'Each time you open the app, it names the store you\u2019re in and the card to use there. Your position is only used to find the stores around you.'),
        h('span', { class: 'ask-actions' },
          h('button', { class: 'btn', onclick: function () { state.locationAsked = true; saveState(); renderBanner(); } }, 'Not now'),
          h('button', { class: 'btn primary', onclick: function () { state.locationAsked = true; state.prefs.location = true; saveState(); renderBanner(); relocate(); } }, 'Use my location'))));
    }
  }

  // Activation and perk reminders sit at the top of the Wallet tab, which shows a dot until they are handled.
  function renderReminder(root, redraw) {
    var q = E.quarterOf(new Date());
    state.dismissed = state.dismissed || {};
    if (!state.dismissed['activate:' + q]) {
      var pending = [];
      state.wallet.forEach(function (entry) {
        var card = E.cardById(data, entry.cardId); if (!card || !card.rotating || !card.rotating.activation) return;
        var cal = card.rotating.calendar && card.rotating.calendar[q]; if (!cal) return;
        if (!(entry.activated && entry.activated[q])) pending.push({ card: card, entry: entry, cal: cal });
      });
      if (pending.length) {
        var p = pending[0];
        root.appendChild(h('div', { class: 'note warn remind' },
          h('p', null, h('b', null, p.card.name + ': '), 'activate the ' + quarterLabel(q) + ' ' + rateText(p.card.rotating.rate, E.unitFor(p.card.program, data)) + ' categories' + (p.cal.activateBy ? ' by ' + E.fmtDate(p.cal.activateBy) : '') + (pending.length > 1 ? ' (and ' + (pending.length - 1) + ' more)' : '') + '.'),
          h('div', { class: 'remind-actions' },
            p.card.rotating.activationUrl ? h('a', { class: 'btn primary', href: p.card.rotating.activationUrl, target: '_blank', rel: 'noopener' }, 'Activate') : null,
            h('button', { class: 'btn', onclick: function () { p.entry.activated = p.entry.activated || {}; p.entry.activated[q] = true; saveState(); redraw(); toast('Marked ' + p.card.name + ' as activated'); } }, 'Done, activated'),
            h('button', { class: 'btn ghost', onclick: function () { state.dismissed['activate:' + q] = true; saveState(); redraw(); } }, 'Later'))));
        return;
      }
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
    root.appendChild(h('div', { class: 'note remind' },
      h('p', null, h('b', null, pk.card.name), ' has ' + pk.n + (pk.n === 1 ? ' perk' : ' perks') + ' to activate' + (perkCards.length > 1 ? ', and ' + (perkCards.length - 1) + (perkCards.length === 2 ? ' other card does too' : ' other cards do too') : '') + '.'),
      h('div', { class: 'remind-actions' },
        h('button', { class: 'btn primary', onclick: function () { openCardDetail(pk.card.id); } }, 'Review'),
        h('button', { class: 'btn ghost', onclick: function () { state.dismissed['perks:' + q] = true; saveState(); redraw(); } }, 'Later'))));
  }

  function currentWhere() {
    if (ctx.merchant) { var m = E.merchantById(data, ctx.merchant); return { title: m ? m.name : ctx.merchant, sub: cat(m ? m.category : 'other').name, icon: cat(m ? m.category : 'other').icon }; }
    if (ctx.category) { var c = cat(ctx.category); return { title: ctx.customName || c.name, sub: ctx.customName ? c.name : c.desc, icon: c.icon }; }
    return null;
  }

  // The Pay screen, top to bottom, all on one screen: where you are with "Not here?" under it
  // (#where), the card to use (#answer-top), its flags and a note about the store (#answer-more),
  // "Remember this spot" (#where-more), and the rest of the wallet in its pocket (#answer).
  function renderWhere() {
    var root = document.getElementById('where'); clear(root);
    var more = document.getElementById('where-more'); clear(more);
    var w = currentWhere();
    if (!w && locating) {
      root.appendChild(h('div', { class: 'where-chip finding', role: 'status' },
        h('span', { class: 'ic' }, icon('pin')),
        h('span', { class: 't' }, h('b', null, 'Finding where you are\u2026'), h('span', null, locateStage === 'slow' ? 'The map is slow. Still looking\u2026' : locateStage === 'map' ? 'Checking the stores around you' : 'Getting your position')),
        h('button', { class: 'change', onclick: cancelLocate }, 'Pick it')));
      return;
    }
    if (w) {
      var found = justFound; justFound = false;
      root.appendChild(h('button', { class: 'where-chip' + (ctx.located ? ' here' : '') + (found ? ' found' : ''), 'aria-label': (ctx.located ? 'You are at ' : 'Store: ') + w.title + '. Tap to change.', onclick: function () { if (locating) cancelLocate(); ctx.merchant = null; ctx.category = null; ctx.customName = ''; ctx.located = false; nearState = false; renderPay(); } },
        h('span', { class: 'ic', style: '--tint:' + tintFor(ctx.category || (ctx.merchant ? (E.merchantById(data, ctx.merchant) || {}).category : 'other')) }, icon(w.icon)),
        h('span', { class: 't' }, ctx.located ? h('span', { class: 'here-label' }, icon('pin'), 'You\u2019re at') : null, h('b', null, w.title), h('span', null, w.sub)),
        h('span', { class: 'change' }, 'Change')));
      var others = nearby.filter(function (n) { return !(n.merchant ? n.merchant === ctx.merchant : (!ctx.merchant && n.category === ctx.category && n.name === ctx.customName)); }).slice(0, 3);
      if (others.length) {
        // "Not here?" sits right under the store line, so a wrong store is fixed before reading the answer.
        root.appendChild(h('div', { class: 'nearby scroll-row', role: 'group', 'aria-label': 'Other stores near you' }, [h('span', { class: 'nearby-label' }, 'Not here?')].concat(others.map(function (n, i) {
          return h('button', { style: '--i:' + i, onclick: function () { applyNearby(n); } }, n.name, h('small', null, feet(n.edge)));
        }))));
      }
      var rn = rememberNote(w); if (rn) more.appendChild(rn);
      fitPay();
      return;
    }
    var picker = h('div', { class: 'picker' });
    var input = h('input', { id: 'store-search', type: 'search', placeholder: 'Store, website or app', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Store name' });
    var suggest = h('ul', { class: 'suggest', hidden: true });
    input.addEventListener('input', function () { renderSuggest(input.value, suggest); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var first = suggest.querySelector('li:not(.kind) button');
        if (first) first.click();
        else if (suggest.querySelector('.kinds')) input.blur();
      }
    });
    // Stores near you and kinds of place each sit on one row that scrolls sideways, so the picker
    // stays short and the answer under it stays on screen. (The pin in the header looks again.)
    if (nearby.length) picker.appendChild(h('div', { class: 'near' },
      h('p', { class: 'near-label' }, icon('pin'), nearState ? 'Near you. Tap the one you\u2019re at:' : 'Near you:'),
      h('div', { class: 'nearby scroll-row', role: 'group', 'aria-label': 'Stores near you' }, nearby.slice(0, 4).map(function (n, i) { return h('button', { style: '--i:' + i, onclick: function () { applyNearby(n); } }, n.name, h('small', null, feet(n.edge))); }))));
    picker.appendChild(h('div', { class: 'search' }, icon('search'), input));
    picker.appendChild(suggest);
    var quick = h('div', { class: 'quick scroll-row', role: 'group', 'aria-label': 'Kinds of place' });
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
    // A name the app does not know: guess what kind of place it is (clues in the name at once, then a
    // name search of the map), offer the guess as one tap, and the other kinds under it.
    if (!items.length) {
      var name = q.replace(/\s+/g, ' ').trim(), shown = name.charAt(0).toUpperCase() + name.slice(1);
      var guessRow = h('li', { class: 'guess' }), seq = ++kindSeq;
      function showGuess(g) {
        clear(guessRow);
        if (!g) { guessRow.appendChild(h('p', { class: 'muted' }, h('b', null, shown), ' is not on the list yet. What kind of place is it?')); return; }
        var c = cat(g.category);
        guessRow.appendChild(h('button', { style: '--tint:' + tintFor(c.id), onclick: function () { setWhere(null, c.id, g.name || shown); } },
          icon(c.icon), h('span', { class: 'gname' }, g.name || shown, h('small', null, c.name + (g.how === 'map' ? ', from the map' : ', a guess from the name'))), h('span', { class: 'cat' }, 'Use it')));
      }
      var clue = guessKind(name);
      showGuess(clue ? { category: clue, how: 'name' } : null);
      if (name.length >= 3) lookupKind(name).then(function (g) { if (seq === kindSeq && g) showGuess(g); }, function () { });
      var kinds = h('div', { class: 'kinds', role: 'group', 'aria-label': 'What kind of place is it' });
      data.categories.filter(function (c) { return c.quick && c.id !== 'other'; }).concat([cat('other')]).forEach(function (c) {
        kinds.appendChild(h('button', { style: '--tint:' + tintFor(c.id), onclick: function () { setWhere(null, c.id, shown); } }, icon(c.icon), c.id === 'other' ? 'Something else' : c.short || c.name));
      });
      items.push(guessRow);
      items.push(h('li', { class: 'kind' }, h('p', null, 'Or pick the kind:'), kinds));
    }
    items.forEach(function (li) { ul.appendChild(li); });
    ul.hidden = false;
  }

  // What kind of place a name is. First clues in the name itself, instant and offline; then a name
  // search of the map, biased to where the phone is, which often knows a place under that name
  // somewhere nearby even when it is missing at this spot. The typed name goes to photon.komoot.io.
  var kindSeq = 0;
  var NAME_CLUES = [
    [/\b(steak ?house|grill(e)?|bar|pub|tavern|taproom|brew(ery|ing|house)|cantina|bistro|kitchen|diner|cafe|café|coffee|espresso|bakery|donuts?|doughnuts?|bagels?|pizza|pizzeria|taco|taqueria|burrito|sushi|ramen|noodle|pho|thai|wok|bbq|barbecue|burger|wings|chicken|seafood|oyster|crab|lobster|ristorante|trattoria|osteria|cucina|eatery|restaurant|lounge|cocktail|wine bar|winery|distillery|ice cream|gelato|frozen yogurt|smoothie|juice|tea house|boba|creamery|chophouse|cheesesteak|deli|sandwich|subs?|hot dogs?|waffle|pancake|breakfast|brunch|buffet|food hall|food court)\b/i, 'dining'],
    [/\b(gas|fuel|petroleum|petrol|service station|travel center|truck stop)\b/i, 'gas'],
    [/\b(super ?market|grocery|groceries|market|foods?|produce|farmers market|mercado|bodega|co-?op)\b/i, 'groceries'],
    [/\b(pharmacy|drug ?store|drugs|apothecary|rx)\b/i, 'drugstore'],
    [/\b(hardware|lumber|home center|building supply|paint|garden center|nursery)\b/i, 'home-improvement'],
    [/\b(hotel|inn|suites|resort|motel|lodge|hostel|b ?& ?b)\b/i, 'hotels'],
    [/\b(cinema|theat(er|re)|movies|arcade|bowling|golf|mini golf|amusement|escape room|aquarium|museum|zoo|stadium|arena)\b/i, 'entertainment'],
    [/\b(gym|fitness|crossfit|yoga|pilates|athletic club|climbing)\b/i, 'fitness'],
    [/\b(warehouse club|wholesale)\b/i, 'warehouse'],
    [/\b(rent-?a-?car|car rental)\b/i, 'rental-car'],
    [/\b(charging|supercharger|ev station)\b/i, 'ev-charging'],
    [/\b(airport|airlines?|airways)\b/i, 'flights'],
    [/\b(parking|garage|transit|metro|railway|rail|bus)\b/i, 'transit']
  ];
  function guessKind(name) {
    for (var i = 0; i < NAME_CLUES.length; i++) if (NAME_CLUES[i][0].test(name)) return NAME_CLUES[i][1];
    return null;
  }
  function kindFromTags(t) {
    var found = null;
    Object.keys(t).some(function (k) { var kv = k + '=' + t[k]; return OSM_MAP.some(function (m) { if (m[0].test(kv)) { found = m[1]; return true; } return false; }); });
    return found;
  }
  function lookupKind(name) {
    var url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(name) + '&limit=6' + (lastFix ? '&lat=' + lastFix.lat.toFixed(4) + '&lon=' + lastFix.lon.toFixed(4) : '');
    var c = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (c) c.abort(); }, 6000);
    return fetch(url, { signal: c ? c.signal : undefined }).then(function (r) { if (!r.ok) throw new Error('error ' + r.status); return r.json(); }).then(function (j) {
      clearTimeout(timer);
      var want = name.toLowerCase().replace(/[^a-z0-9]/g, ''), best = null;
      (j && j.features || []).forEach(function (f) {
        if (best) return;
        var pr = f.properties || {}; if (!pr.name || ['shop', 'amenity', 'leisure', 'tourism'].indexOf(pr.osm_key) < 0) return;
        var have = String(pr.name).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (have.indexOf(want) < 0 && want.indexOf(have) < 0) return;
        var t = {}; t[pr.osm_key] = pr.osm_value || 'yes';
        var category = matchMerchant(pr.name, t) ? matchMerchant(pr.name, t).category : kindFromTags(t);
        if (category) best = { category: category, name: pr.name, how: 'map' };
      });
      return best;
    }, function (e) { clearTimeout(timer); throw e; });
  }

  function setWhere(merchantId, categoryId, customName, located, quiet) {
    ctx.merchant = merchantId; ctx.category = categoryId; ctx.customName = customName || ''; ctx.located = !!located;
    state.lastWhere = { merchant: merchantId, category: categoryId, customName: ctx.customName, located: ctx.located, at: Date.now() };
    saveState();
    renderPay();
  }
  // A store from the lookup. quiet: found on its own when the app opened.
  function applyNearby(n, quiet) { setWhere(n.merchant || null, n.merchant ? null : n.category, n.merchant ? '' : n.name, true, quiet); }
  // Offered under a store picked by hand while the phone knows where it is: remember this spot, so
  // next time standing here says "You're at". One line, one tap when the store already has a name.
  function rememberNote(w) {
    if (!state.prefs.location || ctx.located || !lastFix || Date.now() - lastFix.at > 10 * 60 * 1000) return null;
    var key = whereKey({ merchant: ctx.merchant, category: ctx.category, name: ctx.customName });
    if (rememberLater === key || nearMyPlace(lastFix.lat, lastFix.lon)) return null;
    var preset = ctx.merchant ? w.title : (ctx.customName || '');
    var input = h('input', { type: 'text', class: 'field', placeholder: 'Store name', value: preset, 'aria-label': 'Store name', autocomplete: 'off', autocapitalize: 'words' });
    function save() {
      var name = input.value.trim(); if (!name) { input.focus(); return; }
      rememberPlace(name, ctx.merchant, ctx.category || 'other', lastFix);
      ctx.customName = ctx.merchant ? '' : name; ctx.located = true;
      state.lastWhere = { merchant: ctx.merchant, category: ctx.category, customName: ctx.customName, located: true, at: Date.now() };
      saveState(); renderPay(); toast('Remembered. Next time you\u2019re here it will know.');
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    return h('div', { class: 'note remember' },
      h('span', null, 'Remember this spot? Next time you\u2019re here it will say so.'),
      h('div', { class: 'remember-row' }, input, h('button', { class: 'btn primary', onclick: save }, 'Remember'), h('button', { class: 'btn ghost', onclick: function () { rememberLater = key; renderWhere(); } }, 'Later')));
  }

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
    var top = document.getElementById('answer-top'), mid = document.getElementById('answer-more'), root = document.getElementById('answer');
    clear(top); clear(mid); clear(root);
    var where = currentWhere();
    if (!where && locating) { top.appendChild(h('div', { class: 'answer-wait', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'))); return; }
    // No amount: which card to use does not depend on how much you spend, so the answer is the rate.
    var rc = { merchant: ctx.merchant, category: ctx.category || (ctx.merchant ? null : 'other'), amount: 0, payMethod: ctx.payMethod, abroad: !!state.prefs.abroad };
    var rec = E.recommend(rc, state, data);
    if (!rec.best) return;
    var best = rec.best, card = best.card;
    var changed = lastWinner !== card.id;
    lastWinner = card.id;
    if (changed && interacted && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { } }
    var unit = best.unit;
    // "4% on gas" reads as a big 4% with "on gas" under it.
    var reasonTail = String(best.reason || '').replace(/^\s*[\d.]+\s*(%|x)\s*/i, '');
    if (best.entry.multiplier && best.entry.multiplier > 1) reasonTail += ' (with your ' + Math.round((best.entry.multiplier - 1) * 100) + '% boost)';
    var rateNum = h('span', null, rateText(best.effectiveRate, unit));
    // The card to use: its picture with the hat on it, its name and what it earns here. Tapping it opens the card.
    var art = cardArt(card, 140, { bare: true }); art.setAttribute('aria-hidden', 'true');
    var hat = h('span', { class: 'w-hat', 'aria-hidden': 'true' }); hat.innerHTML = hatSvg();
    top.appendChild(h('button', { class: 'winner' + (changed ? ' reveal' : '') + (where ? '' : ' nowhere'), onclick: function () { openCardDetail(card.id); } },
      h('span', { class: 'w-card' }, art, hat, changed ? sparkles() : null),
      h('span', { class: 'w-text' },
        h('span', { class: 'w-label' }, where ? icon('check') : null, where ? 'Use this card' : 'For everything else'),
        h('span', { class: 'name' }, best.entry.nickname || card.name),
        h('span', { class: 'rate num' }, rateNum, h('small', null, reasonTail + (unit !== 'percent' ? ', ' + unit + ' worth ' + pctText(best.effectivePercent) : '')))),
      h('span', { class: 'w-go', 'aria-hidden': 'true' }, icon('chev'))));
    if (changed) countUp(rateNum, best.effectiveRate, unit);
    // Anything to watch with this card here, and a note about the store (Costco takes Visa only).
    var flags = h('div', { class: 'flags' });
    best.warnings.forEach(function (w) { flags.appendChild(h('span', { class: 'flag warn' }, w)); });
    if (best.goal) flags.appendChild(h('span', { class: 'flag good' }, best.goal.label + ': ' + money(best.goal.remaining) + ' to go'));
    if (best.cap && best.cap.left > 0 && best.cap.left < best.cap.cap) flags.appendChild(h('span', { class: 'flag' }, money(best.cap.left) + ' of cap left ' + best.cap.label));
    if (flags.childNodes.length) mid.appendChild(flags);
    rec.notes.forEach(function (n) { mid.appendChild(h('p', { class: 'store-note' }, n)); });
    // The rest of the wallet, stacked in its pocket, best first.
    if (rec.results.length > 1) root.appendChild(pocket(rec, where, changed));
    fitPay();
  }

  // A few sparks off the hat when a new card comes out.
  function sparkles() {
    var box = h('span', { class: 'sparks', 'aria-hidden': 'true' });
    for (var i = 0; i < 6; i++) box.appendChild(h('i', { style: '--k:' + i }));
    return box;
  }

  // One card in the pocket: its colors, name, why, and what it earns here.
  function walletStrip(r, tag) {
    var col = cardColors(r.card);
    return h(tag || 'span', { class: 'strip' + (r.accepted ? '' : ' off'), style: '--c1:' + col.c1 + ';--c2:' + col.c2 + ';--c3:' + col.c3 + ';--on:' + col.ink },
      h('span', { class: 'n' }, r.entry.nickname || r.card.name,
        h('span', { class: 'why' }, r.reason),
        r.warnings.length ? h('span', { class: r.accepted ? 'warn' : 'bad' }, r.warnings[0]) : null,
        r.goal ? h('span', { class: 'why' }, r.goal.label + ': ' + money(r.goal.remaining) + ' to go') : null),
      h('span', { class: 'r' }, r.accepted ? rateText(r.effectiveRate, r.unit) : '\u00d7',
        r.accepted && r.unit !== 'percent' ? h('small', null, pctText(r.effectivePercent) + ' value') : null),
      h('span', { class: 'chip', 'aria-hidden': 'true', style: '--chipA:' + col.chipA + ';--chipB:' + col.chipB }),
      h('span', { class: 'net', 'aria-hidden': 'true' }, ({ 'American Express': 'AMEX', Mastercard: 'MASTERCARD', Visa: 'VISA', Discover: 'DISCOVER' })[r.entry.network || r.card.network] || ''));
  }
  function bestHere() {
    var where = currentWhere();
    if (ctx.merchant) return { where: { merchant: ctx.merchant }, label: where ? where.title : '' };
    var c = ctx.category && ctx.category !== 'other' ? ctx.category : 'other';
    return { where: { category: c }, label: inSentence(cat(c)) };
  }
  // The rest of the wallet in the stitched pocket, each card a strip in its own colors, best first;
  // each opens the card. "Best cards" opens the best cards out there for this place.
  function pocket(rec, where, changed) {
    var box = h('div', { class: 'pocket fill' + (changed ? ' slide' : '') });
    var bh = bestHere();
    box.appendChild(h('div', { class: 'pocket-label' }, h('span', { 'aria-hidden': 'true' }, 'The rest of your wallet'),
      h('button', { class: 'more', 'aria-label': 'Best cards for ' + bh.label, onclick: function () { openBestCards(bh.where, bh.label); } }, 'Best cards', icon('chev'))));
    var ul = h('ul', { class: 'others', 'aria-label': 'Your other cards, best first' });
    rec.results.slice(1).forEach(function (r, i) {
      var b = walletStrip(r, 'button'); b.addEventListener('click', function () { openCardDetail(r.card.id); });
      ul.appendChild(h('li', { style: '--i:' + i }, b));
    });
    box.appendChild(ul);
    return box;
  }
  // Where an element sits on the page from layout alone, so cards still sliding into place do not count.
  function layoutTop(el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }
  // The pocket fills the screen down to the tab bar, so Pay never scrolls and never ends in empty
  // space. Every card gets at least one line; the rest of the room goes by rank, the next best card
  // the most and the worst the least, each up to a whole card, so a weak card never takes over the
  // screen. A card with room shows its why, then its chip and network. When even one line each
  // does not fit, the last cards fold into "+N more", which opens the whole wallet. Measured from
  // layout, so it is right even while the cards are still sliding in.
  var CARD_MIN = 34, FOLD_H = 34;
  function fitPay() {
    if (view !== 'pay') return;
    var box = document.querySelector('#answer .pocket.fill'), tabs = document.querySelector('.tabs');
    if (!box || !tabs) return;
    var ul = box.querySelector('.others'), items = [].slice.call(ul.children), fold = box.querySelector('.fold');
    box.hidden = false;
    items.forEach(function (li) { li.hidden = false; li.classList.remove('end'); li.style.removeProperty('--h'); });
    if (fold) fold.parentNode.removeChild(fold);
    var avail = Math.floor(tabs.getBoundingClientRect().top - (layoutTop(ul) - (window.scrollY || 0)) - 26);
    var n = items.length, fits = n;
    while (fits > 0 && fits * CARD_MIN > avail - (fits < n ? FOLD_H : 0)) fits--;
    if (fits < n) {
      avail -= FOLD_H;
      for (var i = fits; i < n; i++) items[i].hidden = true;
      var k = n - fits;
      box.appendChild(h('button', { class: 'fold', onclick: openCardsHere }, fits ? '+' + k + ' more ' + (k === 1 ? 'card' : 'cards') : 'Your ' + k + ' other ' + (k === 1 ? 'card' : 'cards')));
      if (!fits && avail < 0) { box.hidden = true; return; }
    }
    if (!fits) return;
    var whole = Math.round(ul.clientWidth / 1.586), extra = avail - fits * CARD_MIN, shares = fits * (fits + 1) / 2, spill = 0;
    items.slice(0, fits).forEach(function (li, i) {
      var hgt = CARD_MIN + extra * (fits - i) / shares + spill; spill = 0;
      if (hgt > whole) { spill = hgt - whole; hgt = whole; }
      hgt = Math.floor(hgt);
      li.style.setProperty('--h', hgt + 'px');
      li.setAttribute('data-room', hgt >= 100 ? 'card' : hgt >= 56 ? 'why' : 'line');
    });
    items[fits - 1].classList.add('end');
  }
  window.addEventListener('resize', function () { fitPay(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitPay(); });
  // The whole wallet ranked for where you are, the best card anywhere for it, and the best cards out there.
  function openCardsHere() {
    var where = currentWhere();
    var rc = { merchant: ctx.merchant, category: ctx.category || (ctx.merchant ? null : 'other'), amount: 0, payMethod: ctx.payMethod, abroad: !!state.prefs.abroad };
    var rec = E.recommend(rc, state, data), label = where ? where.title : 'everything else';
    var nodes = [h('p', { class: 'muted' }, 'Every card in your wallet ' + (where ? 'at ' : 'for ') + label + ', best first. Tap one to see how to get the most from it.')];
    var box = h('div', { class: 'pocket' }), ul = h('ul', { class: 'others', 'aria-label': 'Your cards, best first' });
    rec.results.forEach(function (r, i) {
      var b = walletStrip(r, 'button'); b.addEventListener('click', function () { openCardDetail(r.card.id, openCardsHere); });
      ul.appendChild(h('li', { style: '--i:' + i }, b));
    });
    box.appendChild(ul); nodes.push(box);
    var bh = bestHere();
    nodes.push(h('button', { class: 'btn block', onclick: function () { openBestCards(bh.where, bh.label); } }, icon('trophy'), 'Best cards for ' + bh.label));
    openSheet(where ? 'Your cards at ' + where.title : 'Your cards', nodes);
  }

  /* ---------- Best card anywhere ---------- */
  // Typical spend per trip and trips per year, used until the person has logged a few purchases here.
  var TYPICAL = { groceries: [85, 52], gas: [45, 52], dining: [30, 52], online: [50, 24], warehouse: [150, 12], superstore: [60, 24], drugstore: [25, 12],
    travel: [400, 4], flights: [400, 3], hotels: [300, 3], 'portal-travel': [300, 3], transit: [15, 100], 'rental-car': [250, 2], streaming: [15, 12], phone: [90, 12],
    utilities: [150, 12], 'home-improvement': [75, 12], entertainment: [60, 12], 'department-store': [60, 8], fitness: [40, 12], 'ev-charging': [15, 52], rent: [1800, 12], other: [50, 12] };
  function paceKey() { return ctx.merchant ? 'm:' + ctx.merchant : 'c:' + (ctx.category || 'other'); }
  function historyHere() {
    var cutoff = Date.now() - 365 * 864e5, n = 0, total = 0, first = Date.now();
    state.wallet.forEach(function (e) {
      (e.purchases || []).forEach(function (p) {
        var t = new Date(p.date).getTime(); if (t < cutoff) return;
        var hit = ctx.merchant ? p.merchant === ctx.merchant : (p.category === ctx.category || (p.merchant && (E.merchantById(data, p.merchant) || {}).category === ctx.category));
        if (hit) { n++; total += Number(p.amount) || 0; if (t < first) first = t; }
      });
    });
    var days = Math.max(30, (Date.now() - first) / 864e5);
    return { n: n, avg: n ? total / n : 0, perYear: n ? Math.round(n * 365 / days) : 0 };
  }
  function pace(amount) {
    var catId = ctx.category || ((E.merchantById(data, ctx.merchant) || {}).category) || 'other';
    var t = TYPICAL[catId] || TYPICAL.other;
    var hist = historyHere();
    state.trips = state.trips || {};
    var saved = state.trips[paceKey()];
    var trips = saved || (hist.n >= 3 ? Math.max(1, hist.perYear) : t[1]);
    var perTrip = amount > 0 ? amount : (hist.n >= 3 ? hist.avg : t[0]);
    return { trips: trips, perTrip: perTrip, source: amount > 0 ? 'typed' : (hist.n >= 3 ? 'history' : 'typical'), tripsSource: saved ? 'set' : (hist.n >= 3 ? 'history' : 'typical') };
  }
  function dollars(c) { var v = Math.round(Math.abs(c) / 100); return (c < 0 ? '-' : '') + '$' + v.toLocaleString('en-US'); }
  function hypotheticalHow(r) {
    var catName = inSentence(cat(E.contextCategories({ merchant: ctx.merchant, category: ctx.category }, data).primary));
    if (r.source === 'choice') return r.card.choice && r.card.choice.auto ? 'Counted as if you use it only for ' + catName + ', so that stays its top category.' : 'Counted with ' + catName + ' picked as its bonus category.';
    if (r.source === 'choice2') return 'Counted with ' + catName + ' picked as its second category.';
    return '';
  }
  function renderAnywhere(root, rc, amount) {
    var p = pace(amount);
    var box = h('div', { class: 'anywhere' });
    var top = h('div', { class: 'aw-top' });
    var bottom = h('div', { class: 'aw-bottom' });
    var tripsOut = h('b', { class: 'num' }, String(p.trips));
    var slider = h('input', { type: 'range', min: '1', max: '208', step: '1', value: String(Math.min(208, p.trips)), 'aria-label': 'Trips a year here' });
    var paceLine = h('div', { class: 'aw-pace' },
      h('label', null, 'Trips a year here: ', tripsOut, h('span', { class: 'muted' }, ' of about ' + (Math.abs(p.perTrip - Math.round(p.perTrip)) < 0.005 ? '$' + Math.round(p.perTrip).toLocaleString('en-US') : money(p.perTrip)) + (p.source === 'typed' ? ' (this purchase)' : p.source === 'history' ? ' (your average)' : ' (typical)'))),
      slider);
    box.appendChild(top); box.appendChild(paceLine); box.appendChild(bottom);
    root.appendChild(box);
    var pending = false;
    function draw() {
      pending = false;
      var aw = E.bestAnywhere(rc, state, data, new Date(), p.perTrip, p.trips);
      clear(top); clear(bottom);
      if (!aw) { box.hidden = true; return; }
      var whereName = currentWhere().title;
      var b = aw.best, hi = aw.highestRate;
      var mineName = aw.mine ? (aw.mine.entry.nickname || aw.mine.card.name) : null;
      var win = b.gain >= 100;
      top.appendChild(h('div', { class: 'aw-eyebrow' }, icon('trophy'), 'Best card anywhere for ' + whereName));
      if (win) {
        top.appendChild(h('button', { class: 'aw-card', onclick: function () { openCardDetail(b.card.id); } },
          cardArt(b.card, 72),
          h('span', { class: 't' }, h('b', null, b.card.name),
            h('span', null, (b.unit === 'percent' ? pctText(b.effectivePercent) : rateText(b.effectiveRate, b.unit) + ' (about ' + pctText(b.effectivePercent) + ')') + ' here, ' + (b.cost ? '$' + Math.round(b.cost / 100) + ' a year' : 'no annual fee'))),
          h('span', { class: 'chev' }, icon('chev'))));
        top.appendChild(h('p', { class: 'aw-vs' }, mineName ? 'You\u2019re getting ' + pctText(aw.minePct) + ' with ' + mineName + '.' : 'Nothing in your wallet works here.'));
      } else {
        top.appendChild(h('p', { class: 'aw-set' }, mineName ? 'Nothing out there beats your ' + mineName + ' here. You\u2019re set.' : 'No card does better here.'));
      }
      var chips = h('div', { class: 'flags' });
      if (win) {
        b.needs.forEach(function (n) { chips.appendChild(h('span', { class: 'flag warn' }, 'Needs ' + n.replace(/^With /, ''))); });
        if (b.card.eligibility) chips.appendChild(h('span', { class: 'flag' }, b.card.eligibility));
        var how = hypotheticalHow(b); if (how) top.appendChild(h('p', { class: 'small muted' }, how));
      }
      if (chips.childNodes.length) top.appendChild(chips);
      if (aw.mine && aw.mine.source === 'rotating') {
        var qEnd = E.quarterEnd(new Date());
        top.appendChild(h('p', { class: 'small muted' }, 'Your ' + pctText(aw.minePct) + ' here is a rotating bonus that ends ' + qEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', so the yearly math uses your everyday best' + (aw.mineSteady ? ' (' + (aw.mineSteady.entry.nickname || aw.mineSteady.card.name) + ', ' + pctText(aw.mineSteady.effectivePercent) + ')' : '') + '.'));
      }
      if (win) {
        bottom.appendChild(h('div', { class: 'aw-net num' }, '+' + dollars(b.gain) + ' a year'));
        var gross = b.gain + b.cost;
        bottom.appendChild(h('p', { class: 'small' }, dollars(gross) + ' more in rewards on ' + dollars(p.perTrip * p.trips * 100) + ' a year of spending here' + (b.cost ? ', minus its ' + dollars(b.cost) + ' fee.' : '. No annual fee.')));
        if (b.cost && aw.bestBreakEven && aw.bestBreakEven.trips) bottom.appendChild(h('p', { class: 'small muted' }, 'Its fee pays for itself after about ' + aw.bestBreakEven.trips + ' trips a year here.'));
      }
      if (hi && hi !== b && hi.effectivePercent > (win ? b.effectivePercent : aw.minePct) + 0.01) {
        var be = aw.highestRateBreakEven;
        var line = 'Highest rate here is ' + hi.card.name + ' at ' + pctText(hi.effectivePercent) + ', but its ' + dollars(hi.cost) + ' fee ';
        line += be && be.never ? 'never pays off from this store alone.' : 'only pays off after about ' + be.trips + ' trips a year here.';
        bottom.appendChild(h('p', { class: 'small muted' }, line));
      }
      bottom.appendChild(h('p', { class: 'aw-foot small muted' }, 'Just math, counting only ' + whereName + '. Nobody paid for this spot.'));
    }
    slider.addEventListener('input', function () {
      p.trips = parseInt(slider.value, 10) || 1; tripsOut.textContent = String(p.trips);
      if (!pending) { pending = true; requestAnimationFrame(draw); }
    });
    slider.addEventListener('change', function () { state.trips = state.trips || {}; state.trips[paceKey()] = p.trips; saveState(); });
    draw();
  }

  /* ---------- location ---------- */
  // With location on, the app looks around every time it opens and every time it comes back after
  // a minute or more away, names the store you are standing in, and answers for that store. A store
  // picked by hand in the last few minutes is kept, so a quick switch to pay never moves you.
  //
  // How it finds the store:
  // 1. Two position requests start together: a quick one from Wi-Fi and cell towers and a precise
  //    one from GPS. The first usable fix answers; a better fix in the next few seconds corrects it.
  // 2. The map is asked for the named places around that fix. The search reaches past the 120 meters
  //    the answer uses, by as much as the fix might be off, so a better fix that lands inside the
  //    searched area is answered again from the same list, with no second lookup.
  // 3. Four public map services are raced: photon.komoot.io (a fast place index) and two Overpass
  //    servers at once, the third Overpass server two seconds later or as soon as one fails. The
  //    first answer that names a store the app knows wins; an empty answer only counts once every
  //    service has answered; a busy server's "runtime error" is not an answer at all. After 8
  //    seconds the screen says the map is slow and keeps looking; after 60 it gives up.
  // 4. The stores found around a spot are kept on this phone for 30 days, so a place you have been
  //    before is answered without asking the map again (refreshed quietly after 3 days).
  // 5. "You're at" is only said when it is sure: the position is inside the place's footprint, or
  //    within about 30 meters of it (a little more when the fix is rough). Otherwise the stores
  //    near you are offered, closest first, and you tap the one you are at.
  // 6. A place the map does not know can be remembered: pick the store or its kind by hand, give
  //    it a name, and the spot is saved on this phone. From then on, standing there says "You're at".
  // 7. The last lookup is written down (when, how good the fix was, which server answered and how
  //    fast) and shown under More, so a lookup that went wrong can be reported exactly.
  var locating = false, locateSeq = 0, locatePrev = null, justFound = false, hiddenAt = 0, locateStage = 'fix', nearState = false, lastFix = null, rememberLater = '';
  var PICK_HOLD = 3 * 60 * 1000, AWAY = 60 * 1000;
  var AROUND = 120, REUSE = 60, MOVED = 40, ROUGH_REACH = 150, PLACES_KEY = 'whichcard.places.v2', LOOKUP_KEY = 'whichcard.lookup.v1';
  var PLACES_DAYS = 30, PLACES_FRESH_DAYS = 3, PLACES_MAX = 40;
  var MAP_FIRST = 3, MAP_NEXT = 2000, MAP_SLOW = 8000, MAP_LIMIT = 60000;
  var DAY = 24 * 60 * 60 * 1000;
  // Version 1 of the saved stores could hold a busy server's empty answer as "no stores here". Drop it.
  try { localStorage.removeItem('whichcard.places.v1'); } catch (e) { }
  function canLocate() { return !PREVIEW && 'geolocation' in navigator; }
  function pickedJustNow() { var lw = state.lastWhere; return !!(lw && !lw.located && Date.now() - (lw.at || 0) < PICK_HOLD); }
  function whereKey(w) { return w ? (w.merchant || '') + '|' + (w.merchant ? '' : (w.category || '') + '|' + (w.customName || w.name || '')) : ''; }
  // How far around a fix to search: the 120 meters the answer uses, plus how far off the fix might be.
  function searchRadius(acc) { return AROUND + (acc > REUSE ? Math.min(acc, ROUGH_REACH) : REUSE); }
  // Sure enough to say "You're at": inside the place's footprint (edge distance 0), or within about
  // 30 meters of it, a little more when the fix is rough, never more than 60.
  function isAt(p, acc) { return p.edge <= Math.min(60, 30 + (acc || 0) / 2); }
  function feet(m) { var ft = m * 3.28084; return ft < 60 ? 'right here' : (Math.round(ft / 10) * 10) + ' ft'; }

  function locate() {
    if (!canLocate()) { toast('Location is not available here'); return; }
    if (locating) return;
    var seq = ++locateSeq, answered = false, center = null, raw = null, autoKey = null, stopFix = null, last = null, slowTimer = null;
    nearState = false;
    var t0 = Date.now(), trace = { at: t0, fixMs: null, acc: null, source: null, servers: [], found: null, top: null, outcome: null };
    locating = true; locateStage = 'fix';
    saveLookup(trace);
    var btn = document.getElementById('btn-locate'); btn.classList.add('busy');
    if (view === 'pay') { renderWhere(); renderAnswer(); }
    function live() { return seq === locateSeq; }
    function stage(name) { locateStage = name; if (view === 'pay' && locating && !ctx.merchant && !ctx.category) renderWhere(); }
    function settle() { if (!live()) return false; locating = false; clearTimeout(slowTimer); btn.classList.remove('busy'); return true; }
    function putBack() {
      var prev = locatePrev; locatePrev = null;
      if (prev && !ctx.merchant && !ctx.category) { ctx.merchant = prev.merchant; ctx.category = prev.category; ctx.customName = prev.customName; ctx.located = prev.located; }
    }
    function fail(msg) {
      if (stopFix) stopFix();
      if (!settle()) return;
      trace.outcome = msg; saveLookup(trace);
      putBack(); toast(msg); renderPay();
    }
    // Answer from the stores around the spot. "You're at" only when sure; otherwise the stores near
    // you, to tap. A later, better fix only moves the answer if the person has not touched it.
    function answer(lat, lon, acc) {
      var list = rankPlaces((raw || []).concat(myPlacesRaw()), lat, lon, Math.max(AROUND, center.radius || AROUND));
      var sure = list.length > 0 && isAt(list[0], acc);
      trace.found = list.length; trace.top = list.length ? list[0].name : null;
      if (!answered) {
        answered = true;
        if (!settle()) return;
        nearby = list;
        trace.outcome = !list.length ? 'none' : sure ? 'found' : 'near'; saveLookup(trace);
        if (!list.length) { putBack(); toast('No store found right here. Pick it above.'); renderPay(); return; }
        if (ctx.merchant || ctx.category) { locatePrev = null; renderPay(); return; }
        if (sure) { showFound(list[0]); return; }
        // Not sure. If the store shown before this lookup is among the places near you, it stays.
        var prev = locatePrev;
        if (prev && list.some(function (n) { return whereKey({ merchant: n.merchant, category: n.category, name: n.name }) === whereKey(prev); })) { putBack(); renderPay(); return; }
        locatePrev = null; nearState = true;
        renderPay();
        announce('Near you: ' + list.slice(0, 3).map(function (n) { return n.name; }).join(', ') + '. Tap the one you are at.');
        return;
      }
      if (!live() || !list.length) return;
      trace.outcome = sure ? 'found' : 'near'; saveLookup(trace);
      nearby = list;
      var top = list[0], key = whereKey({ merchant: top.merchant, category: top.category, name: top.name });
      var shown = whereKey({ merchant: ctx.merchant, category: ctx.category, name: ctx.customName });
      if (nearState && !ctx.merchant && !ctx.category) { if (sure && view === 'pay') { nearState = false; showFound(top); } else if (view === 'pay') renderWhere(); return; }
      if (autoKey && shown === autoKey && key !== autoKey && sure && view === 'pay') showFound(top); else if (view === 'pay') renderWhere();
    }
    function showFound(top) {
      var prev = locatePrev; locatePrev = null; nearState = false;
      var key = whereKey({ merchant: top.merchant, category: top.category, name: top.name });
      var before = prev ? whereKey(prev) : (autoKey || null);
      autoKey = key;
      justFound = true;
      applyNearby(top, true);
      announce('You’re at ' + top.name + '.');
    }
    function lookUp(lat, lon, acc) {
      // Standing at a spot the person remembered: that is the answer, no map needed.
      var mine = rankPlaces(myPlacesRaw(), lat, lon, AROUND);
      if (mine.length && isAt(mine[0], acc)) {
        raw = []; center = { lat: lat, lon: lon, radius: AROUND };
        trace.source = 'remembered'; trace.servers = [];
        answer(last.lat, last.lon, last.acc);
        return;
      }
      var spot = cachedSpot(lat, lon);
      if (spot) {
        raw = spot.places; center = { lat: spot.lat, lon: spot.lon, radius: spot.radius };
        trace.source = 'saved'; trace.servers = [];
        answer(last.lat, last.lon, last.acc);
        if (Date.now() - spot.at > PLACES_FRESH_DAYS * DAY) fetchPlaces(spot.lat, spot.lon, spot.radius, []).then(function (fresh) { rememberSpot(spot.lat, spot.lon, spot.radius, fresh); }, function () { });
        return;
      }
      var radius = searchRadius(acc), here = { lat: lat, lon: lon, radius: radius };
      center = here;
      trace.source = 'map'; trace.servers = [];
      stage('map');
      clearTimeout(slowTimer);
      slowTimer = setTimeout(function () { if (live() && locating && !answered) stage('slow'); }, MAP_SLOW);
      fetchPlaces(lat, lon, radius, trace.servers, function () { if (live()) saveLookup(trace); }).then(function (fresh) {
        if (!live()) return;
        rememberSpot(lat, lon, radius, fresh);
        if (center !== here) return;
        raw = fresh; answer(last.lat, last.lon, last.acc);
      }, function () {
        if (!live() || answered || center !== here) return;
        // The map is down, but spots the person remembered nearby can still be offered.
        if (rankPlaces(myPlacesRaw(), lat, lon, radius).length) { raw = []; answer(last.lat, last.lon, last.acc); return; }
        fail('The map did not answer. Pick the store above.');
      });
    }
    stopFix = watchFix(function (lat, lon, acc) {
      if (!live()) { stopFix && stopFix(); return; }
      if (trace.fixMs === null) trace.fixMs = Date.now() - t0;
      trace.acc = Math.round(acc); saveLookup(trace);
      last = { lat: lat, lon: lon, acc: acc }; lastFix = { lat: lat, lon: lon, acc: acc, at: Date.now() };
      if (!center) { lookUp(lat, lon, acc); return; }
      var d = haversine(lat, lon, center.lat, center.lon);
      // Still inside the area already searched: answer again from the same list, no new lookup.
      if (d + AROUND <= center.radius) { if (raw) answer(lat, lon, acc); return; }
      if (d >= MOVED) { lookUp(lat, lon, acc); return; }
      if (raw) answer(lat, lon, acc);
    }, function (err) {
      if (!live() || answered) return;
      trace.fixMs = null; trace.fixError = err && err.code === 1 ? 'denied' : err && err.code === 2 ? 'unavailable' : 'timed out';
      fail(err && err.code === 1 ? 'Location is off for this app in your phone settings' : 'Could not get your location. Pick the store above.');
    });
  }

  // A quick fix from Wi-Fi and cell towers and a precise one from GPS, asked for at the same time.
  // onFix runs for the first usable fix, then again for any fix that is clearly better or clearly
  // somewhere else, for up to 12 seconds. A good GPS fix ends the watch early. A fix rougher than
  // 150 meters (cell towers only) is held for up to 4 seconds in case a better one comes.
  function watchFix(onFix, onFail) {
    var best = null, rough = null, stopped = false, errors = 0, watchId = null, timer = null, roughTimer = null;
    function stop() { if (stopped) return; stopped = true; if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) { } } clearTimeout(timer); clearTimeout(roughTimer); }
    function got(pos, precise) {
      if (stopped) return;
      var c = pos.coords, acc = typeof c.accuracy === 'number' ? c.accuracy : 999;
      if (acc > 150) {
        if (best) return;
        if (!rough || acc < rough.acc) rough = { lat: c.latitude, lon: c.longitude, acc: acc };
        if (!roughTimer) roughTimer = setTimeout(function () { if (!stopped && !best && rough) { best = rough; onFix(rough.lat, rough.lon, rough.acc); } }, 4000);
        return;
      }
      if (best) {
        var moved = haversine(best.lat, best.lon, c.latitude, c.longitude);
        if (acc >= best.acc - 5 && moved <= Math.max(25, best.acc, acc)) { if (precise && acc <= 25) stop(); return; }
      }
      best = { lat: c.latitude, lon: c.longitude, acc: acc };
      onFix(c.latitude, c.longitude, acc);
      if (precise && acc <= 25) stop();
    }
    function bad(err) {
      if (stopped) return;
      if (err && err.code === 1) { stop(); onFail(err); return; }
      if (++errors >= 2 && !best && !rough) { stop(); onFail(err); }
    }
    navigator.geolocation.getCurrentPosition(function (pos) { got(pos, false); }, bad, { enableHighAccuracy: false, maximumAge: 10000, timeout: 5000 });
    watchId = navigator.geolocation.watchPosition(function (pos) { got(pos, true); }, bad, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
    timer = setTimeout(function () { var had = !!(best || rough); stop(); if (!had) onFail({ code: 3 }); }, 12000);
    return stop;
  }

  // Stores found around a spot, kept on this phone only: where the lookup was made (to about 10 meters),
  // how far around it, when, and the named places found. Turning location off or erasing the app clears them.
  function loadPlaces() { try { var p = JSON.parse(localStorage.getItem(PLACES_KEY) || 'null'); return p && p.spots ? p : { spots: [] }; } catch (e) { return { spots: [] }; } }
  function forgetPlaces() { try { localStorage.removeItem(PLACES_KEY); localStorage.removeItem(LOOKUP_KEY); } catch (e) { } }
  // A saved spot answers for a new fix only when the 120 meters around the new fix were all searched.
  function cachedSpot(lat, lon) {
    var cutoff = Date.now() - PLACES_DAYS * DAY, best = null;
    loadPlaces().spots.forEach(function (s) {
      if (!(s.at >= cutoff) || !s.radius) return;
      var d = haversine(lat, lon, s.lat, s.lon);
      if (d + AROUND <= s.radius + 1 && (!best || d < best.d)) best = { s: s, d: d };
    });
    return best ? best.s : null;
  }
  function rememberSpot(lat, lon, radius, places) {
    var p = loadPlaces(), cutoff = Date.now() - PLACES_DAYS * DAY;
    p.spots = p.spots.filter(function (s) { return s.at >= cutoff && haversine(lat, lon, s.lat, s.lon) > REUSE / 2; });
    p.spots.unshift({ lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, radius: Math.round(radius), at: Date.now(), places: places });
    p.spots = p.spots.slice(0, PLACES_MAX);
    try { localStorage.setItem(PLACES_KEY, JSON.stringify(p)); } catch (e) { }
  }
  // The last lookup in one line under More: if the store is wrong or missing, this says why.
  function lookupNote() {
    var t = loadLookup(); if (!t || !t.at) return null;
    var when = new Date(t.at), today = new Date().toDateString() === when.toDateString();
    var stamp = (today ? 'today' : when.toLocaleDateString([], { month: 'short', day: 'numeric' })) + ' at ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    var bits = [];
    bits.push(typeof t.fixMs === 'number' ? 'Position in ' + (t.fixMs / 1000).toFixed(1) + ' s, within ' + t.acc + ' m.' : t.fixError ? 'No position from the phone (' + t.fixError + ').' : t.outcome ? 'No position from the phone.' : 'Waiting for a position.');
    if (t.source === 'saved') bits.push('Stores from this phone, saved on an earlier visit.');
    else if (t.source === 'remembered') bits.push('A spot you remembered.');
    else if (t.servers && t.servers.length) bits.push('Map: ' + t.servers.filter(Boolean).map(function (sv) { return sv.host + ' ' + sv.text + (typeof sv.ms === 'number' && sv.text !== 'not needed' ? (/^answered/.test(sv.text) ? ' in ' : ' after ') + (sv.ms / 1000).toFixed(1) + ' s' : ''); }).join('; ') + '.');
    bits.push(t.outcome === 'found' ? 'Found ' + t.top + '.' : t.outcome === 'near' ? 'Not sure; nearest is ' + t.top + '.' : t.outcome === 'none' ? 'No store within 120 m.' : (t.outcome || 'Not finished.'));
    return h('p', { class: 'small muted lookup-note' }, 'Last lookup, ' + stamp + '. ' + bits.join(' '));
  }
  function saveLookup(trace) { try { localStorage.setItem(LOOKUP_KEY, JSON.stringify(trace)); } catch (e) { } }
  function loadLookup() { try { return JSON.parse(localStorage.getItem(LOOKUP_KEY) || 'null'); } catch (e) { return null; } }

  // The map services, each answering with the named places around a point as [{t: tags, lat, lon}].
  // The Overpass query is the one the app has used since it first looked up stores: four plain
  // searches, one per kind of place. Photon is a search index over the same OpenStreetMap data.
  function overpassQuery(lat, lon, radius) {
    var at = lat.toFixed(5) + ',' + lon.toFixed(5), r = Math.round(radius);
    var parts = ['shop', 'amenity', 'leisure', 'tourism'].map(function (k) { return 'nwr(around:' + r + ',' + at + ')[name][' + k + '];'; }).join('');
    return '[out:json][timeout:15];(' + parts + ');out bb tags 80;';
  }
  function keepTags(t) { var keep = {}; ['name', 'brand', 'shop', 'amenity', 'leisure', 'tourism'].forEach(function (k) { if (t[k]) keep[k] = t[k]; }); return keep; }
  function askOverpass(url) {
    return function (lat, lon, radius, signal) {
      return fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(overpassQuery(lat, lon, radius)), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: signal })
        .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error('error ' + r.status + (t ? ': ' + t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) : '')); }); return r.json(); })
        .then(function (j) {
          if (!j || !Array.isArray(j.elements)) throw new Error('not a map answer');
          // A busy server can answer with no places and a note that the search ran out of time. That is not "no stores here".
          if (j.remark && /error|timed? ?out/i.test(j.remark)) throw new Error('busy: ' + String(j.remark).slice(0, 80));
          var out = [];
          j.elements.forEach(function (el) {
            var t = el.tags || {}, b = el.bounds, bbox = null;
            var la = el.lat || (el.center && el.center.lat), lo = el.lon || (el.center && el.center.lon);
            if (b && typeof b.minlat === 'number') { bbox = [b.minlat, b.minlon, b.maxlat, b.maxlon]; if (!la) { la = (b.minlat + b.maxlat) / 2; lo = (b.minlon + b.maxlon) / 2; } }
            if (!(t.name || t.brand) || !la || !lo) return;
            var place = { t: keepTags(t), lat: la, lon: lo }; if (bbox) place.bbox = bbox;
            out.push(place);
          });
          return out;
        });
    };
  }
  function askPhoton(lat, lon, radius, signal) {
    return fetch('https://photon.komoot.io/reverse?lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5) + '&radius=' + (radius / 1000).toFixed(2) + '&limit=40', { signal: signal })
      .then(function (r) { if (!r.ok) throw new Error('error ' + r.status); return r.json(); })
      .then(function (j) {
        if (!j || !Array.isArray(j.features)) throw new Error('not a map answer');
        var out = [];
        j.features.forEach(function (f) {
          var pr = f.properties || {}, g = f.geometry && f.geometry.coordinates;
          if (!pr.name || !g || g.length < 2 || ['shop', 'amenity', 'leisure', 'tourism'].indexOf(pr.osm_key) < 0) return;
          var t = { name: pr.name }; t[pr.osm_key] = pr.osm_value || 'yes';
          var place = { t: t, lat: g[1], lon: g[0] }, e = pr.extent;
          // extent is [west, north, east, south]
          if (e && e.length === 4) place.bbox = [Math.min(e[1], e[3]), Math.min(e[0], e[2]), Math.max(e[1], e[3]), Math.max(e[0], e[2])];
          out.push(place);
        });
        return out;
      });
  }
  var SOURCES = [
    { host: 'photon.komoot.io', ask: askPhoton },
    { host: 'overpass-api.de', ask: askOverpass('https://overpass-api.de/api/interpreter') },
    { host: 'overpass.private.coffee', ask: askOverpass('https://overpass.private.coffee/api/interpreter') },
    { host: 'overpass.kumi.systems', ask: askOverpass('https://overpass.kumi.systems/api/interpreter') }
  ];
  function sameSpot(a, b) { return (a.t.name || a.t.brand) === (b.t.name || b.t.brand) && haversine(a.lat, a.lon, b.lat, b.lon) < 30; }
  // The race. The first answer that names a store the app knows (within 120 meters) wins at once.
  // Empty answers are kept and merged; they count only once every service has answered. Errors and
  // busy servers are not answers. With nothing by the time limit, the lookup fails.
  function fetchPlaces(lat, lon, radius, log, tick) {
    log = log || [];
    return new Promise(function (resolve, reject) {
      var done = false, started = 0, finished = 0, answered = 0, union = [], controllers = [], timers = [], t0 = Date.now();
      function finish(ok, value) {
        if (done) return; done = true;
        timers.forEach(clearTimeout);
        controllers.forEach(function (c) { try { c.abort(); } catch (e) { } });
        log.forEach(function (l) { if (l && l.ms === null) l.text = ok ? 'not needed' : 'no answer in ' + Math.round(MAP_LIMIT / 1000) + ' s'; });
        if (tick) tick();
        if (ok) resolve(value); else reject(value);
      }
      function note(i, text) { log[i] = { host: SOURCES[i].host, ms: Date.now() - t0, text: text }; if (tick) tick(); }
      function merge(list) { list.forEach(function (p) { if (!union.some(function (u) { return sameSpot(u, p); })) union.push(p); }); }
      function settle() { if (finished >= SOURCES.length) { if (answered) finish(true, union); else finish(false, new Error('no answer')); } }
      function next() {
        if (done || started >= SOURCES.length) return;
        var i = started++;
        var c = typeof AbortController === 'function' ? new AbortController() : null;
        if (c) controllers.push(c);
        log[i] = { host: SOURCES[i].host, ms: null, text: 'asked' }; if (tick) tick();
        SOURCES[i].ask(lat, lon, radius, c ? c.signal : undefined).then(function (list) {
          if (done) return;
          answered++; finished++;
          var known = rankPlaces(list, lat, lon);
          note(i, 'answered with ' + list.length + (list.length === 1 ? ' place' : ' places') + (list.length ? ', ' + known.length + ' the app knows' : ''));
          merge(list);
          if (known.length) finish(true, union); else settle();
        }, function (e) {
          if (done) return;
          finished++;
          note(i, e && e.name === 'AbortError' ? 'no answer' : e && e.name === 'TypeError' ? 'no answer (blocked or offline)' : (e && e.message) || 'failed');
          next(); settle();
        });
      }
      for (var k = 0; k < MAP_FIRST; k++) next();
      timers.push(setTimeout(next, MAP_NEXT));
      timers.push(setTimeout(function () { if (answered) finish(true, union); else finish(false, new Error('slow')); }, MAP_LIMIT));
    });
  }
  // Places the person remembered, as candidates. A remembered spot is one point inside the place, so
  // 25 meters around it count as inside.
  function myPlacesRaw() {
    return (state.myPlaces || []).map(function (m) { return { t: { name: m.name }, lat: m.lat, lon: m.lon, mine: m }; });
  }
  function nearMyPlace(lat, lon) {
    return (state.myPlaces || []).some(function (m) { return haversine(lat, lon, m.lat, m.lon) <= 60; });
  }
  function rememberPlace(name, merchantId, categoryId, fix) {
    state.myPlaces = (state.myPlaces || []).filter(function (m) { return haversine(fix.lat, fix.lon, m.lat, m.lon) > 25 || m.name !== name; });
    state.myPlaces.unshift({ name: name, merchant: merchantId || null, category: merchantId ? null : categoryId, lat: Math.round(fix.lat * 1e5) / 1e5, lon: Math.round(fix.lon * 1e5) / 1e5, at: Date.now() });
    state.myPlaces = state.myPlaces.slice(0, 200);
    saveState();
  }
  // Distance from a point to a place: 0 inside its footprint (when the map gave one), else to its nearest edge or its center.
  function edgeDistance(lat, lon, p) {
    if (p.mine) return Math.max(0, haversine(lat, lon, p.lat, p.lon) - 25);
    if (p.bbox && p.bbox.length === 4) {
      var la = Math.min(Math.max(lat, p.bbox[0]), p.bbox[2]), lo = Math.min(Math.max(lon, p.bbox[1]), p.bbox[3]);
      return haversine(lat, lon, la, lo);
    }
    return haversine(lat, lon, p.lat, p.lon);
  }
  // The places around where you are, matched to the store list, closest first. "within" is the reach
  // in meters (the answer uses 120; the stores offered near you may reach as far as the search did).
  function rankPlaces(raw, lat, lon, within) {
    var out = [];
    (raw || []).forEach(function (p) {
      var t = p.t || {}, name = t.name || t.brand; if (!name) return;
      var edge = edgeDistance(lat, lon, p), dist = haversine(lat, lon, p.lat, p.lon); if (edge > (within || AROUND)) return;
      if (p.mine) {
        var mm = p.mine.merchant ? E.merchantById(data, p.mine.merchant) : null;
        out.push({ name: p.mine.name, merchant: mm ? mm.id : null, category: mm ? mm.category : (p.mine.category || 'other'), dist: dist, edge: edge, bboxed: false, mine: true });
        return;
      }
      var match = matchMerchant(name, t), category = match ? match.category : null;
      if (!category) {
        Object.keys(t).some(function (k) { var kv = k + '=' + t[k]; return OSM_MAP.some(function (m) { if (m[0].test(kv)) { category = m[1]; return true; } return false; }); });
      }
      if (!category) return;
      out.push({ name: match ? match.name : name, merchant: match ? match.id : null, category: category, dist: dist, edge: edge, bboxed: !!(p.bbox && p.bbox.length === 4) });
    });
    out.sort(function (a, b) { return a.edge - b.edge || a.dist - b.dist; });
    var seen = {};
    return out.filter(function (o) { var k = o.merchant || o.name; if (seen[k]) return false; seen[k] = true; return true; });
  }

  // Look again: set the store shown now aside (it comes back if the lookup fails) and find where you are.
  function relocate() {
    if (!canLocate()) { toast('Location is not available here'); return; }
    if (locating) return;
    locatePrev = (ctx.merchant || ctx.category) ? { merchant: ctx.merchant, category: ctx.category, customName: ctx.customName, located: ctx.located } : null;
    ctx.merchant = null; ctx.category = null; ctx.customName = ''; ctx.located = false;
    locate();
  }
  function announce(text) { var live = document.getElementById('where-live'); if (live) { live.textContent = ''; setTimeout(function () { live.textContent = text; }, 50); } }
  function cancelLocate() {
    locateSeq++; locating = false; locatePrev = null;
    document.getElementById('btn-locate').classList.remove('busy');
    renderPay();
    var s = document.getElementById('store-search'); if (s) { try { s.focus({ preventScroll: true }); } catch (e) { s.focus(); } }
  }

  var OSM_MAP = [
    [/^amenity=fuel$/, 'gas'], [/^shop=(supermarket|grocery|greengrocer|butcher|bakery|deli|health_food|frozen_food)$/, 'groceries'],
    [/^amenity=(restaurant|fast_food|cafe|bar|pub|food_court|ice_cream|biergarten)$/, 'dining'], [/^shop=(coffee|tea|bakery)$/, 'dining'],
    [/^shop=wholesale$/, 'warehouse'], [/^shop=(department_store|variety_store|general)$/, 'superstore'],
    [/^(amenity=pharmacy|shop=chemist)$/, 'drugstore'], [/^shop=(doityourself|hardware|paint|garden_centre|trade)$/, 'home-improvement'],
    [/^amenity=(cinema|theatre|nightclub|casino)$/, 'entertainment'], [/^leisure=(fitness_centre|sports_centre)$/, 'fitness'],
    [/^tourism=(hotel|motel|guest_house|hostel)$/, 'hotels'], [/^amenity=(car_rental)$/, 'rental-car'],
    [/^amenity=charging_station$/, 'ev-charging'], [/^shop=(clothes|shoes|jewelry|fashion)$/, 'department-store'],
    [/^leisure=(bowling_alley|amusement_arcade|escape_game|miniature_golf|water_park|trampoline_park|ice_rink)$/, 'entertainment'],
    [/^tourism=(attraction|museum|zoo|theme_park|aquarium|gallery)$/, 'entertainment'],
    [/^amenity=(car_wash|veterinary|dentist|clinic|doctors)$/, 'other'],
    [/^shop=/, 'other']
  ];
  // Kinds of merchant that are never a place on the map (airlines, websites, services).
  var NOT_A_PLACE = { flights: 1, online: 1, streaming: 1, phone: 1, utilities: 1, rent: 1, 'portal-travel': 1, travel: 1, 'select-merchants': 1, 'wallet-pay': 1 };
  function matchMerchant(name, tags) {
    var n = ' ' + name.toLowerCase().replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    var fuel = tags && tags.amenity === 'fuel';
    var best = null;
    data.merchants.forEach(function (m) {
      if (tags && NOT_A_PLACE[m.category]) return;
      [m.name].concat(m.aliases || []).forEach(function (a) {
        a = a.toLowerCase().replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!a) return;
        // Whole words only: "ba" must not match "bar". An alias under four letters must be the whole name.
        var hit = a.length < 4 ? n === ' ' + a + ' ' : n.indexOf(' ' + a + ' ') >= 0;
        if (hit && (!best || a.length > best.len)) best = { len: a.length, m: m };
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
    var reminders = h('div', { class: 'reminders' }); renderReminder(reminders, function () { renderWallet(); markTabs(); });
    if (reminders.childNodes.length) root.appendChild(reminders);
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
          h('span', null, h('b', null, c.name), h('span', null, c.issuer + (c.annualFee ? ', $' + c.annualFee + ' a year' : ', no annual fee'))),
          h('span', { class: 'add' }, inWallet ? 'Added' : 'Add')));
      });
    }
    var search = h('input', { class: 'field', type: 'search', placeholder: 'Search cards', 'aria-label': 'Search cards', autocomplete: 'off' });
    search.addEventListener('input', function () { filter.q = search.value; drawList(); });
    drawChips(); drawList();
    var nodes = [];
    if (intro) nodes.push(h('div', { class: 'hero-copy' }, h('div', { class: 'steps' }, h('i', { class: 'on' }), h('i')), h('p', { class: 'muted' }, 'Tap every card you carry. Just the names, never a card number.')));
    var scanBox = h('div', { class: 'scan' });
    if (!PREVIEW) nodes.push(h('button', { class: 'btn block scan-btn', onclick: function () { scanCard(scanBox, drawList); } }, icon('camera'), 'Scan a card with the camera'), scanBox);
    nodes.push(search, chips, list,
      h('div', { class: 'note buddy' }, h('b', null, 'Why do the cards look like that? '), 'Yeah, those are not the real card pictures. Is it because we are cheap asses? Partially. Mostly it is because every one of those designs is trademarked, and the banks would keep our asses in court until the sun burns out. That should tell you something, though: the sites with the real pictures have a deal with the bank and get paid every time you click. We get squat. Nobody pays for a spot here, nobody buys your info, and the only thing we want from you is 99 cents and a good pump story.'),
      h('button', { class: 'btn block', onclick: function () { openCustomCard(null, intro); } }, icon('plus'), 'My card isn\u2019t here'),
      h('button', { class: 'btn primary block', onclick: function () { closeSheet(); } }, 'Done'));
    openSheet(intro ? 'Your cards' : 'Add a card', nodes, { noClose: !!intro });
    sheetOnClose = function () {
      askMemberships(function () {
        if (intro && state.wallet.length) { openPriority(true); }
        else { renderAll(); }
      });
    };
  }
  function openCustomCard(existing, intro) {
    var c = existing || { name: '', issuer: '', network: 'Visa', annualFee: 0, fxFee: 0, program: 'cashback', base: 1, earn: [] };
    var name = h('input', { class: 'field', type: 'text', value: c.name, placeholder: 'Card name, like Local Credit Union Visa', 'aria-label': 'Card name', maxlength: '60' });
    var issuer = h('input', { class: 'field', type: 'text', value: c.issuer, placeholder: 'Bank or credit union', 'aria-label': 'Issuer', maxlength: '40' });
    var network = h('select', { class: 'field', 'aria-label': 'Network' });
    ['Visa', 'Mastercard', 'American Express', 'Discover'].forEach(function (n) { network.appendChild(h('option', { value: n }, n)); });
    network.value = c.network;
    var fee = h('input', { class: 'field', type: 'number', inputmode: 'decimal', value: c.annualFee || 0, 'aria-label': 'Annual fee' });
    var fx = h('input', { class: 'field', type: 'number', inputmode: 'decimal', value: c.fxFee || 0, 'aria-label': 'Foreign transaction fee percent' });
    var kind = h('select', { class: 'field', 'aria-label': 'Earns cash back or points' });
    kind.appendChild(h('option', { value: 'cashback' }, 'Cash back (percent)'));
    kind.appendChild(h('option', { value: 'custom-points' }, 'Points or miles (worth about 1 cent each)'));
    kind.value = c.program === 'cashback' ? 'cashback' : 'custom-points';
    var base = h('input', { class: 'field', type: 'number', inputmode: 'decimal', step: '0.25', value: c.base, 'aria-label': 'Rate on everything else' });
    var rows = h('div', { class: 'stack' });
    var earn = (c.earn || []).map(function (r) { return { category: r.category, rate: r.rate }; });
    function drawRows() {
      clear(rows);
      earn.forEach(function (r, i) {
        var sel = h('select', { class: 'field', 'aria-label': 'Category' });
        data.categories.filter(function (x) { return x.id !== 'other' && x.id !== 'rotating' && x.id !== 'choice' && x.id !== 'select-merchants'; }).forEach(function (x) { sel.appendChild(h('option', { value: x.id }, x.name)); });
        sel.value = r.category || 'gas';
        sel.addEventListener('change', function () { r.category = sel.value; });
        var rate = h('input', { class: 'field', type: 'number', inputmode: 'decimal', step: '0.25', value: r.rate, 'aria-label': 'Rate' });
        rate.addEventListener('input', function () { r.rate = parseFloat(rate.value) || 0; });
        rows.appendChild(h('div', { class: 'grid2', style: 'grid-template-columns: 1fr 90px auto; align-items:center' }, sel, rate,
          h('button', { class: 'btn ghost', style: 'padding:6px', 'aria-label': 'Remove', onclick: function () { earn.splice(i, 1); drawRows(); } }, icon('x'))));
      });
    }
    drawRows();
    var nodes = [
      h('p', { class: 'small muted' }, 'Put in the benefits that matter most to you; the app will rank it like any other card. If you also send it to us, we add it for everyone.'),
      h('div', null, h('label', { class: 'lbl' }, 'Card name'), name),
      h('div', { class: 'grid2' }, h('div', null, h('label', { class: 'lbl' }, 'Bank'), issuer), h('div', null, h('label', { class: 'lbl' }, 'Network'), network)),
      h('div', { class: 'grid2' }, h('div', null, h('label', { class: 'lbl' }, 'Annual fee ($)'), fee), h('div', null, h('label', { class: 'lbl' }, 'Foreign fee (%)'), fx)),
      h('div', null, h('label', { class: 'lbl' }, 'It earns'), kind),
      h('div', null, h('label', { class: 'lbl' }, 'On everything else (rate)'), base),
      h('div', null, h('label', { class: 'lbl' }, 'Bonus categories'), rows, h('button', { class: 'btn', style: 'margin-top:8px', onclick: function () { earn.push({ category: 'gas', rate: 3 }); drawRows(); } }, icon('plus'), 'Add a category')),
      h('button', { class: 'btn primary block', onclick: function () {
        if (!name.value.trim()) { toast('Give the card a name'); return; }
        var card = existing || { id: 'custom-' + Date.now().toString(36), custom: true };
        card.name = name.value.trim(); card.issuer = issuer.value.trim() || 'My bank'; card.network = network.value;
        card.annualFee = parseFloat(fee.value) || 0; card.fxFee = parseFloat(fx.value) || 0; card.program = kind.value; card.base = parseFloat(base.value) || 0;
        card.earn = earn.filter(function (r) { return r.rate > 0; }); card.type = 'personal'; card.verified = new Date().toISOString().slice(0, 10);
        card.color = card.color || '#' + (Math.abs(hashStr(card.name)) % 0xFFFFFF).toString(16).padStart(6, '0');
        card.tips = ['You added this card yourself; edit it from its page if a rate changes.'];
        if (!existing) { state.customCards.push(card); }
        rebuildCards();
        if (!existing && !walletEntry(card.id)) state.wallet.push({ cardId: card.id, added: new Date().toISOString() });
        saveState(); closeSheet(); toast(existing ? 'Card updated' : 'Added ' + card.name);
      } }, existing ? 'Save' : 'Add to my wallet'),
      h('p', { class: 'small muted' }, 'Want it in the catalog for everyone? ', h('a', { href: 'mailto:' + CONTACT + '?subject=' + encodeURIComponent('Witch Card: please add a card') + '&body=' + encodeURIComponent('Card: \nBank: \nWhat it earns: \nLink to the bank page: '), }, 'Email us the card name and the bank page'), '.')
    ];
    openSheet(existing ? 'Edit my card' : 'My card isn\u2019t here', nodes);
    sheetOnClose = function () { if (intro) openAddCards(true); else renderAll(); };
  }
  function hashStr(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; } return h; }

  function toggleCard(c) {
    var e = walletEntry(c.id);
    if (e) { state.wallet.splice(state.wallet.indexOf(e), 1); }
    else {
      var entry = { cardId: c.id, added: new Date().toISOString() };
      if (c.choice && !c.choice.auto) entry.choices = [];
      state.wallet.push(entry);
      if (c.memberships && c.memberships.length) pendingQuestions.push(c.id);
    }
    saveState();
  }
  var pendingQuestions = [];
  function askMemberships(then) {
    var cardId = pendingQuestions.shift();
    if (!cardId) { if (then) then(); return; }
    var card = E.cardById(data, cardId), entry = walletEntry(cardId);
    if (!card || !entry || !card.memberships) { askMemberships(then); return; }
    entry.memberships = entry.memberships || {};
    var nodes = [cardArt(card, 120), h('p', { class: 'muted' }, 'This card pays different rates depending on a membership. One question so the numbers are right:')];
    card.memberships.forEach(function (m) {
      nodes.push(h('div', { class: 'box' }, h('p', null, h('b', null, m.question)),
        h('div', { class: 'grid2', style: 'margin-top:10px' },
          h('button', { class: 'btn primary', onclick: function () { entry.memberships[m.id] = true; saveState(); closeSheet(); } }, 'Yes, ' + m.yes.charAt(0).toLowerCase() + m.yes.slice(1)),
          h('button', { class: 'btn', onclick: function () { entry.memberships[m.id] = false; saveState(); closeSheet(); } }, 'No, ' + m.no.charAt(0).toLowerCase() + m.no.slice(1)))));
    });
    openSheet(card.name, nodes, { noClose: true });
    sheetOnClose = function () { askMemberships(then); };
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

  /* ---------- Location test ---------- */
  // Runs the real steps of a lookup on this phone, one at a time, and shows each result as it comes:
  // the permission, the position, then each map server. For when the store does not show up.
  function buildLine() {
    var m = document.querySelector('meta[name="build"]'), v = m && m.getAttribute('content') || '';
    var parts = v.split(' '), when = parts[1] ? new Date(parts[1]) : null;
    if (!parts[0] || parts[0] === 'dev') return 'Development build.';
    return 'Build ' + parts[0].replace(/^wc-/, '') + (when && !isNaN(when) ? ', ' + when.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '') + '.';
  }
  function openLocationTest() {
    var lines = h('div', { class: 'box small test-lines' });
    var out = [];
    function say(text) { out.push(text); lines.appendChild(h('p', null, text)); }
    var copyBtn = h('button', { class: 'btn block', onclick: function () { copyText(out.join('\n')).then(function () { toast('Copied'); }, function () { toast('Could not copy'); }); } }, 'Copy the results');
    openSheet('Location test', [h('p', { class: 'muted' }, 'Each step runs on this phone and shows what came back. Send a screenshot of this if the store does not show up.'), lines, copyBtn]);
    say(buildLine() + ' ' + (navigator.standalone || matchMedia('(display-mode: standalone)').matches ? 'Opened from the home screen.' : 'Opened in the browser.'));
    say('Location setting in the app: ' + (state.prefs.location ? 'on' : 'off') + '.');
    var t0 = Date.now();
    function secs() { return ((Date.now() - t0) / 1000).toFixed(1) + ' s'; }
    var perm = navigator.permissions && navigator.permissions.query ? navigator.permissions.query({ name: 'geolocation' }).then(function (r) { say('Permission: ' + r.state + '.'); }, function () { say('Permission: could not read.'); }) : Promise.resolve(say('Permission: could not read.'));
    perm.then(function () {
      if (!('geolocation' in navigator)) { say('This browser has no location.'); return; }
      say('Asking the phone for a position (up to 20 s)…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var c = pos.coords;
        say('Position in ' + secs() + ': ' + c.latitude.toFixed(3) + ', ' + c.longitude.toFixed(3) + ', within ' + Math.round(c.accuracy) + ' m.');
        testServers(c.latitude, c.longitude, Math.round(searchRadius(c.accuracy)), c.accuracy);
      }, function (err) {
        say('No position after ' + secs() + ': ' + (err && err.code === 1 ? 'permission denied (check the phone settings for this app and for Chrome)' : err && err.code === 2 ? 'position unavailable (is location on in the phone?)' : 'timed out') + '.');
        say('Trying the map servers from a fixed spot instead…');
        testServers(41.8786, -87.6359, 150, 30);
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
    function testServers(lat, lon, radius, acc) {
      say('Asking each map service for the named places within ' + radius + ' m, one at a time…');
      var i = 0;
      function one() {
        if (i >= SOURCES.length) { say('Done.'); return; }
        var src = SOURCES[i++], s0 = Date.now();
        function took() { return ((Date.now() - s0) / 1000).toFixed(1) + ' s'; }
        var c = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = setTimeout(function () { if (c) c.abort(); }, 30000);
        src.ask(lat, lon, radius, c ? c.signal : undefined)
          .then(function (list) {
            var names = [];
            list.forEach(function (p) { var n = p.t.name || p.t.brand; if (n && names.indexOf(n) < 0 && names.length < 6) names.push(n); });
            say(src.host + ': ' + list.length + (list.length === 1 ? ' place' : ' places') + ' in ' + took() + (names.length ? ': ' + names.join(', ') : '') + '.');
            var known = rankPlaces(list, lat, lon);
            if (list.length) say('Of those, within 120 m and known to the app: ' + (known.length ? known.slice(0, 4).map(function (x) { return x.name + ' (' + Math.round(x.edge) + ' m' + (x.bboxed ? ', has a footprint' : '') + ')'; }).join(', ') : 'none') + (known.length ? (isAt(known[0], acc) ? '. Sure enough to say you are at ' + known[0].name + '.' : '. Not close enough to be sure, so the app would offer these to tap.') : '.'));
          })
          .catch(function (e) { say(src.host + ': ' + (e && e.name === 'AbortError' ? 'no answer in 30 s' : e && e.name === 'TypeError' ? 'could not connect (blocked or offline)' : (e && e.message) || 'failed') + ' after ' + took() + '.'); })
          .then(function () { clearTimeout(timer); one(); });
      }
      one();
    }
  }

  /* ---------- Scan a card ---------- */
  // Point the camera at a card and it reads the name, on this phone: the reader (tesseract.js) is
  // part of the app, reads letters only, never digits, and every frame and photo is dropped once
  // read. Nothing is sent anywhere.
  //
  // How it reads a real card on a real counter:
  // 1. Only the card-shaped frame in the middle of the camera view is read, so a busy stone counter
  //    or a patterned table around the card does not matter. (A photo is read whole.)
  // 2. Each picture goes gray, is softened a little against the fine lines pressed into many cards,
  //    then every pixel is compared with the area around it, so light letters on a silver card stand
  //    out as well as white letters on navy, and glare and shading wash out. Then black and white.
  // 3. Pictures alternate between light letters and dark letters (and now and then a card held
  //    upright). Only words the reader is sure of count first; it keeps going until one card
  //    clearly stands out, and after a few seconds it offers the closest ones to pick from.
  var ocrWorker = null, ocrLoading = null;
  function loadOcr(onProgress) {
    if (ocrWorker) return Promise.resolve(ocrWorker);
    if (ocrLoading) return ocrLoading;
    var base = new URL('vendor/tesseract/', location.href).toString();
    ocrLoading = new Promise(function (resolve, reject) {
      if (window.Tesseract) return resolve();
      var sc = document.createElement('script'); sc.src = base + 'tesseract.min.js'; sc.onload = function () { resolve(); }; sc.onerror = function () { reject(new Error('reader')); };
      document.head.appendChild(sc);
    }).then(function () {
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: base + 'worker.min.js', corePath: base, langPath: base.replace(/\/$/, ''), gzip: true, workerBlobURL: false,
        logger: function (m) { if (onProgress) onProgress(m); }
      });
    }).then(function (w) {
      return w.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz&' ", tessedit_pageseg_mode: '11' }).then(function () { ocrWorker = w; ocrLoading = null; return w; });
    }, function (e) { ocrLoading = null; throw e; });
    return ocrLoading;
  }
  var SCAN_GUIDE = 0.84, CARD_RATIO = 1.586, camStop = null;
  function stopCamera() { if (camStop) { var f = camStop; camStop = null; f(); } }

  // The picture the reader gets: a piece of src (a video frame or a photo), at most max pixels
  // wide, black letters on white. light: the letters are lighter than the card around them.
  // turn: 90 or -90, for a card held upright.
  function readyToRead(src, sx, sy, sw, sh, o) {
    var k = Math.min(1, (o.max || 900) / Math.max(sw, sh));
    var w = Math.max(1, Math.round(sw * k)), hh = Math.max(1, Math.round(sh * k)), turn = o.turn || 0;
    var c = document.createElement('canvas'); c.width = turn ? hh : w; c.height = turn ? w : hh;
    var g = c.getContext('2d', { willReadFrequently: true });
    if (turn) { g.translate(c.width / 2, c.height / 2); g.rotate(turn * Math.PI / 180); g.drawImage(src, sx, sy, sw, sh, -w / 2, -hh / 2, w, hh); g.setTransform(1, 0, 0, 1, 0, 0); }
    else g.drawImage(src, sx, sy, sw, sh, 0, 0, w, hh);
    var W = c.width, H = c.height, img = g.getImageData(0, 0, W, H), px = img.data, n = W * H, a = new Float32Array(n), i, x, y;
    for (i = 0; i < n; i++) a[i] = px[i * 4] * .299 + px[i * 4 + 1] * .587 + px[i * 4 + 2] * .114;
    // Soften: a small blur, twice, across and down
    var b = new Float32Array(n);
    for (var pass = 0; pass < 2; pass++) {
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; b[i] = (a[x > 0 ? i - 1 : i] + 2 * a[i] + a[x < W - 1 ? i + 1 : i]) / 4; }
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; a[i] = (b[y > 0 ? i - W : i] + 2 * b[i] + b[y < H - 1 ? i + W : i]) / 4; }
    }
    // Each pixel against the area around it (a box 1/30 of the picture across), from running sums
    var r = Math.max(6, Math.round(Math.max(W, H) / 60)), W1 = W + 1, S = new Float64Array(W1 * (H + 1)), S2 = new Float64Array(W1 * (H + 1));
    for (y = 0; y < H; y++) { var rs = 0, rs2 = 0; for (x = 0; x < W; x++) { var v = a[y * W + x]; rs += v; rs2 += v * v; S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + rs; S2[(y + 1) * W1 + x + 1] = S2[y * W1 + x + 1] + rs2; } }
    for (y = 0; y < H; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (x = 0; x < W; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), cnt = (x1 - x0) * (y1 - y0);
        var sum = S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0];
        var sum2 = S2[y1 * W1 + x1] - S2[y0 * W1 + x1] - S2[y1 * W1 + x0] + S2[y0 * W1 + x0];
        var m = sum / cnt, sd = Math.sqrt(Math.max(0, sum2 / cnt - m * m)), z = (a[y * W + x] - m) / (sd + 8);
        i = (y * W + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = (o.light ? z > .96 : z < -.96) ? 0 : 255; px[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // The words read, and the ones the reader is sure of (short words need to be very sure).
  function readWords(res) {
    var all = [], sure = [];
    ((res && res.data && res.data.blocks) || []).forEach(function (bl) { (bl.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { (l.words || []).forEach(function (wd) {
      var t = String(wd.text || '').trim(); if (!t) return;
      all.push(t);
      if (wd.confidence >= (t.replace(/[^A-Za-z]/g, '').length >= 4 ? 60 : 85)) sure.push(t);
    }); }); }); });
    return { all: all.join(' '), sure: sure.join(' ') };
  }
  function readPicture(w, canvas) {
    return w.recognize(canvas, {}, { text: true, blocks: true }).then(function (res) {
      var words = readWords(res); res = null;
      var m = E.matchCardText(words.sure, data.cards);
      return m.length ? { list: m, sure: true } : { list: E.matchCardText(words.all, data.cards), sure: false };
    });
  }
  // A clear answer: one card ahead of the next by a point and a half, from words it was sure of.
  function clearWinner(r) { return r.list.length && r.sure && r.list[0].score - (r.list[1] ? r.list[1].score : 0) >= 1.5; }

  function scanCard(box, afterAdd) {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') scanLive(box, afterAdd);
    else scanPhoto(box, afterAdd);
  }

  function scanLive(box, afterAdd) {
    stopCamera(); clear(box);
    var video = h('video', { muted: '', playsinline: '', autoplay: '', 'aria-label': 'Camera view' });
    video.muted = true; video.setAttribute('playsinline', '');
    var view = h('div', { class: 'cam' }, video, h('div', { class: 'cam-frame', 'aria-hidden': 'true' }));
    var status = h('p', { class: 'scan-status', role: 'status' }, 'Hold the card flat inside the frame.');
    box.appendChild(view);
    box.appendChild(status);
    box.appendChild(h('div', { class: 'cam-actions' },
      h('button', { class: 'btn', onclick: function () { stopCamera(); clear(box); } }, 'Stop'),
      h('button', { class: 'link', onclick: function () { stopCamera(); scanPhoto(box, afterAdd); } }, 'Take a photo instead')));
    var stream = null, worker = null, alive = true, tries = 0, started = 0, seen = {}, hinted = false;
    var PASSES = [{ light: true }, { light: false }, { light: true }, { light: false }, { light: true, turn: 90 }, { light: true, turn: -90 }];
    camStop = function () {
      alive = false;
      if (stream) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { } });
      stream = null;
      try { video.srcObject = null; } catch (e) { }
      document.removeEventListener('visibilitychange', onHide);
    };
    function onHide() { if (document.hidden) { stopCamera(); clear(box); } }
    document.addEventListener('visibilitychange', onHide);
    var firstTime = !ocrWorker;
    if (firstTime) status.textContent = 'Getting the reader ready, first time only (about 6 MB)\u2026';
    loadOcr().then(function (w) { worker = w; if (alive) { status.textContent = 'Hold the card flat inside the frame.'; next(); } }, function () { if (alive) fail('reader'); });
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }).then(function (s) {
      if (!alive) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s; video.srcObject = s;
      var track = s.getVideoTracks()[0];
      try { if (track && track.getCapabilities && (track.getCapabilities().focusMode || []).indexOf('continuous') >= 0) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () { }); } catch (e) { }
      var p = video.play(); if (p && p.catch) p.catch(function () { });
      next();
    }, function (e) { if (alive) fail(e && e.name === 'NotAllowedError' ? 'blocked' : 'camera'); });

    function fail(why) {
      stopCamera(); clear(box);
      var msg = why === 'reader' ? ['Could not load the card reader. ', 'It downloads once, about 6 MB; check the connection and try again.']
        : why === 'blocked' ? ['The camera is turned off for this app. ', 'Allow it in the browser\u2019s settings for this site, or take a photo of the card instead.']
        : ['Could not open the camera. ', 'Take a photo of the card instead, or search for it by name below.'];
      box.appendChild(h('div', { class: 'note' }, h('b', null, msg[0]), msg[1]));
      box.appendChild(h('button', { class: 'btn block', onclick: function () { if (why === 'reader') scanLive(box, afterAdd); else scanPhoto(box, afterAdd); } }, icon('camera'), why === 'reader' ? 'Try again' : 'Take a photo instead'));
    }
    // The part of the video inside the frame on screen, with a little room around it.
    function frameCrop() {
      var vw = video.videoWidth, vh = video.videoHeight, bw = view.clientWidth, bh = view.clientHeight;
      var s = Math.max(bw / vw, bh / vh), ox = (bw - vw * s) / 2, oy = (bh - vh * s) / 2;
      var gw = bw * SCAN_GUIDE, gh = gw / CARD_RATIO, room = gw * .06;
      var x = Math.max(0, ((bw - gw) / 2 - room - ox) / s), y = Math.max(0, ((bh - gh) / 2 - room - oy) / s);
      return [x, y, Math.min(vw - x, (gw + 2 * room) / s), Math.min(vh - y, (gh + 2 * room) / s)];
    }
    function next() {
      if (!alive || !worker || !stream) return;
      if (video.readyState < 2 || !video.videoWidth) { setTimeout(next, 150); return; }
      if (!started) started = Date.now();
      var pass = PASSES[tries++ % PASSES.length], cut = frameCrop();
      var canvas = readyToRead(video, cut[0], cut[1], cut[2], cut[3], { light: pass.light, turn: pass.turn, max: 900 });
      readPicture(worker, canvas).then(function (r) {
        canvas.width = canvas.height = 0; canvas = null;
        if (!alive) return;
        if (clearWinner(r)) { done(r.list); return; }
        r.list.forEach(function (m, i) {
          var e = seen[m.card.id] || (seen[m.card.id] = { card: m.card, score: 0, wins: 0 });
          if (m.score > e.score) e.score = m.score;
          if (i === 0 && m.score - (r.list[1] ? r.list[1].score : 0) >= 1) e.wins += r.sure ? 2 : 1;
        });
        var ranked = rankSeen();
        if (ranked.length && ranked[0].wins >= 3) { done(ranked); return; }
        var t = Date.now() - started;
        if (t > 9000 && ranked.length) { done(ranked); return; }
        if (t > 6000 && !hinted) { hinted = true; status.textContent = 'Still looking. More light helps, or tilt the card a little to get rid of glare.'; }
        if (t > 45000) { stopCamera(); clear(box); box.appendChild(h('div', { class: 'note' }, h('b', null, 'Could not read a card name. '), 'Try again in good light, or take a photo, or search for it by name below.')); box.appendChild(h('button', { class: 'btn block', onclick: function () { scanLive(box, afterAdd); } }, icon('camera'), 'Try again')); return; }
        setTimeout(next, 60);
      }, function () { if (alive) setTimeout(next, 300); });
    }
    function rankSeen() {
      return Object.keys(seen).map(function (k) { return seen[k]; }).sort(function (a, b) { return b.wins - a.wins || b.score - a.score; });
    }
    function done(list) {
      stopCamera();
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { } }
      showScanResult(box, list, afterAdd, 'Not it? ', 'Scan again', function () { scanLive(box, afterAdd); }, 'The camera is off and nothing was saved.');
    }
  }

  // The fallback: a photo from the camera app, read whole (light letters, then dark ones).
  function scanPhoto(box, afterAdd) {
    var input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0]; if (!file) return;
      clear(box);
      var status = h('p', { class: 'muted scan-status', role: 'status' }, 'Reading the card\u2026');
      box.appendChild(status);
      var firstTime = !ocrWorker, url = URL.createObjectURL(file), img = new Image(), worker = null;
      loadOcr(function (m) {
        if (firstTime && m && /loading/.test(m.status || '')) status.textContent = 'Getting the reader ready, first time only (about 6 MB)\u2026';
        else if (m && m.status === 'recognizing text') status.textContent = 'Reading the card\u2026 ' + Math.round((m.progress || 0) * 100) + '%';
      }).then(function (w) {
        worker = w;
        return new Promise(function (res, rej) { img.onload = res; img.onerror = function () { rej(new Error('photo')); }; img.src = url; });
      }).then(function () {
        var W = img.naturalWidth, H = img.naturalHeight;
        return readPicture(worker, readyToRead(img, 0, 0, W, H, { light: true, max: 1400 })).then(function (r1) {
          if (clearWinner(r1)) return r1;
          return readPicture(worker, readyToRead(img, 0, 0, W, H, { light: false, max: 1400 })).then(function (r2) {
            if (clearWinner(r2)) return r2;
            var pick = [r1, r2].filter(function (r) { return r.list.length; }).sort(function (a, b) { return (b.sure ? 1 : 0) - (a.sure ? 1 : 0) || b.list[0].score - a.list[0].score; })[0];
            return pick || { list: [] };
          });
        });
      }).then(function (r) {
        URL.revokeObjectURL(url); img = null;
        if (!r.list.length) {
          clear(box);
          box.appendChild(h('div', { class: 'note' }, h('b', null, 'Could not read a card name. '), 'Try again with the card flat, in good light, filling the picture. Or search for it by name below.'));
          box.appendChild(h('button', { class: 'btn block', onclick: function () { scanCard(box, afterAdd); } }, icon('camera'), 'Try again'));
          return;
        }
        showScanResult(box, r.list, afterAdd, 'Not it? ', 'Scan again', function () { scanCard(box, afterAdd); }, 'The photo stayed on this phone and is gone now.');
      }).catch(function (e) {
        URL.revokeObjectURL(url);
        clear(box);
        box.appendChild(h('div', { class: 'note' }, h('b', null, e && e.message === 'reader' ? 'Could not load the card reader. ' : 'Could not read that photo. '), e && e.message === 'reader' ? 'It downloads once, about 6 MB; check the connection and try again.' : 'Try again, or search for the card by name below.'));
      });
    });
    document.body.appendChild(input); input.click(); setTimeout(function () { if (input.parentNode) input.parentNode.removeChild(input); }, 60000);
  }

  // What it read: the card, or the few it could be (every card tied with the best, up to six).
  function showScanResult(box, list, afterAdd, notIt, againLabel, again, privacy) {
    clear(box);
    // One card well ahead: just that one. A tie (only UNITED read): all of them, up to six.
    var top = list[0].score, lead = top - (list[1] ? list[1].score : 0), close = list.filter(function (m) { return top - m.score < .5; });
    var shown = lead >= 1.5 ? [list[0]] : close.length > 1 ? close.slice(0, 6) : list.slice(0, 3);
    box.appendChild(h('p', { class: 'scan-label' }, shown.length === 1 ? 'Looks like this card:' : 'Looks like one of these:'));
    var ul = h('div', { class: 'card-list' });
    shown.forEach(function (m) {
      var c = m.card, inWallet = !!walletEntry(c.id);
      ul.appendChild(h('button', { class: 'card-row' + (inWallet ? ' in' : ''), style: '--card:' + c.color, onclick: function () { if (!walletEntry(c.id)) { toggleCard(c); toast('Added ' + c.name); } clear(box); if (afterAdd) afterAdd(); } },
        cardArt(c, 56), h('span', null, h('b', null, c.name), h('span', null, c.issuer + (c.annualFee ? ', $' + c.annualFee + ' a year' : ', no annual fee') + (c.closed ? ', no longer offered' : ''))), h('span', { class: 'add' }, inWallet ? 'Added' : 'Add')));
    });
    box.appendChild(ul);
    box.appendChild(h('p', { class: 'small muted' }, notIt, h('button', { class: 'link', onclick: again }, againLabel), ' or search by name below. ' + privacy));
  }

  /* ---------- Card detail ---------- */
  function openCardDetail(cardId, back) {
    var card = E.cardById(data, cardId); if (!card) return;
    var entry = walletEntry(cardId) || {};
    var inWallet = !!walletEntry(cardId);
    var unit = E.unitFor(card.program, data);
    var now = new Date(), q = E.quarterOf(now), nq = E.nextQuarterKey(now);
    var nodes = [];
    var hero = h('div', { class: 'detail-hero' },
      cardArt(card, 300, { cls: 'hero-art', bare: true }),
      h('div', { class: 'issuer' }, card.issuer + (card.network && card.network !== card.issuer ? ' ' + card.network : '') + (card.type === 'business' ? ', business card' : '')),
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
      if (r.requires && card.memberships) sub.push((card.memberships.filter(function (m) { return m.id === r.requires; })[0] || { yes: 'with membership' }).yes.toLowerCase());
      if (r.unless && card.memberships) sub.push((card.memberships.filter(function (m) { return m.id === r.unless; })[0] || { no: 'without membership' }).no.toLowerCase());
      if (r.cap) sub.push('up to $' + r.cap.toLocaleString() + ' per ' + r.capPeriod);
      if (r.excludes && r.excludes.length) sub.push('not at ' + r.excludes.map(function (x) { return inSentence(cat(x)); }).join(' or '));
      if (r.note) sub.push(r.note);
      rows.push([rateText(r.rate, unit), label, sub.join(', ')]);
    });
    rows.push([rateText(card.base, unit), 'Everything else', '']);
    rows.forEach(function (r) { earn.appendChild(h('li', null, h('span', { class: 'l' }, r[1], r[2] ? h('small', null, r[2]) : null), h('span', { class: 'r' }, r[0]))); });
    nodes.push(h('div', { class: 'box' }, h('h3', null, 'Earns'), earn));

    // The sign-up offer, as the bank publishes it, with what it is worth to this person.
    var offer = personalOffers().filter(function (x) { return x.o.cardId === cardId; })[0];
    if (offer) {
      var o = offer.o;
      nodes.push(h('div', { class: 'box' }, h('h3', null, 'Sign-up offer'),
        h('p', null, h('b', null, o.cashBonus ? money(o.cashBonus) + ' cash' : o.bonus), ' (about ' + dollarsOf(offer.worth) + ' to you)',
          o.spend ? ' after spending ' + money(o.spend).replace(/\.00$/, '') + ' in ' + o.months + ' month' + (o.months === 1 ? '' : 's') : '', '. ',
          o.annualFee ? '$' + o.annualFee + ' a year' + (o.firstYearFeeWaived ? ', waived the first year.' : '.') : 'No annual fee.'),
        o.notes ? h('p', { class: 'small muted', style: 'margin-top:6px' }, o.notes) : null,
        h('p', { class: 'small muted', style: 'margin-top:6px' }, 'As of ' + fmtLongDate(o.verified || (data.bonuses && data.bonuses.verified)) + '. ', o.sourceUrl ? h('a', { href: o.sourceUrl, target: '_blank', rel: 'noopener' }, 'The bank\u2019s page') : null)));
    }

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
            h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': 'Activated this quarter', onclick: function () { entry.activated = entry.activated || {}; entry.activated[q] = !on; saveState(); openCardDetail(cardId, back); } })));
          if (!on && card.rotating.activationUrl) box.appendChild(h('a', { class: 'btn primary block', style: 'margin-top:10px', href: card.rotating.activationUrl, target: '_blank', rel: 'noopener' }, 'Activate on the ' + card.issuer + ' site'));
        }
        if (inWallet && card.rotating.cap) box.appendChild(capBar(entry, 'rotating', card.rotating.cap, card.rotating.capPeriod || 'quarter'));
      } else box.appendChild(h('p', { class: 'muted' }, 'No categories on file for this quarter.'));
      box.appendChild(h('p', { class: 'small muted', style: 'margin-top:10px' }, quarterLabel(nq) + ': ' + (next ? (next.label || (next.categories || []).map(function (c) { return cat(c).name; }).join(', ')) : 'not announced yet')));
      nodes.push(box);
    }

    // Memberships that change the rates
    if (inWallet && card.memberships && card.memberships.length) {
      entry.memberships = entry.memberships || {};
      var mb = h('div', { class: 'box' }, h('h3', null, 'Membership'));
      card.memberships.forEach(function (m) {
        var on = !!entry.memberships[m.id];
        mb.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 't' }, h('b', null, m.question), h('span', null, on ? m.yes + ': the higher rates apply' : m.no + ': the lower rates apply')),
          h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': m.question, onclick: function () { entry.memberships[m.id] = !on; saveState(); openCardDetail(cardId, back); } })));
      });
      nodes.push(mb);
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
            saveState(); openCardDetail(cardId, back);
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
              saveState(); openCardDetail(cardId, back);
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
            h('button', { class: 'btn ghost', style: 'padding:6px 10px;min-height:36px', onclick: function () { entry.goals.splice(i, 1); saveState(); openCardDetail(cardId, back); } }, 'Remove'))));
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
    nodes.push(h('p', { class: 'small muted' }, 'Rates checked ' + fmtLongDate(card.verified || data.verified) + ' against the issuer. ', card.sourceUrl ? h('a', { href: card.sourceUrl, target: '_blank', rel: 'noopener' }, 'Issuer page') : null, card.sourceUrl ? ' or ' : '', h('a', { href: 'mailto:' + CONTACT + '?subject=' + encodeURIComponent('Witch Card: wrong number on ' + card.name) }, 'Report a wrong number')));
    if (card.custom) nodes.push(h('button', { class: 'btn block', onclick: function () { openCustomCard(card); } }, 'Edit this card'));
    if (inWallet) nodes.push(h('button', { class: 'btn danger block', onclick: function () {
      toggleCard(card);
      if (card.custom) { state.customCards = state.customCards.filter(function (x) { return x.id !== card.id; }); rebuildCards(); saveState(); }
      closeSheet(); renderAll(); toast('Removed ' + card.name);
    } }, card.custom ? 'Delete this card' : 'Remove from wallet'));
    else nodes.push(h('button', { class: 'btn primary block', onclick: function () { toggleCard(card); closeSheet(); renderAll(); toast('Added ' + card.name); } }, 'Add to wallet'));
    openSheet(entry.nickname || card.name, nodes, { quietHead: true });
    sheetOnClose = back || function () { renderAll(); };
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
    // 1. How the wallet does: one line per kind of place, a red to green scale with a dot where the
    //    wallet's best card sits between a plain 1% card and the best card anyone can get. Tap a row
    //    for the best cards there. Short, so it fits on about one screen.
    if (state.wallet.length) {
      var rows = E.walletScale(state, data), count = { great: 0, good: 0, weak: 0 };
      rows.forEach(function (r) { count[r.level]++; });
      var sec = h('div', { class: 'section scales' },
        h('div', { class: 'section-head' }, h('h2', null, 'How your wallet does'), h('span', { class: 'small muted' }, 'Great in ' + count.great + ', good in ' + count.good + ', weak in ' + count.weak)));
      var list = h('ul', { class: 'scale-list' });
      list.appendChild(h('li', { class: 'scale-legend', 'aria-hidden': 'true' }, h('span'), h('span'), h('span', { class: 'ticks' }, h('span', null, 'Weak'), h('span', null, 'Good'), h('span', null, 'Great')), h('span'), h('span')));
      rows.forEach(function (r, i) {
        var c = r.category, name = c.id === 'other' ? 'Everything else' : c.name, lower = inSentence(c);
        var word = { great: 'great', good: 'good', weak: 'weak' }[r.level];
        var until = r.rotating ? r.rotating.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        list.appendChild(h('li', { class: 'scale ' + r.level, style: '--p:' + r.pos.toFixed(3) + ';--i:' + i + ';--tint:' + tintFor(c.id) },
          h('button', { class: 'scale-row', 'aria-label': name + ': ' + word + ', ' + pctText(r.minePct) + ' with your best card, ' + pctText(r.topPct) + ' is the best out there' + (until ? ', with a rotating bonus until ' + until : '') + '. Best cards for ' + lower + '.', onclick: function () { openBestCards({ category: c.id }, lower); } },
            h('span', { class: 'qi', 'aria-hidden': 'true' }, icon(c.icon)),
            h('span', { class: 'nm' }, name, until ? h('small', null, 'rotating, to ' + until) : null),
            h('span', { class: 'scale-bar', 'aria-hidden': 'true' }, h('span', { class: 'dot' })),
            h('span', { class: 'scale-rate num' }, r.minePct > 0 ? pctText(r.minePct) : '0%'),
            icon('chev'))));
      });
      sec.appendChild(list);
      sec.appendChild(h('p', { class: 'small muted' }, 'Each dot is your best card there, from a plain 1% card (weak) to the best card anyone can get (great). Tap a row for the best cards.'));
      root.appendChild(sec);
    }

    // 2. The best sign-up offers for this person: ranked by what the bonus is worth to them (cash,
    //    or points at the value their goal gives them) after the first year's fee, cards they hold
    //    left out, narrowed to the banks they pick (one, or a few that share points).
    var os = h('div', { class: 'section offers' });
    var goal = { cash: 'cash back', travel: 'points and miles', bonus: 'points and miles' }[state.prefs.priority || 'cash'] || 'cash back';
    os.appendChild(h('div', { class: 'section-head' }, h('h2', null, 'Best sign-up offers for you'), h('span', { class: 'small muted' }, 'as of ' + fmtLongDate(data.bonuses && data.bonuses.verified))));
    os.appendChild(h('p', { class: 'small muted' }, 'Ranked by what the bonus is worth to you as ' + goal + ', after the first year’s fee. Change what matters most under More.'));
    var offerList = h('ol', { class: 'best-list offer-list' });
    var held = 0;
    function drawOffers() {
      clear(offerList);
      var banks = state.prefs.banks || [], shown = 0;
      held = 0;
      personalOffers().forEach(function (x) {
        if (walletEntry(x.o.cardId)) { held++; return; }
        if (banks.length && banks.indexOf(x.issuer) < 0) return;
        var o = x.o, card = x.card, i = shown++;
        var sub = [x.short, o.spend ? 'spend ' + money(o.spend).replace(/\.00$/, '') + ' in ' + o.months + ' month' + (o.months === 1 ? '' : 's') : 'no spend needed',
          o.annualFee ? '$' + o.annualFee + ' a year' + (o.firstYearFeeWaived ? ' after the first' : '') : 'no annual fee'];
        offerList.appendChild(h('li', { style: '--i:' + i }, h('button', { class: 'best-row', onclick: function () { openCardDetail(card.id); } },
          h('span', { class: 'rank num', 'aria-hidden': 'true' }, String(i + 1)),
          cardArt(card, 56),
          h('span', { class: 't' }, h('b', null, o.cardName), h('span', null, sub.join(', '))),
          h('span', { class: 'r num' }, dollarsOf(x.net)))));
      });
      if (!shown) offerList.appendChild(h('li', null, h('p', { class: 'hint', style: 'padding:14px' }, 'No offers on file from ' + (banks.length > 1 ? 'those banks' : 'that bank') + '.')));
      heldNote.textContent = held ? (held === 1 ? 'One card you already have is left out. ' : held + ' cards you already have are left out. ') : '';
    }
    var heldNote = h('span');
    os.appendChild(bankChips(personalOffers().map(function (x) { return x.issuer; }), drawOffers));
    os.appendChild(offerList);
    os.appendChild(h('p', { class: 'small muted' }, heldNote, 'Bonuses change often and some show only on the bank’s site. Nobody pays for a spot here.'));
    drawOffers();
    root.appendChild(os);

    // 3. This quarter's rotating 5%, one line per card.
    var rot = data.cards.filter(function (c) { return c.rotating && c.rotating.calendar && c.rotating.calendar[E.quarterOf(new Date())]; });
    if (rot.length) {
      var q = E.quarterOf(new Date());
      var rs = h('div', { class: 'section' }, h('h2', null, 'Rotating 5% in ' + quarterLabel(q)));
      var ul = h('ul', { class: 'rot-list' });
      rot.forEach(function (c) {
        var cur = c.rotating.calendar[q];
        ul.appendChild(h('li', null, h('b', null, c.name), h('span', null, (cur.label || (cur.categories || []).map(function (x) { return cat(x).name; }).join(', ')) + (cur.activateBy ? '. Activate by ' + E.fmtDate(cur.activateBy) + '.' : ''))));
      });
      rs.appendChild(ul);
      root.appendChild(rs);
    }
  }

  // The sign-up offers with what each bonus is worth to this person, best first.
  function personalOffers() {
    var prefs = { priority: state.prefs.priority || 'cash', redeem: state.prefs.redeem || {} };
    return ((data.bonuses && data.bonuses.offers) || []).map(function (o) {
      var card = E.cardById(data, o.cardId); if (!card) return null;
      // The first "75,000 points" (or "130,000 Hilton Honors points", or miles) in the bank's wording is the bonus.
      if (/no welcome offer/i.test(o.bonus || '')) return null;
      var m = /(\d[\d,]{2,})\s+(?:[A-Za-z]+\s+){0,3}?(points|miles)/i.exec(String(o.bonus || '')), worth, short;
      if (o.cashBonus) { worth = o.cashBonus * 100; short = money(o.cashBonus).replace(/\.00$/, '') + ' cash'; }
      else if (m) {
        var pts = parseInt(m[1].replace(/,/g, ''), 10) || 0, pv = data.valuations.programs[card.program];
        // For cash back, points count at their cash value; airline and hotel points have none.
        var cpp = prefs.priority === 'cash' && !prefs.redeem[card.program] ? (pv ? pv.cash || 0 : 1) : E.valuation(card.program, prefs, data, state.wallet);
        worth = pts * cpp;
        short = (/^\s*(up to|as high as)/i.test(o.bonus) ? 'Up to ' : '') + m[1] + ' ' + m[2].toLowerCase();
      } else { worth = o.bonusValueCents || 0; short = String(o.bonus || '').split(/[:;.(]/)[0]; }
      var fee = o.firstYearFeeWaived ? 0 : (o.annualFee || 0) * 100;
      return worth > 0 ? { o: o, card: card, issuer: card.issuer, worth: worth, net: worth - fee, short: short } : null;
    }).filter(Boolean).sort(function (a, b) { return b.net - a.net; });
  }
  // A kind of place inside a sentence: "groceries", "online shopping", but "Walmart or Target".
  function inSentence(c) {
    if (!c || c.id === 'other') return 'everything else';
    return /\s[A-Z]/.test(c.name) ? c.name : c.name.charAt(0).toLowerCase() + c.name.slice(1);
  }
  function dollarsOf(c) { var v = Math.round(c / 100); return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US'); }

  // The banks, in one row that scrolls sideways. Pick one, or a few (people who keep their cards
  // at banks that share points); none picked means all. Remembered on this phone.
  function bankChips(issuers, onChange) {
    var count = {};
    issuers.forEach(function (i) { count[i] = (count[i] || 0) + 1; });
    var banks = Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a.localeCompare(b); });
    var row = h('div', { class: 'chips bank-chips', role: 'group', 'aria-label': 'Banks' });
    function draw() {
      clear(row);
      var picked = state.prefs.banks || [];
      row.appendChild(h('button', { class: picked.length ? '' : 'on', 'aria-pressed': picked.length ? 'false' : 'true', onclick: function () { state.prefs.banks = []; saveState(); draw(); onChange(); } }, 'All banks'));
      banks.forEach(function (b) {
        var on = picked.indexOf(b) >= 0;
        row.appendChild(h('button', { class: on ? 'on' : '', 'aria-pressed': on ? 'true' : 'false', onclick: function () {
          var p = (state.prefs.banks || []).slice(), k = p.indexOf(b);
          if (k >= 0) p.splice(k, 1); else p.push(b);
          state.prefs.banks = p; saveState(); draw(); onChange();
        } }, b === 'American Express' ? 'Amex' : b));
      });
    }
    draw();
    return row;
  }

  // The best cards for a kind of place (from Compare) or for the store you are at (from Pay), yours
  // and the rest, ranked by what they earn there all year; one tap opens a card, and closing it
  // comes back here.
  function openBestCards(where, label) {
    var all = E.bestCards(where, state, data, new Date(), 80);
    var nodes = [h('p', { class: 'muted' }, 'Ranked by what each card earns ' + (where.merchant ? 'at ' : 'on ') + label + ' all year, the same math as the Pay screen. Nobody pays for a spot here.')];
    var ul = h('ol', { class: 'best-list' }), note = h('div');
    // The same bank picks as Compare: only Chase, or Chase and Citi, and so on.
    nodes.push(bankChips(all.map(function (r) { return r.card.issuer; }), draw));
    nodes.push(note);
    function draw() {
      clear(ul);
      var banks = state.prefs.banks || [];
      var list = all.filter(function (r) { return !banks.length || banks.indexOf(r.card.issuer) >= 0; }).slice(0, 10);
      if (!list.length) ul.appendChild(h('li', null, h('p', { class: 'hint', style: 'padding:14px' }, 'None from ' + (banks.length > 1 ? 'those banks' : 'that bank') + ' here.')));
      // Ties share a rank (1, 1, 3), and when a card you hold is at the top, it says you are set.
      var top = list[0], mineTop = top && top.mine ? top : null;
      clear(note);
      if (mineTop) note.appendChild(h('div', { class: 'note good' }, h('b', null, 'You already have the best card here. '), (mineTop.entry.nickname || mineTop.card.name) + ' earns ' + pctText(mineTop.effectivePercent) + (list[1] && Math.abs(list[1].effectivePercent - mineTop.effectivePercent) <= .005 ? ', as much as any card here.' : ', more than any card you could get.')));
      list.forEach(function (r, i) {
        var rank = 1 + list.filter(function (x) { return x.effectivePercent - r.effectivePercent > .005; }).length;
        var c = r.card, sub = [c.annualFee ? '$' + c.annualFee + ' a year' : 'No annual fee'];
        if (r.unit !== 'percent') sub.push(rateText(r.effectiveRate, r.unit) + ' ' + r.unit);
        if (r.cap && r.cap.cap) sub.push('up to $' + Number(r.cap.cap).toLocaleString('en-US') + ' ' + ({ year: 'a year', quarter: 'a quarter', month: 'a month', cycle: 'a billing cycle' }[r.cap.period] || ''));
        if (r.needs && r.needs.length) sub.push(r.needs.join(', ').toLowerCase());
        if (c.eligibility) sub.push(c.eligibility);
        ul.appendChild(h('li', { style: '--i:' + i }, h('button', { class: 'best-row' + (r.mine ? ' mine' : ''), onclick: function () { openCardDetail(c.id, function () { openBestCards(where, label); }); } },
          h('span', { class: 'rank num', 'aria-hidden': 'true' }, String(rank)),
          cardArt(c, 56),
          h('span', { class: 't' }, h('b', null, c.name), h('span', null, sub.join(', ')), r.mine ? h('span', { class: 'badge good' }, 'In your wallet') : null),
          h('span', { class: 'r num' }, pctText(r.effectivePercent)))));
      });
    }
    draw();
    nodes.push(ul);
    nodes.push(h('p', { class: 'small muted' }, 'Year-round rates; rotating quarterly bonuses are left out. Points are counted at the value set under More.'));
    // For the place you are at on the Pay screen: what the best card you do not have would add in a year.
    var here = ctx.merchant ? where.merchant === ctx.merchant : (!where.merchant && where.category === (ctx.category || 'other'));
    if (here && view === 'pay' && state.prefs.showAnywhere !== false) {
      var box = h('div');
      renderAnywhere(box, { merchant: ctx.merchant, category: ctx.category || (ctx.merchant ? null : 'other'), amount: 0, payMethod: ctx.payMethod, abroad: !!state.prefs.abroad }, 0);
      nodes.push(box);
    }
    openSheet('Best cards for ' + label, nodes);
  }

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
    ps.appendChild(h('div', { class: 'row' }, h('span', { class: 't' }, h('b', null, 'Find my store when I open the app'), h('span', null, PREVIEW ? 'Available in the installed app, not in this preview.' : 'Looks up the stores around you each time you open it. The stores it finds stay on this phone for 30 days.')),
      h('button', { class: 'switch' + (state.prefs.location ? ' on' : ''), role: 'switch', 'aria-checked': state.prefs.location ? 'true' : 'false', 'aria-label': 'Use location', disabled: PREVIEW ? true : null, onclick: function () { state.prefs.location = !state.prefs.location; state.locationAsked = true; saveState(); renderMore(); if (state.prefs.location) relocate(); else forgetPlaces(); } })));
    var note = state.prefs.location ? lookupNote() : null;
    if (note) ps.appendChild(note);
    if ((state.myPlaces || []).length) {
      var mp = h('div', { class: 'box small' }, h('h3', null, 'Spots you remembered'), h('p', { class: 'muted' }, 'Standing at one of these says you are there, even when the map does not know it.'));
      var ul = h('ul', { class: 'my-places' });
      state.myPlaces.forEach(function (m) {
        var mm = m.merchant ? E.merchantById(data, m.merchant) : null, c = cat(mm ? mm.category : (m.category || 'other'));
        ul.appendChild(h('li', null, h('span', null, m.name, h('small', null, c.name)), h('button', { class: 'btn ghost', 'aria-label': 'Forget ' + m.name, onclick: function () { state.myPlaces = state.myPlaces.filter(function (x) { return x !== m; }); saveState(); renderMore(); } }, 'Forget')));
      });
      mp.appendChild(ul); ps.appendChild(mp);
    }
    if (!PREVIEW) ps.appendChild(h('button', { class: 'btn block', onclick: openLocationTest }, 'Test location on this phone'));
    ps.appendChild(h('div', { class: 'row' }, h('span', { class: 't' }, h('b', null, 'Show what a new card would add'), h('span', null, 'In Best cards for the place you are at: what the best card you don\u2019t have would add in a year, after its fee.')),
      h('button', { class: 'switch' + (state.prefs.showAnywhere !== false ? ' on' : ''), role: 'switch', 'aria-checked': state.prefs.showAnywhere !== false ? 'true' : 'false', 'aria-label': 'Show the best card I do not have', onclick: function () { state.prefs.showAnywhere = state.prefs.showAnywhere === false; saveState(); renderMore(); } })));
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
      PREVIEW ? null : h('button', { class: 'btn', onclick: function () { toast('Checking for new data'); fetchData().then(function (d) { if (!d) { toast('Could not reach the data file'); return; } var changed = d.cards.version !== data.version; data = normalizeData(d); rebuildCards(); try { localStorage.setItem(DATA_KEY, JSON.stringify(d)); } catch (e) { } toast(changed ? 'Updated to ' + fmtLongDate(d.cards.version) : 'Already up to date'); renderMore(); }); } }, 'Refresh')));
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
        h('p', null, h('b', null, 'Witch Card'), ' by Tompkins Software Systems. The witch is for fun; the answers are arithmetic on your own cards. No magic. Just math.'),
        h('p', { style: 'margin-top:8px' }, 'Nothing to sign up for. Your card list, purchases and settings stay on this phone. The only thing that leaves it is an anonymous nearby-places lookup when you use location, and the stores it finds are remembered on this phone for 30 days so a return visit is instant. Scanning a card happens on this phone too: letters only, never the number, and the photo is dropped as soon as the card is matched.'),
        h('p', { style: 'margin-top:8px', class: 'pledge' }, 'Made by a cardholder, not a bank. No sponsors. No ads, ever. No subscription, ever. 99 cents once, for life.'),
        h('p', { style: 'margin-top:8px' }, h('b', null, 'About the card pictures. '), 'Drawn, not real. Partly because we are cheap asses, mostly because the real designs are trademarked and we are not spending eternity in court over a picture. The sites with the real pictures have a deal with the bank and get paid when you click. We get squat, on purpose.'),
        h('p', { style: 'margin-top:8px' }, 'Independent of every bank and card network. No bank pays for placement, no referral links, no sponsored cards; the ranking is arithmetic on your own cards. Rates and terms change; the issuer’s agreement wins. Point values are estimates.'),
        h('p', { style: 'margin-top:8px' }, 'Questions or a wrong number: ', h('a', { href: 'mailto:' + CONTACT }, CONTACT)),
        h('p', { style: 'margin-top:8px', class: 'muted' }, buildLine())));
    as.appendChild(h('button', { class: 'btn block', onclick: openDisclaimer }, 'See the welcome note again'));
    as.appendChild(h('button', { class: 'btn danger block', onclick: function () { confirmReset(); } }, 'Erase everything on this phone'));
    root.appendChild(as);
  }
  function confirmReset() {
    openSheet('Erase everything?', [h('p', null, 'This removes your cards, goals and logged purchases from this phone. Card data comes back on the next load.'),
      h('button', { class: 'btn danger block', onclick: function () { try { localStorage.removeItem(STATE_KEY); } catch (e) { } forgetPlaces(); state = loadState(); rebuildCards(); ctx = { merchant: null, category: null, customName: '', amount: '', payMethod: 'card' }; closeSheet(); showView('pay'); toast('Erased'); } }, 'Yes, erase'),
      h('button', { class: 'btn block', onclick: closeSheet }, 'Keep it')]);
  }
  function exportCode() { try { return 'WC1.' + btoa(unescape(encodeURIComponent(JSON.stringify({ wallet: state.wallet, prefs: state.prefs, customCards: state.customCards, myPlaces: state.myPlaces })))); } catch (e) { return ''; } }
  function importCode(code) {
    try {
      code = (code || '').trim(); if (code.indexOf('WC1.') !== 0) return false;
      var obj = JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
      if (!obj || !Array.isArray(obj.wallet)) return false;
      state.wallet = obj.wallet; state.prefs = obj.prefs || state.prefs; state.prefs.redeem = state.prefs.redeem || {}; state.customCards = obj.customCards || []; state.myPlaces = Array.isArray(obj.myPlaces) ? obj.myPlaces : state.myPlaces; state.onboarded = true; rebuildCards(); saveState(); return true;
    } catch (e) { return false; }
  }
  function copyText(t) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t); return Promise.reject(); }

  /* ---------- init ---------- */
  function readParams() {
    var p = new URLSearchParams(location.search);
    if (p.get('m')) { ctx.merchant = p.get('m'); ctx.category = null; }
    else if (p.get('cat')) { ctx.category = p.get('cat'); ctx.merchant = null; }
    if (p.get('m') || p.get('cat') || p.get('amt')) { try { history.replaceState(null, '', location.pathname); } catch (e) { } return true; }
    return false;
  }

  function bind() {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { showView(b.getAttribute('data-view')); }); });
    document.getElementById('btn-start').addEventListener('click', function () { openAddCards(true); });
    document.getElementById('btn-locate').addEventListener('click', function () { showView('pay'); relocate(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (!state.prefs.location || view !== 'pay' || !state.wallet.length || !state.disclaimed || !canLocate()) return;
      if (!ctx.merchant && !ctx.category) { locate(); return; }
      if (hiddenAt && Date.now() - hiddenAt > AWAY && !pickedJustNow()) relocate();
    });
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
    var lookFirst = !fromParams && state.prefs.location && canLocate() && !pickedJustNow();
    var lw = state.lastWhere;
    if (!fromParams && lw && Date.now() - (lw.at || 0) < 20 * 60 * 1000) {
      ctx.merchant = lw.merchant; ctx.category = lw.category; ctx.customName = lw.customName || ''; ctx.located = !!lw.located;
      if (lookFirst) { locatePrev = { merchant: ctx.merchant, category: ctx.category, customName: ctx.customName, located: ctx.located }; ctx.merchant = null; ctx.category = null; ctx.customName = ''; ctx.located = false; }
    }
    showView('pay');
    if (!state.wallet.length && !state.onboarded) { onboarding = true; }
    if (!state.disclaimed) openDisclaimer();
    else if (lookFirst && state.wallet.length && !ctx.merchant && !ctx.category) locate();
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
