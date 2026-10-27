// src/audio/ambience.js — Layered ambient beds per theme + sparse events
// Exports: AmbienceSystem
// Dependencies: synth.js, context.js

import { NoiseGenerator, Filter, Envelope, Reverb } from './synth.js';

export class AmbienceSystem {
  constructor(audioEngine) {
    this.engine = audioEngine;
    this.ctx = audioEngine.ctx;
    this.noiseGen = new NoiseGenerator(this.ctx);

    this.currentTheme = null;
    this.layers = new Map(); // layerName -> { source, gain, filter, envelope }
    this.eventTimers = [];
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(this.engine.buses.ambience);

    this.fadeTime = 3.0;
    this.crossfading = false;

    // Ambience profiles per theme
    this.profiles = {
      streets: {
        layers: [
          { name: 'wind', type: 'pink', filter: { type: 'lowpass', freq: 400 }, gain: 0.3, pan: 0 },
          { name: 'distant_city', type: 'brown', filter: { type: 'lowpass', freq: 200 }, gain: 0.2, pan: 0 },
          { name: 'sirens', type: 'pink', filter: { type: 'bandpass', freq: 800, Q: 3 }, gain: 0.15, interval: [30, 120], duration: [2, 5] },
          { name: 'creaking_signs', type: 'pink', filter: { type: 'highpass', freq: 1000 }, gain: 0.1, interval: [15, 45], duration: [1, 3] },
        ],
        events: [
          { name: 'distant_scream', probability: 0.001, sounds: ['enemy_spot'] },
          { name: 'car_alarm', probability: 0.0005, sounds: ['door_slam'] },
          { name: 'glass_break', probability: 0.0003, sounds: ['melee_hit'] },
        ],
        reverb: 'street',
      },
      apartments: {
        layers: [
          { name: 'muffled_tv', type: 'pink', filter: { type: 'lowpass', freq: 300 }, gain: 0.25, pan: 0 },
          { name: 'neighbour_footsteps', type: 'brown', filter: { type: 'lowpass', freq: 150 }, gain: 0.2, interval: [10, 30], duration: [3, 8] },
          { name: 'drips', type: 'pink', filter: { type: 'highpass', freq: 2000 }, gain: 0.1, interval: [5, 15], duration: [0.5, 1] },
          { name: 'pipes', type: 'brown', filter: { type: 'bandpass', freq: 80, Q: 2 }, gain: 0.15, interval: [20, 60], duration: [2, 5] },
        ],
        events: [
          { name: 'door_slam_distant', probability: 0.002, sounds: ['door_slam'] },
          { name: 'baby_cry', probability: 0.0005, sounds: ['enemy_hurt'] },
          { name: 'argument', probability: 0.001, sounds: ['enemy_spot'] },
        ],
        reverb: 'room',
      },
      clinic: {
        layers: [
          { name: 'fluorescent_hum', type: 'brown', filter: { type: 'bandpass', freq: 120, Q: 10 }, gain: 0.3, pan: 0 },
          { name: 'distant_screams', type: 'pink', filter: { type: 'bandpass', freq: 1000, Q: 2 }, gain: 0.15, interval: [20, 60], duration: [2, 6] },
          { name: 'wheel_squeak', type: 'pink', filter: { type: 'highpass', freq: 2000 }, gain: 0.1, interval: [8, 20], duration: [1, 3] },
          { name: 'machinery', type: 'brown', filter: { type: 'lowpass', freq: 100 }, gain: 0.2, pan: 0 },
        ],
        events: [
          { name: 'code_blue', probability: 0.001, sounds: ['enemy_spot'] },
          { name: 'monitor_alarm', probability: 0.002, sounds: ['pickup'] },
          { name: 'trolley_crash', probability: 0.001, sounds: ['door_slam'] },
        ],
        reverb: 'hall',
      },
      offices: {
        layers: [
          { name: 'hvac', type: 'brown', filter: { type: 'lowpass', freq: 100 }, gain: 0.25, pan: 0 },
          { name: 'flickering_lights', type: 'pink', filter: { type: 'highpass', freq: 3000 }, gain: 0.1, interval: [5, 15], duration: [0.2, 0.5] },
          { name: 'paper_rustle', type: 'pink', filter: { type: 'highpass', freq: 1000 }, gain: 0.15, interval: [10, 30], duration: [2, 5] },
          { name: 'distant_typing', type: 'brown', filter: { type: 'bandpass', freq: 500, Q: 2 }, gain: 0.15, interval: [15, 40], duration: [3, 8] },
        ],
        events: [
          { name: 'printer_jam', probability: 0.001, sounds: ['melee_hit'] },
          { name: 'phone_ring', probability: 0.002, sounds: ['pickup'] },
          { name: 'chair_screech', probability: 0.0015, sounds: ['door_creak'] },
        ],
        reverb: 'room',
      },
      industrial: {
        layers: [
          { name: 'machinery_drone', type: 'brown', filter: { type: 'lowpass', freq: 80 }, gain: 0.4, pan: 0 },
          { name: 'steam_vents', type: 'white', filter: { type: 'highpass', freq: 1000 }, gain: 0.2, interval: [3, 8], duration: [1, 3] },
          { name: 'clanking', type: 'pink', filter: { type: 'bandpass', freq: 400, Q: 3 }, gain: 0.15, interval: [5, 15], duration: [0.5, 2] },
          { name: 'dripping_water', type: 'pink', filter: { type: 'highpass', freq: 1500 }, gain: 0.1, interval: [2, 5], duration: [0.3, 1] },
        ],
        events: [
          { name: 'pipe_burst', probability: 0.001, sounds: ['door_slam'] },
          { name: 'machinery_backfire', probability: 0.0005, sounds: ['gunshot_shotgun'] },
          { name: 'metal_groan', probability: 0.001, sounds: ['door_creak'] },
        ],
        reverb: 'hall',
      },
      nightmare: {
        layers: [
          { name: 'drone', type: 'brown', filter: { type: 'lowpass', freq: 60 }, gain: 0.5, pan: 0 },
          { name: 'mechanical_wail', type: 'pink', filter: { type: 'bandpass', freq: 200, Q: 5 }, gain: 0.3, interval: [10, 20], duration: [3, 8] },
          { name: 'viscous_drips', type: 'brown', filter: { type: 'highpass', freq: 500 }, gain: 0.2, interval: [1, 3], duration: [0.5, 1.5] },
          { name: 'heartbeat_layer', type: 'brown', filter: { type: 'bandpass', freq: 60, Q: 10 }, gain: 0.25, pan: 0 },
        ],
        events: [
          { name: 'whisper', probability: 0.003, sounds: ['enemy_hurt'] },
          { name: 'sudden_scream', probability: 0.001, sounds: ['enemy_spot'] },
          { name: 'wet_squelch', probability: 0.002, sounds: ['melee_hit'] },
        ],
        reverb: 'nightmare',
      },
      safe_room: {
        layers: [
          { name: 'warm_pad', type: 'brown', filter: { type: 'lowpass', freq: 200 }, gain: 0.2, pan: 0 },
          { name: 'soft_hum', type: 'pink', filter: { type: 'lowpass', freq: 150 }, gain: 0.1, pan: 0 },
        ],
        events: [],
        reverb: 'room',
      },
    };
  }

