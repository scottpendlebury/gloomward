// src/render/camera.js — Spring-arm follow, collision, cinematic shots
// Exports: CameraController, CinematicShot
// Dependencies: three (vendor), grid.js

import * as THREE from 'three';
import { GridWorld } from '../sim/grid.js';

export class CameraController {
  constructor(camera, renderer, options = {}) {
    this.camera = camera;
    this.renderer = renderer;
    this.grid = null;

    // Spring arm config
    this.config = {
      distance: 4.0,
      height: 2.0,
      offset: new THREE.Vector3(0, 0, 0),
      stiffness: 15.0,
      damping: 0.85,
      minDistance: 1.5,
      maxDistance: 8.0,
      collisionRadius: 0.3,
      fov: 60,
      minFov: 45,
      maxFov: 75,
      tightSpaceFov: 50,
      tightSpaceThreshold: 2.0,
      ...options,
    };

    // State
    this.targetPosition = new THREE.Vector3();
    this.currentPosition = new THREE.Vector3();
    this.currentTarget = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.3;
    this.targetYaw = 0;
    this.targetPitch = -0.3;
    this.zoom = 1.0;

    // Cinematic shots
    this.cinematicShot = null;
    this.cinematicTimer = 0;
    this.cinematicDuration = 0;
    this.cinematicEase = 0;

    // Shake
    this.shakeIntensity = 0;
    this.shakeTimer = 0;
    this.shakeOffset = new THREE.Vector3();

    // Handheld sway
    this.swayTime = 0;
    this.swayAmount = 0.005;

    // Look behind
    this.lookBehind = false;
    this.lookBehindProgress = 0;

    // Input smoothing
    this.inputSmoothing = 0.1;

    // Tank controls mode
    this.tankControls = false;
  }

  setGrid(grid) {
    this.grid = grid;
  }

  setTarget(entity) {
    this.targetEntity = entity;
    if (entity) {
      this.targetPosition.copy(entity.components.Transform);
      this.targetPosition.y += this.config.height;
    }
  }

  update(dt, input) {
    if (!this.targetEntity) return;

    this.swayTime += dt;

    // Handle look behind
    if (input.lookBehindPressed) {
      this.lookBehind = !this.lookBehind;
    }
    this.lookBehindProgress += (this.lookBehind ? 1 : 0) - this.lookBehindProgress * 10 * dt;

    // Handle cinematic shot
    if (this.cinematicShot) {
      this.updateCinematic(dt);
      return;
    }

    // Update orbit from input
    if (!this.tankControls) {
      this.yaw += input.mouseDeltaX * 0.002;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - input.mouseDeltaY * 0.002,
        -Math.PI / 2.5,
        Math.PI / 4
      );
    }

    // Target position from entity
    const transform = this.targetEntity.components.Transform;
    this.targetPosition.set(transform.x, transform.y + this.config.height, transform.z);

    // Calculate desired camera position
    const lookBehindOffset = this.lookBehind ? Math.PI : 0;
    const desiredOffset = new THREE.Vector3(
      Math.sin(this.yaw + lookBehindOffset) * this.config.distance * this.zoom,
      this.config.height,
      Math.cos(this.yaw + lookBehindOffset) * this.config.distance * this.zoom
    );

    let desiredPosition = this.targetPosition.clone().add(desiredOffset);

    // Collision check against grid
    if (this.grid) {
      desiredPosition = this.resolveCollisions(this.targetPosition, desiredPosition);
    }

    // Spring arm physics
    const toDesired = desiredPosition.clone().sub(this.currentPosition);
    const springForce = toDesired.multiplyScalar(this.config.stiffness);
    this.velocity.add(springForce.clone().multiplyScalar(dt));
    this.velocity.multiplyScalar(Math.pow(this.config.damping, dt * 60));
    this.currentPosition.add(this.velocity.clone().multiplyScalar(dt));

    // Apply handheld sway
    const sway = Math.sin(this.swayTime * 1.5) * this.swayAmount;
    this.currentPosition.x += sway;
    this.currentPosition.z += sway * 0.5;

