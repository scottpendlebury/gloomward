// src/render/scene.js — Scene graph, chunk meshing, InstancedMesh pools
// Exports: SceneManager, ChunkMesh, PropPool
// Dependencies: three (vendor), grid.js

import * as THREE from 'three';
import { GridWorld, CellType } from '../sim/grid.js';

export class SceneManager {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.threeRenderer = renderer.getThreeRenderer();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.015);

    // Chunk meshing
    this.chunkSize = 16; // Grid cells per chunk
    this.chunks = new Map(); // "cx,cy" -> ChunkMesh
    this.chunkMeshes = new Map(); // "cx,cy" -> THREE.Mesh

    // InstancedMesh pools for props
    this.propPools = new Map(); // propType -> PropPool
    this.maxInstancesPerPool = 500;

    // Decal meshes
    this.decalMeshes = [];

    // Light pool
    this.lightPool = [];
    this.maxPointLights = 6;

    // Fog particles
    this.fogParticles = null;

    // Geometry cache
    this.geometryCache = new Map();
    this.materialCache = new Map();

    this.initLightPool();
  }

  initLightPool() {
    // Torch spotlight (index 0)
    this.torchLight = new THREE.SpotLight(0xffeedd, 40, 20, Math.PI / 4, 0.5, 1);
    this.torchLight.castShadow = true;
    this.torchLight.shadow.mapSize.set(512, 512);
    this.torchLight.shadow.bias = -0.001;
    this.torchLight.shadow.normalBias = 0.02;
    this.scene.add(this.torchLight);
    this.scene.add(this.torchLight.target);

    // Ambient hemisphere light (index 1)
    this.ambientLight = new THREE.HemisphereLight(0x222233, 0x111111, 0.6);
    this.scene.add(this.ambientLight);

    // Point light pool (indices 2-7)
    for (let i = 0; i < this.maxPointLights; i++) {
      const light = new THREE.PointLight(0xffeedd, 1, 8, 2);
      light.castShadow = false;
      light.visible = false;
      this.scene.add(light);
      this.lightPool.push(light);
    }
  }

  // Update torch position
  updateTorch(position, target, enabled = true) {
    if (enabled) {
      this.torchLight.position.copy(position);
      this.torchLight.target.position.copy(target);
      this.torchLight.intensity = 40;
    } else {
      this.torchLight.intensity = 0;
    }
  }

  // Update point lights to nearest sources
  updatePointLights(lightSources, playerPos) {
    // Sort by distance to player
    lightSources.sort((a, b) => {
      const da = a.position.distanceToSquared(playerPos);
      const db = b.position.distanceToSquared(playerPos);
      return da - db;
    });

    for (let i = 0; i < this.maxPointLights; i++) {
      const light = this.lightPool[i];
      if (i < lightSources.length) {
        const src = lightSources[i];
        light.position.copy(src.position);
        light.color.setHex(src.color || 0xffeedd);
        light.intensity = src.intensity || 1;
        light.distance = src.radius || 8;
        light.decay = 2;
        light.visible = true;
      } else {
        light.visible = false;
      }
    }
  }

  // Build/rebuild chunk mesh
  rebuildChunk(grid, cx, cy) {
    const key = `${cx},${cy}`;
    const existing = this.chunkMeshes.get(key);
    if (existing) {
      this.scene.remove(existing);
      existing.geometry.dispose();
      if (existing.material instanceof THREE.Material) {
        existing.material.dispose();
      } else if (Array.isArray(existing.material)) {
        existing.material.forEach(m => m.dispose());
      }
      this.chunkMeshes.delete(key);
      this.chunks.delete(key);
    }

    const chunk = this.buildChunkMesh(grid, cx, cy);
    if (chunk.mesh) {
      this.chunks.set(key, chunk);
      this.chunkMeshes.set(key, chunk.mesh);
      this.scene.add(chunk.mesh);
    }
  }

  buildChunkMesh(grid, cx, cy) {
    const startX = cx * this.chunkSize;
    const startY = cy * this.chunkSize;
    const endX = Math.min(startX + this.chunkSize, grid.width);
    const endY = Math.min(startY + this.chunkSize, grid.height);

    const geometries = new Map(); // materialKey -> BufferGeometry
    const materials = new Map(); // materialKey -> Material

    // Collect vertices per material
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const cell = grid.getCell(x, y);
        if (cell === CellType.WALL || (cell & 0x80)) { // Wall or nightmare wall
          this.addCubeGeometry(geometries, materials, x, y, 0, cell & 0x80, grid, x, y);
        } else if (cell === CellType.FLOOR || (cell & 0x80) === 0x80) { // Floor (including nightmare)
          this.addPlaneGeometry(geometries, materials, x, y, 0, cell & 0x80);
        }
      }
    }

    // Create merged meshes
    const group = new THREE.Group();
    let triangleCount = 0;

    for (const [matKey, geo] of geometries.entries()) {
      const mat = materials.get(matKey);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      group.add(mesh);
      triangleCount += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    }

    return { mesh: group, triangleCount, bounds: { cx, cy } };
  }

  addCubeGeometry(geometries, materials, x, y, z, nightmare, grid, gx, gy) {
    const matKey = nightmare ? 'wall_nightmare' : 'wall_normal';
    let geo = geometries.get(matKey);
    if (!geo) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(0), 2));
      geometries.set(matKey, geo);
      materials.set(matKey, this.getWallMaterial(nightmare));
    }

    const cellSize = grid.cellSize;
    const wx = (gx + 0.5) * cellSize;
    const wy = 1.5; // Wall height
    const wz = (gy + 0.5) * cellSize;

    // Only add visible faces (check neighbors)
    const neighbors = [
      { dx: 0, dy: -1, face: 'front' },   // -Y
      { dx: 1, dy: 0, face: 'right' },    // +X
      { dx: 0, dy: 1, face: 'back' },     // +Y
      { dx: -1, dy: 0, face: 'left' },    // -X
    ];

    for (const n of neighbors) {
      const nx = gx + n.dx;
      const ny = gy + n.dy;
      const neighborCell = grid.getCell(nx, ny);
      const isWall = neighborCell === CellType.WALL || (neighborCell & 0x80);

      if (!isWall) {
        this.addQuad(geo, wx, wy, wz, cellSize, n.face);
      }
    }

    // Top face
    this.addQuad(geo, wx, wy, wz, cellSize, 'top');
  }

  addPlaneGeometry(geometries, materials, x, y, z, nightmare) {
    const matKey = nightmare ? 'floor_nightmare' : 'floor_normal';
    let geo = geometries.get(matKey);
    if (!geo) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(0), 2));
      geometries.set(matKey, geo);
      materials.set(matKey, this.getFloorMaterial(nightmare));
    }

    const cellSize = 1.5;
    const wx = (x + 0.5) * cellSize;
    const wz = (y + 0.5) * cellSize;

    this.addQuad(geo, wx, 0, wz, cellSize, 'top');
  }

  addQuad(geometry, cx, cy, cz, size, face) {
    const pos = geometry.attributes.position;
    const norm = geometry.attributes.normal;
    const uv = geometry.attributes.uv;

    const half = size / 2;
    const index = pos.count / 3;
    const newCount = index + 4;

    // Resize arrays
    const newPos = new Float32Array(newCount * 3);
    const newNorm = new Float32Array(newCount * 3);
    const newUV = new Float32Array(newCount * 2);
    newPos.set(pos.array);
    newNorm.set(norm.array);
    newUV.set(uv.array);

    let vx, vy, vz, nx, ny, nz;
    const uvs = [
      [0, 0], [1, 0], [1, 1], [0, 1]
    ];

    switch (face) {
      case 'front': // -Z
        vx = [-half, half, half, -half];
        vy = [0, 0, cy * 2, cy * 2];
        vz = [-half, -half, -half, -half];
        nx = [0, 0, 0, 0]; ny = [0, 0, 0, 0]; nz = [1, 1, 1, 1];
        break;
      case 'back': // +Z
        vx = [half, -half, -half, half];
        vy = [0, 0, cy * 2, cy * 2];
        vz = [half, half, half, half];
        nx = [0, 0, 0, 0]; ny = [0, 0, 0, 0]; nz = [-1, -1, -1, -1];
        break;
      case 'right': // +X
        vx = [half, half, half, half];
        vy = [0, 0, cy * 2, cy * 2];
        vz = [half, -half, -half, half];
        nx = [-1, -1, -1, -1]; ny = [0, 0, 0, 0]; nz = [0, 0, 0, 0];
        break;
      case 'left': // -X
        vx = [-half, -half, -half, -half];
        vy = [0, 0, cy * 2, cy * 2];
        vz = [-half, half, half, -half];
        nx = [1, 1, 1, 1]; ny = [0, 0, 0, 0]; nz = [0, 0, 0, 0];
        break;
      case 'top':
        vx = [-half, half, half, -half];
        vy = [cy * 2, cy * 2, cy * 2, cy * 2];
        vz = [-half, -half, half, half];
        nx = [0, 0, 0, 0]; ny = [-1, -1, -1, -1]; nz = [0, 0, 0, 0];
        break;
    }

    for (let i = 0; i < 4; i++) {
      const idx = (index + i) * 3;
      newPos[idx] = cx + vx[i];
      newPos[idx + 1] = cy + vy[i];
      newPos[idx + 2] = cz + vz[i];
      newNorm[idx] = nx[i];
      newNorm[idx + 1] = ny[i];
      newNorm[idx + 2] = nz[i];
      newUV[(index + i) * 2] = uvs[i][0];
      newUV[(index + i) * 2 + 1] = uvs[i][1];
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(newNorm, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(newUV, 2));

    // Add indices
    const indices = [index, index + 1, index + 2, index, index + 2, index + 3];
    if (!geometry.index) {
      geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    } else {
      const oldIdx = geometry.index.array;
      const newIdx = new Uint16Array(oldIdx.length + 6);
      newIdx.set(oldIdx);
      newIdx.set(indices, oldIdx.length);
      geometry.setIndex(new THREE.BufferAttribute(newIdx, 1));
    }
  }

  getWallMaterial(nightmare) {
    const cacheKey = `wall_${nightmare ? 'nightmare' : 'normal'}`;
    if (this.materialCache.has(cacheKey)) return this.materialCache.get(cacheKey);

    const mat = new THREE.MeshStandardMaterial({
      color: nightmare ? 0x2a1a1a : 0x333344,
      roughness: 0.9,
      metalness: nightmare ? 0.3 : 0.1,
      vertexColors: false,
    });
    this.materialCache.set(cacheKey, mat);
    return mat;
  }

  getFloorMaterial(nightmare) {
    const cacheKey = `floor_${nightmare ? 'nightmare' : 'normal'}`;
    if (this.materialCache.has(cacheKey)) return this.materialCache.get(cacheKey);

    const mat = new THREE.MeshStandardMaterial({
      color: nightmare ? 0x1a0505 : 0x1a1a2e,
      roughness: 0.95,
      metalness: 0.0,
      vertexColors: false,
    });
    this.materialCache.set(cacheKey, mat);
    return mat;
  }

  // Prop InstancedMesh pools
  getPropPool(propType, geometry, material, maxInstances = 500) {
    let pool = this.propPools.get(propType);
    if (!pool) {
      pool = new PropPool(propType, geometry, material, maxInstances);
      this.propPools.set(propType, pool);
      this.scene.add(pool.mesh);
    }
    return pool;
  }

  placeProp(propType, x, y, z, rotation, scale, variant, grid) {
    const propDef = this.getPropDefinition(propType);
    if (!propDef) return null;

    const geometry = this.getPropGeometry(propType, variant);
    const material = this.getPropMaterial(propType, variant);
    const pool = this.getPropPool(propType, geometry, material);

    const cellSize = grid.cellSize;
    const px = (x + 0.5) * cellSize;
    const pz = (y + 0.5) * cellSize;
    const py = propDef.height / 2;

    const matrix = new THREE.Matrix4();
    matrix.compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
      new THREE.Vector3(scale.x || 1, scale.y || 1, scale.z || 1)
    );

    return pool.addInstance(matrix);
  }

  getPropGeometry(propType, variant) {
    const cacheKey = `prop_${propType}_${variant}`;
    if (this.geometryCache.has(cacheKey)) return this.geometryCache.get(cacheKey);

    const propDef = this.getPropDefinition(propType);
    let geometry;

    if (propDef && propDef.clutter) {
      geometry = new THREE.PlaneGeometry(0.3, 0.3);
    } else {
      const w = propDef?.w || 1;
      const h = propDef?.h || 1;
      const height = propDef?.height || 1;
      geometry = new THREE.BoxGeometry(w, height, h);
    }

    this.geometryCache.set(cacheKey, geometry);
    return geometry;
  }

  getPropMaterial(propType, variant) {
    const cacheKey = `prop_mat_${propType}_${variant}`;
    if (this.materialCache.has(cacheKey)) return this.materialCache.get(cacheKey);

    const propDef = this.getPropDefinition(propType);
    const nightmare = propType.includes('nightmare') || variant.includes('nightmare');

    const mat = new THREE.MeshStandardMaterial({
      color: nightmare ? 0x4a0000 : 0x444455,
      roughness: 0.8,
      metalness: nightmare ? 0.4 : 0.2,
      alphaTest: propDef?.clutter ? 0.5 : 0,
      transparent: propDef?.clutter ? true : false,
    });

    this.materialCache.set(cacheKey, mat);
    return mat;
  }

  getPropDefinition(propType) {
    // Import from props registry
    return {
      w: 1, h: 1, height: 1, variants: ['default'], collider: true,
      clutter: propType.startsWith('clutter_'),
    };
  }

  // Decals
  addDecal(x, y, z, size, rotation, texture, normal) {
    const geometry = new THREE.DecalGeometry(
      new THREE.Mesh(new THREE.BoxGeometry(100, 0.1, 100)),
      new THREE.Vector3(x, y + 0.01, z),
      new THREE.Euler(rotation, 0, 0),
      new THREE.Vector3(size, 0.1, size)
    );
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    this.decalMeshes.push(mesh);
    return mesh;
  }

  // Fog particles
  createFogParticles(count = 500, area = 100) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * area;
      positions[i * 3 + 1] = Math.random() * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * area;
      sizes[i] = 0.1 + Math.random() * 0.2;
      alphas[i] = 0.3 + Math.random() * 0.4;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.PointsMaterial({
      color: 0x444455,
      size: 1,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      vertexColors: false,
    });

    this.fogParticles = new THREE.Points(geometry, material);
    this.scene.add(this.fogParticles);
    return this.fogParticles;
  }

  updateFogParticles(time, playerPos) {
    if (!this.fogParticles) return;
    const positions = this.fogParticles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += Math.sin(time + i) * 0.001;
      positions[i + 2] += Math.cos(time + i) * 0.001;
    }
    this.fogParticles.geometry.attributes.position.needsUpdate = true;
    this.fogParticles.rotation.y += 0.0001;
  }

  // Update visible chunks based on player position
  updateVisibleChunks(grid, playerX, playerY, renderDistance = 3) {
    const cx = Math.floor(playerX / this.chunkSize);
    const cy = Math.floor(playerY / this.chunkSize);

    const needed = new Set();
    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dy = -renderDistance; dy <= renderDistance; dy++) {
        needed.add(`${cx + dx},${cy + dy}`);
      }
    }

    // Build missing chunks
    for (const key of needed) {
      if (!this.chunks.has(key)) {
        const [cx_, cy_] = key.split(',').map(Number);
        this.rebuildChunk(grid, cx_, cy_);
      }
    }

    // Hide far chunks (optional - could dispose instead)
    for (const [key, mesh] of this.chunkMeshes.entries()) {
      if (!needed.has(key)) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
      }
    }
  }

  dispose() {
    // Dispose chunk meshes
    for (const [, mesh] of this.chunkMeshes) {
      mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }

    // Dispose prop pools
    for (const [, pool] of this.propPools) {
      pool.dispose();
    }

    // Dispose decals
    for (const mesh of this.decalMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }

    // Dispose cached geometries/materials
    for (const [, geo] of this.geometryCache) geo.dispose();
    for (const [, mat] of this.materialCache) mat.dispose();

    // Lights
    this.scene.remove(this.torchLight);
    this.scene.remove(this.ambientLight);
    for (const light of this.lightPool) this.scene.remove(light);

    // Fog
    if (this.fogParticles) {
      this.fogParticles.geometry.dispose();
      this.fogParticles.material.dispose();
    }
  }
}

