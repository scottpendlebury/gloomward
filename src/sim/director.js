// src/sim/director.js — Spawn budgeting, pacing, elite modifiers
// Exports: Director, SpawnBudget, EliteModifiers
// Dependencies: rng.js, entities.js

import { SeededRNG } from './rng.js';
import { Archetypes, AIState } from './entities.js';

export const EnemyTier = {
  TRASH: 'TRASH',      // Shambler, Crawler
  STANDARD: 'STANDARD', // Watchman, Siren
  ELITE: 'ELITE',      // Mimic, Amalgam
  BOSS: 'BOSS',
  STALKER: 'STALKER',
};

export const EnemyDefinitions = {
  shambler: { archetype: 'SHAMBLER', tier: EnemyTier.TRASH, cost: 1, weight: 10 },
  crawler: { archetype: 'CRAWLER', tier: EnemyTier.TRASH, cost: 1, weight: 8 },
  watchman: { archetype: 'WATCHMAN', tier: EnemyTier.STANDARD, cost: 2, weight: 6 },
  siren: { archetype: 'SIREN', tier: EnemyTier.STANDARD, cost: 3, weight: 4 },
  mimic: { archetype: 'MIMIC', tier: EnemyTier.ELITE, cost: 4, weight: 2 },
  amalgam: { archetype: 'AMALGAM', tier: EnemyTier.ELITE, cost: 5, weight: 2 },
  stalker: { archetype: 'STALKER', tier: EnemyTier.STALKER, cost: 999, weight: 0 },
};

export const ThemeEnemyTables = {
  streets: {
    common: ['shambler', 'crawler'],
    uncommon: ['watchman'],
    rare: ['siren'],
  },
  apartments: {
    common: ['shambler', 'crawler'],
    uncommon: ['watchman', 'mimic'],
    rare: ['amalgam'],
  },
  clinic: {
    common: ['crawler', 'siren'],
    uncommon: ['watchman', 'amalgam'],
    rare: ['mimic'],
  },
  offices: {
    common: ['shambler', 'watchman'],
    uncommon: ['siren', 'mimic'],
    rare: ['amalgam'],
  },
  industrial: {
    common: ['shambler', 'amalgam'],
    uncommon: ['watchman', 'siren'],
    rare: ['crawler', 'mimic'],
  },
};

export class SpawnBudget {
  constructor(baseBudget, theme, floorIndex, act) {
    this.baseBudget = baseBudget;
    this.theme = theme;
    this.floorIndex = floorIndex;
    this.act = act;
    this.spent = 0;
    this.spawned = [];
    this.eliteChance = 0.05 + floorIndex * 0.02 + act * 0.03;
  }

  getRemaining() {
    return Math.max(0, this.baseBudget - this.spent);
  }

  canAfford(cost) {
    return this.spent + cost <= this.baseBudget;
  }

  spend(cost, enemyType, position) {
    this.spent += cost;
    this.spawned.push({ enemyType, position, cost });
  }

  getSpawnedCount() {
    return this.spawned.length;
  }
}

export const EliteModifiers = {
  BLOATED: { name: 'Bloated', hpMult: 1.5, dmgMult: 0.8, speedMult: 0.7, xpMult: 1.3 },
  FRENZIED: { name: 'Frenzied', hpMult: 0.8, dmgMult: 1.5, speedMult: 1.3, xpMult: 1.4 },
  ARMOURED: { name: 'Armoured', hpMult: 1.3, dmgMult: 1.0, speedMult: 0.9, resistMult: 0.5, xpMult: 1.3 },
  VENOMOUS: { name: 'Venomous', hpMult: 1.0, dmgMult: 1.2, speedMult: 1.0, dotDmg: 5, xpMult: 1.2 },
  SPECTRAL: { name: 'Spectral', hpMult: 0.7, dmgMult: 1.0, speedMult: 1.2, phaseThrough: true, xpMult: 1.5 },
};

export class Director {
  constructor(rng, floorData, theme, floorIndex, act) {
    this.rng = rng;
    this.floorData = floorData;
    this.theme = theme;
    this.floorIndex = floorIndex;
    this.act = act;
    this.budget = new SpawnBudget(
      this.calculateBaseBudget(),
      theme,
      floorIndex,
      act
    );
    this.quietUntil = 0;
    this.tension = 0; // 0-1
    this.stalkerSpawned = false;
    this.stalkerTimer = 0;
    this.lastPlayerDamage = 0;
    this.playerStallTime = 0;
  }

  calculateBaseBudget() {
    const base = 12 + this.floorIndex * 3 + this.act * 4;
    const themeMod = {
      streets: 0.8,
      apartments: 1.0,
      clinic: 1.2,
      offices: 1.1,
      industrial: 1.3,
    }[this.theme] || 1.0;
    return Math.floor(base * themeMod);
  }

  requestSpawn(enemyType, position) {
    const def = EnemyDefinitions[enemyType];
    if (!def) return null;

    // Check if stalker
    if (def.tier === EnemyTier.STALKER) {
      if (this.stalkerSpawned) return null;
      this.stalkerSpawned = true;
      return this.createEnemy(enemyType, position, null);
    }

    // Check budget
    if (!this.budget.canAfford(def.cost)) return null;

    // Apply elite modifier
    let modifier = null;
    if (this.rng.next() < this.eliteChance && def.tier !== EnemyTier.TRASH) {
      modifier = this.rng.choice(Object.keys(EliteModifiers));
    }

    this.budget.spend(def.cost, enemyType, position);
    return this.createEnemy(enemyType, position, modifier);
  }

