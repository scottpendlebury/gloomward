// src/ui/input.js — Keyboard, mouse, gamepad, pointer lock, rebinding
// Exports: InputManager
// Dependencies: none

export class InputManager {
  constructor() {
    this.keyMap = new Map(); // action -> key code
    this.keyState = new Map(); // key code -> { pressed, held, released }
    this.mouseState = { x: 0, y: 0, deltaX: 0, deltaY: 0, buttons: new Set() };
    this.gamepads = new Map(); // index -> GamepadState
    this.actionState = new Map(); // action -> { pressed, held, released }
    this.bindings = new Map(); // action -> { key, gamepadButton, gamepadAxis }
    this.callbacks = new Map(); // action -> Set<callback>
    this.pointerLocked = false;
    this.enabled = true;

    // Default bindings
    this.defaultBindings = {
      moveForward: { key: 'KeyW', gamepadAxis: { index: 1, threshold: 0.2 } },
      moveBackward: { key: 'KeyS', gamepadAxis: { index: 1, threshold: -0.2 } },
      moveLeft: { key: 'KeyA', gamepadAxis: { index: 0, threshold: -0.2 } },
      moveRight: { key: 'KeyD', gamepadAxis: { index: 0, threshold: 0.2 } },
      run: { key: 'ShiftLeft', gamepadButton: 7 }, // LB
      aim: { key: 'MouseRight', gamepadButton: 6 }, // LT
      attack: { key: 'MouseLeft', gamepadButton: 0 }, // A
      interact: { key: 'KeyE', gamepadButton: 1 }, // B
      torch: { key: 'KeyF', gamepadButton: 3 }, // Y
      reload: { key: 'KeyR', gamepadButton: 2 }, // X
      quickHeal: { key: 'KeyQ', gamepadButton: 4 }, // RB
      dodge: { key: 'Space', gamepadButton: 1 }, // B (double tap)
      inventory: { key: 'Tab', gamepadButton: 9 }, // Start
      map: { key: 'KeyM', gamepadButton: 8 }, // Back
      pause: { key: 'Escape', gamepadButton: 9 }, // Start
      lookBehind: { key: 'KeyV', gamepadButton: 5 }, // RT
      cameraReset: { key: 'KeyC', gamepadButton: 10 }, // L3
      nextItem: { key: 'Digit1', gamepadAxis: { index: 2, threshold: 0.5 } },
      prevItem: { key: 'Digit2', gamepadAxis: { index: 2, threshold: -0.5 } },
    };

    this.init();
  }

  init() {
    // Keyboard
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Mouse
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Pointer lock
    this.canvas = document.querySelector('canvas');
    if (this.canvas) {
      this.canvas.addEventListener('click', () => this.requestPointerLock());
    }

    // Gamepad
    window.addEventListener('gamepadconnected', (e) => this.onGamepadConnected(e));
    window.addEventListener('gamepaddisconnected', (e) => this.onGamepadDisconnected(e));

    // Apply default bindings
    for (const [action, binding] of Object.entries(this.defaultBindings)) {
      this.bind(action, binding);
    }
  }

  onKeyDown(e) {
    if (!this.enabled) return;
    const code = e.code;
    if (this.keyState.has(code) && this.keyState.get(code).held) return;

    this.keyState.set(code, { pressed: true, held: true, released: false });
    this.updateActionStates();
  }

  onKeyUp(e) {
    if (!this.enabled) return;
    const code = e.code;
    const state = this.keyState.get(code) || { pressed: false, held: false, released: false };
    state.pressed = false;
    state.held = false;
    state.released = true;
    this.keyState.set(code, state);
    this.updateActionStates();
  }

  onMouseMove(e) {
    if (!this.pointerLocked) return;
    this.mouseState.deltaX = e.movementX;
    this.mouseState.deltaY = e.movementY;
    this.mouseState.x += e.movementX;
    this.mouseState.y += e.movementY;
  }

  onMouseDown(e) {
    this.mouseState.buttons.add(e.button);
    const mouseKey = `Mouse${e.button === 0 ? 'Left' : e.button === 1 ? 'Middle' : 'Right'}`;
    this.keyState.set(mouseKey, { pressed: true, held: true, released: false });
    this.updateActionStates();
  }

  onMouseUp(e) {
    this.mouseState.buttons.delete(e.button);
    const mouseKey = `Mouse${e.button === 0 ? 'Left' : e.button === 1 ? 'Middle' : 'Right'}`;
    const state = this.keyState.get(mouseKey) || { pressed: false, held: false, released: false };
    state.pressed = false;
    state.held = false;
    state.released = true;
    this.keyState.set(mouseKey, state);
    this.updateActionStates();
  }

  onGamepadConnected(e) {
    this.gamepads.set(e.gamepad.index, e.gamepad);
  }

  onGamepadDisconnected(e) {
    this.gamepads.delete(e.gamepad.index);
  }

