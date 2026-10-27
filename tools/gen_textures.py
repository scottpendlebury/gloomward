#!/usr/bin/env python3
"""
Texture generation for Gloomward.
Generates seamless, tileable textures with layered recipes.
Outputs to assets/textures/ (committed) and tools/out/textures/ (gitignored for iteration).
"""

import os
import sys
import json
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance, ImageOps

# ─── Config ──────────────────────────────────────────────────────────────
OUT_DIR = Path("tools/out/textures")
ASSETS_DIR = Path("assets/textures")
MANIFEST_PATH = Path("assets/manifest.json")
SIZE = 256  # 128-256px seamless PNGs
SEED = 1337  # Base seed for reproducibility

# Ensure dirs
OUT_DIR.mkdir(parents=True, exist_ok=True)
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Noise toolkit ───────────────────────────────────────────────────────
def value_noise(shape, scale, seed):
    """Simple value noise."""
    rng = np.random.default_rng(seed)
    h, w = shape
    grid_h, grid_w = max(1, h // scale), max(1, w // scale)
    grid = rng.random((grid_h + 1, grid_w + 1))
    # Bilinear interpolation
    y_idx = np.linspace(0, grid_h, h, endpoint=False)
    x_idx = np.linspace(0, grid_w, w, endpoint=False)
    y0 = np.floor(y_idx).astype(int)
    y1 = np.clip(y0 + 1, 0, grid_h)
    x0 = np.floor(x_idx).astype(int)
    x1 = np.clip(x0 + 1, 0, grid_w)
    wy = y_idx - y0
    wx = x_idx - x0
    wy = wy[:, None]
    wx = wx[None, :]
    v00 = grid[y0][:, x0]
    v01 = grid[y0][:, x1]
    v10 = grid[y1][:, x0]
    v11 = grid[y1][:, x1]
    return (v00 * (1-wy) * (1-wx) + v01 * (1-wy) * wx +
            v10 * wy * (1-wx) + v11 * wy * wx)

def fbm(shape, octaves=6, lacunarity=2.0, gain=0.5, seed=0):
    """Fractional Brownian Motion."""
    result = np.zeros(shape)
    amplitude = 1.0
    frequency = 1.0
    max_val = 0.0
    for i in range(octaves):
        n = value_noise(shape, max(1, int(64 / frequency)), seed + i * 1000)
        result += amplitude * n
        max_val += amplitude
        amplitude *= gain
        frequency *= lacunarity
    return result / max_val

def worley_noise(shape, points_per_cell=2, seed=0):
    """Worley (cellular) noise - distance to nearest feature point."""
    rng = np.random.default_rng(seed)
    h, w = shape
    # Grid of cells
    cell_size = 32
    grid_h, grid_w = h // cell_size + 1, w // cell_size + 1
    points = []
    for gy in range(grid_h):
        for gx in range(grid_w):
            for _ in range(points_per_cell):
                px = gx * cell_size + rng.random() * cell_size
                py = gy * cell_size + rng.random() * cell_size
                points.append((px, py))
    points = np.array(points)
    # Distance transform (simplified - use scipy if available, else approximate)
    y, x = np.meshgrid(np.arange(h), np.arange(w), indexing='ij')
    coords = np.stack([y, x], axis=-1).reshape(-1, 2)
    # This is slow for large images; use a simpler approach
    # For now, return a placeholder pattern
    return value_noise(shape, cell_size, seed)

def tile_wrap(arr):
    """Make array tileable by mirroring edges."""
    h, w = arr.shape
    # Simple mirror tiling
    result = np.zeros((h*2, w*2))
    result[:h, :w] = arr
    result[:h, w:] = np.fliplr(arr)
    result[h:, :w] = np.flipud(arr)
    result[h:, w:] = np.flipud(np.fliplr(arr))
    # Take center
    return result[h//2:h//2+h, w//2:w//2+w]

def normalize(arr):
    """Normalize to 0-1."""
    mn, mx = arr.min(), arr.max()
    if mx > mn:
        return (arr - mn) / (mx - mn)
    return np.zeros_like(arr)

# ─── Layer recipes ───────────────────────────────────────────────────────
def base_layer(shape, base_color, variation=0.1, seed=0):
    """Base color with subtle variation."""
    noise = fbm(shape, octaves=3, seed=seed) * variation
    h, w = shape
    img = np.zeros((h, w, 3))
    for c in range(3):
        img[:, :, c] = np.clip(base_color[c] + noise * 50, 0, 255)
    return img.astype(np.uint8)

def structure_layer(shape, pattern_type, seed=0):
    """Structural patterns: bricks, planks, tiles, panels."""
    h, w = shape
    img = np.zeros((h, w), dtype=np.float32)
    rng = np.random.default_rng(seed)

    if pattern_type == "bricks":
        brick_h, brick_w = 16, 32
        mortar = 2
        for y in range(0, h, brick_h + mortar):
            row_offset = (y // (brick_h + mortar)) % 2 * (brick_w // 2)
            for x in range(-row_offset, w, brick_w + mortar):
                if 0 <= x < w and 0 <= y < h:
                    yh = min(brick_h, h - y)
                    xw = min(brick_w, w - x)
                    img[y:y+yh, x:x+xw] = 1.0
    elif pattern_type == "planks":
        plank_w = 12
        gap = 1
        for x in range(0, w, plank_w + gap):
            xw = min(plank_w, w - x)
            img[:, x:x+xw] = 1.0 + rng.random() * 0.1
    elif pattern_type == "tiles":
        tile_size = 24
        gap = 2
        for y in range(0, h, tile_size + gap):
            for x in range(0, w, tile_size + gap):
                yh = min(tile_size, h - y)
                xw = min(tile_size, w - x)
                img[y:y+yh, x:x+xw] = 1.0
    elif pattern_type == "panels":
        panel_w, panel_h = 48, 48
        gap = 3
        for y in range(0, h, panel_h + gap):
            for x in range(0, w, panel_w + gap):
                yh = min(panel_h, h - y)
                xw = min(panel_w, w - x)
                img[y:y+yh, x:x+xw] = 1.0 + rng.random() * 0.05
    elif pattern_type == "corrugated":
        # Horizontal ridges
        for y in range(0, h, 8):
            img[y:min(y+4, h), :] = 1.0
    elif pattern_type == "grating":
        # Grid pattern
        for y in range(0, h, 16):
            img[y:min(y+2, h), :] = 1.0
        for x in range(0, w, 16):
            img[:, x:min(x+2, w)] = 1.0

    return normalize(img)

def grime_layer(shape, intensity=0.5, seed=0):
    """Edge darkening, drips, stains, mould."""
    h, w = shape
    img = np.zeros((h, w), dtype=np.float32)
    rng = np.random.default_rng(seed)

    # Edge darkening
    for y in range(h):
        for x in range(w):
            dist_edge = min(x, w-1-x, y, h-1-y)
            img[y, x] = 1.0 - np.exp(-dist_edge / 20.0)

    # Drips (vertical streaks)
    for _ in range(int(20 * intensity)):
        x = rng.integers(0, w)
        y_start = rng.integers(0, h//2)
        length = rng.integers(10, 50)
        for y in range(y_start, min(y_start + length, h)):
            alpha = 1.0 - (y - y_start) / length
            img[y, x] = max(img[y, x], alpha * 0.5 * intensity)

    # Stains (random blobs)
    for _ in range(int(30 * intensity)):
        cx, cy = rng.integers(0, w), rng.integers(0, h)
        radius = rng.integers(5, 20)
        for y in range(max(0, cy-radius), min(h, cy+radius)):
            for x in range(max(0, cx-radius), min(w, cx+radius)):
                dist = np.sqrt((x-cx)**2 + (y-cy)**2)
                if dist < radius:
                    img[y, x] = max(img[y, x], (1 - dist/radius) * 0.4 * intensity)

    return normalize(img)

def wear_layer(shape, intensity=0.5, seed=0):
    """Scratches, chipped paint, wear marks."""
    h, w = shape
    img = np.zeros((h, w), dtype=np.float32)
    rng = np.random.default_rng(seed)

    # Scratches
    for _ in range(int(50 * intensity)):
        x1, y1 = rng.integers(0, w), rng.integers(0, h)
        length = rng.integers(10, 60)
        angle = rng.random() * 2 * np.pi
        x2 = int(x1 + length * np.cos(angle))
        y2 = int(y1 + length * np.sin(angle))
        x2 = np.clip(x2, 0, w-1)
        y2 = np.clip(y2, 0, h-1)
        # Draw line
        steps = max(abs(x2-x1), abs(y2-y1))
        for i in range(steps):
            t = i / max(1, steps)
            x = int(x1 + (x2-x1) * t)
            y = int(y1 + (y2-y1) * t)
            if 0 <= x < w and 0 <= y < h:
                img[y, x] = max(img[y, x], 0.7 * intensity)

    # Chips
    for _ in range(int(20 * intensity)):
        cx, cy = rng.integers(0, w), rng.integers(0, h)
        radius = rng.integers(2, 6)
        for y in range(max(0, cy-radius), min(h, cy+radius)):
            for x in range(max(0, cx-radius), min(w, cx+radius)):
                if (x-cx)**2 + (y-cy)**2 < radius**2:
                    img[y, x] = max(img[y, x], 0.9 * intensity)

    return normalize(img)

def grade_layer(shape, hue_shift=0, sat_mult=1.0, val_mult=1.0, seed=0):
    """Color grading."""
    # Applied in final composition
    return None

# ─── Texture recipes ─────────────────────────────────────────────────────
TEXTURE_RECIPES = {
    "concrete": {
        "base_color": (80, 80, 90),
        "structure": "panels",
        "grime": 0.6,
        "wear": 0.4,
        "grade": {"val_mult": 0.9},
    },
    "brick": {
        "base_color": (120, 60, 50),
        "structure": "bricks",
        "grime": 0.5,
        "wear": 0.3,
        "grade": {"hue_shift": 5, "sat_mult": 1.1},
    },
    "plaster": {
        "base_color": (180, 170, 160),
        "structure": None,
        "grime": 0.7,
        "wear": 0.5,
        "grade": {"val_mult": 1.1},
    },
    "wallpaper_floral": {
        "base_color": (140, 120, 100),
        "structure": None,
        "grime": 0.5,
        "wear": 0.6,
        "grade": {"hue_shift": -10, "sat_mult": 0.8},
    },
    "wallpaper_striped": {
        "base_color": (100, 90, 80),
        "structure": "planks",
        "grime": 0.4,
        "wear": 0.5,
        "grade": {"sat_mult": 0.7},
    },
    "wallpaper_damask": {
        "base_color": (90, 80, 70),
        "structure": None,
        "grime": 0.6,
        "wear": 0.4,
        "grade": {"hue_shift": 15, "sat_mult": 0.6},
    },
    "hospital_tile": {
        "base_color": (200, 200, 210),
        "structure": "tiles",
        "grime": 0.3,
        "wear": 0.2,
        "grade": {"val_mult": 1.0, "sat_mult": 0.3},
    },
    "wood_planks": {
        "base_color": (100, 70, 40),
        "structure": "planks",
        "grime": 0.4,
        "wear": 0.5,
        "grade": {"hue_shift": 10, "sat_mult": 1.2},
    },
    "linoleum": {
        "base_color": (120, 110, 100),
        "structure": "tiles",
        "grime": 0.5,
        "wear": 0.6,
        "grade": {"val_mult": 0.9, "sat_mult": 0.5},
    },
    "carpet": {
        "base_color": (60, 50, 45),
        "structure": None,
        "grime": 0.5,
        "wear": 0.7,
        "grade": {"val_mult": 0.7, "sat_mult": 0.8},
    },
    "asphalt": {
        "base_color": (40, 40, 45),
        "structure": None,
        "grime": 0.4,
        "wear": 0.6,
        "grade": {"val_mult": 0.6},
    },
    "paving": {
        "base_color": (90, 90, 95),
        "structure": "tiles",
        "grime": 0.5,
        "wear": 0.4,
        "grade": {"val_mult": 0.9},
    },
    "grass_dirt": {
        "base_color": (50, 70, 40),
        "structure": None,
        "grime": 0.6,
        "wear": 0.3,
        "grade": {"hue_shift": 20, "sat_mult": 1.0},
    },
    "metal_corrugated": {
        "base_color": (100, 100, 110),
        "structure": "corrugated",
        "grime": 0.5,
        "wear": 0.5,
        "grade": {"val_mult": 0.9, "sat_mult": 0.3},
    },
    "metal_rusted": {
        "base_color": (120, 60, 30),
        "structure": "corrugated",
        "grime": 0.7,
        "wear": 0.8,
        "grade": {"hue_shift": 15, "sat_mult": 1.3},
    },
    "metal_pipes": {
        "base_color": (80, 85, 90),
        "structure": None,
        "grime": 0.4,
        "wear": 0.4,
        "grade": {"sat_mult": 0.2},
    },
    "grating": {
        "base_color": (50, 50, 55),
        "structure": "grating",
        "grime": 0.3,
        "wear": 0.2,
        "grade": {"val_mult": 0.7},
    },
    # Nightmare variants
    "nightmare_wall": {
        "base_color": (40, 10, 10),
        "structure": "corrugated",
        "grime": 0.8,
        "wear": 0.9,
        "grade": {"hue_shift": 0, "sat_mult": 1.5, "val_mult": 0.5},
    },
    "nightmare_floor_grating": {
        "base_color": (30, 5, 5),
        "structure": "grating",
        "grime": 0.9,
        "wear": 0.8,
        "grade": {"val_mult": 0.4},
    },
    "nightmare_floor_blood": {
        "base_color": (50, 5, 5),
        "structure": None,
        "grime": 0.8,
        "wear": 0.7,
        "grade": {"hue_shift": 0, "sat_mult": 1.5, "val_mult": 0.5},
    },
    "nightmare_flesh": {
        "base_color": (80, 20, 25),
        "structure": None,
        "grime": 0.6,
        "wear": 0.5,
        "grade": {"hue_shift": 340, "sat_mult": 1.2, "val_mult": 0.6},
    },
    "nightmare_veins": {
        "base_color": (60, 10, 15),
        "structure": None,
        "grime": 0.7,
        "wear": 0.6,
        "grade": {"hue_shift": 350, "sat_mult": 1.5, "val_mult": 0.5},
    },
    "nightmare_static": {
        "base_color": (20, 20, 25),
        "structure": None,
        "grime": 0.5,
        "wear": 0.3,
        "grade": {"val_mult": 0.5},
    },
}

# ─── Generation ──────────────────────────────────────────────────────────
def generate_texture(name, recipe, seed_offset=0):
    """Generate a single texture."""
    seed = SEED + seed_offset
    shape = (SIZE, SIZE)

    # Base
    base = base_layer(shape, recipe["base_color"], variation=0.08, seed=seed)

    # Structure
    if recipe["structure"]:
        struct = structure_layer(shape, recipe["structure"], seed=seed+100)
        # Apply as overlay
        for c in range(3):
            base[:, :, c] = np.clip(base[:, :, c] * (0.8 + struct * 0.3), 0, 255)

    # Grime
    if recipe["grime"] > 0:
        grime = grime_layer(shape, intensity=recipe["grime"], seed=seed+200)
        for c in range(3):
            base[:, :, c] = np.clip(base[:, :, c] * (1 - grime * 0.5), 0, 255)

    # Wear
    if recipe["wear"] > 0:
        wear = wear_layer(shape, intensity=recipe["wear"], seed=seed+300)
        for c in range(3):
            base[:, :, c] = np.clip(base[:, :, c] * (1 - wear * 0.3), 0, 255)

    # Grade
    grade = recipe.get("grade", {})
    if grade.get("hue_shift"):
        # Simple hue shift via RGB manipulation
        pass
    if grade.get("sat_mult"):
        gray = base[:, :, 0] * 0.299 + base[:, :, 1] * 0.587 + base[:, :, 2] * 0.114
        for c in range(3):
            base[:, :, c] = np.clip(gray + (base[:, :, c] - gray) * grade["sat_mult"], 0, 255)
    if grade.get("val_mult"):
        base = np.clip(base * grade["val_mult"], 0, 255)

    # Make tileable
    for c in range(3):
        base[:, :, c] = tile_wrap(base[:, :, c])

    return base.astype(np.uint8)

def save_texture(arr, name):
    """Save texture to both out and assets dirs."""
    img = Image.fromarray(arr, "RGB")
    # Optimize
    out_path = OUT_DIR / f"{name}.png"
    assets_path = ASSETS_DIR / f"{name}.png"
    img.save(out_path, "PNG", optimize=True)
    img.save(assets_path, "PNG", optimize=True)
    return assets_path.stat().st_size

# ─── Main ────────────────────────────────────────────────────────────────
def main():
    manifest = {"textures": [], "audio": [], "models": "procedural"}

    print(f"Generating {len(TEXTURE_RECIPES)} textures at {SIZE}x{SIZE}...")
    for i, (name, recipe) in enumerate(TEXTURE_RECIPES.items()):
        arr = generate_texture(name, recipe, seed_offset=i)
        size = save_texture(arr, name)
        manifest["textures"].append({
            "name": name,
            "path": f"textures/{name}.png",
            "size": size,
            "generator": "tools/gen_textures.py",
            "license": "CC0"
        })
        print(f"  {name}: {size/1024:.1f} KB")

    # Generate decals
    decal_recipes = {
        "blood_pool": {"base_color": (80, 0, 0), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 0.5}},
        "blood_splatter": {"base_color": (100, 10, 10), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 0.6}},
        "stain_water": {"base_color": (60, 60, 80), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 0.4, "sat_mult": 0.3}},
        "stain_oil": {"base_color": (30, 25, 20), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 0.3}},
        "stain_mould": {"base_color": (40, 60, 40), "structure": None, "grime": 0, "wear": 0, "grade": {"hue_shift": 100, "sat_mult": 0.8, "val_mult": 0.5}},
        "crack_floor": {"base_color": (20, 20, 20), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 0.2}},
        "crack_wall": {"base_color": (30, 30, 30), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 0.3}},
        "scratch_light": {"base_color": (100, 100, 100), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 1.2}},
        "scratch_deep": {"base_color": (20, 20, 20), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 0.2}},
        "footprint_human": {"base_color": (60, 50, 40), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 0.5}},
        "symbol_circle": {"base_color": (100, 20, 20), "structure": None, "grime": 0, "wear": 0, "grade": {"val_mult": 0.6}},
    }

    print("Generating decals...")
    for i, (name, recipe) in enumerate(decal_recipes.items()):
        arr = generate_texture(name, recipe, seed_offset=1000+i)
        size = save_texture(arr, name)
        manifest["textures"].append({
            "name": name,
            "path": f"textures/{name}.png",
            "size": size,
            "generator": "tools/gen_textures.py",
            "license": "CC0"
        })
        print(f"  {name}: {size/1024:.1f} KB")

    # Generate sprites (fog puffs, dust, drips, sparks, moths)
    print("Generating sprites...")
    sprite_names = ["fog_puff", "dust_mote", "drip", "spark", "moth"]
    for i, name in enumerate(sprite_names):
        # Simple circular gradient
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        y, x = np.ogrid[:64, :64]
        center = 32
        dist = np.sqrt((x - center)**2 + (y - center)**2)
        alpha = np.clip((1 - dist / 32) * 255, 0, 255).astype(np.uint8)
        arr[:, :, 3] = alpha
        if "fog" in name or "dust" in name:
            arr[:, :, :3] = [180, 180, 200]
        elif "drip" in name:
            arr[:, :, :3] = [100, 100, 150]
        elif "spark" in name:
            arr[:, :, :3] = [255, 200, 100]
        elif "moth" in name:
            arr[:, :, :3] = [150, 150, 150]
        size = save_texture(arr[:, :, :3], name)  # Save RGB only for now
        manifest["textures"].append({
            "name": name,
            "path": f"textures/{name}.png",
            "size": size,
            "generator": "tools/gen_textures.py",
            "license": "CC0"
        })

    # Save manifest
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest saved to {MANIFEST_PATH}")
    print(f"Textures saved to {ASSETS_DIR}")
    print(f"Total textures: {len(manifest['textures'])}")

if __name__ == "__main__":
    main()