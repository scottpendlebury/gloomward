// src/core/game.js — Main entry point, orchestrates all systems
// Exports: Game
// Dependencies: all subsystems

import { Renderer } from '../render/renderer.js';
import { SceneManager } from '../render/scene.js';
import { CameraController, CinematicShots } from '../render/camera.js';
import { PlayerRenderer } from '../render/player.js';
import { AudioEngine } from '../audio/context.js';
import { AmbienceSystem } from '../audio/ambience.js';
import { MusicSystem, MusicState } from '../audio/music.js';
import { SFXSystem } from '../audio/sfx.js';
import { RadioSystem } from '../audio/radio.js';
import { InputManager } from '../ui/input.js';
import { MenuSystem } from '../ui/menus.js';
import { OptionsManager } from '../ui/options.js';
import { HintSystem } from '../ui/hints.js';
import { SeededRNG } from '../sim/rng.js';
import { GridWorld } from '../sim/grid.js';
import { createEntity, Archetypes, AIState } from '../sim/entities.js';
import { CombatSystem } from '../sim/combat.js';
import { InventorySystem, ItemRegistry, rollLoot } from '../sim/items.js';
import { PuzzleSystem, PuzzleTypes } from '../sim/puzzles.js';
import { Director, EnemyDefinitions, EnemyTier } from '../sim/director.js';
import { MetaProgression, StartingKits, Relics, Endings, EndingFlags } from '../sim/meta.js';
import { SaveSystem, SaveVersion } from '../sim/save.js';
import { generateFloor, validateFloor, FloorData } from '../gen/floor.js';
import { generateStreets, generateStreetInterior } from '../gen/streets.js';
import { corruptFloor, NightmareAudioProfile } from '../gen/nightmare.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'loading'; // loading, title, playing, paused, dead, hub
    this.version = '0.1.0';

    // Core systems
    this.renderer = null;
    this.sceneManager = null;
    this.cameraController = null;
    this.playerRenderer = null;
    this.audioEngine = null;
    this.ambienceSystem = null;
    this.musicSystem = null;
    this.sfxSystem = null;
    this.radioSystem = null;
    this.inputManager = null;
    this.menuSystem = null;
    this.optionsManager = null;
    this.hintSystem = null;

    // Simulation
    this.rng = null;
    this.grid = null;
    this.floorData = null;
    this.player = null;
    this.entities = [];
    this.combatSystem = null;
    this.inventorySystem = null;
    this.puzzleSystem = null;
    this.director = null;
    this.meta = null;
    this.saveSystem = null;

    // Run state
    this.seed = null;
    this.act = 1;
    this.floor = 1;
    this.theme = 'apartments';
    this.runFlags = {};
    this.runTime = 0;
    this.runStats = { kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0, healingUsed: 0, currencyEarned: 0 };

    // Timing
    this.fixedDt = 1 / 60;
    this.accumulator = 0;
    this.lastTime = 0;
    this.frameCount = 0;

    // Debug
    this.debug = false;
    this.debugInfo = {};

    // Auto-save
    this.autoSaveTimer = 0;
    this.autoSaveInterval = 30; // seconds
  }

  async init() {
    console.log('Initializing Gloomward...');

    // Initialize renderer
    this.renderer = new Renderer(this.canvas);
    this.threeRenderer = this.renderer.getThreeRenderer();

    // Initialize scene
    this.sceneManager = new SceneManager(this.renderer);

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    this.cameraController = new CameraController(this.camera, this.renderer);
    this.cameraController.setGrid(this.sceneManager); // Will be updated when grid exists

    // Initialize player renderer
    this.playerRenderer = new PlayerRenderer(this.sceneManager.scene);

    // Initialize audio
    this.audioEngine = new AudioEngine();
    await this.audioEngine.init();

    this.ambienceSystem = new AmbienceSystem(this.audioEngine);
    this.musicSystem = new MusicSystem(this.audioEngine);
    this.sfxSystem = new SFXSystem(this.audioEngine);
    this.radioSystem = new RadioSystem(this.audioEngine, this.sfxSystem);
    this.radioSystem.init();

    // Initialize input
    this.inputManager = new InputManager();

    // Initialize UI
    this.optionsManager = new OptionsManager();
    this.menuSystem = new MenuSystem(this.inputManager, this);
    this.hintSystem = new HintSystem();

    // Initialize simulation systems
    this.combatSystem = new CombatSystem(new SeededRNG(0));
    this.inventorySystem = new InventorySystem();
    this.puzzleSystem = new PuzzleSystem(new SeededRNG(0));
    this.saveSystem = new SaveSystem();

    // Load meta progression
    this.meta = new MetaProgression();

    // Apply options
    this.applyOptions();

    // Set up event listeners
    this.setupEventListeners();

    // Show title screen
    this.showTitleScreen();

    this.state = 'title';
    console.log('Gloomward initialized');
  }

  setupEventListeners() {
    // Window resize
    window.addEventListener('resize', () => this.onResize());

    // Visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.audioEngine.suspend();
        if (this.state === 'playing') this.pause();
      } else {
        this.audioEngine.resume();
      }
    });

    // Error handling
    window.addEventListener('error', (e) => this.onError(e));
    window.addEventListener('unhandledrejection', (e) => this.onError(e.reason));
  }

  applyOptions() {
    this.optionsManager.applyToRenderer(this.renderer);
    this.optionsManager.applyToAudio(this.audioEngine);
    this.optionsManager.applyToCamera(this.cameraController);
    this.optionsManager.applyToUI();
  }

  showTitleScreen() {
    this.menuSystem.show('title');
    this.hintSystem.setHints(HintSystem.getContextHints('title'));
    this.ambienceSystem.setTheme('streets');
    this.musicSystem.setState(MusicState.EXPLORE);

    // Title screen camera animation
    this.cameraController.currentPosition.set(0, 5, 20);
    this.cameraController.targetPosition.set(0, 1.6, 0);
  }

  async startRun(seed = null, options = {}) {
    this.seed = seed || this.generateSeed();
    this.rng = new SeededRNG(this.seed);
    this.act = options.act || 1;
    this.floor = options.floor || 1;
    this.theme = options.theme || 'apartments';
    this.runFlags = {};
    this.runTime = 0;
    this.runStats = { kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0, healingUsed: 0, currencyEarned: 0 };

    // Apply starting kit
    const kitId = options.kit || 'survivor';
    const kit = StartingKits[kitId];
    if (kit) {
      this.applyStartingKit(kit);
    }

    // Apply difficulty
    if (options.difficulty !== undefined) {
      this.meta.setDifficultyTier(options.difficulty);
    }

    // Generate first floor
    await this.generateFloor();

    // Spawn player
    this.spawnPlayer();

    // Set up camera
    this.cameraController.setTarget(this.player);
    this.cameraController.setGrid(this.floorData.grid);
    this.cameraController.resetCamera();

    // Set theme audio
    this.ambienceSystem.setTheme(this.theme);
    this.musicSystem.setState(MusicState.EXPLORE);
    this.radioSystem.setEnabled(true);

    // Hide menus, show hints
    this.menuSystem.hideAll();
    this.hintSystem.setHints(HintSystem.getContextHints('playing'));

    this.state = 'playing';
    this.lastTime = performance.now();
    this.animate();
  }

  applyStartingKit(kit) {
    // Apply stats
    if (this.player) {
      const health = this.player.components.Health;
      const stamina = this.player.components.Stamina;
      const torch = this.player.components.Torch;
      if (health) { health.max = kit.stats.health; health.current = kit.stats.health; }
      if (stamina) { stamina.max = kit.stats.stamina; stamina.current = kit.stats.stamina; }
      if (torch) { torch.max = kit.stats.torchMax; torch.battery = kit.stats.torchMax; }
    }

    // Add starting items
    for (const item of kit.startingItems) {
      this.inventorySystem.addItem(this.player.components.Inventory, item.itemId, item.amount);
    }

    // Apply perks
    if (kit.perks) {
      this.player.perks = { ...kit.perks };
    }

    // Give starting relic
    if (kit.relic) {
      this.giveRelic(kit.relic);
    }
  }

  generateSeed() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async generateFloor() {
    // Determine floor type
    const isStreet = this.act === 1 && this.floor === 1;

    if (isStreet) {
      this.floorData = generateStreets(this.rng.fork(), this.floor, this.act);
      this.theme = 'streets';
    } else {
      this.floorData = generateFloor(this.rng.fork(), this.floor, this.theme, this.act);
    }

    // Check for Nightmare transition
    if (this.shouldEnterNightmare()) {
      this.floorData = corruptFloor(this.floorData, this.rng.fork(), 0.5 + this.floor * 0.1);
      this.ambienceSystem.setTheme('nightmare');
      this.musicSystem.setState(MusicState.TENSION);
    }

    // Initialize grid reference
    this.grid = this.floorData.grid;
    this.cameraController.setGrid(this.grid);

    // Build scene meshes
    this.buildSceneFromFloor();

    // Initialize director
    this.director = new Director(this.rng.fork(), this.floorData, this.theme, this.floor, this.act);

    // Spawn entities from floor data
    this.spawnFloorEntities();

    // Initialize puzzle system
    this.puzzleSystem = new PuzzleSystem(this.rng.fork());
    for (const lock of this.floorData.locks) {
      if (lock.puzzle) {
        this.puzzleSystem.activePuzzles.set(lock.doorId, lock.puzzle);
      }
    }
  }

  shouldEnterNightmare() {
    // Story beats, stalker arrival, or random chance
    if (this.runFlags.forceNightmare) return true;
    if (this.floor >= 3 && this.rng.next() < 0.3) return true;
    if (this.runStats.damageTaken > 200 && this.rng.next() < 0.2) return true;
    return false;
  }

  buildSceneFromFloor() {
    // Rebuild all chunks
    for (const chunk of this.sceneManager.chunkMeshes.values()) {
      this.sceneManager.scene.remove(chunk);
      chunk.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this.sceneManager.chunks.clear();
    this.sceneManager.chunkMeshes.clear();

    // Clear prop pools
    for (const pool of this.sceneManager.propPools.values()) {
      pool.clear();
    }
    this.sceneManager.decalMeshes.forEach(m => {
      m.geometry.dispose();
      m.material.dispose();
    });
    this.sceneManager.decalMeshes = [];

    // Rebuild visible chunks around player
    if (this.player) {
      const px = this.player.components.Transform.x;
      const py = this.player.components.Transform.y;
      this.sceneManager.updateVisibleChunks(this.grid, px, py, 4);
    }

    // Fog
    const fogColor = this.floorData.fogOverride?.color || this.getThemeFogColor();
    const fogDensity = this.floorData.fogOverride?.density || this.getThemeFogDensity();
    this.sceneManager.scene.fog = new THREE.FogExp2(fogColor, fogDensity);
    this.renderer.getThreeRenderer().setClearColor(fogColor);

    // Lighting overrides
    if (this.floorData.lightOverride) {
      this.cameraController.config.torchColor = this.floorData.lightOverride.torchColor;
    }
  }

  getThemeFogColor() {
    const colors = {
      streets: 0x1a1a2e,
      apartments: 0x1a2e1a,
      clinic: 0x1a2a2e,
      offices: 0x2a2a1a,
      industrial: 0x2e1a1a,
      nightmare: 0x4a0000,
    };
    return colors[this.theme] || colors.apartments;
  }

  getThemeFogDensity() {
    const densities = {
      streets: 0.012,
      apartments: 0.018,
      clinic: 0.015,
      offices: 0.016,
      industrial: 0.022,
      nightmare: 0.035,
    };
    return densities[this.theme] || 0.015;
  }

  spawnFloorEntities() {
    this.entities = [];

    for (const spawn of this.floorData.spawns) {
      const entity = createEntity(spawn.archetype);
      entity.components.Transform.x = spawn.position.x;
      entity.components.Transform.z = spawn.position.y;
      entity.components.Transform.y = 0;

      // Apply nightmare mods
      if (spawn.nightmare) {
        entity.nightmare = true;
        entity.healthMult = spawn.healthMult;
        entity.damageMult = spawn.damageMult;
        entity.speedMult = spawn.speedMult;
      }

      // Apply elite modifier
      if (spawn.modifier) {
        entity.eliteModifier = spawn.modifier;
      }

      // Special handling for key items
      if (spawn.type === 'key_item') {
        entity.components.KeyItem = { keyId: spawn.keyId, name: spawn.name };
      }

      // Pickups
      if (spawn.type === 'pickup') {
        entity.components.Pickup = { itemId: spawn.itemId, amount: 1 };
      }

      this.entities.push(entity);
      this.sceneManager.scene.add(entity.mesh); // If entity has mesh
    }

    // Spawn exit marker
    if (this.floorData.exit) {
      const exitEntity = createEntity('FLOOR_EXIT');
      exitEntity.components.Transform.x = this.floorData.exit.x;
      exitEntity.components.Transform.z = this.floorData.exit.y;
      exitEntity.components.Exit = { nextFloor: this.floor + 1 };
      this.entities.push(exitEntity);
    }
  }

  spawnPlayer() {
    this.player = createEntity('PLAYER');
    this.player.components.Transform.x = this.floorData.start.x;
    this.player.components.Transform.z = this.floorData.start.y;
    this.player.components.Transform.y = 0;

    // Initialize inventory
    this.player.components.Inventory.slots = new Array(this.player.components.Inventory.maxSlots).fill(null);

    // Give starting kit items (already done in startRun)
    this.entities.push(this.player);
  }

  animate(time = 0) {
    if (this.state !== 'playing') {
      requestAnimationFrame((t) => this.animate(t));
      return;
    }

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    // Fixed timestep simulation
    this.accumulator += dt;
    while (this.accumulator >= this.fixedDt) {
      this.fixedUpdate(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    // Interpolated render
    const alpha = this.accumulator / this.fixedDt;
    this.render(alpha);

    // Update audio
    this.audioEngine.update(dt);

    // Update hint system
    this.hintSystem.update(dt);

    // Auto-save
    this.autoSaveTimer += dt;
    if (this.autoSaveTimer >= this.autoSaveInterval) {
      this.autoSaveTimer = 0;
      this.saveSystem.saveRun(this.getRunState());
    }

    requestAnimationFrame((t) => this.animate(t));
  }

  fixedUpdate(dt) {
    this.runTime += dt;
    this.frameCount++;

    // Update player
    this.updatePlayer(dt);

    // Update entities
    this.updateEntities(dt);

    // Update director
    if (this.director) {
      this.director.update(dt, this.entities, this.player, this.grid);
    }

    // Update camera
    this.cameraController.update(dt, this.getInputState());

    // Update player renderer
    this.playerRenderer.update(dt, this.getInputState(), this.player);

    // Update scene (chunks, particles)
    if (this.player) {
      this.sceneManager.updateVisibleChunks(this.grid, this.player.components.Transform.x, this.player.components.Transform.z, 3);
    }
    this.sceneManager.updateFogParticles(this.runTime, this.player?.components.Transform);

    // Update radio
    const nearbyEnemies = this.countNearbyEnemies();
    this.radioSystem.update(dt, nearbyEnemies, this.player?.components.Torch?.on);

    // Check win/lose conditions
    this.checkConditions();
  }

  getInputState() {
    return {
      moveForward: this.inputManager.isHeld('moveForward'),
      moveBackward: this.inputManager.isHeld('moveBackward'),
      moveLeft: this.inputManager.isHeld('moveLeft'),
      moveRight: this.inputManager.isHeld('moveRight'),
      run: this.inputManager.isHeld('run'),
      aim: this.inputManager.isHeld('aim'),
      attack: this.inputManager.isPressed('attack'),
      interact: this.inputManager.isPressed('interact'),
      torch: this.inputManager.isPressed('torch'),
      reload: this.inputManager.isPressed('reload'),
      quickHeal: this.inputManager.isPressed('quickHeal'),
      dodge: this.inputManager.isPressed('dodge'),
      inventory: this.inputManager.isPressed('inventory'),
      map: this.inputManager.isPressed('map'),
      pause: this.inputManager.isPressed('pause'),
      lookBehind: this.inputManager.isPressed('lookBehind'),
      cameraReset: this.inputManager.isPressed('cameraReset'),
      mouseDelta: this.inputManager.getMouseDelta(),
    };
  }

  updatePlayer(dt) {
    if (!this.player) return;

    const input = this.getInputState();
    const transform = this.player.components.Transform;
    const velocity = this.player.components.Velocity;
    const control = this.player.components.PlayerControl;
    const stamina = this.player.components.Stamina;
    const health = this.player.components.Health;

    // Movement
    const moveSpeed = input.run && stamina && stamina.current > 0 ? 4.0 : 2.5;
    const moveDir = { x: 0, z: 0 };

    // Camera-relative movement
    const camDir = this.cameraController.getCameraDirection();
    const camRight = this.cameraController.getCameraRight();
    camDir.y = 0; camRight.y = 0;
    camDir.normalize(); camRight.normalize();

    if (input.moveForward) { moveDir.x += camDir.x; moveDir.z += camDir.z; }
    if (input.moveBackward) { moveDir.x -= camDir.x; moveDir.z -= camDir.z; }
    if (input.moveLeft) { moveDir.x -= camRight.x; moveDir.z -= camRight.z; }
    if (input.moveRight) { moveDir.x += camRight.x; moveDir.z += camRight.z; }

    const moveLen = Math.hypot(moveDir.x, moveDir.z);
    if (moveLen > 0) {
      moveDir.x /= moveLen;
      moveDir.z /= moveLen;
    }

    velocity.vx = moveDir.x * moveSpeed;
    velocity.vz = moveDir.z * moveSpeed;

    // Stamina drain
    if (input.run && moveLen > 0 && stamina) {
      stamina.current = Math.max(0, stamina.current - dt * 15);
    } else if (stamina) {
      stamina.current = Math.min(stamina.max, stamina.current + dt * stamina.regen);
    }

    // Apply velocity
    transform.x += velocity.vx * dt;
    transform.z += velocity.vz * dt;

    // Collision with grid
    this.resolvePlayerCollision();

    // Rotation
    if (moveLen > 0) {
      const targetRot = Math.atan2(moveDir.x, moveDir.z);
      transform.rot = this.lerpAngle(transform.rot, targetRot, 10 * dt);
    }

    // Torch
    if (input.torch) {
      const torch = this.player.components.Torch;
      if (torch) torch.on = !torch.on;
    }

    // Torch battery drain
    const torch = this.player.components.Torch;
    if (torch && torch.on) {
      torch.battery = Math.max(0, torch.battery - dt * (torch.flicker > 0 ? 2 : 1));
      if (torch.battery <= 0) torch.on = false;
    }

    // Radio static based on nearby enemies
    const radio = this.player.components.Radio;
    if (radio) {
      radio.staticLevel = this.radioSystem.getStaticLevel();
    }

    // Dodge
    if (input.dodge && control) {
      if (this.combatSystem.attemptDodge(this.player)) {
        this.playerRenderer.triggerDodge();
        this.sfxSystem.playPlayerSound('dodge');
      }
    }

    // Attack
    if (input.attack) {
      this.handlePlayerAttack();
    }

    // Interact
    if (input.interact) {
      this.handlePlayerInteract();
    }

    // Quick heal
    if (input.quickHeal) {
      this.useQuickHeal();
    }

    // Reload
    if (input.reload) {
      this.reloadWeapon();
    }

    // Camera reset
    if (input.cameraReset) {
      this.cameraController.resetCamera();
    }

    // Update combat cooldowns
    this.combatSystem.updateCooldowns(this.player, dt);
  }

  resolvePlayerCollision() {
    const transform = this.player.components.Transform;
    const radius = 0.4;
    const gx = Math.floor(transform.x / this.grid.cellSize);
    const gz = Math.floor(transform.z / this.grid.cellSize);

    // Check surrounding cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = gx + dx;
        const cz = gz + dz;
        if (this.grid.isOpaque(cx, cz)) {
          // Push out
          const cellCenterX = (cx + 0.5) * this.grid.cellSize;
          const cellCenterZ = (cz + 0.5) * this.grid.cellSize;
          const dx_ = transform.x - cellCenterX;
          const dz_ = transform.z - cellCenterZ;
          const dist = Math.hypot(dx_, dz_);
          const pushDist = radius + this.grid.cellSize / 2 - dist;
          if (pushDist > 0) {
            transform.x += (dx_ / dist) * pushDist;
            transform.z += (dz_ / dist) * pushDist;
          }
        }
      }
    }
  }

  lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    return a + diff * t;
  }

  handlePlayerAttack() {
    const weapon = this.player.components.MeleeWeapon;
    const ranged = this.player.components.RangedWeapon;
    const control = this.player.components.PlayerControl;

    if (control?.aim && ranged && ranged.ammo > 0) {
      // Ranged attack
      const target = this.findTargetInAim();
      if (target) {
        const result = this.combatSystem.attemptRangedAttack(this.player, target, this.grid);
        if (result.hit) {
          this.sfxSystem.playWeaponSound('pistol_shot', this.player.components.Transform);
          this.runStats.damageDealt += result.damage;
          this.runStats.kills += result.fatal ? 1 : 0;
          if (result.fatal) this.sfxSystem.playEnemySound('death', target.components.Transform, target.type);
          else this.sfxSystem.playEnemySound('hurt', target.components.Transform, target.type);
        }
      }
    } else if (weapon) {
      // Melee attack
      const target = this.findTargetInMelee();
      if (target) {
        const result = this.combatSystem.attemptMeleeAttack(this.player, target, this.grid, 1/60);
        if (result.hit) {
          this.sfxSystem.playWeaponSound('melee_swing', this.player.components.Transform);
          this.sfxSystem.playWeaponSound('melee_hit', target.components.Transform);
          this.runStats.damageDealt += result.damage;
          this.runStats.kills += result.fatal ? 1 : 0;
          if (result.fatal) {
            this.sfxSystem.playEnemySound('death', target.components.Transform, target.type);
            this.director?.onEnemyKilled(target.type);
          } else {
            this.sfxSystem.playEnemySound('hurt', target.components.Transform, target.type);
            this.director?.onPlayerDamage(result.damage);
          }
          this.playerRenderer.triggerInteract();
        } else {
          this.sfxSystem.playWeaponSound('melee_swing', this.player.components.Transform);
        }
      } else {
        this.sfxSystem.playWeaponSound('melee_swing', this.player.components.Transform);
      }
    }
  }

  findTargetInAim() {
    // Raycast from camera
    const camDir = this.cameraController.getCameraDirection();
    const camPos = this.cameraController.camera.position;

    let closest = null;
    let closestDist = Infinity;

    for (const entity of this.entities) {
      if (entity === this.player) continue;
      const ai = entity.components.AI;
      if (!ai || ai.state === AIState.DOWN) continue;

      const pos = entity.components.Transform;
      const toEntity = new THREE.Vector3(pos.x - camPos.x, pos.y - camPos.y, pos.z - camPos.z);
      const dist = toEntity.length();
      toEntity.normalize();

      const dot = camDir.dot(toEntity);
      if (dot > 0.95 && dist < 20) { // Within crosshair
        if (dist < closestDist) {
          closestDist = dist;
          closest = entity;
        }
      }
    }

    return closest;
  }

  findTargetInMelee() {
    const transform = this.player.components.Transform;
    const weapon = this.player.components.MeleeWeapon;

    let closest = null;
    let closestDist = Infinity;

    for (const entity of this.entities) {
      if (entity === this.player) continue;
      const ai = entity.components.AI;
      if (!ai || ai.state === AIState.DOWN) continue;

      const pos = entity.components.Transform;
      const dx = pos.x - transform.x;
      const dz = pos.z - transform.z;
      const dist = Math.hypot(dx, dz);

      if (dist < weapon.reach && dist < closestDist) {
        // Check angle
        const angle = Math.atan2(dx, dz);
        const diff = Math.abs(angle - transform.rot);
        if (diff < weapon.arc / 2 || diff > 2 * Math.PI - weapon.arc / 2) {
          closestDist = dist;
          closest = entity;
        }
      }
    }

    return closest;
  }

  handlePlayerInteract() {
    const transform = this.player.components.Transform;
    const gx = Math.floor(transform.x / this.grid.cellSize);
    const gz = Math.floor(transform.z / this.grid.cellSize);

    // Check for interactables in adjacent cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = gx + dx;
        const cz = gz + dz;
        const prop = this.grid.getProp(cx, cz);
        if (prop && this.isInteractable(prop.type)) {
          this.interactWithProp(prop, cx, cz);
          return;
        }

        // Check for door
        const cell = this.grid.getCell(cx, cz);
        if (cell === GridWorld.prototype.CellType.DOOR_CLOSED || cell === GridWorld.prototype.CellType.DOOR_LOCKED) {
          this.interactWithDoor(cx, cz);
          return;
        }

        // Check for pickup
        for (const entity of this.entities) {
          if (entity.components.Pickup) {
            const ep = entity.components.Transform;
            const egx = Math.floor(ep.x / this.grid.cellSize);
            const egz = Math.floor(ep.z / this.grid.cellSize);
            if (egx === cx && egz === cz) {
              this.pickupItem(entity);
              return;
            }
          }
        }

        // Check for note
        for (const entity of this.entities) {
          if (entity.components.Note) {
            const ep = entity.components.Transform;
            const egx = Math.floor(ep.x / this.grid.cellSize);
            const egz = Math.floor(ep.z / this.grid.cellSize);
            if (egx === cx && egz === cz) {
              this.readNote(entity);
              return;
            }
          }
        }

        // Check for exit
        for (const entity of this.entities) {
          if (entity.components.Exit) {
            const ep = entity.components.Transform;
            const egx = Math.floor(ep.x / this.grid.cellSize);
            const egz = Math.floor(ep.z / this.grid.cellSize);
            if (egx === cx && egz === cz) {
              this.useExit(entity);
              return;
            }
          }
        }
      }
    }
  }

  isInteractable(propType) {
    // Check prop registry
    return ['wardrobe', 'cabinet', 'crate', 'bin', 'vending', 'phone_booth', 'cart', 'wrong_door'].some(t => propType.includes(t));
  }

  interactWithProp(prop, x, z) {
    // Open container, search, etc.
    console.log('Interact with', prop.type, 'at', x, z);
    this.sfxSystem.playEnvironmentalSound('wood_creak', { x: x * this.grid.cellSize, y: 0, z: z * this.grid.cellSize });
  }

  interactWithDoor(x, z) {
    const door = this.grid.getDoor(x, z);
    if (!door) return;

    if (door.locked) {
      // Check for key
      const keyId = door.keyId;
      if (this.inventorySystem.hasItem(this.player.components.Inventory, keyId)) {
        this.grid.unlockDoor(x, z);
        this.grid.openDoor(x, z);
        this.sfxSystem.playDoorSound('open', { x: x * this.grid.cellSize, y: 0, z: z * this.grid.cellSize });
        this.inventorySystem.removeItem(this.player.components.Inventory, keyId);
      } else {
        this.sfxSystem.playDoorSound('locked', { x: x * this.grid.cellSize, y: 0, z: z * this.grid.cellSize });
        // Try puzzle
        this.tryPuzzleAtDoor(x, z);
      }
    } else {
      this.grid.openDoor(x, z);
      this.sfxSystem.playDoorSound('open', { x: x * this.grid.cellSize, y: 0, z: z * this.grid.cellSize });
    }
  }

  tryPuzzleAtDoor(x, z) {
    // Find puzzle for this door
    for (const lock of this.floorData.locks) {
      // Would need door position mapping
      if (lock.puzzle) {
        // Show puzzle UI
        console.log('Puzzle:', lock.puzzle.clueText);
      }
    }
  }

  pickupItem(entity) {
    const pickup = entity.components.Pickup;
    if (this.inventorySystem.addItem(this.player.components.Inventory, pickup.itemId, pickup.amount)) {
      this.entities = this.entities.filter(e => e !== entity);
      this.sfxSystem.playItemSound(pickup.itemId, this.player.components.Transform);
      this.runStats.currencyEarned += 1; // Small reward
    }
  }

  readNote(entity) {
    const note = entity.components.Note;
    console.log('Note:', note.text);
    this.runFlags[`note_${note.noteId}_read`] = true;
    this.meta.addNoteRead(note.noteId);
    this.sfxSystem.playUISound('menu_select');
  }

  useExit(entity) {
    // Next floor
    this.floor++;
    this.runFlags[`floor_${this.floor - 1}_completed`] = true;

    // Check for act transition
    if (this.floor > 2) {
      this.floor = 1;
      this.act++;
      if (this.act > 3) {
        // Game complete
        this.completeRun();
        return;
      }
      // Safe room between acts
      this.enterSafeRoom();
      return;
    }

    // Generate next floor
    this.generateFloor().then(() => {
      this.spawnPlayer();
      this.cameraController.setTarget(this.player);
      this.cameraController.setGrid(this.grid);
      this.cameraController.resetCamera();
    });
  }

  enterSafeRoom() {
    // Show safe room menu
    this.state = 'paused';
    this.menuSystem.show('hub'); // Would be a safe room specific menu
    this.ambienceSystem.setTheme('safe_room');
    this.musicSystem.setState(MusicState.SAFE);
  }

  completeRun() {
    // Determine ending
    const ending = this.determineEnding();
    this.runFlags.ending = ending.id;

    // Award currency
    const currencyEarned = this.runStats.currencyEarned + this.runStats.kills * 2;
    this.meta.addCurrency(currencyEarned);
    this.meta.recordRun({
      seed: this.seed,
      act: this.act,
      floor: this.floor,
      ending: ending.id,
      currencyEarned,
      time: this.runTime,
      kills: this.runStats.kills,
      deaths: this.runStats.deaths,
      flags: this.runFlags,
    });

    // Show death/end screen
    this.state = 'dead';
    this.menuSystem.show('death');
    this.menuSystem.setDeathSummary({
      act: this.act,
      floor: this.floor,
      time: this.runTime,
      kills: this.runStats.kills,
      currencyEarned,
    });
  }

  determineEnding() {
    // Check ending conditions
    if (this.runFlags[EndingFlags.TRUE_ENDING_UNLOCKED] &&
        this.runFlags[EndingFlags.ALL_NOTES_READ] &&
        this.runFlags[EndingFlags.NO_HEALING_USED] &&
        this.runFlags[EndingFlags.STALKER_EVADED]) {
      return Endings.true;
    }
    if (this.runFlags[EndingFlags.BOSS1_SPARED] &&
        this.runFlags[EndingFlags.BOSS2_SPARED] &&
        this.runFlags[EndingFlags.BOSS3_SPARED]) {
      return Endings.good;
    }
    if (!this.runFlags[EndingFlags.BOSS3_SPARED]) {
      return Endings.neutral;
    }
    return Endings.bad;
  }

  updateEntities(dt) {
    for (const entity of this.entities) {
      if (entity === this.player) continue;

      const ai = entity.components.AI;
      const transform = entity.components.Transform;
      const velocity = entity.components.Velocity;
      const health = entity.components.Health;

      if (!ai || health.current <= 0) continue;

      // Simple AI update
      this.updateAI(entity, dt);

      // Apply velocity
      transform.x += velocity.vx * dt;
      transform.z += velocity.vz * dt;

      // Collision
      this.resolveEntityCollision(entity);
    }

    // Remove dead entities
    this.entities = this.entities.filter(e => {
      const h = e.components.Health;
      return !h || h.current > 0 || (e.components.Corpse && !e.components.Corpse.stomped);
    });
  }

  updateAI(entity, dt) {
    const ai = entity.components.AI;
    const transform = entity.components.Transform;
    const velocity = entity.components.Velocity;
    const params = ai.params;

    // Update timers
    ai.timer -= dt;

    // Get player position
    const playerPos = this.player?.components.Transform;
    if (!playerPos) return;

    const dx = playerPos.x - transform.x;
    const dz = playerPos.z - transform.z;
    const dist = Math.hypot(dx, dz);

    // State machine
    switch (ai.state) {
      case AIState.DORMANT:
        if (dist < params.hearingRange) {
          ai.state = AIState.WANDER;
        }
        break;

      case AIState.WANDER:
        if (dist < params.sightRange && this.hasLOS(transform, playerPos)) {
          ai.state = AIState.CHASE;
          ai.target = this.player;
        } else if (dist < params.hearingRange) {
          ai.state = AIState.INVESTIGATE;
          ai.target = this.player;
        } else if (ai.timer <= 0) {
          // Random wander
          velocity.vx = (Math.random() - 0.5) * 2;
          velocity.vz = (Math.random() - 0.5) * 2;
          ai.timer = 2 + Math.random() * 3;
        }
        break;

      case AIState.INVESTIGATE:
        if (dist < params.sightRange && this.hasLOS(transform, playerPos)) {
          ai.state = AIState.CHASE;
        } else if (ai.timer <= 0) {
          ai.state = AIState.WANDER;
        }
        break;

      case AIState.CHASE:
        if (dist > params.sightRange * 1.5) {
          ai.state = AIState.INVESTIGATE;
          ai.timer = 5;
        } else if (dist < 2) {
          ai.state = AIState.ATTACK;
          ai.timer = params.attackCooldown;
        } else {
          // Move toward player
          const speed = (params.speedMult || 1) * 2;
          velocity.vx = (dx / dist) * speed;
          velocity.vz = (dz / dist) * speed;
        }
        break;

      case AIState.ATTACK:
        if (ai.timer <= 0) {
          // Attack
          const result = this.combatSystem.attemptMeleeAttack(entity, this.player, this.grid, dt);
          if (result.hit) {
            this.sfxSystem.playEnemySound('attack', transform, entity.type);
            this.sfxSystem.playPlayerSound('hurt');
            this.runStats.damageTaken += result.damage;
            this.director?.onPlayerDamage(result.damage);
          }
          ai.timer = params.attackCooldown;
          ai.state = AIState.CHASE;
        }
        break;

      case AIState.STAGGER:
        if (ai.timer <= 0) {
          ai.state = AIState.CHASE;
        }
        break;

      case AIState.DOWN:
        // Corpse logic
        break;

      case AIState.FLEE:
        // Flee from player
        break;
    }
  }

  hasLOS(from, to) {
    const gx1 = Math.floor(from.x / this.grid.cellSize);
    const gz1 = Math.floor(from.z / this.grid.cellSize);
    const gx2 = Math.floor(to.x / this.grid.cellSize);
    const gz2 = Math.floor(to.z / this.grid.cellSize);
    const los = this.grid.raycast(gx1, gz1, gx2, gz2);
    return !los.hit;
  }

  resolveEntityCollision(entity) {
    const transform = entity.components.Transform;
    const radius = 0.5;
    const gx = Math.floor(transform.x / this.grid.cellSize);
    const gz = Math.floor(transform.z / this.grid.cellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = gx + dx;
        const cz = gz + dz;
        if (this.grid.isOpaque(cx, cz)) {
          const cellCenterX = (cx + 0.5) * this.grid.cellSize;
          const cellCenterZ = (cz + 0.5) * this.grid.cellSize;
          const dx_ = transform.x - cellCenterX;
          const dz_ = transform.z - cellCenterZ;
          const dist = Math.hypot(dx_, dz_);
          const pushDist = radius + this.grid.cellSize / 2 - dist;
          if (pushDist > 0) {
            transform.x += (dx_ / dist) * pushDist;
            transform.z += (dz_ / dist) * pushDist;
          }
        }
      }
    }
  }

  countNearbyEnemies() {
    if (!this.player) return 0;
    const playerPos = this.player.components.Transform;
    let count = 0;
    for (const entity of this.entities) {
      if (entity === this.player) continue;
      const ai = entity.components.AI;
      if (!ai || ai.state === AIState.DOWN) continue;
      const pos = entity.components.Transform;
      const dist = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (dist < 15 && (ai.state === AIState.CHASE || ai.state === AIState.ATTACK || ai.state === AIState.INVESTIGATE)) {
        count++;
      }
    }
    return count;
  }

  useQuickHeal() {
    const inventory = this.player.components.Inventory;
    // Use first healing item
    for (let i = 0; i < inventory.maxSlots; i++) {
      const slot = inventory.slots[i];
      if (slot && (slot.itemId === 'health_drink' || slot.itemId === 'first_aid_kit')) {
        this.inventorySystem.useItem(this.player, slot.itemId, i);
        this.sfxSystem.playPlayerSound('heal');
        this.runStats.healingUsed++;
        this.runFlags[EndingFlags.NO_HEALING_USED] = false;
        break;
      }
    }
  }

  reloadWeapon() {
    const ranged = this.player.components.RangedWeapon;
    if (!ranged) return;

    const ammoType = ranged.ammoType || 'ammo_pistol';
    const needed = ranged.maxAmmo - ranged.ammo;
    if (this.inventorySystem.hasItem(this.player.components.Inventory, ammoType, needed)) {
      this.inventorySystem.removeItem(this.player.components.Inventory, ammoType, needed);
      ranged.ammo = ranged.maxAmmo;
      this.sfxSystem.playWeaponSound('reload_pistol', this.player.components.Transform);
    }
  }

  giveRelic(relicId) {
    const relic = Relics[relicId];
    if (!relic) return;

    this.player.relics = this.player.relics || [];
    this.player.relics.push(relic);
    this.meta.unlockRelic(relicId);

    // Apply effects
    // Would apply upsides/downsides
  }

  checkConditions() {
    // Player death
    const health = this.player?.components.Health;
    if (health && health.current <= 0) {
      this.playerDeath();
    }

    // Stalker check
    if (this.director && this.director.stalkerSpawned) {
      this.runFlags[EndingFlags.STALKER_EVADED] = false;
    }
  }

  playerDeath() {
    this.runStats.deaths++;
    this.state = 'dead';
    this.menuSystem.show('death');
    this.menuSystem.setDeathSummary({
      act: this.act,
      floor: this.floor,
      time: this.runTime,
      kills: this.runStats.kills,
      currencyEarned: this.runStats.currencyEarned,
    });
    this.ambienceSystem.stop();
    this.musicSystem.setState(MusicState.EXPLORE);
  }

  render(alpha) {
    this.renderer.render(this.sceneManager.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  onError(error) {
    console.error('Game error:', error);
    // Show error panel
    this.showErrorPanel(error);
  }

  showErrorPanel(error) {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 1000;
      background: rgba(20, 0, 0, 0.95); color: #ff6666;
      padding: 20px; border: 2px solid #ff3333; border-radius: 4px;
      max-width: 500px; max-height: 300px; overflow: auto;
      font: 12px monospace;
    `;
    panel.innerHTML = `
      <h3>Error</h3>
      <pre>${error.message || error}</pre>
      <pre>${error.stack || ''}</pre>
      <button onclick="this.parentElement.remove()">Dismiss</button>
    `;
    document.body.appendChild(panel);
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.menuSystem.show('pause');
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.menuSystem.hide('pause');
      this.lastTime = performance.now();
    }
  }

  save() {
    this.saveSystem.saveRun(this.getRunState());
  }

  loadSave() {
    const data = this.saveSystem.loadRun();
    if (data) {
      this.restoreRun(data);
    }
  }

  getRunState() {
    return {
      meta: this.meta,
      seed: this.seed,
      act: this.act,
      floor: this.floor,
      rng: this.rng,
      player: this.player,
      floorData: this.floorData,
      director: this.director,
      puzzles: this.puzzleSystem,
      flags: this.runFlags,
      time: this.runTime,
      stats: this.runStats,
      theme: this.theme,
    };
  }

  async restoreRun(data) {
    const reconstructed = await this.saveSystem.reconstructRun(data, {
      generateFloor: this.generateFloor.bind(this),
    });

    this.rng = reconstructed.rng;
    this.seed = reconstructed.seed;
    this.act = reconstructed.act;
    this.floor = reconstructed.floor;
    this.floorData = reconstructed.floorData;
    this.player = reconstructed.player;
    this.director = reconstructed.director;
    this.puzzleSystem = reconstructed.puzzles;
    this.runFlags = reconstructed.flags;
    this.runTime = reconstructed.time;
    this.runStats = reconstructed.stats;
    this.theme = reconstructed.theme;

    this.grid = this.floorData.grid;
    this.buildSceneFromFloor();
    this.spawnFloorEntities();
    this.cameraController.setTarget(this.player);
    this.cameraController.setGrid(this.grid);
    this.cameraController.resetCamera();

    this.state = 'playing';
  }

  returnToTitle() {
    this.state = 'title';
    this.entities = [];
    this.floorData = null;
    this.player = null;
    this.grid = null;
    this.director = null;
    this.puzzleSystem = null;
    this.showTitleScreen();
  }

  dispose() {
    this.renderer.dispose();
    this.sceneManager.dispose();
    this.playerRenderer.dispose();
    this.audioEngine.dispose();
    this.menuSystem.dispose();
    this.hintSystem.dispose();
  }
}