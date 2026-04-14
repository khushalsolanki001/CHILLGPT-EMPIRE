/**
 * phaser-scene.js  ★ RETRO TYCOON — Grid, Scaling & Animation ★
 * ─────────────────────────────────────────────────────────────────
 * Phaser 3 Scene: "GameDevStoryScene"
 *
 * All sprite sheets are 1024×1024 with exactly 2 frames side-by-side,
 * so each frame is 512 wide × 1024 tall.
 *
 * CustomEvents from UI.js:
 *   SPAWN_WORKER  → places animated desk+worker in next front slot
 *   SPAWN_MACHINE → places animated machine in next back slot
 *   SPAWN_FEEDBACK→ floating popup text at a position
 * ─────────────────────────────────────────────────────────────────
 */

/* global Phaser */

// ─────────────────────────────────────────────────────────────────
// SPRITE SHEET CONFIG
// All AI-generated sheets are 1024×1024 with 2 frames side-by-side
// → frameWidth = 512, frameHeight = 1024
// ─────────────────────────────────────────────────────────────────
const FRAME_W = 512;
const FRAME_H = 1024;

// ─────────────────────────────────────────────────────────────────
// TARGET RENDERED HEIGHTS (pixels in canvas space)
// scale = targetHeight / frameHeight (1024)
// ─────────────────────────────────────────────────────────────────
const TARGET_H = {
  worker:    78,   // desk + worker  → scale ≈ 0.076
  gpu:       60,   // GPU card       → scale ≈ 0.059
  cluster:   72,   // GPU cluster    → scale ≈ 0.070
  rack:      92,   // server rack    → scale ≈ 0.090
  megaDC:    110,  // mega DC        → scale ≈ 0.107
  quantumDC: 128,  // quantum DC     → scale ≈ 0.125
};

// ─────────────────────────────────────────────────────────────────
// GRID LAYOUT (% of canvas)
// BACK row  = machines / server racks (against the wall)
// FRONT row = worker desks (on the floor)
// ─────────────────────────────────────────────────────────────────
const BACK_COLS       = 9;
const FRONT_COLS      = 8;
const BACK_Y_FACTOR   = 0.54;   // back row sits just below mid-room
const FRONT_Y_FACTOR  = 0.75;   // front row is near camera
const GRID_MARGIN_L   = 0.05;   // left margin (fraction of W)
const GRID_MARGIN_R   = 0.05;   // right margin

// ─────────────────────────────────────────────────────────────────
// WARM RETRO PALETTE (procedural fallback)
// ─────────────────────────────────────────────────────────────────
const C = {
  wall:       0xd4b882,
  wallStripe: 0xc0a870,
  floor:      0xb89050,
  floorAlt:   0xa87e40,
  skirting:   0x7a5230,
  ceiling:    0xe8d4a8,
  lightPanel: 0xfff0c0,
  winFrame:   0x6a3c14,
  winGlass:   0x90c4e8,
  winSky:     0x5aa0d0,
  cityBldg:   0x2a3848,
  poster:     0xe8a840,
  deskWood:   0x9c6830,
  deskEdge:   0x5a3810,
  monCase:    0xd0c8b0,
  monScr:     0x2a3c18,
  chairBack:  0x3850a0,
  gpuPCB:     0x6a8c2a,
  gpuEdge:    0x3a5010,
  gpuFan:     0xb0b8c0,
  rackBody:   0x606870,
  rackEdge:   0x2a2e34,
  ledR:       0xe03030,
  ledG:       0x30d050,
  feedGold:   0xc8960c,
  feedGreen:  0x3d7a2e,
  feedBlue:   0x1e5fa8,
  black:      0x000000,
};

// ─────────────────────────────────────────────────────────────────
// SCENE
// ─────────────────────────────────────────────────────────────────

class GameDevStoryScene extends Phaser.Scene {

  constructor() {
    super({ key: 'GameDevStoryScene' });
    // Slot arrays: each entry is { x, y, occupied }
    this._backSlots  = [];
    this._frontSlots = [];
    this._backIdx    = 0;
    this._frontIdx   = 0;
    // Track which textures / spritesheets loaded successfully
    this._ok = {};
  }

