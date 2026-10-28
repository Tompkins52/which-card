/* Which Card recommendation engine.
   Pure functions, no DOM. Works in the browser (window.WhichCardEngine) and in Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WhichCardEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRIORITY_KEYS = { cash: 'cash', travel: 'transfer', bonus: 'transfer' };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function quarterOf(d) {
    var q = Math.floor(d.getMonth() / 3) + 1;
    return d.getFullYear() + '-Q' + q;
  }
  function quarterEnd(d) {
    var q = Math.floor(d.getMonth() / 3);
    return new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
  }
  function nextQuarterKey(d) {
    var q = Math.floor(d.getMonth() / 3) + 1;
    var y = d.getFullYear();
    if (q === 4) { q = 1; y += 1; } else { q += 1; }
    return y + '-Q' + q;
  }
  function periodKey(period, d) {
    switch (period) {
      case 'quarter': return 'quarter:' + quarterOf(d);
      case 'month':
      case 'cycle': return 'month:' + d.getFullYear() + '-' + pad2(d.getMonth() + 1);
      case 'year': return 'year:' + d.getFullYear();
      default: return 'all';
    }
  }
  function periodLabel(period) {
    return { quarter: 'this quarter', month: 'this month', cycle: 'this billing cycle', year: 'this year' }[period] || '';
  }

  function unitFor(program, data) {
    var p = data.valuations && data.valuations.programs && data.valuations.programs[program];
    if (program === 'cashback' || (p && p.unit === 'percent')) return 'percent';
    if (p && p.unit) return p.unit;
    if (/miles/.test(program)) return 'miles';
    if (program === 'cashback' || /cashback|cash|circle/.test(program)) return 'percent';
    return 'points';
  }

  // Cents of value per unit (1 for 1% cash back = 1 cent per "percent point" of a dollar).
  function valuation(program, prefs, data, wallet) {
    var p = data.valuations && data.valuations.programs && data.valuations.programs[program];
    if (!p || unitFor(program, data) === 'percent') return 1;
    var mode = (prefs.redeem && prefs.redeem[program]) || PRIORITY_KEYS[prefs.priority || 'cash'] || 'cash';
    if (mode === 'transfer' && p.transferRequires && p.transferRequires.length) {
      var has = (wallet || []).some(function (e) { return p.transferRequires.indexOf(e.cardId) >= 0; });
      if (!has) mode = 'travel';
    }
    var v = p[mode];
    if (!v) v = p.transfer || p.travel || p.cash || 1;
    if (mode === 'transfer' && !p.transfer) v = p.travel || p.cash || 1;
    if (mode === 'cash' && !p.cash) v = p.travel || p.transfer || 1;
    return v;
  }

  function merchantById(data, id) {
    if (!id) return null;
    for (var i = 0; i < data.merchants.length; i++) if (data.merchants[i].id === id) return data.merchants[i];
    return null;
  }
  function cardById(data, id) {
    for (var i = 0; i < data.cards.length; i++) if (data.cards[i].id === id) return data.cards[i];
    return null;
  }
  function categoryById(data, id) {
    for (var i = 0; i < data.categories.length; i++) if (data.categories[i].id === id) return data.categories[i];
    return null;
  }

  // Everything the purchase "is": the merchant's primary category, its secondary ones, and the chosen category.
  function contextCategories(ctx, data) {
    var set = {};
    var primary = ctx.category || null;
    var m = merchantById(data, ctx.merchant);
    if (m) {
      if (!primary) primary = m.category;
      set[m.category] = true;
      (m.also || []).forEach(function (c) { set[c] = true; });
      if (m.online) set.online = true;
    }
    if (primary) set[primary] = true;
    if (ctx.payMethod === 'wallet') set['wallet-pay'] = true;
    if (ctx.online) set.online = true;
    return { primary: primary || 'other', all: set, merchant: m };
  }

  function excluded(rule, cats) {
    if (!rule.excludes) return false;
    for (var i = 0; i < rule.excludes.length; i++) if (cats.all[rule.excludes[i]]) return true;
    return false;
  }

  // Spend already logged against a cap pool in the current period.
  function spendInPool(entry, poolKey, period, now) {
    var key = periodKey(period, now);
    var total = 0;
    (entry.purchases || []).forEach(function (p) {
      if (p.pool !== poolKey) return;
      var d = new Date(p.date);
      if (periodKey(period, d) === key) total += Number(p.amount) || 0;
    });
    return total;
  }

  // Day-and-time windows such as "Friday and Saturday 6 PM to 6 AM Eastern".
  function inWindow(when, now) {
    if (!when) return true;
    var day, hour;
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: when.tz || 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now);
      var map = {}; parts.forEach(function (p) { map[p.type] = p.value; });
      day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(map.weekday);
      hour = parseInt(map.hour, 10) % 24;
    } catch (e) { day = now.getDay(); hour = now.getHours(); }
    var start = when.start, end = when.end;
    if (start <= end) return when.days.indexOf(day) >= 0 && hour >= start && hour < end;
    // window crosses midnight: evening of a listed day, or early morning of the following day
    if (hour >= start) return when.days.indexOf(day) >= 0;
    if (hour < end) return when.days.indexOf((day + 6) % 7) >= 0;
    return false;
  }

  // Candidate earning rules for this card in this context.
  function candidates(card, entry, cats, now, data, ctx) {
    var list = [];
    ctx = ctx || {};
    var q = quarterOf(now);
    (card.earn || []).forEach(function (r, idx) {
      var hit = false, label = '';
      var rate = r.rate;
      if (r.when && !inWindow(r.when, now)) return;
      if (r.walletPayOnly && !cats.all['wallet-pay']) return;
      if (r.onlineOnly && !cats.all.online) return;
      if (r.until && now > new Date(r.until + 'T23:59:59')) { if (r.afterRate) rate = r.afterRate; else return; }
      if (r.merchant && cats.merchant && (cats.merchant.id === r.merchant || cats.merchant.parent === r.merchant)) { hit = true; label = cats.merchant.name; }
      else if (r.category && r.category !== 'rotating' && r.category !== 'choice' && cats.all[r.category]) {
        if (r.category === 'select-merchants') { hit = !!(r.merchants && cats.merchant && r.merchants.indexOf(cats.merchant.id) >= 0); }
        else hit = true;
        label = r.label || r.category;
      }
      if (!hit || excluded(r, cats)) return;
      list.push({ rate: rate, source: 'earn', label: label, cap: r.cap || 0, capPeriod: r.capPeriod || '', pool: r.capGroup || ('earn:' + idx), activation: !!r.activation, note: r.note || '' });
    });
    if (card.largePurchase && card.largePurchase.minAmount && Number(ctx.amount) >= card.largePurchase.minAmount) {
      list.push({ rate: card.largePurchase.rate, source: 'earn', label: 'purchases of $' + card.largePurchase.minAmount.toLocaleString() + ' or more', cap: 0, capPeriod: '', pool: 'large', activation: false, note: '' });
    }
    if (card.choice) {
      var ch = card.choice;
      var picks = entry.choices || [];
      var matches = function (c) { return !!cats.all[c] || !!(cats.merchant && (cats.merchant.id === c || cats.merchant.parent === c)); };
      var inPick = picks.some(matches);
      if (inPick) list.push({ rate: ch.rate, source: 'choice', label: ch.auto ? 'the category you give this card' : 'your chosen category', cap: ch.cap || 0, capPeriod: ch.capPeriod || '', pool: 'choice', activation: false, auto: !!ch.auto, note: '' });
      if (ch.secondTier) {
        var st = ch.secondTier;
        var tierCats = st.slots ? (entry.choices2 || []) : st.categories;
        if (tierCats.some(matches)) list.push({ rate: st.rate, source: 'choice2', label: 'second tier', cap: st.sharesCap ? (ch.cap || 0) : (st.cap || 0), capPeriod: st.sharesCap ? ch.capPeriod : (st.capPeriod || ''), pool: st.sharesCap ? 'choice' : 'choice2', activation: false, note: '' });
      }
    }
    if (card.rotating && card.rotating.calendar) {
      var cal = card.rotating.calendar[q];
      if (cal) {
        var rotCat = (cal.categories || []).filter(function (c) { return cats.all[c]; })[0];
        var rotMerchant = (cal.merchants || []).filter(function (m) { return cats.merchant && (cats.merchant.id === m || cats.merchant.parent === m); })[0];
        if (rotCat || rotMerchant) {
          var act = entry.activated && entry.activated[q];
          var rotLabel = rotMerchant ? (merchantById(data, rotMerchant) || { name: rotMerchant }).name : (categoryById(data, rotCat) || { name: rotCat }).name.toLowerCase();
          list.push({ rate: card.rotating.rate, source: 'rotating', label: rotLabel, cap: card.rotating.cap || 0, capPeriod: card.rotating.capPeriod || 'quarter', pool: 'rotating', activation: !!card.rotating.activation, activated: !!act, quarter: q, activateBy: cal.activateBy || '' });
        }
      }
    }
    return list;
  }

  function evaluateCard(card, entry, ctx, prefs, data, now) {
    var cats = contextCategories(ctx, data);
    var amount = Number(ctx.amount) || 0;
    var unit = unitFor(card.program, data);
    var cpp = valuation(card.program, prefs, data, prefs.wallet);
    var mult = Number(entry.multiplier) || 1;
    var base = Number(card.base) || 0;
    var warnings = [];
    var accepted = true;

    var network = entry.network || card.network;
    if (cats.merchant && cats.merchant.networks && cats.merchant.networks.indexOf(network) < 0) {
      accepted = false;
      warnings.push(cats.merchant.name + ' takes ' + cats.merchant.networks.join(' or ') + ' only');
    }
    if (card.onlyAt && card.onlyAt.length) {
      var here = cats.merchant && card.onlyAt.some(function (m) { return cats.merchant.id === m || cats.merchant.parent === m; });
      if (!here) { accepted = false; warnings.push('Store card: works only at ' + (merchantById(data, card.onlyAt[0]) || { name: card.onlyAt[0] }).name); }
    }

    var list = candidates(card, entry, cats, now, data, ctx);
    var best = null;
    list.forEach(function (c) { if (!best || c.rate > best.rate) best = c; });

    var rate = best ? best.rate : base;
    var units = 0, capInfo = null, effectiveRate = rate;
    if (best) {
      if (best.activation && !best.activated) {
        warnings.push('Activate the ' + best.rate + (unit === 'percent' ? '%' : 'x') + ' bonus first' + (best.activateBy ? ' (by ' + fmtDate(best.activateBy) + ')' : ''));
      }
      if (best.auto) warnings.push('Top rate goes to one category per billing cycle; keep this card on it');
      if (best.cap) {
        var used = spendInPool(entry, best.pool, best.capPeriod, now);
        var left = Math.max(0, best.cap - used);
        capInfo = { cap: best.cap, used: used, left: left, period: best.capPeriod, label: periodLabel(best.capPeriod) };
        if (left <= 0) {
          warnings.push('Bonus cap reached ' + periodLabel(best.capPeriod) + ', earning the base rate');
          effectiveRate = base;
          units = amount * base;
        } else if (amount > left) {
          units = left * best.rate + (amount - left) * base;
          effectiveRate = amount ? units / amount : best.rate;
          warnings.push('Only $' + fmtMoney(left) + ' of the bonus cap is left ' + periodLabel(best.capPeriod));
        } else {
          units = amount * best.rate;
        }
      } else {
        units = amount * best.rate;
      }
    } else {
      units = amount * base;
    }
    units = units * mult;
    effectiveRate = effectiveRate * mult;

    var fxPenalty = 0;
    if (ctx.abroad && card.fxFee) {
      fxPenalty = amount * card.fxFee / 100;
      warnings.push(card.fxFee + '% foreign transaction fee');
    }

    var valueCents = units * cpp - fxPenalty * 100;
    var effectivePercent = effectiveRate * cpp - (ctx.abroad ? (card.fxFee || 0) : 0);

    var goal = null;
    (entry.goals || []).forEach(function (g) {
      if (g.done) return;
      var remaining = Math.max(0, (Number(g.target) || 0) - (Number(g.progress) || 0));
      if (remaining <= 0) return;
      if (g.deadline && new Date(g.deadline) < now) return;
      if (!goal || remaining < goal.remaining) goal = { label: g.label || 'Spend goal', remaining: remaining, deadline: g.deadline || '' };
    });

    var reason;
    if (!accepted) reason = 'Not accepted here';
    else if (best) {
      reason = best.rate + (unit === 'percent' ? '% ' : 'x ') + (best.source === 'rotating' ? 'on ' + best.label + ' this quarter' : best.source === 'choice' ? (best.auto ? 'as its top category' : 'your chosen category') : best.source === 'choice2' ? 'your second category' : 'on ' + prettyLabel(best.label, data));
    } else reason = base + (unit === 'percent' ? '% ' : 'x ') + 'on everything';

    var protections = [];
    if (card.benefits) {
      if (card.benefits.purchaseProtection) protections.push('Purchase protection');
      if (card.benefits.extendedWarranty) protections.push('Extended warranty');
      if (card.benefits.cellPhoneProtection && (cats.all.phone)) protections.push('Cell phone protection');
      if (card.benefits.rentalCarCDW && cats.all['rental-car']) protections.push(card.benefits.rentalCarCDW === 'primary' ? 'Primary rental coverage' : 'Secondary rental coverage');
    }

    return {
      card: card, entry: entry, accepted: accepted,
      rate: rate, effectiveRate: effectiveRate, unit: unit, cpp: cpp,
      units: units, valueCents: valueCents, effectivePercent: effectivePercent,
      reason: reason, source: best ? best.source : 'base', warnings: warnings, cap: capInfo,
      goal: goal, protections: protections, pool: best ? best.pool : 'base',
      activationNeeded: !!(best && best.activation && !best.activated)
    };
  }

  function prettyLabel(label, data) {
    var c = categoryById(data, label);
    return c ? c.name.toLowerCase() : label;
  }

  function fmtMoney(n) {
    n = Math.round(n * 100) / 100;
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function fmtDate(s) {
    var d = new Date(s + (s.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d)) return s;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function recommend(ctx, state, data, now) {
    now = now || new Date();
    var prefs = Object.assign({}, state.prefs || {}, { wallet: state.wallet || [] });
    var results = [];
    (state.wallet || []).forEach(function (entry) {
      var card = cardById(data, entry.cardId);
      if (!card) return;
      results.push(evaluateCard(card, entry, ctx, prefs, data, now));
    });
    var amount = Number(ctx.amount) || 0;
    var bonusMode = prefs.priority === 'bonus';
    results.sort(function (a, b) {
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
      if (bonusMode && (!!a.goal) !== (!!b.goal)) return a.goal ? -1 : 1;
      var av = amount ? a.valueCents : a.effectivePercent;
      var bv = amount ? b.valueCents : b.effectivePercent;
      if (Math.abs(bv - av) > 1e-9) return bv - av;
      if (a.activationNeeded !== b.activationNeeded) return a.activationNeeded ? 1 : -1;
      if (b.protections.length !== a.protections.length) return b.protections.length - a.protections.length;
      return (a.card.annualFee || 0) - (b.card.annualFee || 0);
    });
    var cats = contextCategories(ctx, data);
    var notes = [];
    if (cats.merchant && cats.merchant.note) notes.push(cats.merchant.note);
    return { results: results, best: results[0] || null, categories: cats, notes: notes };
  }

  // Where the catalog beats the wallet, for the Offers tab.
  function gaps(state, data, now) {
    now = now || new Date();
    var prefs = Object.assign({}, state.prefs || {}, { wallet: state.wallet || [] });
    var out = [];
    var walletIds = {};
    (state.wallet || []).forEach(function (e) { walletIds[e.cardId] = true; });
    data.categories.forEach(function (cat) {
      if (!cat.quick || cat.id === 'other') return;
      var ctx = { category: cat.id, amount: 100 };
      var mine = recommend(ctx, state, data, now).best;
      var minePct = mine ? mine.effectivePercent : 0;
      var bestCatalog = null;
      data.cards.forEach(function (card) {
        if (walletIds[card.id] || card.type === 'business' || card.hidden || card.closed || card.onlyAt) return;
        var pv = data.valuations.programs[card.program];
        if ((prefs.priority || 'cash') === 'cash' && pv && !pv.cash) return;
        if ((prefs.priority || 'cash') === 'cash' && (card.annualFee || 0) > 150) return;
        var r = evaluateCard(card, {}, ctx, prefs, data, now);
        if (r.source === 'base') return;
        if (!bestCatalog || r.effectivePercent > bestCatalog.effectivePercent || (r.effectivePercent === bestCatalog.effectivePercent && (card.annualFee || 0) < (bestCatalog.card.annualFee || 0))) bestCatalog = r;
      });
      if (bestCatalog && bestCatalog.effectivePercent - minePct >= 1.5) {
        out.push({ category: cat, mine: mine, minePct: minePct, card: bestCatalog.card, pct: bestCatalog.effectivePercent, reason: bestCatalog.reason });
      }
    });
    out.sort(function (a, b) { return (b.pct - b.minePct) - (a.pct - a.minePct); });
    return out;
  }

  // A one-line summary of a card's best uses, for the wallet and the card detail.
  function cardSummary(card, data) {
    var parts = [];
    var unit = unitFor(card.program, data);
    var seen = {};
    (card.earn || []).slice().sort(function (a, b) { return (a.merchant ? 1 : 0) - (b.merchant ? 1 : 0) || b.rate - a.rate; }).forEach(function (r) {
      if (r.when || r.walletPayOnly) return;
      var label = r.label || (r.merchant ? (merchantById(data, r.merchant) || { name: r.merchant }).name : prettyLabel(r.category, data));
      if (seen[label]) return; seen[label] = true;
      parts.push(r.rate + (unit === 'percent' ? '%' : 'x') + ' ' + label);
    });
    if (card.rotating) parts.unshift(card.rotating.rate + (unit === 'percent' ? '%' : 'x') + ' rotating');
    if (card.choice) parts.unshift(card.choice.rate + (unit === 'percent' ? '%' : 'x') + ' ' + (card.choice.auto ? 'top category' : 'chosen category'));
    parts.push(card.base + (unit === 'percent' ? '%' : 'x') + ' everything else');
    return parts.slice(0, 5).join(' · ');
  }

  return {
    quarterOf: quarterOf, quarterEnd: quarterEnd, nextQuarterKey: nextQuarterKey, periodKey: periodKey,
    valuation: valuation, unitFor: unitFor, merchantById: merchantById, cardById: cardById, categoryById: categoryById,
    contextCategories: contextCategories, evaluateCard: evaluateCard, recommend: recommend, gaps: gaps,
    cardSummary: cardSummary, spendInPool: spendInPool, fmtMoney: fmtMoney, fmtDate: fmtDate
  };
}));
