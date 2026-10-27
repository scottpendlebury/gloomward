# Gloomward — Development Plan

**Game Title:** Gloomward
**Genre:** Third-person survival-horror roguelike
**Target:** Desktop browser (Chrome/Firefox/Edge), PS2-era aesthetic

---

## Milestones

### M0 — Pipeline (THIS WEEK)
- [x] Environment inventory, GitHub auth
- [x] Repo created: `gloomward`
- [x] Git config with noreply email
- [x] Three.js vendored to `vendor/three/`
- [x] "Hello fog" page with import map
- [ ] GitHub Pages enabled and verified live
- [ ] Docs skeleton (PLAN.md, PROGRESS.md, ARCHITECTURE.md)

### M1 — Vertical Slice
- Title screen with live fog scene
- New run → one generated interior floor
- Grid → mesh generation (BSP + corridor growth)
- Third-person spring-arm camera with collision
- Player movement + procedural animation
- One enemy type (AI: dormant→wander→investigate→chase→attack)
- Melee combat (heavy, stamina-costing, arc/reach)
- Health, pickups, torch (battery, flicker)
- Pocket radio (static rises with nearby hostiles)
- Locked door + key (validator ensures reachability)
- Floor exit → death → restart loop
- Synthesised ambience + footsteps
- Node tests: RNG, generator, validator

### M2 — Core Loop
- PS2 post-processing (grain, dither, vignette, bloom, chromatic aberration)
- Handgun + ammo + noise model
- Inventory (8 slots) + item use + examine
- Map with red-ink marking (explored, locked doors, scribbles)
- Notes system + journal
- Fog Streets + 2–3 interior themes (apartments, clinic, offices)
- 4–5 enemy types + Director spawn budgeting
- 2–3 puzzle types (code lock, fuse/slot, radio tuning)
- Static safe room + save/continue
- Options + key rebinding + gamepad
- Door/combat/music audio
- Asset viewer (`?viewer=1`)
- `?selftest=1` in-page bot simulation
- Death summary screen

### M3 — Roguelike Depth
- Three acts (2 floors + safe room + boss arena each)
- Nightmare layer corruption pass (material swap, vertex warp, audio shift)
- Relentless stalker (unkillable, evasion via doors/hiding)
- Relics (20+ passives, upside/downside, pick 1 of 3)
- Hub + meta-progression (currency, starting kits, unlocks, difficulty tiers)
- 3+ starting kits/characters
- All puzzle types implemented
- 3+ endings + true ending (multi-run flags)
- Lore archive + bestiary + run history
- Seeds (random, typed, daily from UTC date)
- Gamepad rumble

### M4 — Polish & Content
- Animation/VFX/decal pass
- More room templates, enemies, notes
- Accessibility options (reduce shake/flash, captions, colour-blind, hold/toggle, text size)
- Performance presets + auto-tuning
- Balance via bot simulation (clear rate, damage/floor, resource flow)
- README screenshots
- Full QA on live site

---

## Technical Decisions (Recorded Here)

- **Renderer:** Three.js WebGL2, pinned, vendored in `vendor/three/`
- **Module system:** Vanilla ES modules, no bundler, import map in index.html
- **Simulation:** Pure logic in `src/sim/` and `src/gen/`, no Three.js/DOM imports
- **Fixed timestep:** 60 Hz simulation, interpolated render
- **PRNG:** Single seeded PRNG (mulberry32) with derived sub-seeds per floor/system
- **Grid world:** 1–2 m cells for collision, pathfinding, LOS, map reveal
- **Meshing:** Merge static geometry per material per chunk; InstancedMesh for props
- **Lighting:** Constant light count (1 shadow torch + 1 hemi + 4–6 pooled point lights)
- **Resolution:** Internal 854×480 (16:9), CSS upscale with `image-rendering: pixelated`
- **Post-processing:** Single cheap full-screen pass, all effects toggleable
- **Audio:** Runtime synthesis (Web Audio API) + few baked loops (Opus/OGG)
- **Saves:** localStorage, versioned, try/catch wrapped, export/import as text
- **Error handling:** Global error/unhandledrejection panel with copyable log
- **URL params:** `?seed=`, `?debug=1`, `?viewer=1`, `?selftest=1`
- **Asset pipeline:** Generator scripts in `tools/` (Python/Node), deterministic, commit outputs to `assets/`
- **Disk budget:** 1 GB total, 60 MB shipped target, 100 MB hard cap
- **Branch strategy:** `dev` for daily work, fast-forward `main` at tested milestones

---

## Game Design Pillars

