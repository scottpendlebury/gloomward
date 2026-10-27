// src/ui/menus.js — Title, pause, hub, death, inventory, map, notes, archive
// Exports: MenuSystem
// Dependencies: input.js

export class MenuSystem {
  constructor(inputManager, game) {
    this.input = inputManager;
    this.game = game;
    this.currentMenu = null;
    this.menuStack = [];
    this.elements = new Map();
    this.selectedIndex = 0;
    this.visible = false;

    this.createMenus();
    this.bindInput();
  }

  createMenus() {
    // Title screen
    this.createTitleMenu();

    // Pause menu
    this.createPauseMenu();

    // Hub menu
    this.createHubMenu();

    // Death menu
    this.createDeathMenu();

    // Inventory
    this.createInventoryMenu();

    // Map
    this.createMapMenu();

    // Notes archive
    this.createNotesMenu();

    // Options
    this.createOptionsMenu();

    // Settings submenus
    this.createGraphicsMenu();
    this.createAudioMenu();
    this.createControlsMenu();
    this.createAccessibilityMenu();

    // New run / Continue
    this.createNewRunMenu();
    this.createContinueMenu();

    // Hide all initially
    this.hideAll();
  }

  createTitleMenu() {
    const container = this.createElement('div', 'menu title-menu', `
      <div class="menu-bg"></div>
      <div class="menu-content">
        <h1 class="game-title">GLOOMWARD</h1>
        <p class="version">v0.1.0</p>
        <div class="menu-options">
          <button data-action="new-run">New Run</button>
          <button data-action="continue">Continue</button>
          <button data-action="hub">Hub</button>
          <button data-action="options">Options</button>
          <button data-action="credits">Credits</button>
          <button data-action="quit">Quit</button>
        </div>
        <p class="prompt">Click to begin</p>
      </div>
    `);
    this.elements.set('title', container);
  }

  createPauseMenu() {
    const container = this.createElement('div', 'menu pause-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content">
        <h2>PAUSED</h2>
        <div class="menu-options">
          <button data-action="resume">Resume</button>
          <button data-action="save">Save Game</button>
          <button data-action="options">Options</button>
          <button data-action="hub">Return to Hub</button>
          <button data-action="quit">Quit to Title</button>
        </div>
      </div>
    `);
    this.elements.set('pause', container);
  }

  createHubMenu() {
    const container = this.createElement('div', 'menu hub-menu hidden', `
      <div class="menu-bg"></div>
      <div class="menu-content">
        <h2>THE SANCTUM</h2>
        <div class="hub-stats">
          <span>Echoes: <span id="hub-currency">0</span></span>
          <span>Runs: <span id="hub-runs">0</span></span>
        </div>
        <div class="menu-options">
          <button data-action="new-run">New Run</button>
          <button data-action="loadouts">Loadouts</button>
          <button data-action="relics">Relics</button>
          <button data-action="archive">Archive</button>
          <button data-action="options">Options</button>
          <button data-action="title">Title Screen</button>
        </div>
      </div>
    `);
    this.elements.set('hub', container);
  }

  createDeathMenu() {
    const container = this.createElement('div', 'menu death-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content">
        <h2 class="death-title">YOU DIED</h2>
        <div class="run-summary" id="death-summary">
          <div class="stat"><span>Act:</span> <span id="death-act">1</span></div>
          <div class="stat"><span>Floor:</span> <span id="death-floor">1</span></div>
          <div class="stat"><span>Time:</span> <span id="death-time">0:00</span></div>
          <div class="stat"><span>Kills:</span> <span id="death-kills">0</span></div>
          <div class="stat"><span>Echoes Earned:</span> <span id="death-echoes">0</span></div>
        </div>
        <div class="menu-options">
          <button data-action="new-run">New Run</button>
          <button data-action="hub">Hub</button>
          <button data-action="title">Title Screen</button>
        </div>
      </div>
    `);
    this.elements.set('death', container);
  }

