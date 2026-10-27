// src/sim/entities.js — Entity definitions, components, archetypes
// Exports: Components, Archetypes, createEntity, Entity
// Dependencies: none

export const Components = {
  Transform: { x: 0, y: 0, z: 0, rot: 0 },
  Velocity: { vx: 0, vz: 0 },
  Health: { current: 100, max: 100, iframe: 0 },
  Stamina: { current: 100, max: 100, regen: 15 },
  Torch: { battery: 100, max: 100, flicker: 0, on: true },
  Radio: { staticLevel: 0, station: 0, tuning: 0 },
  Inventory: { slots: [], maxSlots: 8, selected: 0 },
  AI: { state: 'DORMANT', target: null, timer: 0, params: {} },
  PlayerControl: { aim: false, move: { x: 0, z: 0 }, dodgeCooldown: 0 },
  MeleeWeapon: { damage: 25, reach: 2.0, arc: Math.PI / 3, staminaCost: 15, cooldown: 0.8 },
  RangedWeapon: { damage: 35, range: 15, ammo: 0, maxAmmo: 12, reloadTime: 2.0, spread: 0.05, noise: 50 },
  Corpse: { stomped: false, vanishTimer: 0 },
  Pickup: { itemId: '', amount: 1 },
  Door: { locked: false, keyId: null, open: false },
  KeyItem: { keyId: '', name: '' },
  Note: { noteId: '', text: '' },
  Exit: { nextFloor: 0 },
  LightSource: { radius: 5, color: 0xffeedd, intensity: 1, flicker: 0 },
  NoiseEmitter: { radius: 10, intensity: 1 },
};

export const AIState = {
  DORMANT: 'DORMANT',
  WANDER: 'WANDER',
  INVESTIGATE: 'INVESTIGATE',
  CHASE: 'CHASE',
  ATTACK: 'ATTACK',
  STAGGER: 'STAGGER',
  DOWN: 'DOWN',
  FLEE: 'FLEE',
};

export function createEntity(archetype, overrides = {}) {
  const entity = { id: crypto.randomUUID(), components: {} };

  // Base components all entities get
  entity.components.Transform = { ...Components.Transform };
  entity.components.Velocity = { ...Components.Velocity };

  // Archetype-specific components
  const arch = Archetypes[archetype];
  if (arch) {
    for (const [compName, compData] of Object.entries(arch.components)) {
      entity.components[compName] = { ...compData };
    }
  }

  // Apply overrides
  for (const [compName, compData] of Object.entries(overrides)) {
    if (entity.components[compName]) {
      Object.assign(entity.components[compName], compData);
    } else {
      entity.components[compName] = { ...compData };
    }
  }

  return entity;
}

