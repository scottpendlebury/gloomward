// src/sim/puzzles.js — Puzzle archetypes, validation, clue generation
// Exports: PuzzleRegistry, PuzzleSystem, PuzzleTypes
// Dependencies: rng.js, grid.js

import { SeededRNG } from './rng.js';
import { GridWorld, CellType } from './grid.js';

export const PuzzleTypes = {
  CODE_LOCK: 'CODE_LOCK',
  ITEM_SLOT: 'ITEM_SLOT',
  RIDDLE_LOOKUP: 'RIDDLE_LOOKUP',
  RADIO_TUNING: 'RADIO_TUNING',
  SEQUENCE: 'SEQUENCE',
  SHADOW_REVEAL: 'SHADOW_REVEAL',
};

export const PuzzleRegistry = {
  [PuzzleTypes.CODE_LOCK]: {
    generate(rng, doorId, context) {
      const codeLength = rng.nextInt(2) + 3; // 3-4 digits
      const code = Array.from({ length: codeLength }, () => rng.nextInt(10));
      const clueTypes = ['tally', 'clock', 'calendar', 'poster'];
      const clueType = rng.choice(clueTypes);

      let clueText = '';
      switch (clueType) {
        case 'tally':
          clueText = `Scratched tallies on the wall: ${code.map(d => '|'.repeat(d)).join('  ')}`;
          break;
        case 'clock':
          const hour = code[0] * 10 + (code[1] || 0);
          const minute = (code[2] || 0) * 10 + (code[3] || 0);
          clueText = `The stopped clock reads ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          break;
        case 'calendar':
          clueText = `Dates circled on the calendar: ${code.join('/')}`;
          break;
        case 'poster':
          clueText = `A torn poster shows numbers: ${code.join('-')}`;
          break;
      }

      return {
        type: PuzzleTypes.CODE_LOCK,
        doorId,
        code,
        clueText,
        clueType,
        solved: false,
      };
    },
    validate(puzzle, input) {
      return Array.isArray(input) && input.length === puzzle.code.length &&
        input.every((d, i) => d === puzzle.code[i]);
    },
  },

  [PuzzleTypes.ITEM_SLOT]: {
    generate(rng, doorId, context) {
      const itemTypes = ['fuse', 'valve_handle', 'gear', 'crank'];
      const itemId = rng.choice(itemTypes);
      const clueText = `A missing ${itemId.replace('_', ' ')} is needed here.`;

      return {
        type: PuzzleTypes.ITEM_SLOT,
        doorId,
        requiredItem: itemId,
        clueText,
        solved: false,
      };
    },
    validate(puzzle, input) {
      return input === puzzle.requiredItem;
    },
  },

  [PuzzleTypes.RIDDLE_LOOKUP]: {
    generate(rng, doorId, context) {
      const options = [
        { id: 'painting_1', text: 'A weeping woman in grey' },
        { id: 'painting_2', text: 'A burning house at dusk' },
        { id: 'painting_3', text: 'A child holding a dead bird' },
        { id: 'mirror_1', text: 'Your reflection, but wrong' },
        { id: 'photo_1', text: 'A family portrait, faces scratched out' },
      ];
      const correct = rng.choice(options);
      const distractors = rng.shuffle(options.filter(o => o !== correct)).slice(0, 2);
      const allOptions = rng.shuffle([correct, ...distractors]);

      const clueTemplates = [
        'The one that {verb} the {noun} holds the key.',
        'Seek the {noun} that {verb}s in silence.',
        'Only the {noun} without a {noun2} opens the way.',
      ];
      const template = rng.choice(clueTemplates);
      const verbs = ['weeps', 'burns', 'silences', 'watches', 'hides'];
      const nouns = ['woman', 'house', 'child', 'mirror', 'portrait', 'bird', 'face'];
      const clueText = template
        .replace('{verb}', rng.choice(verbs))
        .replace('{noun}', rng.choice(nouns))
        .replace('{noun2}', rng.choice(nouns));

      return {
        type: PuzzleTypes.RIDDLE_LOOKUP,
        doorId,
        options: allOptions.map(o => o.id),
        correctId: correct.id,
        clueText,
        solved: false,
      };
    },
    validate(puzzle, input) {
      return input === puzzle.correctId;
    },
  },

  [PuzzleTypes.RADIO_TUNING]: {
    generate(rng, doorId, context) {
      const frequency = rng.nextFloat(88.0, 108.0);
      const clueText = `A faint voice on the radio whispers: "${frequency.toFixed(1)} MHz... remember..."`;

      return {
        type: PuzzleTypes.RADIO_TUNING,
        doorId,
        frequency: Math.round(frequency * 10) / 10,
        clueText,
        solved: false,
      };
    },
    validate(puzzle, input) {
      return Math.abs(input - puzzle.frequency) < 0.05;
    },
  },

  [PuzzleTypes.SEQUENCE]: {
    generate(rng, doorId, context) {
      const length = rng.nextInt(2) + 3; // 3-4 steps
      const sequence = Array.from({ length }, () => rng.nextInt(4)); // 0-3: valves/switches
      const clues = ['turn left', 'turn right', 'pull down', 'push up'];
      const clueText = `Sequence: ${sequence.map(s => clues[s]).join(' → ')}`;

      return {
        type: PuzzleTypes.SEQUENCE,
        doorId,
        sequence,
        clueText,
        solved: false,
        currentStep: 0,
      };
    },
    validate(puzzle, input) {
      if (input !== puzzle.sequence[puzzle.currentStep]) {
        puzzle.currentStep = 0;
        return false;
      }
      puzzle.currentStep++;
      if (puzzle.currentStep >= puzzle.sequence.length) {
        puzzle.currentStep = 0;
        return true;
      }
      return false; // Partial progress
    },
  },

  [PuzzleTypes.SHADOW_REVEAL]: {
    generate(rng, doorId, context) {
      const messages = [
        'THE KEY IS IN THE DARK',
        'LIGHT REVEALS WHAT SHADOWS HIDE',
        'LOOK BEHIND YOU',
        'THE DOOR OPENS INWARD',
      ];
      const message = rng.choice(messages);
      const clueText = `Faint writing, only visible in torchlight: "${message}"`;

      return {
        type: PuzzleTypes.SHADOW_REVEAL,
        doorId,
        message,
        clueText,
        solved: false,
      };
    },
    validate(puzzle, input) {
      // Input is the player action (e.g., 'torch_on', 'turn_around')
      return input === 'torch_on' || input === 'turn_around';
    },
  },
};

export class PuzzleSystem {
  constructor(rng) {
    this.rng = rng;
    this.activePuzzles = new Map(); // doorId -> puzzle
  }

  createPuzzle(type, doorId, context = {}) {
    const generator = PuzzleRegistry[type];
    if (!generator) return null;

    const puzzle = generator.generate(this.rng, doorId, context);
    this.activePuzzles.set(doorId, puzzle);
    return puzzle;
  }

  getPuzzle(doorId) {
    return this.activePuzzles.get(doorId);
  }

  attemptSolve(doorId, input) {
    const puzzle = this.activePuzzles.get(doorId);
    if (!puzzle || puzzle.solved) return false;

    const generator = PuzzleRegistry[puzzle.type];
    if (!generator) return false;

    const solved = generator.validate(puzzle, input);
    if (solved) {
      puzzle.solved = true;
    }
    return solved;
  }

  getClue(doorId) {
    const puzzle = this.activePuzzles.get(doorId);
    return puzzle ? puzzle.clueText : null;
  }

  // For save/load
  serialize() {
    return Array.from(this.activePuzzles.entries()).map(([doorId, puzzle]) => ({
      doorId,
      ...puzzle,
    }));
  }

  static deserialize(data, rng) {
    const system = new PuzzleSystem(rng);
    for (const puzzle of data) {
      const { doorId, ...rest } = puzzle;
      system.activePuzzles.set(doorId, rest);
    }
    return system;
  }
}

// Clue placement helper: ensures clues are placed in rooms reachable BEFORE the locked door
export function placeClues(grid, graph, locks, keys, rng) {
  const cluePlacements = [];

  for (const lock of locks) {
    const puzzle = lock.puzzle;
    if (!puzzle || !puzzle.clueText) continue;

    // Find a room on the critical path before the lock's room
    const lockRoom = lock.roomId;
    const keyRoom = keys.find(k => k.keyId === lock.keyId)?.roomId;

    // For code locks etc., clue goes in a room reachable without the key
    const candidateRooms = graph.nodes
      .filter(n => n.id !== lockRoom)
      .filter(n => isReachableBefore(graph, n.id, lockRoom, locks, keys));

    if (candidateRooms.length > 0) {
      const clueRoom = rng.choice(candidateRooms);
      cluePlacements.push({
        roomId: clueRoom.id,
        puzzleDoorId: lock.doorId,
        clueText: puzzle.clueText,
        type: 'puzzle_clue',
      });
    }
  }

  return cluePlacements;
}

function isReachableBefore(graph, fromRoom, toRoom, locks, keys) {
  // Simplified: check if there's a path that doesn't require the lock's key
  // In practice, the validator does full BFS with key collection
  return true; // Placeholder - validator handles actual reachability
}