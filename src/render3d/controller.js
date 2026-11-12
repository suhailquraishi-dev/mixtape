import * as THREE from '../../vendor/three.module.js';

const A = 0x83bed0;
const B = 0xe7a262;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function roundedPlate(width, depth, height, radius, material) {
  const x = -width / 2, z = -depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, z);
  shape.lineTo(x + width - radius, z);
  shape.quadraticCurveTo(x + width, z, x + width, z + radius);
  shape.lineTo(x + width, z + depth - radius);
  shape.quadraticCurveTo(x + width, z + depth, x + width - radius, z + depth);
  shape.lineTo(x + radius, z + depth);
  shape.quadraticCurveTo(x, z + depth, x, z + depth - radius);
  shape.lineTo(x, z + radius);
  shape.quadraticCurveTo(x, z, x + radius, z);
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelThickness: .035, bevelSize: .045, bevelSegments: 3, curveSegments: 5 }), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function label(text, x, y, z, width, height, color = '#bec2c2', size = 42) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const draw = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.font = `600 ${size}px "Plex Condensed", "Arial Narrow", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 49, 496);
    texture.needsUpdate = true;
  };
  draw();
  void document.fonts.load(`600 ${size}px "Plex Condensed"`).then(draw).catch(() => {});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

export class ControllerStage {
  constructor(container, tooltip, fallback, engine, actions) {
    this.container = container;
    this.tooltip = tooltip;
    this.fallback = fallback;
    this.engine = engine;
    this.actions = actions;
    this.pickables = [];
    this.controls = [];
    this.jogs = [];
    this.meters = [[], []];
    this.buttons = [[], []];
    this.screens = [];
    this.snapshot = engine.snapshot();
    this.effectsReduced = false;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111315);
    this.camera = new THREE.PerspectiveCamera(40, 1, .1, 80);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.5;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      container.append(this.renderer.domElement);
    } catch {
      fallback.hidden = false;
      return;
    }
    this.canvas = this.renderer.domElement;
    this.canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); fallback.hidden = false; });
    this.canvas.addEventListener('webglcontextrestored', () => { fallback.hidden = true; this.renderFrame(); });
    this.scene.add(new THREE.HemisphereLight(0xc9d4db, 0x242021, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 4.4);
    key.position.set(-4, 11, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -10; key.shadow.camera.right = 10; key.shadow.camera.top = 9; key.shadow.camera.bottom = -9;
    key.shadow.bias = -.0003;
    this.scene.add(key);
    const edge = new THREE.DirectionalLight(0x9fb3c6, 1.9);
    edge.position.set(6, 6, -8);
    this.scene.add(edge);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x060708, roughness: .95, metalness: .02 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.35;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.makeHardware();
    void Promise.all([
      document.fonts.load('600 48px "Plex Sans"'),
      document.fonts.load('500 30px "Plex Mono"'),
    ]).then(() => {
      this.screens.forEach((display) => { display.last = ''; });
      this.update(this.snapshot);
    }).catch(() => {});
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.onPointerUp(event, true));
    this.canvas.addEventListener('pointerleave', () => { if (!this.active) this.tooltip.hidden = true; });
    this.canvas.addEventListener('wheel', (event) => { event.preventDefault(); this.distance = clamp(this.distance + Math.sign(event.deltaY) * .8, 10.5, 25); this.positionCamera(); }, { passive: false });
    this.resetView();
    this.resize();
    this.loop();
  }

  makeHardware() {
    const polymer = new THREE.MeshStandardMaterial({ color: 0x222629, roughness: .68, metalness: .24 });
    const side = new THREE.MeshStandardMaterial({ color: 0x111416, roughness: .55, metalness: .35 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x555b5d, roughness: .35, metalness: .72 });
    const brightMetal = new THREE.MeshStandardMaterial({ color: 0x929a9b, roughness: .23, metalness: .82 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x090b0d, roughness: .9, metalness: .04 });
    const screen = new THREE.MeshStandardMaterial({ color: 0x071014, roughness: .22, metalness: .14, emissive: 0x092127, emissiveIntensity: .45 });
    const ledA = new THREE.MeshStandardMaterial({ color: A, emissive: A, emissiveIntensity: .45, roughness: .35 });
    const ledB = new THREE.MeshStandardMaterial({ color: B, emissive: B, emissiveIntensity: .45, roughness: .35 });
    const amberOff = new THREE.MeshStandardMaterial({ color: 0x484135, emissive: B, emissiveIntensity: .05 });
    const board = new THREE.Group();
    this.scene.add(board);
    board.add(roundedPlate(12.8, 6.8, .34, .36, side));
    const top = roundedPlate(12.62, 6.62, .08, .29, polymer);
    top.position.y = .32;
    board.add(top);
    board.add(box(2.33, .02, 6.18, new THREE.MeshStandardMaterial({ color: 0x282d2f, metalness: .45, roughness: .57 }), 0, .46, 0));
    for (const x of [-6.1, 6.1]) for (const z of [-2.95, 2.95]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, .018, 16), metal);
      screw.position.set(x, .48, z);
      board.add(screw);
      board.add(box(.08, .007, .014, rubber, x, .495, z));
    }
    board.add(label('MIXTAPE', 0, .49, -2.95, 1.6, .25, '#e4e3de', 60));
    board.add(label('2 CHANNEL / DIGITAL MIXING SYSTEM', 0, .49, 3.03, 2.1, .14, '#92999b', 31));
    const deckCenters = [-3.65, 3.65];
    deckCenters.forEach((cx, index) => {
      const tint = index === 0 ? A : B;
      const led = index === 0 ? ledA : ledB;
      board.add(label(`DECK ${index === 0 ? 'A' : 'B'}`, cx - 1.62, .51, -2.95, 1.4, .23, index === 0 ? '#a7d8e2' : '#eac19b', 46));
      const displayBezel = box(4.5, .1, .9, rubber, cx, .56, -2.18);
      board.add(displayBezel);
      board.add(box(4.26, .012, .68, screen, cx, .62, -2.18));
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = 1024;
      displayCanvas.height = 176;
      const displayTexture = new THREE.CanvasTexture(displayCanvas);
      displayTexture.colorSpace = THREE.SRGBColorSpace;
      displayTexture.anisotropy = 8;
      const display = new THREE.Mesh(new THREE.PlaneGeometry(4.20, .66), new THREE.MeshBasicMaterial({ map: displayTexture, toneMapped: false }));
      display.rotation.x = -Math.PI / 2;
      display.position.set(cx, .638, -2.18);
      board.add(display);
      this.screens.push({ canvas: displayCanvas, texture: displayTexture, last: '' });
      const well = new THREE.Mesh(new THREE.CylinderGeometry(1.76, 1.76, .07, 96), rubber);
      well.position.set(cx, .51, .18);
      board.add(well);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.66, 1.66, .15, 96), metal);
      rim.position.set(cx, .59, .18);
      rim.castShadow = true;
      board.add(rim);
      const platter = new THREE.Group();
      platter.position.set(cx, .68, .18);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.52, .055, 96), rubber);
      disc.castShadow = true;
      platter.add(disc);
      for (let groove = 0; groove < 11; groove++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.48 - groove * .095, .006, 4, 96), groove % 2 ? metal : brightMetal);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = .034;
        platter.add(ring);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, .065, 64), metal);
      hub.position.y = .056;
      platter.add(hub);
      const center = new THREE.Mesh(new THREE.CylinderGeometry(.37, .37, .07, 64), index === 0 ? ledA : ledB);
      center.position.y = .075;
      platter.add(center);
      platter.add(label(index === 0 ? 'A' : 'B', 0, .12, 0, .42, .25, '#111518', 70));
      const marker = box(.09, .015, .31, led, 0, .063, -1.26);
      platter.add(marker);
      board.add(platter);
      this.jogs.push(platter);
      const jogHit = new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.53, .07, 64), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      jogHit.position.set(cx, .76, .18);
      jogHit.userData.control = { kind: 'jog', index, label: `Deck ${index === 0 ? 'A' : 'B'} · drag to seek in Manual DJ` };
      this.pickables.push(jogHit);
      board.add(jogHit);
      for (let tick = 0; tick < 24; tick++) {
        const angle = tick / 24 * Math.PI * 2;
        const segment = box(.026, .015, tick % 6 === 0 ? .22 : .11, tick % 6 === 0 ? led : metal, cx + Math.sin(angle) * 1.91, .48, .18 + Math.cos(angle) * 1.91);
        segment.rotation.y = angle;
        board.add(segment);
      }
      const play = this.makeButton(board, cx - 1.68, 2.43, 0x252c2f, tint, 'PLAY', { kind: 'play', index, label: `Play or pause deck ${index === 0 ? 'A' : 'B'}` });
      const cue = this.makeButton(board, cx - .68, 2.43, 0x292b2d, tint, 'CUE', { kind: 'cue', index, label: `Cue deck ${index === 0 ? 'A' : 'B'} to start` });
      const load = this.makeButton(board, cx + 1.52, 2.43, 0x2a2d2f, tint, 'LOAD', { kind: 'load', index, label: `Choose a track for deck ${index === 0 ? 'A' : 'B'}` });
      this.buttons[index] = [play, cue, load];
      board.add(label('TRANSPORT', cx - 1.24, .5, 2.9, 1.2, .13, '#a9adae', 30));
    });
    for (const [index, x] of [[0, -.55], [1, .55]]) {
      const color = index === 0 ? A : B;
      board.add(label(index === 0 ? 'CH A' : 'CH B', x, .5, -2.53, .68, .18, index === 0 ? '#9dcfda' : '#eac09b', 34));
      for (const [row, band] of ['high', 'mid', 'low', 'filter'].entries()) {
        const z = -1.88 + row * .67;
        board.add(label(band.toUpperCase(), x, .5, z + .30, .62, .12, '#93999b', 26));
        this.makeKnob(board, x, z, index, band, metal, rubber, color);
      }
      const meterX = x < 0 ? -.20 : .20;
      for (let bar = 0; bar < 10; bar++) {
        const z = -2.1 + bar * .25;
        const material = new THREE.MeshStandardMaterial({ color: bar > 7 ? 0xc78457 : color, emissive: bar > 7 ? 0xc78457 : color, emissiveIntensity: .05, roughness: .4 });
        const segment = box(.09, .027, .17, material, meterX, .52, z);
        board.add(segment);
        this.meters[index].push(material);
      }
      const slot = box(.14, .018, 1.45, rubber, x, .51, 1.82);
      board.add(slot);
       const cap = box(.50, .20, .25, brightMetal.clone(), x, .63, 1.16);
       cap.material.emissive = new THREE.Color(color);
       cap.material.emissiveIntensity = 0;
       cap.userData.control = { kind: 'channel', index, label: `Channel ${index === 0 ? 'A' : 'B'} level`, dragMaterial: cap.material };
      this.pickables.push(cap);
      board.add(cap);
      this.controls.push({ kind: 'channel', index, mesh: cap });
      board.add(label('LEVEL', x, .5, 2.72, .68, .13, '#abb0b1', 28));
    }
    board.add(box(1.47, .018, .12, rubber, 0, .51, 2.42));
    const crossCap = box(.25, .19, .47, brightMetal.clone(), -.68, .63, 2.42);
    crossCap.material.emissive = new THREE.Color(0xd7c7aa);
    crossCap.material.emissiveIntensity = 0;
    crossCap.userData.control = { kind: 'crossfader', label: 'Crossfader · A to B', dragMaterial: crossCap.material };
    this.pickables.push(crossCap);
    board.add(crossCap);
    this.controls.push({ kind: 'crossfader', mesh: crossCap });
    board.add(label('CROSSFADER', 0, .5, 2.79, 1.35, .13, '#abb0b1', 26));
    board.add(label('A', -.85, .5, 2.41, .2, .14, '#9dcfda', 34));
    board.add(label('B', .85, .5, 2.41, .2, .14, '#eac09b', 34));
  }

  makeButton(board, x, z, baseColor, ledColor, title, control) {
    const base = box(.72, .12, .63, new THREE.MeshStandardMaterial({ color: baseColor, roughness: .5, metalness: .36 }), x, .55, z);
    board.add(base);
    const topMaterial = new THREE.MeshStandardMaterial({ color: 0x464b4e, roughness: .43, metalness: .3, emissive: ledColor, emissiveIntensity: .03 });
    const top = box(.60, .12, .50, topMaterial, x, .65, z);
    top.userData.control = control;
    this.pickables.push(top);
    board.add(top);
    const face = label(title, x, .715, z, .57, .17, '#ece9e3', 39);
    board.add(face);
    control.pressMesh = top;
    control.pressLabel = face;
    return topMaterial;
  }

  makeKnob(board, x, z, index, band, metal, rubber, color) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.29, .29, .035, 32), rubber);
    base.position.set(x, .52, z);
    board.add(base);
    const knob = new THREE.Group();
    knob.position.set(x, .55, z);
    const bodyMaterial = metal.clone();
    bodyMaterial.emissive = new THREE.Color(color);
    bodyMaterial.emissiveIntensity = 0;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.20, .23, .21, 32), bodyMaterial);
    body.position.y = .10;
    body.castShadow = true;
    knob.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.185, .185, .016, 32), new THREE.MeshStandardMaterial({ color: 0x252b2e, metalness: .52, roughness: .34 }));
    cap.position.y = .216;
    knob.add(cap);
    const marker = box(.027, .014, .12, new THREE.MeshBasicMaterial({ color }), 0, .23, -.10);
    knob.add(marker);
    body.userData.control = { kind: band === 'filter' ? 'filter' : 'eq', index, band, label: `Deck ${index === 0 ? 'A' : 'B'} ${band === 'filter' ? 'low-pass filter' : band.toUpperCase() + ' EQ'}`, dragMaterial: bodyMaterial };
    this.pickables.push(body);
    board.add(knob);
    this.controls.push({ kind: band, index, mesh: knob });
  }

  resetView() {
    this.yaw = 0;
    this.pitch = 0;
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    this.distance = aspect < 1.3 ? 24.5 : aspect < 1.8 ? 17.5 : 10.8;
    this.positionCamera();
  }

  positionCamera() {
    const elevation = this.container.clientWidth < 700 ? .92 : .79;
    const angle = elevation + this.pitch;
    this.camera.position.set(Math.sin(this.yaw) * this.distance, Math.sin(angle) * this.distance, Math.cos(this.yaw) * Math.cos(angle) * this.distance);
    this.camera.lookAt(0, .15, 0);
    this.renderFrame();
  }

  resize() {
    if (!this.renderer) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.fov = width < 700 ? 47 : 40;
    this.camera.updateProjectionMatrix();
    if (this.lastAspect && Math.abs(this.lastAspect - this.camera.aspect) > .25) {
      const aspect = this.camera.aspect;
      this.distance = aspect < 1.3 ? 24.5 : aspect < 1.8 ? 17.5 : 10.8;
    }
    this.lastAspect = this.camera.aspect;
    this.renderer.setPixelRatio(this.effectsReduced ? 1 : Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.setSize(width, height, false);
    this.positionCamera();
  }

  setReducedEffects(enabled) {
    this.effectsReduced = enabled;
    if (!this.renderer) return;
    this.renderer.shadowMap.enabled = !enabled;
    this.resize();
  }

  update(snapshot) {
    this.snapshot = snapshot;
    if (!this.renderer) return;
    for (const control of this.controls) {
      if (control.kind === 'channel') control.mesh.position.z = 2.47 - snapshot.decks[control.index].channelLevel * 1.31;
      else if (control.kind === 'crossfader') control.mesh.position.x = -.65 + snapshot.crossfader / 100 * 1.30;
      else {
        const value = control.kind === 'filter' ? snapshot.decks[control.index].filterValue * 2 - 1 : snapshot.decks[control.index].eq[control.kind] / 12;
        control.mesh.rotation.y = value * 2.25;
      }
    }
    snapshot.decks.forEach((deck, index) => {
      this.buttons[index][0].emissiveIntensity = deck.playing ? .70 : .04;
      this.buttons[index][1].emissiveIntensity = deck.track && !deck.playing ? .23 : .03;
      this.buttons[index][2].emissiveIntensity = deck.track ? .24 : .03;
      this.jogs[index].rotation.y = deck.playing ? deck.elapsed * Math.PI * 1.12 : this.jogs[index].rotation.y;
      this.meters[index].forEach((material, bar) => { material.emissiveIntensity = bar < Math.ceil(deck.level * 10) ? 1.2 : .035; });
      this.drawDisplay(index, deck);
    });
    this.renderFrame();
  }

  renderFrame() { if (this.renderer && this.fallback.hidden) this.renderer.render(this.scene, this.camera); }

  drawDisplay(index, deck) {
    const display = this.screens[index];
    const seconds = Math.floor(deck.elapsed);
    const key = `${deck.track?.id || ''}|${seconds}|${deck.playing}`;
    if (display.last === key) return;
    display.last = key;
    const ctx = display.canvas.getContext('2d');
    const accent = index === 0 ? '#83bed0' : '#e7a262';
    ctx.fillStyle = '#071014';
    ctx.fillRect(0, 0, 1024, 176);
    ctx.fillStyle = accent;
    ctx.font = '600 27px "Plex Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(`DECK ${index === 0 ? 'A' : 'B'}  /  ${deck.playing ? 'PLAYING' : deck.status.toUpperCase()}`, 28, 40);
    ctx.fillStyle = '#e8f0ef';
    ctx.font = '600 49px "Plex Sans", Arial, sans-serif';
    ctx.fillText(deck.track?.title || 'LOAD MUSIC', 28, 101, 710);
    ctx.fillStyle = '#a7b7bb';
    ctx.font = '500 28px "Plex Mono", Consolas, monospace';
    const duration = deck.track?.duration || 0;
    const clock = (value) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
    ctx.fillText(`${clock(seconds)} / ${clock(duration)}`, 764, 99, 230);
    ctx.fillStyle = '#244048';
    ctx.fillRect(28, 136, 968, 8);
    ctx.fillStyle = accent;
    ctx.fillRect(28, 136, duration ? 968 * Math.min(1, seconds / duration) : 0, 8);
    display.texture.needsUpdate = true;
  }

  loop() {
    if (!this.renderer) return;
    this.frame = requestAnimationFrame(() => this.loop());
    if (this.snapshot.decks.some((deck) => deck.playing)) this.renderFrame();
  }

  pick(event) {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const control = this.raycaster.intersectObjects(this.pickables, false)[0]?.object.userData.control || null;
    if ((control?.kind === 'cue' || control?.kind === 'jog') && !this.engine.decks[control.index].trackId) return null;
    if (control?.kind === 'load' && (this.snapshot.transitioning || this.snapshot.frozen || (this.snapshot.current && control.index === this.snapshot.activeDeck))) return null;
    return control;
  }

  showTooltip(control, event, value = null) {
    if (!control) { this.tooltip.hidden = true; this.canvas.style.cursor = 'grab'; return; }
    this.tooltip.textContent = `${control.label}${value === null ? '' : ` · ${value}`}`;
    this.tooltip.hidden = false;
    const bounds = this.container.getBoundingClientRect();
    this.tooltip.style.left = `${clamp(event.clientX - bounds.left + 12, 8, bounds.width - 190)}px`;
    this.tooltip.style.top = `${clamp(event.clientY - bounds.top - 36, 12, bounds.height - 38)}px`;
    this.canvas.style.cursor = 'pointer';
  }

  onPointerDown(event) {
    const control = this.pick(event);
    this.active = { control, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, start: this.valueOf(control) };
    this.canvas.setPointerCapture(event.pointerId);
    if (control) {
      if (control.pressMesh) { control.pressMesh.position.y -= .035; control.pressLabel.position.y -= .035; }
      if (control.dragMaterial) control.dragMaterial.emissiveIntensity = .22;
      this.showTooltip(control, event, this.formatValue(control));
      this.renderFrame();
    }
  }

  onPointerMove(event) {
    if (!this.active) {
      const control = this.pick(event);
      this.showTooltip(control, event, this.formatValue(control));
      return;
    }
    const active = this.active;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) active.moved = true;
    if (!active.control) {
      if (active.moved && this.container.clientWidth >= 700) {
        this.yaw = clamp(this.yaw + (event.clientX - active.lastX) * .003, -.22, .22);
        this.pitch = clamp(this.pitch + (event.clientY - active.lastY) * .002, -.09, .09);
        this.positionCamera();
      }
    } else if (active.moved) {
      const control = active.control;
      if (control.kind === 'channel') this.engine.setChannelGain(control.index, clamp(active.start - dy / 160, 0, 1));
      if (control.kind === 'crossfader') { if (this.engine.autoMix) this.actions.takeover(); this.engine.setCrossfader(clamp(active.start + dx / 1.4, 0, 100)); }
      if (control.kind === 'eq') this.engine.setEq(control.index, control.band, clamp(active.start - dy / 5, -12, 12));
      if (control.kind === 'filter') this.engine.setFilter(control.index, clamp(active.start - dy / 150, 0, 1));
      if (control.kind === 'jog') {
        if (this.engine.autoMix) this.actions.takeover();
        this.engine.nudgeDeck(control.index, (event.clientX - active.lastX) / 10);
      }
      this.showTooltip(control, event, this.formatValue(control));
    }
    active.lastX = event.clientX; active.lastY = event.clientY;
  }

  onPointerUp(event, cancelled = false) {
    if (!this.active) return;
    const { control, moved } = this.active;
    this.active = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (control?.pressMesh) { control.pressMesh.position.y += .035; control.pressLabel.position.y += .035; }
    if (control?.dragMaterial) control.dragMaterial.emissiveIntensity = 0;
    if (control?.kind === 'crossfader') this.engine.releaseCrossfader();
    if (control && !moved && !cancelled) {
      if (control.kind === 'play') void this.engine.playDeck(control.index);
      if (control.kind === 'cue') {
        if (this.engine.autoMix) this.actions.takeover();
        this.engine.cueDeck(control.index);
      }
      if (control.kind === 'load') this.actions.load(control.index);
    }
    this.showTooltip(this.pick(event), event);
  }

  valueOf(control) {
    if (!control) return 0;
    if (control.kind === 'crossfader') return this.snapshot.crossfader;
    const deck = this.snapshot.decks[control.index];
    if (control.kind === 'channel') return deck.channelLevel;
    if (control.kind === 'filter') return deck.filterValue;
    if (control.kind === 'eq') return deck.eq[control.band];
    return 0;
  }

  formatValue(control) {
    if (!control) return null;
    if (control.kind === 'channel' || control.kind === 'filter') return `${Math.round(this.valueOf(control) * 100)}%`;
    if (control.kind === 'crossfader') return `${Math.round(this.valueOf(control))}%`;
    if (control.kind === 'eq') return `${this.valueOf(control).toFixed(1)} dB`;
    return null;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.scene.traverse((object) => {
      object.geometry?.dispose();
      if (object.material?.map) object.material.map.dispose();
      object.material?.dispose();
    });
    this.renderer?.dispose();
  }
}
