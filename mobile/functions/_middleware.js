// SEO pre-render middleware for mobile.lazycomparo.com
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// The site is a single-file React app transformed by Babel *in the browser*,
// with its catalog fetched from /phones.json after boot. The raw HTML a crawler
// fetches is an empty <div id="root">, so until this file existed the whole
// phone site was one indexable URL with no content on it — fifty phones that
// nobody could find. This injects real, indexable HTML into #root and adds
// JSON-LD BEFORE the app boots. React's createRoot() clears #root on first
// render and takes over, so people get the app and crawlers (and JS-less
// clients) get content. Progressive enhancement / pre-render, not cloaking.
// The boot splash in index.html is what stops that injected HTML flashing on
// screen while Babel compiles.
//
// TWO ROUTES ARE HANDLED:
//   /                -> homepage: ItemList JSON-LD + a linked list of all phones
//   /phone/<slug>    -> per-phone page: unique <title>/description/canonical/og,
//                       a price + spec + resale block, and Product +
//                       BreadcrumbList JSON-LD. The slug is the phone id.
//
// NO CATALOG COPY LIVES HERE. The games middleware keeps a hand-mirrored copy
// of its catalog because that one is inline in index.html; this site's catalog
// is already a file, so it is fetched instead. Adding a phone to phones.json
// therefore adds its page, its homepage entry and its JSON-LD with no second
// edit — only sitemap.xml still has to be regenerated.
//
// WHY THERE IS NO _redirects RULE. The obvious way to serve /phone/<slug> is
// `/phone/* /index.html 200`, which is what the games site does. It cannot be
// used here: a custom 404.html takes precedence over that rule, and mobile/ has
// one. The games site hit exactly this on 2026-08-09 — every /game/<slug>
// answered 404 with the 404 page's noindex — and resolved it by deleting its
// 404 page. Instead this fetches the app shell itself through the env.ASSETS
// binding, which bypasses middleware (a self-fetch to the origin would re-enter
// it and inject twice) and forces a 200. Unknown slugs are left alone and get
// the real 404 rather than a soft one.
// ---------------------------------------------------------------------------

const SITE = 'https://mobile.lazycomparo.com';
const CURRENT_YEAR = 2026;            // mirrors CURRENT_YEAR in ../index.html
const CATALOG_REVIEWED = 'August 2026'; // mirrors CATALOG_REVIEWED in ../index.html

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const phonePath = (id) => `${SITE}/phone/${id}`;
const sgd = (n) => `S$${Math.round(n).toLocaleString('en-SG')}`;

/* Same rule as phoneName() in ../index.html: 20 of the catalog entries write
   the brand into the model ("Google Pixel 8a"), so brand + ' ' + model stutters
   on exactly those. Change one, change both. */
function phoneName(p) {
  const m = String(p.model), b = String(p.brand);
  return m.toLowerCase().indexOf(b.toLowerCase()) === 0 ? m : b + ' ' + m;
}

/* ------------------------------- CATALOG ---------------------------------- */
// Cached in module scope, so a warm isolate serves every page without a second
// read. That cache lives at most as long as the isolate and every deploy makes
// new ones, so a phones.json edit can never be served stale after a push.
let CATALOG = null;

async function loadCatalog(context, url) {
  if (CATALOG) return CATALOG;
  try {
    const req = new Request(new URL('/phones.json', url.origin).toString(), {
      headers: { 'x-lc-shell': '1' },
    });
    const res = context.env && context.env.ASSETS
      ? await context.env.ASSETS.fetch(req)
      : await fetch(req);
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data) && data.length) CATALOG = data;
    return CATALOG || [];
  } catch (e) {
    // Never throw out of here: no catalog just means no injection, which is
    // the behaviour this site had before the middleware existed.
    return [];
  }
}

/* ----------------------------- VALUE MATH --------------------------------- */
// Transcribed from ../index.html so the page and the pre-render cannot report
// different numbers for the same phone. If the model changes there — or on
// lazycomparo.com/how-we-rank, which publishes it — it changes here too.
const ageYears = (p) => Math.max(1, CURRENT_YEAR - p.year);
const retainedPct = (p) => Math.round((p.price / p.launchPrice) * 100);

function priceDrop(p) {
  if (!p.launchPrice || p.launchPrice <= 0) return 0;
  return Math.max(0, Math.round((1 - p.price / p.launchPrice) * 100));
}

function annualDepreciationRate(p) {
  if (p.year >= CURRENT_YEAR) return 0;
  return Math.round((1 - Math.pow(p.price / p.launchPrice, 1 / ageYears(p))) * 1000) / 10;
}

