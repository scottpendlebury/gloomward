// src/render/player.js — Player mesh, procedural animation, IK
// Exports: PlayerRenderer, PlayerAnimationState
// Dependencies: three (vendor)

import * as THREE from 'three';

export class PlayerRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.bones = {};
    this.mixers = [];
    this.clock = new THREE.Clock();

    // Animation state
    this.state = {
      current: 'idle',
      previous: 'idle',
      speed: 0,
      aim: false,
      hurt: 0,
      stomp: 0,
      interact: 0,
      dodge: 0,
      time: 0,
    };

    // IK targets
    this.ikTargets = {
      leftFoot: new THREE.Vector3(),
      rightFoot: new THREE.Vector3(),
      leftHand: new THREE.Vector3(),
      rightHand: new THREE.Vector3(),
    };

    this.createPlayerMesh();
  }

  createPlayerMesh() {
    const group = new THREE.Group();

    // Body parts (low poly, ~1500 tris total)
    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.8,
      metalness: 0.1,
      vertexColors: true,
    });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.6, 0.7, 0.3);
    this.addVertexColors(torsoGeo, 0x8b7355);
    this.bones.torso = new THREE.Mesh(torsoGeo, material);
    this.bones.torso.position.y = 1.0;
    this.bones.torso.castShadow = true;
    group.add(this.bones.torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    this.addVertexColors(headGeo, 0xdeb887);
    this.bones.head = new THREE.Mesh(headGeo, material);
    this.bones.head.position.y = 1.55;
    this.bones.head.castShadow = true;
    group.add(this.bones.head);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    this.addVertexColors(armGeo, 0xdeb887);

    this.bones.leftArm = new THREE.Mesh(armGeo, material);
    this.bones.leftArm.position.set(-0.4, 1.2, 0);
    this.bones.leftArm.castShadow = true;
    group.add(this.bones.leftArm);

    this.bones.rightArm = new THREE.Mesh(armGeo, material);
    this.bones.rightArm.position.set(0.4, 1.2, 0);
    this.bones.rightArm.castShadow = true;
    group.add(this.bones.rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    this.addVertexColors(legGeo, 0x4a4035);

    this.bones.leftLeg = new THREE.Mesh(legGeo, material);
    this.bones.leftLeg.position.set(-0.15, 0.35, 0);
    this.bones.leftLeg.castShadow = true;
    group.add(this.bones.leftLeg);

    this.bones.rightLeg = new THREE.Mesh(legGeo, material);
    this.bones.rightLeg.position.set(0.15, 0.35, 0);
    this.bones.rightLeg.castShadow = true;
    group.add(this.bones.rightLeg);

    // Torch (attached to right hand)
    this.torchLight = new THREE.SpotLight(0xffeedd, 30, 15, Math.PI / 5, 0.3, 1);
    this.torchLight.castShadow = true;
    this.torchLight.shadow.mapSize.set(256, 256);
    this.bones.rightArm.add(this.torchLight);
    this.torchLight.position.set(0, -0.5, 0.2);
    this.torchLight.target.position.set(0, -1, 0.5);
    this.bones.rightArm.add(this.torchLight.target);
    this.torchLight.visible = false;

    // Radio (attached to left hip)
    this.radioMesh = this.createRadioMesh();
    this.bones.torso.add(this.radioMesh);
    this.radioMesh.position.set(-0.4, -0.2, 0.25);

    this.mesh = group;
    this.scene.add(this.mesh);

    // Dust particles in torch beam
    this.createTorchDust();
  }

  addVertexColors(geometry, baseColor) {
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color(baseColor);

    // Add subtle variation per vertex
    for (let i = 0; i < positions.count; i++) {
      const variation = (Math.random() - 0.5) * 0.1;
      const c = color.clone().offsetHSL(0, 0, variation);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  createRadioMesh() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(0.15, 0.1, 0.08);
    const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
    const body = new THREE.Mesh(bodyGeo, mat);
    group.add(body);

    // Speaker grill
    const grillGeo = new THREE.PlaneGeometry(0.1, 0.06);
    const grillMat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
    const grill = new THREE.Mesh(grillGeo, grillMat);
    grill.position.z = 0.045;
    group.add(grill);

    // Knob
    const knobGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.02, 6);
    const knob = new THREE.Mesh(knobGeo, mat);
    knob.position.set(0.07, 0, 0.05);
    knob.rotation.x = Math.PI / 2;
    group.add(knob);

    return group;
  }

  createTorchDust() {
    const count = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const lifetimes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      sizes[i] = 0.02 + Math.random() * 0.03;
      alphas[i] = 0;
      lifetimes[i] = Math.random() * 2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));

    const material = new THREE.PointsMaterial({
      color: 0xffeedd,
      size: 1,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      vertexColors: false,
      sizeAttenuation: true,
    });

    this.torchDust = new THREE.Points(geometry, material);
    this.bones.rightArm.add(this.torchDust);
  }

  update(dt, input, entity) {
    this.state.time += dt;

    // Update animation state from input/entity
    this.updateAnimationState(input, entity);

    // Run procedural animation
    this.animate(dt);

    // Update torch
    this.updateTorch(entity);

    // Update torch dust
    this.updateTorchDust(dt);

    // Update radio static visual
    this.updateRadio(entity);
  }

  updateAnimationState(input, entity) {
    const control = entity?.components?.PlayerControl;
    const velocity = entity?.components?.Velocity;
    const health = entity?.components?.Health;
    const stamina = entity?.components?.Stamina;

    this.state.speed = velocity ? Math.hypot(velocity.vx, velocity.vz) : 0;
    this.state.aim = control?.aim || false;
    this.state.hurt = health && health.iframe > 0 ? health.iframe : 0;

    // Determine base state
    if (this.state.hurt > 0) {
      this.state.current = 'hurt';
    } else if (this.state.dodge > 0) {
      this.state.current = 'dodge';
    } else if (this.state.stomp > 0) {
      this.state.current = 'stomp';
    } else if (this.state.interact > 0) {
      this.state.current = 'interact';
    } else if (this.state.speed > 3) {
      this.state.current = 'run';
    } else if (this.state.speed > 0.5) {
      this.state.current = 'walk';
    } else {
      this.state.current = 'idle';
    }

    // Handle transitions
    if (this.state.current !== this.state.previous) {
      this.state.previous = this.state.current;
    }
  }

  animate(dt) {
    const t = this.state.time;
    const speed = this.state.speed;
    const aim = this.state.aim;

    // Breathing idle
    const breathe = Math.sin(t * 2) * 0.02;
    this.bones.torso.position.y = 1.0 + breathe;
    this.bones.head.position.y = 1.55 + breathe * 0.5;

    // Head look
    if (aim) {
      this.bones.head.rotation.y = THREE.MathUtils.lerp(this.bones.head.rotation.y, 0, 10 * dt);
      this.bones.head.rotation.x = THREE.MathUtils.lerp(this.bones.head.rotation.x, -0.1, 10 * dt);
    } else {
      this.bones.head.rotation.y = THREE.MathUtils.lerp(this.bones.head.rotation.y, Math.sin(t * 0.7) * 0.15, 3 * dt);
      this.bones.head.rotation.x = THREE.MathUtils.lerp(this.bones.head.rotation.x, Math.sin(t * 0.5) * 0.05, 3 * dt);
    }

    // Torso lean when moving
    const lean = Math.min(speed / 5, 0.2);
    this.bones.torso.rotation.x = THREE.MathUtils.lerp(this.bones.torso.rotation.x, -lean, 5 * dt);

    // Arm animations
    if (this.state.current === 'walk' || this.state.current === 'run') {
      const cycle = t * (this.state.current === 'run' ? 8 : 5);
      const swing = Math.sin(cycle) * (this.state.current === 'run' ? 0.8 : 0.5);

      // Left arm opposite to right leg
      this.bones.leftArm.rotation.x = THREE.MathUtils.lerp(this.bones.leftArm.rotation.x, swing * (aim ? 0.3 : 1), 10 * dt);
      this.bones.leftArm.rotation.z = THREE.MathUtils.lerp(this.bones.leftArm.rotation.z, 0, 10 * dt);

      // Right arm (holding torch/weapon)
      if (aim) {
        this.bones.rightArm.rotation.x = THREE.MathUtils.lerp(this.bones.rightArm.rotation.x, -0.5, 10 * dt);
        this.bones.rightArm.rotation.z = THREE.MathUtils.lerp(this.bones.rightArm.rotation.z, 0.1, 10 * dt);
      } else {
        this.bones.rightArm.rotation.x = THREE.MathUtils.lerp(this.bones.rightArm.rotation.x, -swing, 10 * dt);
        this.bones.rightArm.rotation.z = THREE.MathUtils.lerp(this.bones.rightArm.rotation.z, 0, 10 * dt);
      }

      // Elbow bend
      this.bones.leftArm.rotation.y = Math.sin(cycle) * 0.2;
      this.bones.rightArm.rotation.y = -Math.sin(cycle) * 0.2;
    } else if (aim) {
      // Aim pose
      this.bones.rightArm.rotation.x = THREE.MathUtils.lerp(this.bones.rightArm.rotation.x, -0.6, 10 * dt);
      this.bones.rightArm.rotation.z = THREE.MathUtils.lerp(this.bones.rightArm.rotation.z, 0.15, 10 * dt);
      this.bones.leftArm.rotation.x = THREE.MathUtils.lerp(this.bones.leftArm.rotation.x, -0.3, 10 * dt);
      this.bones.leftArm.rotation.z = THREE.MathUtils.lerp(this.bones.leftArm.rotation.z, -0.2, 10 * dt);
    } else {
      // Idle arms
      this.bones.leftArm.rotation.x = THREE.MathUtils.lerp(this.bones.leftArm.rotation.x, breathe * 2, 3 * dt);
      this.bones.leftArm.rotation.z = THREE.MathUtils.lerp(this.bones.leftArm.rotation.z, 0.1, 3 * dt);
      this.bones.rightArm.rotation.x = THREE.MathUtils.lerp(this.bones.rightArm.rotation.x, breathe * 2, 3 * dt);
      this.bones.rightArm.rotation.z = THREE.MathUtils.lerp(this.bones.rightArm.rotation.z, -0.1, 3 * dt);
    }

    // Leg animations
    if (this.state.current === 'walk' || this.state.current === 'run') {
      const cycle = t * (this.state.current === 'run' ? 8 : 5);
      const stride = this.state.current === 'run' ? 0.9 : 0.6;

      this.bones.leftLeg.rotation.x = THREE.MathUtils.lerp(this.bones.leftLeg.rotation.x, Math.sin(cycle) * stride, 10 * dt);
      this.bones.rightLeg.rotation.x = THREE.MathUtils.lerp(this.bones.rightLeg.rotation.x, -Math.sin(cycle) * stride, 10 * dt);

      // Knee bend
      this.bones.leftLeg.rotation.z = Math.max(0, Math.sin(cycle)) * 0.3;
      this.bones.rightLeg.rotation.z = Math.max(0, -Math.sin(cycle)) * 0.3;
    } else {
      this.bones.leftLeg.rotation.x = THREE.MathUtils.lerp(this.bones.leftLeg.rotation.x, 0, 5 * dt);
      this.bones.rightLeg.rotation.x = THREE.MathUtils.lerp(this.bones.rightLeg.rotation.x, 0, 5 * dt);
      this.bones.leftLeg.rotation.z = THREE.MathUtils.lerp(this.bones.leftLeg.rotation.z, 0, 5 * dt);
      this.bones.rightLeg.rotation.z = THREE.MathUtils.lerp(this.bones.rightLeg.rotation.z, 0, 5 * dt);
    }

    // Special states
    if (this.state.hurt > 0) {
      this.bones.torso.rotation.z = Math.sin(t * 20) * 0.1;
      this.bones.head.rotation.z = Math.sin(t * 20 + 1) * 0.1;
    } else {
      this.bones.torso.rotation.z = THREE.MathUtils.lerp(this.bones.torso.rotation.z, 0, 5 * dt);
      this.bones.head.rotation.z = THREE.MathUtils.lerp(this.bones.head.rotation.z, 0, 5 * dt);
    }

    if (this.state.dodge > 0) {
      this.state.dodge -= dt;
      const dodgeProgress = 1 - this.state.dodge / 0.5;
      this.bones.torso.rotation.x = -Math.sin(dodgeProgress * Math.PI) * 0.8;
      this.bones.torso.position.y = 1.0 - Math.sin(dodgeProgress * Math.PI) * 0.3;
    }

    if (this.state.stomp > 0) {
      this.state.stomp -= dt;
      const stompProgress = 1 - this.state.stomp / 0.4;
      this.bones.rightLeg.rotation.x = -Math.sin(stompProgress * Math.PI) * 1.2;
    }

    if (this.state.interact > 0) {
      this.state.interact -= dt;
      this.bones.rightArm.rotation.x = THREE.MathUtils.lerp(this.bones.rightArm.rotation.x, -1.2, 10 * dt);
      this.bones.rightArm.rotation.z = THREE.MathUtils.lerp(this.bones.rightArm.rotation.z, 0.3, 10 * dt);
    }

    // Foot IK (simple raycast would be better but this is procedural)
    this.updateFootIK();
  }

  updateFootIK() {
    // Simple procedural foot placement
    const leftPhase = Math.sin(this.state.time * 8);
    const rightPhase = -leftPhase;

    this.bones.leftLeg.position.y = 0.35 + Math.max(0, leftPhase) * 0.15;
    this.bones.rightLeg.position.y = 0.35 + Math.max(0, rightPhase) * 0.15;
  }

  updateTorch(entity) {
    const torch = entity?.components?.Torch;
    if (torch) {
      this.torchLight.visible = torch.on && torch.battery > 0;
      if (this.torchLight.visible) {
        // Flicker
        const flicker = torch.flicker > 0 ? 0.8 + Math.random() * 0.4 : 1.0;
        this.torchLight.intensity = 30 * flicker * (torch.battery / torch.max);
        this.torchLight.distance = 15 * (torch.battery / torch.max);
      }
    }
  }

  updateTorchDust(dt) {
    if (!this.torchLight.visible) return;

    const positions = this.torchDust.geometry.attributes.position.array;
    const alphas = this.torchDust.geometry.attributes.alpha.array;
    const lifetimes = this.torchDust.geometry.attributes.lifetime.array;
    const sizes = this.torchDust.geometry.attributes.size.array;

    for (let i = 0; i < positions.length / 3; i++) {
      lifetimes[i] -= dt;
      if (lifetimes[i] <= 0) {
        // Respawn at torch tip
        positions[i * 3] = (Math.random() - 0.5) * 0.1;
        positions[i * 3 + 1] = -0.3 + Math.random() * 0.2;
        positions[i * 3 + 2] = 0.2 + Math.random() * 0.3;
        lifetimes[i] = 0.5 + Math.random() * 1.5;
        alphas[i] = 0.5 + Math.random() * 0.3;
        sizes[i] = 0.02 + Math.random() * 0.03;
      } else {
        // Move forward and down
        positions[i * 3 + 1] -= dt * 0.5;
        positions[i * 3 + 2] -= dt * 2;
        alphas[i] = Math.max(0, alphas[i] - dt * 0.5);
        sizes[i] += dt * 0.01;
      }
    }

    this.torchDust.geometry.attributes.position.needsUpdate = true;
    this.torchDust.geometry.attributes.alpha.needsUpdate = true;
    this.torchDust.geometry.attributes.lifetime.needsUpdate = true;
    this.torchDust.geometry.attributes.size.needsUpdate = true;
  }

  updateRadio(entity) {
    const radio = entity?.components?.Radio;
    if (radio && this.radioMesh) {
      // Subtle knob movement based on static
      const knob = this.radioMesh.children[2];
      if (knob) {
        knob.rotation.z = radio.staticLevel * 0.5 + Math.sin(this.state.time * 10) * radio.staticLevel * 0.1;
      }
    }
  }

  triggerStomp() {
    this.state.stomp = 0.4;
  }

  triggerDodge() {
    this.state.dodge = 0.5;
  }

  triggerInteract() {
    this.state.interact = 0.6;
  }

  triggerHurt() {
    this.state.hurt = 0.3;
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  setRotation(y) {
    this.mesh.rotation.y = y;
  }

  getMesh() {
    return this.mesh;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    if (this.torchDust) {
      this.torchDust.geometry.dispose();
      this.torchDust.material.dispose();
    }
  }
}

export const PlayerAnimationState = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
  AIM: 'aim',
  HURT: 'hurt',
  DODGE: 'dodge',
  STOMP: 'stomp',
  INTERACT: 'interact',
  DEATH: 'death',
};