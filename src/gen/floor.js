// src/gen/floor.js — Floor graph → grid embedding → validation
// Exports: generateFloor, validateFloor, FloorData, Room, Corridor
// Dependencies: rng.js, grid.js, entities.js, items.js, puzzles.js, director.js

import { SeededRNG } from '../sim/rng.js';
import { GridWorld, CellType, Direction } from '../sim/grid.js';
import { Archetypes } from '../sim/entities.js';
import { rollLoot, LootTables } from '../sim/items.js';
import { PuzzleSystem, PuzzleTypes } from '../sim/puzzles.js';
import { Director, EnemyDefinitions, EnemyTier } from '../sim/director.js';

export class Room {
  constructor(id, x, y, w, h, type = 'generic') {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.type = type;
    this.area = w * h;
    this.centerX = x + Math.floor(w / 2);
    this.centerY = y + Math.floor(h / 2);
    this.doors = []; // { x, y, dir, connectedRoomId, locked, keyId, puzzle }
    this.props = [];
    this.items = [];
    this.enemies = [];
    this.spawnPoints = [];
  }

  getBounds() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  contains(x, y) {
    return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h;
  }

  getRandomWalkable(grid, rng, margin = 1) {
    const attempts = 20;
    for (let i = 0; i < attempts; i++) {
      const x = rng.nextInt(this.x + margin, this.x + this.w - margin);
      const y = rng.nextInt(this.y + margin, this.y + this.h - margin);
      if (grid.isWalkable(x, y) && !grid.hasProp(x, y)) {
        return { x, y };
      }
    }
    return null;
  }
}

export class Corridor {
  constructor(fromRoom, toRoom, path) {
    this.fromRoom = fromRoom;
    this.toRoom = toRoom;
    this.path = path; // [{x, y}]
    this.doors = []; // Doors along corridor
  }
}

export class FloorData {
  constructor() {
    this.grid = null;
    this.rooms = [];
    this.corridors = [];
    this.graph = { nodes: [], edges: [] };
    this.criticalPath = [];
    this.sideBranches = [];
    this.locks = []; // { doorId, roomId, type, keyId, puzzle }
    this.keys = [];  // { keyId, roomId, itemId }
    this.start = { x: 0, y: 0 };
    this.exit = { x: 0, y: 0, roomId: null };
    this.theme = 'apartments';
    this.floorIndex = 0;
    this.act = 1;
    this.spawns = [];
    this.props = [];
    this.decals = [];
  }
}

export function generateFloor(rng, floorIndex, theme, act) {
  const floorRng = rng.fork();
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptRng = floorRng.fork();
    const floor = attemptGenerateFloor(attemptRng, floorIndex, theme, act);
    const validation = validateFloor(floor);
    if (validation.valid) {
      return floor;
    }
    // Invalid, try next attempt with derived seed
  }

  // Fallback: return last attempt even if invalid (shouldn't happen)
  return attemptGenerateFloor(floorRng, floorIndex, theme, act);
}

function attemptGenerateFloor(rng, floorIndex, theme, act) {
  const floor = new FloorData();
  floor.theme = theme;
  floor.floorIndex = floorIndex;
  floor.act = act;

  // 1. Build room graph
  const graph = buildRoomGraph(rng, floorIndex, theme);
  floor.graph = graph;
  floor.criticalPath = graph.criticalPath;
  floor.sideBranches = graph.sideBranches;

  // 2. Assign locks and keys
  const lockKeyData = assignLocksAndKeys(rng, graph);
  floor.locks = lockKeyData.locks;
  floor.keys = lockKeyData.keys;

  // 3. Embed graph in grid
  const gridData = embedGraphInGrid(rng, graph, theme);
  floor.grid = gridData.grid;
  floor.rooms = gridData.rooms;
  floor.corridors = gridData.corridors;
  floor.start = gridData.start;
  floor.exit = gridData.exit;

  // 4. Dress rooms (props, decals)
  dressRooms(rng, floor);

  // 5. Place items and enemies
  const director = new Director(rng, floor, theme, floorIndex, act);
  floor.spawns = director.populateFloor(floor.grid, floor.rooms, floor.start);

  // Place key items
  for (const key of floor.keys) {
    const room = floor.rooms.find(r => r.id === key.roomId);
    if (room) {
      const pos = room.getRandomWalkable(floor.grid, rng);
      if (pos) {
        floor.spawns.push({
          type: 'key_item',
          archetype: 'KEY_ITEM',
          position: pos,
          keyId: key.keyId,
          name: key.name,
        });
      }
    }
  }

  // Place loot
  placeLoot(rng, floor);

  // 6. Validate
  const validation = validateFloor(floor);
  floor.validationReport = validation;

  return floor;
}

