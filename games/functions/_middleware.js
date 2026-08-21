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
// TWO ROUTES ARE HANDLED:
//   /                -> homepage: ItemList JSON-LD + a linked list of all games
//   /game/<slug>     -> per-game landing page: unique <title>/description/
//                       canonical/og, a single-game detail block, and
//                       VideoGame + BreadcrumbList JSON-LD. The slug is the
//                       game id. `games/_redirects` rewrites /game/* to the app
//                       shell so context.next() serves index.html for these.
//
// THE CATALOG IS NOT COPIED HERE ANY MORE. Until 2026-08-16 this file held a
// hand-mirrored, trimmed copy of the GAMES array in ../index.html, plus a
// second copy of the store-availability map — three edits and a pre-push check
// for one new game, and the two copies had already drifted. Both now read
// ../games.json, so adding a game is one edit to that file (plus the sitemap,
// which .claude/make-games-sitemap.ps1 generates from it).
//
// Prices in the catalog are the USD reference MSRP; the live site localizes to
// SGD at runtime and the pre-render below uses live SGD prices when /api/deals
// answers in time.
// ---------------------------------------------------------------------------

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
    // app shows all three; a crawler gets the headline.
    pro: (g.pros && g.pros[0]) || '',
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
async function fetchDeals(origin, appIds, budgetMs) {
  const ids = [...new Set(appIds.filter(Boolean).map(String))];
  if (!ids.length) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const chunks = [];
    for (let i = 0; i < ids.length; i += DEALS_CHUNK) chunks.push(ids.slice(i, i + DEALS_CHUNK));

    const parts = await Promise.all(chunks.map(async (chunk) => {
      const res = await fetch(`${origin}/api/deals?ids=${chunk.join(',')}`, { signal: controller.signal });
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

const round2 = (n) => Math.round(n * 100) / 100;
const symbolFor = (currency) => (!currency || currency === 'SGD' ? 'S$' : `${currency} `);

// `approx` marks an FX-converted amount (see the toSGD note in api/deals.js).
// It renders as "~S$12.34" so the page never presents an estimate as exact.
function money(store) {
  return `${store.approx ? '~' : ''}${symbolFor(store.currency)}${Number(store.price).toFixed(2)}`;
}

const dealFor = (deal, g) => (deal && g.appId && deal[String(g.appId)]) || null;

// /api/deals normalises everything to SGD, but if its FX step fails prices can
// arrive in mixed currencies — and picking a "cheapest" across currencies would
// be plainly wrong. So compare only within the currency most stores quote.
function comparableStores(entry) {
  const stores = (entry && entry.stores) || [];
  if (stores.length < 2) return stores;
  const currencyOf = (s) => s.currency || 'SGD';
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
  if ((low.currency || 'SGD') !== (best.currency || 'SGD')) return false;
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

function homeHtml() {
  const cards = GAMES.map((g) => `
    <article>
      <h2><a href="${gamePath(g.id)}">${esc(g.title)}</a></h2>
      <p>${esc(g.genre)} by ${esc(g.studio)} (${g.year}). ${esc(g.players)}.
      ${g.rating}% positive Steam reviews, about ${g.hours} hours to beat.
      Reference price from US$${g.price.toFixed(2)} — compare live Steam, Epic and GOG prices and the all-time-low.</p>
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

function homeJsonLd() {
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
      offers: {
        '@type': 'Offer',
        price: g.price.toFixed(2),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: gamePath(g.id),
      },
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
function gogAnswer(g, entry) {
  const stores = comparableStores(entry);
  const gog = stores.find((s) => s.store === 'GOG');
  const steam = stores.find((s) => s.store === 'Steam');

  if (gog) {
    const price = money(gog);
    const cut = gog.cut ? ` (${gog.cut}% off)` : '';
    if (steam && typeof steam.price === 'number') {
      const diff = round2(steam.price - gog.price);
      if (diff > 0) {
        return `<strong>Yes — ${esc(g.title)} is on GOG, and right now GOG is the cheaper option at ${price}${cut},
          ${symbolFor(gog.currency)}${diff.toFixed(2)} less than Steam.</strong> GOG sells it DRM-free.`;
      }
      if (diff < 0) {
        return `<strong>Yes — ${esc(g.title)} is on GOG at ${price}${cut}, but Steam is cheaper today at
          ${money(steam)}.</strong> GOG's copy is DRM-free, which may still be worth
          ${symbolFor(gog.currency)}${Math.abs(diff).toFixed(2)} to you.`;
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
function verdictHtml(g, entry) {
  const best = cheapestStore(entry);
  if (!best) return '';
  const low = entry.historyLow;
  const lowSame = low && typeof low.price === 'number' && (low.currency || 'SGD') === (best.currency || 'SGD');

  if (atAllTimeLow(entry)) {
    return `<p><strong>Buy now:</strong> at ${money(best)} on ${esc(best.store)}, ${esc(g.title)} is at its
      lowest price ever recorded. It has never been cheaper than this.</p>`;
  }
  if (lowSame) {
    const gap = round2(best.price - low.price);
    return `<p><strong>Verdict:</strong> cheapest right now is ${money(best)} on ${esc(best.store)} —
      ${symbolFor(best.currency)}${gap.toFixed(2)} above its all-time low of
      ${money({ price: low.price, currency: low.currency })}${low.shop ? ` on ${esc(low.shop)}` : ''}.
      ${gap <= 2 ? 'That is close enough to the record that waiting rarely pays.' : 'Deeper discounts have happened before, so there is room to wait.'}</p>`;
  }
  return `<p><strong>Verdict:</strong> cheapest right now is ${money(best)} on ${esc(best.store)}.</p>`;
}

function priceTableHtml(g, entry) {
  // Deliberately the comparable subset, not entry.stores: the verdict and the
  // JSON-LD offers are both built from this same list, so a listing we can't
  // price-compare is omitted everywhere rather than shown in one place and
  // missing from the other.
  const stores = comparableStores(entry).filter((s) => typeof s.price === 'number');
  if (!stores.length) {
    // No live feed. Say what we do know rather than inventing a number.
    const list = ['Steam', ...g.stores];
    return `<p>${esc(g.title)} is sold on ${list.join(', ')}. Live Singapore pricing for each store loads on this
      page; the publisher reference price is US$${g.price.toFixed(2)}.</p>`;
  }

  const best = cheapestStore(entry);
  const rows = stores.map((s) => {
    const isBest = best && s.store === best.store && s.price === best.price;
    return `<tr>
        <th scope="row">${esc(s.store)}${isBest ? ' — cheapest' : ''}</th>
        <td>${money(s)}</td>
        <td>${s.cut ? `${s.cut}% off` : 'full price'}</td>
        <td>${s.regular ? `was ${symbolFor(s.currency)}${Number(s.regular).toFixed(2)}` : ''}</td>
      </tr>`;
  }).join('');

  return `
    <table>
      <caption>Live ${esc(g.title)} prices, Singapore store pricing</caption>
      <thead><tr><th scope="col">Store</th><th scope="col">Price now</th><th scope="col">Discount</th><th scope="col">Was</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function gameMeta(g, entry) {
  const best = cheapestStore(entry);
  const low = entry && entry.historyLow;
  const priceBit = best
    ? `Cheapest now ${money(best)} on ${best.store}${best.cut ? ` (${best.cut}% off)` : ''}.` +
      (low && typeof low.price === 'number' ? ` All-time low ${money({ price: low.price, currency: low.currency })}.` : '')
    : 'Compare live prices and see the all-time-low.';

  return {
    title: `Cheapest price for ${g.title} on PC — Steam vs Epic vs GOG | LazyComparo`,
    description: `Is ${g.title} cheaper on Steam, Epic or GOG? ${priceBit} ${g.rating}% positive, about ${g.hours}h to beat.`,
    canonical: gamePath(g.id),
  };
}

function gameHtml(g, entry) {
  const related = relatedGames(g).map((r) =>
    `<li><a href="${gamePath(r.id)}">${esc(r.title)}</a> — ${esc(r.genre)}</li>`).join('');

  return `
    <nav aria-label="Breadcrumb"><a href="${SITE}/">All games</a> &rsaquo; <span>${esc(g.title)}</span></nav>
    <main>
      <h1>Cheapest price for ${esc(g.title)} on PC</h1>
      <p>${gogAnswer(g, entry)}</p>

      <h2>Where to buy ${esc(g.title)} cheapest</h2>
      ${priceTableHtml(g, entry)}
      ${verdictHtml(g, entry)}
      <p><a href="${steamUrl(g.appId)}" rel="nofollow">View ${esc(g.title)} on Steam</a></p>

      <h2>About ${esc(g.title)}</h2>
      <p>${esc(g.title)} is a ${esc(g.genre)} by ${esc(g.studio)}, released ${g.year}. ${esc(g.players)}.
      It holds a ${g.rating}% positive rating on Steam and takes about ${g.hours} hours to beat.</p>
      <p>${esc(g.pro)}</p>

      <h2>Similar games to compare</h2>
      <ul>${related}</ul>

      <p><a href="${SITE}/gog">Every game we track that's on GOG</a> &middot;
         <a href="${SITE}/deals/all-time-low">Games at their all-time low right now</a> &middot;
         <a href="${SITE}/">Browse all ${GAMES.length} PC games</a></p>

      <h2>How this comparison is made</h2>
      <p>Prices come straight from the stores' own feeds in SGD and are cached for
      about 30 minutes; hours-to-beat and the pros/cons are our editorial estimates.
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
// Falls back to the static USD reference MSRP only when no live data arrived.
function offersFor(g, entry) {
  const stores = comparableStores(entry).filter((s) => typeof s.price === 'number');
  if (!stores.length) {
    return {
      '@type': 'Offer',
      price: g.price.toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: steamUrl(g.appId),
    };
  }

  const currency = stores[0].currency || 'SGD';
  const amounts = stores.map((s) => s.price);
  const until = priceValidUntil();

  return {
    '@type': 'AggregateOffer',
    priceCurrency: currency,
    lowPrice: Math.min(...amounts).toFixed(2),
    highPrice: Math.max(...amounts).toFixed(2),
    offerCount: stores.length,
    offers: stores.map((s) => ({
      '@type': 'Offer',
      price: s.price.toFixed(2),
      priceCurrency: s.currency || 'SGD',
      availability: 'https://schema.org/InStock',
      priceValidUntil: until,
      url: s.url || (s.store === 'Steam' ? steamUrl(g.appId) : gamePath(g.id)),
      seller: { '@type': 'Organization', name: s.store },
    })),
  };
}

function gameJsonLd(g, entry) {
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
        offers: offersFor(g, entry),
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

function hubMeta(kind) {
  if (kind === 'gog') {
    return {
      title: 'PC games on GOG — live GOG vs Steam vs Epic prices | LazyComparo',
      description: 'Which PC games are on GOG, and where GOG is actually the cheapest. Live DRM-free GOG prices compared against Steam and Epic, updated every 30 minutes.',
      canonical: `${SITE}/gog`,
      crumb: 'GOG prices',
      h1: 'PC games on GOG, and when GOG is the cheaper buy',
      intro: 'Every game we track that sells DRM-free on GOG, sorted by how much you save against Steam right now. Prices are Singapore store pricing and refresh every 30 minutes.',
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

function hubHtml(kind, deals) {
  const meta = hubMeta(kind);
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
            <td>${money(gog)}${gog.cut ? ` <span class="cut">${gog.cut}% off</span>` : ''}</td>
            <td>${steam ? money(steam) : 'not on Steam'}</td>
            <td>${saving === null ? '—' : saving > 0
              ? `<strong class="win">${symbolFor(gog.currency)}${saving.toFixed(2)}</strong>`
              : saving === 0 ? 'same price' : `<span class="lose">Steam is ${symbolFor(gog.currency)}${Math.abs(saving).toFixed(2)} cheaper</span>`}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;
  } else {
    body = `
      <div class="tablewrap"><table>
        <thead><tr><th scope="col">Game</th><th scope="col">Cheapest now</th><th scope="col">Store</th><th scope="col">Discount</th></tr></thead>
        <tbody>${rows.map(({ g, best }) => `
          <tr>
            <th scope="row"><a href="${gamePath(g.id)}">${esc(g.title)}</a></th>
            <td><strong class="win">${money(best)}</strong></td>
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

function hubJsonLd(kind, deals) {
  const meta = hubMeta(kind);
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

export async function onRequest(context) {
  const response = await context.next();

  // Only rewrite the HTML document. API routes (/api/*) and other assets pass
  // straight through.
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  const url = new URL(context.request.url);
  // Catalog first: every branch below needs it, and without it there is nothing
  // to inject, so the page goes out exactly as it would have pre-middleware.
  if (!(await loadCatalog(context, url)).length) return response;
  // Cheap and cached after the first request; only the homepage renders it,
  // but the check is here so the flag is set before any branch reads VIDEO.
  await loadVideo(context, url);

  const path = url.pathname.replace(/\/+$/, '') || '/';
  const slugMatch = path.match(/^\/game\/([^/]+)$/);
  const game = slugMatch ? BY_ID.get(decodeURIComponent(slugMatch[1])) : null;
  const hub = HUBS[path];

  // Live prices for the pre-render. Bounded and failure-tolerant by design:
  // fetchDeals never throws and returns {} on timeout, so a slow or missing
  // ITAD feed degrades this to the old no-price markup instead of breaking
  // the page or stalling the response.
  let deals = {};
  if (game) {
    deals = await fetchDeals(url.origin, [game.appId], DEALS_TIMEOUT_MS.game);
  } else if (hub) {
    deals = await fetchDeals(url.origin, GAMES.map((g) => g.appId), DEALS_TIMEOUT_MS.hub);
  }

  let rootHtml;
  let jsonLd;
  let meta = null;

  if (game) {
    const entry = dealFor(deals, game);
    rootHtml = gameHtml(game, entry);
    jsonLd = gameJsonLd(game, entry);
    meta = gameMeta(game, entry);
  } else if (hub) {
    rootHtml = hubHtml(hub, deals);
    jsonLd = hubJsonLd(hub, deals);
    meta = hubMeta(hub);
  } else {
    // Includes unknown /game/<slug> -> homepage content (harmless).
    rootHtml = homeHtml();
    jsonLd = homeJsonLd();
  }

  const rewriter = new HTMLRewriter()
    .on('head', { element(el) { el.append(jsonLd, { html: true }); } })
    .on('#root', { element(el) { el.setInnerContent(rootHtml, { html: true }); } });

  if (meta) {
    rewriter
      .on('title', { element(el) { el.setInnerContent(meta.title); } })
      .on('meta[name="description"]', { element(el) { el.setAttribute('content', meta.description); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', meta.title); } })
      .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', meta.description); } })
      .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', meta.canonical); } })
      .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', meta.canonical); } });
  }

  return rewriter.transform(response);
}
