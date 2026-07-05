# LazyComparo

**"Lazy" comparison and buying advisors — we do the boring comparison work for you.** LazyComparo is a family of dark-themed React web apps, each weighing your priorities, budget, and trade-offs to tell you what's actually worth buying (or upgrading to) in a given category.

Two products live in this repo today:

- **[mobile/](mobile/)** — smartphone comparison and switching advisor. Weighs priorities, budget, and ecosystem trade-offs (iMessage, DeX, AirDrop, Samsung Cloud, etc.) to tell you whether to upgrade or switch brands.
- **[games/](games/)** — [PcGames.LazyComparo](https://pcgames.lazycomparo.com/), a Steam game comparison and value advisor. Compares games on price, rating, hours-to-beat, and co-op support to help you decide what's worth buying on sale.

Currently both are single-file demos. Roadmap: expand catalogs, migrate to Next.js + Supabase, and (for mobile) layer on a used-phone marketplace (Mister-Mobile-meets-Carousell shape).

---

## Features

### mobile — phone comparison & switching advisor

- **Browse** — 14 phones across 6 brands (Apple, Samsung, Google, Xiaomi, OnePlus, Nothing) with filters, search, and multi-sort.
- **Compare** — side-by-side spec matrix for 2–3 phones with per-row winner highlighting, sentiment bars, and pros/cons columns.
- **Switching Advisor** — pick your current phone, set your budget and priority sliders (camera / battery / performance / display), and get ranked recommendations with an ecosystem-friction penalty applied for cross-brand and cross-platform switches. Includes a verdict banner (*Worth upgrading* / *Marginal* / *Wait a generation*).

### games — Steam game comparison & value advisor

- **Browse & compare** — Steam co-op/single-player games side-by-side on price, Steam rating, hours-to-beat, player count, and platform.
- **Value-focused** — built for the "what's actually worth buying on sale" question, with pros/cons per title (bugs, grind, playerbase size, etc.).

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