function brandRates(phones) {
  const by = {};
  phones.forEach((p) => {
    if (p.year >= CURRENT_YEAR) return;   // just-launched: no curve yet
    if (!by[p.brand]) by[p.brand] = { total: 0, count: 0 };
    by[p.brand].total += annualDepreciationRate(p);
    by[p.brand].count += 1;
  });
  const out = {};
  Object.keys(by).forEach((b) => { out[b] = Math.round((by[b].total / by[b].count) * 10) / 10; });
  return out;
}

// A phone that is simply old has fallen a long way and that is not a deal — it
// is arithmetic. What counts is falling further than its own brand normally
// falls by this age. UNDER_CURVE_MARGIN mirrors ../index.html.
const UNDER_CURVE_MARGIN = 10;
function underCurve(p, rates) {
  const rate = rates[p.brand];
  if (rate == null || p.year >= CURRENT_YEAR) return false;
  const expected = p.launchPrice * Math.pow(1 - rate / 100, ageYears(p));
  return p.price <= expected * (1 - UNDER_CURVE_MARGIN / 100);
}

/* Up to 4 phones worth comparing this one against. Cross-ecosystem first and
   deliberately: "iPhone 16 vs Galaxy S25" is the query this site answers and a
   list of four more iPhones would answer none of it. Same tier, nearest year. */
function relatedPhones(phone, phones) {
  const near = (a, b) => Math.abs(a.year - b.year);
  const sameTier = phones.filter((p) => p.id !== phone.id && p.tier === phone.tier);
  const rivals = sameTier
    .filter((p) => p.ecosystemFamily !== phone.ecosystemFamily)
    .sort((a, b) => near(a, phone) - near(b, phone));
  const siblings = sameTier
    .filter((p) => p.ecosystemFamily === phone.ecosystemFamily)
    .sort((a, b) => near(a, phone) - near(b, phone));
  const rest = phones.filter((p) => p.id !== phone.id && p.tier !== phone.tier)
    .sort((a, b) => Math.abs(a.price - phone.price) - Math.abs(b.price - phone.price));
  return [...rivals.slice(0, 3), ...siblings.slice(0, 1), ...rest].slice(0, 4);
}

/* -------------------------------- HOMEPAGE -------------------------------- */

function homeHtml(phones) {
  const cards = phones.map((p) => `
    <article>
      <h2><a href="${phonePath(p.id)}">${esc(phoneName(p))}</a></h2>
      <p>${esc(p.tier)} ${esc(p.brand)} phone from ${p.year} running ${esc(p.ecosystem)}.
      ${esc(p.displayInfo.chipset)}, ${esc(p.displayInfo.display)} ${esc(p.displayInfo.refreshRate)},
      ${esc(p.displayInfo.batteryMah)} battery, ${esc(p.displayInfo.cameraMP)}.
      About ${sgd(p.price)} in Singapore — ${priceDrop(p)}% below its ${sgd(p.launchPrice)} launch price.</p>
      <p><a href="${phonePath(p.id)}">${esc(phoneName(p))} price, specs and resale value &rarr;</a></p>
    </article>`).join('');

  return `
    <header>
      <h1>Compare Phone Prices, Specs and Resale Value in Singapore</h1>
      <p>LazyComparo tracks Singapore street prices, specs, sentiment and resale value for ${phones.length}
      phones across Apple, Samsung, Google, Xiaomi, OnePlus, Oppo, vivo, Honor and Nothing — and answers the
      question the spec sheets don't: whether switching is worth what you lose leaving your current ecosystem.
      We do the boring comparison work so you don't have to.</p>
    </header>
    <main>
      <h2>Phones we compare</h2>
      ${cards}
    </main>
    <footer>
      <p>Loading the interactive comparison&hellip; if it doesn't appear, enable JavaScript.</p>
      <p>Prices are typical Singapore street prices tracked in our catalog, last reviewed ${CATALOG_REVIEWED} —
      not a live retailer feed. No ads, no affiliate links, no paid placement.
      <a href="https://lazycomparo.com/how-we-rank">How we rank</a> &middot;
      <a href="https://lazycomparo.com/about">About LazyComparo</a> &middot;
      <a href="https://lazycomparo.com/privacy">Privacy &amp; terms</a></p>
    </footer>`;
}

