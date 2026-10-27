// src/gen/interiors.js — Room templates, BSP/corridor growth, dressing
// Exports: RoomTemplates, dressRoom, generateRoomLayout
// Dependencies: rng.js, grid.js

import { SeededRNG } from '../sim/rng.js';
import { GridWorld, CellType } from '../sim/grid.js';

export const RoomTemplates = {
  // ASCII templates: # = wall, . = floor, D = door anchor, P = prop anchor, S = spawn anchor
  living_room: {
    w: 10, h: 9,
    template: [
      '##########',
      '#........#',
      '#........#',
      '#..P....P#',
      '#..D....D#',
      '#........#',
      '#..P....P#',
      '#........#',
      '##########',
    ],
    propAnchors: [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 3, y: 6 }, { x: 7, y: 6 }],
    doorAnchors: [{ x: 3, y: 4 }, { x: 7, y: 4 }],
    spawnAnchors: [{ x: 5, y: 5 }],
  },
  bedroom: {
    w: 8, h: 8,
    template: [
      '########',
      '#......#',
      '#..P...#',
      '#..D...#',
      '#......#',
      '#..P...#',
      '#......#',
      '########',
    ],
    propAnchors: [{ x: 3, y: 2 }, { x: 3, y: 5 }],
    doorAnchors: [{ x: 3, y: 3 }],
    spawnAnchors: [{ x: 5, y: 4 }],
  },
  kitchen: {
    w: 8, h: 7,
    template: [
      '########',
      '#P....P#',
      '#......#',
      '#..D...#',
      '#......#',
      '#P....P#',
      '########',
    ],
    propAnchors: [{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 1, y: 5 }, { x: 6, y: 5 }],
    doorAnchors: [{ x: 3, y: 3 }],
    spawnAnchors: [{ x: 4, y: 3 }],
  },
  bathroom: {
    w: 6, h: 6,
    template: [
      '######',
      '#P...#',
      '#..D.#',
      '#....#',
      '#P...#',
      '######',
    ],
    propAnchors: [{ x: 1, y: 1 }, { x: 1, y: 4 }],
    doorAnchors: [{ x: 3, y: 2 }],
    spawnAnchors: [{ x: 3, y: 3 }],
  },
  hallway: {
    w: 5, h: 12,
    template: [
      '#####',
      '#...#',
      '#.D.#',
      '#...#',
      '#...#',
      '#.D.#',
      '#...#',
      '#...#',
      '#.D.#',
      '#...#',
      '#...#',
      '#####',
    ],
    propAnchors: [],
    doorAnchors: [{ x: 2, y: 2 }, { x: 2, y: 5 }, { x: 2, y: 8 }],
    spawnAnchors: [{ x: 2, y: 4 }, { x: 2, y: 7 }],
  },
  office: {
    w: 10, h: 8,
    template: [
      '##########',
      '#P......P#',
      '#..D.....#',
      '#........#',
      '#........#',
      '#..D....P#',
      '#P......P#',
      '##########',
    ],
    propAnchors: [{ x: 1, y: 1 }, { x: 8, y: 1 }, { x: 1, y: 6 }, { x: 8, y: 6 }],
    doorAnchors: [{ x: 3, y: 2 }, { x: 3, y: 5 }],
    spawnAnchors: [{ x: 5, y: 3 }, { x: 7, y: 4 }],
  },
  clinic_exam: {
    w: 8, h: 7,
    template: [
      '########',
      '#P....P#',
      '#..D...#',
      '#......#',
      '#......#',
      '#P....P#',
      '########',
    ],
    propAnchors: [{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 1, y: 5 }, { x: 6, y: 5 }],
    doorAnchors: [{ x: 3, y: 2 }],
    spawnAnchors: [{ x: 4, y: 3 }],
  },
  factory: {
    w: 16, h: 14,
    template: [
      '################',
      '#P............P#',
      '#..............#',
      '#..D........D..#',
      '#..............#',
      '#..............#',
      '#P............P#',
      '#..............#',
      '#..............#',
      '#..D........D..#',
      '#..............#',
      '#..............#',
      '#P............P#',
      '################',
    ],
    propAnchors: [{ x: 1, y: 1 }, { x: 14, y: 1 }, { x: 1, y: 6 }, { x: 14, y: 6 }, { x: 1, y: 12 }, { x: 14, y: 12 }],
    doorAnchors: [{ x: 3, y: 3 }, { x: 12, y: 3 }, { x: 3, y: 9 }, { x: 12, y: 9 }],
    spawnAnchors: [{ x: 8, y: 4 }, { x: 8, y: 7 }, { x: 8, y: 10 }],
  },
};

