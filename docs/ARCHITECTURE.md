# Gloomward — Architecture

**Version:** 0.1.0
**Last Updated:** 2026-10-27

---

## Module Overview

```
src/
├── core/           # Engine bootstrap, game loop, input, resources
├── sim/            # Pure simulation logic (NO Three.js/DOM)
│   ├── rng.js      # Seeded PRNG (mulberry32) + sub-seed derivation
│   ├── grid.js     # Grid world model (collision, LOS, pathfinding)
│   ├── entities.js # Entity definitions, components, archetypes
│   ├── combat.js   # Combat rules, damage, hit reactions
│   ├── items.js    # Item definitions, effects, inventory logic
│   ├── puzzles.js  # Puzzle archetypes, validation, clue generation
│   ├── director.js # Spawn budgeting, pacing, elite modifiers
│   ├── meta.js     # Meta-progression, currency, unlocks, endings
│   └── save.js     # Save/load, versioned format, export/import
├── gen/            # Procedural generation (pure, seeded, testable)
│   ├── floor.js    # Floor graph → grid embedding → validation
│   ├── interiors.js# Room templates, BSP/corridor growth, dressing
│   ├── streets.js  # Fog streets: blocks, roads, building fronts
│   ├── nightmare.js# Nightmare corruption pass
│   └── props.js    # Prop placement, clutter, decals
├── render/         # Three.js rendering (reads sim state only)
│   ├── renderer.js # WebGLRenderer setup, internal resolution, post FX
│   ├── scene.js    # Scene graph, chunk meshing, InstancedMesh pools
│   ├── camera.js   # Spring-arm, collision, cinematic shots, shake
│   ├── player.js   # Player mesh, procedural animation, IK
│   ├── enemies.js  # Enemy meshes, distortion, animations
│   ├── lighting.js # Constant light pool, torch, fog
│   ├── post.js     # Full-screen pass: grain, dither, vignette, bloom, CA
│   ├── ui.js       # HUD, menus, map, inventory, notes (Three.js overlay)
│   └── viewer.js   # Asset viewer (`?viewer=1`)
├── audio/          # Web Audio API synthesis + baked playback
│   ├── context.js  # AudioContext, mixer buses, master limiter
│   ├── synth.js    # Oscillators, noise, filters, envelopes, IR generation
│   ├── ambience.js # Layered beds per theme + sparse events
│   ├── music.js    # Adaptive generative music (states: explore/tension/chase/safe/boss)
│   ├── sfx.js      # Footsteps, doors, weapons, enemies, UI, radio
│   └── radio.js    # Pocket radio: static, murmurs, stations, clues
├── ui/             # DOM-based UI (menus, options, rebinding, accessibility)
│   ├── menus.js    # Title, pause, hub, death, inventory, map, notes, archive
│   ├── options.js  # Graphics, audio, controls, accessibility, rebinding
│   ├── input.js    # Keyboard, mouse, gamepad, pointer lock, rebinding
│   └── hints.js    # On-screen control hints
└── data/           # Static data (definitions, templates, authored content)
    ├── themes.js   # Theme palettes, fog params, audio profiles, hazards
    ├── enemies.js  # Enemy archetypes, stats, AI params, animations
    ├── items.js    # Item definitions, relics, pickup tables
    ├── puzzles.js  # Puzzle templates, clue generators
    ├── notes.js    # 40+ authored notes + procedural templates
    └── rooms.js    # Room templates (ASCII grids + prop anchors + tags)
```

---

## Public Interfaces (Key Modules)

### `src/core/game.js`
```js
// Main entry point, orchestrates all systems
export class Game {
  constructor(canvas, options = {})
  async init()                    // Load assets, init subsystems
  startRun(seed, options)         // New run from title/hub
  continueRun(saveData)           // Load saved run
  update(dt)                      // Fixed-timestep simulation + interpolated render
  handleInput(input)              // Route input to sim/render/ui
  save()                          // Serialize run state
  destroy()                       // Cleanup (GPU memory, audio, listeners)
}
```

