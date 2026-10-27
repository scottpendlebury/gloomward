// src/audio/sfx.js — Footsteps, doors, weapons, enemies, UI, radio
// Exports: SFXSystem
// Dependencies: context.js

export class SFXSystem {
  constructor(audioEngine) {
    this.engine = audioEngine;
    this.ctx = audioEngine.ctx;

    // Footstep state
    this.footstepTimer = 0;
    this.footstepInterval = 0.4;
    this.lastSurface = 'concrete';

    // Surface definitions
    this.surfaces = {
      concrete: { sounds: ['footstep_concrete'], interval: 0.45, volume: 0.6 },
      wood: { sounds: ['footstep_wood'], interval: 0.4, volume: 0.5 },
      tile: { sounds: ['footstep_tile'], interval: 0.35, volume: 0.7 },
      metal: { sounds: ['footstep_metal'], interval: 0.4, volume: 0.8 },
      grass: { sounds: ['footstep_grass'], interval: 0.5, volume: 0.4 },
      water: { sounds: ['footstep_water'], interval: 0.3, volume: 0.5 },
      carpet: { sounds: ['footstep_wood'], interval: 0.5, volume: 0.3 },
      grating: { sounds: ['footstep_metal'], interval: 0.3, volume: 0.9 },
    };

    // Door sounds
    this.doorSounds = {
      creak: 'door_creak',
      slam: 'door_slam',
      locked: 'door_locked',
      open: 'door_creak',
      close: 'door_creak',
    };

    // Weapon sounds
    this.weaponSounds = {
      melee_swing: 'melee_swing',
      melee_hit: 'melee_hit',
      melee_hit_flesh: 'melee_hit',
      pistol_shot: 'gunshot_pistol',
      shotgun_shot: 'gunshot_shotgun',
      reload_pistol: 'pickup',
      reload_shotgun: 'pickup',
    };

    // Enemy vocalizations
    this.enemySounds = {
      spot: 'enemy_spot',
      hurt: 'enemy_hurt',
      death: 'enemy_death',
      attack: 'melee_swing',
      idle: 'enemy_hurt',
    };

    // UI sounds
    this.uiSounds = {
      menu_open: 'pickup',
      menu_close: 'pickup',
      menu_select: 'pickup',
      menu_navigate: 'torch_click',
      inventory_move: 'torch_click',
      inventory_use: 'pickup',
      error: 'door_locked',
      save: 'pickup',
      load: 'pickup',
    };

    // Player sounds
    this.playerSounds = {
      hurt: 'enemy_hurt',
      death: 'enemy_death',
      dodge: 'melee_swing',
      stomp: 'melee_hit',
      heal: 'pickup',
      torch_toggle: 'torch_click',
      low_health: 'heartbeat',
    };

    // Radio
    this.radioStaticSource = null;
    this.radioStaticGain = null;
    this.radioMurmurTimer = 0;
    this.radioStation = 0;
  }

  // Footsteps
  updateFootsteps(dt, velocity, surface, isRunning, isCrouching) {
    const speed = Math.hypot(velocity.vx || 0, velocity.vz || 0);
    if (speed < 0.5) return;

    const surfaceDef = this.surfaces[surface] || this.surfaces.concrete;
    const interval = surfaceDef.interval * (isRunning ? 0.6 : 1) * (isCrouching ? 1.5 : 1);

    this.footstepTimer += dt;
    if (this.footstepTimer >= interval) {
      this.footstepTimer = 0;
      this.playFootstep(surface, speed);
    }
  }

  playFootstep(surface, speed) {
    const surfaceDef = this.surfaces[surface] || this.surfaces.concrete;
    const sound = surfaceDef.sounds[Math.floor(Math.random() * surfaceDef.sounds.length)];
    const volume = surfaceDef.volume * (0.8 + Math.random() * 0.4) * Math.min(speed / 3, 1);

    this.engine.playSfx(sound, {
      bus: 'sfx',
      volume,
      position: this.engine.listenerPosition ? {
        x: this.engine.listenerPosition[0],
        y: this.engine.listenerPosition[1] - 0.5,
        z: this.engine.listenerPosition[2],
      } : null,
      pitch: 0.9 + Math.random() * 0.2,
      occlusion: 0,
    });
  }

  getSurfaceAt(grid, x, z) {
    // Would check grid cell type for surface
    // For now return default
    return 'concrete';
  }

  // Doors
  playDoorSound(type, position, intensity = 1.0) {
    const sound = this.doorSounds[type] || this.doorSounds.creak;
    this.engine.playSfx(sound, {
      bus: 'sfx',
      volume: 0.5 * intensity,
      position,
      reverbSend: 0.3,
    });
  }

  // Weapons
  playWeaponSound(type, position, options = {}) {
    const sound = this.weaponSounds[type];
    if (!sound) return;

    const configs = {
      melee_swing: { volume: 0.4, pitch: 0.9 + Math.random() * 0.2 },
      melee_hit: { volume: 0.6, pitch: 0.8 + Math.random() * 0.3 },
      pistol_shot: { volume: 0.7, pitch: 0.95 + Math.random() * 0.1, reverbSend: 0.4 },
      shotgun_shot: { volume: 0.9, pitch: 0.9 + Math.random() * 0.1, reverbSend: 0.5 },
      reload_pistol: { volume: 0.4, pitch: 1 },
      reload_shotgun: { volume: 0.5, pitch: 0.9 },
    };

    const config = configs[type] || { volume: 0.5, pitch: 1 };
    this.engine.playSfx(sound, {
      bus: 'sfx',
      ...config,
      position,
      ...options,
    });
  }

