// src/audio/radio.js — Pocket radio: static, murmurs, stations, clues
// Exports: RadioSystem
// Dependencies: context.js, sfx.js

export class RadioSystem {
  constructor(audioEngine, sfxSystem) {
    this.engine = audioEngine;
    this.sfx = sfxSystem;
    this.ctx = audioEngine.ctx;

    this.enabled = false;
    this.staticLevel = 0;
    this.targetStaticLevel = 0;
    this.station = 0; // 0-1, maps to frequency
    this.frequency = 88.0; // MHz
    this.tuning = false;
    this.tuneSpeed = 0;

    // Station definitions (clues, story whispers)
    this.stations = [
      { freq: 88.5, name: 'EMERGENCY', type: 'emergency', clues: ['code_clue', 'location_clue'] },
      { freq: 89.3, name: 'LOCAL_NEWS', type: 'news', clues: ['story_clue', 'item_clue'] },
      { freq: 91.7, name: 'UNKNOWN', type: 'numbers', clues: ['code_clue'] },
      { freq: 93.1, name: 'STATIC_VOICE', type: 'whisper', clues: ['story_clue', 'warning'] },
      { freq: 95.9, name: 'OLDIES', type: 'music', clues: ['atmosphere'] },
      { freq: 98.2, name: 'RELIGIOUS', type: 'sermon', clues: ['lore_clue'] },
      { freq: 101.5, name: 'PIRATE', type: 'pirate', clues: ['secret_clue'] },
      { freq: 104.7, name: 'WEATHER', type: 'weather', clues: ['environment_clue'] },
      { freq: 107.3, name: 'EMERGENCY_2', type: 'emergency', clues: ['evacuation_clue'] },
    ];

    this.currentStationIndex = -1;
    this.clueQueue = [];
    this.murmurTimer = 0;
    this.murmurInterval = 5;
    this.signalStrength = 0;

    // Static noise
    this.staticSource = null;
    this.staticGain = null;
    this.staticFilter = null;

    // Tuning indicator
    this.tuningSound = null;
  }

  init() {
    this.createStaticSource();
  }

  createStaticSource() {
    const noiseGen = this.engine.ambience?.noiseGen;
    if (!noiseGen) return;

    this.staticSource = noiseGen.createNoiseSource('pink', 30);
    this.staticGain = this.ctx.createGain();
    this.staticGain.gain.value = 0;

    this.staticFilter = this.ctx.createBiquadFilter();
    this.staticFilter.type = 'bandpass';
    this.staticFilter.frequency.value = 2000;
    this.staticFilter.Q.value = 0.5;

    // Radio distortion
    this.staticDistortion = this.ctx.createWaveShaper();
    this.staticDistortion.curve = this.makeRadioDistortion(30);
    this.staticDistortion.oversample = '4x';

    // Tuning filter (simulates moving between stations)
    this.tuningFilter = this.ctx.createBiquadFilter();
    this.tuningFilter.type = 'bandpass';
    this.tuningFilter.frequency.value = 2000;
    this.tuningFilter.Q.value = 2;

    this.staticSource.connect(this.staticFilter);
    this.staticFilter.connect(this.staticDistortion);
    this.staticDistortion.connect(this.tuningFilter);
    this.tuningFilter.connect(this.staticGain);
    this.staticGain.connect(this.engine.buses.radio);

    this.staticSource.start();
  }