### `src/sim/rng.js`
```js
export class SeededRNG {
  constructor(seed)               // seed: uint32 or string
  next() : number                 // [0, 1) float
  nextInt(max) : number           // [0, max)
  fork() : SeededRNG              // Derived sub-seed (for floor, system, etc.)
  getState() : string             // Serialize for save
  static fromState(state) : SeededRNG
}
```

### `src/sim/grid.js`
```js
export class GridWorld {
  constructor(width, height, cellSize = 1.5)
  setCell(x, y, cellType)         // WALL, FLOOR, DOOR, PROP, etc.
  getCell(x, y) : Cell
  raycast(x0, y0, x1, y1) : Hit   // Grid-based LOS
  findPath(start, goal) : Point[] // Flow-field / A*
  inBounds(x, y) : boolean
  neighbors(x, y) : Point[]
}
```

### `src/sim/entities.js`
```js
// Component-based, no inheritance
export const Components = {
  Transform: { x, y, z, rot },
  Velocity: { vx, vz },
  Health: { current, max, iframe },
  Stamina: { current, max, regen },
  Torch: { battery, max, flicker, on },
  Radio: { staticLevel, station, tuning },
  Inventory: { slots: ItemStack[8], selected },
  AI: { state, target, timer, params }, // DORMANT, WANDER, INVESTIGATE, CHASE, ATTACK, STAGGER, DOWN, FLEE
  PlayerControl: { aim, move, dodgeCooldown },
  // ...
}

export function createEntity(archetype, overrides) : Entity
export const Archetypes = { PLAYER, SHAMBLER, CRAWLER, WATCHMAN, SIREN, MIMIC, AMALGAM, STALKER, ... }
```

### `src/sim/director.js`
```js
export class Director {
  constructor(rng, floorData, theme)
  budgetForFloor(floorIndex) : SpawnBudget
  requestSpawn(type, position) : boolean // Checks budget, returns entity or null
  onPlayerDamage(amount)                 // Grants quiet stretch
  onPlayerStall(time)                    // Escalates
  update(dt, entities, player)           // Pacing, stalker timer
}
```

### `src/gen/floor.js`
```js
export function generateFloor(rng, floorIndex, theme, act) : FloorData
// Returns: { grid, rooms, graph, criticalPath, locks, keys, items, enemies, props, exit, start, validationReport }

export function validateFloor(floorData) : ValidationReport
// BFS with key collection: exit reachable, all keys reachable, no soft-locks, no overlaps
```

### `src/render/renderer.js`
```js
export class Renderer {
  constructor(canvas, options)
  setInternalResolution(w, h)       // 854x480 default
  setPostEffect(name, enabled)
  setQualityPreset('low'|'medium'|'high')
  render(simState, interpolatedAlpha)
  resize(width, height)
  dispose()                         // Free GPU memory
}
```

### `src/audio/context.js`
```js
export class AudioEngine {
  constructor()
  resume()                          // Must be called from user gesture
  setVolume(bus, value)             // master, music, sfx, ambience, radio
  playSfx(name, options)            // { position, volume, pitch, occlusion }
  playMusic(layer, state)           // Crossfade layers
  setRadioStatic(intensity)         // 0–1
  setListenerTransform(pos, forward, up)
  update(dt)                        // Param automation, voice cleanup
  suspend()                         // Tab hidden
}
```

