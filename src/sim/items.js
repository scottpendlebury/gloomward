// src/sim/items.js — Item definitions, effects, inventory logic
// Exports: ItemRegistry, Item, InventorySystem
// Dependencies: entities.js

import { Archetypes } from './entities.js';

export const ItemCategory = {
  HEALING: 'HEALING',
  AMMO: 'AMMO',
  KEY: 'KEY',
  TOOL: 'TOOL',
  NOTE: 'NOTE',
  RELIC: 'RELIC',
  CONSUMABLE: 'CONSUMABLE',
};

export const ItemRegistry = {
  health_drink: {
    id: 'health_drink',
    name: 'Health Drink',
    category: ItemCategory.HEALING,
    description: 'Restores a small amount of health.',
    healAmount: 25,
    maxStack: 3,
    weight: 1,
    useSound: 'drink',
  },
  first_aid_kit: {
    id: 'first_aid_kit',
    name: 'First Aid Kit',
    category: ItemCategory.HEALING,
    description: 'Restores a large amount of health.',
    healAmount: 75,
    maxStack: 2,
    weight: 2,
    useSound: 'bandage',
  },
  battery: {
    id: 'battery',
    name: 'Battery',
    category: ItemCategory.CONSUMABLE,
    description: 'Recharges your torch.',
    chargeAmount: 50,
    maxStack: 4,
    weight: 1,
    useSound: 'battery',
  },
  ammo_pistol: {
    id: 'ammo_pistol',
    name: 'Pistol Ammo',
    category: ItemCategory.AMMO,
    description: '6 rounds for the handgun.',
    ammoAmount: 6,
    maxStack: 12,
    weight: 1,
    useSound: 'ammo',
  },
  ammo_shotgun: {
    id: 'ammo_shotgun',
    name: 'Shotgun Shells',
    category: ItemCategory.AMMO,
    description: '2 shells for the shotgun.',
    ammoAmount: 2,
    maxStack: 8,
    weight: 2,
    useSound: 'ammo',
  },
  key_apartment: {
    id: 'key_apartment',
    name: 'Apartment Key',
    category: ItemCategory.KEY,
    description: 'Opens a specific apartment door.',
    keyId: 'apartment_main',
    maxStack: 1,
    weight: 0,
    useSound: 'key',
  },
  key_clinic: {
    id: 'key_clinic',
    name: 'Clinic Key',
    category: ItemCategory.KEY,
    description: 'Opens a clinic door.',
    keyId: 'clinic_main',
    maxStack: 1,
    weight: 0,
    useSound: 'key',
  },
  key_office: {
    id: 'key_office',
    name: 'Office Key',
    category: ItemCategory.KEY,
    description: 'Opens an office door.',
    keyId: 'office_main',
    maxStack: 1,
    weight: 0,
    useSound: 'key',
  },
  fuse: {
    id: 'fuse',
    name: 'Fuse',
    category: ItemCategory.TOOL,
    description: 'Restores power to a circuit.',
    maxStack: 3,
    weight: 1,
    useSound: 'fuse',
  },
  valve_handle: {
    id: 'valve_handle',
    name: 'Valve Handle',
    category: ItemCategory.TOOL,
    description: 'Turns a stuck valve.',
    maxStack: 1,
    weight: 2,
    useSound: 'metal',
  },
  note_generic: {
    id: 'note_generic',
    name: 'Note',
    category: ItemCategory.NOTE,
    description: 'A scrap of paper with writing.',
    noteId: '',
    maxStack: 1,
    weight: 0,
    useSound: 'paper',
  },
};

export class InventorySystem {
  constructor() {}

  addItem(inventory, itemId, amount = 1) {
    const itemDef = ItemRegistry[itemId];
    if (!itemDef) return false;

    const maxStack = itemDef.maxStack || 1;
    let remaining = amount;

    // Try to stack with existing
    for (const slot of inventory.slots) {
      if (slot && slot.itemId === itemId && slot.amount < maxStack) {
        const canAdd = Math.min(maxStack - slot.amount, remaining);
        slot.amount += canAdd;
        remaining -= canAdd;
        if (remaining <= 0) return true;
      }
    }

    // Find empty slots
    for (let i = 0; i < inventory.maxSlots; i++) {
      if (!inventory.slots[i]) {
        const addAmount = Math.min(maxStack, remaining);
        inventory.slots[i] = { itemId, amount: addAmount };
        remaining -= addAmount;
        if (remaining <= 0) return true;
      }
    }

    return remaining < amount; // Partial success
  }