  // ── PRELOAD ────────────────────────────────────────────────────

  preload() {
    const ok = (key) => { this._ok[key] = true; };

    // Background — empty room
    this.load.image('bg', 'assets/images/bg.png');
    this.load.on('filecomplete-image-bg', () => ok('bg'));

    // ── Sprite sheets (1024×1024, 2 frames @ 512×1024 each) ──
    // server: rack / megaDC / quantumDC
    this.load.spritesheet('server_anim', 'assets/images/server_sheet.png', {
      frameWidth:  FRAME_W,
      frameHeight: FRAME_H,
    });
    this.load.on('filecomplete-spritesheet-server_anim', () => ok('server_anim'));

    // worker
    this.load.spritesheet('worker_anim', 'assets/images/worker_sheet.png', {
      frameWidth:  FRAME_W,
      frameHeight: FRAME_H,
    });
    this.load.on('filecomplete-spritesheet-worker_anim', () => ok('worker_anim'));

    // gpu / cluster
    this.load.spritesheet('gpu_anim', 'assets/images/gpu_sheet.png', {
      frameWidth:  FRAME_W,
      frameHeight: FRAME_H,
    });
    this.load.on('filecomplete-spritesheet-gpu_anim', () => ok('gpu_anim'));

    // ── Static fallback images ──
    this.load.image('desk',   'assets/images/desk.png');
    this.load.image('gpu',    'assets/images/gpu.png');
    this.load.image('server', 'assets/images/server.png');
    this.load.on('filecomplete-image-desk',   () => ok('desk'));
    this.load.on('filecomplete-image-gpu',    () => ok('gpu'));
    this.load.on('filecomplete-image-server', () => ok('server'));
  }

  // ── CREATE ─────────────────────────────────────────────────────

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // 1. BACKGROUND
    this._drawBackground(W, H);

    // 2. BUILD GRID SLOTS
    this._buildSlots(W, H);

    // 3. DEFINE ANIMATIONS
    this._createAnimations();

    // 4. WIRE EVENTS
    window.addEventListener('SPAWN_WORKER',   (e) => this._onSpawnWorker(e.detail));
    window.addEventListener('SPAWN_MACHINE',  (e) => this._onSpawnMachine(e.detail));
    window.addEventListener('SPAWN_FEEDBACK', (e) => this._onSpawnFeedback(e.detail));

    // 5. AMBIENT TICK
    this.time.addEvent({
      delay:         2200,
      loop:          true,
      callback:      this._ambientTick,
      callbackScope: this,
    });

