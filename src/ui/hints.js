// src/ui/hints.js — On-screen control hints
// Exports: HintSystem
// Dependencies: none

export class HintSystem {
  constructor() {
    this.hints = [];
    this.visible = true;
    this.fadeTime = 3000;
    this.lastInputTime = Date.now();
    this.createElement();
  }

  createElement() {
    this.container = document.createElement('div');
    this.container.id = 'hint-container';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      pointer-events: none;
      z-index: 100;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      transition: opacity 0.5s;
    `;
    document.body.appendChild(this.container);
  }

  setHints(hints) {
    this.hints = hints;
    this.render();
  }

  addHint(action, label, condition = () => true) {
    this.hints.push({ action, label, condition });
    this.render();
  }

  removeHint(action) {
    this.hints = this.hints.filter(h => h.action !== action);
    this.render();
  }

  render() {
    if (!this.visible) {
      this.container.innerHTML = '';
      return;
    }

    this.container.innerHTML = '';
    for (const hint of this.hints) {
      if (hint.condition && !hint.condition()) continue;

      const el = document.createElement('span');
      el.className = 'hint';
      el.style.cssText = `
        background: rgba(0, 0, 0, 0.7);
        color: #ccc;
        padding: 4px 10px;
        border-radius: 3px;
        font: 11px monospace;
        border: 1px solid #333;
        white-space: nowrap;
      `;
      el.textContent = `${hint.label}: ${hint.action}`;
      this.container.appendChild(el);
    }
  }

  show() {
    this.visible = true;
    this.container.style.opacity = '1';
    this.render();
  }

  hide() {
    this.visible = false;
    this.container.style.opacity = '0';
  }

  update(dt) {
    // Auto-hide after inactivity
    if (Date.now() - this.lastInputTime > this.fadeTime) {
      this.container.style.opacity = '0.3';
    } else {
      this.container.style.opacity = '1';
    }
  }

  onInput() {
    this.lastInputTime = Date.now();
  }

  setContext(context) {
    this.currentContext = context;
    this.render();
  }

  // Predefined hint sets for different contexts
  static getContextHints(context) {
    const contexts = {
      title: [
        { action: 'Click', label: 'Begin' },
      ],
      playing: [
        { action: 'WASD', label: 'Move' },
        { action: 'Mouse', label: 'Look' },
        { action: 'Shift', label: 'Run' },
        { action: 'RMB', label: 'Aim' },
        { action: 'LMB', label: 'Attack' },
        { action: 'E', label: 'Interact' },
        { action: 'F', label: 'Torch' },
        { action: 'R', label: 'Reload' },
        { action: 'Q', label: 'Quick Heal' },
        { action: 'Space', label: 'Dodge' },
        { action: 'Tab', label: 'Inventory' },
        { action: 'M', label: 'Map' },
        { action: 'Esc', label: 'Pause' },
        { action: 'V', label: 'Look Behind' },
      ],
      aiming: [
        { action: 'RMB', label: 'Hold to Aim' },
        { action: 'LMB', label: 'Fire' },
        { action: 'R', label: 'Reload' },
      ],
      inventory: [
        { action: 'Arrows', label: 'Navigate' },
        { action: 'Enter', label: 'Select' },
        { action: 'Tab', label: 'Close' },
      ],
      map: [
        { action: 'M', label: 'Close Map' },
        { action: 'Click', label: 'Scribble' },
      ],
      paused: [
        { action: 'Esc', label: 'Resume' },
        { action: 'Arrows', label: 'Navigate' },
        { action: 'Enter', label: 'Select' },
      ],
      dead: [
        { action: 'Enter', label: 'Continue' },
      ],
    };
    return contexts[context] || [];
  }

  dispose() {
    this.container.remove();
  }
}