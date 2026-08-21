/**
 * GET /api/epic-free[?cc=US]
 *
 * Cloudflare Pages Function. Proxies Epic's own free-games promotion feed
 * (store-site-backend-static.ak.epicgames.com — blocked by CORS in browsers)
 * and returns a normalized list of what's free RIGHT NOW plus what's coming
 * next, for the visitor's own region.
 *
 * The region matters for more than the `worth` figure: Epic's giveaway line-up
 * genuinely differs by country (publisher rights), so asking for the wrong
 * country can advertise a game the visitor cannot claim. `worth` comes back as
 * Epic's own formatted string, already in that country's currency.
 *
 * Response shape:
 *   { updated: ISOString, country,
 *     current:  [{ id, title, url, image, worth, start, end }],
 *     upcoming: [{ id, title, url, image, worth, start, end }] }
 *
 * "Free" is detected as discountSetting.discountPercentage === 0 (Epic's
 * convention for 100%-off giveaways; discounted-but-not-free promos in the
 * same feed carry 20/40/50/80 etc.), double-checked against
 * price.totalPrice.discountPrice === 0 for active offers.
 */

import { resolveCountry, forVisitor } from '../../lib/region.js';

const feedUrl = (country) =>
  `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=${country}&allowCountries=${country}`;
const TTL_SECONDS = 900; // 15 min edge cache

function pageUrl(el) {
  const mapSlug = el.catalogNs && el.catalogNs.mappings && el.catalogNs.mappings[0] && el.catalogNs.mappings[0].pageSlug;
  const offerSlug = el.offerMappings && el.offerMappings[0] && el.offerMappings[0].pageSlug;
  const slug = mapSlug || offerSlug || el.productSlug || el.urlSlug;
  if (!slug) return 'https://store.epicgames.com/en-US/free-games';
  return `https://store.epicgames.com/en-US/p/${String(slug).replace(/\/home$/, '')}`;
}

function image(el) {
  const imgs = el.keyImages || [];
  const pick =
    imgs.find((i) => i.type === 'OfferImageWide') ||
    imgs.find((i) => i.type === 'DieselStoreFrontWide') ||
    imgs.find((i) => i.type === 'Thumbnail') ||
    imgs[0];
  return pick ? pick.url : null;
}

function normalize(el, offer) {
  const total = el.price && el.price.totalPrice;
  const worth =
    total && total.originalPrice > 0 && total.fmtPrice && total.fmtPrice.originalPrice
      ? total.fmtPrice.originalPrice
      : null;
  return {
    id: el.id,
    title: el.title,
    url: pageUrl(el),
    image: image(el),
    worth,
    start: offer.startDate || null,
    end: offer.endDate || null,
  };
}

const isFreePromo = (o) => o && o.discountSetting && o.discountSetting.discountPercentage === 0;

export async function onRequestGet(context) {
  const { request, waitUntil } = context;
  const url = new URL(request.url);

  const country = resolveCountry(request, url);

  const cache = caches.default;
  // Country in the key: the line-up and the prices both vary by it.
  const cacheKey = new Request(`${url.origin}${url.pathname}?cc=${country}`, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return forVisitor(hit, url, TTL_SECONDS);

  try {
    const res = await fetch(feedUrl(country), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('feed -> ' + res.status);
    const data = await res.json();
    const elements =
      (((data.data || {}).Catalog || {}).searchStore || {}).elements || [];

    const now = Date.now();
    const current = [];
    const upcoming = [];

    for (const el of elements) {
      const promos = el.promotions || {};
      const total = el.price && el.price.totalPrice;

      for (const block of promos.promotionalOffers || []) {
        for (const o of block.promotionalOffers || []) {
          const active =
            o.startDate && o.endDate &&
            new Date(o.startDate).getTime() <= now &&
            now < new Date(o.endDate).getTime();
          if (active && isFreePromo(o) && total && total.discountPrice === 0) {
            current.push(normalize(el, o));
          }
        }
      }

      for (const block of promos.upcomingPromotionalOffers || []) {
        for (const o of block.promotionalOffers || []) {
          if (isFreePromo(o) && o.startDate && new Date(o.startDate).getTime() > now) {
            upcoming.push(normalize(el, o));
          }
        }
      }
    }

    upcoming.sort((a, b) => new Date(a.start) - new Date(b.start));

    const out = json({ updated: new Date().toISOString(), country, current, upcoming });
    out.headers.set('Cache-Control', `public, max-age=${TTL_SECONDS}`);
    waitUntil(cache.put(cacheKey, out.clone()));
    return forVisitor(out, url, TTL_SECONDS);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? undefined : 'no-store',
    },
  });
}
