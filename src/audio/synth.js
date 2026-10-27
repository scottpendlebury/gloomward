// src/audio/synth.js — Oscillators, filtered noise, biquads, envelopes, IR generation
// Exports: Synth, Oscillator, Envelope, Filter, NoiseGenerator
// Dependencies: none (Web Audio API)

export class Synth {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.nodes = new Map();
  }

  // Create a voice with oscillator, filter, envelope
  createVoice(config = {}) {
    const {
      type = 'sine',
      frequency = 440,
      detune = 0,
      filter = { type: 'lowpass', frequency: 2000, Q: 1 },
      envelope = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 },
      gain = 1.0,
    } = config;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;

    const filterNode = this.ctx.createBiquadFilter();
    filterNode.type = filter.type;
    filterNode.frequency.value = filter.frequency;
    filterNode.Q.value = filter.Q;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0;

    osc.connect(filterNode);
    filterNode.connect(gainNode);

    return {
      osc,
      filter: filterNode,
      gain: gainNode,
      envelope,
      trigger: (time = this.ctx.currentTime) => this.triggerEnvelope(gainNode, envelope, time),
      release: (time = this.ctx.currentTime) => this.releaseEnvelope(gainNode, envelope, time),
      stop: (time = this.ctx.currentTime) => osc.stop(time),
      connect: (dest) => gainNode.connect(dest),
    };
  }

  triggerEnvelope(gainNode, env, time) {
    const { attack, decay, sustain, release } = env;
    const peak = 1.0;

    gainNode.gain.cancelScheduledValues(time);
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(peak, time + attack);
    gainNode.gain.linearRampToValueAtTime(peak * sustain, time + attack + decay);
  }

  releaseEnvelope(gainNode, env, time) {
    const { release } = env;
    gainNode.gain.cancelScheduledValues(time);
    gainNode.gain.setValueAtTime(gainNode.gain.value, time);
    gainNode.gain.linearRampToValueAtTime(0, time + release);
  }

  // FM Operator
  createFMOscillator(carrierFreq, modulatorFreq, index) {
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = carrierFreq;

    const modulator = this.ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = modulatorFreq;

    const modGain = this.ctx.createGain();
    modGain.gain.value = index * modulatorFreq;

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    return { carrier, modulator, modGain, index: modGain };
  }

  // Karplus-Strong pluck
  createPluck(frequency, duration = 1.0) {
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate / frequency);
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // Initial noise burst
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Lowpass filter for damping
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency * 4;
    filter.Q.value = 0.5;

    // Feedback loop for sustain
    const feedbackGain = this.ctx.createGain();
    feedbackGain.gain.value = 0.99;

    const gain = this.ctx.createGain();
    gain.gain.value = 1;

    source.connect(filter);
    filter.connect(feedbackGain);
    feedbackGain.connect(filter); // Feedback loop
    filter.connect(gain);

    // Decay envelope
    gain.gain.setValueAtTime(1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    return { source, filter, feedbackGain, gain, stop: (t) => { source.stop(t); } };
  }

  // Wavetable oscillator
  createWavetable(waveTable, frequency) {
    const periodicWave = this.ctx.createPeriodicWave(
      new Float32Array(waveTable.real),
      new Float32Array(waveTable.imag)
    );
    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(periodicWave);
    osc.frequency.value = frequency;
    return osc;
  }

  // Granular synthesis helper
  createGrainCloud(buffer, config = {}) {
    const {
      grainDuration = 0.1,
      grainInterval = 0.05,
      pitchRange = 0.5,
      positionRange = 0.5,
      maxGrains = 20,
    } = config;

    const grains = [];
    const masterGain = this.ctx.createGain();

    function spawnGrain() {
      if (grains.length >= maxGrains) return;

      const grain = {
        source: this.ctx.createBufferSource(),
        gain: this.ctx.createGain(),
        filter: this.ctx.createBiquadFilter(),
        startTime: this.ctx.currentTime,
      };

      grain.source.buffer = buffer;
      grain.source.playbackRate.value = 1 + (Math.random() - 0.5) * pitchRange * 2;

      const startPos = Math.random() * (buffer.duration - grainDuration) * (1 - positionRange);
      grain.source.start(0, startPos, grainDuration);

      grain.gain.gain.setValueAtTime(0, grain.startTime);
      grain.gain.gain.linearRampToValueAtTime(1, grain.startTime + 0.01);
      grain.gain.gain.linearRampToValueAtTime(0, grain.startTime + grainDuration - 0.01);

      grain.filter.type = 'bandpass';
      grain.filter.frequency.value = 200 + Math.random() * 2000;
      grain.filter.Q.value = 2;

      grain.source.connect(grain.filter);
      grain.filter.connect(grain.gain);
      grain.gain.connect(masterGain);

      grain.source.onended = () => {
        const idx = grains.indexOf(grain);
        if (idx > -1) grains.splice(idx, 1);
      };

      grains.push(grain);
    }

    let intervalId = null;
    return {
      masterGain,
      start: () => {
        spawnGrain();
        intervalId = setInterval(spawnGrain, grainInterval * 1000);
      },
      stop: () => {
        if (intervalId) clearInterval(intervalId);
        grains.forEach(g => g.source.stop());
        grains.length = 0;
      },
      connect: (dest) => masterGain.connect(dest),
    };
  }
}

