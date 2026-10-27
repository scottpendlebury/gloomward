// src/sim/combat.js — Combat rules, damage, hit reactions
// Exports: CombatSystem, DamageType, HitResult
// Dependencies: entities.js

import { Archetypes, AIState } from './entities.js';

export const DamageType = {
  MELEE: 'MELEE',
  RANGED: 'RANGED',
  ENVIRONMENTAL: 'ENVIRONMENTAL',
  STOMP: 'STOMP',
};

export class HitResult {
  constructor(hit = false, damage = 0, stagger = false, knockback = 0, fatal = false) {
    this.hit = hit;
    this.damage = damage;
    this.stagger = stagger;
    this.knockback = knockback;
    this.fatal = fatal;
  }
}

export class CombatSystem {
  constructor(rng) {
    this.rng = rng;
  }

  // Melee attack: arc sweep, stamina cost, hit detection
  attemptMeleeAttack(attacker, target, grid, dt) {
    const weapon = attacker.components.MeleeWeapon;
    const control = attacker.components.PlayerControl;
    const stamina = attacker.components.Stamina;

    if (!weapon || (stamina && stamina.current < weapon.staminaCost)) {
      return new HitResult(false, 0, false, 0, false);
    }

    if (weapon.cooldown > 0) {
      return new HitResult(false, 0, false, 0, false);
    }

    // Consume stamina
    if (stamina) {
      stamina.current = Math.max(0, stamina.current - weapon.staminaCost);
    }

    // Reset cooldown
    weapon.cooldown = weapon.cooldown || 0.8;

    // Calculate hit cone
    const ax = attacker.components.Transform.x;
    const ay = attacker.components.Transform.y;
    const tx = target.components.Transform.x;
    const ty = target.components.Transform.y;
    const dx = tx - ax;
    const dy = ty - ay;
    const dist = Math.hypot(dx, dy);

    if (dist > weapon.reach) {
      return new HitResult(false, 0, false, 0, false);
    }

    const angle = Math.atan2(dy, dx);
    const facing = attacker.components.Transform.rot;
    const diff = this.angleDiff(facing, angle);

    if (Math.abs(diff) > weapon.arc / 2) {
      return new HitResult(false, 0, false, 0, false);
    }

    // Line of sight check
    const los = grid.raycast(Math.round(ax), Math.round(ay), Math.round(tx), Math.round(ty));
    if (los.hit && los.dist < dist) {
      return new HitResult(false, 0, false, 0, false);
    }

    // Hit!
    const damage = weapon.damage + this.rng.nextFloat(-2, 2);
    return this.applyDamage(target, damage, DamageType.MELEE, attacker);
  }

  // Ranged attack: raycast with spread
  attemptRangedAttack(attacker, target, grid) {
    const weapon = attacker.components.RangedWeapon;
    if (!weapon || weapon.ammo <= 0) return new HitResult(false, 0, false, 0, false);

    weapon.ammo--;

    const ax = attacker.components.Transform.x;
    const ay = attacker.components.Transform.y;
    const tx = target.components.Transform.x;
    const ty = target.components.Transform.y;
    const dx = tx - ax;
    const dy = ty - ay;
    const dist = Math.hypot(dx, dy);

    if (dist > weapon.range) return new HitResult(false, 0, false, 0, false);

    // Apply spread
    const spreadAngle = this.rng.nextFloat(-weapon.spread, weapon.spread);
    const baseAngle = Math.atan2(dy, dx);
    const shotAngle = baseAngle + spreadAngle;

    // Raycast with spread
    const steps = Math.ceil(dist / 0.5);
    for (let i = 1; i <= steps; i++) {
      const cx = Math.round(ax + Math.cos(shotAngle) * i * 0.5);
      const cy = Math.round(ay + Math.sin(shotAngle) * i * 0.5);
      if (grid.isOpaque(cx, cy)) return new HitResult(false, 0, false, 0, false);
      if (i === steps && Math.hypot(cx - tx, cy - ty) < 0.75) break;
    }

    const damage = weapon.damage + this.rng.nextFloat(-3, 3);
    return this.applyDamage(target, damage, DamageType.RANGED, attacker);
  }

  // Stomp downed enemy
  attemptStomp(attacker, target) {
    const corpse = target.components.Corpse;
    if (!corpse || !corpse.stomped) {
      corpse.stomped = true;
      return new HitResult(true, 999, false, 0, true);
    }
    return new HitResult(false, 0, false, 0, false);
  }

  applyDamage(target, damage, type, source) {
    const health = target.components.Health;
    if (!health || health.current <= 0) return new HitResult(false, 0, false, 0, false);

    const ai = target.components.AI;
    const prevHealth = health.current;
    health.current = Math.max(0, health.current - damage);
    health.iframe = 0.3; // Invincibility frames

    // Stagger check
    const staggerThreshold = ai?.params?.staggerThreshold || 30;
    const stagger = damage >= staggerThreshold || health.current <= 0;

    // Knockback
    const knockbackResist = ai?.params?.knockbackResist || 0.5;
    const knockback = stagger ? (1 - knockbackResist) * 2 : 0;

    // Fatal
    const fatal = health.current <= 0;

    // State transitions
    if (ai && !fatal) {
      if (stagger) {
        ai.state = AIState.STAGGER;
        ai.timer = 0.5;
      } else if (ai.state === AIState.DORMANT || ai.state === AIState.WANDER) {
        ai.state = AIState.INVESTIGATE;
        ai.target = source;
        ai.timer = 2.0;
      } else if (ai.state === AIState.INVESTIGATE || ai.state === AIState.CHASE) {
        ai.target = source;
      }
    }

    if (fatal) {
      if (ai) ai.state = AIState.DOWN;
      const corpse = target.components.Corpse;
      if (corpse) corpse.vanishTimer = 30; // Seconds before cleanup
    }

    return new HitResult(true, damage, stagger, knockback, fatal);
  }

  angleDiff(a, b) {
    let diff = a - b;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    return diff;
  }

  // Update cooldowns
  updateCooldowns(entity, dt) {
    const weapon = entity.components.MeleeWeapon;
    if (weapon && weapon.cooldown > 0) {
      weapon.cooldown = Math.max(0, weapon.cooldown - dt);
    }
    const ranged = entity.components.RangedWeapon;
    if (ranged && ranged.cooldown > 0) {
      ranged.cooldown = Math.max(0, ranged.cooldown - dt);
    }
    const health = entity.components.Health;
    if (health && health.iframe > 0) {
      health.iframe = Math.max(0, health.iframe - dt);
    }
    const control = entity.components.PlayerControl;
    if (control && control.dodgeCooldown > 0) {
      control.dodgeCooldown = Math.max(0, control.dodgeCooldown - dt);
    }
  }

  // Dodge roll
  attemptDodge(entity) {
    const control = entity.components.PlayerControl;
    const stamina = entity.components.Stamina;
    if (!control || control.dodgeCooldown > 0) return false;
    if (stamina && stamina.current < 20) return false;

    control.dodgeCooldown = 1.5;
    if (stamina) stamina.current = Math.max(0, stamina.current - 20);

    // Dodge grants brief iframe
    const health = entity.components.Health;
    if (health) health.iframe = 0.4;

    return true;
  }
}