export function applyRoomTemplate(grid, room, template, rng) {
  const { w, h, template: lines } = template;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = room.x + x;
      const gy = room.y + y;
      const char = lines[y][x];

      if (char === '#') {
        grid.setCell(gx, gy, CellType.WALL);
      } else if (char === '.') {
        grid.setCell(gx, gy, CellType.FLOOR);
      } else if (char === 'D') {
        grid.setCell(gx, gy, CellType.DOOR_CLOSED);
      }
    }
  }

  // Store anchor positions in room for later use
  room.templateAnchors = {
    props: template.propAnchors.map(a => ({ x: room.x + a.x, y: room.y + a.y })),
    doors: template.doorAnchors.map(a => ({ x: room.x + a.x, y: room.y + a.y })),
    spawns: template.spawnAnchors.map(a => ({ x: room.x + a.x, y: room.y + a.y })),
  };
}

export function generateRoomLayout(rng, roomType, grid, room) {
  const template = RoomTemplates[roomType];
  if (!template) return;

  applyRoomTemplate(grid, room, template, rng);

  // Place props at anchors
  if (room.templateAnchors) {
    for (const anchor of room.templateAnchors.props) {
      if (grid.isWalkable(anchor.x, anchor.y) && rng.next() < 0.7) {
        grid.setProp(anchor.x, anchor.y, { type: getRandomPropForRoom(roomType, rng) });
      }
    }
  }
}

function getRandomPropForRoom(roomType, rng) {
  const propsByRoom = {
    living_room: ['sofa', 'tv', 'coffee_table', 'lamp', 'plant'],
    bedroom: ['bed', 'wardrobe', 'nightstand', 'lamp'],
    kitchen: ['counter', 'fridge', 'stove', 'sink', 'cabinet'],
    bathroom: ['toilet', 'bathtub', 'sink', 'cabinet'],
    hallway: ['coat_rack', 'mirror', 'plant', 'table'],
    office: ['desk', 'office_chair', 'filing_cabinet', 'computer', 'plant'],
    clinic_exam: ['medical_bed', 'cart', 'cabinet', 'monitor'],
    factory: ['crate', 'pipe', 'machine', 'barrel', 'pallet'],
  };
  const list = propsByRoom[roomType] || ['crate', 'box', 'barrel'];
  return rng.choice(list);
}

export function bspDungeon(rng, width, height, minRoomSize = 6, maxDepth = 5) {
  const rooms = [];
  const corridors = [];

  function split(node, depth) {
    if (depth >= maxDepth) {
      rooms.push(node);
      return;
    }

    const canSplitH = node.h >= minRoomSize * 2;
    const canSplitV = node.w >= minRoomSize * 2;

    if (!canSplitH && !canSplitV) {
      rooms.push(node);
      return;
    }

    let splitH;
    if (canSplitH && canSplitV) {
      splitH = rng.next() < 0.5;
    } else {
      splitH = canSplitH;
    }

    if (splitH) {
      const splitY = rng.nextInt(node.y + minRoomSize, node.y + node.h - minRoomSize);
      split({ x: node.x, y: node.y, w: node.w, h: splitY - node.y }, depth + 1);
      split({ x: node.x, y: splitY, w: node.w, h: node.y + node.h - splitY }, depth + 1);
    } else {
      const splitX = rng.nextInt(node.x + minRoomSize, node.x + node.w - minRoomSize);
      split({ x: node.x, y: node.y, w: splitX - node.x, h: node.h }, depth + 1);
      split({ x: splitX, y: node.y, w: node.x + node.w - splitX, h: node.h }, depth + 1);
    }
  }

  split({ x: 2, y: 2, w: width - 4, h: height - 4 }, 0);

  // Connect rooms with corridors
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    corridors.push(connectRooms(a, b));
  }

  return { rooms, corridors };
}