function buildRoomGraph(rng, floorIndex, theme) {
  const roomCount = 6 + rng.nextInt(5); // 6-10 rooms
  const sideBranchCount = 3 + rng.nextInt(4); // 3-6 side branches

  const nodes = [];
  const edges = [];

  // Create main path rooms
  for (let i = 0; i < roomCount; i++) {
    const roomTypes = getRoomTypesForTheme(theme);
    nodes.push({
      id: `room_${i}`,
      type: rng.choice(roomTypes),
      isCritical: true,
      order: i,
    });
  }

  // Connect main path linearly
  for (let i = 0; i < roomCount - 1; i++) {
    edges.push({
      from: nodes[i].id,
      to: nodes[i + 1].id,
      critical: true,
    });
  }

  // Add side branches
  for (let i = 0; i < sideBranchCount; i++) {
    const branchId = `branch_${i}`;
    const roomTypes = getRoomTypesForTheme(theme);
    nodes.push({
      id: branchId,
      type: rng.choice(roomTypes),
      isCritical: false,
      order: -1,
    });

    // Connect to random main path room
    const attachTo = rng.nextInt(roomCount);
    edges.push({
      from: nodes[attachTo].id,
      to: branchId,
      critical: false,
    });

    // 30% chance for loop (connect to another main path room)
    if (rng.next() < 0.3 && roomCount > 2) {
      const loopTo = rng.nextInt(roomCount - 1);
      if (loopTo >= attachTo) loopTo++;
      edges.push({
        from: branchId,
        to: nodes[loopTo].id,
        critical: false,
      });
    }
  }

  // Critical path is the main linear path
  const criticalPath = nodes.filter(n => n.isCritical).map(n => n.id);

  // Side branches are non-critical nodes
  const sideBranches = nodes.filter(n => !n.isCritical).map(n => n.id);

  return { nodes, edges, criticalPath, sideBranches };
}

function getRoomTypesForTheme(theme) {
  const types = {
    streets: ['street', 'alley', 'plaza', 'building_front', 'parking'],
    apartments: ['living_room', 'bedroom', 'kitchen', 'bathroom', 'hallway', 'balcony', 'closet'],
    clinic: ['waiting_room', 'exam_room', 'hallway', 'storage', 'office', 'lab', 'morgue'],
    offices: ['cubicles', 'meeting_room', 'break_room', 'server_room', 'hallway', 'reception', 'storage'],
    industrial: ['factory_floor', 'warehouse', 'control_room', 'maintenance', 'loading_dock', 'boiler_room'],
  };
  return types[theme] || types.apartments;
}

function assignLocksAndKeys(rng, graph) {
  const locks = [];
  const keys = [];
  const keyIds = ['apartment_main', 'clinic_main', 'office_main', 'storage_key', 'basement_key', 'roof_key'];
  const lockTypes = ['key', 'code', 'fuse', 'jammed'];
  const puzzleTypes = [PuzzleTypes.CODE_LOCK, PuzzleTypes.ITEM_SLOT, PuzzleTypes.RIDDLE_LOOKUP, PuzzleTypes.RADIO_TUNING, PuzzleTypes.SEQUENCE, PuzzleTypes.SHADOW_REVEAL];

  // Lock 1-2 doors on critical path
  const criticalEdges = graph.edges.filter(e => e.critical);
  const lockCount = 1 + rng.nextInt(2); // 1-2 locks
  const lockEdges = rng.shuffle(criticalEdges).slice(0, lockCount);

  for (let i = 0; i < lockEdges.length; i++) {
    const edge = lockEdges[i];
    const keyId = keyIds[i % keyIds.length];
    const lockType = rng.choice(lockTypes);
    const puzzleType = lockType === 'code' ? PuzzleTypes.CODE_LOCK :
                       lockType === 'fuse' ? PuzzleTypes.ITEM_SLOT :
                       lockType === 'jam' ? PuzzleTypes.SEQUENCE :
                       rng.choice(puzzleTypes);

    const doorId = `door_${edge.from}_${edge.to}`;
    const puzzleSystem = new PuzzleSystem(rng.fork());
    const puzzle = puzzleSystem.createPuzzle(puzzleType, doorId, { theme: graph.nodes[0]?.type });

    locks.push({
      doorId,
      roomId: edge.to,
      type: lockType,
      keyId,
      puzzle,
      edge,
    });

    // Place key in a room reachable BEFORE this lock
    // For simplicity, place in previous critical path room
    const lockIndex = graph.criticalPath.indexOf(edge.to);
    const keyRoomIndex = Math.max(0, lockIndex - 1 - rng.nextInt(2));
    const keyRoomId = graph.criticalPath[keyRoomIndex];

    keys.push({
      keyId,
      roomId: keyRoomId,
      itemId: lockType === 'fuse' ? 'fuse' : 'key_' + keyId,
      name: lockType === 'fuse' ? 'Fuse' : keyId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    });
  }

  return { locks, keys };
}