1. **Fog as gameplay** — short sight, silhouettes, sound > sight
2. **Torch + radio** — cone of light, static = proximity
3. **Two layers** — Fog (mundane decay) ↔ Nightmare (rust, grating, blood, wrong geometry)
4. **Scarcity & weight** — little ammo, heavy melee, clumsy dodge, limited slots, stomp downed
5. **Mystery via notes/puzzles** — not exposition
6. **Diary map** — explored shade, red-ink locks, player scribbles
7. **Sound as scare engine** — silence, drones, industrial, distant footsteps, breathing
8. **Monsters as symbols** — bodily wrongness fused with domestic/institutional objects
9. **Cinematic camera** — spring-arm follow + authored fixed shots

---

## Run Structure

- **Act I:** Fog Streets + Apartments (2 floors → safe room → boss)
- **Act II:** Clinic / School / Offices (2 floors → safe room → boss)
- **Act III:** Industrial / Underground (2 floors → safe room → boss)
- **Full run:** ~30–45 minutes
- **Permadeath** → hub with meta-currency

---

## Themes & Palettes

| Theme | Fog Colour | Density | Ambient Profile | Signature Hazard |
|-------|------------|---------|-----------------|------------------|
| Fog Streets | Desaturated blue-grey | 0.012 | Wind, distant sirens, creaking signs | Open sightlines, stalker patrols |
| Apartments | Sickly green-sepia | 0.018 | Muffled TV, neighbour sounds, drips | Tight corridors, ambush from furniture |
| Clinic | Cold white-blue | 0.015 | Fluorescent hum, distant screams, wheels | Long sightlines, code doors, medical hazards |
| Offices | Grey-brown | 0.016 | HVAC, flickering lights, paper rustle | Cubicle maze, fuse puzzles |
| Industrial | Rust ox-blood | 0.022 | Machinery, steam, clanking | Grating floors, verticality, environmental damage |

---

## Enemy Archetypes (6–8 regular + stalker + 3 bosses)

1. **Shambler** — slow, tanky, telegraphs heavy swing
2. **Crawler** — fast, low, ambushes from under furniture
3. **Watchman** — advances only in darkness, retreats from torch
4. **Siren** — ranged, projectile + scream draws others
5. **Mimic** — disguises as prop/door, reveals on interact
6. **Amalgam** — fused limbs, erratic movement, splits when damaged
7. **Stalker** (unkillable) — appears on timer/linger, hunts persistently
8. **Bosses** — 2–3 phases, learnable patterns, authored arenas

---

## Puzzle Archetypes (4–6)

1. Code lock (3–4 digits from seed; clues: tallies, clocks, calendars, posters)
2. Item-in-slot (fuse, valve, handle, gear)
3. Riddle/lookup (pick correct painting/mirror/photo from clue text)
4. Radio tuning (frequency from seed)
5. Switch/valve sequence (order from environmental clues)
6. Torch/shadow reveal (hidden writing visible only in torch cone)

---

## Relic System (20+)

Each relic: one upside, one downside. Offered at safe rooms (pick 1 of 3) and special rooms.
Examples: *Glass Jaw* (+damage, –health), *Hoarder* (+slots, –move speed), *Light Eater* (torch doesn't drain, but radio static always max).

---

## Endings (3+ + True)

Flags: bosses spared/killed, notes read, relics taken, healing used, stalker encounters survived, Nightmare time.
True ending requires multi-run progress (lore fragments assembled across runs).

---

## Asset Targets

| Category | Count | Size Budget |
|----------|-------|-------------|
| Textures | ~40 seamless 128–256px PNGs | 15 MB |
| Audio (baked) | ~10 loops/stingers | 15 MB |
| Models (procedural) | 60+ props, 8 enemies, player | Code only |
| JS (own) | Modular ES modules | 3 MB |
| Vendor (Three.js) | three.module.js + core | 3 MB |
| **Total** | | **~60 MB** |

---

## Testing Strategy

- **Node unit tests:** `node --test` — RNG, generators (300+ seeds), save/load, relics, bot sim
- **Browser smoke:** Playwright or `?selftest=1` (in-page 60s bot sim, PASS/FAIL)
- **Static checks:** `node --check`, import/asset path resolver (case-sensitive)
- **Deployed verification:** 200 for index.html, main module, texture, audio + headless smoke
- **Performance:** 60 fps integrated GPU at 854×480; Low/Med/High presets + auto-downgrade
- **Balance:** Bot simulation stats → tune director/loot

---

## Disk Hygiene

- `du -sh` + `df -h .` after every milestone
- Stop at 800 MB, finish under 600 MB
- Clear caches, remove `node_modules`/`tools/out/` when done
- `.gitignore`: node_modules, tools/out, caches, .env, OS junk, BRIEF.md
- Secret scan before push: `grep -rniE "ghp_|github_pat_|gho_|sk-[A-Za-z0-9]|PRIVATE KEY|/home/|/Users/|C:\\\\Users"`