export class PropPool {
  constructor(propType, geometry, material, maxInstances) {
    this.propType = propType;
    this.maxInstances = maxInstances;
    this.instanceCount = 0;

    this.mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;

    this.dummy = new THREE.Object3D();
    this.matrix = new THREE.Matrix4();
  }

  addInstance(matrix) {
    if (this.instanceCount >= this.maxInstances) return -1;
    this.mesh.setMatrixAt(this.instanceCount, matrix);
    this.instanceCount++;
    this.mesh.instanceMatrix.needsUpdate = true;
    return this.instanceCount - 1;
  }

  setInstance(index, matrix) {
    if (index >= 0 && index < this.instanceCount) {
      this.mesh.setMatrixAt(index, matrix);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  removeInstance(index) {
    if (index >= 0 && index < this.instanceCount - 1) {
      // Swap with last
      const lastMatrix = new THREE.Matrix4();
      this.mesh.getMatrixAt(this.instanceCount - 1, lastMatrix);
      this.mesh.setMatrixAt(index, lastMatrix);
    }
    this.instanceCount--;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = this.instanceCount;
  }

  clear() {
    this.instanceCount = 0;
    this.mesh.count = 0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}

export class ChunkMesh {
  constructor(mesh, triangleCount, bounds) {
    this.mesh = mesh;
    this.triangleCount = triangleCount;
    this.bounds = bounds;
  }
}