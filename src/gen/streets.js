// src/gen/streets.js — Fog streets: blocks, roads, building fronts
// Exports: generateStreets, StreetBlock, BuildingFront
// Dependencies: rng.js, grid.js, floor.js

import { SeededRNG } from '../sim/rng.js';
import { GridWorld, CellType, Direction } from '../sim/grid.js';
import { Room, generateFloor } from './floor.js';

export function generateStreets(rng, floorIndex, act) {
  const streetRng = rng.fork();
  const blockCount = 4 + streetRng.nextInt(3); // 4-6 blocks per side
  const blockSize = 12;
  const roadWidth = 4;
  const gridSize = blockCount * (blockSize + roadWidth) + roadWidth;
  const cellSize = 2.0; // Larger cells for streets

  const grid = new GridWorld(gridSize, gridSize, cellSize);
  const buildings = [];
  const roads = [];
  const landmarks = [];

  // Initialize all as empty
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      grid.setCell(x, y, GridWorld.prototype.CellType.EMPTY);
    }
  }

  // Build grid of blocks and roads
  for (let by = 0; by < blockCount; by++) {
    for (let bx = 0; bx < blockCount; bx++) {
      const blockX = bx * (blockSize + roadWidth) + roadWidth;
      const blockY = by * (blockSize + roadWidth) + roadWidth;

      // Road to the left
      if (bx === 0) {
        for (let y = blockY; y < blockY + blockSize; y++) {
          grid.setCell(roadWidth - 1, y, CellType.FLOOR);
        }
        roads.push({ x: roadWidth - 1, y: blockY, w: 1, h: blockSize, vertical: true });
      }

      // Road above
      if (by === 0) {
        for (let x = blockX; x < blockX + blockSize; x++) {
          grid.setCell(x, roadWidth - 1, CellType.FLOOR);
        }
        roads.push({ x: blockX, y: roadWidth - 1, w: blockSize, h: 1, vertical: false });
      }

      // Vertical road on right
      for (let y = blockY; y < blockY + blockSize; y++) {
        grid.setCell(blockX + blockSize, y, CellType.FLOOR);
      }
      roads.push({ x: blockX + blockSize, y: blockY, w: 1, h: blockSize, vertical: true });

      // Horizontal road below
      for (let x = blockX; x < blockX + blockSize; x++) {
        grid.setCell(x, blockY + blockSize, CellType.FLOOR);
      }
      roads.push({ x: blockX, y: blockY + blockSize, w: blockSize, h: 1, vertical: false });

      // Building block
      const building = generateBuildingBlock(streetRng.fork(), grid, blockX, blockY, blockSize, bx, by);
      buildings.push(...building);
    }
  }

  // Add perimeter roads
  for (let x = 0; x < gridSize; x++) {
    grid.setCell(x, 0, CellType.FLOOR);
    grid.setCell(x, gridSize - 1, CellType.FLOOR);
  }
  for (let y = 0; y < gridSize; y++) {
    grid.setCell(0, y, CellType.FLOOR);
    grid.setCell(gridSize - 1, y, CellType.FLOOR);
  }

  // Add abandoned cars, barriers on roads
  dressRoads(streetRng, grid, roads);

  // Select 2-4 buildings as enterable (generate interior floors)
  const enterableBuildings = streetRng.shuffle(buildings.filter(b => b.enterable)).slice(0, 2 + streetRng.nextInt(3));

  // Add landmarks visible through fog
  for (let i = 0; i < 3; i++) {
    const lm = placeLandmark(streetRng, grid, gridSize);
    if (lm) landmarks.push(lm);
  }

  // Start position (edge of map)
  const startEdge = streetRng.nextInt(4);
  let startX, startY;
  if (startEdge === 0) { startX = streetRng.nextInt(5, gridSize - 5); startY = 2; }
  else if (startEdge === 1) { startX = gridSize - 3; startY = streetRng.nextInt(5, gridSize - 5); }
  else if (startEdge === 2) { startX = streetRng.nextInt(5, gridSize - 5); startY = gridSize - 3; }
  else { startX = 2; startY = streetRng.nextInt(5, gridSize - 5); }

  // Exit position (opposite edge)
  const exitEdge = (startEdge + 2) % 4;
  let exitX, exitY;
  if (exitEdge === 0) { exitX = streetRng.nextInt(5, gridSize - 5); exitY = 2; }
  else if (exitEdge === 1) { exitX = gridSize - 3; exitY = streetRng.nextInt(5, gridSize - 5); }
  else if (exitEdge === 2) { exitX = streetRng.nextInt(5, gridSize - 5); exitY = gridSize - 3; }
  else { exitX = 2; exitY = streetRng.nextInt(5, gridSize - 5); }

  grid.setCell(Math.round(startX), Math.round(startY), CellType.FLOOR);
  grid.setCell(Math.round(exitX), Math.round(exitY), CellType.STAIRS_DOWN);

  return {
    grid,
    buildings,
    roads,
    landmarks,
    enterableBuildings,
    start: { x: startX, y: startY },
    exit: { x: exitX, y: exitY },
    theme: 'streets',
    floorIndex,
    act,
  };
}

