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
  { id: 'v-rising', appId: 1604030, title: 'V Rising', studio: 'Stunlock Studios', genre: 'Survival Vampire', year: 2024, price: 28, rating: 88, hours: 45, players: '1-4 co-op, PvE/PvP servers up to 40', pro: 'Action-combat is sharper than most survival games' },
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
  { id: 'elden-ring', appId: 1245620, title: 'Elden Ring', studio: 'FromSoftware', genre: 'Soulslike RPG', year: 2022, price: 70, rating: 95, hours: 60, players: 'Limited co-op via summon signs (up to 4)', pro: 'Open-world design gives Soulslike combat room to breathe' },
  { id: 'valheim', appId: 892970, title: 'Valheim', studio: 'Iron Gate', genre: 'Survival Crafting', year: 2021, price: 14, rating: 96, hours: 60, players: 'Up to 10 co-op (dedicated server)', pro: 'Gorgeous procedural biomes for a small-studio game' },
  { id: 'icarus', appId: 1149460, title: 'Icarus', studio: 'RocketWerkz', genre: 'Survival Extraction', year: 2021, price: 30, rating: 78, hours: 40, players: 'Up to 8 co-op, session-based drops', pro: 'Session/extraction structure is a nice twist on survival-crafting' },
  { id: 'it-takes-two', appId: 1426210, title: 'It Takes Two', studio: 'Hazelight Studios', genre: 'Co-op Adventure', year: 2021, price: 40, rating: 97, hours: 14, players: "Exactly 2 (split-screen or online), Friend's Pass for one buyer", pro: 'Constantly reinvents its mechanics — rarely repeats an idea' },
  { id: 'deep-rock-galactic', appId: 548430, title: 'Deep Rock Galactic', studio: 'Ghost Ship Games', genre: 'Co-op Extraction Shooter', year: 2020, price: 30, rating: 97, hours: 100, players: '1-4 co-op, drop-in matchmaking', pro: 'Overwhelmingly Positive reviews for a reason — near-perfect co-op loop' },
  { id: 'hades', appId: 1145360, title: 'Hades', studio: 'Supergiant Games', genre: 'Roguelike', year: 2020, price: 28, rating: 98, hours: 30, players: 'Single-player only', pro: 'Story deepens with every run — rare for a roguelike' },
  { id: 'stardew-valley', appId: 413150, title: 'Stardew Valley', studio: 'ConcernedApe', genre: 'Farming Sim', year: 2016, price: 19, rating: 98, hours: 53, players: 'Up to 4 co-op farms', pro: 'Made almost entirely solo by one developer — remarkable scope' },
  { id: 'terraria', appId: 105600, title: 'Terraria', studio: 'Re-Logic', genre: 'Sandbox Survival', year: 2011, price: 14, rating: 97, hours: 100, players: 'Up to 8 co-op', pro: 'Absurd amount of content for the price — best $/hour on this list' },

  // ---- Second batch (catalog 30 -> 60) ----
  { id: 'monster-hunter-wilds', appId: 2246340, title: 'Monster Hunter Wilds', studio: 'Capcom', genre: 'Co-op Action RPG', year: 2025, price: 99.9, rating: 48, hours: 20, players: '1-4 co-op hunts', pro: 'Weapon combat is the most fluid the series has been' },
  { id: 'silksong', appId: 1030300, title: 'Hollow Knight: Silksong', studio: 'Team Cherry', genre: 'Metroidvania', year: 2025, price: 18.5, rating: 89, hours: 30, players: 'Single-player only', pro: 'Hornet is faster and more aggressive than the Knight' },
  { id: 'armored-core-6', appId: 1888160, title: 'Armored Core VI: Fires of Rubicon', studio: 'FromSoftware', genre: 'Mech Action', year: 2023, price: 79.9, rating: 91, hours: 17, players: 'Single-player campaign + PvP', pro: 'Mech building is deep and genuinely changes how you fight' },
  { id: 'resident-evil-4', appId: 2050650, title: 'Resident Evil 4', studio: 'Capcom', genre: 'Survival Horror', year: 2023, price: 49.9, rating: 97, hours: 16, players: 'Single-player', pro: 'One of the best-reviewed remakes ever made' },
  { id: 'cities-skylines-2', appId: 949230, title: 'Cities: Skylines II', studio: 'Colossal Order', genre: 'City Builder', year: 2023, price: 59, rating: 55, hours: 40, players: 'Single-player', pro: 'Far deeper economy and road tools than the original' },
  { id: 'vampire-survivors', appId: 1794680, title: 'Vampire Survivors', studio: 'poncle', genre: 'Survivors-like', year: 2022, price: 5.99, rating: 98, hours: 15, players: 'Local co-op up to 4', pro: 'Almost certainly the best $/hour on the entire site' },
  { id: 'total-war-warhammer-3', appId: 1142710, title: 'Total War: WARHAMMER III', studio: 'Creative Assembly', genre: 'Grand Strategy', year: 2022, price: 69, rating: 70, hours: 45, players: 'Up to 8 in multiplayer campaigns', pro: 'Immortal Empires is a staggeringly large sandbox' },
  { id: 'age-of-empires-4', appId: 1466860, title: 'Age of Empires IV', studio: "World's Edge", genre: 'RTS', year: 2021, price: 56.9, rating: 85, hours: 20, players: 'Up to 8 online, co-op vs AI', pro: 'Asymmetric civilisations keep matchups fresh' },
  { id: 'cyberpunk-2077', appId: 1091500, title: 'Cyberpunk 2077', studio: 'CD PROJEKT RED', genre: 'Open-World RPG', year: 2020, price: 69, rating: 86, hours: 25, players: 'Single-player only', pro: 'Night City is the densest open world on PC' },
  { id: 'doom-eternal', appId: 782330, title: 'DOOM Eternal', studio: 'id Software', genre: 'FPS', year: 2020, price: 38.9, rating: 91, hours: 15, players: 'Single-player + Battlemode PvP', pro: 'The best-feeling shooter combat loop on PC' },
  { id: 'risk-of-rain-2', appId: 632360, title: 'Risk of Rain 2', studio: 'Hopoo Games', genre: 'Co-op Roguelike', year: 2020, price: 22, rating: 93, hours: 20, players: '1-4 online co-op', pro: 'Item stacking produces absurd, hilarious builds' },
  { id: 'factorio', appId: 427520, title: 'Factorio', studio: 'Wube Software', genre: 'Factory Building', year: 2020, price: 30, rating: 97, hours: 60, players: 'Online co-op, dedicated servers', pro: 'The gold standard for automation games' },
  { id: 'outer-wilds', appId: 753640, title: 'Outer Wilds', studio: 'Mobius Digital', genre: 'Mystery Adventure', year: 2020, price: 25, rating: 95, hours: 16, players: 'Single-player only', pro: 'One of the best-designed mysteries in any game' },
  { id: 'phasmophobia', appId: 739630, title: 'Phasmophobia', studio: 'Kinetic Games', genre: 'Co-op Horror', year: 2020, price: 18.5, rating: 94, hours: 20, players: '1-4 co-op investigations', pro: 'Voice recognition means ghosts hear what you actually say' },
  { id: 'red-dead-redemption-2', appId: 1174180, title: 'Red Dead Redemption 2', studio: 'Rockstar Games', genre: 'Open-World Action', year: 2019, price: 79.9, rating: 92, hours: 50, players: 'Single-player + Red Dead Online', pro: 'Arguably the finest story and cast in any open world' },
  { id: 'sekiro', appId: 814380, title: 'Sekiro: Shadows Die Twice', studio: 'FromSoftware', genre: 'Soulslike', year: 2019, price: 84, rating: 95, hours: 30, players: 'Single-player only', pro: 'Deflection combat is the sharpest FromSoftware has written' },
  { id: 'slay-the-spire', appId: 646570, title: 'Slay the Spire', studio: 'Mega Crit', genre: 'Roguelike Deckbuilder', year: 2019, price: 23.99, rating: 97, hours: 27, players: 'Single-player only', pro: 'The game that defined the roguelike deckbuilder genre' },
  { id: 'disco-elysium', appId: 632470, title: 'Disco Elysium - The Final Cut', studio: 'ZA/UM', genre: 'CRPG', year: 2019, price: 36.99, rating: 92, hours: 22, players: 'Single-player only', pro: 'Some of the best writing in the medium, full stop' },
  { id: 'monster-hunter-world', appId: 582010, title: 'Monster Hunter: World', studio: 'Capcom', genre: 'Co-op Action RPG', year: 2018, price: 36.9, rating: 88, hours: 48, players: '1-4 co-op hunts', pro: 'Still the best-value entry point to the series' },
  { id: 'celeste', appId: 504230, title: 'Celeste', studio: 'Maddy Makes Games', genre: 'Precision Platformer', year: 2018, price: 18.5, rating: 97, hours: 8, players: 'Single-player only', pro: 'Tight controls that make failure feel fair every time' },
  { id: 'dead-cells', appId: 588650, title: 'Dead Cells', studio: 'Motion Twin', genre: 'Roguevania', year: 2018, price: 29.99, rating: 97, hours: 25, players: 'Single-player only', pro: 'Combat feels razor-sharp and responsive' },
  { id: 'rimworld', appId: 294100, title: 'RimWorld', studio: 'Ludeon Studios', genre: 'Colony Sim', year: 2018, price: 29, rating: 97, hours: 80, players: 'Single-player', pro: 'The AI storyteller generates disasters you will retell for years' },
  { id: 'subnautica', appId: 264710, title: 'Subnautica', studio: 'Unknown Worlds', genre: 'Survival Crafting', year: 2018, price: 40, rating: 97, hours: 30, players: 'Single-player only', pro: 'Ocean exploration nothing else has matched' },
  { id: 'hollow-knight', appId: 367520, title: 'Hollow Knight', studio: 'Team Cherry', genre: 'Metroidvania', year: 2017, price: 14.5, rating: 96, hours: 27, players: 'Single-player only', pro: 'Outstanding value — huge world for the price' },
  { id: 'dark-souls-3', appId: 374320, title: 'Dark Souls III', studio: 'FromSoftware', genre: 'Soulslike', year: 2016, price: 59.9, rating: 94, hours: 32, players: 'Co-op via summon signs (up to 3 phantoms)', pro: 'The most refined and approachable of the Dark Souls trilogy' },
  { id: 'civilization-6', appId: 289070, title: "Sid Meier's Civilization VI", studio: 'Firaxis Games', genre: '4X Strategy', year: 2016, price: 74.9, rating: 86, hours: 30, players: 'Up to 12 online', pro: 'The definitive "one more turn" game' },
  { id: 'dont-starve-together', appId: 322330, title: "Don't Starve Together", studio: 'Klei Entertainment', genre: 'Co-op Survival', year: 2016, price: 14.5, rating: 94, hours: 40, players: 'Up to 6 co-op (dedicated servers)', pro: 'Distinctive Tim Burton-ish art that has aged perfectly' },
  { id: 'witcher-3', appId: 292030, title: 'The Witcher 3: Wild Hunt', studio: 'CD PROJEKT RED', genre: 'Open-World RPG', year: 2015, price: 50.39, rating: 96, hours: 51, players: 'Single-player only', pro: "Side quests written better than most games' main stories" },
  { id: 'project-zomboid', appId: 108600, title: 'Project Zomboid', studio: 'The Indie Stone', genre: 'Zombie Survival', year: 2013, price: 18.5, rating: 94, hours: 60, players: 'Online co-op, dedicated servers', pro: 'The most detailed zombie survival sim on PC' },
  { id: 'portal-2', appId: 620, title: 'Portal 2', studio: 'Valve', genre: 'Puzzle', year: 2011, price: 10, rating: 98, hours: 8, players: 'Single-player + 2-player co-op campaign', pro: 'Still one of the funniest games ever written' },

  // ---- Third batch (catalog 60 -> 100) ----
  { id: 'clair-obscur-expedition-33', appId: 1903340, title: 'Clair Obscur: Expedition 33', studio: 'Sandfall Interactive', genre: 'Turn-based RPG', year: 2025, price: 59.9, rating: 95, hours: 30, players: 'Single-player only', pro: 'Turn-based combat with real-time dodges and parries' },
  { id: 'kingdom-come-deliverance-2', appId: 1771300, title: 'Kingdom Come: Deliverance II', studio: 'Warhorse Studios', genre: 'Open-World RPG', year: 2025, price: 78.01, rating: 94, hours: 55, players: 'Single-player only', pro: 'The most convincing medieval world ever built in a game' },
  { id: 'split-fiction', appId: 2001120, title: 'Split Fiction', studio: 'Hazelight Studios', genre: 'Co-op Adventure', year: 2025, price: 64.9, rating: 97, hours: 14, players: "Exactly 2 (split-screen or online), Friend's Pass for one buyer", pro: 'Only one of you has to buy it — the other plays free' },
  { id: 'elden-ring-nightreign', appId: 2622380, title: 'Elden Ring Nightreign', studio: 'FromSoftware', genre: 'Co-op Roguelike', year: 2025, price: 49.9, rating: 82, hours: 25, players: 'Solo or 3-player co-op expeditions', pro: 'Elden Ring combat compressed into 40-minute runs' },
  { id: 'schedule-1', appId: 3164500, title: 'Schedule I', studio: 'TVGS', genre: 'Business Sim', year: 2025, price: 18.5, rating: 98, hours: 30, players: '1-4 online co-op', pro: 'Empire-building loop is genuinely hard to put down' },
  { id: 'repo', appId: 3241660, title: 'R.E.P.O.', studio: 'semiwork', genre: 'Co-op Horror', year: 2025, price: 9.5, rating: 96, hours: 20, players: '1-6 online co-op', pro: 'Physics-based hauling makes every job a disaster' },
  { id: 'civilization-7', appId: 1295660, title: "Sid Meier's Civilization VII", studio: 'Firaxis Games', genre: '4X Strategy', year: 2025, price: 99, rating: 48, hours: 25, players: 'Up to 8 online, cross-platform', pro: 'Three-age structure stops runaway snowballing' },
  { id: 'indiana-jones-great-circle', appId: 2677660, title: 'Indiana Jones and the Great Circle', studio: 'MachineGames', genre: 'Action Adventure', year: 2024, price: 99.9, rating: 90, hours: 18, players: 'Single-player only', pro: 'First-person adventuring nails the films tonally' },
  { id: 'stalker-2', appId: 1643320, title: 'S.T.A.L.K.E.R. 2: Heart of Chornobyl', studio: 'GSC Game World', genre: 'FPS', year: 2024, price: 79, rating: 80, hours: 40, players: 'Single-player only', pro: 'The Zone is oppressive, hostile and utterly convincing' },
  { id: 'metaphor-refantazio', appId: 2679460, title: 'Metaphor: ReFantazio', studio: 'ATLUS', genre: 'Turn-based RPG', year: 2024, price: 69.9, rating: 90, hours: 75, players: 'Single-player only', pro: "Persona's calendar systems moved into high fantasy" },
  { id: 'nine-sols', appId: 1809540, title: 'Nine Sols', studio: 'Red Candle Games', genre: 'Metroidvania', year: 2024, price: 29.99, rating: 94, hours: 22, players: 'Single-player only', pro: 'Sekiro-style parrying in a 2D metroidvania' },
  { id: 'ghost-of-tsushima', appId: 2215430, title: "Ghost of Tsushima Director's Cut", studio: 'Sucker Punch Productions', genre: 'Open-World Action', year: 2024, price: 79.9, rating: 94, hours: 30, players: 'Single-player + Legends online co-op', pro: 'One of the best-looking open worlds on PC' },
  { id: 'god-of-war-ragnarok', appId: 2322010, title: 'God of War Ragnarok', studio: 'Santa Monica Studio', genre: 'Action Adventure', year: 2024, price: 79.9, rating: 89, hours: 26, players: 'Single-player only', pro: 'Combat and weapon variety improve on the 2018 game' },
  { id: 'core-keeper', appId: 1621690, title: 'Core Keeper', studio: 'Pugstorm', genre: 'Sandbox Survival', year: 2024, price: 18.5, rating: 93, hours: 40, players: 'Up to 8 online co-op', pro: 'Terraria-style mining and building underground' },
  { id: 'supermarket-simulator', appId: 2670630, title: 'Supermarket Simulator', studio: 'Nokta Games', genre: 'Business Sim', year: 2025, price: 18.5, rating: 92, hours: 25, players: 'Online co-op', pro: 'Restock-price-scan loop is oddly hypnotic' },
  { id: 'tekken-8', appId: 1778820, title: 'Tekken 8', studio: 'Bandai Namco Studios', genre: 'Fighting', year: 2024, price: 49.9, rating: 56, hours: 12, players: 'Online + local versus', pro: 'The most aggressive, best-looking Tekken yet' },
  { id: 'spider-man-2', appId: 2651280, title: "Marvel's Spider-Man 2", studio: 'Insomniac Games', genre: 'Open-World Action', year: 2025, price: 79.9, rating: 83, hours: 20, players: 'Single-player only', pro: 'Web-swinging and wing-gliding across New York is unmatched' },
  { id: 'last-of-us-part-1', appId: 1888930, title: 'The Last of Us Part I', studio: 'Naughty Dog', genre: 'Survival Horror', year: 2023, price: 79.9, rating: 84, hours: 15, players: 'Single-player only', pro: 'Still one of the best-written stories in the medium' },
  { id: 'street-fighter-6', appId: 1364780, title: 'Street Fighter 6', studio: 'Capcom', genre: 'Fighting', year: 2023, price: 57, rating: 83, hours: 12, players: 'Online + local versus', pro: 'Modern controls make it the friendliest fighter to start' },
  { id: 'against-the-storm', appId: 1336490, title: 'Against the Storm', studio: 'Eremite Games', genre: 'City Builder', year: 2023, price: 29.99, rating: 94, hours: 40, players: 'Single-player', pro: 'Roguelite runs fix the city-builder late-game slump' },
  { id: 'rogue-trader', appId: 2186680, title: 'Warhammer 40,000: Rogue Trader', studio: 'Owlcat Games', genre: 'CRPG', year: 2023, price: 59, rating: 88, hours: 60, players: 'Up to 6 online co-op', pro: 'The first proper CRPG set in Warhammer 40K' },
  { id: 'ark-survival-ascended', appId: 2399830, title: 'ARK: Survival Ascended', studio: 'Studio Wildcard', genre: 'Survival Crafting', year: 2023, price: 60, rating: 60, hours: 100, players: 'Up to 70 on dedicated servers', pro: 'Taming and breeding dinosaurs still has no real rival' },
  { id: 'darktide', appId: 1361210, title: 'Warhammer 40,000: Darktide', studio: 'Fatshark', genre: 'Co-op Shooter', year: 2022, price: 49.9, rating: 72, hours: 30, players: '4-player co-op, cross-platform', pro: 'Melee and gunplay mix better than any other horde shooter' },
  { id: 'sifu', appId: 2138710, title: 'Sifu', studio: 'Sloclap', genre: 'Beat-em-up', year: 2023, price: 35.99, rating: 92, hours: 10, players: 'Single-player only', pro: 'Kung fu combat with real weight and readable timing' },
  { id: 'stray', appId: 1332010, title: 'Stray', studio: 'BlueTwelve Studio', genre: 'Adventure', year: 2022, price: 28, rating: 97, hours: 6, players: 'Single-player only', pro: 'Playing an actual cat is executed perfectly' },
  { id: 'grounded', appId: 962130, title: 'Grounded', studio: 'Obsidian Entertainment', genre: 'Co-op Survival', year: 2022, price: 56.9, rating: 90, hours: 35, players: 'Up to 4 online co-op', pro: 'Shrunk-to-ant-size backyard is a brilliant setting' },
  { id: 'monster-hunter-rise', appId: 1446780, title: 'Monster Hunter Rise', studio: 'Capcom', genre: 'Co-op Action RPG', year: 2022, price: 49.9, rating: 83, hours: 35, players: '1-4 co-op hunts', pro: 'Wirebug movement makes it the fastest game in the series' },
  { id: 'inscryption', appId: 1092790, title: 'Inscryption', studio: 'Daniel Mullins Games', genre: 'Roguelike Deckbuilder', year: 2021, price: 22.5, rating: 97, hours: 14, players: 'Single-player only', pro: 'Goes somewhere no other card game has gone' },
  { id: 'dyson-sphere-program', appId: 1366540, title: 'Dyson Sphere Program', studio: 'Youthcat Studio', genre: 'Factory Building', year: 2021, price: 18.5, rating: 97, hours: 70, players: 'Single-player', pro: 'Factorio in space, across whole star systems' },
  { id: 'forza-horizon-5', appId: 1551360, title: 'Forza Horizon 5', studio: 'Playground Games', genre: 'Racing', year: 2021, price: 79.9, rating: 89, hours: 25, players: 'Online shared world + co-op, cross-platform', pro: 'Best-feeling arcade driving on PC, pad or wheel' },
  { id: 'crusader-kings-3', appId: 1158310, title: 'Crusader Kings III', studio: 'Paradox Development Studio', genre: 'Grand Strategy', year: 2020, price: 56, rating: 90, hours: 60, players: 'Up to 32 in multiplayer', pro: 'A story generator disguised as a strategy game' },
  { id: 'ori-will-of-the-wisps', appId: 1057090, title: 'Ori and the Will of the Wisps', studio: 'Moon Studios', genre: 'Metroidvania', year: 2020, price: 40.9, rating: 97, hours: 12, players: 'Single-player only', pro: 'The most beautiful 2D platformer on PC' },
  { id: 'control', appId: 870780, title: 'Control Ultimate Edition', studio: 'Remedy Entertainment', genre: 'Action Adventure', year: 2020, price: 37.99, rating: 86, hours: 12, players: 'Single-player only', pro: 'Telekinetic combat and destructible offices never get old' },
  { id: 'oxygen-not-included', appId: 457140, title: 'Oxygen Not Included', studio: 'Klei Entertainment', genre: 'Colony Sim', year: 2019, price: 22, rating: 97, hours: 70, players: 'Single-player', pro: 'Thermodynamics simulation nothing else matches' },
  { id: 'divinity-original-sin-2', appId: 435150, title: 'Divinity: Original Sin 2', studio: 'Larian Studios', genre: 'CRPG', year: 2017, price: 49, rating: 96, hours: 60, players: 'Up to 4 co-op, split-screen supported', pro: "The blueprint that led to Baldur's Gate 3" },
  { id: 'cuphead', appId: 268910, title: 'Cuphead', studio: 'Studio MDHR', genre: 'Run and Gun', year: 2017, price: 20, rating: 96, hours: 12, players: 'Local 2-player co-op', pro: 'Hand-inked 1930s animation, frame by frame' },
  { id: 'xcom-2', appId: 268500, title: 'XCOM 2', studio: 'Firaxis Games', genre: 'Turn-based Tactics', year: 2016, price: 26, rating: 85, hours: 40, players: 'Single-player + 1v1 multiplayer', pro: 'Squad losses hurt because the soldiers are yours' },
  { id: 'human-fall-flat', appId: 477160, title: 'Human Fall Flat', studio: 'No Brakes Games', genre: 'Co-op Puzzle', year: 2016, price: 18.5, rating: 95, hours: 8, players: 'Up to 8 online co-op', pro: 'Floppy physics make every solution funny' },
  { id: 'no-mans-sky', appId: 275850, title: "No Man's Sky", studio: 'Hello Games', genre: 'Survival Crafting', year: 2016, price: 49, rating: 85, hours: 30, players: 'Up to 32 online, cross-platform', pro: 'Nine years of free updates rebuilt it completely' },
  { id: 'beamng-drive', appId: 284160, title: 'BeamNG.drive', studio: 'BeamNG', genre: 'Driving Sim', year: 2015, price: 21.99, rating: 97, hours: 50, players: 'Single-player (mod multiplayer exists)', pro: 'Soft-body crash physics nothing else comes close to' },
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