function connectRooms(a, b) {
  const ax = a.x + Math.floor(a.w / 2);
  const ay = a.y + Math.floor(a.h / 2);
  const bx = b.x + Math.floor(b.w / 2);
  const by = b.y + Math.floor(b.h / 2);

  const path = [];
  let x = ax, y = ay;

  // L-shaped corridor
  while (x !== bx) {
    path.push({ x, y });
    x += x < bx ? 1 : -1;
  }
  while (y !== by) {
    path.push({ x, y });
    y += y < by ? 1 : -1;
  }
  path.push({ x, y });

  return { from: a, to: b, path };
}

export function growthDungeon(rng, width, height, roomCount, minRoomSize = 4, maxRoomSize = 10) {
  const grid = new GridWorld(width, height);
  const rooms = [];

  // Start with one room in center
  const firstRoom = {
    x: Math.floor(width / 2) - 4,
    y: Math.floor(height / 2) - 4,
    w: 8, h: 8,
  };
  carveRoom(grid, firstRoom);
  rooms.push(firstRoom);

  for (let i = 1; i < roomCount; i++) {
    const attempts = 50;
    let placed = false;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const parent = rng.choice(rooms);
      const dir = rng.nextInt(4);
      const w = rng.nextInt(minRoomSize, maxRoomSize + 1);
      const h = rng.nextInt(minRoomSize, maxRoomSize + 1);

      let nx, ny;
      if (dir === 0) { // N
        nx = parent.x + rng.nextInt(-2, parent.w - w + 2);
        ny = parent.y - h - rng.nextInt(2, 5);
      } else if (dir === 1) { // E
        nx = parent.x + parent.w + rng.nextInt(2, 5);
        ny = parent.y + rng.nextInt(-2, parent.h - h + 2);
      } else if (dir === 2) { // S
        nx = parent.x + rng.nextInt(-2, parent.w - w + 2);
        ny = parent.y + parent.h + rng.nextInt(2, 5);
      } else { // W
        nx = parent.x - w - rng.nextInt(2, 5);
        ny = parent.y + rng.nextInt(-2, parent.h - h + 2);
      }

      if (nx < 1 || ny < 1 || nx + w >= width - 1 || ny + h >= height - 1) continue;

      // Check overlap
      let overlap = false;
      for (let y = ny - 1; y <= ny + h; y++) {
        for (let x = nx - 1; x <= nx + w; x++) {
          if (grid.getCell(x, y) === CellType.FLOOR) { overlap = true; break; }
        }
        if (overlap) break;
      }
      if (overlap) continue;

      const newRoom = { x: nx, y: ny, w, h };
      carveRoom(grid, newRoom);
      carveCorridor(grid, parent, newRoom);
      rooms.push(newRoom);
      placed = true;
      break;
    }

    if (!placed) break;
  }

  return { grid, rooms };
}

function carveRoom(grid, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const isWall = x === room.x || x === room.x + room.w - 1 || y === room.y || y === room.y + room.h - 1;
      grid.setCell(x, y, isWall ? CellType.WALL : CellType.FLOOR);
    }
  }
}

function carveCorridor(grid, a, b) {
  const ax = a.x + Math.floor(a.w / 2);
  const ay = a.y + Math.floor(a.h / 2);
  const bx = b.x + Math.floor(b.w / 2);
  const by = b.y + Math.floor(b.h / 2);

  let x = ax, y = ay;
  while (x !== bx) {
    grid.setCell(x, y, CellType.FLOOR);
    x += x < bx ? 1 : -1;
  }
  while (y !== by) {
    grid.setCell(x, y, CellType.FLOOR);
    y += y < by ? 1 : -1;
  }
}