function homeJsonLd(phones) {
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Phones compared on LazyComparo',
    itemListElement: phones.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: phonePath(p.id),
      item: {
        '@type': 'Product',
        name: phoneName(p),
        brand: { '@type': 'Brand', name: p.brand },
        category: 'Smartphone',
        releaseDate: String(p.year),
        offers: {
          '@type': 'Offer',
          price: String(p.price),
          priceCurrency: 'SGD',
          availability: 'https://schema.org/InStock',
          url: phonePath(p.id),
        },
      },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/* ------------------------------ PHONE PAGE -------------------------------- */

// The first sentence, and the shape of the question someone actually types:
// "<phone> price singapore", "is the <phone> worth it". Answer it outright
// instead of making the reader hunt, and say where the number comes from —
// there is no live phone price feed and the page must not imply one.
function priceAnswer(p, rates) {
  const drop = priceDrop(p);
  const bits = [`The ${phoneName(p)} sells for about ${sgd(p.price)} in Singapore`];
  if (drop > 0) bits.push(`${drop}% below its ${sgd(p.launchPrice)} launch price`);
  let s = bits.join(', ') + '.';
  if (underCurve(p, rates)) {
    s += ` That is more than ${p.brand} phones of this age usually lose, so it is a genuinely good time to buy one.`;
  } else if (p.year >= CURRENT_YEAR) {
    s += ' It launched this year, so it is still at or near full price.';
  } else {
    s += ` That is about what ${p.brand} phones lose by ${ageYears(p)} year${ageYears(p) === 1 ? '' : 's'} old — a normal price, not a deal.`;
  }
  return s;
}

function specTableHtml(p) {
  const rows = [
    ['Price (Singapore street)', sgd(p.price)],
    ['Launch price', sgd(p.launchPrice)],
    ['Released', String(p.year)],
    ['Chipset', p.displayInfo.chipset],
    ['Display', `${p.displayInfo.display} ${p.displayInfo.refreshRate}`],
    ['Camera', p.displayInfo.cameraMP],
    ['Battery', p.displayInfo.batteryMah],
    ['RAM / storage', `${p.displayInfo.ram} · ${p.displayInfo.storage}`],
    ['Operating system', p.ecosystem],
    ['Tier', p.tier],
  ];
  return `<table><tbody>${rows.map(
    ([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
}

function resaleHtml(p, rates) {
  const rate = annualDepreciationRate(p);
  const brandAvg = rates[p.brand];
  if (p.year >= CURRENT_YEAR) {
    return `<p>The ${esc(phoneName(p))} launched in ${p.year}, so there is no depreciation history for it yet.
    ${p.brand} phones lose about ${brandAvg == null ? 'n/a' : brandAvg}% of their value per year on average across our catalog.</p>`;
  }
  const vs = brandAvg == null ? ''
    : rate < brandAvg ? ` — slower than the ${brandAvg}% a year ${esc(p.brand)} averages across our catalog, so it holds value better than its stablemates.`
    : rate > brandAvg ? ` — faster than the ${brandAvg}% a year ${esc(p.brand)} averages across our catalog.`
    : ` — exactly the ${brandAvg}% a year ${esc(p.brand)} averages across our catalog.`;
  return `<p>After ${ageYears(p)} year${ageYears(p) === 1 ? '' : 's'} the ${esc(phoneName(p))} keeps
  ${retainedPct(p)}% of its launch price, which works out to about ${rate}% lost per year${vs}</p>`;
}

// Search results cut titles at roughly 65 characters and descriptions at about
// 160, so both are BUILT TO FIT rather than shipped long and truncated
// mid-sentence by Google: the site suffix is the first thing dropped from a
// title, and the description takes whole clauses only while they fit.
function phoneMeta(p) {
  const name = phoneName(p);
  const drop = priceDrop(p);
  const stem = `${name} price in Singapore — specs & resale value`;
  const withSite = `${stem} | LazyComparo`;

  const clauses = [
    drop > 0
      ? `${name}: about ${sgd(p.price)}, ${drop}% below its ${sgd(p.launchPrice)} launch price.`
      : `${name}: about ${sgd(p.price)} in Singapore.`,
    `${p.displayInfo.chipset}, ${p.displayInfo.display} ${p.displayInfo.refreshRate}, ${p.displayInfo.batteryMah}.`,
    `Keeps ${retainedPct(p)}% of its launch value after ${ageYears(p)}y.`,
  ];
  let description = '';
  for (const clause of clauses) {
    const next = description ? `${description} ${clause}` : clause;
    if (next.length > 158) break;
    description = next;
  }

  return {
    title: withSite.length > 65 ? stem : withSite,
    description,
    canonical: phonePath(p.id),
  };
}

function phoneHtml(p, phones, rates) {
  const name = phoneName(p);
  const related = relatedPhones(p, phones).map((r) =>
    `<li><a href="${phonePath(r.id)}">${esc(name)} vs ${esc(phoneName(r))}</a> — ${esc(r.ecosystem)}, about ${sgd(r.price)}</li>`).join('');
  const pros = (p.pros || []).map((x) => `<li>${esc(x)}</li>`).join('');
  const cons = (p.cons || []).map((x) => `<li>${esc(x)}</li>`).join('');
  const eco = (p.ecosystemFeatures || []).map(esc).join(', ');

  return `
    <nav aria-label="Breadcrumb"><a href="${SITE}/">All phones</a> &rsaquo; <span>${esc(name)}</span></nav>
    <main>
      <h1>${esc(name)} price, specs and resale value in Singapore</h1>
      <p>${esc(priceAnswer(p, rates))}</p>

      <h2>${esc(name)} specs</h2>
      ${specTableHtml(p)}

      <h2>What the ${esc(name)} does well</h2>
      <ul>${pros}</ul>

      <h2>Where it falls short</h2>
      <ul>${cons}</ul>

      <h2>Resale value and depreciation</h2>
      ${resaleHtml(p, rates)}

      <h2>Switching cost</h2>
      <p>The ${esc(name)} runs ${esc(p.ecosystem)}. Leaving it behind means leaving ${eco || 'its ecosystem features'}.
      Our switching advisor prices that friction into the recommendation instead of comparing spec sheets in a vacuum —
      it is the reason a phone that wins on paper can still be the wrong buy.</p>

      <h2>Compare the ${esc(name)} against</h2>
      <ul>${related}</ul>

      <p><a href="${SITE}/">Browse all ${phones.length} phones we track</a> &middot;
         <a href="https://pcgames.lazycomparo.com/">Compare PC game prices</a></p>

      <h2>How this comparison is made</h2>
      <p>Prices are typical Singapore street prices tracked in our catalog and last reviewed ${CATALOG_REVIEWED};
      no free feed publishes live SG phone prices, so nothing here is dressed up as one. Specs are manufacturer
      figures, sentiment and the pros and cons are our editorial assessment, and depreciation is measured from
      launch price to today's street price. No ads, no affiliate links and no paid placement.
      <a href="https://lazycomparo.com/how-we-rank">Every weight and threshold we use is published</a>.</p>
    </main>`;
}

function phoneJsonLd(p) {
  const props = [
    ['Chipset', p.displayInfo.chipset],
    ['Display', `${p.displayInfo.display} ${p.displayInfo.refreshRate}`],
    ['Camera', p.displayInfo.cameraMP],
    ['Battery', p.displayInfo.batteryMah],
    ['RAM', p.displayInfo.ram],
    ['Storage', p.displayInfo.storage],
    ['Operating system', p.ecosystem],
  ].map(([name, value]) => ({ '@type': 'PropertyValue', name, value: String(value) }));

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        // Product only. There is deliberately NO aggregateRating: sentimentScore
        // is our own editorial number, not aggregated user reviews, and marking
        // it up as ratings would be inventing review data.
        '@type': 'Product',
        name: phoneName(p),
        brand: { '@type': 'Brand', name: p.brand },
        model: p.model,
        category: 'Smartphone',
        releaseDate: String(p.year),
        url: phonePath(p.id),
        additionalProperty: props,
        offers: {
          '@type': 'Offer',
          price: String(p.price),
          priceCurrency: 'SGD',
          availability: 'https://schema.org/InStock',
          url: phonePath(p.id),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'All phones', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: phoneName(p), item: phonePath(p.id) },
        ],
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/* -------------------------------- ROUTING --------------------------------- */

// The app shell for /phone/<slug>, fetched through the ASSETS binding so it
// does not re-enter this middleware. The header is belt and braces for the
// fallback path, where a plain origin fetch WOULD come back through here.
async function fetchShell(context, url) {
  const req = new Request(new URL('/index.html', url.origin).toString(), {
    headers: { 'x-lc-shell': '1' },
  });
  const res = context.env && context.env.ASSETS
    ? await context.env.ASSETS.fetch(req)
    : await fetch(req);
  return new Response(res.body, { status: 200, headers: new Headers(res.headers) });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.headers.get('x-lc-shell')) return context.next();

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const slugMatch = path.match(/^\/phone\/([^/]+)$/);

  // Nothing to do for assets, /phones.json, or any other route.
  if (path !== '/' && !slugMatch) return context.next();

  const phones = await loadCatalog(context, url);
  if (!phones.length) return context.next();   // no catalog -> no injection

  let phone = null;
  if (slugMatch) {
    phone = phones.find((p) => p.id === decodeURIComponent(slugMatch[1])) || null;
    // Unknown slug: let it 404 for real rather than serving a soft-404 shell.
    if (!phone) return context.next();
  }

  const response = phone ? await fetchShell(context, url) : await context.next();
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  const rates = brandRates(phones);
  const rootHtml = phone ? phoneHtml(phone, phones, rates) : homeHtml(phones);
  const jsonLd = phone ? phoneJsonLd(phone) : homeJsonLd(phones);
  const meta = phone ? phoneMeta(phone) : null;

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
