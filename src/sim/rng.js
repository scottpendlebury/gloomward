// src/sim/rng.js — Seeded PRNG (mulberry32) with sub-seed derivation
// Exports: SeededRNG
// Dependencies: none

export class SeededRNG {
  constructor(seed) {
    this.state = typeof seed === 'string' ? this.hashString(seed) : (seed >>> 0);
    this.initialState = this.state;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash >>> 0;
  }

  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(max) {
    return Math.floor(this.next() * max);
  }

  nextFloat(min, max) {
    return min + this.next() * (max - min);
  }

  nextBool(prob = 0.5) {
    return this.next() < prob;
  }

  choice(arr) {
    return arr[this.nextInt(arr.length)];
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  fork() {
    const childSeed = this.nextInt(0xFFFFFFFF);
    return new SeededRNG(childSeed);
  }

  getState() {
    return this.state.toString(16).padStart(8, '0');
  }

  static fromState(state) {
    const rng = new SeededRNG(0);
    rng.state = parseInt(state, 16) >>> 0;
    return rng;
  }
}