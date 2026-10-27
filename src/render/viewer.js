// src/render/viewer.js — Asset viewer (`?viewer=1`)
// Exports: AssetViewer
// Dependencies: three (vendor), scene.js

import * as THREE from 'three';

export class AssetViewer {
  constructor(renderer, sceneManager, camera) {
    this.renderer = renderer;
    this.sceneManager = sceneManager;
    this.camera = camera;
    this.enabled = false;

    this.viewerScene = new THREE.Scene();
    this.viewerCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.viewerCamera.position.set(0, 2, 5);

    this.controls = null;
    this.currentCategory = 'textures';
    this.currentIndex = 0;
    this.items = {
      textures: [],
      props: [],
      enemies: [],
      sprites: [],
    };
    this.rotationSpeed = 0.3;
    this.autoRotate = true;

    this.init();
  }

  init() {
    // Lighting for viewer
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.viewerScene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    this.viewerScene.add(dirLight);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.viewerScene.add(ground);

    // Fog
    this.viewerScene.fog = new THREE.FogExp2(0x1a1a2e, 0.02);

    // Load asset manifest
    this.loadManifest();
  }

  async loadManifest() {
    try {
      const response = await fetch('assets/manifest.json');
      const manifest = await response.json();
      this.manifest = manifest;
      this.categorizeAssets(manifest);
    } catch (e) {
      console.warn('Could not load manifest:', e);
    }
  }

  categorizeAssets(manifest) {
    for (const tex of manifest.textures || []) {
      if (tex.name.startsWith('clutter_') || tex.name.startsWith('fog_') || tex.name.startsWith('dust_') || tex.name.startsWith('drip') || tex.name.startsWith('spark') || tex.name.startsWith('moth')) {
        this.items.sprites.push(tex);
      } else if (tex.name.includes('nightmare') || tex.name.includes('blood') || tex.name.includes('flesh') || tex.name.includes('vein') || tex.name.includes('static')) {
        this.items.enemies.push(tex); // Nightmare textures under enemies for now
      } else if (tex.name.includes('crack') || tex.name.includes('scratch') || tex.name.includes('stain') || tex.name.includes('mould') || tex.name.includes('scorch') || tex.name.includes('footprint') || tex.name.includes('symbol') || tex.name.includes('scrawl') || tex.name.includes('blood_') || tex.name.includes('bullet_')) {
        this.items.sprites.push(tex);
      } else {
        this.items.textures.push(tex);
      }
    }

    // Props from registry (would be loaded from props.js)
    this.items.props = [
      { name: 'sofa', type: 'furniture' },
      { name: 'bed', type: 'furniture' },
      { name: 'wardrobe', type: 'furniture' },
      { name: 'desk', type: 'furniture' },
      { name: 'chair', type: 'furniture' },
      { name: 'table', type: 'furniture' },
      { name: 'crate', type: 'industrial' },
      { name: 'barrel', type: 'industrial' },
      { name: 'pallet', type: 'industrial' },
      { name: 'pipe', type: 'industrial' },
      { name: 'machine', type: 'industrial' },
      { name: 'car', type: 'outdoor' },
      { name: 'lamp', type: 'lighting' },
      { name: 'vending', type: 'outdoor' },
    ];
  }

  enable() {
    this.enabled = true;
    this.renderer.getThreeRenderer().setRenderTarget(null);
    this.showCurrent();
    this.createUI();
  }

  disable() {
    this.enabled = false;
    this.clearViewer();
    this.removeUI();
  }

