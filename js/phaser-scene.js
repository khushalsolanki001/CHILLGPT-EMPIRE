/**
 * phaser-scene.js  ★ RETRO TYCOON — Zoned Grid Placement ★
 * ─────────────────────────────────────────────────────────────────
 * Canvas: 1208 × 600 (dynamic, computed at boot).
 * Floor occupies roughly Y 260–600 (lower 56% of canvas).
 *
 * TWO PLACEMENT ZONES (absolute pixel coordinates):
 *   machineZone — back of room, just below the windowsills
 *   workerZone  — front of room, clearly on the wooden floor
 *
 * Row-wrapping: when currentX + spacingX > maxX → new row.
 *
 * Sprite sheets: 1024×1024, 2 frames @ frameWidth=512, frameHeight=1024.
 * Scale is computed via _scaleToTargetH() so sprites are always
 * the same logical pixel height regardless of source dimensions.
 * ─────────────────────────────────────────────────────────────────
 */

/* global Phaser */

// ─────────────────────────────────────────────────────────────────
// SPRITE SHEET FRAME DIMENSIONS
// All AI-generated sheets are 1024×1024 with 2 frames side-by-side.
// ─────────────────────────────────────────────────────────────────
const FRAME_W = 512;
const FRAME_H = 1024;

// ─────────────────────────────────────────────────────────────────
// TARGET RENDERED HEIGHTS (pixels in canvas space)
// These are the final rendered sizes. Scale is derived automatically.
// ─────────────────────────────────────────────────────────────────
const TARGET_H = {
  worker:    160,  // desk + seated worker
  gpu:       110,  // GPU card (short)
  cluster:   130,  // GPU cluster (slightly taller)
  rack:      160,  // server rack (tall cabinet)
  megaDC:    185,  // mega DC
  quantumDC: 210,  // quantum DC (largest)
};

// ─────────────────────────────────────────────────────────────────
// ZONE DEFINITIONS (computed relative to canvas in _buildZones)
//
// All Y values are "bottom anchor" i.e. the sprite's feet sit at Y.
// We use .setOrigin(0.5, 1) so the bottom-center is the anchor.
//
// Layout in a 1208×600 canvas:
//   Wall/windows: Y = 0 → ~264  (44% of height)
//   Floor:        Y = 264 → 600
//   machineZone Y bottom anchor ≈ 400  (machines against back wall)
//   workerZone  Y bottom anchor ≈ 530  (workers front of floor)
// ─────────────────────────────────────────────────────────────────
function makeZone(startX, startY, spacingX, spacingY, maxX) {
  return {
    startX,    // initial X position (pixels)
    startY,    // initial Y position — bottom anchor (pixels)
    spacingX,  // horizontal gap between item centres
    spacingY,  // vertical gap when wrapping to a new row
    maxX,      // right boundary before row-wrap
    currentX:  startX,
    currentY:  startY,
  };
}

// ─────────────────────────────────────────────────────────────────
// WARM RETRO COLOUR PALETTE (procedural fallback only)
// ─────────────────────────────────────────────────────────────────
const C = {
  wall:       0xd4b882,  wallStripe: 0xc0a870,
  floor:      0xb89050,  floorAlt:   0xa87e40,
  skirting:   0x7a5230,  ceiling:    0xe8d4a8,
  lightPanel: 0xfff0c0,  winFrame:   0x6a3c14,
  winGlass:   0x90c4e8,  winSky:     0x5aa0d0,
  cityBldg:   0x2a3848,  poster:     0xe8a840,
  deskWood:   0x9c6830,  deskEdge:   0x5a3810,
  monCase:    0xd0c8b0,  monScr:     0x2a3c18,
  chairBack:  0x3850a0,  gpuPCB:     0x6a8c2a,
  gpuEdge:    0x3a5010,  gpuFan:     0xb0b8c0,
  rackBody:   0x606870,  rackEdge:   0x2a2e34,
  ledR:       0xe03030,  ledG:       0x30d050,
  feedGold:   0xc8960c,  feedGreen:  0x3d7a2e,
  feedBlue:   0x1e5fa8,  black:      0x000000,
};

// ─────────────────────────────────────────────────────────────────
// SCENE
// ─────────────────────────────────────────────────────────────────

class GameDevStoryScene extends Phaser.Scene {

