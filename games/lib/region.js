/**
 * Where the visitor is, and what money they think in.
 * ---------------------------------------------------------------------------
 * Steam and IsThereAnyDeal both price per country, so "what does this game
 * cost" has no single answer — it depends who is asking. This module is the
 * one place that answers it, shared by the three API functions and the
 * pre-render middleware so they cannot disagree about a visitor's region
 * (a page whose <h1> says US$ and whose price table says S$ is worse than
 * either alone).
 *
 * It lives outside functions/ on purpose: everything under functions/ is a
 * ROUTE, and this is a library. Pages bundles it into the Worker at build time.
 *
 * The front-end does not import this — it gets its region from the
 * window.__LC_REGION blob the middleware injects, so there is no second copy
 * of the currency table shipped to browsers.
 */

// Steam's regional currencies, by country. A country missing here is priced in
// USD — which is also what Steam itself does for everywhere outside the list
// below, so the guess and the store agree.
const CURRENCY_COUNTRIES = {
  EUR: ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PT','RO','SK','SI','ES','SE'],
  GBP: ['GB'], CHF: ['CH','LI'], NOK: ['NO'], PLN: ['PL'], TRY: ['TR'],
  RUB: ['RU'], UAH: ['UA'], KZT: ['KZ'],
  CAD: ['CA'], MXN: ['MX'], BRL: ['BR'], CLP: ['CL'], COP: ['CO'],
  PEN: ['PE'], UYU: ['UY'], CRC: ['CR'],
  AUD: ['AU'], NZD: ['NZ'],
  JPY: ['JP'], KRW: ['KR'], CNY: ['CN'], TWD: ['TW'], HKD: ['HK'],
  SGD: ['SG'], MYR: ['MY'], THB: ['TH'], IDR: ['ID'], VND: ['VN'],
  PHP: ['PH'], INR: ['IN'],
  ILS: ['IL'], AED: ['AE'], SAR: ['SA'], QAR: ['QA'], KWD: ['KW'], ZAR: ['ZA'],
  USD: ['US'],
};

const COUNTRY_CURRENCY = {};
for (const [currency, countries] of Object.entries(CURRENCY_COUNTRIES)) {
  for (const c of countries) COUNTRY_CURRENCY[c] = currency;
}

// Prefixes, not Intl.NumberFormat: we want "US$12.34" and "S$12.34" — the
// unambiguous forms — where Intl would give a bare "$12.34" for both.
const CURRENCY_SYMBOL = {
  USD: 'US$', SGD: 'S$', EUR: '€', GBP: '£', JPY: '¥', CNY: 'CN¥',
  KRW: '₩', INR: '₹', AUD: 'A$', CAD: 'C$', NZD: 'NZ$', HKD: 'HK$',
  TWD: 'NT$', BRL: 'R$', MXN: 'MX$', THB: '฿', VND: '₫', IDR: 'Rp',
  PHP: '₱', MYR: 'RM', TRY: '₺', ZAR: 'R', RUB: '₽', UAH: '₴',
  KZT: '₸', ILS: '₪', CLP: 'CLP$', COP: 'COL$', PEN: 'S/', UYU: '$U',
  CRC: '₡', PLN: 'zł', CHF: 'CHF ', NOK: 'kr ', AED: 'AED ',
  SAR: 'SAR ', QAR: 'QAR ', KWD: 'KWD ',
};

// Currencies whose smallest unit nobody quotes: ¥5,980, not ¥5,980.00.
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'COP', 'KZT', 'TWD']);

/** The currency the fallback prices in games.json are written in. */
export const BASE_CURRENCY = 'SGD';
/** Used when Cloudflare has no idea where the request came from. */
export const DEFAULT_COUNTRY = 'US';

export const currencyFor = (country) => COUNTRY_CURRENCY[country] || 'USD';
export const symbolFor = (currency) => CURRENCY_SYMBOL[currency] || `${currency || 'USD'} `;
export const decimalsFor = (currency) => (ZERO_DECIMAL.has(currency) ? 0 : 2);

