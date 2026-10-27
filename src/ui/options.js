// src/ui/options.js — Options persistence, graphics/audio/controls/accessibility
// Exports: OptionsManager
// Dependencies: none

export class OptionsManager {
  constructor() {
    this.options = {
      graphics: {
        quality: 'medium',
        resolution: '854x480',
        grain: 8,
        dither: 50,
        vignette: 60,
        chromaticAberration: true,
        scanlines: false,
        pixelated: true,
        fov: 60,
        sensitivity: 1.0,
        invertY: false,
      },
      audio: {
        master: 100,
        music: 70,
        sfx: 80,
        ambience: 60,
        radio: 50,
      },
      controls: {
        tankControls: false,
        rumble: true,
        bindings: {},
      },
      accessibility: {
        reduceShake: false,
        reduceFlash: false,
        captions: false,
        colourBlind: false,
        aimMode: 'hold',
        runMode: 'hold',
        textSize: 100,
      },
      gameplay: {
        difficulty: 0,
        autoSave: true,
        showDamageNumbers: true,
        showEnemyHealth: false,
      },
    };

    this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem('gloomward_options');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.mergeOptions(this.options, parsed);
      }
    } catch (e) {
      console.warn('Failed to load options:', e);
    }
  }

  save() {
    try {
      localStorage.setItem('gloomward_options', JSON.stringify(this.options));
    } catch (e) {
      console.warn('Failed to save options:', e);
    }
  }

  mergeOptions(target, source) {
    for (const key of Object.keys(source)) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this.mergeOptions(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  get(category, key) {
    return this.options[category]?.[key];
  }

  set(category, key, value) {
    if (this.options[category] && this.options[category].hasOwnProperty(key)) {
      this.options[category][key] = value;
      this.save();
      return true;
    }
    return false;
  }

  getAll(category) {
    return { ...this.options[category] };
  }

  setAll(category, values) {
    if (this.options[category]) {
      this.options[category] = { ...this.options[category], ...values };
      this.save();
    }
  }

  reset(category) {
    const defaults = {
      graphics: {
        quality: 'medium',
        resolution: '854x480',
        grain: 8,
        dither: 50,
        vignette: 60,
        chromaticAberration: true,
        scanlines: false,
        pixelated: true,
        fov: 60,
        sensitivity: 1.0,
        invertY: false,
      },
      audio: {
        master: 100,
        music: 70,
        sfx: 80,
        ambience: 60,
        radio: 50,
      },
      controls: {
        tankControls: false,
        rumble: true,
        bindings: {},
      },
      accessibility: {
        reduceShake: false,
        reduceFlash: false,
        captions: false,
        colourBlind: false,
        aimMode: 'hold',
        runMode: 'hold',
        textSize: 100,
      },
      gameplay: {
        difficulty: 0,
        autoSave: true,
        showDamageNumbers: true,
        showEnemyHealth: false,
      },
    };

    if (defaults[category]) {
      this.options[category] = { ...defaults[category] };
      this.save();
    }
  }

  resetAll() {
    for (const cat of Object.keys(this.options)) {
      this.reset(cat);
    }
  }

  export() {
    return JSON.stringify(this.options, null, 2);
  }

  import(json) {
    try {
      const parsed = JSON.parse(json);
      this.mergeOptions(this.options, parsed);
      this.save();
      return true;
    } catch (e) {
      console.error('Failed to import options:', e);
      return false;
    }
  }

  // Apply options to game systems
  applyToRenderer(renderer) {
    const g = this.options.graphics;
    renderer.setQualityPreset(g.quality);
    const [w, h] = g.resolution.split('x').map(Number);
    renderer.setInternalResolution(w, h);
    renderer.setPostEffect('grain', g.grain > 0);
    renderer.setPostEffect('dither', g.dither > 0);
    renderer.setPostEffect('vignette', g.vignette > 0);
    renderer.setPostEffect('bloom', g.quality !== 'low');
    renderer.setPostEffect('chromaticAberration', g.chromaticAberration);
    renderer.setPostEffect('scanlines', g.scanlines);
    renderer.setEffectParam('grainAmount', g.grain / 100);
    renderer.setEffectParam('ditherStrength', g.dither / 100);
    renderer.setEffectParam('vignetteStrength', g.vignette / 100);
    renderer.canvas.style.imageRendering = g.pixelated ? 'pixelated' : 'auto';
  }

  applyToAudio(audioEngine) {
    const a = this.options.audio;
    audioEngine.setVolume('master', a.master / 100);
    audioEngine.setVolume('music', a.music / 100);
    audioEngine.setVolume('sfx', a.sfx / 100);
    audioEngine.setVolume('ambience', a.ambience / 100);
    audioEngine.setVolume('radio', a.radio / 100);
  }

  applyToInput(inputManager) {
    const c = this.options.controls;
    // Tank controls handled by camera controller
    // Bindings handled separately
  }

  applyToCamera(cameraController) {
    const g = this.options.graphics;
    const a = this.options.accessibility;
    cameraController.config.fov = g.fov;
    cameraController.config.sensitivity = g.sensitivity;
    cameraController.config.invertY = g.invertY;
    // Accessibility
    cameraController.shakeIntensity *= a.reduceShake ? 0 : 1;
  }

  applyToUI() {
    const a = this.options.accessibility;
    document.documentElement.style.fontSize = `${a.textSize}%`;
  }
}