### `src/ui/input.js`
```js
export class InputManager {
  constructor()
  bind(action, keyOrButton)         // Rebindable
  getActionState(action) : boolean  // pressed, held, released
  getMouseDelta() : { x, y }
  getGamepad(index) : GamepadState
  setPointerLock(enabled)
  on(action, callback)              // Event-style for UI
}
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        GAME LOOP (60 Hz)                        │
├─────────────────────────────────────────────────────────────────┤
│  InputManager → Sim (fixed step) → Render (interpolated)       │
│       ↑              │                    │                     │
│       │              ▼                    ▼                     │
│       │    ┌─────────────────┐    ┌──────────────┐             │
│       │    │   SIM STATE     │    │ RENDER STATE │             │
│       │    │ (pure JS objects)    │ (Three.js)   │             │
│       │    └────────┬────────┘    └──────┬───────┘             │
│       │             │                    │                     │
│       └──── Audio ◄─┴──── UI (DOM) ◄─────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

- **Sim** owns authority; **Render** and **Audio** are read-only views
- **UI** (DOM) reads sim state for HUD/menus, writes input actions
- **Save** serializes sim state + RNG state + meta + run flags

---

## Generation Pipeline (Pure Functions)

```
generateFloor(rng, floorIndex, theme, act)
    │
    ├─► buildRoomGraph(rng, floorIndex, theme) → { nodes[], edges[], criticalPath[], sideBranches[] }
    │       │
    │       ├─► assignLocks(rng, graph) → { doors: {id, type, keyRoom}, keys: {id, room} }
    │       └─► validateGraph(graph, locks, keys) → reachable / unreachable
    │
    ├─► embedGraphInGrid(rng, graph, theme) → GridWorld
    │       ├─► BSP or growth algorithm
    │       ├─► corridors (min 2 cells wide)
    │       └─► ensure at least one loop for flanking
    │
    ├─► dressRooms(rng, grid, theme, roomTemplates) → props, decals, clutter
    │
    ├─► placeItemsEnemies(rng, grid, directorBudget, lootTables) → spawns
    │
    └─► validateFloor(grid, spawns, locks, keys) → ValidationReport
            │
            ├─► BFS from start with key collection
            ├─► Exit reachable?
            ├─► All keys reachable before their doors?
            ├─► No entity overlaps?
            ├─► Counts in range?
            └─► If invalid → regenerate with derived seed
```

---

## Lighting Strategy (Constant Count)

| Light | Type | Purpose | Updates |
|-------|------|---------|---------|
| Torch | SpotLight | Player's only shadow caster | Every frame (follows player) |
| Ambient | HemisphereLight | Base fill | Never |
| Pool 0–5 | PointLight | Nearest light sources (lamps, fires, etc.) | Repositioned on chunk load / player proximity |

- **Never** add/remove lights at runtime (shader recompile = stutter)
- Shadow map: 512×512, updated only when torch moves significantly

---

## Post-Processing (Single Pass)

```glsl
// post.frag — all effects in one shader
uniform sampler2D tDiffuse;
uniform float uGrainAmount;
uniform float uDitherStrength;
uniform float uVignetteStrength;
uniform float uBloomThreshold;
uniform float uChromaticAberration;
uniform vec3 uColourGrade;  // per-theme LUT baked as 3D texture or vec3 ramp
uniform bool uScanlines;