    // 6. REPLAY SAVED STATE
    this._syncWithGameState();
  }

  // ── BACKGROUND ─────────────────────────────────────────────────

  _drawBackground(W, H) {
    if (this._ok['bg']) {
      // Scale bg image to COVER the canvas (crop-to-fit)
      const src    = this.textures.get('bg').getSourceImage();
      const scaleX = W / src.width;
      const scaleY = H / src.height;
      const scale  = Math.max(scaleX, scaleY);
      this.add.image(W / 2, H / 2, 'bg')
        .setScale(scale)
        .setDepth(0);
    } else {
      // Warm procedural fallback
      this._drawRetroRoom(W, H);
    }
  }

  // ── SLOT GRID ──────────────────────────────────────────────────

  /**
   * Build two flat arrays of {x, y} slot positions:
   *   _backSlots  — for machines (aligned to back wall)
   *   _frontSlots — for workers/desks (on the floor)
   */
  _buildSlots(W, H) {
    const usableW   = W * (1 - GRID_MARGIN_L - GRID_MARGIN_R);
    const startX    = W * GRID_MARGIN_L;

    // Back row
    const backY     = H * BACK_Y_FACTOR;
    const bSpacing  = usableW / BACK_COLS;
    for (let i = 0; i < BACK_COLS; i++) {
      this._backSlots.push({
        x: startX + (i + 0.5) * bSpacing,
        y: backY,
      });
    }

    // Front row
    const frontY    = H * FRONT_Y_FACTOR;
    const fSpacing  = usableW / FRONT_COLS;
    for (let i = 0; i < FRONT_COLS; i++) {
      this._frontSlots.push({
        x: startX + (i + 0.5) * fSpacing,
        y: frontY,
      });
    }

    // Debug: draw faint dots at each slot (comment out in production)
    // const g = this.add.graphics().setDepth(3).setAlpha(0.12);
    // g.fillStyle(C.black);
    // [...this._backSlots, ...this._frontSlots].forEach(s => g.fillCircle(s.x, s.y, 4));
  }

  // ── ANIMATIONS ─────────────────────────────────────────────────

  _createAnimations() {
    // Server LED blink (2 frames, 4fps)
    if (this._ok['server_anim']) {
      this.anims.create({
        key:       'server_blink',
        frames:    this.anims.generateFrameNumbers('server_anim', { start: 0, end: 1 }),
        frameRate: 3,
        repeat:    -1,
      });
    }

    // Worker typing (2 frames, 6fps — alternates postures)
    if (this._ok['worker_anim']) {
      this.anims.create({
        key:       'worker_type',
        frames:    this.anims.generateFrameNumbers('worker_anim', { start: 0, end: 1 }),
        frameRate: 5,
        repeat:    -1,
      });
    }

    // GPU fan spin (2 frames, 8fps)
    if (this._ok['gpu_anim']) {
      this.anims.create({
        key:       'gpu_spin',
        frames:    this.anims.generateFrameNumbers('gpu_anim', { start: 0, end: 1 }),
        frameRate: 7,
        repeat:    -1,
      });
    }
  }

  // ── SPAWN: WORKER ──────────────────────────────────────────────

  _onSpawnWorker(_detail) {
    // Grab next front slot
    if (this._frontIdx >= this._frontSlots.length) {
      console.warn('[Phaser] Front slots full — wrapping.');
      this._frontIdx = 0;
    }
    const slot = this._frontSlots[this._frontIdx++];
    const tH   = TARGET_H.worker;

    let obj;

    if (this._ok['worker_anim']) {
      // ── Animated sprite sheet ──
      obj = this.add.sprite(slot.x, slot.y, 'worker_anim', 0)
        .setOrigin(0.5, 1)
        .setDepth(8);
      this._scaleToTargetH(obj, FRAME_H, tH);
      obj.play('worker_type');
    } else if (this._ok['desk']) {
      // ── Static fallback image ──
      obj = this.add.image(slot.x, slot.y, 'desk')
        .setOrigin(0.5, 1)
        .setDepth(8);
      this._scaleToTargetH(obj, obj.height, tH);
    } else {
      // ── Fully procedural ──
      obj = this._procWorker(slot.x, slot.y, tH);
    }

    if (obj) this._popIn(obj);
    this.cameras.main.shake(140, 0.003);
  }

  // ── SPAWN: MACHINE ─────────────────────────────────────────────

  _onSpawnMachine(detail) {
    if (this._backIdx >= this._backSlots.length) {
      console.warn('[Phaser] Back slots full — wrapping.');
      this._backIdx = 0;
    }
    const slot     = this._backSlots[this._backIdx++];
    const hwId     = detail.hwId || 'gpu';
    const isServer = ['rack', 'megaDC', 'quantumDC'].includes(hwId);
    const tH       = TARGET_H[hwId] ?? TARGET_H.gpu;

    let obj;

    if (isServer && this._ok['server_anim']) {
      obj = this.add.sprite(slot.x, slot.y, 'server_anim', 0)
        .setOrigin(0.5, 1)
        .setDepth(7);
      this._scaleToTargetH(obj, FRAME_H, tH);
      obj.play('server_blink');

    } else if (!isServer && this._ok['gpu_anim']) {
      obj = this.add.sprite(slot.x, slot.y, 'gpu_anim', 0)
        .setOrigin(0.5, 1)
        .setDepth(7);
      this._scaleToTargetH(obj, FRAME_H, tH);
      obj.play('gpu_spin');

    } else if (isServer && this._ok['server']) {
      obj = this.add.image(slot.x, slot.y, 'server')
        .setOrigin(0.5, 1)
        .setDepth(7);
      this._scaleToTargetH(obj, obj.height, tH);

    } else if (!isServer && this._ok['gpu']) {
      obj = this.add.image(slot.x, slot.y, 'gpu')
        .setOrigin(0.5, 1)
        .setDepth(7);
      this._scaleToTargetH(obj, obj.height, tH);

    } else {
      obj = this._procMachine(slot.x, slot.y, hwId, tH);
    }

    if (obj) this._popIn(obj);

    // Floating "+X TF/s" label
    const label = detail.computePS ? `+${detail.computePS} TF/s` : '+CU';
    this._spawnFeedbackText(slot.x, slot.y - tH - 12, label, C.feedBlue);
    this.cameras.main.shake(90, 0.002);
  }

  // ── SPAWN: FEEDBACK ────────────────────────────────────────────

  _onSpawnFeedback(detail) {
    const W = this.scale.width, H = this.scale.height;
    const x = detail.x ?? W / 2 + (Math.random() - 0.5) * 200;
    const y = detail.y ?? H * 0.50;
    this._spawnFeedbackText(x, y, detail.text, detail.color ?? C.feedGold);
  }

  // ── HELPERS ────────────────────────────────────────────────────

  /**
   * Compute and set uniform scale so the object renders at targetPx tall.
   * Stores result as ._ts so _popIn can restore it.
   * @param {Phaser.GameObjects.GameObject} obj
   * @param {number} naturalH  — natural texture height in pixels
   * @param {number} targetPx  — desired canvas height in pixels
   */
  _scaleToTargetH(obj, naturalH, targetPx) {
    const s = naturalH > 0 ? targetPx / naturalH : 0.1;
    obj.setScale(s);
    obj._ts = s;   // remember target scale for pop-in
  }

  /**
   * Play a scale-from-0 pop-in tween.
   * Reads obj._ts for the final scale; falls back to current scale.
   */
  _popIn(obj) {
    const ts = obj._ts ?? obj.scaleX;
    obj.setScale(0.001);
    this.tweens.add({
      targets:  obj,
      scaleX:   ts,
      scaleY:   ts,
      ease:     'Back.easeOut',
      duration: 420,
    });
  }

  // ── FLOATING FEEDBACK TEXT ─────────────────────────────────────

  _spawnFeedbackText(x, y, text, color = C.feedGold) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const txt = this.add.text(x, y, text, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '9px',
      color:      hex,
      stroke:     '#ffffff',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(25);

    this.tweens.add({
      targets:    txt,
      y:          y - 60,
      alpha:      { from: 1, to: 0 },
      duration:   1600,
      ease:       'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  // ── AMBIENT TICK ───────────────────────────────────────────────

  _ambientTick() {
    // Show a tiny typing emoji near a random front slot that's occupied
    const occupied = this._frontIdx;
    if (occupied === 0) return;
    const idx = Math.floor(Math.random() * occupied);
    const s   = this._frontSlots[idx];
    if (s) this._spawnFeedbackText(s.x + 10, s.y - (TARGET_H.worker + 8), '💻', C.feedGreen);
  }

  // ── SYNC FROM SAVE ─────────────────────────────────────────────

  _syncWithGameState() {
    if (typeof Game === 'undefined') return;
    const st = Game.state;

    // Workers
    const wCount = st.inventory?.workers ?? 0;
    for (let i = 0; i < Math.min(wCount, FRONT_COLS); i++) {
      this._onSpawnWorker({ type: 'worker' });
    }

    // Machines — cap at 2 per type on load to avoid slot exhaustion
    const hwIds = ['gpu', 'cluster', 'rack', 'megaDC', 'quantumDC'];
    hwIds.forEach(id => {
      const count = st.hardware?.[id] ?? 0;
      const hw    = typeof HARDWARE !== 'undefined'
        ? HARDWARE.find(h => h.id === id)
        : null;
      for (let i = 0; i < Math.min(count, 2); i++) {
        this._onSpawnMachine({ hwId: id, computePS: hw?.computePS ?? 0 });
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PROCEDURAL FALLBACK DRAWING
  // Used when sprite sheets AND static images both fail to load.
  // Warm retro colours, no neon.
  // ─────────────────────────────────────────────────────────────

  /**
   * Draw a warm pixel-art office room when bg.png is absent.
   */
  _drawRetroRoom(W, H) {
    const g    = this.add.graphics().setDepth(0);
    const wallH = H * 0.44;

    // Ceiling strip
    g.fillStyle(C.ceiling);
    g.fillRect(0, 0, W, 14);

    // Fluorescent light panels
    const lCount = Math.floor(W / 180);
    for (let i = 0; i < lCount; i++) {
      const lx = (i + 0.5) * (W / lCount);
      g.fillStyle(C.lightPanel);
      g.fillRect(lx - 44, 2, 88, 10);
      g.lineStyle(2, C.winFrame, 1);
      g.strokeRect(lx - 44, 2, 88, 10);
    }

    // Wall
    g.fillStyle(C.wall);
    g.fillRect(0, 14, W, wallH - 14);

    // Dado rail
    g.fillStyle(C.wallStripe);
    g.fillRect(0, wallH - 24, W, 12);
    g.lineStyle(2, C.skirting, 1);
    g.strokeRect(0, wallH - 24, W, 12);

    // Windows
    const winCount = Math.max(2, Math.floor(W / 220));
    for (let i = 0; i < winCount; i++) {
      const wx = 70 + i * (W / winCount);
      const wy = 22;
      const ww = 110, wh = wallH - 56;

      g.fillStyle(C.winFrame);
      g.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
      g.fillStyle(C.winSky);
      g.fillRect(wx, wy, ww, Math.floor(wh * 0.6));
      g.fillStyle(C.winGlass);
      g.fillRect(wx, wy + Math.floor(wh * 0.6), ww, Math.ceil(wh * 0.4));

      // City silhouette
      g.fillStyle(C.cityBldg);
      [0.12, 0.28, 0.18, 0.34, 0.22].forEach((h, j) => {
        const bx = wx + j * (ww / 5);
        const bh = wh * 0.4 * h + 8;
        g.fillRect(bx, wy + Math.floor(wh * 0.6) - bh, ww / 5 - 2, bh);
      });

      g.lineStyle(4, C.winFrame, 1);
      g.strokeRect(wx, wy, ww, wh);
      g.lineStyle(2, C.winFrame, 1);
      g.beginPath();
      g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh);
      g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2);
      g.strokePath();
      g.fillStyle(C.winFrame);
      g.fillRect(wx - 8, wy + wh + 6, ww + 16, 8);
    }

    // Poster
    const px = W * 0.62, py = 30;
    g.fillStyle(C.skirting);
    g.fillRect(px - 42, py - 4, 84, 52);
    g.fillStyle(C.poster);
    g.fillRect(px - 38, py, 76, 44);
    g.fillStyle(C.skirting);
    for (let k = 0; k < 4; k++) g.fillRect(px - 26, py + 10 + k * 9, 52, 4);

    // HQ name plate
    const npX = W / 2, npY = wallH - 50;
    g.fillStyle(C.skirting);
    g.fillRect(npX - 98, npY - 4, 196, 30);
    g.fillStyle(C.poster);
    g.fillRect(npX - 94, npY, 188, 22);
    this.add.text(npX, npY + 11, '★  ChillGPT HQ  ★', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '10px',
      color:      '#3a1a00',
    }).setOrigin(0.5).setDepth(4);

    // Skirting board
    g.fillStyle(C.skirting);
    g.fillRect(0, wallH, W, 10);

    // Floor — warm parquet checkerboard
    const TILE  = 44;
    const fRows = Math.ceil((H - wallH) / TILE) + 2;
    const fCols = Math.ceil(W / TILE) + 2;
    for (let r = 0; r < fRows; r++) {
      for (let c = 0; c < fCols; c++) {
        g.fillStyle((r + c) % 2 === 0 ? C.floor : C.floorAlt);
        g.fillRect(c * TILE, wallH + 10 + r * TILE, TILE, TILE);
      }
    }
    // Subtle plank lines
    g.lineStyle(1, C.skirting, 0.12);
    for (let r = 0; r <= fRows; r++) {
      g.beginPath();
      g.moveTo(0, wallH + 10 + r * TILE);
      g.lineTo(W, wallH + 10 + r * TILE);
      g.strokePath();
    }
  }

  /**
   * Procedural worker desk — used only when all image assets fail.
   */
  _procWorker(cx, cy, targetH) {
    const g   = this.add.graphics().setDepth(8);
    const s   = targetH / 80;   // scale factor relative to 80px reference height
    const dW  = Math.round(54 * s);
    const dH  = Math.round(28 * s);
    const dX  = cx - dW / 2;
    const dY  = cy - dH;        // origin bottom

    // Chair
    g.fillStyle(C.chairBack);
    g.fillRect(cx - Math.round(10 * s), dY - Math.round(18 * s), Math.round(20 * s), Math.round(14 * s));
    g.lineStyle(2, C.black, 1);
    g.strokeRect(cx - Math.round(10 * s), dY - Math.round(18 * s), Math.round(20 * s), Math.round(14 * s));

    // Desk top
    g.fillStyle(C.deskWood);
    g.fillRect(dX, dY, dW, dH);
    g.lineStyle(2, C.deskEdge, 1);
    g.strokeRect(dX, dY, dW, dH);
    g.fillStyle(C.deskEdge);
    g.fillRect(dX, dY + dH - Math.round(5 * s), dW, Math.round(5 * s));
    // Legs
    g.fillRect(dX + 3, dY + dH, Math.round(5 * s), Math.round(8 * s));
    g.fillRect(dX + dW - Math.round(8 * s), dY + dH, Math.round(5 * s), Math.round(8 * s));

    // Monitor
    const mW = Math.round(24 * s), mH = Math.round(18 * s);
    const mX = cx - mW / 2 + Math.round(4 * s);
    const mY = dY - mH - Math.round(2 * s);
    g.fillStyle(C.monCase);
    g.fillRect(mX - 3, mY - 3, mW + 6, mH + 6);
    g.lineStyle(2, C.deskEdge, 1);
    g.strokeRect(mX - 3, mY - 3, mW + 6, mH + 6);
    g.fillStyle(C.monScr);
    g.fillRect(mX, mY, mW, mH);
    g.fillStyle(0x50e050);
    for (let i = 0; i < 4; i++) {
      g.fillRect(mX + 2, mY + 2 + i * Math.round(4 * s), Math.round((6 + Math.random() * (mW - 10)) * s / s), Math.round(2 * s));
    }

    // Worker body (tiny pixel figure)
    const pX = mX - Math.round(12 * s);
    const pY = dY - Math.round(14 * s);
    g.fillStyle(0x4870d0);
    g.fillRect(pX, pY + Math.round(7 * s), Math.round(10 * s), Math.round(10 * s));
    g.fillStyle(0xf0c880);
    g.fillRect(pX + Math.round(1 * s), pY, Math.round(8 * s), Math.round(8 * s));
    g.fillStyle(0x301808);
    g.fillRect(pX + Math.round(1 * s), pY, Math.round(8 * s), Math.round(3 * s));

    g._ts = 1; // already scaled via geometry
    return g;
  }

  /**
   * Procedural machine — used only when all image assets fail.
   */
  _procMachine(cx, cy, hwId, targetH) {
    const defs = {
      gpu:       { body: C.gpuPCB,  edge: C.gpuEdge,  leds: [C.ledG, C.ledG],          w: 0.55 },
      cluster:   { body: 0x5a7c22, edge: 0x2a4008,    leds: [C.ledG, C.ledG, 0xe0e050], w: 0.65 },
      rack:      { body: C.rackBody, edge: C.rackEdge, leds: [C.ledR, C.ledG, C.ledR, C.ledG], w: 0.60 },
      megaDC:    { body: 0x505860, edge: 0x1a1e24,    leds: [C.ledG, C.ledG, C.ledR],   w: 0.70 },
      quantumDC: { body: 0x3a2848, edge: 0x18101e,    leds: [0x9050c0, C.ledG, 0x9050c0], w: 0.80 },
    };

    const def = defs[hwId] ?? defs.gpu;
    const bH  = targetH;
    const bW  = Math.round(bH * def.w);
    const bX  = cx - bW / 2;
    const bY  = cy - bH;

    const g = this.add.graphics().setDepth(7);
    g.fillStyle(def.body);
    g.fillRect(bX, bY, bW, bH);
    g.lineStyle(3, def.edge, 1);
    g.strokeRect(bX, bY, bW, bH);
    g.fillStyle(def.edge);
    g.fillRect(bX + 4, bY + 4, bW - 8, 4);

    // Vent slots
    g.lineStyle(1, def.edge, 0.35);
    const slots = Math.floor(bH / 10);
    for (let i = 0; i < slots; i++) {
      g.beginPath();
      g.moveTo(bX + 5, bY + 12 + i * 10);
      g.lineTo(bX + bW - 13, bY + 12 + i * 10);
      g.strokePath();
    }

    // GPU fan
    if (hwId === 'gpu' || hwId === 'cluster') {
      g.fillStyle(C.gpuFan);
      g.fillCircle(cx, bY + bH * 0.38, bW * 0.27);
      g.lineStyle(2, def.edge, 1);
      g.strokeCircle(cx, bY + bH * 0.38, bW * 0.27);
      g.fillStyle(def.edge);
      g.fillCircle(cx, bY + bH * 0.38, 4);
      // Gold contacts
      g.fillStyle(0xc8a820);
      for (let c = 0; c < 5; c++) {
        const cw = Math.floor(bW / 7);
        g.fillRect(bX + 5 + c * cw, bY + bH - 10, cw - 2, 10);
      }
    }

    // LEDs
    const ledSp = (bH - 20) / (def.leds.length + 1);
    def.leds.forEach((col, i) => {
      const lx = bX + bW - 9;
      const ly = bY + 10 + (i + 1) * ledSp;
      g.fillStyle(col);
      g.fillCircle(lx, ly, 4);
      g.lineStyle(1, def.edge, 0.5);
      g.strokeCircle(lx, ly, 4);
    });

    // Shadow
    g.fillStyle(0x000000);
    g.setAlpha(0.12);
    g.fillEllipse(cx, bY + bH + 4, bW * 0.75, 7);
    g.setAlpha(1);

    // Label
    this.add.text(cx, bY + bH - 5, hwId.toUpperCase().slice(0, 5), {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '6px',
      color:      '#' + def.edge.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 1).setDepth(8);

    // Pulse alpha
    this.tweens.add({
      targets:  g,
      alpha:    { from: 0.88, to: 1 },
      duration: 1000 + Math.random() * 600,
      yoyo:     true, repeat: -1, ease: 'Sine.easeInOut',
    });

    g._ts = 1;
    return g;
  }
}

// ─────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────

function initPhaserGame() {
  const factory = document.getElementById('factory');
  if (!factory) { console.warn('[Phaser] #factory missing.'); return; }

  const W = factory.clientWidth  || window.innerWidth  - 320;
  const H = factory.clientHeight || window.innerHeight - 122;

  const wrapper  = document.createElement('div');
  wrapper.id     = 'phaser-canvas-wrapper';
  factory.insertBefore(wrapper, factory.firstChild);

  window.__phaserGame = new Phaser.Game({
    type:        Phaser.AUTO,
    width:       W,
    height:      H,
    transparent: true,
    parent:      wrapper,
    scene:       [GameDevStoryScene],
    scale: {
      mode:       Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias:   false,
      pixelArt:    true,
      roundPixels: true,
    },
  });

  console.log('[Phaser] GameDevStoryScene booted ✅  (Grid + Sprite Animations)');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhaserGame);
} else {
  setTimeout(initPhaserGame, 0);
}
