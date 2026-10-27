// src/gen/props.js — Prop placement, clutter, decals
// Exports: PropRegistry, placeProps, placeDecals, generateClutter
// Dependencies: rng.js, grid.js

import { SeededRNG } from '../sim/rng.js';
import { GridWorld, CellType } from '../sim/grid.js';

export const PropRegistry = {
  // Furniture
  sofa: { w: 3, h: 2, variants: ['fabric_torn', 'leather_cracked', 'burnt'], height: 1.2, collider: true },
  bed: { w: 2, h: 3, variants: ['single', 'double', 'bunk'], height: 1.0, collider: true },
  wardrobe: { w: 2, h: 1, variants: ['wood', 'metal', 'broken'], height: 2.0, collider: true, interactable: true },
  desk: { w: 2, h: 1, variants: ['office', 'writing', 'computer'], height: 0.75, collider: true },
  office_chair: { w: 1, h: 1, variants: ['mesh', 'leather', 'broken'], height: 1.1, collider: true },
  table: { w: 2, h: 2, variants: ['wood', 'metal', 'coffee'], height: 0.75, collider: true },
  coffee_table: { w: 2, h: 1, variants: ['wood', 'glass', 'metal'], height: 0.45, collider: true },
  chair: { w: 1, h: 1, variants: ['wood', 'metal', 'folding'], height: 1.0, collider: true },
  shelf: { w: 2, h: 1, variants: ['wood', 'metal', 'floating'], height: 1.8, collider: true },
  cabinet: { w: 1, h: 1, variants: ['kitchen', 'bathroom', 'filing'], height: 0.9, collider: true, interactable: true },
  fridge: { w: 1, h: 1, variants: ['modern', 'old', 'empty'], height: 1.8, collider: true, interactable: true },
  stove: { w: 1, h: 1, variants: ['gas', 'electric'], height: 0.9, collider: true },
  sink: { w: 1, h: 1, variants: ['kitchen', 'bathroom', 'industrial'], height: 0.9, collider: true },
  toilet: { w: 1, h: 1, variants: ['standard', 'wall'], height: 0.4, collider: true },
  bathtub: { w: 2, h: 1, variants: ['clawfoot', 'standard'], height: 0.6, collider: true },
  tv: { w: 2, h: 1, variants: ['crt', 'flat', 'broken'], height: 0.6, collider: true },
  lamp: { w: 1, h: 1, variants: ['floor', 'table', 'desk'], height: 1.5, collider: false, lightSource: true },
  computer: { w: 1, h: 1, variants: ['desktop', 'monitor', 'terminal'], height: 0.4, collider: true },
  plant: { w: 1, h: 1, variants: ['fern', 'tree', 'dead'], height: 1.5, collider: false },
  coat_rack: { w: 1, h: 1, variants: ['stand', 'wall'], height: 1.8, collider: true },
  mirror: { w: 1, h: 1, variants: ['full', 'cracked', 'bloody'], height: 1.8, collider: false, reflective: true },

  // Medical
  medical_bed: { w: 2, h: 1, variants: ['standard', 'gurney', 'restrained'], height: 0.8, collider: true },
  cart: { w: 1, h: 1, variants: ['medical', 'tool', 'food'], height: 0.9, collider: true, interactable: true },
  monitor: { w: 1, h: 1, variants: ['vitals', 'screen', 'broken'], height: 0.3, collider: true },

  // Industrial
  crate: { w: 1, h: 1, variants: ['wood', 'metal', 'plastic', 'open'], height: 1.0, collider: true, interactable: true, lootable: true },
  barrel: { w: 1, h: 1, variants: ['metal', 'plastic', 'leaking'], height: 1.0, collider: true },
  pallet: { w: 2, h: 1, variants: ['wood', 'plastic'], height: 0.2, collider: true },
  pipe: { w: 1, h: 3, variants: ['vertical', 'horizontal', 'broken'], height: 3.0, collider: true },
  machine: { w: 3, h: 2, variants: ['press', 'conveyor', 'generator', 'pump'], height: 2.0, collider: true },
  conveyor: { w: 4, h: 1, variants: ['straight', 'curve'], height: 0.5, collider: true },
  generator: { w: 2, h: 2, variants: ['diesel', 'electric'], height: 1.5, collider: true, lightSource: true, sound: 'generator' },
  pump: { w: 1, h: 1, variants: ['water', 'fuel'], height: 1.2, collider: true, sound: 'pump' },
  tank: { w: 2, h: 2, variants: ['water', 'fuel', 'chemical'], height: 2.0, collider: true },
  vent: { w: 1, h: 1, variants: ['floor', 'wall', 'ceiling'], height: 0.1, collider: false },
  grate: { w: 1, h: 1, variants: ['floor', 'wall'], height: 0.1, collider: false, seeThrough: true },

  // Outdoor
  car: { w: 2, h: 4, variants: ['sedan', 'truck', 'van', 'wrecked'], height: 1.5, collider: true },
  barrier: { w: 3, h: 1, variants: ['concrete', 'metal', 'wood'], height: 1.0, collider: true },
  debris: { w: 2, h: 2, variants: ['rubble', 'trash', 'rubble_burnt'], height: 0.5, collider: false },
  light: { w: 1, h: 1, variants: ['street', 'flood', 'emergency'], height: 4.0, collider: false, lightSource: true },
  hydrant: { w: 1, h: 1, variants: ['standard', 'broken'], height: 1.0, collider: true },
  bin: { w: 1, h: 1, variants: ['metal', 'plastic', 'overflowing'], height: 1.0, collider: true, interactable: true },
  fence: { w: 1, h: 1, variants: ['chainlink', 'wood', 'metal'], height: 1.5, collider: true },
  sign: { w: 2, h: 1, variants: ['street', 'shop', 'warning', 'graffiti'], height: 3.0, collider: false },
  vending: { w: 1, h: 1, variants: ['drinks', 'snacks', 'broken'], height: 2.0, collider: true, interactable: true },
  bench: { w: 2, h: 1, variants: ['wood', 'metal', 'broken'], height: 0.45, collider: true },
  phone_booth: { w: 1, h: 1, variants: ['intact', 'broken', 'gutted'], height: 2.5, collider: true, interactable: true },

  // Nightmare
  flesh_growth: { w: 2, h: 2, variants: ['pulsing', 'veined', 'toothed'], height: 0.5, collider: false, animated: true },
  rusted_machinery: { w: 2, h: 2, variants: ['gears', 'pistons', 'turbine'], height: 1.5, collider: true, animated: true },
  hanging_chains: { w: 1, h: 3, variants: ['hooks', 'cages', 'bodies'], height: 3.0, collider: false, animated: true },
  pulsing_organ: { w: 1, h: 1, variants: ['heart', 'lung', 'eye'], height: 0.5, collider: false, animated: true, lightSource: true },
  wrong_door: { w: 1, h: 2, variants: ['standard', 'vault', 'cell'], height: 2.0, collider: true, interactable: true },

  // Decorative clutter (small, non-colliding)
  clutter: {
    paper: { w: 0.5, h: 0.5, variants: ['note', 'newspaper', 'photo', 'document'], height: 0.01 },
    bottle: { w: 0.3, h: 0.3, variants: ['pill', 'alcohol', 'chemical', 'water'], height: 0.2 },
    can: { w: 0.2, h: 0.2, variants: ['food', 'drink', 'paint'], height: 0.15 },
    tool: { w: 0.5, h: 0.3, variants: ['wrench', 'hammer', 'screwdriver', 'pliers'], height: 0.05 },
    toy: { w: 0.4, h: 0.4, variants: ['doll', 'car', 'block', 'plush'], height: 0.1 },
    bone: { w: 0.5, h: 0.2, variants: ['rib', 'skull', 'femur'], height: 0.02 },
    candle: { w: 0.1, h: 0.1, variants: ['lit', 'unlit', 'melted'], height: 0.1, lightSource: true },
    syringe: { w: 0.2, h: 0.1, variants: ['full', 'empty', 'used'], height: 0.02 },
    key: { w: 0.3, h: 0.1, variants: ['brass', 'iron', 'modern'], height: 0.02 },
    coin: { w: 0.2, h: 0.2, variants: ['copper', 'silver', 'token'], height: 0.01 },
  },
};

