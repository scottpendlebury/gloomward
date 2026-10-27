// src/sim/meta.js — Meta-progression, currency, unlocks, endings
// Exports: MetaProgression, StartingKits, Relics, Endings
// Dependencies: rng.js

import { SeededRNG } from './rng.js';

export const MetaCurrency = 'SOUL_ECHOES'; // Evocative name

export const StartingKits = {
  survivor: {
    id: 'survivor',
    name: 'Survivor',
    description: 'Balanced start. A little of everything.',
    unlockCost: 0,
    startingItems: [
      { itemId: 'health_drink', amount: 2 },
      { itemId: 'battery', amount: 1 },
      { itemId: 'ammo_pistol', amount: 6 },
    ],
    stats: { health: 100, stamina: 100, torchMax: 100 },
    relic: null,
  },
  scavenger: {
    id: 'scavenger',
    name: 'Scavenger',
    description: 'More inventory, less health. Finds extra loot.',
    unlockCost: 50,
    startingItems: [
      { itemId: 'health_drink', amount: 1 },
      { itemId: 'battery', amount: 2 },
      { itemId: 'fuse', amount: 1 },
    ],
    stats: { health: 80, stamina: 100, torchMax: 100 },
    perks: { extraInventorySlots: 2, lootBonus: 0.2 },
    relic: null,
  },
  berserker: {
    id: 'berserker',
    name: 'Berserker',
    description: 'High damage, melee only. No ranged weapons.',
    unlockCost: 100,
    startingItems: [
      { itemId: 'health_drink', amount: 3 },
    ],
    stats: { health: 120, stamina: 120, torchMax: 80 },
    perks: { meleeDamageMult: 1.5, meleeStaminaCostMult: 0.7, noRanged: true },
    relic: 'glass_jaw',
  },
  occultist: {
    id: 'occultist',
    name: 'Occultist',
    description: 'Starts with a relic. Radio picks up strange signals.',
    unlockCost: 200,
    startingItems: [
      { itemId: 'health_drink', amount: 1 },
      { itemId: 'battery', amount: 1 },
    ],
    stats: { health: 90, stamina: 90, torchMax: 120 },
    perks: { radioRangeMult: 1.5, relicFindChance: 0.1 },
    relic: 'third_eye',
  },
};

export const Relics = {
  glass_jaw: {
    id: 'glass_jaw',
    name: 'Glass Jaw',
    description: 'Melee damage +50%, but max health -30%.',
    upside: { meleeDamageMult: 1.5 },
    downside: { maxHealthMult: 0.7 },
    rarity: 'UNCOMMON',
  },
  hoarder: {
    id: 'hoarder',
    name: 'Hoarder\'s Blessing',
    description: '+4 inventory slots, but movement speed -15%.',
    upside: { extraInventorySlots: 4 },
    downside: { moveSpeedMult: 0.85 },
    rarity: 'COMMON',
  },
  light_eater: {
    id: 'light_eater',
    name: 'Light Eater',
    description: 'Torch never drains, but radio static always at maximum.',
    upside: { torchNoDrain: true },
    downside: { radioStaticMin: 1.0 },
    rarity: 'RARE',
  },
  third_eye: {
    id: 'third_eye',
    name: 'Third Eye',
    description: 'See enemies through walls, but sanity drains faster (torch flickers more).',
    upside: { wallHack: true },
    downside: { torchFlickerMult: 2.0 },
    rarity: 'RARE',
  },
  iron_knees: {
    id: 'iron_knees',
    name: 'Iron Knees',
    description: 'No fall damage, dodge cooldown -30%, but stamina regen -20%.',
    upside: { noFallDamage: true, dodgeCooldownMult: 0.7 },
    downside: { staminaRegenMult: 0.8 },
    rarity: 'COMMON',
  },
  blood_price: {
    id: 'blood_price',
    name: 'Blood Price',
    description: 'Healing items restore double, but deal 10 damage on use.',
    upside: { healMult: 2.0 },
    downside: { healSelfDamage: 10 },
    rarity: 'UNCOMMON',
  },
  silent_step: {
    id: 'silent_step',
    name: 'Silent Step',
    description: 'Movement makes no noise, but dodge distance -25%.',
    upside: { silentMovement: true },
    downside: { dodgeDistanceMult: 0.75 },
    rarity: 'COMMON',
  },
  battery_heart: {
    id: 'battery_heart',
    name: 'Battery Heart',
    description: 'Batteries restore double torch charge, but health drinks heal half.',
    upside: { batteryChargeMult: 2.0 },
    downside: { healMult: 0.5 },
    rarity: 'UNCOMMON',
  },
  stalker_bane: {
    id: 'stalker_bane',
    name: 'Stalker\'s Bane',
    description: 'Stalker appears later, but all other enemies are elite.',
    upside: { stalkerDelayMult: 2.0 },
    downside: { forceElite: true },
    rarity: 'LEGENDARY',
  },
  echo_walker: {
    id: 'echo_walker',
    name: 'Echo Walker',
    description: 'Can teleport short distances (blink), but each use costs 10 health.',
    upside: { blinkAbility: true, blinkCost: 10 },
    downside: {},
    rarity: 'LEGENDARY',
  },
  // More relics...
  quick_hands: { id: 'quick_hands', name: 'Quick Hands', upside: { reloadSpeedMult: 1.5 }, downside: { ammoFindMult: 0.7 }, rarity: 'COMMON' },
  thick_skin: { id: 'thick_skin', name: 'Thick Skin', upside: { damageReduction: 0.15 }, downside: { staminaRegenMult: 0.8 }, rarity: 'COMMON' },
  night_vision: { id: 'night_vision', name: 'Night Vision', upside: { torchRangeMult: 1.5 }, downside: { torchDrainMult: 1.5 }, rarity: 'UNCOMMON' },
  scavenger_blessing: { id: 'scavenger_blessing', name: 'Scavenger\'s Blessing', upside: { lootQuantityMult: 1.3 }, downside: { itemWeightMult: 1.2 }, rarity: 'COMMON' },
  berserker_rage: { id: 'berserker_rage', name: 'Berserker Rage', upside: { lowHealthDamageMult: 2.0 }, downside: { lowHealthThreshold: 0.3 }, rarity: 'RARE' },
  pacifist: { id: 'pacifist', name: 'Pacifist', upside: { xpMult: 2.0 }, downside: { cannotAttack: true }, rarity: 'LEGENDARY' },
  cursed: { id: 'cursed', name: 'Cursed', upside: { allStatsMult: 1.2 }, downside: { cursed: true, randomBadEvents: true }, rarity: 'LEGENDARY' },
  radio_affinity: { id: 'radio_affinity', name: 'Radio Affinity', upside: { radioClueChance: 0.3 }, downside: { batteryDrainMult: 1.3 }, rarity: 'UNCOMMON' },
  door_master: { id: 'door_master', name: 'Door Master', upside: { lockpickChance: 0.25 }, downside: { keyFindChance: 0.5 }, rarity: 'COMMON' },
  shadow_meld: { id: 'shadow_meld', name: 'Shadow Meld', upside: { hideInShadows: true }, downside: { lightVulnerability: 1.5 }, rarity: 'RARE' },
};

