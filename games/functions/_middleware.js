// SEO pre-render middleware for pcgames.lazycomparo.com
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// The site is a single-file React app transformed by Babel *in the browser*.
// The raw HTML a crawler fetches is an empty <div id="root">, so Google sees no
// content -> effectively invisible in search. This middleware injects real,
// indexable HTML into #root and adds JSON-LD structured data BEFORE the React
// app boots. React's createRoot() clears #root on first render and takes over,
// so real users get the full interactive app while crawlers (and JS-less
// clients) get content. Progressive enhancement / pre-render, not cloaking.
//
// THE ROUTES HANDLED HERE:
//   /                -> homepage: ItemList JSON-LD + a linked list of all games
//   /game/<slug>     -> per-game landing page: unique <title>/description/
//                       canonical/og, a single-game detail block, and
//                       VideoGame + BreadcrumbList JSON-LD. The slug is the
//                       game id. `games/_redirects` rewrites /game/* to the app
//                       shell so context.next() serves index.html for these.
//   /compare/<a>-vs-<b> -> head-to-head page for two games, same rewrite trick.
//                       See "COMPARE PAGES" below for why the app's old
//                       `#compare=` fragment could never be one of these.
//   /gog, /deals/all-time-low -> the two hubs, from their own no-React shells.
//   /sitemap.xml     -> generated here from games.json, because the compare
//                       URLs are generated too. See "SITEMAP" below.
//
// THE CATALOG IS NOT COPIED HERE ANY MORE. Until 2026-08-16 this file held a
// hand-mirrored, trimmed copy of the GAMES array in ../index.html, plus a
// second copy of the store-availability map — three edits and a pre-push check
// for one new game, and the two copies had already drifted. Both now read
// ../games.json, so adding a game is one edit to that file (plus the sitemap,
// which .claude/make-games-sitemap.ps1 generates from it).
//
// PRICES ARE PER VISITOR. Steam and ITAD price by country, so this file
// renders whatever the visitor's own storefront charges — US$ for a US
// crawler or reader, S$ for a Singaporean one — and injects that region into
// the page as window.__LC_REGION so the React app agrees with the pre-render
// instead of flashing one currency and settling on another.
//
// The region is threaded through the render functions as an argument rather
// than parked in module scope: module scope is shared by every request the
// isolate is handling, and there is an `await` between resolving the region
// and rendering with it, so a US request could otherwise finish rendering
// with a Singaporean one's currency.
//
// Prices in games.json are the SGD reference (BASE_CURRENCY); they are only a
// fallback for when the live feed is unavailable, and are FX-converted and
// marked "about" when the visitor's currency is not SGD.
// ---------------------------------------------------------------------------

import {
  BASE_CURRENCY, resolveCountry, regionFor, countryName, fxRate,
  formatMoney, symbolFor, decimalsFor, round2,
} from '../lib/region.js';

const SITE = 'https://pcgames.lazycomparo.com';

/* The catalog, in the trimmed shape the render functions want, cached in
   module scope so a warm isolate reads the file once. The cache lives at most
   as long as the isolate and every deploy makes new ones, so an edit to
   games.json can never be served stale after a push. */
let GAMES = [];
let BY_ID = new Map();

function trim(raw) {
  return raw.map((g) => ({
    id: g.id,
    appId: g.appId,
    title: g.title,
    studio: g.studio,
    genre: g.genre,
    year: g.year,
    price: g.price,
    rating: g.displayInfo.rating,
    hours: g.displayInfo.hoursToBeat,
    players: g.displayInfo.players,
    // The first pro is the one-line "why you'd buy it" the page prints. The
    // app shows all three; a crawler gets the headline. The first con is the
    // matching "why you might not", which a comparison page needs to be worth
    // reading - a page that only lists upsides for both games decides nothing.
    pro: (g.pros && g.pros[0]) || '',
    con: (g.cons && g.cons[0]) || '',
    // Tags and player count drive which games are offered as head-to-heads
    // (see comparePartners) - genre alone is too fine-grained here, with 50
    // genres across 100 games and 20 of them held by a single title.
    tags: g.tags || [],
    maxPlayers: g.maxPlayers || 1,
    stores: g.stores || [],
  }));
}

async function loadCatalog(context, url) {
  if (GAMES.length) return GAMES;
  try {
    const req = new Request(new URL('/games.json', url.origin).toString());
    // ASSETS serves the file without re-entering this middleware; the plain
    // fetch fallback would come back through it, which is harmless (JSON is
    // returned untouched) but pointless.
    const res = context.env && context.env.ASSETS
      ? await context.env.ASSETS.fetch(req)
      : await fetch(req);
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      GAMES = trim(data);
      BY_ID = new Map(GAMES.map((g) => [g.id, g]));
    }
    return GAMES;
  } catch (e) {
    // Never throw out of here: no catalog just means no injection, which is
    // the behaviour this site had before the middleware existed.
    return [];
  }
}

/* The YouTube Shorts, from ../video.json — the same file the app reads, so the
   page and the VideoObject markup cannot advertise different videos. An episode
   with no id (or no file at all) means no block and no markup: an unpublished
   video simply does not exist as far as this page is concerned.

   `episodes` is newest-first. VIDEO is the newest published one (the featured
   card); ARCHIVE is the rest, which get a text link each and their own
   VideoObject — the reason the file became a list on 2026-08-21 is that every
   week used to overwrite the previous episode off the site entirely.
   The old flat single-episode shape is still read, so rolling back only
   video.json cannot blank the section. */
let VIDEO = null;
let ARCHIVE = [];
let videoChecked = false;

async function loadVideo(context, url) {
  if (videoChecked) return VIDEO;
  videoChecked = true;
  try {
    const req = new Request(new URL('/video.json', url.origin).toString());
    const res = context.env && context.env.ASSETS
      ? await context.env.ASSETS.fetch(req)
      : await fetch(req);
    if (!res.ok) return null;
    const v = await res.json();
    const list = Array.isArray(v && v.episodes) ? v.episodes : (v && v.id ? [v] : []);
    const live = list
      .filter((e) => e && e.id)
      .map((e) => ({ ...e, channelUrl: e.channelUrl || (v && v.channelUrl) }));
    VIDEO = live[0] || null;
    ARCHIVE = live.slice(1);
  } catch (e) {
    VIDEO = null;
    ARCHIVE = [];
  }
  return VIDEO;
}

// ISO 8601 duration, which is what schema.org wants — PT58S, not "58".
const isoDuration = (s) => `PT${Math.max(1, Math.round(Number(s) || 0))}S`;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const steamUrl = (appId) => `https://store.steampowered.com/app/${appId}/`;
const gamePath = (id) => `${SITE}/game/${id}`;

/* ------------------------------ SHARE CARDS ------------------------------- */
// WHY: index.html declares twitter:card=summary_large_image and, until now, no
// og:image, so every link to this site posted anywhere rendered as a bare grey
// box. The static card in index.html covers the app itself; a page about ONE
// game can do better than a generic card, and Steam already hosts the art.
//
// header.jpg is 460x215 and exists for every store app (checked against all
// 100 AppIDs in the catalog) - capsule art does not. It is hotlinked rather
// than proxied on purpose: it is fetched by link scrapers, not by visitors, so
// it costs us no bandwidth, and it is the same "art identifies the product"
// posture as the store badges. If it ever 404s the scraper falls back to
// nothing and the card degrades to text, which is where we started.
const OG = { image: `${SITE}/og-image.png`, width: '1200', height: '630',
  alt: 'LazyComparo - compare PC game prices across Steam, Epic and GOG' };
