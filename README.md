# Which Card

https://which-card.tompkinssoftwaresystems.com

A home-screen web app that tells you which of your credit cards to use at the store you are standing in, before you pay. Open it, confirm the store (or let it find the store from your location), type the amount if you want the dollar figure, and the best card is on screen. No account, no server, nothing leaves the phone except an anonymous nearby-places lookup when location is on.

Built by Tompkins Software Systems.

## How it works

The first open shows a welcome note from a goofy cartoon card: the app is built for people who pay their statement in full and never pay interest; anyone who pays interest is welcome to carry on as they are.

- **Pay** is the whole point: pick the store (search, quick buttons, or location), optionally type the amount, and the top card appears with what it earns, why, and anything to watch (activation, caps, Visa-only stores, foreign fees). Every other card in the wallet is ranked below it. "I used it" logs the purchase so caps and welcome-bonus goals stay current.
- **Where you are standing.** With location on, the app looks up the stores around you every time it opens, and again when you come back to it after a minute or more, then shows "You're at" and the store's name with the best card for it, before any amount is typed. The stores next door are one tap away ("Not here?"). A store picked by hand in the last three minutes is kept, so switching to a payment app and back never moves you, and a new store clears the old amount. If the lookup fails, the last store comes back. The Pay screen asks once, at the top, whether to turn location on.
- **Best card anywhere** sits under each answer: the card from the whole catalog that would earn the most at that store at the person's pace (a trips-a-year slider, prefilled from their logged purchases or a typical pace), shown as yearly dollars after the card's annual fee, with the trip count at which a fee card pays for itself. It judges cards on their everyday rates, ignoring rotating and time-limited bonuses, and says plainly when nothing beats what they already carry. It can be turned off under More.
- **Wallet** holds the cards the person carries. Each card has a detail page: a perks checklist (every credit and perk on one screen, with an Activated or Used switch and a link to the issuer page that activates it), how it earns, this quarter's rotating categories with an activation switch and the issuer's activation page, chosen categories for pick-your-own cards, cap progress, spend goals, tips, gotchas, protections, and what a point is worth.
- **Compare** shows where the wallet is weak (categories where a card in the catalog would beat what they have), the sign-up bonuses as the banks publish them, listed for reference only, and the rotating calendars.
- **More** holds the priority (cash back, points and miles, or earning a bonus), redemption overrides per program, location and phone-wallet settings, the data date, a setup code for moving to another phone, and the privacy and contact text.

The recommendation logic lives in `engine.js` and has no DOM dependencies; `tests/engine.test.js` covers caps, rotating quarters, exclusions, network acceptance, valuations and goals.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `app.css`, `app.js`, `engine.js` | The app. No build step, no framework. |
| `manifest.webmanifest`, `sw.js`, `icons/` | Home-screen install and offline support. Shortcuts (long-press the icon on Android) open the app straight on Gas, Groceries, Dining or Amazon. |
| `data/categories.json` | The spending categories the app understands. |
| `data/merchants.json` | Stores and sites, their category, quirks (Costco is Visa only; Walmart is not a grocery store) and aliases for the location matcher. |
| `data/cards.json` | The card catalog: earning rules, caps, rotating calendars with the activation page, choice categories, perks with their activation pages, benefits, tips, source page and verified date per card. |
| `data/bonuses.json` | Current welcome offers with their source page and checked date. |
| `data/valuations.json` | Cents per point for each program under three redemption styles. |
| `tools/validate_data.py` | Shape and cross-reference checks on the data. Runs in CI. |
| `tools/check_sources.py` | The daily review job (see below). |
| `tools/make_preview.py` | Builds a single-file preview with the data inlined. |
| `tools/make_icons.py` | Draws the icons. |

## Keeping the card data current

There is no public feed of credit card earning rules, so the catalog is a curated file with a source URL and a `verified` date on every entry. Two things keep it from going stale:

1. **Daily check** (`.github/workflows/data-check.yml`). Every morning the job fetches each source page, hashes the visible text, and compares it with the last run. When a page changed, a card has not been verified in 90 days, an offer in 45 days, or a rotating card has no categories on file for the quarter that starts within 30 days, it opens (or comments on) a GitHub issue labeled `data-review` with a to-do list. The job records the new hashes so each change is reported once. It never edits card data on its own; a person reads the page, fixes the number if it moved, sets `verified` to today, and commits. The next deploy carries the change to every phone.
2. **In-app refresh.** On every launch the app fetches `data/*.json` with caching disabled and keeps the newest copy in local storage, so a data commit reaches users without reinstalling. The data date shows under More, and every card detail shows its own verified date and a "report a wrong number" link.

Some bank sites block automated requests. Those pages show up under "Pages that blocked the check" so they get opened by hand.

## Running it

Static files, so any web server works. For local use:

```
python3 -m http.server 8000
```

then open http://localhost:8000. Location lookup needs HTTPS (or localhost).

Live at https://which-card.tompkinssoftwaresystems.com (the old tompkins52.github.io/which-card address forwards there).

Deploy: GitHub Pages through `.github/workflows/pages.yml` (Settings > Pages > Source: GitHub Actions). The custom domain is set in Settings > Pages > Custom domain, with a Cloudflare CNAME record `which-card` pointing at `tompkins52.github.io` (DNS only, gray cloud). No CNAME file is needed because the site deploys through Actions.

Checks before committing data:

```
python3 tools/validate_data.py
node tests/engine.test.js
```

Phone checks in a headless browser (Playwright): `python3 tests/ui_check.py` walks the app, and `python3 tests/location_check.py` fakes the phone's position and the OpenStreetMap answer to check the store lookup on open, on return, after a hand pick, and when the lookup fails.

## Privacy

The app stores the card names the person picks, their settings, goals and logged purchase amounts in the browser's local storage on that phone. Nothing is sent to a server. With location turned on, the phone's coordinates are sent to the OpenStreetMap Overpass service each time the app opens (and when it comes back after a minute or more) to find the businesses within about 120 meters; no account or identifier goes with them. There is no analytics, no advertising and no referral link.

## Independent

Made by a cardholder, not a bank. No sponsors. No ads, ever. No subscription, ever. 99 cents once, for life. Which Card takes nothing from any bank: no referral links, no paid placement, no sponsored cards. Every card gets the same treatment and the ranking is arithmetic on the person's own cards. It is not affiliated with any bank or card network. Earning rates are copied from issuer pages and can change without notice; the cardholder agreement always wins. Point values are estimates.