  updateGamepads() {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp) {
        this.gamepads.set(gp.index, gp);
      }
    }
  }

  requestPointerLock() {
    if (this.canvas && !this.pointerLocked) {
      this.canvas.requestPointerLock().catch(() => {});
    }
  }

  exitPointerLock() {
    if (this.pointerLocked) {
      document.exitPointerLock();
    }
  }

  onPointerLockChange() {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  }

  bind(action, binding) {
    this.bindings.set(action, binding);
    if (!this.actionState.has(action)) {
      this.actionState.set(action, { pressed: false, held: false, released: false });
    }
  }

  unbind(action) {
    this.bindings.delete(action);
    this.actionState.delete(action);
  }

  rebind(action, newBinding) {
    this.bind(action, newBinding);
  }

  getBinding(action) {
    return this.bindings.get(action);
  }

  getAllBindings() {
    return Object.fromEntries(this.bindings);
  }

  updateActionStates() {
    for (const [action, binding] of this.bindings) {
      let pressed = false;
      let held = false;
      let released = false;

      // Check keyboard
      if (binding.key) {
        const keyState = this.keyState.get(binding.key);
        if (keyState) {
          pressed = pressed || keyState.pressed;
          held = held || keyState.held;
          released = released || keyState.released;
        }
      }

      // Check gamepad button
      if (binding.gamepadButton !== undefined) {
        for (const gp of this.gamepads.values()) {
          if (gp.buttons[binding.gamepadButton]?.pressed) {
            pressed = true;
            held = true;
          }
        }
      }

      // Check gamepad axis
      if (binding.gamepadAxis) {
        for (const gp of this.gamepads.values()) {
          const axisValue = gp.axes[binding.gamepadAxis.index] || 0;
          const threshold = binding.gamepadAxis.threshold;
          if ((threshold > 0 && axisValue > threshold) || (threshold < 0 && axisValue < threshold)) {
            held = true;
          }
        }
      }

      const prevState = this.actionState.get(action) || { pressed: false, held: false, released: false };
      const newState = { pressed, held, released };

      // Trigger callbacks on press
      if (pressed && !prevState.held) {
        this.triggerCallbacks(action, 'pressed');
      }
      // Trigger callbacks on release
      if (released && prevState.held) {
        this.triggerCallbacks(action, 'released');
      }
      // Trigger callbacks on hold
      if (held) {
        this.triggerCallbacks(action, 'held');
      }

      this.actionState.set(action, newState);
    }
  }

  triggerCallbacks(action, type) {
    const callbacks = this.callbacks.get(action);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(type); } catch (e) { console.error('Input callback error:', e); }
      }
    }
  }

  on(action, callback) {
    if (!this.callbacks.has(action)) {
      this.callbacks.set(action, new Set());
    }
    this.callbacks.get(action).add(callback);
    return () => this.callbacks.get(action)?.delete(callback);
  }

  off(action, callback) {
    this.callbacks.get(action)?.delete(callback);
  }

  getActionState(action) {
    return this.actionState.get(action) || { pressed: false, held: false, released: false };
  }

  isPressed(action) {
    return this.getActionState(action).pressed;
  }

  isHeld(action) {
    return this.getActionState(action).held;
  }

  isReleased(action) {
    return this.getActionState(action).released;
  }

  getMouseDelta() {
    const delta = { x: this.mouseState.deltaX, y: this.mouseState.deltaY };
    this.mouseState.deltaX = 0;
    this.mouseState.deltaY = 0;
    return delta;
  }

  getGamepad(index = 0) {
    const gp = this.gamepads.get(index);
    if (!gp) return null;

    return {
      axes: gp.axes.map(a => a || 0),
      buttons: gp.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
      connected: gp.connected,
      id: gp.id,
      index: gp.index,
    };
  }

  getGamepadState(index = 0) {
    return this.getGamepad(index);
  }

  setPointerLock(enabled) {
    if (enabled && !this.pointerLocked) {
      this.requestPointerLock();
    } else if (!enabled && this.pointerLocked) {
      this.exitPointerLock();
    }
  }

  isPointerLocked() {
    return this.pointerLocked;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    this.keyState.clear();
    this.actionState.forEach(v => { v.pressed = false; v.held = false; v.released = true; });
  }

  update(dt) {
    this.updateGamepads();
    this.updateActionStates();
  }

  // Save/load bindings
  serialize() {
    const data = {};
    for (const [action, binding] of this.bindings) {
      data[action] = { ...binding };
    }
    return data;
  }

  deserialize(data) {
    for (const [action, binding] of Object.entries(data)) {
      this.bind(action, binding);
    }
  }

  // Get hints for UI
  getHints() {
    const hints = [];
    for (const [action, binding] of this.bindings) {
      let label = '';
      if (binding.key) {
        label = binding.key.replace('Key', '').replace('Digit', '').replace('ShiftLeft', 'Shift').replace('Space', 'Space').replace('Escape', 'Esc');
      } else if (binding.gamepadButton !== undefined) {
        const btnNames = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right'];
        label = btnNames[binding.gamepadButton] || `Btn${binding.gamepadButton}`;
      }
      if (label) {
        hints.push({ action, label });
      }
    }
    return hints;
  }
}