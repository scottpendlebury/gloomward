// src/audio/music.js — Adaptive generative music
// Exports: MusicSystem
// Dependencies: synth.js, context.js

import { Synth, Envelope, Filter, WaveShaper } from './synth.js';

export const MusicState = {
  EXPLORE: 'explore',
  TENSION: 'tension',
  CHASE: 'chase',
  SAFE: 'safe',
  BOSS: 'boss',
};

export class MusicSystem {
  constructor(audioEngine) {
    this.engine = audioEngine;
    this.ctx = audioEngine.ctx;
    this.synth = new Synth(this.ctx);

    this.currentState = MusicState.EXPLORE;
    this.targetState = MusicState.EXPLOSE;
    this.crossfadeTime = 4.0;
    this.crossfading = false;

    // Layer gains for crossfading
    this.layers = {
      drone: { gain: this.ctx.createGain(), active: false },
      pad: { gain: this.ctx.createGain(), active: false },
      melody: { gain: this.ctx.createGain(), active: false },
      percussion: { gain: this.ctx.createGain(), active: false },
      noise: { gain: this.ctx.createGain(), active: false },
      boss: { gain: this.ctx.createGain(), active: false },
    };

    // Connect all layers to music bus
    for (const layer of Object.values(this.layers)) {
      layer.gain.gain.value = 0;
      layer.gain.connect(this.engine.buses.music);
    }

    // Master music gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.engine.buses.music);

    // Re-route layers through master
    for (const layer of Object.values(this.layers)) {
      layer.gain.disconnect();
      layer.gain.connect(this.masterGain);
    }

    // Music state configurations
    this.stateConfig = {
      [MusicState.EXPLORE]: {
        layers: {
          drone: { gain: 0.3, params: { freq: 55, type: 'sine', filter: 100 } },
          pad: { gain: 0.2, params: { freq: 110, type: 'triangle', filter: 400 } },
          melody: { gain: 0.15, params: { active: true } },
          percussion: { gain: 0, params: {} },
          noise: { gain: 0, params: {} },
          boss: { gain: 0, params: {} },
        },
        tempo: 60,
        scale: [0, 2, 3, 5, 7, 8, 10], // Minor pentatonic + 2nd
        root: 55, // A1
      },
      [MusicState.TENSION]: {
        layers: {
          drone: { gain: 0.4, params: { freq: 55, type: 'sawtooth', filter: 200 } },
          pad: { gain: 0.25, params: { freq: 110, type: 'square', filter: 300 } },
          melody: { gain: 0.2, params: { active: true, tension: true } },
          percussion: { gain: 0.15, params: { pattern: 'heartbeat' } },
          noise: { gain: 0.1, params: { type: 'pink', filter: 500 } },
          boss: { gain: 0, params: {} },
        },
        tempo: 72,
        scale: [0, 1, 3, 5, 6, 8, 10], // Phrygian-ish
        root: 55,
      },
      [MusicState.CHASE]: {
        layers: {
          drone: { gain: 0.5, params: { freq: 55, type: 'sawtooth', filter: 400 } },
          pad: { gain: 0.3, params: { freq: 110, type: 'square', filter: 500 } },
          melody: { gain: 0.25, params: { active: true, fast: true } },
          percussion: { gain: 0.4, params: { pattern: 'industrial' } },
          noise: { gain: 0.2, params: { type: 'white', filter: 800 } },
          boss: { gain: 0, params: {} },
        },
        tempo: 120,
        scale: [0, 1, 3, 5, 6, 8, 10],
        root: 55,
      },
      [MusicState.SAFE]: {
        layers: {
          drone: { gain: 0.2, params: { freq: 65, type: 'sine', filter: 80 } },
          pad: { gain: 0.3, params: { freq: 130, type: 'sine', filter: 200 } },
          melody: { gain: 0.2, params: { active: true, safe: true } },
          percussion: { gain: 0.05, params: { pattern: 'gentle' } },
          noise: { gain: 0, params: {} },
          boss: { gain: 0, params: {} },
        },
        tempo: 50,
        scale: [0, 2, 4, 5, 7, 9, 11], // Major
        root: 65, // C2
      },
      [MusicState.BOSS]: {
        layers: {
          drone: { gain: 0.6, params: { freq: 41, type: 'sawtooth', filter: 150 } },
          pad: { gain: 0.4, params: { freq: 82, type: 'square', filter: 300 } },
          melody: { gain: 0.3, params: { active: true, boss: true } },
          percussion: { gain: 0.5, params: { pattern: 'boss' } },
          noise: { gain: 0.3, params: { type: 'white', filter: 600 } },
          boss: { gain: 0.4, params: { motif: true } },
        },
        tempo: 90,
        scale: [0, 1, 3, 5, 6, 8, 10],
        root: 41, // E1
      },
    };

    // Active voices
    this.voices = {
      drone: [],
      pad: [],
      melody: [],
      percussion: [],
      noise: [],
      boss: [],
    };

    // Melody sequencer
    this.melodyStep = 0;
    this.melodyInterval = null;
    this.percussionStep = 0;
    this.percussionInterval = null;

    this.initLayers();
  }