  createEnemy(enemyType, position, modifier) {
    const def = EnemyDefinitions[enemyType];
    const entity = {
      type: enemyType,
      archetype: def.archetype,
      position: { ...position },
      modifier: modifier ? { ...EliteModifiers[modifier], id: modifier } : null,
    };

    // Apply modifier stats
    if (modifier) {
      const mod = EliteModifiers[modifier];
      entity.healthMult = mod.hpMult;
      entity.damageMult = mod.dmgMult;
      entity.speedMult = mod.speedMult;
    }

    return entity;
  }

  // Called each frame
  update(dt, entities, player, grid) {
    // Stalker timer
    if (!this.stalkerSpawned) {
      this.stalkerTimer += dt;
      // Spawn stalker after 3-5 minutes or if player stalls
      const stalkerThreshold = 180 + this.floorIndex * 30; // 3-5 min
      if (this.stalkerTimer > stalkerThreshold || this.playerStallTime > 120) {
        this.spawnStalker(grid, player);
      }
    }

    // Tension decay
    this.tension = Math.max(0, this.tension - dt * 0.05);

    // Quiet period after heavy damage
    if (this.quietUntil > 0) {
      this.quietUntil -= dt;
      if (this.quietUntil <= 0) {
        this.tension = 0.2;
      }
    }

    // Track player stall (not moving much)
    if (player) {
      const vel = player.components.Velocity;
      if (vel && Math.hypot(vel.vx, vel.vz) < 0.5) {
        this.playerStallTime += dt;
      } else {
        this.playerStallTime = 0;
      }
    }

    // Escalation if player stalls too long
    if (this.playerStallTime > 60 && this.rng.next() < 0.001) {
      this.tension = Math.min(1, this.tension + 0.2);
    }
  }

  spawnStalker(grid, player) {
    // Find position far from player but accessible
    const walkable = grid.getWalkableCells();
    const farCells = walkable.filter(c => {
      const dx = c.x - player.components.Transform.x;
      const dy = c.y - player.components.Transform.y;
      return Math.hypot(dx, dy) > 20;
    });
    if (farCells.length > 0) {
      const pos = this.rng.choice(farCells);
      return this.requestSpawn('stalker', pos);
    }
    return null;
  }

  onPlayerDamage(amount) {
    this.lastPlayerDamage = amount;
    this.quietUntil = 15 + amount * 0.5; // Seconds of reduced spawns
    this.tension = 0.1;
  }

  onEnemyKilled(enemyType) {
    this.tension = Math.min(1, this.tension + 0.05);
  }

  onPlayerNoise(noiseLevel, position) {
    this.tension = Math.min(1, this.tension + noiseLevel * 0.01);
  }

  // Get spawn candidates for a room
  getSpawnCandidates(room, grid) {
    const table = ThemeEnemyTables[this.theme] || ThemeEnemyTables.apartments;
    const candidates = [];

    // Common enemies
    for (const type of table.common) {
      if (this.budget.canAfford(EnemyDefinitions[type].cost)) {
        candidates.push({ type, weight: 10 });
      }
    }
    // Uncommon
    for (const type of table.uncommon) {
      if (this.budget.canAfford(EnemyDefinitions[type].cost)) {
        candidates.push({ type, weight: 4 });
      }
    }
    // Rare
    for (const type of table.rare) {
      if (this.budget.canAfford(EnemyDefinitions[type].cost)) {
        candidates.push({ type, weight: 1 });
      }
    }

    return candidates;
  }

  // Populate a floor with enemies
  populateFloor(grid, rooms, playerStart) {
    const spawns = [];

    for (const room of rooms) {
      if (room === rooms[0]) continue; // Skip start room

      const candidates = this.getSpawnCandidates(room, grid);
      if (candidates.length === 0) continue;

      // 0-3 enemies per room based on size and budget
      const maxEnemies = Math.min(3, Math.floor(room.area / 20));
      const count = this.rng.nextInt(maxEnemies + 1);

      for (let i = 0; i < count; i++) {
        const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
        let roll = this.rng.nextFloat(0, totalWeight);
        let chosen = null;
        for (const c of candidates) {
          roll -= c.weight;
          if (roll <= 0) { chosen = c.type; break; }
        }

        if (!chosen) continue;

        // Find valid spawn position in room
        const pos = this.findSpawnPosInRoom(grid, room);
        if (pos) {
          const enemy = this.requestSpawn(chosen, pos);
          if (enemy) spawns.push(enemy);
        }
      }
    }

    return spawns;
  }

  findSpawnPosInRoom(grid, room) {
    const attempts = 20;
    for (let i = 0; i < attempts; i++) {
      const x = this.rng.nextInt(room.x, room.x + room.w);
      const y = this.rng.nextInt(room.y, room.y + room.h);
      if (grid.isWalkable(x, y) && !grid.hasProp(x, y)) {
        return { x, y };
      }
    }
    return null;
  }

  // For save/load
  serialize() {
    return {
      budget: {
        baseBudget: this.budget.baseBudget,
        spent: this.budget.spent,
        spawned: this.budget.spawned,
      },
      quietUntil: this.quietUntil,
      tension: this.tension,
      stalkerSpawned: this.stalkerSpawned,
      stalkerTimer: this.stalkerTimer,
      playerStallTime: this.playerStallTime,
    };
  }

  static deserialize(data, rng, floorData, theme, floorIndex, act) {
    const director = new Director(rng, floorData, theme, floorIndex, act);
    director.budget.baseBudget = data.budget.baseBudget;
    director.budget.spent = data.budget.spent;
    director.budget.spawned = data.budget.spawned;
    director.quietUntil = data.quietUntil;
    director.tension = data.tension;
    director.stalkerSpawned = data.stalkerSpawned;
    director.stalkerTimer = data.stalkerTimer;
    director.playerStallTime = data.playerStallTime;
    return director;
  }
}