export const DecalRegistry = {
  blood: { variants: ['pool', 'splatter', 'trail', 'handprint', 'drip'], size: [1, 2], alpha: 0.8 },
  stain: { variants: ['water', 'oil', 'chemical', 'mould', 'rust'], size: [1, 3], alpha: 0.5 },
  crack: { variants: ['floor', 'wall', 'ceiling', 'glass'], size: [0.5, 2], alpha: 0.7 },
  scratch: { variants: ['light', 'deep', 'claw', 'tool'], size: [0.3, 1], alpha: 0.6 },
  mould: { variants: ['corner', 'spread', 'patch', 'dripping'], size: [0.5, 2], alpha: 0.6 },
  scrawl: { variants: ['help', 'run', 'eyes', 'symbol', 'tally', 'name'], size: [1, 2], alpha: 0.9 },
  symbol: { variants: ['circle', 'cross', 'spiral', 'rune', 'arrow'], size: [0.5, 1.5], alpha: 0.8 },
  footprint: { variants: ['human', 'bare', 'boot', 'claw', 'dragged'], size: [0.5, 1], alpha: 0.5 },
  bullet_hole: { variants: ['single', 'cluster', 'through'], size: [0.1, 0.3], alpha: 0.9 },
  scorch: { variants: ['small', 'large', 'explosion'], size: [1, 3], alpha: 0.7 },
};