  createUI() {
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'viewer-ui';
    this.uiContainer.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.95); color: #ccc;
      font: 14px 'Courier New', monospace; z-index: 1000;
      display: flex; flex-direction: column;
    `;
    this.uiContainer.innerHTML = `
      <div style="padding: 20px; border-bottom: 1px solid #333; display: flex; gap: 16px; flex-wrap: wrap; align-items: center;">
        <h2 style="margin: 0; color: #8b0000;">ASSET VIEWER</h2>
        <div style="display: flex; gap: 8px;">
          <button data-cat="textures" class="cat-btn active">Textures</button>
          <button data-cat="props" class="cat-btn">Props</button>
          <button data-cat="enemies" class="cat-btn">Enemies</button>
          <button data-cat="sprites" class="cat-btn">Sprites</button>
        </div>
        <div style="margin-left: auto; display: flex; gap: 16px; align-items: center;">
          <label><input type="checkbox" id="viewer-autorotate" checked> Auto-rotate</label>
          <label><input type="checkbox" id="viewer-wireframe"> Wireframe</label>
          <label><input type="checkbox" id="viewer-nightmare"> Nightmare mode</label>
        </div>
      </div>
      <div id="viewer-grid" style="flex: 1; overflow-y: auto; padding: 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;"></div>
      <div style="padding: 20px; border-top: 1px solid #333; text-align: center;">
        <button id="viewer-close">Close Viewer (Esc)</button>
        <span style="margin-left: 20px;">[←/→] Prev/Next  [Space] Toggle Rotate  [W] Wireframe  [N] Nightmare</span>
      </div>
    `;
    document.body.appendChild(this.uiContainer);

    // Event listeners
    this.uiContainer.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setCategory(btn.dataset.cat));
    });
    this.uiContainer.querySelector('#viewer-autorotate').addEventListener('change', (e) => this.autoRotate = e.target.checked);
    this.uiContainer.querySelector('#viewer-wireframe').addEventListener('change', (e) => this.toggleWireframe(e.target.checked));
    this.uiContainer.querySelector('#viewer-nightmare').addEventListener('change', (e) => this.toggleNightmareMode(e.target.checked));
    this.uiContainer.querySelector('#viewer-close').addEventListener('click', () => this.disable());

    this.populateGrid();
  }

  removeUI() {
    if (this.uiContainer) {
      this.uiContainer.remove();
      this.uiContainer = null;
    }
  }

  setCategory(cat) {
    this.currentCategory = cat;
    this.currentIndex = 0;
    this.uiContainer.querySelectorAll('.cat-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    this.populateGrid();
    this.showCurrent();
  }

  populateGrid() {
    const grid = this.uiContainer.querySelector('#viewer-grid');
    const items = this.items[this.currentCategory] || [];
    grid.innerHTML = '';

    items.forEach((item, i) => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: rgba(255,255,255,0.02); border: 1px solid #333;
        border-radius: 4px; padding: 12px; text-align: center;
        cursor: pointer; transition: all 0.1s;
      `;
      card.innerHTML = `
        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">${this.currentCategory.toUpperCase()}</div>
        <div style="font-weight: bold; word-break: break-all;">${item.name}</div>
        <div style="font-size: 10px; color: #666; margin-top: 4px;">${item.size ? (item.size/1024).toFixed(1)+' KB' : ''}</div>
      `;
      card.addEventListener('click', () => { this.currentIndex = i; this.showCurrent(); });
      card.addEventListener('mouseenter', () => card.style.borderColor = '#8b0000');
      card.addEventListener('mouseleave', () => card.style.borderColor = '#333');
      grid.appendChild(card);
    });

    // Highlight current
    const cards = grid.querySelectorAll('div');
    if (cards[this.currentIndex]) {
      cards[this.currentIndex].style.borderColor = '#8b0000';
      cards[this.currentIndex].style.background = 'rgba(139,0,0,0.1)';
    }
  }

  showCurrent() {
    this.clearViewer();
    const items = this.items[this.currentCategory] || [];
    if (items.length === 0) return;

    const item = items[this.currentIndex];
    if (this.currentCategory === 'textures') {
      this.showTexture(item);
    } else if (this.currentCategory === 'props') {
      this.showProp(item);
    } else if (this.currentCategory === 'enemies') {
      this.showEnemy(item);
    } else if (this.currentCategory === 'sprites') {
      this.showSprite(item);
    }
  }

  showTexture(item) {
    // Create a plane with the texture
    const loader = new THREE.TextureLoader();
    loader.load(item.path, (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);

      const geo = new THREE.PlaneGeometry(4, 4);
      const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.01;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.viewerScene.add(mesh);
      this.currentMesh = mesh;

      // Also show a 3D sphere for normal preview
      const sphereGeo = new THREE.SphereGeometry(1.5, 32, 32);
      const sphereMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.1 });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(0, 1.5, 3);
      sphere.castShadow = true;
      this.viewerScene.add(sphere);
      this.currentSphere = sphere;
    });
  }

  showProp(item) {
    // Create a placeholder prop mesh based on type
    const geo = new THREE.BoxGeometry(1, 2, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1;
    mesh.castShadow = true;
    this.viewerScene.add(mesh);
    this.currentMesh = mesh;
  }

  showEnemy(item) {
    // Show nightmare texture on a distorted sphere
    const loader = new THREE.TextureLoader();
    loader.load(item.path, (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;

      const geo = new THREE.SphereGeometry(1.5, 64, 64);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.9,
        metalness: 0.3,
        vertexColors: true,
      });
      // Add vertex colors for variation
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        colors[i * 3] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 1] = 0.1 + Math.random() * 0.1;
        colors[i * 3 + 2] = 0.1 + Math.random() * 0.1;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 1.5;
      mesh.castShadow = true;
      this.viewerScene.add(mesh);
      this.currentMesh = mesh;
    });
  }

  showSprite(item) {
    // Show sprite as a plane facing camera
    const loader = new THREE.TextureLoader();
    loader.load(item.path, (tex) => {
      const geo = new THREE.PlaneGeometry(2, 2);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 1;
      this.viewerScene.add(mesh);
      this.currentMesh = mesh;
    });
  }

  clearViewer() {
    if (this.currentMesh) {
      this.viewerScene.remove(this.currentMesh);
      if (this.currentMesh.geometry) this.currentMesh.geometry.dispose();
      if (this.currentMesh.material) {
        if (Array.isArray(this.currentMesh.material)) this.currentMesh.material.forEach(m => m.dispose());
        else this.currentMesh.material.dispose();
      }
      this.currentMesh = null;
    }
    if (this.currentSphere) {
      this.viewerScene.remove(this.currentSphere);
      if (this.currentSphere.geometry) this.currentSphere.geometry.dispose();
      if (this.currentSphere.material) {
        if (Array.isArray(this.currentSphere.material)) this.currentSphere.material.forEach(m => m.dispose());
        else this.currentSphere.material.dispose();
      }
      this.currentSphere = null;
    }
  }

  toggleWireframe(enabled) {
    this.viewerScene.traverse(obj => {
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.wireframe = enabled);
        } else {
          obj.material.wireframe = enabled;
        }
      }
    });
  }

  toggleNightmareMode(enabled) {
    if (enabled) {
      this.viewerScene.fog = new THREE.FogExp2(0x4a0000, 0.035);
      this.renderer.getThreeRenderer().setClearColor(0x4a0000);
    } else {
      this.viewerScene.fog = new THREE.FogExp2(0x1a1a2e, 0.02);
      this.renderer.getThreeRenderer().setClearColor(0x1a1a2e);
    }
  }

  update(dt, input) {
    if (!this.enabled) return;

    // Handle input
    if (input.isPressed('moveLeft')) this.prevItem();
    if (input.isPressed('moveRight')) this.nextItem();
    if (input.isPressed('dodge')) this.autoRotate = !this.autoRotate; // Space toggles
    if (input.isPressed('torch')) this.toggleWireframe(!this.uiContainer.querySelector('#viewer-wireframe').checked);
    if (input.isPressed('map')) this.toggleNightmareMode(!this.uiContainer.querySelector('#viewer-nightmare').checked);

    // Auto-rotate
    if (this.autoRotate && this.currentMesh) {
      this.currentMesh.rotation.y += this.rotationSpeed * dt;
    }
    if (this.autoRotate && this.currentSphere) {
      this.currentSphere.rotation.y += this.rotationSpeed * dt * 0.5;
    }

    // Render viewer scene
    this.renderer.getThreeRenderer().render(this.viewerScene, this.viewerCamera);
  }

  prevItem() {
    const items = this.items[this.currentCategory] || [];
    if (items.length > 0) {
      this.currentIndex = (this.currentIndex - 1 + items.length) % items.length;
      this.showCurrent();
      this.populateGrid();
    }
  }

  nextItem() {
    const items = this.items[this.currentCategory] || [];
    if (items.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % items.length;
      this.showCurrent();
      this.populateGrid();
    }
  }

  handleResize() {
    this.viewerCamera.aspect = window.innerWidth / window.innerHeight;
    this.viewerCamera.updateProjectionMatrix();
  }
}