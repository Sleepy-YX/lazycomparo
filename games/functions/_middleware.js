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
