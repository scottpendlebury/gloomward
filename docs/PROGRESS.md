# Gloomward — Progress Log

**Started:** 2026-10-27
**Current Milestone:** M0 — Pipeline
**Git Branch:** main (will switch to dev after M0)

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

### In Progress
- [ ] GitHub repo creation and push
- [ ] GitHub Pages enable + verify live URL
- [ ] `docs/PROGRESS.md` (this file)
- [ ] `docs/ARCHITECTURE.md`
- [ ] Initial commit and push to GitHub

### Known Issues
- Disk space is tight (1.6 GB free). Must monitor `du -sh` and `df -h .` after each milestone.
- Three.js modern build splits into multiple files; using `three.module.js` + `three.core.js` for now. May need additional modules from `examples/jsm/` later.

### Next Steps
1. Create GitHub repo `gloomward` and push initial commit
2. Enable GitHub Pages (branch `main`, folder `/`)
3. Poll live URL until HTTP 200
4. Create `docs/ARCHITECTURE.md`
5. Switch to `dev` branch for daily work
6. Begin M1 Vertical Slice

---

## Milestone Checklist

| Milestone | Status | Target | Live Verified |
|-----------|--------|--------|---------------|
| M0 Pipeline | 🟡 In Progress | 2026-10-27 | — |
| M1 Vertical Slice | ⬜ Pending | — | — |
| M2 Core Loop | ⬜ Pending | — | — |
| M3 Roguelike Depth | ⬜ Pending | — | — |
| M4 Polish & Content | ⬜ Pending | — | — |

---

## Disk Usage Log

| Date | Project Size | Free Space | Notes |
|------|--------------|------------|-------|
| 2026-10-27 | ~5 MB | 1.6 GB | Initial setup |