// src/sim/grid.js — Grid world model (collision, LOS, pathfinding)
// Exports: GridWorld, CellType, Direction
// Dependencies: none

export const CellType = {
  EMPTY: 0,
  WALL: 1,
  FLOOR: 2,
  DOOR_CLOSED: 3,
  DOOR_OPEN: 4,
  DOOR_LOCKED: 5,
  PROP: 6,
  STAIRS_UP: 7,
  STAIRS_DOWN: 8,
  HOLE: 9,
};

export const Direction = {
  N: 0, NE: 1, E: 2, SE: 3, S: 4, SW: 5, W: 6, NW: 7,
  dx: [0, 1, 1, 1, 0, -1, -1, -1],
  dy: [-1, -1, 0, 1, 1, 1, 0, -1],
};

export class GridWorld {
  constructor(width, height, cellSize = 1.5) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cells = new Uint8Array(width * height);
    this.props = new Map(); // (x,y) -> { type, data }
    this.doorStates = new Map(); // (x,y) -> { locked, keyId, open }
  }

  idx(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getCell(x, y) {
    if (!this.inBounds(x, y)) return CellType.WALL;
    return this.cells[this.idx(x, y)];
  }

  setCell(x, y, type) {
    if (!this.inBounds(x, y)) return false;
    this.cells[this.idx(x, y)] = type;
    return true;
  }

  isWalkable(x, y) {
    const t = this.getCell(x, y);
    return t === CellType.FLOOR || t === CellType.DOOR_OPEN || t === CellType.STAIRS_UP || t === CellType.STAIRS_DOWN;
  }

  isOpaque(x, y) {
    const t = this.getCell(x, y);
    return t === CellType.WALL || t === CellType.DOOR_CLOSED || t === CellType.DOOR_LOCKED;
  }

  setProp(x, y, prop) {
    this.props.set(`${x},${y}`, prop);
  }

  getProp(x, y) {
    return this.props.get(`${x},${y}`);
  }

  hasProp(x, y) {
    return this.props.has(`${x},${y}`);
  }

  setDoor(x, y, locked = false, keyId = null) {
    this.doorStates.set(`${x},${y}`, { locked, keyId, open: false });
    this.setCell(x, y, locked ? CellType.DOOR_LOCKED : CellType.DOOR_CLOSED);
  }

  getDoor(x, y) {
    return this.doorStates.get(`${x},${y}`);
  }

  openDoor(x, y) {
    const door = this.doorStates.get(`${x},${y}`);
    if (door) {
      door.open = true;
      this.setCell(x, y, CellType.DOOR_OPEN);
    }
  }

  lockDoor(x, y, keyId) {
    const door = this.doorStates.get(`${x},${y}`);
    if (door) {
      door.locked = true;
      door.keyId = keyId;
      this.setCell(x, y, CellType.DOOR_LOCKED);
    }
  }

  unlockDoor(x, y) {
    const door = this.doorStates.get(`${x},${y}`);
    if (door) {
      door.locked = false;
      door.keyId = null;
      this.setCell(x, y, CellType.DOOR_CLOSED);
    }
  }

  // Bresenham line-of-sight
  raycast(x0, y0, x1, y1, maxDist = 100) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let dist = 0;

    while (true) {
      if (dist > maxDist) return { hit: false, x: x1, y: y1, dist };
      if (this.isOpaque(x0, y0)) return { hit: true, x: x0, y: y0, dist, opaque: true };
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      dist++;
    }
    return { hit: false, x: x1, y: y1, dist };
  }

  // A* pathfinding on grid
  findPath(sx, sy, gx, gy, maxSteps = 10000) {
    if (!this.isWalkable(sx, sy) || !this.isWalkable(gx, gy)) return null;

    const open = new MinHeap((a, b) => a.f - b.f);
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    const closed = new Set();

    const startKey = `${sx},${sy}`;
    const goalKey = `${gx},${gy}`;

    gScore.set(startKey, 0);
    fScore.set(startKey, this.heuristic(sx, sy, gx, gy));
    open.push({ x: sx, y: sy, f: fScore.get(startKey) });

    let steps = 0;
    while (!open.empty() && steps < maxSteps) {
      const current = open.pop();
      const currentKey = `${current.x},${current.y}`;

      if (currentKey === goalKey) {
        return this.reconstructPath(cameFrom, currentKey);
      }

      if (closed.has(currentKey)) continue;
      closed.add(currentKey);

      for (let dir = 0; dir < 8; dir++) {
        const nx = current.x + Direction.dx[dir];
        const ny = current.y + Direction.dy[dir];
        const neighborKey = `${nx},${ny}`;

        if (!this.isWalkable(nx, ny)) continue;
        if (closed.has(neighborKey)) continue;

        const moveCost = (dir % 2 === 0) ? 1 : 1.414; // cardinal vs diagonal
        const tentativeG = gScore.get(currentKey) + moveCost;

        if (tentativeG < (gScore.get(neighborKey) || Infinity)) {
          cameFrom.set(neighborKey, currentKey);
          gScore.set(neighborKey, tentativeG);
          fScore.set(neighborKey, tentativeG + this.heuristic(nx, ny, gx, gy));
          open.push({ x: nx, y: ny, f: fScore.get(neighborKey) });
        }
      }
      steps++;
    }
    return null;
  }

  heuristic(x, y, gx, gy) {
    const dx = Math.abs(gx - x);
    const dy = Math.abs(gy - y);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); // Octile distance
  }

  reconstructPath(cameFrom, currentKey) {
    const path = [currentKey];
    let iterations = 0;
    const maxIterations = 10000;
    while (cameFrom.has(currentKey) && iterations < maxIterations) {
      currentKey = cameFrom.get(currentKey);
      path.push(currentKey);
      iterations++;
    }
    if (iterations >= maxIterations) {
      console.warn('reconstructPath: max iterations reached, possible cycle in cameFrom');
    }
    return path.reverse().map(k => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
  }

  // Flood fill for reachability
  floodFill(sx, sy, maxCells = 10000) {
    const visited = new Set();
    const queue = [{ x: sx, y: sy }];
    visited.add(`${sx},${sy}`);

    while (queue.length > 0 && visited.size < maxCells) {
      const { x, y } = queue.shift();
      for (let dir = 0; dir < 4; dir++) { // 4-connected for flood fill
        const nx = x + Direction.dx[dir * 2];
        const ny = y + Direction.dy[dir * 2];
        const key = `${nx},${ny}`;
        if (this.isWalkable(nx, ny) && !visited.has(key)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return visited;
  }

  // Get all walkable cells
  getWalkableCells() {
    const cells = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.isWalkable(x, y)) cells.push({ x, y });
      }
    }
    return cells;
  }

  // Serialization for saves
  toJSON() {
    return {
      width: this.width,
      height: this.height,
      cellSize: this.cellSize,
      cells: Array.from(this.cells),
      props: Array.from(this.props.entries()),
      doorStates: Array.from(this.doorStates.entries()),
    };
  }

  static fromJSON(data) {
    const grid = new GridWorld(data.width, data.height, data.cellSize);
    grid.cells = new Uint8Array(data.cells);
    grid.props = new Map(data.props);
    grid.doorStates = new Map(data.doorStates);
    return grid;
  }
}

class MinHeap {
  constructor(compare) {
    this.heap = [];
    this.compare = compare;
  }
  push(item) {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }
  pop() {
    const top = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.siftDown(0);
    }
    return top;
  }
  empty() { return this.heap.length === 0; }
  siftUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(this.heap[i], this.heap[p]) >= 0) break;
      [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
      i = p;
    }
  }
  siftDown(i) {
    const n = this.heap.length;
    while (true) {
      let l = (i << 1) + 1;
      let r = l + 1;
      let smallest = i;
      if (l < n && this.compare(this.heap[l], this.heap[smallest]) < 0) smallest = l;
      if (r < n && this.compare(this.heap[r], this.heap[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}