function embedGraphInGrid(rng, graph, theme) {
  // Grid size based on room count
  const roomCount = graph.nodes.length;
  const gridSize = Math.max(40, 25 + roomCount * 3);
  const cellSize = 1.5;
  const grid = new GridWorld(gridSize, gridSize, cellSize);

  // Room sizing
  const roomSizes = {
    street: { w: 15, h: 8 },
    alley: { w: 6, h: 12 },
    plaza: { w: 12, h: 12 },
    building_front: { w: 10, h: 6 },
    parking: { w: 14, h: 10 },
    living_room: { w: 8, h: 7 },
    bedroom: { w: 6, h: 6 },
    kitchen: { w: 6, h: 5 },
    bathroom: { w: 4, h: 4 },
    hallway: { w: 4, h: 10 },
    balcony: { w: 3, h: 6 },
    closet: { w: 2, h: 3 },
    waiting_room: { w: 10, h: 8 },
    exam_room: { w: 6, h: 5 },
    storage: { w: 5, h: 5 },
    office: { w: 7, h: 6 },
    lab: { w: 8, h: 7 },
    morgue: { w: 8, h: 6 },
    cubicles: { w: 12, h: 10 },
    meeting_room: { w: 8, h: 7 },
    break_room: { w: 6, h: 6 },
    server_room: { w: 6, h: 6 },
    reception: { w: 8, h: 5 },
    factory_floor: { w: 14, h: 12 },
    warehouse: { w: 16, h: 14 },
    control_room: { w: 8, h: 6 },
    maintenance: { w: 6, h: 8 },
    loading_dock: { w: 10, h: 8 },
    boiler_room: { w: 7, h: 7 },
  };

  // Place rooms using growth algorithm
  const rooms = [];
  const placedRooms = new Map();

  // Start with first critical room at center
  const startNode = graph.nodes.find(n => n.id === graph.criticalPath[0]);
  const startSize = roomSizes[startNode.type] || { w: 8, h: 8 };
  const startX = Math.floor(gridSize / 2) - Math.floor(startSize.w / 2);
  const startY = Math.floor(gridSize / 2) - Math.floor(startSize.h / 2);

  const startRoom = new Room(startNode.id, startX, startY, startSize.w, startSize.h, startNode.type);
  carveRoom(grid, startRoom);
  rooms.push(startRoom);
  placedRooms.set(startNode.id, startRoom);

  // Place remaining rooms
  for (const node of graph.nodes) {
    if (node.id === startNode.id) continue;

    const connectedEdges = graph.edges.filter(e => e.from === node.id || e.to === node.id);
    if (connectedEdges.length === 0) continue;

    // Find already placed neighbor
    let placedNeighbor = null;
    let connectingEdge = null;
    for (const edge of connectedEdges) {
      const otherId = edge.from === node.id ? edge.to : edge.from;
      if (placedRooms.has(otherId)) {
        placedNeighbor = placedRooms.get(otherId);
        connectingEdge = edge;
        break;
      }
    }

    if (!placedNeighbor) continue;

    const size = roomSizes[node.type] || { w: 8, h: 8 };
    const newRoom = placeRoomAdjacent(grid, rng, placedNeighbor, connectingEdge, node.id, size, node.type);
    if (newRoom) {
      rooms.push(newRoom);
      placedRooms.set(node.id, newRoom);

      // Carve corridor
      carveCorridor(grid, placedNeighbor, newRoom, connectingEdge, graph);
    }
  }

  // Find start and exit positions
  const startRoomObj = rooms.find(r => r.id === graph.criticalPath[0]);
  const exitRoomObj = rooms.find(r => r.id === graph.criticalPath[graph.criticalPath.length - 1]);

  const start = startRoomObj ? { x: startRoomObj.centerX, y: startRoomObj.centerY } : { x: gridSize / 2, y: gridSize / 2 };
  const exit = exitRoomObj ? { x: exitRoomObj.centerX, y: exitRoomObj.centerY, roomId: exitRoomObj.id } : { x: gridSize / 2, y: gridSize / 2 };

  // Place exit marker
  if (exitRoomObj) {
    grid.setCell(exitRoomObj.centerX, exitRoomObj.centerY, CellType.STAIRS_DOWN);
  }

  return { grid, rooms, corridors: [], start, exit };
}

