// src/gen/nightmare.js — Nightmare corruption pass
// Exports: corruptFloor, NightmareMaterial, applyNightmareToEntity
// Dependencies: rng.js, grid.js, floor.js

import { SeededRNG } from '../sim/rng.js';
import { GridWorld, CellType } from '../sim/grid.js';

export const NightmareMaterial = {
  WALL: { base: 'nightmare_wall', variants: ['corroded', 'fleshy', 'veined', 'rusted'] },
  FLOOR: { base: 'nightmare_floor', variants: ['grating', 'blood', 'organic', 'ash'] },
  CEILING: { base: 'nightmare_ceiling', variants: ['dripping', 'veined', 'cracked'] },
  PROP: { base: 'nightmare_prop', variants: ['twisted', 'bleeding', 'fused'] },
  DECAL: { base: 'nightmare_decal', variants: ['blood_pool', 'viscera', 'scrawl', 'symbol'] },
};

export const NightmareAudioProfile = {
  ambience: 'nightmare_drone',
  musicLayer: 'tension',
  radioStatic: 0.8,
  eventFrequency: 2.0,
  mechanicalWail: true,
};

export function corruptFloor(floor, rng, intensity = 1.0) {
  const nightmareRng = rng.fork();
  const corrupted = JSON.parse(JSON.stringify(floor)); // Deep clone
  corrupted.nightmare = true;
  corrupted.corruptionIntensity = intensity;

  // 1. Swap materials
  corruptMaterials(corrupted, nightmareRng, intensity);

  // 2. Warp geometry (vertex displacement data)
  corrupted.vertexWarp = generateVertexWarp(corrupted.grid, nightmareRng, intensity);

  // 3. Add nightmare-specific props/decals
  addNightmareDetails(corrupted, nightmareRng, intensity);

  // 4. Swap enemy table
  corrupted.spawns = swapEnemyTable(corrupted.spawns, nightmareRng, intensity);

  // 5. Add wrong doors / impossible geometry
  addWrongGeometry(corrupted, nightmareRng, intensity);

  // 6. Audio profile
  corrupted.audioProfile = NightmareAudioProfile;

  // 7. Fog colour/density shift
  corrupted.fogOverride = {
    color: intensity > 0.7 ? 0x4a0000 : 0x2a1a1a,
    density: 0.025 + intensity * 0.015,
    groundFog: true,
  };

  // 8. Lighting shift
  corrupted.lightOverride = {
    torchColor: 0xff2200,
    ambientColor: 0x1a0505,
    pointLightColor: 0x4a0000,
  };

  return corrupted;
}

function corruptMaterials(floor, rng, intensity) {
  // Mark all walls/floors for material swap
  for (let y = 0; y < floor.grid.height; y++) {
    for (let x = 0; x < floor.grid.width; x++) {
      const cell = floor.grid.getCell(x, y);
      if (cell === CellType.WALL) {
        floor.grid.cells[floor.grid.idx(x, y)] = CellType.WALL | 0x80; // High bit = nightmare
      } else if (cell === CellType.FLOOR) {
        floor.grid.cells[floor.grid.idx(x, y)] = CellType.FLOOR | 0x80;
      }
    }
  }

  // Props get nightmare variants
  for (const prop of floor.props) {
    prop.nightmare = true;
    prop.variant = rng.choice(NightmareMaterial.PROP.variants);
  }

  // Decals get nightmare variants
  for (const decal of floor.decals) {
    decal.nightmare = true;
    decal.type = rng.choice(NightmareMaterial.DECAL.variants);
  }
}

function generateVertexWarp(grid, rng, intensity) {
  // Generate per-vertex displacement for warp effect
  // Returns a texture-like data structure for GPU
  const warpData = {
    resolution: 64,
    data: new Float32Array(64 * 64 * 3), // x, y, z displacement
    scale: 0.5 + intensity * 1.0,
    frequency: 0.1 + intensity * 0.05,
    timeSpeed: 0.2 + intensity * 0.1,
  };

  // Fill with seeded noise
  for (let i = 0; i < warpData.data.length; i++) {
    warpData.data[i] = (rng.next() - 0.5) * 2 * warpData.scale;
  }

  return warpData;
}

function addNightmareDetails(floor, rng, intensity) {
  const detailCount = Math.floor(20 * intensity);

  for (let i = 0; i < detailCount; i++) {
    // Find random floor position
    const walkable = floor.grid.getWalkableCells();
    if (walkable.length === 0) break;

    const pos = rng.choice(walkable);

    // Add nightmare prop
    if (rng.next() < 0.5) {
      floor.props.push({
        x: pos.x,
        y: pos.y,
        type: rng.choice(['flesh_growth', 'rusted_machinery', 'hanging_chains', 'pulsing_organ']),
        nightmare: true,
        variant: rng.choice(NightmareMaterial.PROP.variants),
      });
    }

    // Add nightmare decal
    if (rng.next() < 0.7) {
      floor.decals.push({
        x: pos.x + (rng.next() - 0.5) * 2,
        y: pos.y + (rng.next() - 0.5) * 2,
        type: rng.choice(NightmareMaterial.DECAL.variants),
        nightmare: true,
        scale: 0.5 + rng.next() * 1.5,
        rotation: rng.next() * Math.PI * 2,
      });
    }
  }

  // Add grating floors in corridors
  for (const room of floor.rooms) {
    if (room.type === 'hallway' || room.type === 'corridor') {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (floor.grid.getCell(x, y) === CellType.FLOOR && rng.next() < 0.3 * intensity) {
            floor.grid.cells[floor.grid.idx(x, y)] = CellType.FLOOR | 0x80; // Grating variant
          }
        }
      }
    }
  }
}