  createInventoryMenu() {
    const container = this.createElement('div', 'menu inventory-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content inventory-content">
        <h2>INVENTORY</h2>
        <div class="inventory-grid" id="inventory-grid"></div>
        <div class="item-detail" id="item-detail">
          <h3 id="detail-name"></h3>
          <p id="detail-desc"></p>
          <div class="detail-actions">
            <button data-action="use-item">Use</button>
            <button data-action="drop-item">Drop</button>
            <button data-action="examine-item">Examine</button>
          </div>
        </div>
        <div class="menu-hints">
          <span>[Tab] Close</span>
          <span>[Arrows] Navigate</span>
          <span>[Enter] Select</span>
        </div>
      </div>
    `);
    this.elements.set('inventory', container);
  }

  createMapMenu() {
    const container = this.createElement('div', 'menu map-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content map-content">
        <h2>MAP</h2>
        <canvas id="map-canvas" width="512" height="512"></canvas>
        <div class="map-legend">
          <span class="legend-item"><span class="color explored"></span>Explored</span>
          <span class="legend-item"><span class="color current"></span>Current</span>
          <span class="legend-item"><span class="color locked"></span>Locked</span>
          <span class="legend-item"><span class="color exit"></span>Exit</span>
          <span class="legend-item"><span class="color note"></span>Note</span>
        </div>
        <div class="menu-hints">
          <span>[M] Close</span>
          <span>[Click] Scribble</span>
        </div>
      </div>
    `);
    this.elements.set('map', container);
  }

  createNotesMenu() {
    const container = this.createElement('div', 'menu notes-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content notes-content">
        <h2>NOTES & ARCHIVE</h2>
        <div class="notes-tabs">
          <button class="tab active" data-tab="current">Current Run</button>
          <button class="tab" data-tab="archive">Archive</button>
          <button class="tab" data-tab="bestiary">Bestiary</button>
        </div>
        <div class="notes-list" id="notes-list"></div>
        <div class="note-viewer" id="note-viewer">
          <h3 id="viewer-title"></h3>
          <pre id="viewer-text"></pre>
        </div>
      </div>
    `);
    this.elements.set('notes', container);
  }

  createOptionsMenu() {
    const container = this.createElement('div', 'menu options-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content">
        <h2>OPTIONS</h2>
        <div class="menu-options">
          <button data-action="graphics">Graphics</button>
          <button data-action="audio">Audio</button>
          <button data-action="controls">Controls</button>
          <button data-action="accessibility">Accessibility</button>
          <button data-action="gameplay">Gameplay</button>
          <button data-action="back">Back</button>
        </div>
      </div>
    `);
    this.elements.set('options', container);
  }

  createGraphicsMenu() {
    const container = this.createElement('div', 'menu graphics-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content">
        <h2>GRAPHICS</h2>
        <div class="option-group">
          <label>Quality Preset</label>
          <select id="opt-quality">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="option-group">
          <label>Internal Resolution</label>
          <select id="opt-resolution">
            <option value="640x360">640×360</option>
            <option value="854x480" selected>854×480</option>
            <option value="1024x576">1024×576</option>
          </select>
        </div>
        <div class="option-group">
          <label>Film Grain <span id="grain-val">8</span>%</label>
          <input type="range" id="opt-grain" min="0" max="100" value="8">
        </div>
        <div class="option-group">
          <label>Dithering <span id="dither-val">50</span>%</label>
          <input type="range" id="opt-dither" min="0" max="100" value="50">
        </div>
        <div class="option-group">
          <label>Vignette <span id="vignette-val">60</span>%</label>
          <input type="range" id="opt-vignette" min="0" max="100" value="60">
        </div>
        <div class="option-group">
          <label>Chromatic Aberration</label>
          <input type="checkbox" id="opt-ca" checked>
        </div>
        <div class="option-group">
          <label>Scanlines</label>
          <input type="checkbox" id="opt-scanlines">
        </div>
        <div class="option-group">
          <label>Pixelated Upscaling</label>
          <input type="checkbox" id="opt-pixelated" checked>
        </div>
        <div class="option-group">
          <label>FOV <span id="fov-val">60</span></label>
          <input type="range" id="opt-fov" min="45" max="90" value="60">
        </div>
        <div class="option-group">
          <label>Mouse Sensitivity <span id="sens-val">1.00</span></label>
          <input type="range" id="opt-sens" min="0.1" max="3" step="0.05" value="1">
        </div>
        <div class="option-group">
          <label>Invert Y</label>
          <input type="checkbox" id="opt-invert-y">
        </div>
        <button data-action="back">Back</button>
      </div>
    `);
    this.elements.set('graphics', container);
  }

  createAudioMenu() {
    const container = this.createElement('div', 'menu audio-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content">
        <h2>AUDIO</h2>
        <div class="option-group">
          <label>Master <span id="master-val">100</span>%</label>
          <input type="range" id="opt-master" min="0" max="100" value="100">
        </div>
        <div class="option-group">
          <label>Music <span id="music-val">70</span>%</label>
          <input type="range" id="opt-music" min="0" max="100" value="70">
        </div>
        <div class="option-group">
          <label>SFX <span id="sfx-val">80</span>%</label>
          <input type="range" id="opt-sfx" min="0" max="100" value="80">
        </div>
        <div class="option-group">
          <label>Ambience <span id="amb-val">60</span>%</label>
          <input type="range" id="opt-amb" min="0" max="100" value="60">
        </div>
        <div class="option-group">
          <label>Radio <span id="radio-val">50</span>%</label>
          <input type="range" id="opt-radio" min="0" max="100" value="50">
        </div>
        <button data-action="back">Back</button>
      </div>
    `);
    this.elements.set('audio', container);
  }