export class Envelope {
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.config = {
      attack: config.attack || 0.01,
      decay: config.decay || 0.1,
      sustain: config.sustain || 0.5,
      release: config.release || 0.2,
    };
  }

  trigger(time = this.ctx.currentTime) {
    const { attack, decay, sustain } = this.config;
    this.gain.gain.cancelScheduledValues(time);
    this.gain.gain.setValueAtTime(0, time);
    this.gain.gain.linearRampToValueAtTime(1, time + attack);
    this.gain.gain.linearRampToValueAtTime(sustain, time + attack + decay);
  }

  release(time = this.ctx.currentTime) {
    this.gain.gain.cancelScheduledValues(time);
    this.gain.gain.setValueAtTime(this.gain.gain.value, time);
    this.gain.gain.linearRampToValueAtTime(0, time + this.config.release);
  }

  connect(dest) {
    this.gain.connect(dest);
  }

  disconnect() {
    this.gain.disconnect();
  }
}

export class Filter {
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = config.type || 'lowpass';
    this.filter.frequency.value = config.frequency || 2000;
    this.filter.Q.value = config.Q || 1;
    this.filter.gain.value = config.gain || 0;
  }

  setFrequency(freq, time = this.ctx.currentTime, rampTime = 0) {
    if (rampTime > 0) {
      this.filter.frequency.linearRampToValueAtTime(freq, time + rampTime);
    } else {
      this.filter.frequency.setValueAtTime(freq, time);
    }
  }

  setQ(Q, time = this.ctx.currentTime) {
    this.filter.Q.setValueAtTime(Q, time);
  }

  connect(dest) {
    this.filter.connect(dest);
  }

  disconnect() {
    this.filter.disconnect();
  }
}

export class NoiseGenerator {
  constructor(ctx) {
    this.ctx = ctx;
    this.whiteNoiseBuffer = null;
    this.pinkNoiseBuffer = null;
    this.brownNoiseBuffer = null;
  }

  generateWhiteNoise(duration = 5.0) {
    if (this.whiteNoiseBuffer) return this.whiteNoiseBuffer;

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.whiteNoiseBuffer = buffer;
    return buffer;
  }

  generatePinkNoise(duration = 5.0) {
    if (this.pinkNoiseBuffer) return this.pinkNoiseBuffer;

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Paul Kellet's pink noise approximation
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      data[i] *= 0.11;
      b6 = white * 0.115926;
    }

    this.pinkNoiseBuffer = buffer;
    return buffer;
  }

  generateBrownNoise(duration = 5.0) {
    if (this.brownNoiseBuffer) return this.brownNoiseBuffer;

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }

    this.brownNoiseBuffer = buffer;
    return buffer;
  }

  createNoiseSource(type = 'white', duration = 5.0) {
    let buffer;
    switch (type) {
      case 'pink': buffer = this.generatePinkNoise(duration); break;
      case 'brown': buffer = this.generateBrownNoise(duration); break;
      default: buffer = this.generateWhiteNoise(duration);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }
}

export class WaveShaper {
  constructor(ctx, curve = null) {
    this.ctx = ctx;
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '4x';
    if (curve) this.setCurve(curve);
  }

  setCurve(curve) {
    this.shaper.curve = curve;
  }

  static makeDistortion(amount) {
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2 / n) - 1;
      curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  static makeSoftClip(threshold) {
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2 / n) - 1;
      if (x > threshold) curve[i] = threshold + (x - threshold) * 0.1;
      else if (x < -threshold) curve[i] = -threshold + (x + threshold) * 0.1;
      else curve[i] = x;
    }
    return curve;
  }

  connect(dest) {
    this.shaper.connect(dest);
  }

  disconnect() {
    this.shaper.disconnect();
  }
}

export class Delay {
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.delay = ctx.createDelay(config.maxDelay || 2.0);
    this.delay.delayTime.value = config.delayTime || 0.5;

    this.feedback = ctx.createGain();
    this.feedback.gain.value = config.feedback || 0.3;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = config.filterFreq || 3000;

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = config.wet || 0.3;

    // Feedback loop
    this.delay.connect(this.filter);
    this.filter.connect(this.feedback);
    this.feedback.connect(this.delay);
  }

  connect(input, dest) {
    input.connect(this.dryGain);
    this.dryGain.connect(dest);
    input.connect(this.delay);
    this.delay.connect(this.wetGain);
    this.wetGain.connect(dest);
  }

  setDelayTime(time) {
    this.delay.delayTime.value = time;
  }

  setFeedback(amount) {
    this.feedback.gain.value = Math.max(0, Math.min(0.95, amount));
  }

  setWet(amount) {
    this.wetGain.gain.value = amount;
  }
}

export class Reverb {
  constructor(ctx, impulseResponse) {
    this.ctx = ctx;
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = impulseResponse;
    this.convolver.normalize = true;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.3;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.convolver.connect(this.wetGain);
  }

  connect(input, dest) {
    input.connect(this.dryGain);
    this.dryGain.connect(dest);
    input.connect(this.convolver);
    this.wetGain.connect(dest);
  }

  setWet(amount) {
    this.wetGain.gain.value = amount;
  }

  setDry(amount) {
    this.dryGain.gain.value = amount;
  }

  setImpulseResponse(buffer) {
    this.convolver.buffer = buffer;
  }
}