  removeItem(inventory, itemId, amount = 1) {
    let remaining = amount;
    for (const slot of inventory.slots) {
      if (slot && slot.itemId === itemId) {
        const remove = Math.min(slot.amount, remaining);
        slot.amount -= remove;
        remaining -= remove;
        if (slot.amount <= 0) {
          slot.itemId = null;
          slot.amount = 0;
        }
        if (remaining <= 0) return true;
      }
    }
    return remaining < amount;
  }

  hasItem(inventory, itemId, amount = 1) {
    let total = 0;
    for (const slot of inventory.slots) {
      if (slot && slot.itemId === itemId) total += slot.amount;
    }
    return total >= amount;
  }

  getItemCount(inventory, itemId) {
    let total = 0;
    for (const slot of inventory.slots) {
      if (slot && slot.itemId === itemId) total += slot.amount;
    }
    return total;
  }

  useItem(entity, itemId, slotIndex) {
    const inventory = entity.components.Inventory;
    if (!inventory || slotIndex < 0 || slotIndex >= inventory.maxSlots) return false;

    const slot = inventory.slots[slotIndex];
    if (!slot || slot.itemId !== itemId) return false;

    const itemDef = ItemRegistry[itemId];
    if (!itemDef) return false;

    let success = false;

    switch (itemDef.category) {
      case ItemCategory.HEALING:
        success = this.useHealing(entity, itemDef);
        break;
      case ItemCategory.CONSUMABLE:
        success = this.useConsumable(entity, itemDef);
        break;
      case ItemCategory.KEY:
      case ItemCategory.TOOL:
        // Keys/tools used via interaction, not direct use
        return false;
      case ItemCategory.NOTE:
        // Reading handled by UI
        return true; // Don't consume
    }

    if (success && itemDef.maxStack > 0) {
      slot.amount--;
      if (slot.amount <= 0) {
        inventory.slots[slotIndex] = null;
      }
    }

    return success;
  }

  useHealing(entity, itemDef) {
    const health = entity.components.Health;
    if (!health || health.current >= health.max) return false;

    health.current = Math.min(health.max, health.current + itemDef.healAmount);
    return true;
  }

  useConsumable(entity, itemDef) {
    if (itemDef.id === 'battery') {
      const torch = entity.components.Torch;
      if (!torch || torch.battery >= torch.max) return false;
      torch.battery = Math.min(torch.max, torch.battery + itemDef.chargeAmount);
      return true;
    }
    return false;
  }

  selectSlot(inventory, index) {
    if (index >= 0 && index < inventory.maxSlots) {
      inventory.selected = index;
      return true;
    }
    return false;
  }

  getSelectedItem(inventory) {
    const slot = inventory.slots[inventory.selected];
    return slot ? { ...slot, def: ItemRegistry[slot.itemId] } : null;
  }

  // For save/load
  serialize(inventory) {
    return {
      slots: inventory.slots.map(s => s ? { itemId: s.itemId, amount: s.amount } : null),
      maxSlots: inventory.maxSlots,
      selected: inventory.selected,
    };
  }

  static deserialize(data) {
    return {
      slots: data.slots.map(s => s ? { itemId: s.itemId, amount: s.amount } : null),
      maxSlots: data.maxSlots,
      selected: data.selected,
    };
  }
}

// Loot tables for procedural generation
export const LootTables = {
  common: [
    { itemId: 'health_drink', weight: 30 },
    { itemId: 'battery', weight: 25 },
    { itemId: 'ammo_pistol', weight: 20 },
    { itemId: 'note_generic', weight: 15 },
    { itemId: 'fuse', weight: 10 },
  ],
  uncommon: [
    { itemId: 'first_aid_kit', weight: 20 },
    { itemId: 'ammo_shotgun', weight: 15 },
    { itemId: 'valve_handle', weight: 10 },
    { itemId: 'key_apartment', weight: 5 },
  ],
  rare: [
    { itemId: 'first_aid_kit', weight: 10 },
    { itemId: 'ammo_shotgun', weight: 10 },
  ],
};

export function rollLoot(rng, tableName, count = 1) {
  const table = LootTables[tableName] || LootTables.common;
  const results = [];
  for (let i = 0; i < count; i++) {
    const totalWeight = table.reduce((sum, e) => sum + e.weight, 0);
    let roll = rng.nextFloat(0, totalWeight);
    for (const entry of table) {
      roll -= entry.weight;
      if (roll <= 0) {
        results.push(entry.itemId);
        break;
      }
    }
  }
  return results;
}