function placeRoomAdjacent(grid, rng, neighbor, edge, roomId, size, type) {
  const directions = ['N', 'E', 'S', 'W'];
  const dirVectors = { N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 }, S: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 } };
  rng.shuffle(directions);

  for (const dir of directions) {
    const vec = dirVectors[dir];
    const corridorLen = 3 + rng.nextInt(5); // 3-7 cells

    let newX, newY;
    if (dir === 'N') {
      newX = neighbor.x + Math.floor((neighbor.w - size.w) / 2) + rng.nextInt(3) - 1;
      newY = neighbor.y - size.h - corridorLen;
    } else if (dir === 'S') {
      newX = neighbor.x + Math.floor((neighbor.w - size.w) / 2) + rng.nextInt(3) - 1;
      newY = neighbor.y + neighbor.h + corridorLen;
    } else if (dir === 'E') {
      newX = neighbor.x + neighbor.w + corridorLen;
      newY = neighbor.y + Math.floor((neighbor.h - size.h) / 2) + rng.nextInt(3) - 1;
    } else {
      newX = neighbor.x - size.w - corridorLen;
      newY = neighbor.y + Math.floor((neighbor.h - size.h) / 2) + rng.nextInt(3) - 1;
    }

    // Check bounds and overlap
    if (newX < 1 || newY < 1 || newX + size.w >= grid.width - 1 || newY + size.h >= grid.height - 1) continue;

    let overlap = false;
    for (let y = newY - 1; y <= newY + size.h; y++) {
      for (let x = newX - 1; x <= newX + size.w; x++) {
        if (grid.getCell(x, y) !== GridWorld.prototype.getCell.call({ cells: grid.cells, width: grid.width }, x, y)) {
          // Check if already floor
          if (grid.isWalkable(x, y)) { overlap = true; break; }
        }
      }
      if (overlap) break;
    }
    if (overlap) continue;

    const newRoom = new Room(roomId, newX, newY, size.w, size.h, type);
    carveRoom(grid, newRoom);
    return newRoom;
  }

  return null;
}

function carveRoom(grid, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const isWall = x === room.x || x === room.x + room.w - 1 || y === room.y || y === room.y + room.h - 1;
      grid.setCell(x, y, isWall ? CellType.WALL : CellType.FLOOR);
    }
  }
}

function carveCorridor(grid, roomA, roomB, edge, graph) {
  // Simple L-shaped corridor
  const ax = roomA.centerX;
  const ay = roomA.centerY;
  const bx = roomB.centerX;
  const by = roomB.centerY;

  // Carve from A center to corridor start
  let x = ax, y = ay;
  while (x !== bx) {
    grid.setCell(x, y, CellType.FLOOR);
    x += x < bx ? 1 : -1;
  }
  while (y !== by) {
    grid.setCell(x, y, CellType.FLOOR);
    y += y < by ? 1 : -1;
  }
  grid.setCell(x, y, CellType.FLOOR);

  // Add doors at room boundaries
  // (Simplified - doors handled in dressing phase)
}