/* ----------------------------- LIVE PRICE DATA ---------------------------- */
// WHY: the pre-render used to carry only the static USD reference MSRP, so a
// page titled "Cheapest price for X on PC" answered that query with no price
// in the crawlable HTML at all. These helpers pull the same /api/deals feed
// the React app uses and render real numbers into the pre-rendered markup.
//
// EVERY caller must survive an empty result. If ITAD_API_KEY is unset, ITAD is
// down, or we blow the timeout, we fall back to the editorial availability map
// below and simply omit the numbers — a page without prices still beats a page
// that 500s or hangs.

// Which non-Steam stores sell each game. Mirror of EXTRA_STORES in
// ../index.html — KEEP IN SYNC when you edit that map. Used only when live
// pricing is unavailable: it still lets us answer "is this on GOG?" (the query
// shape Search Console shows us actually ranking for) without any live call.
const EXTRA_STORES = {
  'black-myth-wukong': ['Epic'], 'hades-2': ['Epic'], 'space-marine-2': ['Epic'],
  'frostpunk-2': ['Epic', 'GOG'], 'manor-lords': ['GOG'], 'pacific-drive': ['Epic'],
  'satisfactory': ['Epic'], 'baldurs-gate-3': ['GOG'], 'remnant2': ['Epic'],
  'it-takes-two': ['Epic'], 'hades': ['Epic'], 'stardew-valley': ['GOG'],
  'terraria': ['GOG'], 'cyberpunk-2077': ['Epic', 'GOG'], 'witcher-3': ['GOG'],
  'red-dead-redemption-2': ['Epic'], 'doom-eternal': ['Epic', 'GOG'],
  'silksong': ['GOG'], 'hollow-knight': ['GOG'], 'celeste': ['Epic'],
  'dead-cells': ['Epic', 'GOG'], 'slay-the-spire': ['GOG'],
  'vampire-survivors': ['Epic'], 'risk-of-rain-2': ['Epic'], 'factorio': ['GOG'],
  'rimworld': ['Epic', 'GOG'], 'civilization-6': ['Epic'],
  'total-war-warhammer-3': ['Epic'], 'disco-elysium': ['Epic', 'GOG'],
  'outer-wilds': ['Epic'], 'subnautica': ['Epic'], 'project-zomboid': ['GOG'],
  'clair-obscur-expedition-33': ['Epic', 'GOG'],
  'kingdom-come-deliverance-2': ['Epic', 'GOG'], 'split-fiction': ['Epic'],
  'civilization-7': ['Epic'], 'indiana-jones-great-circle': ['GOG'],
  'stalker-2': ['Epic', 'GOG'], 'ghost-of-tsushima': ['Epic'],
  'god-of-war-ragnarok': ['Epic'], 'core-keeper': ['Epic', 'GOG'],
  'spider-man-2': ['Epic'], 'last-of-us-part-1': ['Epic'],
  'against-the-storm': ['Epic', 'GOG'], 'rogue-trader': ['Epic', 'GOG'],
  'ark-survival-ascended': ['Epic'], 'sifu': ['Epic'], 'stray': ['Epic'],
  'inscryption': ['Epic', 'GOG'], 'control': ['Epic', 'GOG'],
  'oxygen-not-included': ['Epic'], 'xcom-2': ['Epic', 'GOG'],
  'divinity-original-sin-2': ['GOG'], 'cuphead': ['GOG'], 'no-mans-sky': ['GOG'],
  'beamng-drive': ['Epic'],
};

