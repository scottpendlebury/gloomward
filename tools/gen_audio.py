#!/usr/bin/env python3
"""
Audio generation for Gloomward.
Generates procedural ambient loops, stingers, and sound effects as WAV/OGG.
Outputs to assets/audio/ (committed) and tools/out/audio/ (gitignored for iteration).
"""

import os
import sys
import json
import wave
import struct
import math
import random
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────
OUT_DIR = Path("tools/out/audio")
ASSETS_DIR = Path("assets/audio")
MANIFEST_PATH = Path("assets/manifest.json")
SAMPLE_RATE = 44100
SEED = 1337

# Ensure dirs
OUT_DIR.mkdir(parents=True, exist_ok=True)
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Helpers ─────────────────────────────────────────────────────────────
def write_wav(path, samples, sample_rate=SAMPLE_RATE):
    """Write 16-bit mono WAV file."""
    with wave.open(str(path), 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b''.join(struct.pack('<h', int(max(-32768, min(32767, s * 32767)))) for s in samples))

def normalize(samples):
    """Normalize to peak -1dB."""
    peak = max(abs(s) for s in samples)
    if peak > 0:
        target = 0.89  # -1dB
        return [s * target / peak for s in samples]
    return samples

def fade_in_out(samples, fade_samples):
    """Apply fade in/out."""
    n = len(samples)
    for i in range(min(fade_samples, n)):
        samples[i] *= i / fade_samples
        samples[n - 1 - i] *= i / fade_samples
    return samples

# ─── Noise generators ────────────────────────────────────────────────────
def white_noise(duration, seed=0):
    random.seed(seed)
    n = int(SAMPLE_RATE * duration)
    return [random.uniform(-1, 1) for _ in range(n)]

def pink_noise(duration, seed=0):
    """Paul Kellet's pink noise approximation."""
    random.seed(seed)
    n = int(SAMPLE_RATE * duration)
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0
    out = []
    for _ in range(n):
        white = random.uniform(-1, 1)
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        b3 = 0.86650 * b3 + white * 0.3104856
        b4 = 0.55000 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.0168980
        sample = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
        sample *= 0.11
        b6 = white * 0.115926
        out.append(sample)
    return out

def brown_noise(duration, seed=0):
    random.seed(seed)
    n = int(SAMPLE_RATE * duration)
    out = []
    last = 0.0
    for _ in range(n):
        white = random.uniform(-1, 1)
        sample = (last + 0.02 * white) / 1.02
        last = sample
        out.append(sample * 3.5)
    return out

def sine_wave(freq, duration, seed=0):
    n = int(SAMPLE_RATE * duration)
    return [math.sin(2 * math.pi * freq * i / SAMPLE_RATE) for i in range(n)]

# ─── Filters ─────────────────────────────────────────────────────────────
def lowpass(samples, cutoff, resonance=1.0):
    """Simple one-pole lowpass."""
    rc = 1.0 / (2 * math.pi * cutoff / SAMPLE_RATE)
    alpha = 1.0 / (1.0 + rc)
    out = []
    y = 0.0
    for x in samples:
        y = y + alpha * (x - y)
        out.append(y)
    return out

def highpass(samples, cutoff):
    """Simple one-pole highpass."""
    rc = 1.0 / (2 * math.pi * cutoff / SAMPLE_RATE)
    alpha = rc / (1.0 + rc)
    out = []
    y = 0.0
    prev_x = 0.0
    for x in samples:
        y = alpha * (y + x - prev_x)
        out.append(y)
        prev_x = x
    return out

def bandpass(samples, center_freq, q=1.0):
    """Simple bandpass using difference of lowpasses."""
    bw = center_freq / q
    low = lowpass(samples, center_freq + bw/2)
    high = lowpass(samples, center_freq - bw/2)
    return [h - l for h, l in zip(high, low)]