void main() {
  vec2 uv = vUv;
  vec4 color = texture2D(tDiffuse, uv);

  // Chromatic aberration
  if (uChromaticAberration > 0.0) {
    float offset = uChromaticAberration * 0.002;
    color.r = texture2D(tDiffuse, uv + vec2(offset, 0)).r;
    color.b = texture2D(tDiffuse, uv - vec2(offset, 0)).b;
  }

  // Colour grade (simple lift/gamma/gain per theme)
  color.rgb = color.rgb * uColourGrade;

  // Film grain (animated via time uniform)
  color.rgb += (hash(uv + uTime) - 0.5) * uGrainAmount;

  // Ordered dither (Bayer 4x4)
  color.rgb = floor(color.rgb * (32.0 - uDitherStrength * 31.0)) / (32.0 - uDitherStrength * 31.0);

  // Vignette
  float vig = 1.0 - length(uv - 0.5) * uVignetteStrength;
  color.rgb *= vig;

  // Bloom (bright pass + blur would be separate; here: simple additive)
  // Full bloom uses ping-pong; this is cheap approximation
  float bright = max(max(color.r, color.g), color.b);
  if (bright > uBloomThreshold) color.rgb += (bright - uBloomThreshold) * 0.3;

  // Scanlines
  if (uScanlines) color.rgb *= 1.0 - 0.15 * sin(uv.y * 480.0 * 3.14159);

  gl_FragColor = color;
}
```

---

## Save Format (Versioned JSON)

```json
{
  "version": 3,
  "meta": { "currency": 120, "unlocks": ["kit_2", "relic_pool_b"], "stats": {...} },
  "run": {
    "seed": "abc123",
    "act": 1,
    "floor": 2,
    "rngState": "serialized_prng",
    "player": { "health": 80, "stamina": 100, "torch": 45, "inventory": [...], "position": [x,y] },
    "floorData": { "grid": "...", "entities": [...], "explored": [...] },
    "flags": { "boss1_spared": true, "note_17_read": true, ... },
    "timestamp": 1700000000000
  }
}
```

- `localStorage` key: `gloomward_save_v3`
- Export/import: base64(JSON) as text file
- Try/catch wrapped; fallback to in-memory only

---

## URL Parameters

| Param | Values | Purpose |
|-------|--------|---------|
| `seed` | uint32 string | Fixed run seed (overrides random) |
| `debug` | `1` | FPS, seed, entity counts, cheat panel (god mode, noclip, etc.) |
| `viewer` | `1` | Asset gallery (textures, props, enemies, animations) |
| `selftest` | `1` | In-page bot simulation (~60s), prints PASS/FAIL |

---

## Asset Manifest (Committed to `assets/manifest.json`)

```json
{
  "textures": [ { "name": "concrete_01", "path": "textures/concrete_01.png", "size": 12288, "generator": "tools/gen_textures.py", "license": "CC0" }, ... ],
  "audio": [ { "name": "ambience_streets", "path": "audio/ambience_streets.ogg", "size": 1048576, "generator": "tools/gen_audio.py", "license": "CC0" }, ... ],
  "models": "procedural — no files"
}
```

---

## Performance Budgets

| Metric | Target | Max |
|--------|--------|-----|
| Draw calls | < 150 | 250 |
| Triangles/frame | < 100k | 200k |
| Texture memory | < 32 MB | 64 MB |
| JS heap (sim) | < 20 MB | 50 MB |
| Audio voices | < 24 | 32 |
| Frame time (integrated GPU) | 16.6 ms | 20 ms |
| Generation time/floor | < 100 ms | 150 ms |

---

## Testing Interfaces

### Node (`node --test`)
```js
// tests/sim/rng.test.js
import { test } from 'node:test';
import { SeededRNG } from '../../src/sim/rng.js';
test('deterministic sequence', () => { ... });

// tests/gen/floor.test.js
test('300 seeds: exit reachable, keys valid', async () => {
  for (let i = 0; i < 300; i++) {
    const floor = generateFloor(new SeededRNG(i), 0, 'apartments', 1);
    const report = validateFloor(floor);
    assert.ok(report.valid);
  }
});
```

### Browser (`?selftest=1`)
- Loads game headless (no pointer lock)
- Runs 60s bot simulation via sim only
- Logs: floor transitions, combat encounters, deaths, soft-locks
- Prints `SELFTEST: PASS` or `SELFTEST: FAIL: <reason>` to console and page

---

## Deployment

- **GitHub Pages:** Branch `main`, folder `/`
- **Build:** None (vanilla ES modules + import map)
- **SPA fallback:** Not needed (single `index.html`)
- **Cache headers:** Default Pages headers sufficient
- **Verify:** `curl -I https://scottpendlebury.github.io/gloomward/` → 200