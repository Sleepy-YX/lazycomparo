# LazyComparo — Project State

_Last updated: 2026-08-01. Update this file whenever state changes materially._

> **How to resume in a new Claude session:** paste this whole file into your first
> message, or say "read `PROJECT_STATE.md`". Everything Claude needs is here.

## TL;DR

Comparison-site family, solo-developer project by Sleepy-YX (Singapore), free /
no sign-up: a 3D scrollytelling **landing** page, a PC-game **price comparator**
(current focus), and a phone **switching advisor**. Endgame is a
Mister-Mobile-meets-Carousell used-phone marketplace for Singapore.

## Live layout & deploy

| Pages project | Root dir | Domain |
|---|---|---|
| `lazycomparo-landing` | `landing` | https://lazycomparo.com |
| `lazycomparogames` | `games` | https://pcgames.lazycomparo.com |
| `lazycomparomobile` | `mobile` | https://mobile.lazycomparo.com (+ legacy lazycomparo.pages.dev) |

Repo: https://github.com/Sleepy-YX/lazycomparo — every `git push origin main`
redeploys all three in ~30–60 s. Local path: `C:\Users\yeowy\Claude\Lazycomparo`.

**Domain: `lazycomparo.com`, purchased and live** — apex and `www` both serve
200, `http://` is a single-hop 301 to HTTPS, and `www` is consolidated to the
apex by its canonical. **`.com` only — the `.sg` was considered and dropped**,
so `lazycomparo.sg` is not registered and not planned. Don't re-open it as a
"pending" decision.

## Tech stack

- **Single-file apps, no build step.** Games + mobile: React 18 UMD + Tailwind
  Play CDN + Babel Standalone (manual transform, `runtime: 'classic'`). Landing:
  vanilla JS + **three.js r158 UMD pinned via unpkg — do NOT bump; r160+ removed
  UMD builds.**
  - Exception: the phone catalog is **data, not markup** — `mobile/phones.json`,
    fetched at boot (see "Phone catalog" below). Games are still inline.