  constructor() {
    super({ key: 'GameDevStoryScene' });
    this._machineZone = null;
    this._workerZone  = null;
    this._ok          = {};  // which textures/sheets loaded OK
  }

  // ── PRELOAD ────────────────────────────────────────────────────

  preload() {
    const ok = (key) => { this._ok[key] = true; };

    // Background — empty room
    this.load.image('bg', 'assets/images/bg.png');
    this.load.on('filecomplete-image-bg', () => ok('bg'));

    // Sprite sheets (1024×1024 → 2 frames each @ 512×1024)
    this.load.spritesheet('server_anim', 'assets/images/server_sheet.png',
      { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.on('filecomplete-spritesheet-server_anim', () => ok('server_anim'));

    this.load.spritesheet('worker_anim', 'assets/images/worker_sheet.png',
      { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.on('filecomplete-spritesheet-worker_anim', () => ok('worker_anim'));

    this.load.spritesheet('gpu_anim', 'assets/images/gpu_sheet.png',
      { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.on('filecomplete-spritesheet-gpu_anim', () => ok('gpu_anim'));

    // Static fallback images
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

    // 1. Background
    this._drawBackground(W, H);

    // 2. Build placement zones using actual canvas dimensions
    this._buildZones(W, H);

    // 3. Define spritesheet animations
    this._createAnimations();

    // 4. Wire CustomEvents from UI/game.js
    window.addEventListener('SPAWN_WORKER',   (e) => this._onSpawnWorker(e.detail));
    window.addEventListener('SPAWN_MACHINE',  (e) => this._onSpawnMachine(e.detail));
    window.addEventListener('SPAWN_FEEDBACK', (e) => this._onSpawnFeedback(e.detail));

    // 5. Ambient tick — typing emoji near workers
    this.time.addEvent({
      delay:         2400,
      loop:          true,
      callback:      this._ambientTick,
      callbackScope: this,
    });

    // 6. Replay items already purchased (on page load / save restore)
    this._syncWithGameState();
  }

  // ── BACKGROUND ─────────────────────────────────────────────────

  _drawBackground(W, H) {
    if (this._ok['bg']) {
      const src    = this.textures.get('bg').getSourceImage();
      const scale  = Math.max(W / src.width, H / src.height);
      this.add.image(W / 2, H / 2, 'bg').setScale(scale).setDepth(0);
    } else {
      this._drawRetroRoom(W, H);
    }
  }

  // ── ZONE BUILDER ───────────────────────────────────────────────

  /**
   * Build placement zones based on the actual canvas size.
   *
   * Zone Y coordinates are "bottom-anchor" pixel positions.
   * The room floor starts at roughly H * 0.44.
   *
   * machineZone: just below the window sills (back wall of room)
   *              bottom anchor = H * 0.65  (~390 on 600px canvas)
   * workerZone:  front of wooden floor
   *              bottom anchor = H * 0.89  (~534 on 600px canvas)
   *
   * Spacing and maxX scale with canvas width so it works at any size.
   */
  _buildZones(W, H) {
    // ── Calibrated to actual bg.png room layout ──
    // The dado rail / windowsill bottom sits at ≈ H * 0.70 (~420px on 600px H).
    // Wooden floor spans H * 0.72 → H (432px → 600px).
    //
    // LEFT_MARGIN: skip the mascot + window area on the far left.
    // RIGHT_MARGIN: leave a gap before the shop panel shadow.

    const LEFT_MARGIN  = Math.round(W * 0.22);  // ≈ 267px — past windows+mascot
    const RIGHT_MARGIN = Math.round(W * 0.06);  // ≈ 73px
    const MAX_X        = W - RIGHT_MARGIN;

    // machineZone — floor, just past the dado rail (back row)
    // Bottom anchor Y = H * 0.76 so tops of tallest~210px sprites still clear rail.
    const mStartX   = LEFT_MARGIN;
    const mStartY   = Math.round(H * 0.76);   // ≈ 456px on 600px canvas
    const mSpacingX = 130;   // wide enough for 110–160px‐wide sprite art
    const mSpacingY = 90;    // row-wrap vertical gap

    // workerZone — front of wooden floor (foreground row)
    // Bottom anchor Y = H * 0.93 — clearly on the warm parquet.
    const wStartX   = LEFT_MARGIN;
    const wStartY   = Math.round(H * 0.93);   // ≈ 558px on 600px canvas
    const wSpacingX = 140;   // desks are wider than GPU cards
    const wSpacingY = 90;

    this._machineZone = makeZone(mStartX, mStartY, mSpacingX, mSpacingY, MAX_X);
    this._workerZone  = makeZone(wStartX, wStartY, wSpacingX, wSpacingY, MAX_X);

    console.log('[Phaser] machineZone:', mStartX, mStartY, '→ maxX', MAX_X);
    console.log('[Phaser] workerZone: ', wStartX, wStartY, '→ maxX', MAX_X);
  }

  /**
   * Get the next placement position from a zone, with row-wrapping.
   * Advances zone.currentX by spacingX; wraps when currentX > maxX.
   * @returns {x, y} canvas pixel position (bottom-anchor)
   */
  _nextZonePos(zone) {
    const pos = { x: zone.currentX, y: zone.currentY };

    // Advance X
    zone.currentX += zone.spacingX;

    // Wrap to next row when past right boundary
    if (zone.currentX > zone.maxX) {
      zone.currentX  = zone.startX;
      zone.currentY += zone.spacingY;   // shift down for new row
    }

    return pos;
  }

  // ── ANIMATIONS ─────────────────────────────────────────────────

  _createAnimations() {
    if (this._ok['server_anim']) {
      this.anims.create({
        key: 'server_blink',
        frames: this.anims.generateFrameNumbers('server_anim', { start: 0, end: 1 }),
        frameRate: 3, repeat: -1,
      });
    }
    if (this._ok['worker_anim']) {
      this.anims.create({
        key: 'worker_type',
        frames: this.anims.generateFrameNumbers('worker_anim', { start: 0, end: 1 }),
        frameRate: 5, repeat: -1,
      });
    }
    if (this._ok['gpu_anim']) {
      this.anims.create({
        key: 'gpu_spin',
        frames: this.anims.generateFrameNumbers('gpu_anim', { start: 0, end: 1 }),
        frameRate: 7, repeat: -1,
      });
    }
  }

  // ── SPAWN: WORKER ──────────────────────────────────────────────

  _onSpawnWorker(_detail) {
    const pos = this._nextZonePos(this._workerZone);
    const tH  = TARGET_H.worker;
    let   obj;

    if (this._ok['worker_anim']) {
      obj = this.add.sprite(pos.x, pos.y, 'worker_anim', 0)
        .setOrigin(0.5, 1)
        .setDepth(8);
      this._scaleToTargetH(obj, FRAME_H, tH);
      obj.play('worker_type');

    } else if (this._ok['desk']) {
      const tex = this.textures.get('desk').getSourceImage();
      obj = this.add.image(pos.x, pos.y, 'desk')
        .setOrigin(0.5, 1)
        .setDepth(8);
      this._scaleToTargetH(obj, tex.height, tH);

    } else {
      obj = this._procWorker(pos.x, pos.y, tH);
    }

    if (obj) this._popIn(obj);
    this.cameras.main.shake(140, 0.003);
  }

  // ── SPAWN: MACHINE ─────────────────────────────────────────────

  _onSpawnMachine(detail) {
    const pos      = this._nextZonePos(this._machineZone);
    const hwId     = detail.hwId || 'gpu';
    const isServer = ['rack', 'megaDC', 'quantumDC'].includes(hwId);
    const tH       = TARGET_H[hwId] ?? TARGET_H.gpu;
    let   obj;

    if (isServer && this._ok['server_anim']) {
      obj = this.add.sprite(pos.x, pos.y, 'server_anim', 0)
        .setOrigin(0.5, 1)
        .setDepth(7);
      this._scaleToTargetH(obj, FRAME_H, tH);
      obj.play('server_blink');

    } else if (!isServer && this._ok['gpu_anim']) {
      obj = this.add.sprite(pos.x, pos.y, 'gpu_anim', 0)
        .setOrigin(0.5, 1)
        .setDepth(7);
      this._scaleToTargetH(obj, FRAME_H, tH);
      obj.play('gpu_spin');

    } else if (isServer && this._ok['server']) {
      const tex = this.textures.get('server').getSourceImage();
      obj = this.add.image(pos.x, pos.y, 'server')
        .setOrigin(0.5, 1)
        .setDepth(7);
      this._scaleToTargetH(obj, tex.height, tH);

    } else if (!isServer && this._ok['gpu']) {
      const tex = this.textures.get('gpu').getSourceImage();
      obj = this.add.image(pos.x, pos.y, 'gpu')
        .setOrigin(0.5, 1)
        .setDepth(7);
      this._scaleToTargetH(obj, tex.height, tH);

    } else {
      obj = this._procMachine(pos.x, pos.y, hwId, tH);
    }

    if (obj) this._popIn(obj);

    // Floating "+X TF/s" text
    const label = detail.computePS ? `+${detail.computePS} TF/s` : '+CU';
    this._spawnFeedbackText(pos.x, pos.y - tH - 14, label, C.feedBlue);
    this.cameras.main.shake(90, 0.002);
  }

  // ── SPAWN: FEEDBACK ────────────────────────────────────────────

  _onSpawnFeedback(detail) {
    const W = this.scale.width, H = this.scale.height;
    const x = detail.x ?? W / 2 + (Math.random() - 0.5) * 200;
    const y = detail.y ?? H * 0.55;
    this._spawnFeedbackText(x, y, detail.text, detail.color ?? C.feedGold);
  }

  // ── HELPERS ────────────────────────────────────────────────────

  /**
   * Set uniform scale so the sprite renders at targetPx tall.
   * Stores the final scale as ._ts for use by _popIn.
   */
  _scaleToTargetH(obj, naturalH, targetPx) {
    const s = naturalH > 0 ? targetPx / naturalH : 0.15;
    obj.setScale(s);
    obj._ts = s;
  }

  /**
   * Scale-from-zero pop-in tween. Reads obj._ts (target scale).
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
      y:          y - 58,
      alpha:      { from: 1, to: 0 },
      duration:   1600,
      ease:       'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  // ── AMBIENT TICK ───────────────────────────────────────────────

  _ambientTick() {
    // Show 💻 near a random worker position that's been filled
    const filledCount = Math.floor(
      (this._workerZone.currentX - this._workerZone.startX) / this._workerZone.spacingX
    );
    if (filledCount <= 0) return;
    const idx  = Math.floor(Math.random() * filledCount);
    const wX   = this._workerZone.startX + idx * this._workerZone.spacingX;
    const wY   = this._workerZone.startY;
    this._spawnFeedbackText(wX, wY - TARGET_H.worker - 8, '💻', C.feedGreen);
  }

  // ── SYNC SAVED STATE ───────────────────────────────────────────

  _syncWithGameState() {
    if (typeof Game === 'undefined') return;
    const st = Game.state;

    // Workers — cap at 6 on load to avoid zone overflow
    const wCount = Math.min(st.inventory?.workers ?? 0, 6);
    for (let i = 0; i < wCount; i++) this._onSpawnWorker({});

    // Machines — cap at 3 per type on load
    const hwOrder = ['gpu', 'cluster', 'rack', 'megaDC', 'quantumDC'];
    hwOrder.forEach(id => {
      const count = Math.min(st.hardware?.[id] ?? 0, 3);
      const hw    = typeof HARDWARE !== 'undefined'
        ? HARDWARE.find(h => h.id === id) : null;
      for (let i = 0; i < count; i++) {
        this._onSpawnMachine({ hwId: id, computePS: hw?.computePS ?? 0 });
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PROCEDURAL FALLBACK DRAWING
  // Only used when all image/spritesheet assets fail to load.
  // ─────────────────────────────────────────────────────────────

  _drawRetroRoom(W, H) {
    const g     = this.add.graphics().setDepth(0);
    const wallH = H * 0.44;

    // Ceiling
    g.fillStyle(C.ceiling);
    g.fillRect(0, 0, W, 14);

    // Fluorescent panels
    for (let i = 0, n = Math.floor(W / 180); i < n; i++) {
      const lx = (i + 0.5) * (W / n);
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
    const nWin = Math.max(2, Math.floor(W / 220));
    for (let i = 0; i < nWin; i++) {
      const wx = 70 + i * (W / nWin);
      const wy = 22, ww = 110, wh = wallH - 56;
      g.fillStyle(C.winFrame);
      g.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
      g.fillStyle(C.winSky);
      g.fillRect(wx, wy, ww, Math.floor(wh * 0.6));
      g.fillStyle(C.winGlass);
      g.fillRect(wx, wy + Math.floor(wh * 0.6), ww, Math.ceil(wh * 0.4));
      g.fillStyle(C.cityBldg);
      [0.12, 0.28, 0.18, 0.34, 0.22].forEach((fh, j) => {
        const bh = wh * 0.4 * fh + 8;
        g.fillRect(wx + j * (ww / 5), wy + Math.floor(wh * 0.6) - bh, ww / 5 - 2, bh);
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
    g.fillStyle(C.skirting);
    g.fillRect(W / 2 - 98, wallH - 54, 196, 30);
    g.fillStyle(C.poster);
    g.fillRect(W / 2 - 94, wallH - 50, 188, 22);
    this.add.text(W / 2, wallH - 39, '★  ChillGPT HQ  ★', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#3a1a00',
    }).setOrigin(0.5).setDepth(4);

    // Skirting
    g.fillStyle(C.skirting);
    g.fillRect(0, wallH, W, 10);

    // Floor parquet
    const TILE  = 44;
    const fRows = Math.ceil((H - wallH) / TILE) + 2;
    const fCols = Math.ceil(W / TILE) + 2;
    for (let r = 0; r < fRows; r++) {
      for (let c = 0; c < fCols; c++) {
        g.fillStyle((r + c) % 2 === 0 ? C.floor : C.floorAlt);
        g.fillRect(c * TILE, wallH + 10 + r * TILE, TILE, TILE);
      }
    }
    g.lineStyle(1, C.skirting, 0.12);
    for (let r = 0; r <= fRows; r++) {
      g.beginPath();
      g.moveTo(0, wallH + 10 + r * TILE);
      g.lineTo(W, wallH + 10 + r * TILE);
      g.strokePath();
    }
  }

  /** Procedural desk+worker sprite */
  _procWorker(cx, cy, targetH) {
    const g  = this.add.graphics().setDepth(8);
    const s  = targetH / 80;
    const dW = Math.round(54 * s), dH = Math.round(28 * s);
    const dX = cx - dW / 2, dY = cy - dH;

    g.fillStyle(C.chairBack);
    g.fillRect(cx - Math.round(10 * s), dY - Math.round(18 * s), Math.round(20 * s), Math.round(14 * s));
    g.lineStyle(2, C.black);
    g.strokeRect(cx - Math.round(10 * s), dY - Math.round(18 * s), Math.round(20 * s), Math.round(14 * s));

    g.fillStyle(C.deskWood);
    g.fillRect(dX, dY, dW, dH);
    g.lineStyle(2, C.deskEdge);
    g.strokeRect(dX, dY, dW, dH);
    g.fillStyle(C.deskEdge);
    g.fillRect(dX, dY + dH - Math.round(5 * s), dW, Math.round(5 * s));
    g.fillRect(dX + 3, dY + dH, Math.round(5 * s), Math.round(8 * s));
    g.fillRect(dX + dW - Math.round(8 * s), dY + dH, Math.round(5 * s), Math.round(8 * s));

    const mW = Math.round(24 * s), mH = Math.round(18 * s);
    const mX = cx - mW / 2 + Math.round(4 * s), mY = dY - mH - Math.round(2 * s);
    g.fillStyle(C.monCase); g.fillRect(mX - 3, mY - 3, mW + 6, mH + 6);
    g.lineStyle(2, C.deskEdge); g.strokeRect(mX - 3, mY - 3, mW + 6, mH + 6);
    g.fillStyle(C.monScr); g.fillRect(mX, mY, mW, mH);
    g.fillStyle(0x50e050);
    for (let i = 0; i < 4; i++) g.fillRect(mX + 2, mY + 2 + i * Math.round(4 * s), Math.round(14 * s), Math.round(2 * s));

    // Worker figure
    const pX = mX - Math.round(12 * s), pY = dY - Math.round(14 * s);
    g.fillStyle(0x4870d0); g.fillRect(pX, pY + Math.round(7 * s), Math.round(10 * s), Math.round(10 * s));
    g.fillStyle(0xf0c880); g.fillRect(pX + Math.round(1 * s), pY, Math.round(8 * s), Math.round(8 * s));
    g.fillStyle(0x301808); g.fillRect(pX + Math.round(1 * s), pY, Math.round(8 * s), Math.round(3 * s));

    g._ts = 1;
    return g;
  }

  /** Procedural machine — warm colours, no neon */
  _procMachine(cx, cy, hwId, targetH) {
    const defs = {
      gpu:       { body: C.gpuPCB,  edge: C.gpuEdge,  leds: [C.ledG, C.ledG],                 wR: 0.55 },
      cluster:   { body: 0x5a7c22, edge: 0x2a4008,    leds: [C.ledG, C.ledG, 0xe0e050],        wR: 0.65 },
      rack:      { body: C.rackBody, edge: C.rackEdge, leds: [C.ledR, C.ledG, C.ledR, C.ledG], wR: 0.58 },
      megaDC:    { body: 0x505860, edge: 0x1a1e24,    leds: [C.ledG, C.ledG, C.ledR],          wR: 0.68 },
      quantumDC: { body: 0x3a2848, edge: 0x18101e,    leds: [0x9050c0, C.ledG, 0x9050c0],      wR: 0.76 },
    };
    const def = defs[hwId] ?? defs.gpu;
    const bH  = targetH, bW = Math.round(bH * def.wR);
    const bX  = cx - bW / 2, bY = cy - bH;

    const g = this.add.graphics().setDepth(7);
    g.fillStyle(def.body); g.fillRect(bX, bY, bW, bH);
    g.lineStyle(3, def.edge); g.strokeRect(bX, bY, bW, bH);
    g.fillStyle(def.edge); g.fillRect(bX + 4, bY + 4, bW - 8, 4);

    // Vent slots
    g.lineStyle(1, def.edge, 0.35);
    for (let i = 0; i < Math.floor(bH / 10); i++) {
      g.beginPath(); g.moveTo(bX + 5, bY + 12 + i * 10); g.lineTo(bX + bW - 13, bY + 12 + i * 10); g.strokePath();
    }
    // Fan (GPU/cluster)
    if (hwId === 'gpu' || hwId === 'cluster') {
      g.fillStyle(C.gpuFan); g.fillCircle(cx, bY + bH * 0.38, bW * 0.27);
      g.lineStyle(2, def.edge); g.strokeCircle(cx, bY + bH * 0.38, bW * 0.27);
      g.fillStyle(def.edge); g.fillCircle(cx, bY + bH * 0.38, 4);
      g.fillStyle(0xc8a820);
      for (let c = 0; c < 5; c++) {
        const cw = Math.floor(bW / 7);
        g.fillRect(bX + 5 + c * cw, bY + bH - 10, cw - 2, 10);
      }
    }
    // LEDs
    const ledSp = (bH - 20) / (def.leds.length + 1);
    def.leds.forEach((col, i) => {
      const lx = bX + bW - 9, ly = bY + 10 + (i + 1) * ledSp;
      g.fillStyle(col); g.fillCircle(lx, ly, 4);
      g.lineStyle(1, def.edge, 0.5); g.strokeCircle(lx, ly, 4);
    });
    // Shadow
    g.setAlpha(0.12); g.fillStyle(0x000000);
    g.fillEllipse(cx, bY + bH + 4, bW * 0.75, 7);
    g.setAlpha(1);

    this.add.text(cx, bY + bH - 5, hwId.toUpperCase().slice(0, 5), {
      fontFamily: '"Press Start 2P", monospace', fontSize: '6px',
      color: '#' + def.edge.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 1).setDepth(8);

    this.tweens.add({ targets: g, alpha: { from: 0.88, to: 1 }, duration: 1000 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    g._ts = 1;
    return g;
  }
}

// ─────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────

function initPhaserGame() {
  const factory = document.getElementById('factory');
  if (!factory) { console.warn('[Phaser] #factory not found.'); return; }

  const W = factory.clientWidth  || window.innerWidth  - 320;
  const H = factory.clientHeight || window.innerHeight - 122;

  const wrapper = document.createElement('div');
  wrapper.id    = 'phaser-canvas-wrapper';
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

  console.log('[Phaser] GameDevStoryScene booted ✅  (Zoned Grid Placement)');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhaserGame);
} else {
  setTimeout(initPhaserGame, 0);
}