const headerImage = (appId) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
const gameCard = (g) => ({
  image: headerImage(g.appId), width: '460', height: '215',
  alt: `${g.title} store artwork`,
});

// Up to 4 related games: same genre first, then fill from neighbours.
function relatedGames(game) {
  const sameGenre = GAMES.filter((g) => g.id !== game.id && g.genre === game.genre);
  const others = GAMES.filter((g) => g.id !== game.id && g.genre !== game.genre);
  return [...sameGenre, ...others].slice(0, 4);
}

/* ----------------------------- LIVE PRICE DATA ---------------------------- */
// WHY: the pre-render used to carry only the static USD reference MSRP, so a
// page titled "Cheapest price for X on PC" answered that query with no price
// in the crawlable HTML at all. These helpers pull the same /api/deals feed
// the React app uses and render real numbers into the pre-rendered markup.
//
// EVERY caller must survive an empty result. If ITAD_API_KEY is unset, ITAD is
// down, or we blow the timeout, we fall back to the editorial availability map
// below and simply omit the numbers — a page without prices still beats a page
// that 500s or hangs.

// Which non-Steam stores sell each game — a `stores` field on the game itself
// in games.json, no longer a second map to keep in step. Used only when live
// pricing is unavailable: it still lets us answer "is this on GOG?" (the query
// shape Search Console shows us actually ranking for) without any live call.
const sellsOn = (g, store) => store === 'Steam' || g.stores.includes(store);

// A single-game page needs one cheap lookup; a hub page needs the whole
// catalog. Budget the wait accordingly — a crawler that times out sees the
// no-price fallback, which is still valid HTML.
const DEALS_TIMEOUT_MS = { game: 1500, hub: 3500 };
const DEALS_CHUNK = 40; // must not exceed MAX_IDS in api/deals.js