- Cloudflare Pages Functions live under `games/functions/` (that project's root).
- Local preview: PowerShell `.claude/serve.ps1` (no Node/Python on this PC).
  Ports in CWD-level `.claude/launch.json`: mobile 5173, games 5174 (alt 5184),
  landing 5175 (alt 5185) — alts exist because other sessions can hold a port.
- Brand: warm charcoal ink (`#0c0a08`), paper `#f6f1e7`, persimmon/ember
  `#d9482b`, Fraunces serif + Inter; apps stay dark, landing is light paper.

## Deal heat (cross-site colour language)

One semantic scale for "how good is this price right now", so a badge means
the same thing on the landing page and in the app:
`hot` (ember + glow) · `warm` (amber) · `mild` (emerald) · `none` (zinc).
Thresholds: **at its ITAD all-time low → always hot**, else discount `>=60`
hot, `>=30` warm, `>0` mild. An all-time low outranks the raw percentage on
purpose — 20% off a game that has never been cheaper beats a routine 50% sale.

- Games app: `HEAT` map + `dealHeat()` in `games/index.html` (just after
  `dollarsPerHour`). Drives the `PriceTag` discount badge, the "Low" marker,
  the `GameCard` ring/glow, and `Pill tone="hot"`. **Class strings are spelled
  out in full on purpose** — never build them by concatenation.
- Landing: `--heat-*` vars + `.ticker .off.hot/.warm`, same thresholds in the
  ticker IIFE. If you move a threshold, move it in both files.

## Live-data contracts (games site)

- **`/api/steam?ids=…`** — real SGD prices (incl. sale %) + review scores from
  Steam's store API (server-side; Steam blocks browser CORS). Requested in
  chunks of 15 (2 subrequests/game vs Cloudflare's 50/invocation cap), 30-min
  edge cache; front-end falls back to built-in reference data when unreachable.
- **`/api/deals`** — IsThereAnyDeal proxy (per-store prices + all-time lows).
  **Caps at `MAX_IDS` (40) by TRUNCATING, not erroring** — the front-end chunks
  requests at `DEALS_CHUNK` (30) so the 100-game catalog doesn't silently lose
  the tail (4 requests). Chunking scales, so growth costs requests, not data;
  only raise the pair if you want fewer, fatter calls.
  **Requires `ITAD_API_KEY` env var on the Pages project** (free key from
  isthereanydeal.com/apps/; returns 503 without it, UI silently falls back).
  Converts non-SGD prices to SGD via open.er-api.com (keyless), flagged
  `approx: true` → shown as `~S$…`; live `/api/steam` price overrides the Steam
  badge with the exact figure. FX failure → prices pass through labeled US$/€/£.
- **`/api/epic-free`** — Epic's official free-games promo feed, SG region, no
  key, sends `Access-Control-Allow-Origin: *`. **The landing page also consumes
  this** (freebie pill + 3D tag) — keep the response shape stable:
  `{ updated, current: [{id,title,url,image,worth,start,end}], upcoming: […] }`.
- **SEO middleware** `games/functions/_middleware.js` injects crawlable HTML
  into `#root` before React boots (React clears it on mount — progressive
  enhancement, not cloaking) + JSON-LD. Per-game pages at `/game/<slug>` get
  unique title/canonical/og via HTMLRewriter; `games/_redirects`
  (`/game/* /index.html 200`) serves the shell; `games/sitemap.xml` lists all
  game URLs. **Maintenance: the `GAMES` list in `_middleware.js` is a trimmed
  copy of the one in `games/index.html` — keep them in sync.** Same applies to
  `EXTRA_STORES` (store availability), mirrored for the no-live-data fallback.
- **The pre-render carries live prices.** `_middleware.js` calls our own
  `/api/deals` during render, so `/game/<slug>` ships a real cross-store price
  table, an all-time-low verdict, and an `AggregateOffer` built from the *same*
  numbers as the visible table (they must never disagree). Bounded by
  `DEALS_TIMEOUT_MS`; `fetchDeals()` never throws, so a missing `ITAD_API_KEY`
  or an ITAD outage degrades to the old no-price markup. Prices are filtered to
  one currency (`comparableStores`) — if the upstream FX step fails, off-currency
  listings are dropped from the table, verdict and JSON-LD together.
- **Hub pages** `/gog` and `/deals/all-time-low` — generated from the same live
  feed, re-sorted every 30 min, cross-linked from every game page (a second
  internal link into each). They lead each game page's first sentence with a
  direct "is it on GOG / is GOG cheaper" answer, which is the query shape Search
  Console shows actually ranking. **These are no-React shells** (`games/gog/`,
  `games/deals/all-time-low/`, styling in `games/hub.css`) — the app has no
  route for them, so booting it would replace the content and make Google's
  rendered pass disagree with the pre-render.

## Phone catalog (mobile site)

- **`mobile/phones.json` is the source of truth** — a plain JSON array, one
  object per phone, same shape the old inline `PHONES` array had. The app holds
  `const PHONES = window.__LC_PHONES;` and the bootstrap fetches the file before
  transforming/eval-ing the app source.
- Chosen shape is a bare array (not `{updated, phones}`) because it is exactly
  what a Supabase `select()` returns — Phase 2 swaps the loader, not the app.
- **The mobile page must be served over http.** `fetch()` on a `file://` page
  trips CORS, so double-clicking `index.html` now shows a "Couldn't load the
  phone catalog" panel naming `serve.ps1` instead of booting. Preview via
  `.claude/serve.ps1` (port 5173) as usual.
- Costs one round trip before first paint. Not preloaded on purpose: `<link
  rel="preload" as="fetch">` needs its crossorigin attribute to match the
  request exactly or the browser fetches twice, and the React/Babel/Tailwind
  CDN scripts dominate boot anyway.
- A malformed `phones.json` is a blank site rather than a degraded one, so
  `.claude/check-sync.ps1` validates it (see "Pre-push check").

## Pre-push check

`.claude/check-sync.ps1` — run before `git push`; exit 0 clean, 1 on drift:

```
powershell -NoProfile -ExecutionPolicy Bypass -File .claude\check-sync.ps1
```

Catches the silent failures in hand-maintained catalog copies: ids present in
`games/index.html` but not `functions/_middleware.js` (crawlers get the homepage
fallback), mirrored field values that drifted apart (Google indexes the stale
one), missing/orphan `sitemap.xml` entries, genres absent from `GENRE_BUCKETS`
(game falls into "Other"), `EXTRA_STORES` keys matching no game, and a
`phones.json` that is invalid, incomplete, or has duplicate ids.

It reads the JS literals with `.claude/JsLiteral.ps1`, a small JS-literal
parser (no Node on this PC). **Both scripts must stay ASCII-only** — PS 5.1
reads BOM-less `.ps1` as ANSI, so a literal `—` is a parse error.

## Client-side state (games site)

- localStorage keys: `lc-games-shortlist`, `lc-games-priorities` (merged over
  `DEFAULT_PRIORITIES` on read), `lc-games-budget` — via `usePersistedState`
  (try/catch for private mode). Stale shortlist ids dropped on load.
- Hash routing: active tab in `location.hash` (`#advisor` …), back/forward move
  between tabs; `#compare=id1,id2` boots into Compare with that shortlist (hash
  wins over storage). Compare has a "Copy share link" button emitting that format.
- Boot splash hides `#root` until the app mounts (`window.__reveal()` adds
  `html.app-ready`, removes splash node after fade); 6-s safety timer and the
  bootstrap `catch` also reveal (CDN failure → SEO content shows); `<noscript>`
  unaffected.

## Compare view (games site)

- **Verdict first.** `buildVerdict()` (above `CompareView`) picks a winner from
  the *same* `specRows` the table renders, so the banner and the per-row award
  icons can never disagree — the same single-source-of-truth rule as
  `stopProgress()` on the landing. `ROW_WEIGHT` says which rows decide a
  purchase (rating 2, $/hr 2, price 1.5, cheapest 1, hours 1, specs 0.5);
  everything else is 0 and stays off the tally.
  - **The `year` row deliberately has no `cmp`** — "newer" is not a win, and
    while it was comparable the award icons outnumbered the scoreline.
  - Ties award nobody, in both the tally and the table, or the two disagree.
  - Reasons are concrete deltas vs the runner-up, never adjectives; the caveat
    line names the spec where the runner-up genuinely wins (gap > 12).
  - Margin < 12% of total weight → "It's close." headline instead of "Get X."
- **"Only show differences"** filters rows via `raw` (comparable value behind a
  JSX cell) + `tol` (how close counts as "the same": rating 2, hours 2,
  $/hr 0.05, specs 5, price 0.50). Add both to any new row.
- `$ / hour` renders as `<ValueBar>` — longer bar = more expensive per hour,
  best of the picked games is the only one in colour.
- `useState` for `diffOnly` sits above the "fewer than 2 games" early return.

## Landing page notes

- Papercraft three.js world; 5 camera stops map to the 5 `<section>`s. WebGL /
  THREE failure → `body.no3d` CSS gradient fallback; reduced-motion → static
  camera; hidden tab → rAF pause; 0×0-viewport boot self-heals.
- **Scene look (rebuilt 2026-07-25).** Two deliberate material families: the
  paper world (ground plinths, loose keycaps, planes) keeps `flatShading`, the
  hardware props pass `flat:false` and carry real roughness/metalness. Keeping
  that split is what stops it becoming either "grey boxes" or a plastic toy.
  - `rbox(w,h,d,r)` builds a chamfered box from a rounded-rect `Shape` +
    `ExtrudeGeometry` bevel — `RoundedBoxGeometry` is examples/jsm, which the
    pinned UMD build lacks. **The bevel grows outward, so the shape is inset by
    the bevel** to land on the requested outer size. Geometry is cached by
    dimension key; without it the rack sleds alone rebuild one geometry each.
  - `scene.environment` is a hand-rolled 128x64 equirect canvas gradient.
    **Metalness renders near-black without it** — do not remove it while any
    material has `metal > 0`. The scene *background* stays the flat paper
    clear-colour; the env map is only ever seen in reflections.
  - Because the env map supplies ambient fill, `HemisphereLight` sits at 0.34
    (was 0.85). Raising both at once flattens everything out.
  - Screens are canvas-drawn product UI (`screenTex`) used as both `map` and
    `emissiveMap`, not solid emissive rectangles.
  - `contact()` paints a soft radial decal under each cluster. The shadow map
    spans ~110 units, far too coarse to read as ground contact on its own.
  - Ground uses `vnz()` (smoothstep-interpolated value noise) and smooth
    shading. Sampling `nz()` per vertex gave every triangle its own height,
    which was most of the old "raw" faceting.
  - **Cost check (1280x800):** 437 meshes but only ~103 draw calls and ~45k
    triangles per frame after culling, 0.6 ms/render, 80 shadow casters.
    Small parts set `castShadow = false` deliberately — that is what keeps the
    shadow pass cheap. Re-measure with a temporary
    `window.__lcDebug = {renderer, scene, camera}` hook if props are added.
- **Reveal choreography.** `.reveal` no longer fades the copy block as one
  lump: the container fades its scrim in, then children arrive in reading order
  on a fixed delay ladder (rule draws → eyebrow → headline lines mask up → sub
  → CTAs → proof → ticker). Headline lines are wrapped at load into
  `.ln > .i` windows by a JS pass that **must run before the IntersectionObserver**
  — the hero is already on screen, so if `.in` lands first it never animates.
  Lines split on the authored `<br>`, so nothing re-measures on resize.
  `.ln` carries `padding-bottom:.14em; margin-bottom:-.14em` or `overflow:hidden`
  shears the descenders off "Lazy for you."
  The reduced-motion block must release *every* offset child (`.reveal *`), or a
  masked headline is simply an invisible headline.
- **Grain overlay** (`.grain`) is one `feTurbulence` tile at 5% over everything;
  it is what makes the WebGL canvas and the DOM read as one printed surface.
  It jitters via `background-position`, **not** transform — growing the layer
  past the viewport (`inset:-50%`) added real horizontal overflow, because
  `body{overflow-x:hidden}` does not clip a fixed-position child.
- **Magnetic CTAs** write `--mx/--my`; CSS composes them with the hover
  `--lift`. Hover states must set `--lift`, never `transform`, or the two
  clobber each other. Fine pointers + no-reduced-motion only.
- **`stopProgress()` is the single source of truth for "where are we"** — used
  by both the camera loop and the progress rail, so they can't disagree. It
  measures section *centres* (cached; invalidated on resize / `load` /
  `fonts.ready`), NOT `scrollY / scrollHeight` — the old formula spread the 5
  stops across the whole document *including the footer*, so the finale camera
  sat at stop 3.77 when the finale copy was already centred and only reached
  4.0 once you'd scrolled the last 172 px of footer.
- **Hero proof strip + live ticker.** Hard-coded counts (100 games / 50 phones /
  3 stores — update them when either catalog grows) plus a live `/api/steam`
  call showing the 3 best current SGD
  discounts, each linking to `pcgames…/game/<slug>`. The endpoint returns no
  titles, so `SAMPLE` in the ticker IIFE carries its own `{id, slug, title}` —
  **keep those AppIDs/slugs a subset of the catalog in `games/index.html`**
  (≤20 ids, the function's `MAX_IDS`). Fails soft: fetch error → ticker stays
  hidden; stale slug → link lands on the app shell.
- The hero is height-critical. Display type is sized off viewport *width*, so
  on wide-but-short screens (720p, split screens) the h1 alone ran ~330 px and
  pushed the CTAs below the fold — hence the `max-height: 820px` type tier.
  Mobile drops the ticker entirely (stats stay, wrapping 2×2).
- Mobile header keeps the two product links; only the in-page "How it works"
  link and the CTA pill are dropped. (Hiding the whole nav stranded the phone
  advisor behind a games-only CTA.)
- `robots.txt` + `sitemap.xml` live in `landing/` and cover the root domain;
  the subdomains ship their own.
- **Copy scrim is a solid feathered rectangle** (solid rgba + same-color blurred
  box-shadow), not a radial gradient — radials have weak corners that let 3D
  props show through half-washed.
- Price-tag sprites are **projection-tuned**: at the stop-1 camera they stack at
  26–28% screen-x, clear of the copy block (46%+) and scrim feather (~33%).
  Tuning method: rebuild the stop camera in the console
  (`new THREE.PerspectiveCamera(42, innerWidth/innerHeight, …)` + `lookAt`) and
  `.project()` candidate world positions to screen-% before editing.
- Scroll-rail scroll listener is deliberately NOT rAF-throttled (rAF freezes in
  hidden tabs; browsers coalesce scroll events anyway).
- Freebie pill fetches `pcgames…/api/epic-free`; on success `__setFreeTag(title)`
  repaints the floating 3D "FREE" tag. Fetch failure → pill stays hidden.
- `og-image.png` (1200×630) is generated by a PowerShell System.Drawing script —
  regenerate the same way if the brand changes. Gotcha: PS 5.1 reads UTF-8
  scripts as ANSI — build `·`/`—` from `[char]0x00B7`/`0x2014`, never literals.

## Switching Advisor algorithm (mobile site)

Priority-weighted scoring with an ecosystem-friction penalty — code in
`scorePhone()` / `verdictFor()` in `mobile/index.html`:

```
rawScore      = Σ (priority_weight[i] × spec_score[i])   // normalized 0–100
ecoPenalty    = 0 same ecosystem · 5 different Android brand · 15 iOS↔Android
adjustedScore = rawScore − ecoPenalty
Verdict: top − current ≥ 8 "Worth upgrading" · 3–8 "Marginal" · < 3 "Wait a generation"
```

The 5/15 penalty is the product differentiator (captures iMessage/DeX/AirDrop
friction no spec-ranking site counts) — keep it in future iterations.

## Git identity

Repo-scoped (not global) for privacy: `user.name` `Sleepy-YX`,
`user.email` `299872990+Sleepy-YX@users.noreply.github.com`.

## Gotchas

1. **Babel Standalone JSX runtime:** `type="text/babel"` auto-runtime emits
   imports that fail silently in non-module scripts — use the manual
   `Babel.transform(src, { presets: [['react', { runtime: 'classic' }]] })` +
   eval pattern (last `<script>` block in games/mobile index.html).
2. **No Node/Python on this PC** (Python is a Store stub). Everything must work
   with PowerShell + CDNs only. `serve.ps1` dies on reboot — fine, Cloudflare
   hosts everything real.
3. **`serve.ps1` runs no Functions, middleware, or SPA fallback** — `/api/*`,
   `/game/<slug>`, and SEO injection are live-site-only verification. It *does*
   resolve `<dir>/index.html` (as of 2026-08-06), so `/gog` and
   `/deals/all-time-low` load their shells locally — unstyled by the middleware.
   To exercise middleware render logic without Node: fetch
   `/functions/_middleware.js` in the preview browser, strip the `export`, run it
   through `new Function(src + '; return { … }')`, and call the render helpers
   with a mock `/api/deals` payload.
4. **Embedded preview pane boots `document.hidden`** — screenshots time out,
   rAF/CSS transitions/smooth-scroll freeze, canvas sits at 300×150 until first
   visible frame (self-heals). Verify via DOM/computed styles/geometry math
   locally, then eyeball the live site.
5. **Cloudflare Pages rename quirk:** renaming a project does NOT rename its
   `.pages.dev` subdomain — delete + recreate; new subdomain needs ~60 s for SSL.
6. **Cloudflare "Create app" defaults to Workers** — for static Pages use the
   small "Looking to deploy Pages?" link at the bottom of the card.
7. **Brand history:** "SwitchWise" abandoned (UK trademark conflict) →
   LazyComparo; "we do the boring comparison work" positioning.

## Roadmap & costs

- **Phase 1 (current) — static validation.** Live. `phones.json` extracted
  (2026-08-01), catalogs grown to 100 games / 50 phones (2026-08-01). Pending:
  more mid-range/older-gen phones and Chinese-brand coverage (a `phones.json`
  edit); no used-phone pricing data yet.
- **Phase 2 — real stack:** Next.js (Vercel or CF Pages) + Supabase (Postgres,
  auth, storage); phones move to a table. Timing depends on validation.
- **Phase 3 — marketplace:** Supabase Auth, listings/photos/messages/
  transactions, realtime chat; payments Stripe or HitPay (SG-native, PayNow);
  **IMEI validation** (SG anti-theft, Carousell has it); trade-in flow (admin is
  buyer); **ToS + Privacy Policy via lawyer, PDPA compliance, register with
  PDPC**; MAS Major Payment Institution license possibly needed if escrowing funds.
- Costs: ~SGD 3/mo today (Pages free tier + the `.com`) → Phase 2 free at low
  scale, ~USD 45/mo at ~1k users (Vercel Pro + Supabase Pro).

## Open decisions

- **GitHub About panel** — stale description, concatenated topics. Not blocking.

## User preferences (for future Claude sessions)

- Concise, practical answers with recommendation + tradeoff — not surveys.
- Tables for option comparison.
- Short, terse messages ("ok continue") — efficient, not sloppy.
- Step-by-step UI walkthroughs (Cloudflare, GitHub) with screenshots as
  verification points.
- Not a developer by trade — explain enough to build understanding, no jargon.
- Singapore-based, building for the SG market.

## Quick reference

- **Add a phone:** append an object to `mobile/phones.json` (copy the shape of
  an existing entry — every phone must carry the same keys), push.
- **Add a game:** edit the catalog in `games/index.html` AND the `GAMES` list in
  `games/functions/_middleware.js` (+ sitemap), push. Also: map the new `genre`
  string in `GENRE_BUCKETS` (unmapped genres fall into an "Other" bucket), and
  add cross-store availability to `EXTRA_STORES` — read the real answer off
  `/api/deals?ids=<appId>` rather than guessing. Verify the AppID first via
  `store.steampowered.com/api/appdetails?appids=<id>&cc=sg`.
- **Card artwork** comes free from Steam's CDN via `steamArtUrl()`, keyed off
  `appId` — nothing to upload. Missing/404 art falls back to the accent tile.
- **Change UI:** edit the relevant `index.html`, preview via `serve.ps1`, push.
- **Before pushing:** run `.claude\check-sync.ps1` (see "Pre-push check").
- **Rebrand:** grep for `LazyComparo` across `mobile/`, `games/`, `landing/`,
  `README.md`; regenerate `og-image.png`.

## Changelog

- **2026-08-06** Games SEO, prompted by Search Console: 6 clicks / 395
  impressions over 3 months at avg position 24.4, and the pre-render carried no
  price at all — a page titled "Cheapest price for X" answered that query with a
  static USD MSRP. Now the middleware fetches `/api/deals` at render time and
  emits a real cross-store table, an all-time-low verdict, and an
  `AggregateOffer` (node multi-typed `VideoGame` + `Product`) built from the same
  numbers as the visible table. Top queries were GOG-shaped (`dave the diver
  gog`, `deep rock galactic gog`), so every game page now leads with a direct
  GOG answer, and two generated hubs — `/gog`, `/deals/all-time-low` — target
  that lane and give each game page a second internal link. `serve.ps1` learned
  directory-index resolution so the new subdirectory pages load locally.
- **2026-08-01** Catalogs grown: games 60 -> 100, phones 40 -> 50, and the
  landing hero counts updated to match. Every new AppID, SGD list price, review
  score, platform list and cross-store availability was read off Steam's store
  API and our own `/api/deals` before being written down — nothing guessed. The
  batch adds genres the catalog had no coverage of (fighting, racing, driving
  sim, turn-based tactics, business sim, action-adventure); those share one new
  `Action & Arcade` bucket rather than getting a bucket each, and
  `Precision Platformer` moved into it, because a two-game filter is the same
  near-empty-grid problem the buckets exist to prevent. Bucket sizes now run
  6-19 games. New phones fill the brand gaps (Google, vivo, Honor, more
  Xiaomi/OnePlus), add the first foldable, and lean mid-range. `check-sync.ps1`
  clean across all three games files + `phones.json`.
- **2026-08-01** Mobile: phone catalog extracted from `mobile/index.html` into
  `mobile/phones.json` (40 phones), fetched at boot — the Phase 2 prerequisite,
  and adding a phone is now a data edit. Verified lossless: the browser's own
  JSON of the catalog is byte-identical before and after (32,697 chars, same
  hash). New `.claude/check-sync.ps1` pre-push check (+ `JsLiteral.ps1`, a JS
  literal parser, since there's no Node here) covering the three hand-kept
  games lists and `phones.json`; it found 9 real drifts on its first run —
  `players`/`pro` values in `_middleware.js` left stale by the 2026-07-26
  design pass, i.e. Google was being served copy the site no longer showed.
  Those are now synced from the app catalog.
- **2026-07-28** Games: `robots.txt` now disallows `/api/`. Googlebot had
  scraped the endpoint paths out of the inline JS and crawled them bare —
  `/api/deals` and `/api/steam` answer 400 without `?ids=` ("Blocked due to
  other 4xx issue"), `/api/epic-free` answers 200 JSON ("Crawled - currently
  not indexed"). Search Console noise only, no user impact; the indexable
  content is pre-rendered by `_middleware.js` so blocking the Functions costs
  no ranking. The other two GSC reports were checked and are healthy:
  `http://lazycomparo.com/` is a clean single-hop 301 to HTTPS, and
  `https://www.lazycomparo.com/` is consolidated to the apex by its canonical.
- **2026-07-26** Design pass across both sites. Landing: film-grain overlay,
  editorial type (optical sizing, balanced headlines, tabular figures),
  staggered reveal choreography with masked headline lines, magnetic CTAs.
  Games: Compare rebuilt verdict-first — verdict banner with concrete reasons
  and an honest caveat, per-column scoreline, "only show differences" filter,
  `$ / hour` as bars. Deal-heat colour system (hot/warm/mild/none) shared by
  the landing ticker, game cards, price tags and the compare table.
- **2026-07-25** Landing: 3D scene rebuilt for realism — chamfered geometry
  (`rbox`), procedural env map so metalness reads, canvas-drawn product UI on
  every screen, fan units with blades/RGB rings, rack sleds with vents and
  handles, contact-shadow decals, smooth-noise terrain. Comms mast and RGB
  bollards remodelled; loose keycaps replace hard-edged cubes; circuit traces
  slimmed and plated. Narrow-phone header tiers (<=420px, <=360px).
- **2026-07-25** Landing: hero proof strip + live Steam SGD price ticker
  (3 best current discounts, deep-linked to per-game pages); camera + rail now
  driven by section geometry instead of raw document scroll (finale stop was
  arriving 172 px late); short-viewport type tier so the hero fits 720p;
  mobile keeps both product links; skip link, focus rings, `aria-current`,
  labelled sections; header docks on scroll; `robots.txt` + `sitemap.xml` for
  the root domain; JSON-LD expanded to Organization + WebSite + both apps.
- **2026-07-25** Games: catalog 30 -> 60 (all AppIDs verified against Steam;
  ratings/prices pulled from live data, not guessed). Steam header artwork on
  Browse cards + Compare chips, lazy-loaded with an accent-tile fallback.
  Genre filter now works on ~8 buckets (`GENRE_BUCKETS`) instead of 41
  near-unique labels — the specific genre still shows on the card. Added an
  on-sale-only filter, a result count and a clear-filters control. Fixed
  `/api/deals` silently dropping games past its 40-id cap by chunking client-side.
- **2026-07-18** Landing: legibility fix (solid feathered scrim,
  projection-tuned price tags). Landing: scroll progress rail + hero hint,
  og:image share card, live Epic freebie pill. Games: persisted
  shortlist/priorities/budget, hash routing, shareable `#compare=` links.
- **2026-07-17** Games: boot splash over SEO-injected HTML; rebrand to plain
  LazyComparo; store prices converted to SGD. Landing: created (3D scrollytelling,
  intended lazycomparo.com), copy-scrim + phone-vignette fixes, dark finale
  panel. Both apps: brand harmonization (warm ink, stone grays, Fraunces, ember
  CTAs). Games: tilt cards + LazyFX canvas background. Cloudflare restructured
  into the three Pages projects above.
- **2026-07-10** Games: SEO middleware (crawlable HTML + JSON-LD), robots +
  sitemap, per-game landing pages `/game/<slug>`.
- **2026-07-08** Games: live Steam SGD prices (`/api/steam`), catalog 16→30;
  cross-store deals via ITAD (`/api/deals`) + Epic freebies (`/api/epic-free`),
  Free Games + Stores tabs.
- **2026-07-05** Repo restructured into `mobile/` + `games/` subfolders;
  folder renamed Phone_Project → Lazycomparo.