# ─── Envelopes ───────────────────────────────────────────────────────────
def adsr(samples, attack, decay, sustain, release):
    """Apply ADSR envelope (times in seconds)."""
    n = len(samples)
    a = int(attack * SAMPLE_RATE)
    d = int(decay * SAMPLE_RATE)
    r = int(release * SAMPLE_RATE)
    s = n - r
    out = []
    for i, x in enumerate(samples):
        if i < a:
            env = i / a
        elif i < a + d:
            env = 1.0 - (1.0 - sustain) * (i - a) / d
        elif i < s:
            env = sustain
        else:
            env = sustain * (1.0 - (i - s) / r)
        out.append(x * env)
    return out

# ─── Audio recipes ───────────────────────────────────────────────────────
def generate_ambience_streets(duration=10.0):
    """Wind, distant city hum, occasional sirens."""
    base = pink_noise(duration, seed=1)
    base = lowpass(base, 400)
    # Add distant sirens (periodic)
    siren = []
    for i in range(int(SAMPLE_RATE * duration)):
        t = i / SAMPLE_RATE
        # Siren every 15-30 seconds
        phase = (t % 20) / 20
        if phase < 0.1:
            freq = 400 + 600 * (phase / 0.1)
            siren.append(math.sin(2 * math.pi * freq * t) * 0.1)
        else:
            siren.append(0.0)
    # Creaking signs
    creak = pink_noise(duration, seed=2)
    creak = highpass(creak, 1000)
    creak = [c * 0.05 for c in creak]
    # Mix
    out = [b * 0.3 + s + c for b, s, c in zip(base, siren, creak)]
    return normalize(fade_in_out(out, SAMPLE_RATE))

def generate_ambience_apartments(duration=10.0):
    """Muffled TV, neighbour footsteps, drips."""
    base = brown_noise(duration, seed=3)
    base = lowpass(base, 300)
    base = [b * 0.25 for b in base]
    # Neighbour footsteps (sporadic)
    steps = [0.0] * int(SAMPLE_RATE * duration)
    for i in range(0, len(steps), int(SAMPLE_RATE * 12)):
        if random.random() < 0.3:
            for j in range(3):
                idx = i + j * int(SAMPLE_RATE * 0.3)
                if idx < len(steps):
                    steps[idx] = random.uniform(-0.3, 0.3)
    steps = lowpass(steps, 150)
    # Drips
    drips = [0.0] * int(SAMPLE_RATE * duration)
    for i in range(0, len(drips), int(SAMPLE_RATE * 8)):
        if random.random() < 0.4:
            idx = i
            if idx < len(drips):
                drips[idx] = 0.2
    drips = highpass(drips, 2000)
    out = [b + s + d for b, s, d in zip(base, steps, drips)]
    return normalize(fade_in_out(out, SAMPLE_RATE))

def generate_ambience_clinic(duration=10.0):
    """Fluorescent hum, distant screams, wheel squeaks."""
    # Fluorescent hum at 120Hz
    hum = sine_wave(120, duration)
    hum = [h * 0.3 for h in hum]
    # Add harmonics
    for h_freq in [240, 360, 480]:
        harm = sine_wave(h_freq, duration)
        hum = [h + hm * 0.1 for h, hm in zip(hum, harm)]
    hum = lowpass(hum, 200)
    # Distant screams
    screams = pink_noise(duration, seed=4)
    screams = bandpass(screams, 1000, q=2)
    screams = [s * 0.15 for s in screams]
    # Wheel squeaks
    squeak = [0.0] * int(SAMPLE_RATE * duration)
    for i in range(0, len(squeak), int(SAMPLE_RATE * 12)):
        if random.random() < 0.3:
            for j in range(int(SAMPLE_RATE * 0.5)):
                idx = i + j
                if idx < len(squeak):
                    t = j / SAMPLE_RATE
                    squeak[idx] = math.sin(2 * math.pi * 3000 * t) * math.exp(-t * 10) * 0.1
    squeak = highpass(squeak, 2000)
    out = [h + s + sq for h, s, sq in zip(hum, screams, squeak)]
    return normalize(fade_in_out(out, SAMPLE_RATE))

