/**
 * GET /api/epic-free
 *
 * Cloudflare Pages Function. Proxies Epic's own free-games promotion feed
 * (store-site-backend-static.ak.epicgames.com — blocked by CORS in browsers)
 * and returns a normalized list of what's free RIGHT NOW plus what's coming
 * next, for the Singapore region.
 *
 * Response shape:
 *   { updated: ISOString,
 *     current:  [{ id, title, url, image, worth, start, end }],
 *     upcoming: [{ id, title, url, image, worth, start, end }] }
 *
 * "Free" is detected as discountSetting.discountPercentage === 0 (Epic's
 * convention for 100%-off giveaways; discounted-but-not-free promos in the
 * same feed carry 20/40/50/80 etc.), double-checked against
 * price.totalPrice.discountPrice === 0 for active offers.
 */

const FEED =
  'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=SG&allowCountries=SG';
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

  const cache = caches.default;
  const cacheKey = new Request(url.origin + url.pathname, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(FEED, { headers: { Accept: 'application/json' } });
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

    const out = json({ updated: new Date().toISOString(), current, upcoming });
    out.headers.set('Cache-Control', `public, max-age=${TTL_SECONDS}`);
    waitUntil(cache.put(cacheKey, out.clone()));
    return out;
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