  makeRadioDistortion(amount) {
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2 / n) - 1;
      // Soft clipping with asymmetry
      curve[i] = x < 0 ? Math.tanh(x * amount / 10) / Math.tanh(amount / 10) : Math.tanh(x * amount / 15) / Math.tanh(amount / 15);
    }
    return curve;
  }

  update(dt, nearbyEnemies, playerTorchOn) {
    // Calculate target static level based on nearby enemies
    let targetStatic = 0.1; // Base static

    if (nearbyEnemies > 0) {
      targetStatic += Math.min(nearbyEnemies * 0.15, 0.6);
    }

    // Torch on increases static slightly (electrical interference)
    if (playerTorchOn) {
      targetStatic += 0.05;
    }

    // Nightmare layer increases static significantly
    if (this.engine.ambience?.currentTheme === 'nightmare') {
      targetStatic = Math.max(targetStatic, 0.7);
    }

    this.targetStaticLevel = Math.min(1, targetStatic);

    // Smooth interpolation
    this.staticLevel += (this.targetStaticLevel - this.staticLevel) * dt * 3;
    this.staticGain.gain.value = this.staticLevel * this.signalStrength;

    // Update tuning filter if tuning
    if (this.tuning) {
      this.tuneSpeed = Math.min(1, this.tuneSpeed + dt * 2);
      this.station += this.tuneSpeed * dt * (this.tuneDirection || 1);
      this.station = Math.max(0, Math.min(1, this.station));
      this.frequency = 88.0 + this.station * (108.0 - 88.0);

      // Sweep filter frequency
      this.tuningFilter.frequency.value = 500 + this.station * 3000;
      this.tuningFilter.Q.value = 5;

      // Tuning sound
      if (!this.tuningSound) {
        this.playTuningSound();
      }
    } else {
      this.tuneSpeed = Math.max(0, this.tuneSpeed - dt * 3);
      this.tuningFilter.Q.value = 0.5;
      this.tuningFilter.frequency.value = 2000;

      if (this.tuningSound) {
        this.stopTuningSound();
      }
    }

    // Murmurs
    this.murmurTimer += dt;
    if (this.murmurTimer >= this.murmurInterval && this.staticLevel > 0.3) {
      this.murmurTimer = 0;
      this.murmurInterval = 3 + Math.random() * 10;
      this.playMurmur();
    }

    // Process clue queue
    if (this.clueQueue.length > 0 && Math.random() < 0.01) {
      this.playClue(this.clueQueue.shift());
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.signalStrength = 1;
      this.sfx.startRadio();
    } else {
      this.signalStrength = 0;
      this.sfx.stopRadio();
    }
  }

  toggle() {
    this.setEnabled(!this.enabled);
  }

  tune(direction) {
    this.tuning = true;
    this.tuneDirection = direction;
  }

  stopTuning() {
    this.tuning = false;
    this.snapToNearestStation();
  }

  snapToNearestStation() {
    let nearest = 0;
    let minDist = 1;

    for (let i = 0; i < this.stations.length; i++) {
      const stationPos = (this.stations[i].freq - 88.0) / (108.0 - 88.0);
      const dist = Math.abs(this.station - stationPos);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }

    this.currentStationIndex = nearest;
    this.station = (this.stations[nearest].freq - 88.0) / (108.0 - 88.0);
    this.frequency = this.stations[nearest].freq;

    // Play station identification
    this.playStationID();
  }

  getCurrentStation() {
    if (this.currentStationIndex >= 0) {
      return this.stations[this.currentStationIndex];
    }
    return null;
  }

  getFrequency() {
    return this.frequency;
  }

  getStaticLevel() {
    return this.staticLevel;
  }

  // Clue system
  queueClue(clueType) {
    this.clueQueue.push(clueType);
  }

  playClue(clueType) {
    // Generate procedural voice-like clue
    const now = this.ctx.currentTime;
    const phrases = this.getCluePhrases(clueType);
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    // Speak using formant synthesis
    this.speakPhrase(phrase);
  }

  getCluePhrases(clueType) {
    const clues = {
      code_clue: [
        'The code is three seven two',
        'Remember the numbers: four one nine',
        'Count the flashes: two five eight',
        'The lock remembers: six three four',
      ],
      location_clue: [
        'They are in the basement',
        'Check the third floor',
        'Behind the false wall',
        'Under the floorboards',
      ],
      story_clue: [
        'She never left this town',
        'The fog came from below',
        'They buried it in the foundation',
        'The radio knows the truth',
      ],
      item_clue: [
        'The key is in the desk',
        'Look for the red box',
        'The fuse box is in the hall',
        'A valve handle fits the pipe',
      ],
      warning: [
        'Don\'t trust the light',
        'It follows the sound',
        'The walls have ears',
        'Run while you can',
      ],
      lore_clue: [
        'The town remembers its sins',
        'Blood feeds the roots',
        'The cycle turns again',
        'Forgiveness is a lie',
      ],
      secret_clue: [
        'There is a way out',
        'The mirror shows the truth',
        'Burn the journal',
        'The seventh door',
      ],
      environment_clue: [
        'The fog thickens at midnight',
        'Rain brings the worms',
        'Cold steel, colder flesh',
        'The sirens lie',
      ],
      evacuation_clue: [
        'Evacuation route: north',
        'Shelter at the clinic',
        'Don\'t use the main road',
        'The bridge is gone',
      ],
      atmosphere: [
        '*static* ... *music plays* ... *static*',
        '*distant piano* ... *fades*',
        '*old broadcast* ... *cuts out*',
      ],
    };
    return clues[clueType] || ['*static*'];
  }

  speakPhrase(text) {
    // Simple formant synthesis for robotic voice
    const now = this.ctx.currentTime;
    const words = text.split(' ');
    let wordTime = 0;

    for (const word of words) {
      const duration = 0.15 + word.length * 0.03;
      const formants = this.wordToFormants(word);

      for (let i = 0; i < formants.length; i++) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(formants[i], now + wordTime);
        osc.frequency.linearRampToValueAtTime(formants[i] * 1.1, now + wordTime + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now + wordTime);
        gain.gain.linearRampToValueAtTime(0.03, now + wordTime + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + wordTime + duration);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = formants[i];
        filter.Q.value = 10;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.engine.buses.radio);

        osc.start(now + wordTime);
        osc.stop(now + wordTime + duration);
      }

      wordTime += duration + 0.05;
    }
  }

  wordToFormants(word) {
    // Very rough vowel-to-formant mapping
    const vowelFormants = {
      'a': [700, 1100, 2500],
      'e': [500, 1800, 2500],
      'i': [300, 2200, 3000],
      'o': [500, 800, 2500],
      'u': [300, 700, 2500],
    };

    const vowels = word.match(/[aeiou]/gi) || ['a'];
    const formants = [];
    for (const v of vowels) {
      formants.push(...(vowelFormants[v.toLowerCase()] || [500, 1500, 2500]));
    }
    return formants.slice(0, 3);
  }

  playMurmur() {
    this.sfx.playRadioMurmur();
  }

  playStationID() {
    const station = this.getCurrentStation();
    if (!station) return;

    // Play station call sign
    const now = this.ctx.currentTime;
    const name = station.name.replace('_', ' ');

    // Simple Morse-code-like ID
    const chars = name.split('');
    let charTime = 0;

    for (const char of chars) {
      const isDot = charTime % 2 === 0;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1000;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now + charTime);
      gain.gain.linearRampToValueAtTime(0.05, now + charTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + charTime + (isDot ? 0.1 : 0.3));

      osc.connect(gain);
      gain.connect(this.engine.buses.radio);

      osc.start(now + charTime);
      osc.stop(now + charTime + (isDot ? 0.1 : 0.3));

      charTime += isDot ? 0.15 : 0.35;
    }
  }

  playTuningSound() {
    // Rapid clicking while tuning
    this.tuningSound = setInterval(() => {
      if (!this.tuning) {
        this.stopTuningSound();
        return;
      }
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 100;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.02);

      osc.connect(gain);
      gain.connect(this.engine.buses.radio);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.02);
    }, 50);
  }

  stopTuningSound() {
    if (this.tuningSound) {
      clearInterval(this.tuningSound);
      this.tuningSound = null;
    }
  }

  // Signal strength based on location
  setSignalStrength(strength) {
    this.signalStrength = Math.max(0, Math.min(1, strength));
  }

  dispose() {
    this.stopTuningSound();
    if (this.staticSource) {
      this.staticSource.stop();
      this.staticSource = null;
    }
    if (this.staticGain) {
      this.staticGain.disconnect();
      this.staticGain = null;
    }
  }
}