// Same-origin call into our own /api/deals. That endpoint already edge-caches
// for 30 min, so this is usually a cache read rather than an ITAD round-trip.
// Returns {} — never throws — so the render path has exactly one shape to
// handle whether or not live data arrived.
//
// `country` is passed explicitly rather than left to /api/deals' own
// geolocation: this is a Worker-to-Worker subrequest, and the visitor's
// country is something we already know for certain here.
async function fetchDeals(origin, appIds, budgetMs, country) {
  const ids = [...new Set(appIds.filter(Boolean).map(String))];
  if (!ids.length) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const chunks = [];
    for (let i = 0; i < ids.length; i += DEALS_CHUNK) chunks.push(ids.slice(i, i + DEALS_CHUNK));

    const parts = await Promise.all(chunks.map(async (chunk) => {
      const res = await fetch(`${origin}/api/deals?ids=${chunk.join(',')}&cc=${country}`, { signal: controller.signal });
      if (!res.ok) return {};
      const data = await res.json();
      return (data && data.games) || {};
    }));
    return Object.assign({}, ...parts);
  } catch (e) {
    return {}; // aborted, non-JSON, ITAD 503 — all mean "render without prices"
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------- PRICE PRESENTATION --------------------------- */

/* Everything here takes the visitor's `region` — see the note at the top of
   the file about why it is an argument and not a module-scope global. */

// `approx` marks an FX-converted amount (see the toRegion note in
// api/deals.js). It renders as "~US$12.34" so the page never presents an
// estimate as exact. A listing with no currency of its own is the region's.
function money(store, region) {
  return formatMoney(Number(store.price), store.currency || region.currency, store.approx);
}

// A bare symbol, for the deltas ("US$4.20 less than Steam") that are not a
// price in their own right.
const sym = (currency, region) => symbolFor(currency || region.currency);

// A difference between two amounts in the same currency, formatted like one.
const diffAmount = (n, currency, region) =>
  `${sym(currency, region)}${Math.abs(n).toFixed(decimalsFor(currency || region.currency))}`;

/* The catalog's own price (games.json, in SGD) rendered for this visitor. It
   is only ever the fallback for a missing live feed, so it is converted at the
   live FX rate and marked approximate — a reference figure, never quoted as
   what the store will charge. When there was no rate to convert with,
   resolveRegion() has already fallen the display back to SGD, so this stays
   an honest Singapore price rather than a relabelled one. */
function refAmount(g, region) {
  return region.rate && region.rate !== 1
    ? { price: round2(g.price * region.rate), currency: region.currency, approx: true }
    : { price: g.price, currency: BASE_CURRENCY, approx: false };
}
const refPrice = (g, region) => money(refAmount(g, region), region);

const dealFor = (deal, g) => (deal && g.appId && deal[String(g.appId)]) || null;

// /api/deals normalises everything to the visitor's currency, but if its FX
// step fails prices can arrive in mixed currencies — and picking a "cheapest"
// across currencies would be plainly wrong. So compare only within the
// currency most stores quote. Unpriced-currency listings group together rather
// than being assumed into anyone's currency.
function comparableStores(entry) {
  const stores = (entry && entry.stores) || [];
  if (stores.length < 2) return stores;
  const currencyOf = (s) => s.currency || '';
  const tally = {};
  stores.forEach((s) => { tally[currencyOf(s)] = (tally[currencyOf(s)] || 0) + 1; });
  const dominant = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  return stores.filter((s) => currencyOf(s) === dominant);
}

function cheapestStore(entry) {
  const stores = comparableStores(entry).filter((s) => typeof s.price === 'number');
  if (!stores.length) return null;
  return stores.reduce((best, s) => (s.price < best.price ? s : best));
}

// True when the cheapest current price has met or beaten the all-time low.
// Only meaningful within a single currency, hence the guard.
function atAllTimeLow(entry) {
  const low = entry && entry.historyLow;
  const best = cheapestStore(entry);
  if (!low || !best || typeof low.price !== 'number') return false;
  if ((low.currency || '') !== (best.currency || '')) return false;
  return best.price <= low.price + 0.005;
}

/* -------------------------------- HOMEPAGE -------------------------------- */

/* The crawlable half of the video section. The app renders a click-to-load
   facade; this is what a crawler (or a JS-less visitor) gets — a real link to
   the video and the picks named in text, which is also what makes the
   VideoObject markup below match visible content rather than assert something
   the page does not say. */
function videoHtml() {
  if (!VIDEO) return '';
  const picks = (VIDEO.picks || []).map((p) => `<li>${esc(p)}</li>`).join('');
  return `
      <h2>This week on YouTube</h2>
      <p><a href="https://www.youtube.com/watch?v=${esc(VIDEO.id)}">${esc(VIDEO.title)}</a>${
        VIDEO.published ? ` — filmed ${esc(VIDEO.published)}` : ''
      }. ${esc(VIDEO.blurb || '')}</p>
      ${picks ? `<ul>${picks}</ul>` : ''}
      <p>Prices quoted in the video are a snapshot of that day; the comparison on this page is live.
      <a href="${esc(VIDEO.channelUrl || 'https://www.youtube.com/@LazyComparo')}">More on the LazyComparo channel</a>.</p>
      ${ARCHIVE.length ? `<h3>Earlier episodes</h3><ul>${ARCHIVE.map((e) => `
      <li><a href="https://www.youtube.com/watch?v=${esc(e.id)}">${esc(e.title)}</a>${
        e.published ? ` — ${esc(e.published)}` : ''
      }${(e.picks || []).length ? `: ${esc((e.picks || []).join(', '))}` : ''}</li>`).join('')}</ul>` : ''}`;
}

function homeHtml(region) {
  const cards = GAMES.map((g) => `
    <article>
      <h2><a href="${gamePath(g.id)}">${esc(g.title)}</a></h2>
      <p>${esc(g.genre)} by ${esc(g.studio)} (${g.year}). ${esc(g.players)}.
      ${g.rating}% positive Steam reviews, about ${g.hours} hours to beat.
      Reference price from ${refPrice(g, region)} — compare live Steam, Epic and GOG prices and the all-time-low.</p>
      <p>${esc(g.pro)}</p>
      <p><a href="${gamePath(g.id)}">Compare ${esc(g.title)} prices &rarr;</a></p>
    </article>`).join('');

  return `
    <header>
      <h1>Compare PC Game Prices Across Steam, Epic &amp; GOG</h1>
      <p>LazyComparo tracks live prices, review scores, hours-to-beat and co-op support for ${GAMES.length}+ popular PC games,
      shows which store (Steam, Epic or GOG) is cheapest right now, flags the all-time-low price, and lists this week's
      free Epic Games Store titles. We do the boring price comparison so you don't have to.</p>
    </header>
    <main>
      <h2>Price guides</h2>
      <ul>
        <li><a href="${SITE}/gog">PC games on GOG — where GOG beats Steam right now</a></li>
        <li><a href="${SITE}/deals/all-time-low">PC games at their all-time low price right now</a></li>
      </ul>

      <h2>Head to head</h2>
      <ul>${topPairsHtml()}</ul>
      ${videoHtml()}

      <h2>Games we compare</h2>
      ${cards}
    </main>
    <footer>
      <p>Loading the interactive comparison&hellip; if it doesn't appear, enable JavaScript.</p>
      <p>No ads, no affiliate links, no paid placement.
      <a href="https://lazycomparo.com/how-we-rank">How we rank</a> &middot;
      <a href="https://lazycomparo.com/about">About LazyComparo</a> &middot;
      <a href="https://lazycomparo.com/privacy">Privacy &amp; terms</a></p>
    </footer>`;
}

function homeJsonLd(region) {
  const items = GAMES.map((g, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: gamePath(g.id),
    item: {
      '@type': 'VideoGame',
      name: g.title,
      genre: g.genre,
      gamePlatform: 'PC',
      operatingSystem: 'Windows',
      datePublished: String(g.year),
      author: { '@type': 'Organization', name: g.studio },
      // Amount and currency come from one place, so the markup cannot claim
      // an SGD number is USD — which is exactly what it used to do.
      offers: (() => {
        const ref = refAmount(g, region);
        return {
          '@type': 'Offer',
          price: ref.price.toFixed(decimalsFor(ref.currency)),
          priceCurrency: ref.currency,
          availability: 'https://schema.org/InStock',
          url: gamePath(g.id),
        };
      })(),
    },
  }));
  const list = {
    '@type': 'ItemList',
    name: 'PC games compared on LazyComparo',
    itemListElement: items,
  };
  // VideoObject only for episodes that are actually published. contentUrl is
  // deliberately absent — we host no video file; embedUrl is the -nocookie
  // host the page itself uses. Every episode in the graph is also named in the
  // markup above, archive included, so nothing here asserts content the page
  // does not show.
  const videoObject = (v) => ({
    '@type': 'VideoObject',
    name: v.title,
    description: v.blurb || v.title,
    uploadDate: v.published,
    duration: isoDuration(v.durationSeconds),
    thumbnailUrl: `${SITE}${v.poster || '/video-poster.jpg'}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}`,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    publisher: { '@type': 'Organization', name: 'LazyComparo', url: 'https://lazycomparo.com' },
  });
  const video = VIDEO ? [VIDEO, ...ARCHIVE].map(videoObject) : [];
  const graph = { '@context': 'https://schema.org', '@graph': [list, ...video] };
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/* ------------------------------ GAME LANDING ------------------------------ */

// The first sentence on the page, and the shape of query Search Console shows
// us actually ranking for ("<game> gog", "gog <game>"). Answer it outright
// rather than making the reader hunt for it — with live numbers when we have
// them, and availability-only phrasing when we don't.
function gogAnswer(g, entry, region) {
  const stores = comparableStores(entry);
  const gog = stores.find((s) => s.store === 'GOG');
  const steam = stores.find((s) => s.store === 'Steam');

  if (gog) {
    const price = money(gog, region);
    const cut = gog.cut ? ` (${gog.cut}% off)` : '';
    if (steam && typeof steam.price === 'number') {
      const diff = round2(steam.price - gog.price);
      if (diff > 0) {
        return `<strong>Yes — ${esc(g.title)} is on GOG, and right now GOG is the cheaper option at ${price}${cut},
          ${diffAmount(diff, gog.currency, region)} less than Steam.</strong> GOG sells it DRM-free.`;
      }
      if (diff < 0) {
        return `<strong>Yes — ${esc(g.title)} is on GOG at ${price}${cut}, but Steam is cheaper today at
          ${money(steam, region)}.</strong> GOG's copy is DRM-free, which may still be worth
          ${diffAmount(diff, gog.currency, region)} to you.`;
      }
      return `<strong>Yes — ${esc(g.title)} is on GOG at ${price}${cut}, exactly matching Steam.</strong>
        GOG's copy is DRM-free, so at an identical price it is the better buy.`;
    }
    return `<strong>Yes — ${esc(g.title)} is on GOG, DRM-free, at ${price}${cut}.</strong>`;
  }

  // No live GOG listing. Distinguish "we know it isn't sold there" from
  // "we couldn't reach the price feed" — those are different claims.
  if (sellsOn(g, 'GOG')) {
    return `<strong>Yes — ${esc(g.title)} is sold DRM-free on GOG as well as Steam.</strong>
      Live GOG, Steam and Epic pricing is in the table below.`;
  }
  const others = g.stores.filter((s) => s !== 'GOG');
  const alsoOn = others.length ? ` It's on Steam and ${others.join(' and ')}` : ` It's a Steam exclusive on PC`;
  return `<strong>No — ${esc(g.title)} is not listed on GOG.</strong>${alsoOn}, so DRM-free is not an option
    for this one; the cheapest current listing is below.`;
}

// One-line buying verdict. This is the sentence a reader actually came for.
function verdictHtml(g, entry, region) {
  const best = cheapestStore(entry);
  if (!best) return '';
  const low = entry.historyLow;
  const lowSame = low && typeof low.price === 'number' && (low.currency || '') === (best.currency || '');

  if (atAllTimeLow(entry)) {
    return `<p><strong>Buy now:</strong> at ${money(best, region)} on ${esc(best.store)}, ${esc(g.title)} is at its
      lowest price ever recorded. It has never been cheaper than this.</p>`;
  }
  if (lowSame) {
    const gap = round2(best.price - low.price);
    // "Close enough to the record" is a judgement about money, so the
    // threshold moves with the currency instead of reading 2 yen as 2 dollars.
    const near = region.rate ? 2 * region.rate : 2;
    return `<p><strong>Verdict:</strong> cheapest right now is ${money(best, region)} on ${esc(best.store)} —
      ${diffAmount(gap, best.currency, region)} above its all-time low of
      ${money({ price: low.price, currency: low.currency }, region)}${low.shop ? ` on ${esc(low.shop)}` : ''}.
      ${gap <= near ? 'That is close enough to the record that waiting rarely pays.' : 'Deeper discounts have happened before, so there is room to wait.'}</p>`;
  }
  return `<p><strong>Verdict:</strong> cheapest right now is ${money(best, region)} on ${esc(best.store)}.</p>`;
}

function priceTableHtml(g, entry, region) {
  // Deliberately the comparable subset, not entry.stores: the verdict and the
  // JSON-LD offers are both built from this same list, so a listing we can't
  // price-compare is omitted everywhere rather than shown in one place and
  // missing from the other.
  const stores = comparableStores(entry).filter((s) => typeof s.price === 'number');
  if (!stores.length) {
    // No live feed. Say what we do know rather than inventing a number.
    const list = ['Steam', ...g.stores];
    return `<p>${esc(g.title)} is sold on ${list.join(', ')}. Live ${esc(region.name)} pricing for each store loads on
      this page; the reference price is about ${refPrice(g, region)}.</p>`;
  }

  const best = cheapestStore(entry);
  const rows = stores.map((s) => {
    const isBest = best && s.store === best.store && s.price === best.price;
    return `<tr>
        <th scope="row">${esc(s.store)}${isBest ? ' — cheapest' : ''}</th>
        <td>${money(s, region)}</td>
        <td>${s.cut ? `${s.cut}% off` : 'full price'}</td>
        <td>${s.regular ? `was ${money({ price: s.regular, currency: s.currency, approx: s.approx }, region)}` : ''}</td>
      </tr>`;
  }).join('');

  return `
    <table>
      <caption>Live ${esc(g.title)} prices, ${esc(region.name)} store pricing</caption>
      <thead><tr><th scope="col">Store</th><th scope="col">Price now</th><th scope="col">Discount</th><th scope="col">Was</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function gameMeta(g, entry, region) {
  const best = cheapestStore(entry);
  const low = entry && entry.historyLow;
  const priceBit = best
    ? `Cheapest now ${money(best, region)} on ${best.store}${best.cut ? ` (${best.cut}% off)` : ''}.` +
      (low && typeof low.price === 'number' ? ` All-time low ${money({ price: low.price, currency: low.currency }, region)}.` : '')
    : 'Compare live prices and see the all-time-low.';

  return {
    title: `Cheapest price for ${g.title} on PC — Steam vs Epic vs GOG | LazyComparo`,
    description: `Is ${g.title} cheaper on Steam, Epic or GOG? ${priceBit} ${g.rating}% positive, about ${g.hours}h to beat.`,
    canonical: gamePath(g.id),
    // A page about one game shares as that game, not as the site.
    card: gameCard(g),
  };
}

function gameHtml(g, entry, region) {
  const related = relatedGames(g).map((r) =>
    `<li><a href="${gamePath(r.id)}">${esc(r.title)}</a> — ${esc(r.genre)}</li>`).join('');

  /* The head-to-head links. These are the ONLY internal links into
     /compare/<a>-vs-<b>, so without them those pages exist but are orphans:
     in the sitemap, linked from nowhere, which is the profile of a page Google
     crawls once and drops. Same function the sitemap is built from, so the two
     can never advertise different pairs. */
  const versus = comparePartners(g).map((p) =>
    `<li><a href="${comparePath(g, p)}">${esc(g.title)} vs ${esc(p.title)}</a></li>`).join('');

  return `
    <nav aria-label="Breadcrumb"><a href="${SITE}/">All games</a> &rsaquo; <span>${esc(g.title)}</span></nav>
    <main>
      <h1>Cheapest price for ${esc(g.title)} on PC</h1>
      <p>${gogAnswer(g, entry, region)}</p>

      <h2>Where to buy ${esc(g.title)} cheapest</h2>
      ${priceTableHtml(g, entry, region)}
      ${verdictHtml(g, entry, region)}
      <p><a href="${steamUrl(g.appId)}" rel="nofollow">View ${esc(g.title)} on Steam</a></p>

      <h2>About ${esc(g.title)}</h2>
      <p>${esc(g.title)} is a ${esc(g.genre)} by ${esc(g.studio)}, released ${g.year}. ${esc(g.players)}.
      It holds a ${g.rating}% positive rating on Steam and takes about ${g.hours} hours to beat.</p>
      <p>${esc(g.pro)}</p>

      ${versus ? `<h2>${esc(g.title)} head to head</h2><ul>${versus}</ul>` : ''}

      <h2>Similar games to compare</h2>
      <ul>${related}</ul>

      <p><a href="${SITE}/gog">Every game we track that's on GOG</a> &middot;
         <a href="${SITE}/deals/all-time-low">Games at their all-time low right now</a> &middot;
         <a href="${SITE}/">Browse all ${GAMES.length} PC games</a></p>

      <h2>How this comparison is made</h2>
      <p>Prices come straight from the stores' own feeds, in ${esc(region.currency)} for
      ${esc(region.name)}, and are cached for about 30 minutes;
      hours-to-beat and the pros/cons are our editorial estimates.
      No ads, no affiliate links and no paid placement &mdash; a store link earns us nothing.
      <a href="https://lazycomparo.com/how-we-rank">Every weight and threshold we use is published</a>.</p>
    </main>`;
}

// Prices refresh well inside a day; claiming longer would be a promise the
// feed doesn't keep.
function priceValidUntil() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// Live cross-store pricing as AggregateOffer — this is what makes the page
// eligible for price-rich results, and it is built from the SAME numbers
// rendered in priceTableHtml() so the markup can never contradict the page.
// Falls back to the catalog reference price only when no live data arrived.
function offersFor(g, entry, region) {
  const stores = comparableStores(entry).filter((s) => typeof s.price === 'number');
  if (!stores.length) {
    const ref = refAmount(g, region);
    return {
      '@type': 'Offer',
      price: ref.price.toFixed(decimalsFor(ref.currency)),
      priceCurrency: ref.currency,
      availability: 'https://schema.org/InStock',
      url: steamUrl(g.appId),
    };
  }

  const currency = stores[0].currency || region.currency;
  const d = decimalsFor(currency);
  const amounts = stores.map((s) => s.price);
  const until = priceValidUntil();

  return {
    '@type': 'AggregateOffer',
    priceCurrency: currency,
    lowPrice: Math.min(...amounts).toFixed(d),
    highPrice: Math.max(...amounts).toFixed(d),
    offerCount: stores.length,
    offers: stores.map((s) => ({
      '@type': 'Offer',
      price: s.price.toFixed(d),
      priceCurrency: s.currency || region.currency,
      availability: 'https://schema.org/InStock',
      priceValidUntil: until,
      url: s.url || (s.store === 'Steam' ? steamUrl(g.appId) : gamePath(g.id)),
      seller: { '@type': 'Organization', name: s.store },
    })),
  };
}

function gameJsonLd(g, entry, region) {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        // Multi-typed: VideoGame describes what it is, Product is what makes
        // the aggregated pricing eligible for rich results on a comparison page.
        '@type': ['VideoGame', 'Product'],
        name: g.title,
        genre: g.genre,
        gamePlatform: 'PC',
        operatingSystem: 'Windows',
        datePublished: String(g.year),
        author: { '@type': 'Organization', name: g.studio },
        publisher: { '@type': 'Organization', name: g.studio },
        brand: { '@type': 'Organization', name: g.studio },
        url: gamePath(g.id),
        offers: offersFor(g, entry, region),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'All games', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: g.title, item: gamePath(g.id) },
        ],
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/* ----------------------------- COMPARE PAGES ------------------------------ */
// WHY THESE EXIST: "<game A> vs <game B>" is the highest-intent query shape a
// comparison site can answer, and this one had no page for it. Compare was
// reachable only as `#compare=a,b` - a fragment, which never reaches the
// server, so the middleware could not pre-render it, Google folded every
// shared link back into the homepage, and a link pasted into Discord showed
// the generic site card instead of the two games in it.
//
// The route is /compare/<a>-vs-<b>, served through the same SPA rewrite as
// /game/<slug> (see games/_redirects). Any valid pair renders on request, so
// a shared link always works; only the CURATED pairs below go in the sitemap,
// because 100 games make 4,950 combinations and shipping all of them would be
// a doorway-page farm rather than a set of pages anyone wants.
//
// Ordering is canonical (ids sorted), enforced by a 301 in onRequest, so
// a-vs-b and b-vs-a can never both be indexed.

const comparePairSlug = (a, b) => (a.id < b.id ? `${a.id}-vs-${b.id}` : `${b.id}-vs-${a.id}`);
const comparePath = (a, b) => `${SITE}/compare/${comparePairSlug(a, b)}`;

/* Ids contain hyphens ("black-myth-wukong"), so the separator is ambiguous in
   principle. Rather than ban "-vs-" from ids, try every split and accept the
   one where BOTH halves are real games. Unknown pairs return null and fall
   through to the homepage pre-render, which is what an unknown /game/<slug>
   already does. */
function parseComparePair(slug) {
  const parts = decodeURIComponent(slug).split('-vs-');
  if (parts.length < 2) return null;
  for (let i = 1; i < parts.length; i++) {
    const a = BY_ID.get(parts.slice(0, i).join('-vs-'));
    const b = BY_ID.get(parts.slice(i).join('-vs-'));
    if (a && b && a.id !== b.id) return [a, b];
  }
  return null;
}

/* Which two games are worth putting head-to-head. Genre alone is too
   fine-grained - the catalog holds ~50 genres across 100 games and 20 of them
   belong to a single title - so tags carry most of the weight, with a bonus
   for games on the same shelf price-wise and for both being (or not being)
   co-op. The threshold is what keeps the sitemap honest: a pair that clears it
   shares a genre, or two tags, and is a comparison a buyer might actually be
   choosing between. */
const COMPARE_PARTNERS = 3;   // per game -> a couple of hundred pairs, not 4,950
const COMPARE_MIN_SCORE = 4;

function similarity(a, b) {
  let score = a.genre === b.genre ? 4 : 0;
  const mine = new Set((a.tags || []).map((t) => String(t).toLowerCase()));
  score += 2 * (b.tags || []).filter((t) => mine.has(String(t).toLowerCase())).length;
  if ((a.maxPlayers > 1) === (b.maxPlayers > 1)) score += 1;
  const hi = Math.max(a.price, b.price) || 1;
  if (Math.abs(a.price - b.price) / hi <= 0.3) score += 1;
  return score;
}

// Deterministic: score, then rating, then id. The sitemap and the on-page
// links are both built from this, so an unstable sort would advertise pairs
// that no page links to.
function comparePartners(game) {
  return GAMES
    .filter((g) => g.id !== game.id)
    .map((g) => ({ g, score: similarity(game, g) }))
    .filter((x) => x.score >= COMPARE_MIN_SCORE)
    .sort((x, y) => y.score - x.score || y.g.rating - x.g.rating || (x.g.id < y.g.id ? -1 : 1))
    .slice(0, COMPARE_PARTNERS)
    .map((x) => x.g);
}

function comparePairs() {
  const seen = new Set();
  const out = [];
  GAMES.forEach((g) => comparePartners(g).forEach((p) => {
    const [x, y] = g.id < p.id ? [g, p] : [p, g];
    const key = `${x.id}-vs-${y.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([x, y]);
  }));
  return out;
}

/* The homepage is the most-crawled page on the site, so it seeds the crawl
   into the head-to-heads instead of leaving them to the sitemap and the game
   pages alone. Strongest matches first, tie-broken by how well-reviewed the
   pair is, so the list reads like comparisons people actually run. */
function topPairs(n) {
  return comparePairs()
    .map(([a, b]) => ({ a, b, score: similarity(a, b), rating: a.rating + b.rating }))
    .sort((x, y) => y.score - x.score || y.rating - x.rating)
    .slice(0, n);
}

function topPairsHtml() {
  return topPairs(8).map(({ a, b }) =>
    `<li><a href="${comparePath(a, b)}">${esc(a.title)} vs ${esc(b.title)}</a> — ${esc(a.genre)} vs ${esc(b.genre)}</li>`).join('');
}

/* The one number every row of this page hangs off: what this game costs the
   visitor right now. Live cheapest listing when we have one, the catalog's
   FX-converted reference price when we don't - `live` says which, so the page
   can hedge its wording instead of quoting a fallback as a live price. */
function bestAmount(g, entry, region) {
  const best = cheapestStore(entry);
  if (best) {
    return { price: best.price, currency: best.currency || region.currency,
      approx: best.approx, store: best.store, live: true };
  }
  const ref = refAmount(g, region);
  return { ...ref, store: 'Steam', live: false };
}

// Cost per hour of playtime - the site's whole thesis, and the row that most
// often disagrees with the price row.
const perHour = (amount, g) => amount.price / Math.max(1, g.hours);
const perHourText = (amount, g, region) =>
  `${sym(amount.currency, region)}${perHour(amount, g).toFixed(2)}/h`;

// Only meaningful within one currency: /api/deals normalises, but if its FX
// step failed the two games can arrive quoted differently, and "cheaper"
// across currencies is not a claim we can make.
const sameCurrency = (x, y) => (x.currency || '') === (y.currency || '');

function compareVerdict(a, b, amtA, amtB, entryA, entryB, region) {
  const parts = [];
  // Without a live feed these are the catalog's reference prices, so the
  // sentence hedges instead of quoting a fallback as today's price. Not when
  // the amount is already marked approximate — money() prefixes those with
  // "~", and "about ~US$10.73" hedges the same thing twice.
  const at = (amt) => `${amt.live || amt.approx ? '' : 'about '}${money(amt, region)}`;

  if (sameCurrency(amtA, amtB) && amtA.price !== amtB.price) {
    const [cheap, dear] = amtA.price < amtB.price ? [[a, amtA], [b, amtB]] : [[b, amtB], [a, amtA]];
    const gap = round2(dear[1].price - cheap[1].price);
    parts.push(`<strong>${esc(cheap[0].title)} is the cheaper of the two right now</strong> at
      ${at(cheap[1])}${cheap[1].live ? ` on ${esc(cheap[1].store)}` : ''},
      ${diffAmount(gap, cheap[1].currency, region)} less than ${esc(dear[0].title)}.`);
  } else if (sameCurrency(amtA, amtB)) {
    parts.push(`<strong>${esc(a.title)} and ${esc(b.title)} cost the same today</strong> at
      ${at(amtA)} each, so price is not the deciding factor.`);
  } else {
    parts.push(`<strong>${esc(a.title)} is ${at(amtA)} and ${esc(b.title)} is
      ${at(amtB)}</strong>.`);
  }

  // Value can, and often does, contradict the price row - that contradiction
  // is the reason to read this page rather than the store.
  if (sameCurrency(amtA, amtB)) {
    const vA = perHour(amtA, a);
    const vB = perHour(amtB, b);
    const [good, bad] = vA < vB ? [[a, amtA], [b, amtB]] : [[b, amtB], [a, amtA]];
    const cheaper = amtA.price <= amtB.price ? a : b;
    // "also" only makes sense when one of them was already the cheaper buy;
    // at an identical price nothing has been claimed yet.
    const lead = amtA.price === amtB.price
      ? `Per hour played they are not equal: ${esc(good[0].title)} costs`
      : good[0].id === cheaper.id
        ? `On playtime it is also the better value: ${esc(good[0].title)} costs`
        : `Per hour played the cheaper one loses: ${esc(good[0].title)} costs`;
    parts.push(`${lead} ${perHourText(good[1], good[0], region)} against
      ${perHourText(bad[1], bad[0], region)} for ${esc(bad[0].title)} —
      ${good[0].hours}h to beat versus ${bad[0].hours}h.`);
  }

  const better = a.rating === b.rating ? null : (a.rating > b.rating ? a : b);
  if (better) {
    const other = better.id === a.id ? b : a;
    parts.push(`Steam players rate ${esc(better.title)} higher: ${better.rating}% positive against
      ${other.rating}%.`);
  }

  [[a, entryA], [b, entryB]].forEach(([g, entry]) => {
    if (atAllTimeLow(entry)) parts.push(`${esc(g.title)} is at its lowest price ever recorded today.`);
  });

  return `<p>${parts.join(' ')}</p>`;
}

// Metric | A | B, built from the same amounts as the verdict above so the two
// can never disagree.
function compareTableHtml(a, b, amtA, amtB, entryA, entryB, region) {
  const lowOf = (entry) => {
    const low = entry && entry.historyLow;
    if (!low || typeof low.price !== 'number') return 'not recorded';
    return `${money({ price: low.price, currency: low.currency }, region)}${low.shop ? ` on ${esc(low.shop)}` : ''}`;
  };
  const priceOf = (amt) => amt.live
    ? `${money(amt, region)} on ${esc(amt.store)}`
    : `${amt.approx ? '' : 'about '}${money(amt, region)}`;
  const storesOf = (g, entry) => {
    const live = comparableStores(entry).map((s) => s.store);
    const list = live.length ? live : ['Steam', ...g.stores];
    return [...new Set(list)].join(', ');
  };

  const rows = [
    ['Price now', priceOf(amtA), priceOf(amtB)],
    ['All-time low', lowOf(entryA), lowOf(entryB)],
    ['Steam rating', `${a.rating}% positive`, `${b.rating}% positive`],
    ['Hours to beat', `${a.hours}h`, `${b.hours}h`],
    ['Cost per hour', perHourText(amtA, a, region), perHourText(amtB, b, region)],
    ['Players', esc(a.players), esc(b.players)],
    ['Available on', esc(storesOf(a, entryA)), esc(storesOf(b, entryB))],
    ['Released', `${a.year}, ${esc(a.studio)}`, `${b.year}, ${esc(b.studio)}`],
  ].map(([label, x, y]) => `<tr><th scope="row">${label}</th><td>${x}</td><td>${y}</td></tr>`).join('');

  return `
    <table>
      <caption>${esc(a.title)} vs ${esc(b.title)}, ${esc(region.name)} store pricing</caption>
      <thead><tr><th scope="col">Metric</th><th scope="col">${esc(a.title)}</th><th scope="col">${esc(b.title)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function compareMeta(a, b, amtA, amtB, region) {
  const priceBit = sameCurrency(amtA, amtB)
    ? `${money(amtA, region)} vs ${money(amtB, region)} right now.`
    : 'Live prices for both, side by side.';
  return {
    title: `${a.title} vs ${b.title} — which is the better buy? | LazyComparo`,
    description: `${a.title} or ${b.title}? ${priceBit} Cost per hour, Steam rating, hours to beat and which store is cheapest, across Steam, Epic and GOG.`,
    canonical: comparePath(a, b),
    // One of the two games, not the generic card: a share of this link should
    // show a game. The left column wins, and canonical ordering decides which
    // that is, so one URL always produces one card.
    card: gameCard(a),
  };
}

function compareHtml(a, b, entryA, entryB, region) {
  const amtA = bestAmount(a, entryA, region);
  const amtB = bestAmount(b, entryB, region);

  // Other head-to-heads either game is in - the internal links that make these
  // pages discoverable at all, since nothing else on the site links a pair.
  const others = [];
  const seen = new Set([comparePath(a, b)]);
  [a, b].forEach((g) => comparePartners(g).forEach((p) => {
    const href = comparePath(g, p);
    if (seen.has(href)) return;
    seen.add(href);
    const [x, y] = g.id < p.id ? [g, p] : [p, g];
    others.push(`<li><a href="${href}">${esc(x.title)} vs ${esc(y.title)}</a></li>`);
  }));

  const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
  // Catalog pros and cons are fragments, not sentences - they carry no closing
  // punctuation, and without this the next sentence runs straight into them.
  const stop = (s) => (s && !/[.!?]$/.test(s) ? `${s}.` : s || '');

  return `
    <nav aria-label="Breadcrumb"><a href="${SITE}/">All games</a> &rsaquo;
      <a href="${gamePath(a.id)}">${esc(a.title)}</a> &rsaquo; <span>vs ${esc(b.title)}</span></nav>
    <main>
      <h1>${esc(a.title)} vs ${esc(b.title)}</h1>
      ${compareVerdict(a, b, amtA, amtB, entryA, entryB, region)}

      <h2>${esc(a.title)} vs ${esc(b.title)}, side by side</h2>
      ${compareTableHtml(a, b, amtA, amtB, entryA, entryB, region)}

      <h2>Pick ${esc(a.title)} if</h2>
      <p>${esc(stop(a.pro))} It is a ${esc(a.genre)} by ${esc(a.studio)}, ${a.year}, and takes about ${a.hours} hours.
      ${a.con ? `The catch: ${esc(stop(lower(a.con)))}` : ''}
      <a href="${gamePath(a.id)}">Full ${esc(a.title)} price breakdown</a>.</p>

      <h2>Pick ${esc(b.title)} if</h2>
      <p>${esc(stop(b.pro))} It is a ${esc(b.genre)} by ${esc(b.studio)}, ${b.year}, and takes about ${b.hours} hours.
      ${b.con ? `The catch: ${esc(stop(lower(b.con)))}` : ''}
      <a href="${gamePath(b.id)}">Full ${esc(b.title)} price breakdown</a>.</p>

      ${others.length ? `<h2>Other comparisons</h2><ul>${others.slice(0, 6).join('')}</ul>` : ''}

      <p><a href="${SITE}/deals/all-time-low">Games at their all-time low right now</a> &middot;
         <a href="${SITE}/gog">Every game we track that's on GOG</a> &middot;
         <a href="${SITE}/">Browse all ${GAMES.length} PC games</a></p>

      <h2>How this comparison is made</h2>
      <p>Prices come straight from the stores' own feeds, in ${esc(region.currency)} for
      ${esc(region.name)}, and are cached for about 30 minutes; hours-to-beat and the pros and cons
      are our editorial estimates. Cost per hour is the cheapest current price divided by
      hours-to-beat. No ads, no affiliate links and no paid placement &mdash; a store link earns us
      nothing. <a href="https://lazycomparo.com/how-we-rank">Every weight and threshold we use is published</a>.</p>
    </main>`;
}

function compareJsonLd(a, b, entryA, entryB, region) {
  const product = (g, entry) => ({
    '@type': ['VideoGame', 'Product'],
    name: g.title,
    genre: g.genre,
    gamePlatform: 'PC',
    operatingSystem: 'Windows',
    datePublished: String(g.year),
    author: { '@type': 'Organization', name: g.studio },
    publisher: { '@type': 'Organization', name: g.studio },
    brand: { '@type': 'Organization', name: g.studio },
    url: gamePath(g.id),
    offers: offersFor(g, entry, region),
  });

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: `${a.title} vs ${b.title}`,
        itemListOrder: 'https://schema.org/ItemListUnordered',
        numberOfItems: 2,
        itemListElement: [
          { '@type': 'ListItem', position: 1, item: product(a, entryA) },
          { '@type': 'ListItem', position: 2, item: product(b, entryB) },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'All games', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: a.title, item: gamePath(a.id) },
          { '@type': 'ListItem', position: 3, name: `${a.title} vs ${b.title}`, item: comparePath(a, b) },
        ],
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/* -------------------------------- SITEMAP --------------------------------- */
/* Served from here rather than as the static games/sitemap.xml because the
   compare URLs are generated, and a generated URL set cannot be kept in step
   by hand. Everything is derived from games.json, so adding a game adds its
   own page AND its head-to-heads with no second edit. The static file stays in
   the repo as the fallback: if the catalog fails to load, onRequest passes the
   request through and Pages serves that file instead. */
function sitemapXml() {
  const entry = (loc, freq, pri) =>
    `  <url><loc>${loc}</loc><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entry(`${SITE}/`, 'daily', '1.0'),
    entry(`${SITE}/gog`, 'daily', '0.9'),
    entry(`${SITE}/deals/all-time-low`, 'daily', '0.9'),
  ];
  GAMES.forEach((g) => lines.push(entry(gamePath(g.id), 'weekly', '0.8')));
  comparePairs().forEach(([x, y]) => lines.push(entry(comparePath(x, y), 'weekly', '0.7')));
  lines.push('</urlset>');
  return lines.join('\n') + '\n';
}

/* ------------------------------- HUB PAGES -------------------------------- */
// WHY THESE EXIST: /game/<slug> pages are 100+ near-identical templates, which
// is a weak indexing profile and gives nothing worth linking to. These two hubs
// are generated from data we already fetch, change every 30 minutes on their
// own, and answer a query a single game page can't ("which games are cheaper on
// GOG", "what's at its all-time low today"). They also give every game page a
// second inbound internal link.
//
// Unlike /game/<slug>, these are served from their own no-React shells
// (gog/index.html, deals/all-time-low/index.html). That's deliberate: the app
// has no route for them, so letting it boot would replace this content and make
// Google's rendered pass disagree with the pre-render.

const HUBS = {
  '/gog': 'gog',
  '/deals/all-time-low': 'atl',
};

function gogRows(deals) {
  const rows = [];
  for (const g of GAMES) {
    const entry = dealFor(deals, g);
    const stores = comparableStores(entry);
    const gog = stores.find((s) => s.store === 'GOG');
    if (!gog || typeof gog.price !== 'number') continue;
    const steam = stores.find((s) => s.store === 'Steam' && typeof s.price === 'number');
    rows.push({ g, gog, steam, saving: steam ? round2(steam.price - gog.price) : null });
  }
  // Biggest GOG saving first; unknown savings sink to the bottom.
  return rows.sort((a, b) => (b.saving === null ? -1e9 : b.saving) - (a.saving === null ? -1e9 : a.saving));
}

function atlRows(deals) {
  const rows = [];
  for (const g of GAMES) {
    const entry = dealFor(deals, g);
    if (!atAllTimeLow(entry)) continue;
    rows.push({ g, entry, best: cheapestStore(entry) });
  }
  return rows.sort((a, b) => (b.best.cut || 0) - (a.best.cut || 0));
}

function hubMeta(kind, region) {
  if (kind === 'gog') {
    return {
      title: 'PC games on GOG — live GOG vs Steam vs Epic prices | LazyComparo',
      description: 'Which PC games are on GOG, and where GOG is actually the cheapest. Live DRM-free GOG prices compared against Steam and Epic, updated every 30 minutes.',
      canonical: `${SITE}/gog`,
      crumb: 'GOG prices',
      h1: 'PC games on GOG, and when GOG is the cheaper buy',
      intro: `Every game we track that sells DRM-free on GOG, sorted by how much you save against Steam right now. Prices are ${region.name} store pricing and refresh every 30 minutes.`,
    };
  }
  return {
    title: 'PC games at their all-time low price right now | LazyComparo',
    description: 'Live list of PC games currently at the cheapest price they have ever been on Steam, Epic or GOG. Updated every 30 minutes.',
    canonical: `${SITE}/deals/all-time-low`,
    crumb: 'All-time lows',
    h1: 'PC games at their all-time low right now',
    intro: 'These games have hit or beaten the lowest price ever recorded for them across Steam, Epic and GOG. A game at its record low is a better buy than a bigger percentage off a price that has been lower before.',
  };
}

function hubHtml(kind, deals, region) {
  const meta = hubMeta(kind, region);
  const rows = kind === 'gog' ? gogRows(deals) : atlRows(deals);

  let body;
  if (!rows.length) {
    // Live feed unavailable or nothing qualifies. Still ship real content and
    // real internal links rather than an empty page.
    const known = kind === 'gog'
      ? GAMES.filter((g) => sellsOn(g, 'GOG'))
      : GAMES.slice(0, 24);
    body = `
      <p class="note">${kind === 'gog'
        ? 'Live pricing is unavailable at the moment, so savings are not shown. These are the games we track that sell on GOG:'
        : 'Nothing in the catalog is at its record low right now — that happens between sales. In the meantime, these are worth watching:'}</p>
      <ul class="plain">${known.map((g) =>
        `<li><a href="${gamePath(g.id)}">${esc(g.title)}</a> — ${esc(g.genre)}</li>`).join('')}</ul>`;
  } else if (kind === 'gog') {
    body = `
      <div class="tablewrap"><table>
        <thead><tr><th scope="col">Game</th><th scope="col">GOG</th><th scope="col">Steam</th><th scope="col">You save on GOG</th></tr></thead>
        <tbody>${rows.map(({ g, gog, steam, saving }) => `
          <tr>
            <th scope="row"><a href="${gamePath(g.id)}">${esc(g.title)}</a></th>
            <td>${money(gog, region)}${gog.cut ? ` <span class="cut">${gog.cut}% off</span>` : ''}</td>
            <td>${steam ? money(steam, region) : 'not on Steam'}</td>
            <td>${saving === null ? '—' : saving > 0
              ? `<strong class="win">${diffAmount(saving, gog.currency, region)}</strong>`
              : saving === 0 ? 'same price' : `<span class="lose">Steam is ${diffAmount(saving, gog.currency, region)} cheaper</span>`}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;
  } else {
    body = `
      <div class="tablewrap"><table>
        <thead><tr><th scope="col">Game</th><th scope="col">Cheapest now</th><th scope="col">Store</th><th scope="col">Discount</th></tr></thead>
        <tbody>${rows.map(({ g, best }) => `
          <tr>
            <th scope="row"><a href="${gamePath(g.id)}">${esc(g.title)}</a></th>
            <td><strong class="win">${money(best, region)}</strong></td>
            <td>${esc(best.store)}</td>
            <td>${best.cut ? `${best.cut}% off` : 'full price'}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;
  }

  const otherHub = kind === 'gog'
    ? `<a href="${SITE}/deals/all-time-low">Games at their all-time low right now</a>`
    : `<a href="${SITE}/gog">Every game we track that's on GOG</a>`;

  return `
    <nav aria-label="Breadcrumb"><a href="${SITE}/">LazyComparo</a> &rsaquo; <span>${esc(meta.crumb)}</span></nav>
    <main>
      <h1>${esc(meta.h1)}</h1>
      <p class="intro">${esc(meta.intro)}</p>
      ${body}
      <p class="links">${otherHub} &middot;
        <a href="${SITE}/">Browse all ${GAMES.length} PC games &rarr;</a> &middot;
        <a href="https://lazycomparo.com/how-we-rank">How we rank</a></p>
    </main>`;
}

function hubJsonLd(kind, deals, region) {
  const meta = hubMeta(kind, region);
  const rows = kind === 'gog' ? gogRows(deals) : atlRows(deals);
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: meta.h1,
    description: meta.description,
    url: meta.canonical,
    numberOfItems: rows.length,
    itemListElement: rows.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: gamePath(r.g.id),
      name: r.g.title,
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/* -------------------------------- ROUTING --------------------------------- */

/* The visitor's region, plus the SGD -> their-currency rate the catalog
   fallback needs.

   If the FX lookup fails we do NOT ship their currency with an unconverted
   rate: that would print a Singapore number under a US dollar sign, which is
   the one mistake this whole change exists to stop. Instead the DISPLAY falls
   back to SGD while the COUNTRY stays theirs — so the live store prices that
   land a moment later are still their own region's, each labeled with the
   currency it actually arrived in. */
async function resolveRegion(request, url) {
  const country = resolveCountry(request, url);
  const local = regionFor(country);
  const name = countryName(country);
  if (local.currency === BASE_CURRENCY) return { ...local, name, rate: 1 };

  const rate = await fxRate(BASE_CURRENCY, local.currency);
  if (!rate) return { ...regionFor('SG'), country, name, rate: 1 };
  return { ...local, name, rate };
}

/* Handed to the app before any of its own scripts run, so the first paint is
   already in the right currency instead of flashing SGD and settling on USD.
   The app treats a missing blob as "SGD, rate 1" — which is exactly what local
   dev (no Functions) should show. */
function regionScript(region) {
  const blob = JSON.stringify({
    country: region.country,
    currency: region.currency,
    symbol: region.symbol,
    decimals: region.decimals,
    // Multiplier from the catalog's SGD prices, so the fallback numbers the
    // app shows before the live feed lands are in the visitor's money too.
    rate: region.rate,
  }).replace(/</g, '\\u003c');
  return `<script>window.__LC_REGION=${blob};</script>`;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  /* Two things are answered BEFORE context.next(), because neither wants the
     asset Pages would serve: the generated sitemap replaces the static file,
     and a compare URL written in the wrong order is a redirect, not a page.
     Both fall through untouched if the catalog cannot be read, so the worst
     case is exactly the behaviour that shipped before compare pages existed. */
  const compareSlug = (path.match(/^\/compare\/([^/]+)$/) || [])[1];
  if (path === '/sitemap.xml' || compareSlug) {
    await loadCatalog(context, url);

    if (path === '/sitemap.xml' && GAMES.length) {
      return new Response(sitemapXml(), {
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          // Generated from a file that only changes on deploy.
          'cache-control': 'public, max-age=3600',
        },
      });
    }

    // One canonical order per pair (ids sorted), so a-vs-b and b-vs-a can
    // never both be indexed and every share of a pair lands on one URL.
    const pair = compareSlug ? parseComparePair(compareSlug) : null;
    if (pair) {
      // Built on url.origin, not SITE: a preview deployment must redirect to
      // itself rather than bouncing the visitor to production.
      const canonical = `/compare/${comparePairSlug(pair[0], pair[1])}`;
      if (path !== canonical) return Response.redirect(url.origin + canonical + url.search, 301);
    }
  }

  const response = await context.next();

  // Only rewrite the HTML document. API routes (/api/*) and other assets pass
  // straight through.
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  const region = await resolveRegion(context.request, url);

  // The region goes in first and unconditionally: the React app needs it on
  // every page, including the ones this middleware does not pre-render, and
  // including the case where the catalog fails to load below.
  const injectRegion = (res) =>
    new HTMLRewriter()
      .on('head', { element(el) { el.prepend(regionScript(region), { html: true }); } })
      .transform(res);

  // Catalog next: every branch below needs it, and without it there is nothing
  // to inject, so the page goes out as it would have pre-middleware.
  if (!(await loadCatalog(context, url)).length) return injectRegion(response);
  // Cheap and cached after the first request; only the homepage renders it,
  // but the check is here so the flag is set before any branch reads VIDEO.
  await loadVideo(context, url);

  const slugMatch = path.match(/^\/game\/([^/]+)$/);
  const game = slugMatch ? BY_ID.get(decodeURIComponent(slugMatch[1])) : null;
  const hub = HUBS[path];
  // Already canonical by the time we get here: a wrong-order pair was
  // redirected above, and an unparseable one is null and falls through to the
  // homepage pre-render, exactly as an unknown /game/<slug> does.
  const pair = compareSlug ? parseComparePair(compareSlug) : null;

  // Live prices for the pre-render. Bounded and failure-tolerant by design:
  // fetchDeals never throws and returns {} on timeout, so a slow or missing
  // ITAD feed degrades this to the old no-price markup instead of breaking
  // the page or stalling the response.
  let deals = {};
  if (game) {
    deals = await fetchDeals(url.origin, [game.appId], DEALS_TIMEOUT_MS.game, region.country);
  } else if (pair) {
    deals = await fetchDeals(url.origin, pair.map((g) => g.appId), DEALS_TIMEOUT_MS.game, region.country);
  } else if (hub) {
    deals = await fetchDeals(url.origin, GAMES.map((g) => g.appId), DEALS_TIMEOUT_MS.hub, region.country);
  }

  let rootHtml;
  let jsonLd;
  let meta = null;

  if (game) {
    const entry = dealFor(deals, game);
    rootHtml = gameHtml(game, entry, region);
    jsonLd = gameJsonLd(game, entry, region);
    meta = gameMeta(game, entry, region);
  } else if (pair) {
    const [a, b] = pair;
    const entryA = dealFor(deals, a);
    const entryB = dealFor(deals, b);
    rootHtml = compareHtml(a, b, entryA, entryB, region);
    jsonLd = compareJsonLd(a, b, entryA, entryB, region);
    meta = compareMeta(a, b, bestAmount(a, entryA, region), bestAmount(b, entryB, region), region);
  } else if (hub) {
    rootHtml = hubHtml(hub, deals, region);
    jsonLd = hubJsonLd(hub, deals, region);
    meta = hubMeta(hub, region);
  } else {
    // Includes unknown /game/<slug> -> homepage content (harmless).
    rootHtml = homeHtml(region);
    jsonLd = homeJsonLd(region);
  }

  const rewriter = new HTMLRewriter()
    .on('head', { element(el) { el.prepend(regionScript(region), { html: true }); } })
    .on('head', { element(el) { el.append(jsonLd, { html: true }); } })
    .on('#root', { element(el) { el.setInnerContent(rootHtml, { html: true }); } });

  if (meta) {
    // HTMLRewriter can only rewrite tags that are already in the document, so
    // every one of these has a placeholder in index.html (and in the two hub
    // shells) — including the four og:image lines. Deleting one there silently
    // stops that field being set here.
    const card = meta.card || OG;
    rewriter
      .on('title', { element(el) { el.setInnerContent(meta.title); } })
      .on('meta[name="description"]', { element(el) { el.setAttribute('content', meta.description); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', meta.title); } })
      .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', meta.description); } })
      .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', meta.canonical); } })
      .on('meta[property="og:image"]', { element(el) { el.setAttribute('content', card.image); } })
      .on('meta[property="og:image:width"]', { element(el) { el.setAttribute('content', card.width); } })
      .on('meta[property="og:image:height"]', { element(el) { el.setAttribute('content', card.height); } })
      .on('meta[property="og:image:alt"]', { element(el) { el.setAttribute('content', card.alt); } })
      .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', meta.canonical); } });
  }

  return rewriter.transform(response);
}
