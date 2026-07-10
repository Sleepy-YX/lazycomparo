// SEO pre-render middleware for pcgames.lazycomparo.com
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// The site is a single-file React app transformed by Babel *in the browser*.
// The raw HTML a crawler fetches is an empty <div id="root">, so Google sees no
// content -> effectively invisible in search. This middleware injects real,
// indexable HTML into #root and adds JSON-LD structured data BEFORE the React
// app boots. React's createRoot() clears #root on first render and takes over,
// so real users get the full interactive app while crawlers (and JS-less
// clients) get content. Progressive enhancement / pre-render, not cloaking.
//
// TWO ROUTES ARE HANDLED:
//   /                -> homepage: ItemList JSON-LD + a linked list of all games
//   /game/<slug>     -> per-game landing page: unique <title>/description/
//                       canonical/og, a single-game detail block, and
//                       VideoGame + BreadcrumbList JSON-LD. The slug is the
//                       game id. `games/_redirects` rewrites /game/* to the app
//                       shell so context.next() serves index.html for these.
//
// KEEP IN SYNC: the GAMES list below is a trimmed, SEO-only copy of the GAMES
// array in ../index.html. When you add/remove a game there, mirror it here (and
// it will appear in the sitemap-worthy set automatically). Prices are the USD
// reference MSRP (the live site localizes to SGD at runtime).
// ---------------------------------------------------------------------------