  initLayers() {
    // Drone: continuous low oscillator
    this.startDrone();

    // Pad: slow evolving chord
    this.startPad();

    // Noise layer
    this.startNoiseLayer();
  }

  setState(state) {
    if (!this.stateConfig[state]) return;
    this.targetState = state;
    if (!this.crossfading) {
      this.crossfadeToState(state);
    }
  }

  crossfadeToState(newState) {
    this.crossfading = true;
    const oldConfig = this.stateConfig[this.currentState];
    const newConfig = this.stateConfig[newState];

    // Crossfade layer gains
    for (const [layerName, layer] of Object.entries(this.layers)) {
      const oldGain = oldConfig.layers[layerName]?.gain || 0;
      const newGain = newConfig.layers[layerName]?.gain || 0;

      layer.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      layer.gain.gain.setValueAtTime(oldGain, this.ctx.currentTime);
      layer.gain.gain.linearRampToValueAtTime(newGain, this.ctx.currentTime + this.crossfadeTime);
    }

    // Update sequencer tempos
    setTimeout(() => {
      this.updateSequencers(newConfig);
      this.currentState = newState;
      this.crossfading = false;
    }, this.crossfadeTime * 1000);
  }

  updateSequencers(config) {
    // Update melody sequencer
    if (this.melodyInterval) clearInterval(this.melodyInterval);
    const melodyIntervalMs = (60000 / config.tempo) * 2; // Half notes
    this.melodyStep = 0;
    this.melodyInterval = setInterval(() => this.playMelodyStep(config), melodyIntervalMs);

    // Update percussion sequencer
    if (this.percussionInterval) clearInterval(this.percussionInterval);
    const percIntervalMs = 60000 / config.tempo;
    this.percussionStep = 0;
    this.percussionInterval = setInterval(() => this.playPercussionStep(config), percIntervalMs);
  }

  startDrone() {
    const config = this.stateConfig[this.currentState].layers.drone;
    if (config.gain <= 0) return;

    const voice = this.synth.createVoice({
      type: config.params.type,
      frequency: config.params.freq,
      filter: { type: 'lowpass', frequency: config.params.filter, Q: 2 },
      envelope: { attack: 10, decay: 0, sustain: 1, release: 5 },
      gain: config.gain,
    });

    voice.connect(this.layers.drone.gain);
    voice.trigger();
    this.voices.drone.push(voice);
  }

