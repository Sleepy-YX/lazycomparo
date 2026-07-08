# LazyComparo — Project State

_Last updated: 2026-07-08. Update this file whenever state changes materially._

**2026-07-08:** Games site upgraded from static mock data to **live Steam data**. Added a Cloudflare Pages Function at `games/functions/api/steam.js` (route `/api/steam?ids=...`) that server-side-fetches real SGD prices (incl. current sale price + discount %) and review scores from Steam's store API — needed because Steam blocks browser CORS. The front-end (`useSteamLive` hook + `GamesContext`) requests ids in chunks of 15 to stay under Cloudflare's 50-subrequest/invocation cap (2 subrequests per game), edge-caches 30 min, and falls back to built-in reference data when the endpoint is unreachable (e.g. local dev, which has no Functions). Catalog grown 16 → **30 games, newest-first**, each with a verified Steam `appId`. New UI: sale badges (`PriceTag`), "On sale" sort, "View on Steam" deep-links, live/reference status pill in the header. **Not yet committed/deployed.** Gotcha: the `functions/` dir must sit at the Pages *root directory* — since this project's root is `games/`, it lives at `games/functions/`; `serve.ps1` can't run Functions, so live prices only appear on the deployed site.

**2026-07-05:** Restructured repo into `mobile/` (phone comparator) and `games/` (Steam comparator) subfolders ahead of deploying pcgames.lazycomparo.com, so future product lines have a consistent home. Local folder renamed `Phone_Project` → `Lazycomparo`. Cloudflare Pages root-directory setting needs updating before next push (see Repo structure section).

> **How to resume in a new Claude session:** paste this whole file into your first message, or say "read `PROJECT_STATE.md`". Everything Claude needs to continue is here.

---

## TL;DR

Smart phone comparison + switching advisor web app. Currently Phase 1 (static validation). Endgame is a Mister-Mobile-meets-Carousell used-phone marketplace for Singapore. Solo-developer project by Sleepy-YX (Singapore).

## Live URLs

| What | Where |
|---|---|
| Live app | https://lazycomparo.pages.dev |
| GitHub repo | https://github.com/Sleepy-YX/lazycomparo |
| Local dev | http://127.0.0.1:5173 (via `.claude/serve.ps1`) |
| Local path | `C:\Users\yeowy\Claude\Lazycomparo` |

## Current tech stack

- **Single-file React app** — `index.html`, no build step, everything loaded via CDN
- React 18 UMD, Tailwind Play CDN, Babel Standalone (manual transform, `runtime: 'classic'`)
- Inline SVG icons in Lucide style
- **PowerShell static server** for local preview (`.claude/serve.ps1`) — no Node/Python required (user has neither installed)
- Data: 14 phones as a JS `const PHONES = [...]` array in `index.html` around line 178
- No backend, no database, no auth

## Deploy pipeline

Every `git push origin main` → Cloudflare Pages redeploys in ~30 seconds. Zero config, zero manual work.

## Repo structure

```
Lazycomparo/
├── mobile/                # lazycomparo.com — phone comparator (flagship product)
│   ├── index.html         # the whole app (~1000 lines)
│   ├── robots.txt
│   ├── sitemap.xml
│   └── youtube/           # marketing video assets/scripts for the phone-advisor video
├── games/                 # pcgames.lazycomparo.com — Steam game comparator (not yet deployed)
│   └── index.html
├── README.md              # public-facing project description
├── PROJECT_STATE.md       # this file
├── .gitignore             # Node preset (for future Next.js migration)
└── .claude/
    ├── serve.ps1          # PowerShell static server
    └── launch.json        # Claude Code preview config (mobile:5173, games:5174)
```

**Cloudflare Pages note:** each site is now in its own subfolder, so each Pages project's "Build output directory" (a.k.a. root directory) must be set to the matching folder name (`mobile` for lazycomparo.com, `games` for pcgames.lazycomparo.com) instead of `/`. The existing `lazycomparo` Pages project (serving lazycomparo.com) needs this setting updated before the next push, or the live site will 404 on `index.html`.

## Switching Advisor algorithm

Priority-weighted scoring with an ecosystem-friction penalty.

```
For each candidate phone within budget:
  rawScore     = Σ (priority_weight[i] × spec_score[i])  // normalized 0–100
  ecoPenalty   = 0   if same ecosystem (Samsung → Samsung)
                 5   if different Android brand (Samsung → Pixel)
                15   if crossing iOS ↔ Android (iMessage/AirDrop loss)
  adjustedScore = rawScore − ecoPenalty

Verdict:
  topPick.adjusted − currentPhoneScore ≥ 8  → "Worth upgrading"
  between 3 and 8                            → "Marginal upgrade"
  under 3                                    → "Wait a generation"
```

Code lives in `scorePhone()` and `verdictFor()` in `index.html`.

## Git identity

Scoped at the repo level (not global) for privacy:
- `user.name`: `Sleepy-YX`
- `user.email`: `299872990+Sleepy-YX@users.noreply.github.com` (GitHub noreply — keeps real Gmail out of public log)

## Cost picture

| Phase | Monthly | Notes |
|---|---|---|
| Now (Phase 1) | $0 | Cloudflare Pages free tier, no domain yet |
| + custom domain | ~SGD $3/mo | `.sg` ≈ SGD 30–40/yr, or `.io/.app/.com` USD 10–40/yr |
| Phase 2 free tier | $0 | Vercel Hobby + Supabase Free work at low scale |
| Phase 2 at ~1k users | ~USD $45/mo | Vercel Pro $20 + Supabase Pro $25 |

## Roadmap

