# LazyComparo

**"Lazy" comparison and buying advisors — we do the boring comparison work for you.** LazyComparo is a family of dark-themed React web apps, each weighing your priorities, budget, and trade-offs to tell you what's actually worth buying (or upgrading to) in a given category.

Two products live in this repo today. **Games is the current focus; mobile is secondary.**

- **[games/](games/)** — [PcGames.LazyComparo](https://pcgames.lazycomparo.com/), a PC game comparison and value advisor, and the product we're actively building out. Compares games on price, rating, hours-to-beat, and co-op support across **Steam, Epic and GOG** — including live free-game alerts and cross-store price comparison — to help you decide what's worth buying on sale (or claiming for free).
- **[mobile/](mobile/)** — smartphone comparison and switching advisor (secondary). Weighs priorities, budget, and ecosystem trade-offs (iMessage, DeX, AirDrop, Samsung Cloud, etc.) to tell you whether to upgrade or switch brands.

Currently both are single-file demos. Roadmap: expand catalogs and migrate to Next.js + Supabase.

---

## Features

### games — PC game comparison & value advisor (primary focus)

- **Browse & compare** — co-op/single-player games side-by-side on price, Steam rating, hours-to-beat, player count, and store availability (Steam / Epic / GOG badges with live per-store prices).
- **Value-focused** — built for the "what's actually worth buying on sale" question, with pros/cons per title, $/hour ranking, all-time-low price flags, and a cheapest-store row in Compare.
- **Free Games tab** — Epic's weekly freebies (current + upcoming, via Epic's own feed) plus Steam giveaways, with claim links and countdowns.
- **Stores tab** — editorial Steam vs Epic vs GOG comparison (refunds, DRM, mods, family sharing, free-game cadence).
- **Live data** — three Cloudflare Pages Functions: `/api/steam` (SGD prices + review scores), `/api/deals` (cross-store prices + historical lows via IsThereAnyDeal; needs an `ITAD_API_KEY` env var), and `/api/epic-free` (Epic free-games promo feed). Everything degrades gracefully to built-in reference data when offline.

### mobile — phone comparison & switching advisor (secondary)

- **Browse** — 14 phones across 6 brands (Apple, Samsung, Google, Xiaomi, OnePlus, Nothing) with filters, search, and multi-sort.
- **Compare** — side-by-side spec matrix for 2–3 phones with per-row winner highlighting, sentiment bars, and pros/cons columns.
- **Switching Advisor** — pick your current phone, set your budget and priority sliders (camera / battery / performance / display), and get ranked recommendations with an ecosystem-friction penalty applied for cross-brand and cross-platform switches. Includes a verdict banner (*Worth upgrading* / *Marginal* / *Wait a generation*).

## Advisor algorithm (mobile)

```
For each candidate phone within budget:
  rawScore     = Σ (priority_weight[i] × spec_score[i])  // normalized 0–100
  ecoPenalty   = 0   if same ecosystem (e.g. Samsung → Samsung)
                 5   if different Android brand (Samsung Cloud, DeX, etc. lost)
                15   if crossing iOS ↔ Android (iMessage/AirDrop/DeX/iCloud lost)
  adjustedScore = rawScore − ecoPenalty

Verdict:
  if topPick.adjusted − currentPhoneScore >= 8  → Worth upgrading
  if between 3 and 8                            → Marginal upgrade
  otherwise                                     → Wait a generation
```

Each recommendation surfaces: the two priorities the phone matches best, the ecosystem features you'd lose vs. gain, and (for cross-platform switches) a friction warning about messages/backups/paid apps not coming with you.

## Run it locally

No build step. Each product is a single HTML file with React 18, Tailwind, and Babel loaded via CDN.

**Option A — open the file directly**

Double-click `mobile/index.html` or `games/index.html`. Everything works offline as long as the CDNs load.

**Option B — serve it (recommended, matches deployed behavior)**

```powershell
powershell -ExecutionPolicy Bypass -File .claude\serve.ps1 5173 mobile
powershell -ExecutionPolicy Bypass -File .claude\serve.ps1 5174 games
```

Then visit `http://127.0.0.1:5173` (mobile) or `http://127.0.0.1:5174` (games).

The included `.claude/serve.ps1` is a tiny static server built on `System.Net.HttpListener` — no Node or Python required.

## Tech stack (current)

- React 18 (UMD via CDN)
- Tailwind CSS (Play CDN)
- Babel Standalone (JSX transform, pinned to `runtime: classic`)
- Inline SVG icons in Lucide style
- PowerShell static server for local preview

## Roadmap

- **Phase 1 — validation**: Deploy this HTML to Cloudflare Pages / Vercel for public feedback.
- **Phase 2 — real stack**: Migrate to Next.js on Vercel + Supabase (Postgres, auth, storage, realtime). Move the phone dataset out of the frontend.
- **Phase 3 — marketplace**: User accounts, listings CRUD, buyer/seller chat (Supabase Realtime), Stripe / HitPay checkout, trade-in flow.

## License

No license specified — all rights reserved for now. Reach out if you want to reuse the code.
