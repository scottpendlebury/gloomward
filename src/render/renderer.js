// src/render/renderer.js — WebGLRenderer setup, internal resolution, post FX
// Exports: Renderer, PostEffect
// Dependencies: three (vendor)

import * as THREE from 'three';

export class Renderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      internalWidth: 854,
      internalHeight: 480,
      pixelated: true,
      ...options,
    };

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.CineonToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Internal render target for post-processing
    this.internalRT = new THREE.WebGLRenderTarget(
      this.options.internalWidth,
      this.options.internalHeight,
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false,
      }
    );

    // Post-processing scene
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.createPostMaterial()
    );
    this.postScene.add(this.postQuad);

    // Effect toggles
    this.effects = {
      grain: true,
      dither: true,
      vignette: true,
      bloom: true,
      chromaticAberration: true,
      scanlines: false,
      colourGrade: true,
    };

    // Effect parameters
    this.params = {
      grainAmount: 0.08,
      ditherStrength: 0.5,
      vignetteStrength: 0.6,
      bloomThreshold: 0.85,
      bloomStrength: 0.3,
      bloomRadius: 0.5,
      chromaticAberration: 0.002,
      scanlineStrength: 0.15,
      colourGrade: { r: 1.0, g: 0.95, b: 0.9 },
      time: 0,
    };

    this.qualityPreset = 'medium';
    this.resize(window.innerWidth, window.innerHeight);
  }

  createPostMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.internalRT.texture },
        uGrainAmount: { value: this.params.grainAmount },
        uDitherStrength: { value: this.params.ditherStrength },
        uVignetteStrength: { value: this.params.vignetteStrength },
        uBloomThreshold: { value: this.params.bloomThreshold },
        uBloomStrength: { value: this.params.bloomStrength },
        uChromaticAberration: { value: this.params.chromaticAberration },
        uScanlineStrength: { value: this.params.scanlineStrength },
        uColourGrade: { value: new THREE.Vector3(
          this.params.colourGrade.r,
          this.params.colourGrade.g,
          this.params.colourGrade.b
        )},
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(this.options.internalWidth, this.options.internalHeight) },
        uEffectsEnabled: { value: new THREE.Vector4(
          this.effects.grain ? 1 : 0,
          this.effects.dither ? 1 : 0,
          this.effects.vignette ? 1 : 0,
          this.effects.bloom ? 1 : 0
        )},
        uEffectsEnabled2: { value: new THREE.Vector4(
          this.effects.chromaticAberration ? 1 : 0,
          this.effects.scanlines ? 1 : 0,
          this.effects.colourGrade ? 1 : 0,
          0
        )},
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uGrainAmount;
        uniform float uDitherStrength;
        uniform float uVignetteStrength;
        uniform float uBloomThreshold;
        uniform float uBloomStrength;
        uniform float uChromaticAberration;
        uniform float uScanlineStrength;
        uniform vec3 uColourGrade;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec4 uEffectsEnabled;
        uniform vec4 uEffectsEnabled2;

        varying vec2 vUv;

        // Hash for grain
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        // Bayer 4x4 dither matrix
        float bayer(vec2 p) {
          vec2 ip = floor(p);
          vec2 fp = fract(p);
          float v = 0.0;
          v += step(0.5, fp.x) * step(0.5, fp.y) * 15.0;
          v += step(0.5, fp.x) * step(0.25, fp.y) * step(fp.y, 0.5) * 3.0;
          v += step(0.25, fp.x) * step(fp.x, 0.5) * step(0.5, fp.y) * 12.0;
          v += step(0.25, fp.x) * step(fp.x, 0.5) * step(0.25, fp.y) * step(fp.y, 0.5) * 6.0;
          v += step(0.75, fp.x) * step(0.5, fp.y) * 9.0;
          v += step(0.75, fp.x) * step(0.25, fp.y) * step(fp.y, 0.5) * 0.0;
          v += step(0.5, fp.x) * step(0.75, fp.x) * step(0.5, fp.y) * 7.0;
          return v / 15.0;
        }

        vec3 rgb2hsv(vec3 c) {
          vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
          float d = q.x - min(q.w, q.y);
          float e = 1.0e-10;
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }

        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
          vec2 uv = vUv;
          vec4 color = texture2D(tDiffuse, uv);

          // Chromatic aberration
          if (uEffectsEnabled2.x > 0.5) {
            float offset = uChromaticAberration;
            color.r = texture2D(tDiffuse, uv + vec2(offset, 0.0)).r;
            color.b = texture2D(tDiffuse, uv - vec2(offset, 0.0)).b;
          }

          // Colour grade
          if (uEffectsEnabled2.y > 0.5) {
            color.rgb *= uColourGrade;
          }

          // Film grain
          if (uEffectsEnabled.x > 0.5) {
            float grain = (hash(uv * uResolution + uTime) - 0.5) * uGrainAmount;
            color.rgb += grain;
          }

          // Ordered dither
          if (uEffectsEnabled.y > 0.5) {
            float levels = 32.0 - uDitherStrength * 31.0;
            color.rgb = floor(color.rgb * levels) / levels;
          }

          // Vignette
          if (uEffectsEnabled.z > 0.5) {
            float vig = 1.0 - length(uv - 0.5) * uVignetteStrength * 1.414;
            color.rgb *= vig;
          }

          // Cheap bloom approximation
          if (uEffectsEnabled.w > 0.5) {
            float bright = max(max(color.r, color.g), color.b);
            if (bright > uBloomThreshold) {
              color.rgb += (bright - uBloomThreshold) * uBloomStrength;
            }
          }

          // Scanlines
          if (uEffectsEnabled2.z > 0.5) {
            color.rgb *= 1.0 - uScanlineStrength * sin(uv.y * uResolution.y * 3.14159);
          }

          // Gamma correction
          color.rgb = pow(color.rgb, vec3(1.0 / 2.2));

          gl_FragColor = color;
        }
      `,
      depthWrite: false,
      depthTest: false,
    });
  }

  setInternalResolution(w, h) {
    this.options.internalWidth = w;
    this.options.internalHeight = h;
    this.internalRT.setSize(w, h);
    this.postQuad.material.uniforms.uResolution.value.set(w, h);
  }

  setPostEffect(name, enabled) {
    if (this.effects.hasOwnProperty(name)) {
      this.effects[name] = enabled;
      this.updateEffectUniforms();
    }
  }

  setEffectParam(name, value) {
    if (this.params.hasOwnProperty(name)) {
      this.params[name] = value;
      this.updateParamUniform(name);
    }
  }

  setColourGrade(r, g, b) {
    this.params.colourGrade = { r, g, b };
    this.postQuad.material.uniforms.uColourGrade.value.set(r, g, b);
  }

  setQualityPreset(preset) {
    this.qualityPreset = preset;
    const presets = {
      low: { internalWidth: 640, internalHeight: 360, grain: 0.05, dither: 0.3, vignette: 0.4, bloom: false, ca: false },
      medium: { internalWidth: 854, internalHeight: 480, grain: 0.08, dither: 0.5, vignette: 0.6, bloom: true, ca: true },
      high: { internalWidth: 1024, internalHeight: 576, grain: 0.1, dither: 0.7, vignette: 0.7, bloom: true, ca: true },
    };
    const p = presets[preset] || presets.medium;
    this.setInternalResolution(p.internalWidth, p.internalHeight);
    this.setEffectParam('grainAmount', p.grain);
    this.setEffectParam('ditherStrength', p.dither);
    this.setEffectParam('vignetteStrength', p.vignette);
    this.setPostEffect('bloom', p.bloom);
    this.setPostEffect('chromaticAberration', p.ca);
  }

  updateEffectUniforms() {
    const m = this.postQuad.material.uniforms;
    m.uEffectsEnabled.value.set(
      this.effects.grain ? 1 : 0,
      this.effects.dither ? 1 : 0,
      this.effects.vignette ? 1 : 0,
      this.effects.bloom ? 1 : 0
    );
    m.uEffectsEnabled2.value.set(
      this.effects.chromaticAberration ? 1 : 0,
      this.effects.scanlines ? 1 : 0,
      this.effects.colourGrade ? 1 : 0,
      0
    );
  }

  updateParamUniform(name) {
    const m = this.postQuad.material.uniforms;
    switch (name) {
      case 'grainAmount': m.uGrainAmount.value = this.params.grainAmount; break;
      case 'ditherStrength': m.uDitherStrength.value = this.params.ditherStrength; break;
      case 'vignetteStrength': m.uVignetteStrength.value = this.params.vignetteStrength; break;
      case 'bloomThreshold': m.uBloomThreshold.value = this.params.bloomThreshold; break;
      case 'bloomStrength': m.uBloomStrength.value = this.params.bloomStrength; break;
      case 'chromaticAberration': m.uChromaticAberration.value = this.params.chromaticAberration; break;
      case 'scanlineStrength': m.uScanlineStrength.value = this.params.scanlineStrength; break;
    }
  }

  render(scene, camera) {
    this.params.time += 1 / 60;
    this.postQuad.material.uniforms.uTime.value = this.params.time;

    // Render to internal target
    this.renderer.setRenderTarget(this.internalRT);
    this.renderer.render(scene, camera);

    // Render post-effect to screen
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  resize(width, height) {
    this.renderer.setSize(width, height);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    if (this.options.pixelated) {
      this.canvas.style.imageRendering = 'pixelated';
    }
  }

  dispose() {
    this.internalRT.dispose();
    this.postQuad.material.dispose();
    this.postQuad.geometry.dispose();
    this.renderer.dispose();
  }

  getThreeRenderer() {
    return this.renderer;
  }
}