export const EndingFlags = {
  BOSS1_SPARED: 'boss1_spared',
  BOSS2_SPARED: 'boss2_spared',
  BOSS3_SPARED: 'boss3_spared',
  ALL_NOTES_READ: 'all_notes_read',
  NO_HEALING_USED: 'no_healing_used',
  NO_RELICS_TAKEN: 'no_relics_taken',
  STALKER_EVADED: 'stalker_evaded',
  NIGHTMARE_TIME_LOW: 'nightmare_time_low',
  TRUE_ENDING_UNLOCKED: 'true_ending_unlocked',
};

export const Endings = {
  bad: {
    id: 'bad',
    name: 'The Fog Swallows All',
    description: 'You escape, but the town remains. The cycle continues.',
    requirements: [],
    isTrue: false,
  },
  neutral: {
    id: 'neutral',
    name: 'A Hollow Victory',
    description: 'The town is quiet. For now. But you know it will return.',
    requirements: [{ flag: EndingFlags.BOSS3_SPARED, value: false }],
    isTrue: false,
  },
  good: {
    id: 'good',
    name: 'Dawn Breaks',
    description: 'The fog lifts. The nightmare ends. You walk away.',
    requirements: [
      { flag: EndingFlags.BOSS1_SPARED, value: true },
      { flag: EndingFlags.BOSS2_SPARED, value: true },
      { flag: EndingFlags.BOSS3_SPARED, value: true },
    ],
    isTrue: false,
  },
  true: {
    id: 'true',
    name: 'The Truth Unbound',
    description: 'You remember. You understand. The cycle breaks.',
    requirements: [
      { flag: EndingFlags.TRUE_ENDING_UNLOCKED, value: true },
      { flag: EndingFlags.ALL_NOTES_READ, value: true },
      { flag: EndingFlags.NO_HEALING_USED, value: true },
      { flag: EndingFlags.STALKER_EVADED, value: true },
    ],
    isTrue: true,
  },
};

export class MetaProgression {
  constructor() {
    this.currency = 0;
    this.totalEarned = 0;
    this.unlockedKits = ['survivor'];
    this.unlockedRelics = [];
    this.permanentUpgrades = {
      healthBonus: 0,
      staminaBonus: 0,
      torchBonus: 0,
      inventoryBonus: 0,
    };
    this.difficultyTier = 0; // 0-5 (Nightmare I-V)
    this.runHistory = [];
    this.loreFragments = new Set();
    this.bestiary = new Set();
    this.notesRead = new Set();
    this.stats = {
      runsStarted: 0,
      runsCompleted: 0,
      totalDeaths: 0,
      totalEnemiesKilled: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      totalHealingUsed: 0,
      totalDistance: 0,
      playTime: 0,
    };
  }