export function placeProps(rng, grid, room, theme, density = 1.0) {
  const props = [];
  const templates = getPropTemplatesForTheme(theme);
  const roomTemplates = templates[room.type] || templates.generic;

  // Large props at anchors
  if (room.templateAnchors && room.templateAnchors.props) {
    for (const anchor of room.templateAnchors.props) {
      if (grid.isWalkable(anchor.x, anchor.y) && rng.next() < 0.6 * density) {
        const propType = rng.choice(roomTemplates);
        const propDef = PropRegistry[propType];
        if (propDef) {
          grid.setProp(anchor.x, anchor.y, {
            type: propType,
            variant: rng.nextInt(propDef.variants?.length || 1),
            rotation: rng.choice([0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]),
          });
          props.push({ x: anchor.x, y: anchor.y, type: propType });
        }
      }
    }
  }

  // Random clutter
  const clutterCount = Math.floor(room.area / 8) * density;
  for (let i = 0; i < clutterCount; i++) {
    const pos = room.getRandomWalkable(grid, rng, 1);
    if (!pos) continue;

    if (rng.next() < 0.15) {
      const clutterType = rng.choice(Object.keys(PropRegistry.clutter));
      const clutterDef = PropRegistry.clutter[clutterType];
      grid.setProp(pos.x, pos.y, {
        type: 'clutter_' + clutterType,
        variant: rng.nextInt(clutterDef.variants.length),
        clutter: true,
      });
      props.push({ x: pos.x, y: pos.y, type: 'clutter_' + clutterType, clutter: true });
    }
  }

  return props;
}