  setTheme(themeName) {
    if (this.currentTheme === themeName) return;

    const newProfile = this.profiles[themeName];
    if (!newProfile) return;

    // Crossfade
    if (this.currentTheme) {
      this.crossfadeTo(newProfile);
    } else {
      this.startProfile(newProfile);
    }

    this.currentTheme = themeName;
    this.engine.setReverb(newProfile.reverb);
  }

  startProfile(profile) {
    // Start continuous layers
    for (const layer of profile.layers) {
      if (!layer.interval) {
        this.startContinuousLayer(layer);
      } else {
        this.scheduleIntermittentLayer(layer);
      }
    }

    // Schedule events
    this.scheduleEvents(profile.events);

    // Fade in
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + this.fadeTime);
  }

  crossfadeTo(newProfile) {
    this.crossfading = true;

    // Fade out old layers
    for (const [name, layer] of this.layers) {
      if (layer.gain) {
        layer.gain.gain.cancelScheduledValues(this.ctx.currentTime);
        layer.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + this.fadeTime);
      }
    }

    // Clear old timers
    this.eventTimers.forEach(id => clearTimeout(id));
    this.eventTimers = [];

    // Fade in new layers after fade out
    setTimeout(() => {
      this.layers.clear();
      this.startProfile(newProfile);
      this.crossfading = false;
    }, this.fadeTime * 1000);
  }

  startContinuousLayer(layer) {
    const source = this.noiseGen.createNoiseSource(layer.type);
    const gain = this.ctx.createGain();
    gain.gain.value = layer.gain;

    const filter = this.ctx.createBiquadFilter();
    filter.type = layer.filter.type;
    filter.frequency.value = layer.filter.freq;
    if (layer.filter.Q) filter.Q.value = layer.filter.Q;

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = layer.pan || 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.masterGain);

    source.start();

    this.layers.set(layer.name, { source, gain, filter, pan });
  }

  scheduleIntermittentLayer(layer) {
    const scheduleNext = () => {
      if (!this.layers.has(layer.name) && !this.crossfading) {
        this.startIntermittentLayer(layer);
      }
      const interval = layer.interval[0] + Math.random() * (layer.interval[1] - layer.interval[0]);
      this.eventTimers.push(setTimeout(scheduleNext, interval * 1000));
    };
    scheduleNext();
  }

  startIntermittentLayer(layer) {
    const source = this.noiseGen.createNoiseSource(layer.type);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const filter = this.ctx.createBiquadFilter();
    filter.type = layer.filter.type;
    filter.frequency.value = layer.filter.freq;
    if (layer.filter.Q) filter.Q.value = layer.filter.Q;

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = layer.pan || 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.masterGain);

    source.start();

    const duration = layer.duration[0] + Math.random() * (layer.duration[1] - layer.duration[0]);

    // Fade in
    gain.gain.cancelScheduledValues(this.ctx.currentTime);
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(layer.gain, this.ctx.currentTime + 0.5);

    // Fade out
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);

    this.layers.set(layer.name, { source, gain, filter, pan });

    // Clean up after duration
    setTimeout(() => {
      source.stop();
      this.layers.delete(layer.name);
    }, (duration + 1) * 1000);
  }

  scheduleEvents(events) {
    const checkEvents = () => {
      if (this.crossfading) return;

      for (const event of events) {
        if (Math.random() < event.probability) {
          const sound = event.sounds[Math.floor(Math.random() * event.sounds.length)];
          this.engine.playSfx(sound, {
            bus: 'ambience',
            volume: 0.3,
            position: this.getRandomPositionAroundListener(20, 50),
            reverbSend: 0.5,
          });
        }
      }

      this.eventTimers.push(setTimeout(checkEvents, 1000)); // Check every second
    };
    checkEvents();
  }

  getRandomPositionAroundListener(minDist, maxDist) {
    const angle = Math.random() * Math.PI * 2;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const listener = this.engine.listenerPosition;
    return {
      x: listener[0] + Math.cos(angle) * dist,
      y: listener[1] + (Math.random() - 0.5) * 5,
      z: listener[2] + Math.sin(angle) * dist,
    };
  }

  setVolume(volume) {
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.5);
  }

  pause() {
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
  }

  resume() {
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.5);
  }

  stop() {
    for (const [name, layer] of this.layers) {
      if (layer.source) {
        layer.source.stop();
      }
    }
    this.layers.clear();
    this.eventTimers.forEach(id => clearTimeout(id));
    this.eventTimers = [];
    this.masterGain.gain.value = 0;
  }

  update(dt) {
    // Could add dynamic layer modulation here
  }
}