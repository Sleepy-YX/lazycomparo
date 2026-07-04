# LazyComparo

**Smart phone comparison and switching advisor — we do the boring comparison work for you. Weighs your priorities, budget, and ecosystem trade-offs to tell you whether to upgrade or switch brands.**

A dark-themed React web app for comparing 2025/26 flagships side-by-side, aggregating pros/cons and sentiment scores, and running a personalized "should I upgrade?" analysis that accounts for the real friction of leaving an ecosystem (iMessage, DeX, AirDrop, Samsung Cloud, etc.).

Currently a single-file demo. Roadmap: expand catalog, migrate to Next.js + Supabase, layer on a used-phone marketplace (Mister-Mobile-meets-Carousell shape).

---

## Features

- **Browse** — 14 phones across 6 brands (Apple, Samsung, Google, Xiaomi, OnePlus, Nothing) with filters, search, and multi-sort.
- **Compare** — side-by-side spec matrix for 2–3 phones with per-row winner highlighting, sentiment bars, and pros/cons columns.
- **Switching Advisor** — pick your current phone, set your budget and priority sliders (camera / battery / performance / display), and get ranked recommendations with an ecosystem-friction penalty applied for cross-brand and cross-platform switches. Includes a verdict banner (*Worth upgrading* / *Marginal* / *Wait a generation*).

## Advisor algorithm

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

No build step. Just a single HTML file with React 18, Tailwind, and Babel loaded via CDN.

**Option A — open the file directly**

Double-click `index.html`. Everything works offline as long as the CDNs load.

**Option B — serve it (recommended, matches deployed behavior)**

```powershell
powershell -ExecutionPolicy Bypass -File .claude\serve.ps1 5173 .
```

Then visit `http://127.0.0.1:5173`.

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