const GAMES = [
  { id: 'balatro', appId: 2379780, title: 'Balatro', studio: 'LocalThunk', genre: 'Roguelike Deckbuilder', year: 2024, price: 14.5, rating: 96, hours: 35, players: 'Single-player only', pro: 'Endlessly moreish "just one more run" loop' },
  { id: 'black-myth-wukong', appId: 2358720, title: 'Black Myth: Wukong', studio: 'Game Science', genre: 'Action RPG', year: 2024, price: 50, rating: 92, hours: 40, players: 'Single-player only', pro: 'Jaw-dropping visuals and boss spectacle' },
  { id: 'hades-2', appId: 1145350, title: 'Hades II', studio: 'Supergiant Games', genre: 'Roguelike', year: 2024, price: 29, rating: 94, hours: 35, players: 'Single-player only', pro: 'Builds on Hades with more weapons and systems' },
  { id: 'space-marine-2', appId: 2183900, title: 'Warhammer 40K: Space Marine 2', studio: 'Saber Interactive', genre: 'Co-op Shooter', year: 2024, price: 60, rating: 90, hours: 12, players: '3-player co-op campaign + Operations', pro: 'Visceral melee + gunplay against huge Tyranid swarms' },
  { id: 'frostpunk-2', appId: 1601580, title: 'Frostpunk 2', studio: '11 bit studios', genre: 'City Survival', year: 2024, price: 45, rating: 82, hours: 25, players: 'Single-player', pro: 'Bigger, society-scale scope than the original' },
  { id: 'manor-lords', appId: 1363080, title: 'Manor Lords', studio: 'Slavic Magic', genre: 'City Builder', year: 2024, price: 39, rating: 88, hours: 30, players: 'Single-player', pro: 'Gorgeous, organic medieval town-building' },
  { id: 'dragons-dogma-2', appId: 2054970, title: "Dragon's Dogma 2", studio: 'Capcom', genre: 'Action RPG', year: 2024, price: 60, rating: 78, hours: 35, players: 'Single-player (AI Pawns)', pro: 'Physics-driven combat and climbable monsters' },
  { id: 'pacific-drive', appId: 1458140, title: 'Pacific Drive', studio: 'Ironwood Studios', genre: 'Survival Driving', year: 2024, price: 40, rating: 86, hours: 25, players: 'Single-player', pro: 'Your station wagon is a brilliant central "character"' },
  { id: 'content-warning', appId: 2881650, title: 'Content Warning', studio: 'Landfall', genre: 'Co-op Horror', year: 2024, price: 10, rating: 90, hours: 20, players: '1-4 co-op', pro: 'Filming monsters for "views" is a hilarious hook' },
  { id: 'satisfactory', appId: 526870, title: 'Satisfactory', studio: 'Coffee Stain', genre: 'Factory Building', year: 2024, price: 50, rating: 96, hours: 80, players: 'Online co-op, drop-in', pro: 'First-person factory-building is uniquely immersive' },
  { id: 'enshrouded', appId: 1203620, title: 'Enshrouded', studio: 'Keen Games', genre: 'Survival Crafting', year: 2024, price: 35, rating: 92, hours: 50, players: 'Up to 16 co-op', pro: 'Voxel terrain lets you dig/build almost anywhere' },
  { id: 'v-rising', appId: 1604030, title: 'V Rising', studio: 'Stunlock Studios', genre: 'Survival Vampire', year: 2024, price: 28, rating: 88, hours: 45, players: '1-4 co-op, PvE/PvP servers', pro: 'Action-combat is sharper than most survival games' },
  { id: 'sons-of-the-forest', appId: 1326470, title: 'Sons of the Forest', studio: 'Endnight Games', genre: 'Survival Horror', year: 2024, price: 35, rating: 85, hours: 20, players: 'Up to 8 co-op', pro: 'Tense horror atmosphere with genuinely creepy enemies' },
  { id: 'palworld', appId: 1623730, title: 'Palworld', studio: 'Pocketpair', genre: 'Survival Crafting', year: 2024, price: 35, rating: 84, hours: 50, players: 'Up to 32 on dedicated servers', pro: '"Pokemon with guns" hook delivered on launch hype' },
  { id: 'helldivers-2', appId: 553850, title: 'Helldivers 2', studio: 'Arrowhead Game Studios', genre: 'Co-op Shooter', year: 2024, price: 45, rating: 82, hours: 80, players: '1-4 co-op, live-service galactic war', pro: 'Friendly-fire chaos + big stratagem explosions never get old' },
  { id: 'lies-of-p', appId: 1627720, title: 'Lies of P', studio: 'Neowiz', genre: 'Soulslike RPG', year: 2023, price: 60, rating: 90, hours: 35, players: 'Single-player', pro: 'One of the best non-FromSoft soulslikes' },
  { id: 'dave-the-diver', appId: 1868140, title: 'Dave the Diver', studio: 'MINTROCKET', genre: 'Adventure', year: 2023, price: 25, rating: 96, hours: 30, players: 'Single-player', pro: 'Dive-by-day, run-a-sushi-bar-by-night loop is addictive' },
  { id: 'sea-of-stars', appId: 1244090, title: 'Sea of Stars', studio: 'Sabotage Studio', genre: 'Turn-based RPG', year: 2023, price: 42, rating: 92, hours: 30, players: 'Local co-op (up to 3)', pro: 'Gorgeous modern take on classic SNES-era RPGs' },
  { id: 'baldurs-gate-3', appId: 1086940, title: "Baldur's Gate 3", studio: 'Larian Studios', genre: 'CRPG', year: 2023, price: 65, rating: 96, hours: 100, players: 'Up to 4 co-op, drop-in/out', pro: 'Widely considered one of the best RPGs ever made' },
  { id: 'remnant2', appId: 1282100, title: 'Remnant II', studio: 'Gunfire Games', genre: 'Soulslike Co-op Shooter', year: 2023, price: 50, rating: 89, hours: 25, players: 'Up to 3 co-op, drop-in/out', pro: 'Procedural worlds mean genuine replay variety' },
  { id: 'lethal-company', appId: 1966720, title: 'Lethal Company', studio: 'Zeekerss', genre: 'Co-op Horror', year: 2023, price: 12, rating: 97, hours: 50, players: '1-4 co-op', pro: 'Best price-to-laughs ratio on this list' },
  { id: 'cult-of-the-lamb', appId: 1313140, title: 'Cult of the Lamb', studio: 'Massive Monster', genre: 'Roguelike', year: 2022, price: 36, rating: 92, hours: 20, players: 'Local co-op', pro: 'Cult-management + roguelike-dungeon blend is unique' },
  { id: 'elden-ring', appId: 1245620, title: 'Elden Ring', studio: 'FromSoftware', genre: 'Soulslike RPG', year: 2022, price: 70, rating: 95, hours: 60, players: 'Limited co-op via summon signs', pro: 'Open-world design gives Soulslike combat room to breathe' },
  { id: 'valheim', appId: 892970, title: 'Valheim', studio: 'Iron Gate', genre: 'Survival Crafting', year: 2021, price: 14, rating: 96, hours: 60, players: 'Up to 10 co-op (dedicated server)', pro: 'Gorgeous procedural biomes for a small-studio game' },
  { id: 'icarus', appId: 1149460, title: 'Icarus', studio: 'RocketWerkz', genre: 'Survival Extraction', year: 2021, price: 30, rating: 78, hours: 40, players: 'Up to 8 co-op, session-based', pro: 'Session/extraction structure is a nice twist on survival-crafting' },
  { id: 'it-takes-two', appId: 1426210, title: 'It Takes Two', studio: 'Hazelight Studios', genre: 'Co-op Adventure', year: 2021, price: 40, rating: 97, hours: 14, players: 'Exactly 2 (Friend’s Pass for one buyer)', pro: 'Constantly reinvents its mechanics — rarely repeats an idea' },
  { id: 'deep-rock-galactic', appId: 548430, title: 'Deep Rock Galactic', studio: 'Ghost Ship Games', genre: 'Co-op Extraction Shooter', year: 2020, price: 30, rating: 97, hours: 100, players: '1-4 co-op, drop-in matchmaking', pro: 'Near-perfect co-op loop, Overwhelmingly Positive reviews' },
  { id: 'hades', appId: 1145360, title: 'Hades', studio: 'Supergiant Games', genre: 'Roguelike', year: 2020, price: 28, rating: 98, hours: 30, players: 'Single-player only', pro: 'Story deepens with every run — rare for a roguelike' },
  { id: 'stardew-valley', appId: 413150, title: 'Stardew Valley', studio: 'ConcernedApe', genre: 'Farming Sim', year: 2016, price: 19, rating: 98, hours: 53, players: 'Up to 4 co-op farms', pro: 'Extremely relaxing pace, easy to pick up and put down' },
  { id: 'terraria', appId: 105600, title: 'Terraria', studio: 'Re-Logic', genre: 'Sandbox Survival', year: 2011, price: 14, rating: 97, hours: 100, players: 'Up to 8 co-op', pro: 'Absurd amount of content for the price' },
];