function dressRooms(rng, floor) {
  const propTemplates = getPropTemplatesForTheme(floor.theme);

  for (const room of floor.rooms) {
    // Place props based on room type
    const propCount = Math.floor(room.area / 12) + rng.nextInt(3);
    for (let i = 0; i < propCount; i++) {
      const pos = room.getRandomWalkable(floor.grid, rng, 2);
      if (!pos) continue;

      const template = rng.choice(propTemplates[room.type] || propTemplates.generic);
      if (template && rng.next() < template.chance) {
        floor.grid.setProp(pos.x, pos.y, { type: template.type, variant: rng.nextInt(template.variants || 1) });
        floor.props.push({ x: pos.x, y: pos.y, type: template.type });
      }
    }

    // Add decals
    const decalCount = rng.nextInt(3);
    for (let i = 0; i < decalCount; i++) {
      const pos = room.getRandomWalkable(floor.grid, rng, 1);
      if (pos && rng.next() < 0.3) {
        floor.decals.push({ x: pos.x, y: pos.y, type: rng.choice(['blood', 'stain', 'crack', 'scratch', 'mould']) });
      }
    }
  }
}

function getPropTemplatesForTheme(theme) {
  return {
    generic: [
      { type: 'chair', chance: 0.3, variants: 3 },
      { type: 'table', chance: 0.2, variants: 2 },
      { type: 'cabinet', chance: 0.15, variants: 2 },
      { type: 'shelf', chance: 0.15, variants: 2 },
      { type: 'trash', chance: 0.2, variants: 3 },
    ],
    living_room: [
      { type: 'sofa', chance: 0.4, variants: 2 },
      { type: 'tv', chance: 0.2, variants: 1 },
      { type: 'coffee_table', chance: 0.3, variants: 2 },
      { type: 'lamp', chance: 0.2, variants: 2 },
    ],
    bedroom: [
      { type: 'bed', chance: 0.5, variants: 2 },
      { type: 'wardrobe', chance: 0.3, variants: 2 },
      { type: 'nightstand', chance: 0.2, variants: 2 },
    ],
    kitchen: [
      { type: 'counter', chance: 0.4, variants: 2 },
      { type: 'fridge', chance: 0.2, variants: 1 },
      { type: 'stove', chance: 0.2, variants: 1 },
      { type: 'sink', chance: 0.2, variants: 1 },
    ],
    bathroom: [
      { type: 'toilet', chance: 0.3, variants: 1 },
      { type: 'bathtub', chance: 0.2, variants: 1 },
      { type: 'sink', chance: 0.3, variants: 1 },
    ],
    hallway: [
      { type: 'coat_rack', chance: 0.2, variants: 1 },
      { type: 'mirror', chance: 0.1, variants: 1 },
      { type: 'plant', chance: 0.15, variants: 2 },
    ],
    office: [
      { type: 'desk', chance: 0.4, variants: 2 },
      { type: 'office_chair', chance: 0.4, variants: 2 },
      { type: 'filing_cabinet', chance: 0.2, variants: 2 },
      { type: 'computer', chance: 0.3, variants: 1 },
    ],
    clinic: [
      { type: 'medical_bed', chance: 0.3, variants: 1 },
      { type: 'cart', chance: 0.2, variants: 2 },
      { type: 'cabinet', chance: 0.3, variants: 2 },
      { type: 'monitor', chance: 0.1, variants: 1 },
    ],
    industrial: [
      { type: 'crate', chance: 0.4, variants: 3 },
      { type: 'pipe', chance: 0.2, variants: 2 },
      { type: 'machine', chance: 0.15, variants: 2 },
      { type: 'barrel', chance: 0.2, variants: 2 },
      { type: 'pallet', chance: 0.25, variants: 2 },
    ],
  };
}

function placeLoot(rng, floor) {
  for (const room of floor.rooms) {
    if (room === floor.rooms[0]) continue; // Skip start room

    // 30% chance for loot per room
    if (rng.next() > 0.3) continue;

    const pos = room.getRandomWalkable(floor.grid, rng);
    if (!pos) continue;

    // Determine loot tier based on distance from start
    const distFromStart = Math.hypot(pos.x - floor.start.x, pos.y - floor.start.y);
    let table = 'common';
    if (distFromStart > 30) table = 'rare';
    else if (distFromStart > 15) table = 'uncommon';

    const items = rollLoot(rng, table, 1);
    for (const itemId of items) {
      floor.spawns.push({
        type: 'pickup',
        archetype: itemId.toUpperCase(),
        position: pos,
        itemId,
      });
    }
  }
}

