// tests/sim/grid.test.js — Grid world tests
// Run with: node --test tests/sim/grid.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GridWorld, CellType, Direction } from '../../src/sim/grid.js';

test('GridWorld: basic cell operations', () => {
  const grid = new GridWorld(10, 10);
  assert.strictEqual(grid.getCell(5, 5), CellType.EMPTY);
  grid.setCell(5, 5, CellType.WALL);
  assert.strictEqual(grid.getCell(5, 5), CellType.WALL);
});

test('GridWorld: bounds checking', () => {
  const grid = new GridWorld(10, 10);
  assert.ok(grid.inBounds(0, 0));
  assert.ok(grid.inBounds(9, 9));
  assert.ok(!grid.inBounds(-1, 0));
  assert.ok(!grid.inBounds(10, 0));
  assert.ok(!grid.inBounds(0, -1));
  assert.ok(!grid.inBounds(0, 10));
  // Out of bounds returns WALL
  assert.strictEqual(grid.getCell(-1, 0), CellType.WALL);
});

test('GridWorld: walkable/opaque queries', () => {
  const grid = new GridWorld(10, 10);
  grid.setCell(5, 5, CellType.FLOOR);
  assert.ok(grid.isWalkable(5, 5));
  assert.ok(!grid.isOpaque(5, 5));

  grid.setCell(6, 5, CellType.WALL);
  assert.ok(!grid.isWalkable(6, 5));
  assert.ok(grid.isOpaque(6, 5));
});

test('GridWorld: raycast', () => {
  const grid = new GridWorld(10, 10);
  // Clear path
  for (let x = 0; x < 10; x++) grid.setCell(x, 5, CellType.FLOOR);
  const hit = grid.raycast(0, 5, 9, 5);
  assert.strictEqual(hit.hit, false);
  assert.strictEqual(hit.x, 9);
  assert.strictEqual(hit.y, 5);

  // Blocked path
  grid.setCell(5, 5, CellType.WALL);
  const hit2 = grid.raycast(0, 5, 9, 5);
  assert.strictEqual(hit2.hit, true);
  assert.strictEqual(hit2.x, 5);
  assert.strictEqual(hit2.y, 5);
});

test('GridWorld: findPath', () => {
  const grid = new GridWorld(10, 10);
  // Create open area
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      grid.setCell(x, y, CellType.FLOOR);
    }
  }
  const path = grid.findPath(0, 0, 9, 9);
  assert.ok(path !== null);
  assert.strictEqual(path[0].x, 0);
  assert.strictEqual(path[0].y, 0);
  assert.strictEqual(path[path.length - 1].x, 9);
  assert.strictEqual(path[path.length - 1].y, 9);
});

test('GridWorld: findPath blocked', () => {
  const grid = new GridWorld(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      grid.setCell(x, y, CellType.FLOOR);
    }
  }
  // Block middle
  grid.setCell(5, 5, CellType.WALL);
  const path = grid.findPath(0, 0, 9, 9);
  assert.ok(path !== null); // Should find path around
});

test('GridWorld: findPath no path', () => {
  const grid = new GridWorld(10, 10);
  // All walls except start/end
  grid.setCell(0, 0, CellType.FLOOR);
  grid.setCell(9, 9, CellType.FLOOR);
  const path = grid.findPath(0, 0, 9, 9);
  assert.strictEqual(path, null);
});

test('GridWorld: floodFill', () => {
  const grid = new GridWorld(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      grid.setCell(x, y, CellType.FLOOR);
    }
  }
  const visited = grid.floodFill(0, 0);
  assert.strictEqual(visited.size, 100);
});

test('GridWorld: door operations', () => {
  const grid = new GridWorld(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      grid.setCell(x, y, CellType.FLOOR);
    }
  }
  grid.setDoor(5, 5, false);
  assert.strictEqual(grid.getCell(5, 5), CellType.DOOR_CLOSED);
  assert.ok(!grid.isWalkable(5, 5));

  grid.openDoor(5, 5);
  assert.strictEqual(grid.getCell(5, 5), CellType.DOOR_OPEN);
  assert.ok(grid.isWalkable(5, 5));

  grid.lockDoor(5, 5, 'key1');
  assert.strictEqual(grid.getCell(5, 5), CellType.DOOR_LOCKED);
  assert.ok(!grid.isWalkable(5, 5));

  grid.unlockDoor(5, 5);
  assert.strictEqual(grid.getCell(5, 5), CellType.DOOR_CLOSED);
});

test('GridWorld: serialization', () => {
  const grid = new GridWorld(10, 10);
  grid.setCell(5, 5, CellType.WALL);
  grid.setCell(6, 6, CellType.FLOOR);
  grid.setDoor(7, 7, true, 'key1');
  grid.setProp(8, 8, { type: 'crate' });

  const json = grid.toJSON();
  const restored = GridWorld.fromJSON(json);

  assert.strictEqual(restored.width, 10);
  assert.strictEqual(restored.height, 10);
  assert.strictEqual(restored.getCell(5, 5), CellType.WALL);
  assert.strictEqual(restored.getCell(6, 6), CellType.FLOOR);
  const door = restored.getDoor(7, 7);
  assert.ok(door);
  assert.strictEqual(door.locked, true);
  assert.strictEqual(door.keyId, 'key1');
  assert.ok(restored.hasProp(8, 8));
});