  startPad() {
    // Pad plays slow chords
    const playChord = () => {
      const config = this.stateConfig[this.currentState].layers.pad;
      if (config.gain <= 0) return;

      const root = this.stateConfig[this.currentState].root;
      const scale = this.stateConfig[this.currentState].scale;

      // Pick 3-4 notes for chord
      const chordNotes = [0, 2, 4, 5].map(i => scale[i % scale.length]);
      chordNotes.forEach((interval, i) => {
        setTimeout(() => {
          const freq = root * Math.pow(2, (interval + 12) / 12);
          const voice = this.synth.createVoice({
            type: config.params.type,
            frequency: freq,
            filter: { type: 'lowpass', frequency: config.params.filter, Q: 1 },
            envelope: { attack: 3, decay: 2, sustain: 0.5, release: 8 },
            gain: config.gain / chordNotes.length,
          });
          voice.connect(this.layers.pad.gain);
          voice.trigger();
          this.voices.pad.push(voice);

          // Release after a while
          setTimeout(() => {
            voice.release();
            setTimeout(() => voice.stop(), 8000);
          }, 15000 + Math.random() * 10000);
        }, i * 200);
      });
    };

    // Play chord every 20-30 seconds
    const scheduleChord = () => {
      playChord();
      setTimeout(scheduleChord, 20000 + Math.random() * 10000);
    };
    scheduleChord();
  }