  createControlsMenu() {
    const container = this.createElement('div', 'menu controls-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content">
        <h2>CONTROLS</h2>
        <div class="bindings-list" id="bindings-list"></div>
        <div class="option-group">
          <label>Tank Controls</label>
          <input type="checkbox" id="opt-tank">
        </div>
        <div class="option-group">
          <label>Gamepad Rumble</label>
          <input type="checkbox" id="opt-rumble" checked>
        </div>
        <button data-action="reset-bindings">Reset to Defaults</button>
        <button data-action="back">Back</button>
      </div>
    `);
    this.elements.set('controls', container);
  }

  createAccessibilityMenu() {
    const container = this.createElement('div', 'menu accessibility-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content">
        <h2>ACCESSIBILITY</h2>
        <div class="option-group">
          <label>Reduce Camera Shake</label>
          <input type="checkbox" id="opt-reduce-shake">
        </div>
        <div class="option-group">
          <label>Reduce Flashing</label>
          <input type="checkbox" id="opt-reduce-flash">
        </div>
        <div class="option-group">
          <label>Sound Captions</label>
          <input type="checkbox" id="opt-captions">
        </div>
        <div class="option-group">
          <label>Colour Blind Safe Markers</label>
          <input type="checkbox" id="opt-colourblind">
        </div>
        <div class="option-group">
          <label>Hold/Toggle Aim</label>
          <select id="opt-aim-mode">
            <option value="hold">Hold</option>
            <option value="toggle">Toggle</option>
          </select>
        </div>
        <div class="option-group">
          <label>Hold/Toggle Run</label>
          <select id="opt-run-mode">
            <option value="hold">Hold</option>
            <option value="toggle">Toggle</option>
          </select>
        </div>
        <div class="option-group">
          <label>Text Size <span id="text-size-val">100</span>%</label>
          <input type="range" id="opt-text-size" min="80" max="150" value="100">
        </div>
        <button data-action="back">Back</button>
      </div>
    `);
    this.elements.set('accessibility', container);
  }