const sellsOn = (g, store) => store === 'Steam' || (EXTRA_STORES[g.id] || []).includes(store);

// A single-game page needs one cheap lookup; a hub page needs the whole
// catalog. Budget the wait accordingly — a crawler that times out sees the
// no-price fallback, which is still valid HTML.
const DEALS_TIMEOUT_MS = { game: 1500, hub: 3500 };
const DEALS_CHUNK = 40; // must not exceed MAX_IDS in api/deals.js

// Same-origin call into our own /api/deals. That endpoint already edge-caches
// for 30 min, so this is usually a cache read rather than an ITAD round-trip.
// Returns {} — never throws — so the render path has exactly one shape to
// handle whether or not live data arrived.
async function fetchDeals(origin, appIds, budgetMs) {
  const ids = [...new Set(appIds.filter(Boolean).map(String))];
  if (!ids.length) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const chunks = [];
    for (let i = 0; i < ids.length; i += DEALS_CHUNK) chunks.push(ids.slice(i, i + DEALS_CHUNK));

    const parts = await Promise.all(chunks.map(async (chunk) => {
      const res = await fetch(`${origin}/api/deals?ids=${chunk.join(',')}`, { signal: controller.signal });
      if (!res.ok) return {};
      const data = await res.json();
      return (data && data.games) || {};
    }));
    return Object.assign({}, ...parts);
  } catch (e) {
    return {}; // aborted, non-JSON, ITAD 503 — all mean "render without prices"
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------- PRICE PRESENTATION --------------------------- */

const round2 = (n) => Math.round(n * 100) / 100;
const symbolFor = (currency) => (!currency || currency === 'SGD' ? 'S$' : `${currency} `);

// `approx` marks an FX-converted amount (see the toSGD note in api/deals.js).
// It renders as "~S$12.34" so the page never presents an estimate as exact.
function money(store) {
  return `${store.approx ? '~' : ''}${symbolFor(store.currency)}${Number(store.price).toFixed(2)}`;
}

const dealFor = (deal, g) => (deal && g.appId && deal[String(g.appId)]) || null;

// /api/deals normalises everything to SGD, but if its FX step fails prices can
// arrive in mixed currencies — and picking a "cheapest" across currencies would
// be plainly wrong. So compare only within the currency most stores quote.
function comparableStores(entry) {
  const stores = (entry && entry.stores) || [];
  if (stores.length < 2) return stores;
  const currencyOf = (s) => s.currency || 'SGD';
  const tally = {};
  stores.forEach((s) => { tally[currencyOf(s)] = (tally[currencyOf(s)] || 0) + 1; });
  const dominant = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  return stores.filter((s) => currencyOf(s) === dominant);
}

function cheapestStore(entry) {
  const stores = comparableStores(entry).filter((s) => typeof s.price === 'number');
  if (!stores.length) return null;
  return stores.reduce((best, s) => (s.price < best.price ? s : best));
}

// True when the cheapest current price has met or beaten the all-time low.
// Only meaningful within a single currency, hence the guard.
function atAllTimeLow(entry) {
  const low = entry && entry.historyLow;
  const best = cheapestStore(entry);
  if (!low || !best || typeof low.price !== 'number') return false;
  if ((low.currency || 'SGD') !== (best.currency || 'SGD')) return false;
  return best.price <= low.price + 0.005;
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
      <h2>Price guides</h2>
      <ul>
        <li><a href="${SITE}/gog">PC games on GOG — where GOG beats Steam right now</a></li>
        <li><a href="${SITE}/deals/all-time-low">PC games at their all-time low price right now</a></li>
      </ul>

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

// The first sentence on the page, and the shape of query Search Console shows
// us actually ranking for ("<game> gog", "gog <game>"). Answer it outright
// rather than making the reader hunt for it — with live numbers when we have
// them, and availability-only phrasing when we don't.
function gogAnswer(g, entry) {
  const stores = comparableStores(entry);
  const gog = stores.find((s) => s.store === 'GOG');
  const steam = stores.find((s) => s.store === 'Steam');

  if (gog) {
    const price = money(gog);
    const cut = gog.cut ? ` (${gog.cut}% off)` : '';
    if (steam && typeof steam.price === 'number') {
      const diff = round2(steam.price - gog.price);
      if (diff > 0) {
        return `<strong>Yes — ${esc(g.title)} is on GOG, and right now GOG is the cheaper option at ${price}${cut},
          ${symbolFor(gog.currency)}${diff.toFixed(2)} less than Steam.</strong> GOG sells it DRM-free.`;
      }
      if (diff < 0) {
        return `<strong>Yes — ${esc(g.title)} is on GOG at ${price}${cut}, but Steam is cheaper today at
          ${money(steam)}.</strong> GOG's copy is DRM-free, which may still be worth
          ${symbolFor(gog.currency)}${Math.abs(diff).toFixed(2)} to you.`;
      }
      return `<strong>Yes — ${esc(g.title)} is on GOG at ${price}${cut}, exactly matching Steam.</strong>
        GOG's copy is DRM-free, so at an identical price it is the better buy.`;
    }
    return `<strong>Yes — ${esc(g.title)} is on GOG, DRM-free, at ${price}${cut}.</strong>`;
  }

  // No live GOG listing. Distinguish "we know it isn't sold there" from
  // "we couldn't reach the price feed" — those are different claims.
  if (sellsOn(g, 'GOG')) {
    return `<strong>Yes — ${esc(g.title)} is sold DRM-free on GOG as well as Steam.</strong>
      Live GOG, Steam and Epic pricing is in the table below.`;
  }
  const others = (EXTRA_STORES[g.id] || []).filter((s) => s !== 'GOG');
  const alsoOn = others.length ? ` It's on Steam and ${others.join(' and ')}` : ` It's a Steam exclusive on PC`;
  return `<strong>No — ${esc(g.title)} is not listed on GOG.</strong>${alsoOn}, so DRM-free is not an option
    for this one; the cheapest current listing is below.`;
}

// One-line buying verdict. This is the sentence a reader actually came for.
function verdictHtml(g, entry) {
  const best = cheapestStore(entry);
  if (!best) return '';
  const low = entry.historyLow;
  const lowSame = low && typeof low.price === 'number' && (low.currency || 'SGD') === (best.currency || 'SGD');

  if (atAllTimeLow(entry)) {
    return `<p><strong>Buy now:</strong> at ${money(best)} on ${esc(best.store)}, ${esc(g.title)} is at its
      lowest price ever recorded. It has never been cheaper than this.</p>`;
  }
  if (lowSame) {
    const gap = round2(best.price - low.price);
    return `<p><strong>Verdict:</strong> cheapest right now is ${money(best)} on ${esc(best.store)} —
      ${symbolFor(best.currency)}${gap.toFixed(2)} above its all-time low of
      ${money({ price: low.price, currency: low.currency })}${low.shop ? ` on ${esc(low.shop)}` : ''}.
      ${gap <= 2 ? 'That is close enough to the record that waiting rarely pays.' : 'Deeper discounts have happened before, so there is room to wait.'}</p>`;
  }
  return `<p><strong>Verdict:</strong> cheapest right now is ${money(best)} on ${esc(best.store)}.</p>`;
}

function priceTableHtml(g, entry) {
  // Deliberately the comparable subset, not entry.stores: the verdict and the
  // JSON-LD offers are both built from this same list, so a listing we can't
  // price-compare is omitted everywhere rather than shown in one place and
  // missing from the other.
  const stores = comparableStores(entry).filter((s) => typeof s.price === 'number');
  if (!stores.length) {
    // No live feed. Say what we do know rather than inventing a number.
    const list = ['Steam', ...(EXTRA_STORES[g.id] || [])];
    return `<p>${esc(g.title)} is sold on ${list.join(', ')}. Live Singapore pricing for each store loads on this
      page; the publisher reference price is US$${g.price.toFixed(2)}.</p>`;
  }

  const best = cheapestStore(entry);
  const rows = stores.map((s) => {
    const isBest = best && s.store === best.store && s.price === best.price;
    return `<tr>
        <th scope="row">${esc(s.store)}${isBest ? ' — cheapest' : ''}</th>
        <td>${money(s)}</td>
        <td>${s.cut ? `${s.cut}% off` : 'full price'}</td>
        <td>${s.regular ? `was ${symbolFor(s.currency)}${Number(s.regular).toFixed(2)}` : ''}</td>
      </tr>`;
  }).join('');

  return `
    <table>
      <caption>Live ${esc(g.title)} prices, Singapore store pricing</caption>
      <thead><tr><th scope="col">Store</th><th scope="col">Price now</th><th scope="col">Discount</th><th scope="col">Was</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function gameMeta(g, entry) {
  const best = cheapestStore(entry);
  const low = entry && entry.historyLow;
  const priceBit = best
    ? `Cheapest now ${money(best)} on ${best.store}${best.cut ? ` (${best.cut}% off)` : ''}.` +
      (low && typeof low.price === 'number' ? ` All-time low ${money({ price: low.price, currency: low.currency })}.` : '')
    : 'Compare live prices and see the all-time-low.';

  return {
    title: `Cheapest price for ${g.title} on PC — Steam vs Epic vs GOG | LazyComparo`,
    description: `Is ${g.title} cheaper on Steam, Epic or GOG? ${priceBit} ${g.rating}% positive, about ${g.hours}h to beat.`,
    canonical: gamePath(g.id),
  };
}

function gameHtml(g, entry) {
  const related = relatedGames(g).map((r) =>
    `<li><a href="${gamePath(r.id)}">${esc(r.title)}</a> — ${esc(r.genre)}</li>`).join('');

  return `
    <nav aria-label="Breadcrumb"><a href="${SITE}/">All games</a> &rsaquo; <span>${esc(g.title)}</span></nav>
    <main>
      <h1>Cheapest price for ${esc(g.title)} on PC</h1>
      <p>${gogAnswer(g, entry)}</p>

      <h2>Where to buy ${esc(g.title)} cheapest</h2>
      ${priceTableHtml(g, entry)}
      ${verdictHtml(g, entry)}
      <p><a href="${steamUrl(g.appId)}" rel="nofollow">View ${esc(g.title)} on Steam</a></p>

      <h2>About ${esc(g.title)}</h2>
      <p>${esc(g.title)} is a ${esc(g.genre)} by ${esc(g.studio)}, released ${g.year}. ${esc(g.players)}.
      It holds a ${g.rating}% positive rating on Steam and takes about ${g.hours} hours to beat.</p>
      <p>${esc(g.pro)}</p>

      <h2>Similar games to compare</h2>
      <ul>${related}</ul>

      <p><a href="${SITE}/gog">Every game we track that's on GOG</a> &middot;
         <a href="${SITE}/deals/all-time-low">Games at their all-time low right now</a> &middot;
         <a href="${SITE}/">Browse all ${GAMES.length} PC games</a></p>
    </main>`;
}

// Prices refresh well inside a day; claiming longer would be a promise the
// feed doesn't keep.
function priceValidUntil() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// Live cross-store pricing as AggregateOffer — this is what makes the page
// eligible for price-rich results, and it is built from the SAME numbers
// rendered in priceTableHtml() so the markup can never contradict the page.
// Falls back to the static USD reference MSRP only when no live data arrived.
function offersFor(g, entry) {
  const stores = comparableStores(entry).filter((s) => typeof s.price === 'number');
  if (!stores.length) {
    return {
      '@type': 'Offer',
      price: g.price.toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: steamUrl(g.appId),
    };
  }

  const currency = stores[0].currency || 'SGD';
  const amounts = stores.map((s) => s.price);
  const until = priceValidUntil();

  return {
    '@type': 'AggregateOffer',
    priceCurrency: currency,
    lowPrice: Math.min(...amounts).toFixed(2),
    highPrice: Math.max(...amounts).toFixed(2),
    offerCount: stores.length,
    offers: stores.map((s) => ({
      '@type': 'Offer',
      price: s.price.toFixed(2),
      priceCurrency: s.currency || 'SGD',
      availability: 'https://schema.org/InStock',
      priceValidUntil: until,
      url: s.url || (s.store === 'Steam' ? steamUrl(g.appId) : gamePath(g.id)),
      seller: { '@type': 'Organization', name: s.store },
    })),
  };
}

function gameJsonLd(g, entry) {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        // Multi-typed: VideoGame describes what it is, Product is what makes
        // the aggregated pricing eligible for rich results on a comparison page.
        '@type': ['VideoGame', 'Product'],
        name: g.title,
        genre: g.genre,
        gamePlatform: 'PC',
        operatingSystem: 'Windows',
        datePublished: String(g.year),
        author: { '@type': 'Organization', name: g.studio },
        publisher: { '@type': 'Organization', name: g.studio },
        brand: { '@type': 'Organization', name: g.studio },
        url: gamePath(g.id),
        offers: offersFor(g, entry),
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

/* ------------------------------- HUB PAGES -------------------------------- */
// WHY THESE EXIST: /game/<slug> pages are 100+ near-identical templates, which
// is a weak indexing profile and gives nothing worth linking to. These two hubs
// are generated from data we already fetch, change every 30 minutes on their
// own, and answer a query a single game page can't ("which games are cheaper on
// GOG", "what's at its all-time low today"). They also give every game page a
// second inbound internal link.
//
// Unlike /game/<slug>, these are served from their own no-React shells
// (gog/index.html, deals/all-time-low/index.html). That's deliberate: the app
// has no route for them, so letting it boot would replace this content and make
// Google's rendered pass disagree with the pre-render.

const HUBS = {
  '/gog': 'gog',
  '/deals/all-time-low': 'atl',
};

function gogRows(deals) {
  const rows = [];
  for (const g of GAMES) {
    const entry = dealFor(deals, g);
    const stores = comparableStores(entry);
    const gog = stores.find((s) => s.store === 'GOG');
    if (!gog || typeof gog.price !== 'number') continue;
    const steam = stores.find((s) => s.store === 'Steam' && typeof s.price === 'number');
    rows.push({ g, gog, steam, saving: steam ? round2(steam.price - gog.price) : null });
  }
  // Biggest GOG saving first; unknown savings sink to the bottom.
  return rows.sort((a, b) => (b.saving === null ? -1e9 : b.saving) - (a.saving === null ? -1e9 : a.saving));
}

function atlRows(deals) {
  const rows = [];
  for (const g of GAMES) {
    const entry = dealFor(deals, g);
    if (!atAllTimeLow(entry)) continue;
    rows.push({ g, entry, best: cheapestStore(entry) });
  }
  return rows.sort((a, b) => (b.best.cut || 0) - (a.best.cut || 0));
}

function hubMeta(kind) {
  if (kind === 'gog') {
    return {
      title: 'PC games on GOG — live GOG vs Steam vs Epic prices | LazyComparo',
      description: 'Which PC games are on GOG, and where GOG is actually the cheapest. Live DRM-free GOG prices compared against Steam and Epic, updated every 30 minutes.',
      canonical: `${SITE}/gog`,
      crumb: 'GOG prices',
      h1: 'PC games on GOG, and when GOG is the cheaper buy',
      intro: 'Every game we track that sells DRM-free on GOG, sorted by how much you save against Steam right now. Prices are Singapore store pricing and refresh every 30 minutes.',
    };
  }
  return {
    title: 'PC games at their all-time low price right now | LazyComparo',
    description: 'Live list of PC games currently at the cheapest price they have ever been on Steam, Epic or GOG. Updated every 30 minutes.',
    canonical: `${SITE}/deals/all-time-low`,
    crumb: 'All-time lows',
    h1: 'PC games at their all-time low right now',
    intro: 'These games have hit or beaten the lowest price ever recorded for them across Steam, Epic and GOG. A game at its record low is a better buy than a bigger percentage off a price that has been lower before.',
  };
}

function hubHtml(kind, deals) {
  const meta = hubMeta(kind);
  const rows = kind === 'gog' ? gogRows(deals) : atlRows(deals);

  let body;
  if (!rows.length) {
    // Live feed unavailable or nothing qualifies. Still ship real content and
    // real internal links rather than an empty page.
    const known = kind === 'gog'
      ? GAMES.filter((g) => sellsOn(g, 'GOG'))
      : GAMES.slice(0, 24);
    body = `
      <p class="note">${kind === 'gog'
        ? 'Live pricing is unavailable at the moment, so savings are not shown. These are the games we track that sell on GOG:'
        : 'Nothing in the catalog is at its record low right now — that happens between sales. In the meantime, these are worth watching:'}</p>
      <ul class="plain">${known.map((g) =>
        `<li><a href="${gamePath(g.id)}">${esc(g.title)}</a> — ${esc(g.genre)}</li>`).join('')}</ul>`;
  } else if (kind === 'gog') {
    body = `
      <div class="tablewrap"><table>
        <thead><tr><th scope="col">Game</th><th scope="col">GOG</th><th scope="col">Steam</th><th scope="col">You save on GOG</th></tr></thead>
        <tbody>${rows.map(({ g, gog, steam, saving }) => `
          <tr>
            <th scope="row"><a href="${gamePath(g.id)}">${esc(g.title)}</a></th>
            <td>${money(gog)}${gog.cut ? ` <span class="cut">${gog.cut}% off</span>` : ''}</td>
            <td>${steam ? money(steam) : 'not on Steam'}</td>
            <td>${saving === null ? '—' : saving > 0
              ? `<strong class="win">${symbolFor(gog.currency)}${saving.toFixed(2)}</strong>`
              : saving === 0 ? 'same price' : `<span class="lose">Steam is ${symbolFor(gog.currency)}${Math.abs(saving).toFixed(2)} cheaper</span>`}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;
  } else {
    body = `
      <div class="tablewrap"><table>
        <thead><tr><th scope="col">Game</th><th scope="col">Cheapest now</th><th scope="col">Store</th><th scope="col">Discount</th></tr></thead>
        <tbody>${rows.map(({ g, best }) => `
          <tr>
            <th scope="row"><a href="${gamePath(g.id)}">${esc(g.title)}</a></th>
            <td><strong class="win">${money(best)}</strong></td>
            <td>${esc(best.store)}</td>
            <td>${best.cut ? `${best.cut}% off` : 'full price'}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;
  }

  const otherHub = kind === 'gog'
    ? `<a href="${SITE}/deals/all-time-low">Games at their all-time low right now</a>`
    : `<a href="${SITE}/gog">Every game we track that's on GOG</a>`;

  return `
    <nav aria-label="Breadcrumb"><a href="${SITE}/">LazyComparo</a> &rsaquo; <span>${esc(meta.crumb)}</span></nav>
    <main>
      <h1>${esc(meta.h1)}</h1>
      <p class="intro">${esc(meta.intro)}</p>
      ${body}
      <p class="links">${otherHub} &middot;
        <a href="${SITE}/">Browse all ${GAMES.length} PC games &rarr;</a></p>
    </main>`;
}

function hubJsonLd(kind, deals) {
  const meta = hubMeta(kind);
  const rows = kind === 'gog' ? gogRows(deals) : atlRows(deals);
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: meta.h1,
    description: meta.description,
    url: meta.canonical,
    numberOfItems: rows.length,
    itemListElement: rows.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: gamePath(r.g.id),
      name: r.g.title,
    })),
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

  const url = new URL(context.request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const slugMatch = path.match(/^\/game\/([^/]+)$/);
  const game = slugMatch ? BY_ID.get(decodeURIComponent(slugMatch[1])) : null;
  const hub = HUBS[path];

  // Live prices for the pre-render. Bounded and failure-tolerant by design:
  // fetchDeals never throws and returns {} on timeout, so a slow or missing
  // ITAD feed degrades this to the old no-price markup instead of breaking
  // the page or stalling the response.
  let deals = {};
  if (game) {
    deals = await fetchDeals(url.origin, [game.appId], DEALS_TIMEOUT_MS.game);
  } else if (hub) {
    deals = await fetchDeals(url.origin, GAMES.map((g) => g.appId), DEALS_TIMEOUT_MS.hub);
  }

  let rootHtml;
  let jsonLd;
  let meta = null;

  if (game) {
    const entry = dealFor(deals, game);
    rootHtml = gameHtml(game, entry);
    jsonLd = gameJsonLd(game, entry);
    meta = gameMeta(game, entry);
  } else if (hub) {
    rootHtml = hubHtml(hub, deals);
    jsonLd = hubJsonLd(hub, deals);
    meta = hubMeta(hub);
  } else {
    // Includes unknown /game/<slug> -> homepage content (harmless).
    rootHtml = homeHtml();
    jsonLd = homeJsonLd();
  }

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