export const Archetypes = {
  PLAYER: {
    components: {
      Health: { current: 100, max: 100, iframe: 0 },
      Stamina: { current: 100, max: 100, regen: 15 },
      Torch: { battery: 100, max: 100, flicker: 0, on: true },
      Radio: { staticLevel: 0, station: 0, tuning: 0 },
      Inventory: { slots: [], maxSlots: 8, selected: 0 },
      PlayerControl: { aim: false, move: { x: 0, z: 0 }, dodgeCooldown: 0 },
      MeleeWeapon: { damage: 25, reach: 2.0, arc: Math.PI / 3, staminaCost: 15, cooldown: 0.8 },
    },
  },

  SHAMBLER: {
    components: {
      Health: { current: 80, max: 80, iframe: 0 },
      AI: {
        state: AIState.DORMANT,
        target: null,
        timer: 0,
        params: {
          sightRange: 8,
          hearingRange: 12,
          wanderRadius: 5,
          attackDamage: 15,
          attackCooldown: 2.0,
          staggerThreshold: 30,
          knockbackResist: 0.5,
        },
      },
      MeleeWeapon: { damage: 15, reach: 1.8, arc: Math.PI / 4, staminaCost: 0, cooldown: 2.0 },
      Corpse: { stomped: false, vanishTimer: 0 },
      NoiseEmitter: { radius: 8, intensity: 0.5 },
    },
  },

  CRAWLER: {
    components: {
      Health: { current: 40, max: 40, iframe: 0 },
      AI: {
        state: AIState.DORMANT,
        target: null,
        timer: 0,
        params: {
          sightRange: 6,
          hearingRange: 10,
          wanderRadius: 3,
          attackDamage: 10,
          attackCooldown: 1.2,
          staggerThreshold: 15,
          knockbackResist: 0.2,
          ambush: true,
        },
      },
      MeleeWeapon: { damage: 10, reach: 1.2, arc: Math.PI / 2, staminaCost: 0, cooldown: 1.2 },
      Corpse: { stomped: false, vanishTimer: 0 },
      NoiseEmitter: { radius: 5, intensity: 0.3 },
    },
  },

  WATCHMAN: {
    components: {
      Health: { current: 60, max: 60, iframe: 0 },
      AI: {
        state: AIState.DORMANT,
        target: null,
        timer: 0,
        params: {
          sightRange: 10,
          hearingRange: 8,
          wanderRadius: 4,
          attackDamage: 20,
          attackCooldown: 2.5,
          staggerThreshold: 25,
          knockbackResist: 0.7,
          lightAversion: true,
        },
      },
      MeleeWeapon: { damage: 20, reach: 2.2, arc: Math.PI / 3, staminaCost: 0, cooldown: 2.5 },
      Corpse: { stomped: false, vanishTimer: 0 },
      NoiseEmitter: { radius: 6, intensity: 0.4 },
    },
  },

  SIREN: {
    components: {
      Health: { current: 50, max: 50, iframe: 0 },
      AI: {
        state: AIState.DORMANT,
        target: null,
        timer: 0,
        params: {
          sightRange: 12,
          hearingRange: 15,
          wanderRadius: 6,
          attackDamage: 12,
          attackCooldown: 3.0,
          staggerThreshold: 20,
          knockbackResist: 0.3,
          ranged: true,
          projectileSpeed: 10,
          screamRadius: 20,
        },
      },
      RangedWeapon: { damage: 12, range: 15, ammo: 999, maxAmmo: 999, reloadTime: 3.0, spread: 0.1, noise: 40 },
      Corpse: { stomped: false, vanishTimer: 0 },
      NoiseEmitter: { radius: 10, intensity: 0.8 },
    },
  },

  MIMIC: {
    components: {
      Health: { current: 70, max: 70, iframe: 0 },
      AI: {
        state: AIState.DORMANT,
        target: null,
        timer: 0,
        params: {
          sightRange: 5,
          hearingRange: 5,
          wanderRadius: 0,
          attackDamage: 30,
          attackCooldown: 1.5,
          staggerThreshold: 25,
          knockbackResist: 0.8,
          disguiseProp: true,
        },
      },
      MeleeWeapon: { damage: 30, reach: 1.5, arc: Math.PI / 2, staminaCost: 0, cooldown: 1.5 },
      Corpse: { stomped: false, vanishTimer: 0 },
      NoiseEmitter: { radius: 3, intensity: 0.2 },
      Pickup: { itemId: '', amount: 1 }, // Drops what it mimicked
    },
  },

  AMALGAM: {
    components: {
      Health: { current: 120, max: 120, iframe: 0 },
      AI: {
        state: AIState.DORMANT,
        target: null,
        timer: 0,
        params: {
          sightRange: 7,
          hearingRange: 10,
          wanderRadius: 4,
          attackDamage: 25,
          attackCooldown: 1.8,
          staggerThreshold: 40,
          knockbackResist: 0.6,
          splitOnDeath: true,
        },
      },
      MeleeWeapon: { damage: 25, reach: 2.5, arc: Math.PI / 3, staminaCost: 0, cooldown: 1.8 },
      Corpse: { stomped: false, vanishTimer: 0 },
      NoiseEmitter: { radius: 8, intensity: 0.6 },
    },
  },

  STALKER: {
    components: {
      Health: { current: 9999, max: 9999, iframe: 0 },
      AI: {
        state: AIState.DORMANT,
        target: null,
        timer: 0,
        params: {
          sightRange: 15,
          hearingRange: 20,
          wanderRadius: 0,
          attackDamage: 50,
          attackCooldown: 1.0,
          staggerThreshold: 9999,
          knockbackResist: 1.0,
          unkillable: true,
          persistent: true,
          doorBreak: true,
        },
      },
      MeleeWeapon: { damage: 50, reach: 3.0, arc: Math.PI / 2, staminaCost: 0, cooldown: 1.0 },
      Corpse: { stomped: false, vanishTimer: 0 },
      NoiseEmitter: { radius: 15, intensity: 1.0 },
    },
  },

  HEALTH_DRINK: {
    components: {
      Pickup: { itemId: 'health_drink', amount: 1 },
    },
  },

  FIRST_AID_KIT: {
    components: {
      Pickup: { itemId: 'first_aid_kit', amount: 1 },
    },
  },

  BATTERY: {
    components: {
      Pickup: { itemId: 'battery', amount: 1 },
    },
  },

  AMMO_PISTOL: {
    components: {
      Pickup: { itemId: 'ammo_pistol', amount: 6 },
    },
  },

  AMMO_SHOTGUN: {
    components: {
      Pickup: { itemId: 'ammo_shotgun', amount: 2 },
    },
  },

  KEY_ITEM: {
    components: {
      KeyItem: { keyId: '', name: '' },
    },
  },

  NOTE: {
    components: {
      Note: { noteId: '', text: '' },
    },
  },

  FLOOR_EXIT: {
    components: {
      Exit: { nextFloor: 0 },
    },
  },

  LIGHT_FIXTURE: {
    components: {
      LightSource: { radius: 6, color: 0xffeedd, intensity: 0.8, flicker: 0.1 },
    },
  },
};