  createNewRunMenu() {
    const container = this.createElement('div', 'menu new-run-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content">
        <h2>NEW RUN</h2>
        <div class="option-group">
          <label>Seed (empty for random)</label>
          <input type="text" id="opt-seed" placeholder="Random">
        </div>
        <div class="option-group">
          <label>Difficulty</label>
          <select id="opt-difficulty">
            <option value="0">Normal</option>
            <option value="1">Nightmare I</option>
            <option value="2">Nightmare II</option>
            <option value="3">Nightmare III</option>
            <option value="4">Nightmare IV</option>
            <option value="5">Nightmare V</option>
          </select>
        </div>
        <div class="option-group">
          <label>Starting Kit</label>
          <select id="opt-kit">
            <option value="survivor">Survivor</option>
            <option value="scavenger">Scavenger</option>
            <option value="berserker">Berserker</option>
            <option value="occultist">Occultist</option>
          </select>
        </div>
        <div class="menu-options">
          <button data-action="start-run">Start</button>
          <button data-action="back">Back</button>
        </div>
      </div>
    `);
    this.elements.set('new-run', container);
  }

  createContinueMenu() {
    const container = this.createElement('div', 'menu continue-menu hidden', `
      <div class="menu-overlay"></div>
      <div class="menu-content">
        <h2>CONTINUE</h2>
        <div id="save-info">No save found</div>
        <div class="menu-options">
          <button data-action="load-save">Load</button>
          <button data-action="delete-save">Delete</button>
          <button data-action="back">Back</button>
        </div>
      </div>
    `);
    this.elements.set('continue', container);
  }

  createElement(tag, className, innerHTML) {
    const el = document.createElement(tag);
    el.className = className;
    el.innerHTML = innerHTML;
    document.body.appendChild(el);
    return el;
  }

  bindInput() {
    // Menu navigation
    this.input.on('moveUp', () => this.navigateMenu(-1));
    this.input.on('moveDown', () => this.navigateMenu(1));
    this.input.on('interact', () => this.selectMenuItem());
    this.input.on('pause', () => this.togglePause());
    this.input.on('inventory', () => this.toggleInventory());
    this.input.on('map', () => this.toggleMap());
  }

  navigateMenu(direction) {
    if (!this.visible || !this.currentMenu) return;
    const menu = this.elements.get(this.currentMenu);
    const buttons = menu.querySelectorAll('button:not(.tab), select, input[type="range"]');
    if (buttons.length === 0) return;

    this.selectedIndex = (this.selectedIndex + direction + buttons.length) % buttons.length;
    this.updateSelection(menu, buttons);
  }

  updateSelection(menu, buttons) {
    buttons.forEach((btn, i) => {
      btn.classList.toggle('selected', i === this.selectedIndex);
    });
    if (buttons[this.selectedIndex]) {
      buttons[this.selectedIndex].focus();
    }
  }

  selectMenuItem() {
    if (!this.visible || !this.currentMenu) return;
    const menu = this.elements.get(this.currentMenu);
    const buttons = menu.querySelectorAll('button:not(.tab)');
    if (buttons[this.selectedIndex]) {
      buttons[this.selectedIndex].click();
    }
  }

  show(menuName) {
    this.hideAll();
    const menu = this.elements.get(menuName);
    if (menu) {
      menu.classList.remove('hidden');
      this.currentMenu = menuName;
      this.selectedIndex = 0;
      this.visible = true;

      // Focus first button
      const buttons = menu.querySelectorAll('button:not(.tab)');
      if (buttons.length > 0) {
        this.updateSelection(menu, buttons);
      }

      this.menuStack.push(menuName);
      this.game?.onMenuOpen?.(menuName);
    }
  }

  hide(menuName) {
    const menu = this.elements.get(menuName);
    if (menu) {
      menu.classList.add('hidden');
      if (this.currentMenu === menuName) {
        this.currentMenu = null;
        this.visible = false;
      }
      const idx = this.menuStack.indexOf(menuName);
      if (idx > -1) this.menuStack.splice(idx, 1);
      this.game?.onMenuClose?.(menuName);
    }
  }

  hideAll() {
    for (const menu of this.elements.values()) {
      menu.classList.add('hidden');
    }
    this.currentMenu = null;
    this.visible = false;
    this.menuStack = [];
  }

  togglePause() {
    if (this.currentMenu === 'pause') {
      this.hide('pause');
      this.game?.resume?.();
    } else if (this.game?.state === 'playing') {
      this.show('pause');
      this.game?.pause?.();
    }
  }

  toggleInventory() {
    if (this.currentMenu === 'inventory') {
      this.hide('inventory');
    } else {
      this.show('inventory');
      this.updateInventory();
    }
  }

  toggleMap() {
    if (this.currentMenu === 'map') {
      this.hide('map');
    } else {
      this.show('map');
      this.updateMap();
    }
  }

  // Menu action handlers
  onMenuAction(action) {
    switch (action) {
      case 'new-run': this.show('new-run'); break;
      case 'continue': this.show('continue'); this.updateContinueInfo(); break;
      case 'hub': this.show('hub'); this.updateHub(); break;
      case 'options': this.show('options'); break;
      case 'credits': this.showCredits(); break;
      case 'quit': this.quitToTitle(); break;
      case 'resume': this.togglePause(); break;
      case 'save': this.game?.save?.(); break;
      case 'loadouts': this.showLoadouts(); break;
      case 'relics': this.showRelics(); break;
      case 'archive': this.show('notes'); break;
      case 'title': this.quitToTitle(); break;
      case 'start-run': this.startNewRun(); break;
      case 'load-save': this.game?.loadSave?.(); break;
      case 'delete-save': this.deleteSave(); break;
      case 'back': this.goBack(); break;
      case 'graphics': this.show('graphics'); break;
      case 'audio': this.show('audio'); break;
      case 'controls': this.show('controls'); this.updateBindingsList(); break;
      case 'accessibility': this.show('accessibility'); break;
      case 'gameplay': this.showGameplayOptions(); break;
      case 'reset-bindings': this.resetBindings(); break;
      case 'use-item': this.useSelectedItem(); break;
      case 'drop-item': this.dropSelectedItem(); break;
      case 'examine-item': this.examineSelectedItem(); break;
      default: console.log('Unknown menu action:', action);
    }
  }

  goBack() {
    if (this.menuStack.length > 1) {
      this.menuStack.pop();
      const prev = this.menuStack[this.menuStack.length - 1];
      this.show(prev);
    } else {
      this.hideAll();
    }
  }

  updateInventory() {
    // Would populate from game state
  }

  updateMap() {
    // Would render map to canvas
  }

  updateHub() {
    const meta = this.game?.meta;
    if (meta) {
      document.getElementById('hub-currency').textContent = meta.currency;
      document.getElementById('hub-runs').textContent = meta.stats.runsCompleted;
    }
  }

  updateContinueInfo() {
    const hasSave = this.game?.saveSystem?.hasSave?.();
    document.getElementById('save-info').textContent = hasSave ? 'Save found' : 'No save found';
  }

  updateBindingsList() {
    const list = document.getElementById('bindings-list');
    if (!list) return;

    const bindings = this.input.getAllBindings();
    list.innerHTML = '';
    for (const [action, binding] of Object.entries(bindings)) {
      const row = document.createElement('div');
      row.className = 'binding-row';
      row.innerHTML = `
        <span>${action}</span>
        <button data-rebind="${action}">${binding.key || `Btn${binding.gamepadButton}`}</button>
      `;
      list.appendChild(row);
    }
  }

  startNewRun() {
    const seed = document.getElementById('opt-seed').value || null;
    const difficulty = parseInt(document.getElementById('opt-difficulty').value);
    const kit = document.getElementById('opt-kit').value;
    this.hideAll();
    this.game?.startRun?.(seed, { difficulty, kit });
  }

  resetBindings() {
    this.input.bindings.clear();
    this.input.actionState.clear();
    for (const [action, binding] of Object.entries(this.input.defaultBindings)) {
      this.input.bind(action, binding);
    }
    this.updateBindingsList();
  }

  showCredits() {
    alert('Gloomward\n\nCreated for the Hermes Agent challenge\n\nThree.js (MIT License)\nAll code, art, and audio original');
  }

  quitToTitle() {
    this.hideAll();
    this.game?.returnToTitle?.();
    this.show('title');
  }

  showLoadouts() {
    // Would show loadout selection
  }

  showRelics() {
    // Would show relic collection
  }

  showGameplayOptions() {
    // Would show gameplay options
  }

  useSelectedItem() {
    this.game?.useSelectedItem?.();
  }

  dropSelectedItem() {
    this.game?.dropSelectedItem?.();
  }

  examineSelectedItem() {
    this.game?.examineSelectedItem?.();
  }

  deleteSave() {
    if (confirm('Delete save? This cannot be undone.')) {
      this.game?.saveSystem?.deleteSave?.();
      this.updateContinueInfo();
    }
  }

  // Update death summary
  setDeathSummary(data) {
    document.getElementById('death-act').textContent = data.act;
    document.getElementById('death-floor').textContent = data.floor;
    document.getElementById('death-time').textContent = this.formatTime(data.time);
    document.getElementById('death-kills').textContent = data.kills;
    document.getElementById('death-echoes').textContent = data.currencyEarned;
  }

  formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // Populate notes list
  populateNotes(notes, currentRunNotes) {
    const list = document.getElementById('notes-list');
    if (!list) return;

    list.innerHTML = '';
    const allNotes = [...currentRunNotes, ...notes];

    for (const note of allNotes) {
      const item = document.createElement('div');
      item.className = 'note-item' + (currentRunNotes.includes(note) ? ' new' : '');
      item.textContent = note.title || note.id;
      item.dataset.noteId = note.id;
      item.addEventListener('click', () => this.showNote(note));
      list.appendChild(item);
    }
  }

  showNote(note) {
    document.getElementById('viewer-title').textContent = note.title || note.id;
    document.getElementById('viewer-text').textContent = note.text || '';
  }

  dispose() {
    for (const el of this.elements.values()) {
      el.remove();
    }
    this.elements.clear();
  }
}