    // Apply shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity * 0.5,
        (Math.random() - 0.5) * this.shakeIntensity
      );
      this.currentPosition.add(this.shakeOffset);
    }

    // Update camera
    this.camera.position.lerp(this.currentPosition, 1 - Math.pow(0.001, dt));
    this.camera.lookAt(this.targetPosition);

    // Dynamic FOV in tight spaces
    if (this.grid) {
      this.updateDynamicFOV();
    }

    // Update projection matrix
    this.camera.updateProjectionMatrix();
  }

  resolveCollisions(targetPos, desiredPos) {
    const direction = desiredPos.clone().sub(targetPos).normalize();
    const distance = desiredPos.distanceTo(targetPos);
    const steps = Math.ceil(distance / 0.2);

    let testPos = targetPos.clone();
    for (let i = 0; i < steps; i++) {
      testPos.addScaledVector(direction, distance / steps);
      const gx = Math.floor(testPos.x / this.grid.cellSize);
      const gy = Math.floor(testPos.z / this.grid.cellSize);

      if (this.grid.isOpaque(gx, gy)) {
        // Hit wall, stop before it
        return testPos.clone().sub(direction.clone().multiplyScalar(0.2 + this.config.collisionRadius));
      }
    }
    return desiredPos;
  }

  updateDynamicFOV() {
    if (! this.targetEntity) return;

    const transform = this.targetEntity.components.Transform;
    const gx = Math.floor(transform.x / this.grid.cellSize);
    const gy = Math.floor(transform.z / this.grid.cellSize);

    // Check surrounding cells for walls
    let wallCount = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (this.grid.isOpaque(gx + dx, gy + dy)) wallCount++;
      }
    }

    // Narrow FOV in tight spaces
    const tightness = wallCount / 9;
    const targetFov = THREE.MathUtils.lerp(this.config.fov, this.config.tightSpaceFov, tightness);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 5 * 1/60);
  }

  // Cinematic shot system
  startCinematicShot(shot, duration = 3.0) {
    this.cinematicShot = shot;
    this.cinematicTimer = 0;
    this.cinematicDuration = duration;
    this.cinematicEase = 0;
  }

  updateCinematic(dt) {
    this.cinematicTimer += dt;
    this.cinematicEase = THREE.MathUtils.clamp(this.cinematicTimer / this.cinematicDuration, 0, 1);
    const eased = this.easeInOutCubic(this.cinematicEase);

    if (this.cinematicShot.type === 'fixed') {
      // Fixed camera position/rotation
      this.camera.position.lerp(this.cinematicShot.position, eased);
      const target = new THREE.Vector3().lerpVectors(
        this.targetPosition,
        this.cinematicShot.target,
        eased
      );
      this.camera.lookAt(target);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.cinematicShot.fov || 60, eased);
    } else if (this.cinematicShot.type === 'orbit') {
      // Orbit around point
      const angle = this.cinematicShot.startAngle + (this.cinematicShot.endAngle - this.cinematicShot.startAngle) * eased;
      const radius = THREE.MathUtils.lerp(this.cinematicShot.startRadius, this.cinematicShot.endRadius, eased);
      this.camera.position.x = this.cinematicShot.center.x + Math.sin(angle) * radius;
      this.camera.position.z = this.cinematicShot.center.z + Math.cos(angle) * radius;
      this.camera.position.y = THREE.MathUtils.lerp(this.cinematicShot.startHeight, this.cinematicShot.endHeight, eased);
      this.camera.lookAt(this.cinematicShot.center);
    } else if (this.cinematicShot.type === 'dolly') {
      // Dolly along path
      const pos = this.cinematicShot.path.getPointAt(eased);
      this.camera.position.copy(pos);
      const target = this.cinematicShot.targetPath ? this.cinematicShot.targetPath.getPointAt(eased) : this.targetPosition;
      this.camera.lookAt(target);
    }

    if (this.cinematicTimer >= this.cinematicDuration) {
      this.cinematicShot = null;
      // Smoothly return to follow mode
      this.currentPosition.copy(this.camera.position);
      this.velocity.set(0, 0, 0);
    }
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Shake effect
  shake(intensity, duration = 0.5) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  // Zoom (for aiming)
  setZoom(zoom) {
    this.zoom = THREE.MathUtils.clamp(zoom, 0.5, 2.0);
  }

  // Reset camera behind player
  resetCamera() {
    this.yaw = this.targetEntity?.components.Transform?.rot || 0;
    this.pitch = -0.3;
    this.lookBehind = false;
    this.lookBehindProgress = 0;
  }

  // Set tank controls mode
  setTankControls(enabled) {
    this.tankControls = enabled;
  }

  // Get camera direction for aiming
  getCameraDirection() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }

  // Get camera right vector
  getCameraRight() {
    const right = new THREE.Vector3();
    right.crossVectors(this.camera.up, this.getCameraDirection()).normalize();
    return right;
  }
}

export class CinematicShot {
  static fixed(position, target, fov = 60) {
    return { type: 'fixed', position, target, fov };
  }

  static orbit(center, startAngle, endAngle, startRadius, endRadius, startHeight, endHeight) {
    return { type: 'orbit', center, startAngle, endAngle, startRadius, endRadius, startHeight, endHeight };
  }

  static dolly(path, targetPath = null) {
    return { type: 'dolly', path, targetPath };
  }
}

// Predefined cinematic shots for static rooms
export const CinematicShots = {
  apartment_entry: CinematicShot.fixed(
    new THREE.Vector3(0, 2.5, -5),
    new THREE.Vector3(0, 1.5, 0),
    50
  ),
  clinic_hallway: CinematicShot.fixed(
    new THREE.Vector3(0, 2, 8),
    new THREE.Vector3(0, 1.5, 0),
    45
  ),
  office_cubicles: CinematicShot.orbit(
    new THREE.Vector3(0, 1.5, 0),
    0, Math.PI * 2,
    6, 4,
    2, 3
  ),
  boss_arena_intro: CinematicShot.dolly(
    // Path would be created at runtime
    null,
    null
  ),
  safe_room: CinematicShot.fixed(
    new THREE.Vector3(0, 2.5, -4),
    new THREE.Vector3(0, 1.5, 0),
    55
  ),
};