### Phase 1 — Static validation (current)
- ✅ Live at `lazycomparo.pages.dev`
- 🟡 Extract phones to `phones.json` (was recommended; user hasn't confirmed yet)
- 🟡 Add 10–20 more phones (mid-range, older-gen — currently only 14)
- 🟡 Buy custom domain (see Open Decisions)

### Phase 2 — Real stack
- Migrate to **Next.js on Vercel or Cloudflare Pages**
- **Supabase** for Postgres + auth + storage + realtime
- Move phone data from JSON to `phones` table (spreadsheet-editable via Supabase Studio)
- Environment variables for Supabase URL + anon key

### Phase 3 — Marketplace
- User accounts (Supabase Auth)
- `listings`, `listing_photos`, `messages`, `transactions` tables
- Buyer/seller chat via Supabase Realtime
- Payments: **Stripe** (marketplace-friendly, supports PayNow) or **HitPay** (SG-native, GrabPay/PayNow/cards)
- **IMEI validation** (Singapore anti-theft requirement — Carousell has this)
- Trade-in flow (Mister Mobile pattern: same schema as a listing, admin is buyer)
- **ToS + Privacy Policy required** — get a lawyer. PDPA compliance for SG data. Register with PDPC.
- MAS Major Payment Institution license may be required if holding funds in escrow

## Non-obvious gotchas learned

### 1. Babel Standalone JSX runtime
`<script type="text/babel" data-presets="react">` uses the **automatic** JSX runtime which emits `import { jsx } from 'react/jsx-runtime'`. Import statements fail silently in a non-module script and the app never mounts. **Fix (already applied):** manual transform via `Babel.transform(src, { presets: [['react', { runtime: 'classic' }]] })` then `eval`. See the last `<script>` block in `index.html`.

### 2. No Node/Python on user's PC
Python is a Microsoft Store stub (fake). Node not installed. Local server is `.claude/serve.ps1` using PowerShell + `System.Net.HttpListener`. Zero dependencies.

### 3. Local server does not auto-start
`serve.ps1` runs when you launch it (or when Claude spawns it via preview). No Windows service, no Startup entry. Dies on PC reboot. This is fine — Cloudflare Pages handles all real hosting.

### 4. Cloudflare Pages rename quirk
Renaming a project internally does NOT rename the `.pages.dev` subdomain. To get a clean subdomain URL, must delete + recreate. New subdomain needs ~60s for SSL cert provisioning; browser DNS cache may serve stale results — use `ipconfig /flushdns` or hard-refresh with Ctrl+Shift+R.

### 5. Cloudflare's "Create app" flow pushes you into Workers
The unified Cloudflare UI now defaults to the Workers flow which requires `wrangler.toml`. For static sites, find the small "Looking to deploy Pages? Get started" link at the bottom of the "Ship something new" card. That's the classic Pages flow.

### 6. Brand name research
- "SwitchWise" was our first name but SwitchWise Limited (UK) owns switchwise.com since 2006 (still active). Renamed to **LazyComparo** (all TLDs .com/.io/.sg/.app/.co available, no brand conflicts found).
- Playful "we do the boring comparison work" positioning.

### 7. Ecosystem penalty is the differentiator
Every other phone comparison site just ranks by specs. The 5/15 point penalty for cross-brand/cross-platform switches is what makes the advisor genuinely useful — it captures the real friction of leaving iMessage, DeX, AirDrop, etc. Keep this in future iterations.

## Open decisions (not yet resolved)

- **Custom domain** — not purchased. Options: `lazycomparo.sg` (SGD 30/yr, Vodien or Exabytes), `lazycomparo.io` (USD 35/yr, Cloudflare Registrar), `lazycomparo.app` (USD 14/yr, Cloudflare Registrar), `lazycomparo.com` (USD 9/yr, Cloudflare Registrar). Recommendation: `.sg` for local SEO + `.com` as defensive.
- **`phones.json` extraction** — pending. Would let user add phones by editing JSON, no code changes. Prerequisite for Supabase migration.
- **More phones** — catalog is only 14; user wanted "12+ with older-gen." Room to add mid-range Redmi, Motorola, Nothing Phone 2, iPhone 15 Plus, Galaxy A55, etc.
- **Phase 2 timing** — depends on validation feedback.
- **GitHub About panel cleanup** — description still says old wording; topics got concatenated into one hyphenated string on repo creation. Not blocking.

## User preferences (for future Claude sessions)

- Prefers **concise, practical answers with recommendation + tradeoff** — not exhaustive surveys
- Prefers **tables for option comparison**
- Communicates in **short, terse messages** (e.g. "ok continue", "yes do that", "let me use X"). Not sloppy — just efficient.
- Wants **step-by-step guidance for UI walkthroughs** (Cloudflare, GitHub) with screenshots as verification points
- **Not a developer by trade** — Cloudflare account was fresh, no Node/Python, first git repo. Explain enough to build understanding, don't drown in jargon.
- Singapore-based (yeowyx@gmail.com), building for the SG market

## Quick reference — how to work on this project

**Add a phone:**
1. Edit `PHONES` array in `mobile/index.html` around line 178
2. Commit + push → auto-deploys in ~30s
3. Or ask Claude "add a Galaxy A55 phone" and Claude does it

**Change UI:**
1. Edit `mobile/index.html`
2. Test locally: `powershell -File .claude\serve.ps1 5173 mobile` then `http://127.0.0.1:5173`
3. Commit + push

**Rename or rebrand:** grep for `LazyComparo` — appears in 3 places in `mobile/index.html` and 1 in `README.md`.

**Get Claude up to speed:** paste this file in first message of a new session.
