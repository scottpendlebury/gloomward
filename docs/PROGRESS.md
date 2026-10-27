# Gloomward — Progress Log

**Started:** 2026-10-27
**Current Milestone:** M1 — Vertical Slice
**Git Branch:** dev

---

## 2026-10-27 — M0 Pipeline Setup

### Done
- [x] Environment inventory: Linux, 1.6 GB free, Node 26.7.0, npm 12.0.2, Python 3.14.7, git 2.53.0, gh authenticated (scottpendlebury)
- [x] Project directory created: `/home/scott/gloomward`
- [x] Git init + config with noreply email (`2189228+scottpendlebury@users.noreply.github.com`)
- [x] Branch renamed to `main`
- [x] Directory structure created: `src/{core,sim,gen,render,audio,ui,data}`, `assets/{textures,audio,data}`, `tools`, `tests`, `vendor/three`, `docs`, `screens`
- [x] Three.js installed and vendored: `three.module.js`, `three.core.js`, `LICENSE` → `vendor/three/`
- [x] `package.json` with `"type": "module"`
- [x] `index.html` with import map, "hello fog" Three.js page (spinning cube, fog, torch spotlight, particles)
- [x] `.nojekyll` file at root
- [x] `docs/PLAN.md` created with full milestones, technical decisions, game design
- [x] `docs/ARCHITECTURE.md` created with module overview, interfaces, data flow
- [x] GitHub repo created: `scottpendlebury/gloomward` (public)
- [x] Initial commit pushed to GitHub
- [x] GitHub Pages enabled (branch `main`, folder `/`)
- [x] Live URL verified: https://scottpendlebury.github.io/gloomward/ (HTTP 200)
- [x] `.gitignore` added, `node_modules` removed from tracking
- [x] Switched to `dev` branch for daily work
- [x] Core simulation modules: RNG, Grid, Entities, Combat, Items, Puzzles, Director, Meta, Save
- [x] Generation modules: Floor (interiors + streets), Nightmare, Props
- [x] Render modules: Renderer (post-FX), SceneManager (chunk meshing), Camera (spring-arm), Player (procedural anim)
- [x] Audio modules: Engine, Synth, Ambience, Music, SFX, Radio
- [x] UI modules: Input, Menus, Options, Hints
- [x] Main Game orchestrator
- [x] M1 Vertical Slice core systems complete
- [x] Texture generation: 39 seamless 256px PNGs (tiles, props, decals, sprites, nightmare variants)
- [x] Audio generation: 7 ambience loops (10s each) + 3 stingers (WAV, 44.1kHz)
- [x] Asset viewer (`?viewer=1`) with texture, prop, enemy, sprite browsing
- [x] URL parameter handling: ?viewer=1, ?debug=1, ?selftest=1
- [x] Assets deployed and verified on GitHub Pages
- [x] Unit tests passing: RNG, Grid, Floor generation (34 tests)

### In Progress
- [ ] Complete enemy AI behaviors (all 8 types)
- [ ] Puzzle system integration with UI
- [ ] Relic system implementation
- [ ] Hub meta-progression UI
- [ ] Ending system logic
- [ ] Polish and optimization

### Known Issues
- Disk space is tight (1.6 GB free). Must monitor `du -sh` and `df -h .` after each milestone.
- Three.js modern build splits into multiple files; using `three.module.js` + `three.core.js` for now.

### Next Steps
1. Implement remaining enemy AI behaviors
2. Integrate puzzle system with UI
3. Build hub and meta-progression
4. Add ending logic
5. Polish and optimization

---

## Milestone Checklist

| Milestone | Status | Target | Live Verified |
|-----------|--------|--------|---------------|
| M0 Pipeline | ✅ Done | 2026-10-27 | ✅ https://scottpendlebury.github.io/gloomward/ |
| M1 Vertical Slice | 🟡 Core systems + assets + viewer + tests done | — | — |
| M2 Core Loop | ⬜ Pending | — | — |
| M3 Roguelike Depth | ⬜ Pending | — | — |
| M4 Polish & Content | ⬜ Pending | — | — |

---

## Disk Usage Log

| Date | Project Size | Free Space | Notes |
|------|--------------|------------|-------|
| 2026-10-27 | ~5 MB | 1.6 GB | Initial setup |
| 2026-10-27 | ~8 MB | 1.6 GB | M0 complete (vendored Three.js, docs) |
| 2026-10-27 | ~14 MB | 1.6 GB | M1 core systems (sim, gen, render, audio, ui, core) |
| 2026-10-27 | ~21 MB | 1.6 GB | M1 assets (39 textures, 10 audio files) |
| 2026-10-27 | ~22 MB | 1.6 GB | M1 viewer + URL params |
| 2026-10-27 | ~27 MB | 1.6 GB | M1 tests passing (34 tests) |