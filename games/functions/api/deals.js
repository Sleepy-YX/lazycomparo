/**
 * GET /api/deals?ids=892970,1145360,...   (Steam AppIDs)
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
 * ITAD quotes several SG-region stores (Epic, GOG, sometimes Steam) in USD,
 * which clashed with the Steam feed's SGD prices in the UI. So any non-SGD
 * amount is converted to SGD here using a live FX rate (open.er-api.com, no
 * key) and flagged `approx: true` so the front-end can show it as "~S$…".
 * If the FX fetch fails, prices pass through unconverted in their original
 * currency — the front-end still labels those honestly.
 *
 * Subrequest budget: 4 total regardless of id count (one batched lookup, one
 * prices call, one history-low call, one FX call) — far under Cloudflare's
 * 50-cap.
 */

const COUNTRY = 'SG'; // Singapore -> SGD pricing, matching /api/steam
const TTL_SECONDS = 1800; // 30 min edge cache
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

// FX rates relative to SGD (e.g. rates.USD = 0.74 means US$1 = S$1/0.74).
// Returns null on any failure so callers can skip conversion gracefully.
async function fxRatesFromSGD() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/SGD');
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.result === 'success' && data.rates ? data.rates : null;
  } catch (e) {
    return null;
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

// Mutates a price-bearing object ({ price, currency, regular? }) to SGD.
function toSGD(obj, rates) {
  if (!obj || typeof obj.price !== 'number') return;
  if (!obj.currency || obj.currency === 'SGD') { obj.currency = obj.currency || null; return; }
  const rate = rates && rates[obj.currency];
  if (!rate || rate <= 0) return; // unknown currency — leave as-is, honestly labeled
  obj.price = round2(obj.price / rate);
  if (typeof obj.regular === 'number') obj.regular = round2(obj.regular / rate);
  obj.currency = 'SGD';
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

  // Edge cache (same normalization trick as /api/steam)
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.searchParams.set('ids', ids.join(','));
  const cache = caches.default;
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

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
        country: COUNTRY, nondeals: 'true', vouchers: 'false',
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
        const lows = await itad('/games/historylow/v1', key, { country: COUNTRY }, uuids);
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

      // 4) Normalize every price to SGD so the UI never mixes currencies.
      const needsFx = Object.values(games).some((g) =>
        (g.stores || []).some((s) => s.currency && s.currency !== 'SGD') ||
        (g.historyLow && g.historyLow.currency && g.historyLow.currency !== 'SGD'));
      if (needsFx) {
        const rates = await fxRatesFromSGD();
        if (rates) {
          for (const g of Object.values(games)) {
            (g.stores || []).forEach((s) => toSGD(s, rates));
            toSGD(g.historyLow, rates);
          }
        }
      }
    }

    const res = json({ updated: new Date().toISOString(), games });
    res.headers.set('Cache-Control', `public, max-age=${TTL_SECONDS}`);
    waitUntil(cache.put(cacheKey, res.clone()));
    return res;
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
