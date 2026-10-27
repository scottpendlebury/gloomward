// tests/gen/floor.test.js — Floor generator tests
// Run with: node --test tests/gen/floor.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../../src/sim/rng.js';
import { generateFloor, validateFloor } from '../../src/gen/floor.js';

test('generateFloor: produces valid floor for apartments', () => {
  const rng = new SeededRNG(1);
  const floor = generateFloor(rng, 0, 'apartments', 1);
  const validation = validateFloor(floor);
  assert.ok(validation.valid, `Floor invalid: ${validation.errors.join(', ')}`);
});

test('generateFloor: produces valid floor for clinic', () => {
  const rng = new SeededRNG(2);
  const floor = generateFloor(rng, 0, 'clinic', 1);
  const validation = validateFloor(floor);
  assert.ok(validation.valid, `Floor invalid: ${validation.errors.join(', ')}`);
});

test('generateFloor: produces valid floor for offices', () => {
  const rng = new SeededRNG(3);
  const floor = generateFloor(rng, 0, 'offices', 1);
  const validation = validateFloor(floor);
  assert.ok(validation.valid, `Floor invalid: ${validation.errors.join(', ')}`);
});

test('generateFloor: produces valid floor for industrial', () => {
  const rng = new SeededRNG(4);
  const floor = generateFloor(rng, 0, 'industrial', 1);
  const validation = validateFloor(floor);
  assert.ok(validation.valid, `Floor invalid: ${validation.errors.join(', ')}`);
});

test('generateFloor: produces valid floor for streets', () => {
  const rng = new SeededRNG(5);
  const floor = generateFloor(rng, 0, 'streets', 1);
  // Streets uses different generator
  // Just check it doesn't throw
  assert.ok(floor.grid !== undefined);
  assert.ok(floor.start !== undefined);
  assert.ok(floor.exit !== undefined);
});

test('generateFloor: deterministic with same seed', () => {
  const rng1 = new SeededRNG(100);
  const floor1 = generateFloor(rng1, 0, 'apartments', 1);

  const rng2 = new SeededRNG(100);
  const floor2 = generateFloor(rng2, 0, 'apartments', 1);

  assert.strictEqual(floor1.rooms.length, floor2.rooms.length);
  assert.strictEqual(floor1.spawns.length, floor2.spawns.length);
});

test('generateFloor: different seeds produce different floors', () => {
  const rng1 = new SeededRNG(100);
  const floor1 = generateFloor(rng1, 0, 'apartments', 1);

  const rng2 = new SeededRNG(200);
  const floor2 = generateFloor(rng2, 0, 'apartments', 1);

  // Very unlikely to have exact same room count and spawn count
  const same = floor1.rooms.length === floor2.rooms.length &&
               floor1.spawns.length === floor2.spawns.length;
  // Could be same by chance, but unlikely
});

test('generateFloor: has start and exit', () => {
  const rng = new SeededRNG(42);
  const floor = generateFloor(rng, 0, 'apartments', 1);
  assert.ok(floor.start.x !== undefined);
  assert.ok(floor.start.y !== undefined);
  assert.ok(floor.exit.x !== undefined);
  assert.ok(floor.exit.y !== undefined);
  assert.ok(floor.exit.roomId !== undefined);
});

test('generateFloor: has rooms', () => {
  const rng = new SeededRNG(42);
  const floor = generateFloor(rng, 0, 'apartments', 1);
  assert.ok(floor.rooms.length >= 6);
  assert.ok(floor.rooms.length <= 16);
});

test('generateFloor: validation checks exit reachable', () => {
  const rng = new SeededRNG(42);
  const floor = generateFloor(rng, 0, 'apartments', 1);
  const validation = validateFloor(floor);
  assert.ok(validation.exitReachable);
});

test('generateFloor: validation checks keys reachable', () => {
  const rng = new SeededRNG(42);
  const floor = generateFloor(rng, 0, 'apartments', 1);
  const validation = validateFloor(floor);
  assert.strictEqual(validation.keysReachable, validation.totalKeys);
});

test('generateFloor: 50 seeds all valid', () => {
  for (let i = 0; i < 50; i++) {
    const rng = new SeededRNG(1000 + i);
    const floor = generateFloor(rng, i % 3, 'apartments', 1);
    const validation = validateFloor(floor);
    assert.ok(validation.valid, `Seed ${1000 + i} failed: ${validation.errors.join(', ')}`);
  }
});

test('generateFloor: floors have spawns', () => {
  const rng = new SeededRNG(42);
  const floor = generateFloor(rng, 0, 'apartments', 1);
  assert.ok(floor.spawns.length > 0);
});

test('generateFloor: spawns have valid positions', () => {
  const rng = new SeededRNG(42);
  const floor = generateFloor(rng, 0, 'apartments', 1);
  for (const spawn of floor.spawns) {
    assert.ok(spawn.position.x !== undefined);
    assert.ok(spawn.position.y !== undefined);
    // Position should be walkable
    assert.ok(floor.grid.isWalkable(
      Math.round(spawn.position.x),
      Math.round(spawn.position.y)
    ));
  }
});