  // Enemy vocals
  playEnemySound(type, position, enemyType = 'generic') {
    const sound = this.enemySounds[type];
    if (!sound) return;

    const pitchMods = {
      shambler: 0.7,
      crawler: 1.3,
      watchman: 0.9,
      siren: 1.1,
      mimic: 1.0,
      amalgam: 0.6,
      stalker: 0.5,
    };

    const pitch = (pitchMods[enemyType] || 1) * (0.9 + Math.random() * 0.2);

    this.engine.playSfx(sound, {
      bus: 'sfx',
      volume: 0.6,
      pitch,
      position,
      reverbSend: 0.2,
    });
  }

  // UI
  playUISound(type) {
    const sound = this.uiSounds[type];
    if (!sound) return;

    this.engine.playSfx(sound, {
      bus: 'sfx',
      volume: 0.4,
      pitch: 1,
    });
  }

  // Player
  playPlayerSound(type, options = {}) {
    const sound = this.playerSounds[type];
    if (!sound) return;

    const configs = {
      hurt: { volume: 0.6, pitch: 0.9 + Math.random() * 0.2 },
      death: { volume: 0.8, pitch: 0.8 },
      dodge: { volume: 0.4, pitch: 1.2 },
      stomp: { volume: 0.7, pitch: 0.7 },
      heal: { volume: 0.5, pitch: 1.1 },
      torch_toggle: { volume: 0.3, pitch: 1 },
      low_health: { volume: 0.3, pitch: 1 },
    };

    const config = configs[type] || { volume: 0.5, pitch: 1 };
    this.engine.playSfx(sound, {
      bus: 'sfx',
      ...config,
      position: this.engine.listenerPosition ? {
        x: this.engine.listenerPosition[0],
        y: this.engine.listenerPosition[1],
        z: this.engine.listenerPosition[2],
      } : null,
      ...options,
    });
  }

  // Heartbeat at low health
  updateHeartbeat(healthPercent) {
    if (healthPercent <= 0.25) {
      const interval = 1000 + healthPercent * 2000; // Faster at lower health
      // This would be handled by a timer in the game loop
    }
  }

  // Radio static
  startRadio() {
    if (this.radioStaticSource) return;

    const noiseGen = this.engine.ambience?.noiseGen;
    if (!noiseGen) return;

    this.radioStaticSource = noiseGen.createNoiseSource('pink', 10);
    this.radioStaticGain = this.ctx.createGain();
    this.radioStaticGain.gain.value = 0;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.5;

    const distortion = new (this.ctx.createWaveShaper || function() { return { curve: null, oversample: 'none', connect: () => {}, disconnect: () => {} }; })();
    if (distortion.curve !== undefined) {
      distortion.curve = this.makeRadioDistortion(50);
      distortion.oversample = '4x';
    }

    this.radioStaticSource.connect(filter);
    filter.connect(distortion);
    distortion.connect(this.radioStaticGain);
    this.radioStaticGain.connect(this.engine.buses.radio);

    this.radioStaticSource.start();
  }

  stopRadio() {
    if (this.radioStaticSource) {
      this.radioStaticSource.stop();
      this.radioStaticSource = null;
    }
    if (this.radioStaticGain) {
      this.radioStaticGain.disconnect();
      this.radioStaticGain = null;
    }
  }

  setRadioStatic(level) {
    if (this.radioStaticGain) {
      this.radioStaticGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.radioStaticGain.gain.linearRampToValueAtTime(level, this.ctx.currentTime + 0.1);
    }
  }

  setRadioStation(frequency) {
    this.radioStation = frequency;
    // Could filter noise to simulate tuning
  }

  playRadioMurmur() {
    // Occasional formant-like murmurs in static
    const now = this.ctx.currentTime;
    const formants = [800, 1200, 2400, 3200];

    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(formants[Math.floor(Math.random() * formants.length)], now + i * 0.1);
      osc.frequency.linearRampToValueAtTime(formants[Math.floor(Math.random() * formants.length)], now + i * 0.1 + 0.5);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.05, now + i * 0.1 + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.5);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = osc.frequency.value;
      filter.Q.value = 20;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.engine.buses.radio);

      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.5);
    }
  }

  makeRadioDistortion(amount) {
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2 / n) - 1;
      curve[i] = Math.tanh(x * amount / 10) / Math.tanh(amount / 10);
    }
    return curve;
  }

  // Item pickup/use
  playItemSound(itemId, position) {
    const sounds = {
      health_drink: 'pickup',
      first_aid_kit: 'pickup',
      battery: 'torch_click',
      ammo_pistol: 'pickup',
      ammo_shotgun: 'pickup',
      key: 'torch_click',
      fuse: 'pickup',
    };

    const sound = sounds[itemId] || 'pickup';
    this.engine.playSfx(sound, {
      bus: 'sfx',
      volume: 0.4,
      position,
    });
  }

  // Environmental
  playEnvironmentalSound(type, position, options = {}) {
    const sounds = {
      glass_break: 'melee_hit',
      metal_clang: 'melee_hit',
      wood_creak: 'door_creak',
      water_drip: 'footstep_water',
      wind_gust: 'footstep_grass',
      electricity: 'gunshot_pistol',
      fire: 'footstep_grass',
    };

    const sound = sounds[type] || 'pickup';
    this.engine.playSfx(sound, {
      bus: 'sfx',
      volume: options.volume || 0.5,
      position,
      pitch: options.pitch || 1,
      reverbSend: options.reverbSend || 0.2,
    });
  }
}