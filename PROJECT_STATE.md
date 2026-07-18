# LazyComparo — Project State

_Last updated: 2026-07-18. Update this file whenever state changes materially._

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

## Tech stack

- **Single-file apps, no build step.** Games + mobile: React 18 UMD + Tailwind
  Play CDN + Babel Standalone (manual transform, `runtime: 'classic'`). Landing:
  vanilla JS + **three.js r158 UMD pinned via unpkg — do NOT bump; r160+ removed
  UMD builds.**
- Cloudflare Pages Functions live under `games/functions/` (that project's root).
- Local preview: PowerShell `.claude/serve.ps1` (no Node/Python on this PC).
  Ports in CWD-level `.claude/launch.json`: mobile 5173, games 5174 (alt 5184),
  landing 5175 (alt 5185) — alts exist because other sessions can hold a port.
- Brand: warm charcoal ink (`#0c0a08`), paper `#f6f1e7`, persimmon/ember
  `#d9482b`, Fraunces serif + Inter; apps stay dark, landing is light paper.

## Live-data contracts (games site)

- **`/api/steam?ids=…`** — real SGD prices (incl. sale %) + review scores from
  Steam's store API (server-side; Steam blocks browser CORS). Requested in
  chunks of 15 (2 subrequests/game vs Cloudflare's 50/invocation cap), 30-min
  edge cache; front-end falls back to built-in reference data when unreachable.
- **`/api/deals`** — IsThereAnyDeal proxy (per-store prices + all-time lows).
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
  copy of the one in `games/index.html` — keep them in sync.**

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

## Landing page notes

- Papercraft three.js world; 5 camera stops map to the 5 `<section>`s. WebGL /
  THREE failure → `body.no3d` CSS gradient fallback; reduced-motion → static
  camera; hidden tab → rAF pause; 0×0-viewport boot self-heals.
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
   `/game/<slug>`, and SEO injection are live-site-only verification.
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

- **Phase 1 (current) — static validation.** Live. Pending: extract
  `phones.json`, grow phone catalog (14 now; wants mid-range/older-gen), buy
  custom domain.
- **Phase 2 — real stack:** Next.js (Vercel or CF Pages) + Supabase (Postgres,
  auth, storage); phones move to a table. Timing depends on validation.
- **Phase 3 — marketplace:** Supabase Auth, listings/photos/messages/
  transactions, realtime chat; payments Stripe or HitPay (SG-native, PayNow);
  **IMEI validation** (SG anti-theft, Carousell has it); trade-in flow (admin is
  buyer); **ToS + Privacy Policy via lawyer, PDPA compliance, register with
  PDPC**; MAS Major Payment Institution license possibly needed if escrowing funds.
- Costs: $0 now (Pages free tier) → ~SGD 3/mo with domain → Phase 2 free at low
  scale, ~USD 45/mo at ~1k users (Vercel Pro + Supabase Pro).

## Open decisions

- **Custom domain** — not purchased. Recommendation: `.sg` (SGD 30/yr) for local
  SEO + `.com` (USD 9/yr, CF Registrar) defensive. `www.lazycomparo.com` also
  still unclaimed (add to landing project).
- **`phones.json` extraction** — pending; prerequisite for Supabase migration.
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

- **Add a phone:** edit `PHONES` array in `mobile/index.html` (~line 178), push.
- **Add a game:** edit the catalog in `games/index.html` AND the `GAMES` list in
  `games/functions/_middleware.js` (+ sitemap), push.
- **Change UI:** edit the relevant `index.html`, preview via `serve.ps1`, push.
- **Rebrand:** grep for `LazyComparo` across `mobile/`, `games/`, `landing/`,
  `README.md`; regenerate `og-image.png`.

## Changelog

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