/** "S$14.50", "¥5980", "~US$11.02" — one money format for every surface. */
export function formatMoney(amount, currency, approx) {
  if (typeof amount !== 'number' || !isFinite(amount)) return '';
  const d = decimalsFor(currency);
  return `${approx ? '~' : ''}${symbolFor(currency)}${amount.toFixed(d)}`;
}

/**
 * The visitor's country, as ISO-3166 alpha-2.
 *
 * ?cc=US wins over geolocation — it is how we test another region without a
 * VPN, and how someone travelling can force the store they actually buy from.
 * Cloudflare hands back 'T1' for Tor and 'XX' when it cannot tell; neither is
 * a country Steam would accept, so both fall through to the default.
 */
export function resolveCountry(request, url) {
  const forced = url && url.searchParams.get('cc');
  if (forced && /^[A-Za-z]{2}$/.test(forced)) {
    const cc = forced.toUpperCase();
    if (COUNTRY_CURRENCY[cc]) return cc;
  }
  const geo = request && request.cf && request.cf.country;
  if (typeof geo === 'string' && /^[A-Z]{2}$/.test(geo) && geo !== 'XX' && geo !== 'T1') return geo;
  return DEFAULT_COUNTRY;
}

/**
 * Cache-Control for a geolocated response.
 *
 * The answer depends on WHO ASKED, which a URL alone does not say. When the
 * caller named its country in the query the URL is self-describing and any
 * cache may share it; when the country came from geolocation (the landing
 * page calls these endpoints cross-origin without one) the same URL means a
 * different answer per visitor, so only that visitor's own browser may keep
 * it. Our own edge cache is unaffected either way — its key carries the
 * country explicitly.
 */
function cacheability(url, ttlSeconds) {
  const named = /^[A-Za-z]{2}$/.test((url && url.searchParams.get('cc')) || '');
  return `${named ? 'public' : 'private'}, max-age=${ttlSeconds}`;
}

/**
 * The copy of a response that goes back to the visitor.
 *
 * Only this copy carries the `private` marking — the one we hand to
 * caches.default keeps `public`, because the Cache API refuses to store a
 * private response and our own edge cache is the whole reason these endpoints
 * are affordable. Its key already names the country, so it is not the cache
 * this protects against.
 */
export function forVisitor(res, url, ttlSeconds) {
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', cacheability(url, ttlSeconds));
  return out;
}

/** Everything a caller needs to price for one visitor. */
export function regionFor(country) {
  const currency = currencyFor(country);
  return { country, currency, symbol: symbolFor(currency), decimals: decimalsFor(currency) };
}

/** English country name for page copy ("Singapore store pricing"). */
export function countryName(country) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || country;
  } catch (e) {
    return country;
  }
}

/* ------------------------------- FX rates --------------------------------- */
// Steam prices per region natively, so its numbers never need converting.
// ITAD does not: it quotes several stores in USD or EUR whatever region you
// ask for, and the catalog fallback prices are SGD. Those get converted, and
// every converted amount is flagged `approx` and rendered with a "~" so an
// estimate is never presented as the price you will be charged.

const FX_TTL_MS = 6 * 60 * 60 * 1000;
const fxCache = new Map(); // base -> { at, rates }

/** Rates keyed by currency: rates[X] = how many X you get for 1 `base`. */
export async function ratesFor(base) {
  const hit = fxCache.get(base);
  if (hit && Date.now() - hit.at < FX_TTL_MS) return hit.rates;
  try {
    // cacheEverything makes this a colo cache read for all but the first
    // caller in six hours, so a per-request conversion is not a per-request
    // round-trip to the FX API.
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      cf: { cacheTtl: 21600, cacheEverything: true },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rates = data && data.result === 'success' && data.rates ? data.rates : null;
    if (rates) fxCache.set(base, { at: Date.now(), rates });
    return rates;
  } catch (e) {
    return null; // callers all fall back to "leave it in its own currency"
  }
}

/** Multiplier from one currency to another, or null if we cannot say. */
export async function fxRate(from, to) {
  if (!from || !to || from === to) return 1;
  const rates = await ratesFor(from);
  const r = rates && rates[to];
  return typeof r === 'number' && r > 0 ? r : null;
}

export const round2 = (n) => Math.round(n * 100) / 100;