function swapEnemyTable(spawns, rng, intensity) {
  const nightmareEnemyMap = {
    shambler: 'nightmare_shambler',
    crawler: 'nightmare_crawler',
    watchman: 'nightmare_watchman',
    siren: 'nightmare_siren',
    mimic: 'nightmare_mimic',
    amalgam: 'nightmare_amalgam',
  };

  return spawns.map(spawn => {
    if (spawn.type && nightmareEnemyMap[spawn.type] && rng.next() < intensity) {
      return {
        ...spawn,
        type: nightmareEnemyMap[spawn.type],
        archetype: spawn.archetype.replace(/^(.+)$/, 'NIGHTMARE_$1'),
        nightmare: true,
        healthMult: (spawn.healthMult || 1) * (1.2 + intensity * 0.5),
        damageMult: (spawn.damageMult || 1) * (1.1 + intensity * 0.3),
        speedMult: (spawn.speedMult || 1) * (0.9 + intensity * 0.2),
      };
    }
    return spawn;
  });
}

function addWrongGeometry(floor, rng, intensity) {
  const wrongDoorCount = Math.floor(3 * intensity);

  for (let i = 0; i < wrongDoorCount; i++) {
    const walkable = floor.grid.getWalkableCells();
    if (walkable.length === 0) break;

    const pos = rng.choice(walkable);

    // Place a door that leads nowhere / loops back
    floor.grid.setCell(pos.x, pos.y, CellType.DOOR_LOCKED);
    floor.props.push({
      x: pos.x,
      y: pos.y,
      type: 'wrong_door',
      nightmare: true,
      leadsTo: rng.choice(['self', 'start', 'random', 'void']),
    });
  }

  // Impossible room connections (rooms that overlap in nightmare layer)
  if (intensity > 0.5 && floor.rooms.length > 2) {
    const roomA = rng.choice(floor.rooms);
    const roomB = rng.choice(floor.rooms.filter(r => r !== roomA));

    floor.impossibleConnections = floor.impossibleConnections || [];
    floor.impossibleConnections.push({
      roomA: roomA.id,
      roomB: roomB.id,
      type: rng.choice(['overlap', 'fold', 'mirror']),
    });
  }
}

export function applyNightmareToEntity(entity, rng, intensity) {
  if (entity.nightmare) return entity;

  const corrupted = { ...entity };
  corrupted.nightmare = true;

  // Visual corruption
  corrupted.meshMod = {
    vertexDisplace: true,
    displaceScale: 0.1 + intensity * 0.3,
    displaceSpeed: 0.5 + intensity,
    colorTint: [0.8 + intensity * 0.2, 0.1, 0.1],
    emissiveIntensity: intensity * 0.5,
  };

  // Audio corruption
  corrupted.audioMod = {
    pitchShift: -0.2 - intensity * 0.3,
    distortion: intensity * 0.5,
    reverbSend: 0.5 + intensity * 0.5,
  };

  // Behavioral changes
  if (corrupted.components.AI) {
    const ai = corrupted.components.AI;
    ai.params = {
      ...ai.params,
      aggressionMult: 1.5 + intensity,
      fearless: true,
      stalkerAttracted: true,
    };
  }

  return corrupted;
}

export function generateTransitionSequence(floor, direction = 'enter') {
  // Returns a sequence of corruption steps for smooth transition
  const steps = 10;
  const sequence = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const eased = direction === 'enter' ? easeInOutCubic(t) : 1 - easeInOutCubic(t);

    sequence.push({
      progress: t,
      fogDensity: 0.012 + eased * 0.018,
      fogColor: lerpColor(0x1a1a2e, 0x4a0000, eased),
      torchColor: lerpColor(0xffeedd, 0xff2200, eased),
      ambientColor: lerpColor(0x222233, 0x1a0505, eased),
      vertexWarpScale: eased * 0.5,
      audioLowpass: eased * 8000,
      mechanicalWailVolume: eased * 0.8,
      radioStatic: eased * 0.8,
    });
  }

  return sequence;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;

  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b_ = Math.round(ab + (bb - ab) * t);

  return (r << 16) | (g << 8) | b_;
}

export function isNightmareFloor(floor) {
  return floor.nightmare === true;
}

export function getNightmareIntensity(floor) {
  return floor.corruptionIntensity || 0;
}