def generate_ambience_offices(duration=10.0):
    """HVAC, flickering lights, paper rustle."""
    base = brown_noise(duration, seed=5)
    base = lowpass(base, 100)
    base = [b * 0.25 for b in base]
    # Flickering lights
    flicker = [0.0] * int(SAMPLE_RATE * duration)
    for i in range(0, len(flicker), int(SAMPLE_RATE * 8)):
        if random.random() < 0.2:
            for j in range(int(SAMPLE_RATE * 0.1)):
                idx = i + j
                if idx < len(flicker):
                    flicker[idx] = random.uniform(-0.05, 0.05)
    flicker = highpass(flicker, 3000)
    # Paper rustle
    rustle = pink_noise(duration, seed=6)
    rustle = highpass(rustle, 1000)
    rustle = [r * 0.15 for r in rustle]
    out = [b + f + r for b, f, r in zip(base, flicker, rustle)]
    return normalize(fade_in_out(out, SAMPLE_RATE))

def generate_ambience_industrial(duration=10.0):
    """Machinery drone, steam vents, clanking."""
    base = brown_noise(duration, seed=7)
    base = lowpass(base, 80)
    base = [b * 0.4 for b in base]
    # Steam vents
    steam = white_noise(duration, seed=8)
    steam = highpass(steam, 1000)
    steam = [s * 0.2 for s in steam]
    # Clanking
    clank = [0.0] * int(SAMPLE_RATE * duration)
    for i in range(0, len(clank), int(SAMPLE_RATE * 8)):
        if random.random() < 0.3:
            for j in range(int(SAMPLE_RATE * 0.3)):
                idx = i + j
                if idx < len(clank):
                    t = j / SAMPLE_RATE
                    clank[idx] = math.sin(2 * math.pi * 400 * t) * math.exp(-t * 20) * 0.15
    clank = bandpass(clank, 400, q=3)
    out = [b + s + c for b, s, c in zip(base, steam, clank)]
    return normalize(fade_in_out(out, SAMPLE_RATE))

def generate_ambience_nightmare(duration=10.0):
    """Deep drone, mechanical wail, viscous drips, heartbeat."""
    base = brown_noise(duration, seed=9)
    base = lowpass(base, 60)
    base = [b * 0.5 for b in base]
    # Mechanical wail
    wail = []
    for i in range(int(SAMPLE_RATE * duration)):
        t = i / SAMPLE_RATE
        if (t % 15) < 5:
            phase = ((t % 15) / 5) * 2 * math.pi
            freq = 100 + 200 * math.sin(phase)
            wail.append(math.sin(2 * math.pi * freq * t) * 0.3)
        else:
            wail.append(0.0)
    wail = bandpass(wail, 200, q=5)
    # Viscous drips
    drips = [0.0] * int(SAMPLE_RATE * duration)
    for i in range(0, len(drips), int(SAMPLE_RATE * 2)):
        if random.random() < 0.5:
            for j in range(int(SAMPLE_RATE * 0.5)):
                idx = i + j
                if idx < len(drips):
                    t = j / SAMPLE_RATE
                    drips[idx] = math.sin(2 * math.pi * 600 * t) * math.exp(-t * 5) * 0.2
    drips = highpass(drips, 500)
    # Heartbeat layer
    heartbeat = []
    for i in range(int(SAMPLE_RATE * duration)):
        t = i / SAMPLE_RATE
        phase = (t * 1.2) % 1.0
        if phase < 0.15:
            heartbeat.append(math.sin(2 * math.pi * 60 * t) * math.exp(-phase * 20) * 0.25)
        else:
            heartbeat.append(0.0)
    heartbeat = bandpass(heartbeat, 60, q=10)
    out = [b + w + d + h for b, w, d, h in zip(base, wail, drips, heartbeat)]
    return normalize(fade_in_out(out, SAMPLE_RATE))