function generateBuildingBlock(rng, grid, blockX, blockY, blockSize, bx, by) {
  const buildings = [];
  const buildingCount = 1 + rng.nextInt(2); // 1-2 buildings per block

  for (let i = 0; i < buildingCount; i++) {
    const bw = 4 + rng.nextInt(blockSize - 4);
    const bh = 4 + rng.nextInt(blockSize - 4);
    const bx_offset = rng.nextInt(0, blockSize - bw);
    const by_offset = rng.nextInt(0, blockSize - bh);

    const x = blockX + bx_offset;
    const y = blockY + by_offset;

    // 40% chance to be enterable
    const enterable = rng.next() < 0.4;

    const building = {
      id: `building_${bx}_${by}_${i}`,
      x, y, w: bw, h: bh,
      enterable,
      floors: 1 + rng.nextInt(3),
      type: rng.choice(['apartment', 'shop', 'office', 'warehouse']),
      doors: [],
      windows: [],
    };

    // Carve building footprint
    for (let byy = y; byy < y + bh; byy++) {
      for (let bxx = x; bxx < x + bw; bxx++) {
        const isWall = bxx === x || bxx === x + bw - 1 || byy === y || byy === y + bh - 1;
        grid.setCell(bxx, byy, isWall ? CellType.WALL : (enterable ? CellType.FLOOR : CellType.EMPTY));
      }
    }

    // Add doors on street-facing sides
    const streetSides = [];
    if (bx === 0) streetSides.push('W');
    if (bx === blockSize - 1) streetSides.push('E'); // Not quite right, but conceptually
    if (by === 0) streetSides.push('N');
    // Roads are on all sides in our grid

    // Add 1-2 doors on road-facing walls
    const doorCount = 1 + rng.nextInt(2);
    for (let d = 0; d < doorCount; d++) {
      const side = rng.choice(['N', 'E', 'S', 'W']);
      let dx, dy;
      if (side === 'N') { dx = x + 1 + rng.nextInt(bw - 2); dy = y; }
      else if (side === 'S') { dx = x + 1 + rng.nextInt(bw - 2); dy = y + bh - 1; }
      else if (side === 'E') { dx = x + bw - 1; dy = y + 1 + rng.nextInt(bh - 2); }
      else { dx = x; dy = y + 1 + rng.nextInt(bh - 2); }

      if (grid.inBounds(dx, dy) && grid.getCell(dx, dy) === CellType.WALL) {
        grid.setCell(dx, dy, CellType.DOOR_CLOSED);
        building.doors.push({ x: dx, y: dy, side });
      }
    }

    // Add windows
    for (let side of ['N', 'E', 'S', 'W']) {
      const windowCount = 2 + rng.nextInt(3);
      for (let w = 0; w < windowCount; w++) {
        let wx, wy;
        if (side === 'N') { wx = x + 1 + rng.nextInt(bw - 2); wy = y; }
        else if (side === 'S') { wx = x + 1 + rng.nextInt(bw - 2); wy = y + bh - 1; }
        else if (side === 'E') { wx = x + bw - 1; wy = y + 1 + rng.nextInt(bh - 2); }
        else { wx = x; wy = y + 1 + rng.nextInt(bh - 2); }

        if (grid.inBounds(wx, wy) && grid.getCell(wx, wy) === CellType.WALL && rng.next() < 0.5) {
          building.windows.push({ x: wx, y: wy, side });
        }
      }
    }

    buildings.push(building);
  }

  return buildings;
}

