// src/audio/context.js — AudioContext, mixer buses, master limiter
// Exports: AudioEngine
// Dependencies: none (Web Audio API)

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.buses = {};
    this.limiter = null;
    this.initialized = false;
    this.suspended = false;

    // Voice management
    this.maxVoices = 32;
    this.activeVoices = new Set();
    this.voicePool = [];

    // Listener
    this.listenerPosition = new Float32Array([0, 1.6, 0]);
    this.listenerForward = new Float32Array([0, 0, -1]);
    this.listenerUp = new Float32Array([0, 1, 0]);

    // Reverb
    this.reverbConvolver = null;
    this.reverbSend = null;
    this.irCache = new Map(); // roomType -> AudioBuffer
  }

  async init() {
    if (this.initialized) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'interactive',
      sampleRate: 48000,
    });

    // Create bus hierarchy
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);

    // Main buses
    const busConfig = {
      master: { gain: 1.0 },
      music: { gain: 0.7 },
      sfx: { gain: 0.8 },
      ambience: { gain: 0.6 },
      radio: { gain: 0.5 },
    };

    for (const [name, config] of Object.entries(busConfig)) {
      const gain = this.ctx.createGain();
      gain.gain.value = config.gain;
      gain.connect(this.masterGain);
      this.buses[name] = gain;
    }

    // Reverb send
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.3;
    this.reverbSend.connect(this.masterGain);

    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.connect(this.reverbSend);

    // Limiter on master
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 10;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.masterGain.disconnect();
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Generate impulse responses
    await this.generateImpulseResponses();

    this.initialized = true;
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.suspended = false;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
    this.suspended = true;
  }

  setVolume(busName, value) {
    const bus = this.buses[busName];
    if (bus) {
      bus.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  getVolume(busName) {
    return this.buses[busName]?.gain.value || 0;
  }

  // Voice allocation
  allocateVoice() {
    if (this.activeVoices.size >= this.maxVoices) {
      // Steal oldest voice
      const oldest = this.activeVoices.values().next().value;
      if (oldest) {
        this.releaseVoice(oldest);
      }
    }

    const voice = {
      gain: this.ctx.createGain(),
      panner: this.ctx.createPanner(),
      source: null,
      startTime: this.ctx.currentTime,
    };

    voice.panner.panningModel = 'HRTF';
    voice.panner.distanceModel = 'inverse';
    voice.panner.refDistance = 1;
    voice.panner.maxDistance = 50;
    voice.panner.rolloffFactor = 1;
    voice.panner.coneInnerAngle = 360;
    voice.panner.coneOuterAngle = 360;
    voice.panner.coneOuterGain = 0;

    voice.gain.connect(this.buses.sfx);
    voice.panner.connect(voice.gain);

    this.activeVoices.add(voice);
    return voice;
  }

  releaseVoice(voice) {
    if (voice.source) {
      try { voice.source.stop(); } catch {}
      voice.source.disconnect();
    }
    voice.gain.disconnect();
    voice.panner.disconnect();
    this.activeVoices.delete(voice);
  }

  playSfx(name, options = {}) {
    const {
      position = null,
      volume = 1.0,
      pitch = 1.0,
      occlusion = 0,
      loop = false,
      bus = 'sfx',
      reverbSend = 0,
    } = options;

    const buffer = this.getBuffer(name);
    if (!buffer) {
      // Generate procedural sound if not cached
      return this.playProceduralSfx(name, options);
    }

    const voice = this.allocateVoice();
    voice.source = this.ctx.createBufferSource();
    voice.source.buffer = buffer;
    voice.source.playbackRate.value = pitch;
    voice.source.loop = loop;
    voice.source.connect(voice.panner);

    voice.gain.gain.value = volume;

    if (position) {
      voice.panner.positionX.setValueAtTime(position.x, this.ctx.currentTime);
      voice.panner.positionY.setValueAtTime(position.y, this.ctx.currentTime);
      voice.panner.positionZ.setValueAtTime(position.z, this.ctx.currentTime);

      // Occlusion: low-pass filter
      if (occlusion > 0) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000 + (1 - occlusion) * 8000;
        filter.Q.value = 1;
        voice.source.connect(filter);
        filter.connect(voice.panner);
      }
    }

    if (reverbSend > 0 && this.reverbConvolver.buffer) {
      const sendGain = this.ctx.createGain();
      sendGain.gain.value = reverbSend;
      voice.source.connect(sendGain);
      sendGain.connect(this.reverbConvolver);
    }

    voice.source.start();
    return voice;
  }

  playProceduralSfx(name, options) {
    // Generate simple procedural sounds
    const ctx = this.ctx;
    const voice = this.allocateVoice();
    const now = ctx.currentTime;

    switch (name) {
      case 'footstep_concrete':
      case 'footstep_wood':
      case 'footstep_tile':
      case 'footstep_metal':
      case 'footstep_grass':
      case 'footstep_water':
        return this.generateFootstep(name, options);
      case 'door_creak':
      case 'door_slam':
      case 'door_locked':
        return this.generateDoorSound(name, options);
      case 'pickup':
        return this.generatePickupSound(options);
      case 'melee_swing':
      case 'melee_hit':
        return this.generateMeleeSound(name, options);
      case 'gunshot_pistol':
      case 'gunshot_shotgun':
        return this.generateGunshot(name, options);
      case 'enemy_hurt':
      case 'enemy_death':
      case 'enemy_spot':
        return this.generateEnemyVocal(name, options);
      case 'heartbeat':
        return this.generateHeartbeat(options);
      case 'torch_click':
        return this.generateTorchClick(options);
      case 'radio_static':
        return this.generateRadioStatic(options);
      default:
        // Silent fallback
        const osc = ctx.createOscillator();
        osc.frequency.value = 0;
        osc.connect(voice.panner);
        osc.start(now);
        osc.stop(now + 0.01);
        return voice;
    }
  }

  generateFootstep(type, options) {
    const ctx = this.ctx;
    const voice = this.allocateVoice();
    const now = ctx.currentTime;

    const surfaces = {
      concrete: { freq: 120, decay: 0.08, noise: 0.7 },
      wood: { freq: 180, decay: 0.12, noise: 0.5 },
      tile: { freq: 300, decay: 0.05, noise: 0.8 },
      metal: { freq: 400, decay: 0.15, noise: 0.6 },
      grass: { freq: 80, decay: 0.1, noise: 0.9 },
      water: { freq: 60, decay: 0.2, noise: 0.95 },
    };

    const surface = surfaces[type.replace('footstep_', '')] || surfaces.concrete;

    // Thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(surface.freq, now);
    osc.frequency.exponentialRampToValueAtTime(surface.freq * 0.5, now + surface.decay);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5 * (options.volume || 1), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + surface.decay);

    // Noise burst
    const noiseBuffer = this.getNoiseBuffer(0.05);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3 * surface.noise * (options.volume || 1), now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + surface.decay * 0.5);

    osc.connect(gain);
    gain.connect(voice.panner);
    noise.connect(noiseGain);
    noiseGain.connect(voice.panner);

    osc.start(now);
    osc.stop(now + surface.decay);
    noise.start(now);
    noise.stop(now + surface.decay * 0.5);

    if (options.position) {
      voice.panner.positionX.setValueAtTime(options.position.x, now);
      voice.panner.positionY.setValueAtTime(options.position.y, now);
      voice.panner.positionZ.setValueAtTime(options.position.z, now);
    }

    return voice;
  }

  generateDoorSound(type, options) {
    const ctx = this.ctx;
    const voice = this.allocateVoice();
    const now = ctx.currentTime;

    if (type === 'door_creak') {
      // Creaky hinge
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.5);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 500;
      filter.Q.value = 5;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(voice.panner);

      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'door_slam') {
      // Heavy thud
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(voice.panner);

      osc.start(now);
      osc.stop(now + 0.2);

      // Reverb tail
      if (this.reverbConvolver.buffer) {
        const sendGain = ctx.createGain();
        sendGain.gain.value = 0.4;
        gain.connect(sendGain);
        sendGain.connect(this.reverbConvolver);
      }
    } else if (type === 'door_locked') {
      // Rattle
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 150 + i * 20;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.05);

        osc.connect(gain);
        gain.connect(voice.panner);

        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.05);
      }
    }

    return voice;
  }

  generatePickupSound(options) {
    const ctx = this.ctx;
    const voice = this.allocateVoice();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(voice.panner);

    osc.start(now);
    osc.stop(now + 0.15);

    return voice;
  }

  generateMeleeSound(type, options) {
    const ctx = this.ctx;
    const voice = this.allocateVoice();
    const now = ctx.currentTime;

    if (type === 'melee_swing') {
      // Whoosh
      const noiseBuffer = this.getNoiseBuffer(0.2);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(2000, now + 0.2);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(voice.panner);

      noise.start(now);
      noise.stop(now + 0.3);
    } else if (type === 'melee_hit') {
      // Impact
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      const noiseBuffer = this.getNoiseBuffer(0.05);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(voice.panner);
      noise.connect(noiseGain);
      noiseGain.connect(voice.panner);

      osc.start(now);
      osc.stop(now + 0.15);
      noise.start(now);
      noise.stop(now + 0.05);
    }

    return voice;
  }

  generateGunshot(type, options) {
    const ctx = this.ctx;
    const voice = this.allocateVoice();
    const now = ctx.currentTime;

    const isShotgun = type === 'gunshot_shotgun';

    // Main crack
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(isShotgun ? 80 : 200, now);
    osc.frequency.exponentialRampToValueAtTime(isShotgun ? 40 : 100, now + 0.02);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isShotgun ? 0.8 : 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isShotgun ? 0.05 : 0.03));

    // Noise burst
    const noiseBuffer = this.getNoiseBuffer(isShotgun ? 0.1 : 0.05);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = isShotgun ? 200 : 500;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(isShotgun ? 0.6 : 0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (isShotgun ? 0.1 : 0.05));

    osc.connect(gain);
    gain.connect(voice.panner);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(voice.panner);

    osc.start(now);
    osc.stop(now + (isShotgun ? 0.05 : 0.03));
    noise.start(now);
    noise.stop(now + (isShotgun ? 0.1 : 0.05));

    // Echo tail via reverb
    if (this.reverbConvolver.buffer) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = 0.5;
      gain.connect(sendGain);
      sendGain.connect(this.reverbConvolver);
    }

    return voice;
  }

  generateEnemyVocal(type, options) {
    const ctx = this.ctx;
    const voice = this.allocateVoice();
    const now = ctx.currentTime;

    if (type === 'enemy_hurt') {
      // Pain groan
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.linearRampToValueAtTime(120, now + 0.3);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      filter.Q.value = 2;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(voice.panner);

      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'enemy_death') {
      // Death rattle
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150 - i * 30, now + i * 0.2);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, now + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.3);

        osc.connect(gain);
        gain.connect(voice.panner);

        osc.start(now + i * 0.2);
        osc.stop(now + i * 0.2 + 0.3);
      }
    } else if (type === 'enemy_spot') {
      // Alert screech
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
      osc.frequency.linearRampToValueAtTime(800, now + 0.4);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(voice.panner);

      osc.start(now);
      osc.stop(now + 0.5);
    }

    return voice;
  }

  generateHeartbeat(options) {
    const ctx = this.ctx;
    const voice = this.allocateVoice();
    const now = ctx.currentTime;

    // Double thump
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now + i * 0.35);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.35 + 0.1);

      osc.connect(gain);
      gain.connect(voice.panner);

      osc.start(now + i * 0.35);
      osc.stop(now + i * 0.35 + 0.1);
    }

    return voice;
  }

  generateTorchClick(options) {
    const ctx = this.ctx;
    const voice = this.allocateVoice();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.02);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(voice.panner);

    osc.start(now);
    osc.stop(now + 0.05);

    return voice;
  }

  generateRadioStatic(options) {
    // Handled by RadioSystem
    return null;
  }

  // Buffer management
  getBuffer(name) {
    return this.buffers?.get(name) || null;
  }

  setBuffer(name, buffer) {
    if (!this.buffers) this.buffers = new Map();
    this.buffers.set(name, buffer);
  }

  getNoiseBuffer(duration) {
    const cacheKey = `noise_${duration}`;
    if (this.noiseBuffers?.has(cacheKey)) return this.noiseBuffers.get(cacheKey);

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }

    if (!this.noiseBuffers) this.noiseBuffers = new Map();
    this.noiseBuffers.set(cacheKey, buffer);
    return buffer;
  }

  async generateImpulseResponses() {
    const roomTypes = {
      corridor: { size: 0.3, decay: 1.5, damping: 0.6 },
      room: { size: 0.5, decay: 2.0, damping: 0.4 },
      hall: { size: 0.8, decay: 3.0, damping: 0.3 },
      street: { size: 0.9, decay: 1.0, damping: 0.7 },
      nightmare: { size: 1.0, decay: 4.0, damping: 0.2 },
    };

    for (const [name, params] of Object.entries(roomTypes)) {
      this.irCache.set(name, this.generateIR(params));
    }

    // Set default reverb
    this.reverbConvolver.buffer = this.irCache.get('room');
  }

  generateIR(params) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * params.decay);
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t * params.damping * 3);
        const diffusion = (Math.random() * 2 - 1) * envelope * params.size;
        data[i] = diffusion;
      }
    }

    return buffer;
  }

  setReverb(roomType) {
    const ir = this.irCache.get(roomType);
    if (ir) {
      this.reverbConvolver.buffer = ir;
    }
  }

  setListenerTransform(position, forward, up) {
    if (position) {
      this.listenerPosition[0] = position.x;
      this.listenerPosition[1] = position.y;
      this.listenerPosition[2] = position.z;
    }
    if (forward) {
      this.listenerForward[0] = forward.x;
      this.listenerForward[1] = forward.y;
      this.listenerForward[2] = forward.z;
    }
    if (up) {
      this.listenerUp[0] = up.x;
      this.listenerUp[1] = up.y;
      this.listenerUp[2] = up.z;
    }

    if (this.ctx.listener) {
      this.ctx.listener.setPosition(
        this.listenerPosition[0],
        this.listenerPosition[1],
        this.listenerPosition[2]
      );
      this.ctx.listener.setOrientation(
        this.listenerForward[0], this.listenerForward[1], this.listenerForward[2],
        this.listenerUp[0], this.listenerUp[1], this.listenerUp[2]
      );
    }
  }

  update(dt) {
    // Clean up finished voices
    for (const voice of this.activeVoices) {
      if (voice.source && voice.source.playbackState === 3) { // FINISHED_STATE
        this.releaseVoice(voice);
      }
    }
  }

  dispose() {
    for (const voice of this.activeVoices) {
      this.releaseVoice(voice);
    }
    if (this.ctx) {
      this.ctx.close();
    }
  }
}