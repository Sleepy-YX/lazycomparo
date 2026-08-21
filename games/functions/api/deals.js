/**
 * GET /api/deals?ids=892970,1145360,...[&cc=US]   (Steam AppIDs)
 *
 * Cloudflare Pages Function. Looks games up on IsThereAnyDeal (ITAD) and
 * returns current Steam / Epic / GOG prices plus the all-time historical low,
 * powering the cross-store price comparison and "lowest price ever" badges.
 *
 * REQUIRES an ITAD_API_KEY environment variable on the Pages project
 * (free key: https://isthereanydeal.com/apps/ -> register an app).
 * Without the key this returns 503 and the front-end silently falls back to
 * Steam-only pricing + the editorial EXTRA_STORES availability lists.
 *
 * PRICES ARE PER VISITOR, like /api/steam: the country comes from Cloudflare's
 * geolocation (overridable with ?cc=) and is passed to ITAD, so a US visitor
 * is quoted US storefronts and a Singapore one SG storefronts.
 *
 * ITAD still quotes some stores in a currency other than the region's own
 * (Epic and GOG bill plenty of countries in USD), which clashes with the Steam
 * feed's regional prices in the UI. So any amount not already in the region's
 * currency is converted here using a live FX rate (open.er-api.com, no key)
 * and flagged `approx: true` so the front-end can show it as "~US$…".
 * If the FX fetch fails, prices pass through unconverted in their original
 * currency — the front-end still labels those honestly.
 *
 * Subrequest budget: 4 total regardless of id count (one batched lookup, one
 * prices call, one history-low call, one FX call) — far under Cloudflare's
 * 50-cap.
 */

import { resolveCountry, regionFor, ratesFor, round2, forVisitor } from '../../lib/region.js';

const TTL_SECONDS = 1800; // 30 min edge cache
// Requests longer than this are TRUNCATED, not rejected — the front-end chunks
// to DEALS_CHUNK (30) to stay under it. Raise both together if the catalog grows.
const MAX_IDS = 40;
const STEAM_SHOP_ID = 61; // ITAD's shop id for Steam

// Normalize ITAD shop names down to the three stores the site shows.
function storeName(shop) {
  const n = ((shop && shop.name) || '').toLowerCase();
  if (n.includes('steam')) return 'Steam';
  if (n.includes('epic')) return 'Epic';
  if (n.includes('gog')) return 'GOG';
  return null;
}

// Mutates a price-bearing object ({ price, currency, regular? }) into `target`.
// ratesFor(target) gives rates[X] = how many X per 1 target, so dividing by
// that rate converts an amount in X back into the target currency.
function toRegion(obj, target, rates) {
  if (!obj || typeof obj.price !== 'number') return;
  if (!obj.currency || obj.currency === target) { obj.currency = obj.currency || target; return; }
  const rate = rates && rates[obj.currency];
  if (!rate || rate <= 0) return; // unknown currency — leave as-is, honestly labeled
  obj.price = round2(obj.price / rate);
  if (typeof obj.regular === 'number') obj.regular = round2(obj.regular / rate);
  obj.currency = target;
  obj.approx = true;
}

async function itad(path, key, params, body) {
  const qs = new URLSearchParams({ key, ...params });
  const res = await fetch(`https://api.isthereanydeal.com${path}?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);

  const ids = (url.searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return json({ error: 'pass ?ids=appid1,appid2,...' }, 400);
  }

  const key = env && env.ITAD_API_KEY;
  if (!key) {
    return json({ error: 'ITAD_API_KEY not configured on this Pages project' }, 503);
  }

  const region = regionFor(resolveCountry(request, url));

  // Edge cache (same normalization trick as /api/steam, and the country is
  // part of the key for the same reason: caches.default is per-colo and one
  // colo serves several countries).
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.searchParams.set('ids', ids.join(','));
  cacheUrl.searchParams.set('cc', region.country);
  const cache = caches.default;
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return forVisitor(hit, url, TTL_SECONDS);

  try {
    // 1) Steam appids -> ITAD game UUIDs, one batched call
    const lookup = await itad(`/lookup/id/shop/${STEAM_SHOP_ID}/v1`, key, {}, ids.map((id) => `app/${id}`));
    const uuidToApp = {};
    const uuids = [];
    for (const id of ids) {
      const u = lookup && lookup[`app/${id}`];
      if (u) { uuidToApp[u] = id; uuids.push(u); }
    }

    const games = {};
    if (uuids.length > 0) {
      // 2) Current prices across shops. nondeals=true so full-price listings
      //    are included too — that's how we learn store AVAILABILITY, not
      //    just active discounts.
      const prices = await itad('/games/prices/v3', key, {
        country: region.country, nondeals: 'true', vouchers: 'false',
      }, uuids);
      const list = Array.isArray(prices) ? prices : (prices && prices.prices) || [];

      for (const entry of list) {
        const appId = uuidToApp[entry.id];
        if (!appId) continue;
        const byStore = {};
        for (const d of entry.deals || []) {
          const name = storeName(d.shop);
          if (!name || !d.price || typeof d.price.amount !== 'number') continue;
          // keep the cheapest listing per store
          if (!byStore[name] || d.price.amount < byStore[name].price) {
            byStore[name] = {
              store: name,
              price: d.price.amount,
              currency: d.price.currency || null,
              regular: d.regular && typeof d.regular.amount === 'number' ? d.regular.amount : null,
              cut: d.cut || 0,
              url: d.url || null,
            };
          }
        }
        // Steam first, then Epic, then GOG — stable display order
        const stores = ['Steam', 'Epic', 'GOG'].map((n) => byStore[n]).filter(Boolean);
        if (stores.length) games[appId] = { stores };
      }

      // 3) All-time historical lows (best price ever recorded, any store)
      try {
        const lows = await itad('/games/historylow/v1', key, { country: region.country }, uuids);
        for (const entry of Array.isArray(lows) ? lows : []) {
          const appId = uuidToApp[entry.id];
          const low = entry.low;
          if (!appId || !low || !games[appId]) continue;
          games[appId].historyLow = {
            price: low.price && typeof low.price.amount === 'number' ? low.price.amount : null,
            currency: (low.price && low.price.currency) || null,
            cut: low.cut || 0,
            shop: (low.shop && low.shop.name) || null,
            timestamp: low.timestamp || null,
          };
        }
      } catch (e) {
        // history lows are a bonus — don't fail the whole response over them
      }

      // 4) Normalize every price to the visitor's own currency, so one
      //    comparison never mixes two.
      const needsFx = Object.values(games).some((g) =>
        (g.stores || []).some((s) => s.currency && s.currency !== region.currency) ||
        (g.historyLow && g.historyLow.currency && g.historyLow.currency !== region.currency));
      if (needsFx) {
        const rates = await ratesFor(region.currency);
        if (rates) {
          for (const g of Object.values(games)) {
            (g.stores || []).forEach((s) => toRegion(s, region.currency, rates));
            toRegion(g.historyLow, region.currency, rates);
          }
        }
      }
    }

    const res = json({
      updated: new Date().toISOString(),
      country: region.country,
      currency: region.currency,
      games,
    });
    res.headers.set('Cache-Control', `public, max-age=${TTL_SECONDS}`);
    waitUntil(cache.put(cacheKey, res.clone()));
    return forVisitor(res, url, TTL_SECONDS);
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