  addCurrency(amount) {
    this.currency += amount;
    this.totalEarned += amount;
  }

  spendCurrency(amount) {
    if (this.currency >= amount) {
      this.currency -= amount;
      return true;
    }
    return false;
  }

  unlockKit(kitId) {
    if (!this.unlockedKits.includes(kitId)) {
      this.unlockedKits.push(kitId);
    }
  }

  unlockRelic(relicId) {
    if (!this.unlockedRelics.includes(relicId)) {
      this.unlockedRelics.push(relicId);
    }
  }

  purchaseUpgrade(upgradeId) {
    const costs = {
      healthBonus: [100, 250, 500, 1000],
      staminaBonus: [100, 250, 500, 1000],
      torchBonus: [75, 200, 400, 800],
      inventoryBonus: [150, 350, 700, 1400],
    };
    const current = this.permanentUpgrades[upgradeId] || 0;
    if (current >= 4) return false;
    const cost = costs[upgradeId][current];
    if (this.spendCurrency(cost)) {
      this.permanentUpgrades[upgradeId] = current + 1;
      return true;
    }
    return false;
  }

  setDifficultyTier(tier) {
    this.difficultyTier = Math.max(0, Math.min(5, tier));
  }

  getDifficultyModifiers() {
    const tiers = [
      { name: 'Normal', enemyHpMult: 1.0, enemyDmgMult: 1.0, resourceMult: 1.0, stalkerTimerMult: 1.0 },
      { name: 'Nightmare I', enemyHpMult: 1.2, enemyDmgMult: 1.1, resourceMult: 0.9, stalkerTimerMult: 0.9 },
      { name: 'Nightmare II', enemyHpMult: 1.4, enemyDmgMult: 1.2, resourceMult: 0.8, stalkerTimerMult: 0.8 },
      { name: 'Nightmare III', enemyHpMult: 1.6, enemyDmgMult: 1.3, resourceMult: 0.7, stalkerTimerMult: 0.7 },
      { name: 'Nightmare IV', enemyHpMult: 1.8, enemyDmgMult: 1.5, resourceMult: 0.6, stalkerTimerMult: 0.6 },
      { name: 'Nightmare V', enemyHpMult: 2.0, enemyDmgMult: 1.7, resourceMult: 0.5, stalkerTimerMult: 0.5 },
    ];
    return tiers[this.difficultyTier] || tiers[0];
  }

  recordRun(runData) {
    this.runHistory.push({
      timestamp: Date.now(),
      seed: runData.seed,
      act: runData.act,
      floor: runData.floor,
      ending: runData.ending,
      currencyEarned: runData.currencyEarned,
      time: runData.time,
      kills: runData.kills,
      deaths: runData.deaths,
      flags: runData.flags,
    });
    if (this.runHistory.length > 50) this.runHistory.shift();

    this.stats.runsStarted++;
    if (runData.ending) this.stats.runsCompleted++;
    this.stats.totalDeaths += runData.deaths;
    this.stats.totalEnemiesKilled += runData.kills;
    this.stats.playTime += runData.time;
  }

  addLoreFragment(fragmentId) {
    this.loreFragments.add(fragmentId);
  }

  addBestiaryEntry(enemyId) {
    this.bestiary.add(enemyId);
  }

  addNoteRead(noteId) {
    this.notesRead.add(noteId);
  }

  // For save/load
  serialize() {
    return {
      currency: this.currency,
      totalEarned: this.totalEarned,
      unlockedKits: this.unlockedKits,
      unlockedRelics: this.unlockedRelics,
      permanentUpgrades: this.permanentUpgrades,
      difficultyTier: this.difficultyTier,
      runHistory: this.runHistory,
      loreFragments: Array.from(this.loreFragments),
      bestiary: Array.from(this.bestiary),
      notesRead: Array.from(this.notesRead),
      stats: this.stats,
    };
  }

  static deserialize(data) {
    const meta = new MetaProgression();
    meta.currency = data.currency || 0;
    meta.totalEarned = data.totalEarned || 0;
    meta.unlockedKits = data.unlockedKits || ['survivor'];
    meta.unlockedRelics = data.unlockedRelics || [];
    meta.permanentUpgrades = data.permanentUpgrades || { healthBonus: 0, staminaBonus: 0, torchBonus: 0, inventoryBonus: 0 };
    meta.difficultyTier = data.difficultyTier || 0;
    meta.runHistory = data.runHistory || [];
    meta.loreFragments = new Set(data.loreFragments || []);
    meta.bestiary = new Set(data.bestiary || []);
    meta.notesRead = new Set(data.notesRead || []);
    meta.stats = data.stats || {
      runsStarted: 0, runsCompleted: 0, totalDeaths: 0,
      totalEnemiesKilled: 0, totalDamageDealt: 0, totalDamageTaken: 0,
      totalHealingUsed: 0, totalDistance: 0, playTime: 0,
    };
    return meta;
  }
}