function dressRoads(rng, grid, roads) {
  const props = ['car', 'barrier', 'debris', 'light', 'hydrant', 'bin'];

  for (const road of roads) {
    const length = road.vertical ? road.h : road.w;
    const propCount = Math.floor(length / 6) + rng.nextInt(2);

    for (let i = 0; i < propCount; i++) {
      let px, py;
      if (road.vertical) {
        px = road.x;
        py = road.y + 1 + rng.nextInt(road.h - 2);
      } else {
        px = road.x + 1 + rng.nextInt(road.w - 2);
        py = road.y;
      }

      if (grid.getCell(px, py) === CellType.FLOOR && rng.next() < 0.4) {
        grid.setProp(px, py, { type: rng.choice(props) });
      }
    }
  }
}

function placeLandmark(rng, grid, gridSize) {
  const landmarkTypes = [
    { type: 'church', w: 10, h: 12, weight: 1 },
    { type: 'clock_tower', w: 6, h: 15, weight: 1 },
    { type: 'monument', w: 8, h: 8, weight: 2 },
    { type: 'billboard', w: 12, h: 6, weight: 2 },
    { type: 'wrecked_bus', w: 8, h: 4, weight: 3 },
  ];

  const totalWeight = landmarkTypes.reduce((s, l) => s + l.weight, 0);
  let roll = rng.nextFloat(0, totalWeight);
  let chosen = null;
  for (const l of landmarkTypes) {
    roll -= l.weight;
    if (roll <= 0) { chosen = l; break; }
  }

  if (!chosen) return null;

  // Place near center but offset
  const cx = Math.floor(gridSize / 2) + rng.nextInt(-15, 16);
  const cy = Math.floor(gridSize / 2) + rng.nextInt(-15, 16);

  if (cx < 5 || cy < 5 || cx + chosen.w >= gridSize - 5 || cy + chosen.h >= gridSize - 5) {
    return null;
  }

  // Carve landmark
  for (let y = cy; y < cy + chosen.h; y++) {
    for (let x = cx; x < cx + chosen.w; x++) {
      const isWall = x === cx || x === cx + chosen.w - 1 || y === cy || y === cy + chosen.h - 1;
      grid.setCell(x, y, isWall ? CellType.WALL : CellType.FLOOR);
    }
  }

  return { ...chosen, x: cx, y: cy };
}

export function generateStreetInterior(rng, building, theme) {
  // Generate an interior floor for an enterable building
  const interiorRng = rng.fork();
  const floorIndex = 0;
  const act = 1;

  // Use apartment/clinic/office theme based on building type
  let interiorTheme = 'apartments';
  if (building.type === 'shop' || building.type === 'warehouse') interiorTheme = 'industrial';
  else if (building.type === 'office') interiorTheme = 'offices';

  const floor = generateFloor(interiorRng, floorIndex, interiorTheme, act);

  // Override start/exit to match building door
  if (building.doors.length > 0) {
    const door = building.doors[0];
    floor.start = { x: door.x, y: door.y };
    // Find a room away from entrance for exit
    const farRoom = floor.rooms.reduce((far, room) => {
      const dist = Math.hypot(room.centerX - door.x, room.centerY - door.y);
      const farDist = Math.hypot(far.centerX - door.x, far.centerY - door.y);
      return dist > farDist ? room : far;
    }, floor.rooms[0]);
    floor.exit = { x: farRoom.centerX, y: farRoom.centerY, roomId: farRoom.id };
    floor.grid.setCell(farRoom.centerX, farRoom.centerY, CellType.STAIRS_DOWN);
  }

  return floor;
}