  startNoiseLayer() {
    const config = this.stateConfig[this.currentState].layers.noise;
    if (config.gain <= 0) return;

    // Create filtered noise
    const noiseGen = this.engine.ambience?.noiseGen;
    if (noiseGen) {
      const source = noiseGen.createNoiseSource(config.params.type);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = config.params.filter;

      const gain = this.ctx.createGain();
      gain.gain.value = config.gain;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.layers.noise.gain);

      source.start();
      this.noiseSource = source;
      this.noiseFilter = filter;
      this.noiseGain = gain;
    }
  }

  playMelodyStep(config) {
    const melodyConfig = config.layers.melody;
    if (!melodyConfig.params.active || melodyConfig.gain <= 0) return;

    const root = this.stateConfig[this.currentState].root;
    const scale = this.stateConfig[this.currentState].scale;
    const isFast = melodyConfig.params.fast;
    const isSafe = melodyConfig.params.safe;
    const isBoss = melodyConfig.params.boss;
    const isTension = melodyConfig.params.tension;

    // Generate melody note
    const noteIndex = this.melodyStep % 16;
    let interval;

    if (isBoss) {
      // Boss motif: descending minor third, repeated
      const motif = [0, -3, -5, -3, 0, -3, -5, -7];
      interval = scale[((motif[noteIndex % motif.length] % scale.length) + scale.length) % scale.length];
    } else if (isSafe) {
      // Safe: gentle ascending
      const pattern = [0, 2, 4, 5, 7, 9, 7, 5];
      interval = scale[pattern[noteIndex % pattern.length]];
    } else if (isFast) {
      // Chase: rapid arpeggio
      const pattern = [0, 3, 5, 7, 10, 7, 5, 3];
      interval = scale[pattern[noteIndex % pattern.length]];
    } else if (isTension) {
      // Tension: repeating tritone-ish
      const pattern = [0, 6, 3, 6, 1, 6, 3, 6];
      interval = scale[((pattern[noteIndex % pattern.length] % scale.length) + scale.length) % scale.length];
    } else {
      // Explore: sparse, melancholic
      const pattern = [0, 2, 5, 7, 10, 7, 5, 2, 0, 3, 7, 5, 3, 0, -2, 0];
      interval = scale[((pattern[noteIndex % pattern.length] % scale.length) + scale.length) % scale.length];
    }

    const freq = root * Math.pow(2, (interval + 12) / 12);
    const voice = this.synth.createVoice({
      type: isBoss ? 'square' : isFast ? 'sawtooth' : 'triangle',
      frequency: freq,
      filter: { type: 'lowpass', frequency: isFast ? 2000 : 1000, Q: 2 },
      envelope: { attack: 0.05, decay: isFast ? 0.1 : 0.5, sustain: 0.3, release: isFast ? 0.2 : 1.5 },
      gain: melodyConfig.gain,
    });

    voice.connect(this.layers.melody.gain);
    voice.trigger();
    this.voices.melody.push(voice);

    // Auto-release
    setTimeout(() => {
      voice.release();
      setTimeout(() => voice.stop(), 2000);
    }, isFast ? 400 : 2000);

    this.melodyStep++;
  }

  playPercussionStep(config) {
    const percConfig = config.layers.percussion;
    if (percConfig.gain <= 0) return;

    const pattern = percConfig.params.pattern;
    const step = this.percussionStep % 16;

    let playKick = false;
    let playSnare = false;
    let playHihat = false;
    let playMetal = false;

    switch (pattern) {
      case 'heartbeat':
        playKick = step % 4 === 0;
        playSnare = step % 4 === 2;
        break;
      case 'industrial':
        playKick = step % 4 === 0;
        playSnare = step % 4 === 2;
        playHihat = step % 2 === 0;
        playMetal = step % 8 === 4;
        break;
      case 'gentle':
        playKick = step % 8 === 0;
        playHihat = step % 4 === 2;
        break;
      case 'boss':
        playKick = step % 4 === 0;
        playSnare = step % 4 === 2;
        playHihat = step % 2 === 0;
        playMetal = step % 8 === 0 || step % 8 === 4;
        break;
      default:
        playKick = step % 4 === 0;
        playSnare = step % 4 === 2;
    }

    const now = this.ctx.currentTime;

    if (playKick) {
      this.playKick(now, percConfig.gain);
    }
    if (playSnare) {
      this.playSnare(now, percConfig.gain);
    }
    if (playHihat) {
      this.playHihat(now, percConfig.gain * 0.3);
    }
    if (playMetal) {
      this.playMetalHit(now, percConfig.gain * 0.5);
    }

    this.percussionStep++;
  }

  playKick(time, gain) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(gain * 0.8, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    const shaper = new WaveShaper(this.ctx, WaveShaper.makeDistortion(20));
    osc.connect(shaper.shaper);
    shaper.connect(gainNode);
    gainNode.connect(this.layers.percussion.gain);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  playSnare(time, gain) {
    // Noise burst
    const noiseSource = this.engine.ambience?.noiseGen?.createNoiseSource('white', 0.2);
    if (!noiseSource) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 3;

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(gain * 0.5, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.layers.percussion.gain);

    noiseSource.start(time);
    noiseSource.stop(time + 0.1);
  }

  playHihat(time, gain) {
    const noiseSource = this.engine.ambience?.noiseGen?.createNoiseSource('white', 0.05);
    if (!noiseSource) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(gain, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.layers.percussion.gain);

    noiseSource.start(time);
    noiseSource.stop(time + 0.03);
  }

  playMetalHit(time, gain) {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.3);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 10;

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(gain, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.layers.percussion.gain);

    osc.start(time);
    osc.stop(time + 0.4);
  }

  // Boss motif layer
  startBossMotif() {
    const config = this.stateConfig[this.currentState].layers.boss;
    if (config.gain <= 0) return;

    // Low ominous motif
    const playMotif = () => {
      const root = this.stateConfig[this.currentState].root;
      const notes = [0, -5, -7, -5, 0, -3, -5, -8]; // E, B, A, B, E, G, A, F

      notes.forEach((interval, i) => {
        setTimeout(() => {
          const freq = root * Math.pow(2, interval / 12);
          const voice = this.synth.createVoice({
            type: 'sawtooth',
            frequency: freq,
            filter: { type: 'lowpass', frequency: 300, Q: 5 },
            envelope: { attack: 0.5, decay: 0.5, sustain: 0.3, release: 2 },
            gain: config.gain / notes.length,
          });
          voice.connect(this.layers.boss.gain);
          voice.trigger();
          this.voices.boss.push(voice);
        }, i * 800);
      });
    };

    playMotif();
    setInterval(playMotif, 8000);
  }

  setVolume(volume) {
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.5);
  }

  stop() {
    if (this.melodyInterval) clearInterval(this.melodyInterval);
    if (this.percussionInterval) clearInterval(this.percussionInterval);

    for (const voices of Object.values(this.voices)) {
      for (const voice of voices) {
        try { voice.stop(); } catch {}
      }
      voices.length = 0;
    }

    if (this.noiseSource) {
      this.noiseSource.stop();
      this.noiseSource = null;
    }

    for (const layer of Object.values(this.layers)) {
      layer.gain.gain.value = 0;
    }
  }
}