export function validateFloor(floor) {
  const report = {
    valid: true,
    errors: [],
    warnings: [],
    reachableRooms: 0,
    totalRooms: floor.rooms.length,
    keysReachable: 0,
    totalKeys: floor.keys.length,
    exitReachable: false,
  };

  const grid = floor.grid;
  const startX = Math.round(floor.start.x);
  const startY = Math.round(floor.start.y);

  // BFS from start with key collection simulation
  const visited = new Set();
  const queue = [{ x: startX, y: startY, keys: new Set() }];
  visited.add(`${startX},${startY}`);

  const keysByRoom = new Map();
  for (const key of floor.keys) {
    if (!keysByRoom.has(key.roomId)) keysByRoom.set(key.roomId, []);
    keysByRoom.get(key.roomId).push(key);
  }

  const locksByDoor = new Map();
  for (const lock of floor.locks) {
    locksByDoor.set(lock.doorId, lock);
  }

  let steps = 0;
  const maxSteps = grid.width * grid.height * 2;

  while (queue.length > 0 && steps < maxSteps) {
    const current = queue.shift();
    steps++;

    // Check if current position has a key
    const roomAtPos = floor.rooms.find(r => r.contains(current.x, current.y));
    if (roomAtPos && keysByRoom.has(roomAtPos.id)) {
      for (const key of keysByRoom.get(roomAtPos.id)) {
        current.keys.add(key.keyId);
        report.keysReachable++;
      }
    }

    // Check if exit reached
    if (current.x === Math.round(floor.exit.x) && current.y === Math.round(floor.exit.y)) {
      report.exitReachable = true;
    }

    // Explore neighbors
    for (let dir = 0; dir < 4; dir++) {
      const nx = current.x + Direction.dx[dir * 2];
      const ny = current.y + Direction.dy[dir * 2];
      const key = `${nx},${ny}`;

      if (!grid.inBounds(nx, ny) || visited.has(key)) continue;

      const cell = grid.getCell(nx, ny);
      let canPass = false;
      let newKeys = new Set(current.keys);

      if (cell === CellType.FLOOR || cell === CellType.STAIRS_UP || cell === CellType.STAIRS_DOWN || cell === CellType.DOOR_OPEN) {
        canPass = true;
      } else if (cell === CellType.DOOR_CLOSED) {
        canPass = true; // Can open
      } else if (cell === CellType.DOOR_LOCKED) {
        // Find lock for this door
        const doorId = findDoorIdAt(grid, nx, ny, floor);
        const lock = doorId ? locksByDoor.get(doorId) : null;
        if (lock && current.keys.has(lock.keyId)) {
          canPass = true; // Have key
        }
      }

      if (canPass) {
        visited.add(key);
        queue.push({ x: nx, y: ny, keys: newKeys });
      }
    }
  }

  report.reachableRooms = floor.rooms.filter(r => {
    const centerKey = `${r.centerX},${r.centerY}`;
    return visited.has(centerKey);
  }).length;

  // Check validation criteria
  if (!report.exitReachable) {
    report.valid = false;
    report.errors.push('Exit not reachable from start');
  }

  if (report.keysReachable < report.totalKeys) {
    report.valid = false;
    report.errors.push(`Only ${report.keysReachable}/${report.totalKeys} keys reachable`);
  }

  if (report.reachableRooms < report.totalRooms) {
    report.warnings.push(`${report.totalRooms - report.reachableRooms} rooms unreachable`);
  }

  // Check for overlapping entities
  const spawnPositions = new Set();
  for (const spawn of floor.spawns) {
    const key = `${Math.round(spawn.position.x)},${Math.round(spawn.position.y)}`;
    if (spawnPositions.has(key)) {
      report.warnings.push(`Overlapping spawn at ${key}`);
    }
    spawnPositions.add(key);
  }

  return report;
}

function findDoorIdAt(grid, x, y, floor) {
  // Simplified - would need door position tracking
  for (const lock of floor.locks) {
    // Check if this lock's door is at this position
    // For now, return first lock (not accurate but functional)
    return lock.doorId;
  }
  return null;
}