def generate_ambience_safe_room(duration=10.0):
    """Warm pad, soft hum."""
    base = brown_noise(duration, seed=10)
    base = lowpass(base, 200)
    base = [b * 0.2 for b in base]
    # Soft hum
    hum = sine_wave(130, duration)
    hum = [h * 0.1 for h in hum]
    out = [b + h for b, h in zip(base, hum)]
    return normalize(fade_in_out(out, SAMPLE_RATE))

# Stingers
def generate_stinger_scare(duration=2.0):
    """Sudden scare chord."""
    out = []
    for i in range(int(SAMPLE_RATE * duration)):
        t = i / SAMPLE_RATE
        # Dissonant cluster
        sample = 0
        for freq in [55, 58, 62, 69, 73]:  # Cluster
            sample += math.sin(2 * math.pi * freq * t) * 0.2
        # Add noise burst
        sample += random.uniform(-1, 1) * math.exp(-t * 10) * 0.5
        out.append(sample)
    return normalize(fade_in_out(out, int(SAMPLE_RATE * 0.1)))

def generate_stinger_transition(duration=3.0):
    """Layer transition whoosh."""
    n = int(SAMPLE_RATE * duration)
    noise = white_noise(duration, seed=11)
    out = []
    for i, n_val in enumerate(noise):
        t = i / n
        # Frequency sweep down
        cutoff = 5000 * (1 - t) + 200
        # Apply lowpass dynamically
        # Simple approximation: just reduce amplitude at high freq
        filtered = n_val * (1 - t * 0.8)
        out.append(filtered)
    return normalize(out)

def generate_stinger_heartbeat(duration=1.0):
    """Double thump."""
    out = [0.0] * int(SAMPLE_RATE * duration)
    for beat in [0, 0.35]:
        idx = int(beat * SAMPLE_RATE)
        for i in range(int(SAMPLE_RATE * 0.1)):
            if idx + i < len(out):
                t = i / SAMPLE_RATE
                out[idx + i] = math.sin(2 * math.pi * 60 * t) * math.exp(-t * 20) * 0.4
    return normalize(out)

# ─── Main ────────────────────────────────────────────────────────────────
def main():
    # Load existing manifest
    with open(MANIFEST_PATH, "r") as f:
        manifest = json.load(f)

    manifest["audio"] = []

    ambiences = {
        "ambience_streets": (generate_ambience_streets, 10.0),
        "ambience_apartments": (generate_ambience_apartments, 10.0),
        "ambience_clinic": (generate_ambience_clinic, 10.0),
        "ambience_offices": (generate_ambience_offices, 10.0),
        "ambience_industrial": (generate_ambience_industrial, 10.0),
        "ambience_nightmare": (generate_ambience_nightmare, 10.0),
        "ambience_safe_room": (generate_ambience_safe_room, 10.0),
    }

    stingers = {
        "stinger_scare": (generate_stinger_scare, 2.0),
        "stinger_transition": (generate_stinger_transition, 3.0),
        "stinger_heartbeat": (generate_stinger_heartbeat, 1.0),
    }

    print("Generating ambience loops...")
    for name, (func, dur) in ambiences.items():
        samples = func(dur)
        path = ASSETS_DIR / f"{name}.wav"
        write_wav(path, samples)
        size = path.stat().st_size
        manifest["audio"].append({
            "name": name,
            "path": f"audio/{name}.wav",
            "size": size,
            "generator": "tools/gen_audio.py",
            "license": "CC0"
        })
        print(f"  {name}: {size/1024:.1f} KB")

    print("Generating stingers...")
    for name, (func, dur) in stingers.items():
        samples = func(dur)
        path = ASSETS_DIR / f"{name}.wav"
        write_wav(path, samples)
        size = path.stat().st_size
        manifest["audio"].append({
            "name": name,
            "path": f"audio/{name}.wav",
            "size": size,
            "generator": "tools/gen_audio.py",
            "license": "CC0"
        })
        print(f"  {name}: {size/1024:.1f} KB")

    # Save manifest
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest updated at {MANIFEST_PATH}")
    print(f"Audio saved to {ASSETS_DIR}")
    print(f"Total audio files: {len(manifest['audio'])}")

if __name__ == "__main__":
    main()