const SITE = 'https://pcgames.lazycomparo.com';
const BY_ID = new Map(GAMES.map((g) => [g.id, g]));

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const steamUrl = (appId) => `https://store.steampowered.com/app/${appId}/`;
const gamePath = (id) => `${SITE}/game/${id}`;

// Up to 4 related games: same genre first, then fill from neighbours.
function relatedGames(game) {
  const sameGenre = GAMES.filter((g) => g.id !== game.id && g.genre === game.genre);
  const others = GAMES.filter((g) => g.id !== game.id && g.genre !== game.genre);
  return [...sameGenre, ...others].slice(0, 4);
}

/* -------------------------------- HOMEPAGE -------------------------------- */

function homeHtml() {
  const cards = GAMES.map((g) => `
    <article>
      <h2><a href="${gamePath(g.id)}">${esc(g.title)}</a></h2>
      <p>${esc(g.genre)} by ${esc(g.studio)} (${g.year}). ${esc(g.players)}.
      ${g.rating}% positive Steam reviews, about ${g.hours} hours to beat.
      Reference price from US$${g.price.toFixed(2)} — compare live Steam, Epic and GOG prices and the all-time-low.</p>
      <p>${esc(g.pro)}</p>
      <p><a href="${gamePath(g.id)}">Compare ${esc(g.title)} prices &rarr;</a></p>
    </article>`).join('');

  return `
    <header>
      <h1>Compare PC Game Prices Across Steam, Epic &amp; GOG</h1>
      <p>LazyComparo tracks live prices, review scores, hours-to-beat and co-op support for ${GAMES.length}+ popular PC games,
      shows which store (Steam, Epic or GOG) is cheapest right now, flags the all-time-low price, and lists this week's
      free Epic Games Store titles. We do the boring price comparison so you don't have to.</p>
    </header>
    <main>
      <h2>Games we compare</h2>
      ${cards}
    </main>
    <footer><p>Loading the interactive comparison&hellip; if it doesn't appear, enable JavaScript.</p></footer>`;
}