export function placeDecals(rng, grid, room, theme, density = 1.0) {
  const decals = [];
  const decalCount = Math.floor(room.area / 15) * density;

  for (let i = 0; i < decalCount; i++) {
    const pos = room.getRandomWalkable(grid, rng, 1);
    if (!pos) continue;

    const decalType = rng.choice(Object.keys(DecalRegistry));
    const decalDef = DecalRegistry[decalType];
    const variant = rng.choice(decalDef.variants);
    const size = decalDef.size[0] + rng.next() * (decalDef.size[1] - decalDef.size[0]);
    const rotation = rng.next() * Math.PI * 2;

    decals.push({
      x: pos.x + (rng.next() - 0.5) * 0.5,
      y: pos.y + (rng.next() - 0.5) * 0.5,
      type: decalType,
      variant,
      size,
      rotation,
      alpha: decalDef.alpha * (0.7 + rng.next() * 0.3),
    });
  }

  // Add thematic decals near props
  for (const prop of room.props || []) {
    if (prop.type.includes('bed') && rng.next() < 0.3) {
      decals.push({
        x: prop.x + (rng.next() - 0.5),
        y: prop.y + (rng.next() - 0.5),
        type: 'stain',
        variant: rng.choice(['blood', 'mould']),
        size: 1.5,
        rotation: rng.next() * Math.PI * 2,
        alpha: 0.6,
      });
    }
    if (prop.type.includes('bathtub') && rng.next() < 0.4) {
      decals.push({
        x: prop.x,
        y: prop.y + 1,
        type: 'stain',
        variant: 'mould',
        size: 2,
        rotation: 0,
        alpha: 0.5,
      });
    }
    if (prop.type.includes('car') && prop.variant === 'wrecked' && rng.next() < 0.5) {
      decals.push({
        x: prop.x,
        y: prop.y,
        type: 'scorch',
        variant: 'large',
        size: 3,
        rotation: rng.next() * Math.PI * 2,
        alpha: 0.7,
      });
    }
  }

  return decals;
}

function getPropTemplatesForTheme(theme) {
  return {
    generic: ['crate', 'barrel', 'pallet', 'chair', 'table', 'debris'],
    living_room: ['sofa', 'tv', 'coffee_table', 'lamp', 'plant', 'chair'],
    bedroom: ['bed', 'wardrobe', 'nightstand', 'lamp', 'chair'],
    kitchen: ['counter', 'fridge', 'stove', 'sink', 'cabinet', 'table'],
    bathroom: ['toilet', 'bathtub', 'sink', 'cabinet', 'mirror'],
    hallway: ['coat_rack', 'mirror', 'plant', 'bench'],
    office: ['desk', 'office_chair', 'filing_cabinet', 'computer', 'plant', 'shelf'],
    clinic_exam: ['medical_bed', 'cart', 'cabinet', 'monitor', 'shelf'],
    factory: ['crate', 'pipe', 'machine', 'barrel', 'pallet', 'generator', 'tank', 'vent'],
    streets: ['car', 'barrier', 'debris', 'light', 'hydrant', 'bin', 'bench', 'vending', 'phone_booth'],
  };
}

export function generateClutter(rng, grid, x, y, radius, theme) {
  const clutter = [];
  const clutterTypes = Object.keys(PropRegistry.clutter);

  for (let i = 0; i < 10; i++) {
    const angle = rng.next() * Math.PI * 2;
    const dist = rng.next() * radius;
    const cx = Math.round(x + Math.cos(angle) * dist);
    const cy = Math.round(y + Math.sin(angle) * dist);

    if (grid.inBounds(cx, cy) && grid.isWalkable(cx, cy)) {
      const type = rng.choice(clutterTypes);
      clutter.push({
        x: cx + (rng.next() - 0.5) * 0.3,
        y: cy + (rng.next() - 0.5) * 0.3,
        type: 'clutter_' + type,
        variant: rng.nextInt(PropRegistry.clutter[type].variants.length),
        clutter: true,
      });
    }
  }

  return clutter;
}

export function getPropDefinition(type) {
  return PropRegistry[type] || PropRegistry.clutter[type.replace('clutter_', '')] || null;
}

export function isInteractableProp(type) {
  const def = getPropDefinition(type);
  return def?.interactable === true;
}

export function isLootableProp(type) {
  const def = getPropDefinition(type);
  return def?.lootable === true;
}

export function getPropLightSource(type) {
  const def = getPropDefinition(type);
  return def?.lightSource ? { color: 0xffeedd, intensity: 0.5, radius: 3 } : null;
}