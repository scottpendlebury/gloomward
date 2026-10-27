// src/sim/save.js — Save/load, versioned format, export/import
// Exports: SaveSystem, SaveVersion
// Dependencies: rng.js, grid.js, entities.js, items.js, puzzles.js, director.js, meta.js

import { SeededRNG } from './rng.js';
import { GridWorld } from './grid.js';
import { InventorySystem } from './items.js';
import { PuzzleSystem } from './puzzles.js';
import { Director } from './director.js';
import { MetaProgression } from './meta.js';

export const SaveVersion = 3;
export const SaveKey = 'gloomward_save_v3';

export class SaveSystem {
  constructor() {
    this.version = SaveVersion;
  }

  // Save current run state
  saveRun(runState) {
    const data = {
      version: this.version,
      timestamp: Date.now(),
      meta: runState.meta.serialize(),
      run: {
        seed: runState.seed,
        act: runState.act,
        floor: runState.floor,
        rngState: runState.rng.getState(),
        player: this.serializePlayer(runState.player),
        floorData: runState.floorData ? runState.floorData.toJSON() : null,
        director: runState.director ? runState.director.serialize() : null,
        puzzles: runState.puzzles ? runState.puzzles.serialize() : null,
        flags: runState.flags || {},
        time: runState.time || 0,
        stats: runState.stats || {},
      },
    };

    try {
      localStorage.setItem(SaveKey, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }

  // Load run state
  loadRun() {
    try {
      const data = JSON.parse(localStorage.getItem(SaveKey));
      if (!data || data.version !== this.version) return null;
      return data;
    } catch (e) {
      console.error('Load failed:', e);
      return null;
    }
  }

  // Export save as text (base64)
  exportSave() {
    try {
      const data = localStorage.getItem(SaveKey);
      if (!data) return null;
      return btoa(data);
    } catch (e) {
      console.error('Export failed:', e);
      return null;
    }
  }

  // Import save from text
  importSave(base64String) {
    try {
      const data = JSON.parse(atob(base64String));
      if (!data || data.version !== this.version) return false;
      localStorage.setItem(SaveKey, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }

  // Delete save
  deleteSave() {
    try {
      localStorage.removeItem(SaveKey);
      return true;
    } catch (e) {
      console.error('Delete failed:', e);
      return false;
    }
  }

  // Check if save exists
  hasSave() {
    try {
      const data = localStorage.getItem(SaveKey);
      if (!data) return false;
      const parsed = JSON.parse(data);
      return parsed.version === this.version;
    } catch {
      return false;
    }
  }

  serializePlayer(player) {
    if (!player) return null;
    return {
      id: player.id,
      components: this.serializeComponents(player.components),
    };
  }

  serializeComponents(components) {
    const result = {};
    for (const [name, comp] of Object.entries(components)) {
      // Skip functions and non-serializable
      if (comp && typeof comp === 'object') {
        result[name] = { ...comp };
      }
    }
    return result;
  }

  // Reconstruct run state from saved data
  async reconstructRun(savedData, generators) {
    const { run, meta: metaData } = savedData;

    // Restore RNG
    const rng = SeededRNG.fromState(run.rngState);

    // Restore meta
    const meta = MetaProgression.deserialize(metaData);

    // Restore floor
    let floorData = null;
    if (run.floorData) {
      floorData = GridWorld.fromJSON(run.floorData);
    }

    // Restore player
    let player = null;
    if (run.player) {
      player = { id: run.player.id, components: run.player.components };
    }

    // Restore director
    let director = null;
    if (run.director && floorData) {
      director = Director.deserialize(run.director, rng, floorData, run.theme || 'apartments', run.floor, run.act);
    }

    // Restore puzzles
    let puzzles = null;
    if (run.puzzles) {
      puzzles = PuzzleSystem.deserialize(run.puzzles, rng);
    }

    return {
      rng,
      meta,
      seed: run.seed,
      act: run.act,
      floor: run.floor,
      floorData,
      player,
      director,
      puzzles,
      flags: run.flags || {},
      time: run.time || 0,
      stats: run.stats || {},
      theme: run.theme || 'apartments',
    };
  }
}

// Auto-save trigger
export function createAutoSave(runState, interval = 30000) {
  const saveSystem = new SaveSystem();
  let timer = 0;

  return {
    update(dt) {
      timer += dt;
      if (timer >= interval / 1000) {
        timer = 0;
        saveSystem.saveRun(runState);
      }
    },
    forceSave() {
      saveSystem.saveRun(runState);
    },
  };
}