function homeJsonLd() {
  const items = GAMES.map((g, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: gamePath(g.id),
    item: {
      '@type': 'VideoGame',
      name: g.title,
      genre: g.genre,
      gamePlatform: 'PC',
      operatingSystem: 'Windows',
      datePublished: String(g.year),
      author: { '@type': 'Organization', name: g.studio },
      offers: {
        '@type': 'Offer',
        price: g.price.toFixed(2),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: gamePath(g.id),
      },
    },
  }));
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'PC games compared on LazyComparo',
    itemListElement: items,
  };
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/* ------------------------------ GAME LANDING ------------------------------ */

function gameMeta(g) {
  return {
    title: `Cheapest price for ${g.title} on PC — Steam vs Epic vs GOG | LazyComparo`,
    description: `Is ${g.title} cheaper on Steam, Epic or GOG? Compare live prices and see the all-time-low. ${g.rating}% positive Steam rating, about ${g.hours}h to beat. ${g.genre} by ${g.studio} (${g.year}).`,
    canonical: gamePath(g.id),
  };
}

function gameHtml(g) {
  const related = relatedGames(g).map((r) =>
    `<li><a href="${gamePath(r.id)}">${esc(r.title)}</a> — ${esc(r.genre)}</li>`).join('');

  return `
    <nav aria-label="Breadcrumb"><a href="${SITE}/">All games</a> &rsaquo; <span>${esc(g.title)}</span></nav>
    <main>
      <h1>Cheapest price for ${esc(g.title)} on PC</h1>
      <p>${esc(g.title)} is a ${esc(g.genre)} by ${esc(g.studio)}, released ${g.year}. ${esc(g.players)}.
      It holds a ${g.rating}% positive rating on Steam and takes about ${g.hours} hours to beat.</p>
      <p>${esc(g.pro)}</p>

      <h2>Where to buy ${esc(g.title)} cheapest</h2>
      <p>LazyComparo compares the live ${esc(g.title)} price across Steam, the Epic Games Store and GOG, and shows the
      all-time-low so you know whether now is a good time to buy. Reference price from US$${g.price.toFixed(2)};
      the live site shows current Singapore-store pricing and any active discount.</p>
      <p><a href="${steamUrl(g.appId)}" rel="nofollow">View ${esc(g.title)} on Steam</a></p>

      <h2>Similar games to compare</h2>
      <ul>${related}</ul>

      <p><a href="${SITE}/">&larr; Browse all ${GAMES.length} PC games on LazyComparo</a></p>
    </main>`;
}

function gameJsonLd(g) {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'VideoGame',
        name: g.title,
        genre: g.genre,
        gamePlatform: 'PC',
        operatingSystem: 'Windows',
        datePublished: String(g.year),
        author: { '@type': 'Organization', name: g.studio },
        publisher: { '@type': 'Organization', name: g.studio },
        url: gamePath(g.id),
        offers: {
          '@type': 'Offer',
          price: g.price.toFixed(2),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: steamUrl(g.appId),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'All games', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: g.title, item: gamePath(g.id) },
        ],
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/* -------------------------------- ROUTING --------------------------------- */

export async function onRequest(context) {
  const response = await context.next();

  // Only rewrite the HTML document. API routes (/api/*) and other assets pass
  // straight through.
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  const path = new URL(context.request.url).pathname;
  const slugMatch = path.match(/^\/game\/([^/]+)\/?$/);
  const game = slugMatch ? BY_ID.get(decodeURIComponent(slugMatch[1])) : null;

  // Unknown /game/<slug> -> fall back to homepage content (harmless).
  const isGamePage = Boolean(game);
  const rootHtml = isGamePage ? gameHtml(game) : homeHtml();
  const jsonLd = isGamePage ? gameJsonLd(game) : homeJsonLd();
  const meta = isGamePage ? gameMeta(game) : null;

  const rewriter = new HTMLRewriter()
    .on('head', { element(el) { el.append(jsonLd, { html: true }); } })
    .on('#root', { element(el) { el.setInnerContent(rootHtml, { html: true }); } });

  if (meta) {
    rewriter
      .on('title', { element(el) { el.setInnerContent(meta.title); } })
      .on('meta[name="description"]', { element(el) { el.setAttribute('content', meta.description); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', meta.title); } })
      .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', meta.description); } })
      .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', meta.canonical); } })
      .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', meta.canonical); } });
  }

  return rewriter.transform(response);
}
