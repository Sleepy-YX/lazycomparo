/**
 * GET /api/steam?ids=892970,1145360,...[&cc=US]
 *
 * Cloudflare Pages Function. Fetches LIVE price + review data from Steam
 * server-side (Steam's store API blocks browser CORS, so this proxy is the
 * whole point) and edge-caches the result for 30 minutes.
 *
 * PRICES ARE PER VISITOR. Steam runs regional pricing, so the country we ask
 * for decides both the number and the currency: a Singapore visitor gets
 * S$14.50 and a US one US$14.99 for the same game, straight from the store
 * they would actually buy on — no FX guessing anywhere in this path. The
 * country comes from Cloudflare's geolocation, overridable with ?cc=.
 * `priceFormatted` is Steam's own localized string, so it is correct even for
 * currencies our own symbol table has never heard of.
 *
 * Response shape:
 *   { updated: ISOString, country, currency, games: { [appId]: {
 *       price, initial, discount, priceFormatted, currency, isFree,
 *       ratingPct, ratingDesc, totalReviews
 *   } } }
 *
 * Subrequest budget: Cloudflare's free plan allows 50 subrequests per
 * invocation. Each game costs 2 (price + reviews), so the client chunks its
 * ids into batches of <=15 (30 subrequests) before calling this.
 */

import { resolveCountry, regionFor, forVisitor } from '../../lib/region.js';

const TTL_SECONDS = 1800; // 30 min
const MAX_IDS = 20; // hard cap: 20 * 2 = 40 subrequests, safely under 50

async function fetchGame(id, country) {
  const out = { id };
  const cc = country.toLowerCase();
  try {
    const [priceRes, reviewRes] = await Promise.all([
      fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=${cc}&filters=price_overview`, {
        headers: { 'Accept': 'application/json' },
      }),
      fetch(`https://store.steampowered.com/appreviews/${id}?json=1&language=all&purchase_type=all&num_per_page=0`, {
        headers: { 'Accept': 'application/json' },
      }),
    ]);

    // --- price ---
    if (priceRes.ok) {
      const pj = await priceRes.json();
      const node = pj && pj[id];
      if (node && node.success && node.data) {
        if (Array.isArray(node.data)) {
          // data:[] means free-to-play / no purchase price
          out.isFree = true;
          out.price = 0;
          out.priceFormatted = 'Free';
        } else if (node.data.price_overview) {
          const po = node.data.price_overview;
          out.price = po.final / 100;
          out.initial = po.initial / 100;
          out.discount = po.discount_percent;
          out.priceFormatted = po.final_formatted || null;
          out.currency = po.currency;
          out.isFree = po.final === 0;
        }
        // object without price_overview -> unknown, leave price to fallback
      }
    }

    // --- reviews ---
    if (reviewRes.ok) {
      const rj = await reviewRes.json();
      const qs = rj && rj.query_summary;
      if (qs && qs.total_reviews > 0) {
        out.ratingPct = Math.round((qs.total_positive / qs.total_reviews) * 100);
        out.ratingDesc = qs.review_score_desc;
        out.totalReviews = qs.total_reviews;
      }
    }
  } catch (e) {
    out.error = true;
  }
  return out;
}

export async function onRequestGet(context) {
  const { request, waitUntil } = context;
  const url = new URL(request.url);

  const ids = (url.searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return json({ error: 'pass ?ids=appid1,appid2,...' }, 400);
  }

  const region = regionFor(resolveCountry(request, url));

  // Edge cache: normalize the key so ?ids=a,b and ?ids=a, b hit the same
  // entry. The country is PART OF THE KEY — caches.default is per-colo and a
  // single colo serves several countries, so without it a German visitor
  // could be handed the Swiss visitor's francs.
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.searchParams.set('ids', ids.join(','));
  cacheUrl.searchParams.set('cc', region.country);
  const cache = caches.default;
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) return forVisitor(hit, url, TTL_SECONDS);

  const results = await Promise.all(ids.map((id) => fetchGame(id, region.country)));
  const games = {};
  for (const r of results) games[r.id] = r;

  const res = json({
    updated: new Date().toISOString(),
    country: region.country,
    currency: region.currency,
    games,
  });
  res.headers.set('Cache-Control', `public, max-age=${TTL_SECONDS}`);
  waitUntil(cache.put(cacheKey, res.clone()));
  return forVisitor(res, url, TTL_SECONDS);
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
