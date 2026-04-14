/**
 * phaser-scene.js  ★ RETRO TYCOON VISUAL THEME ★
 * ─────────────────────────────────────────────────────────────────
 * Phaser 3 Scene: "GameDevStoryScene"
 *
 * Visual style: Game Dev Story — warm 16-bit pixel art office room.
 * Falls back to procedural warm-coloured rectangles when sprites
 * are unavailable (e.g., offline / dev environment).
 *
 * CustomEvents listened from UI.js:
 *   • SPAWN_WORKER  → places a desk+worker in the next grid cell
 *   • SPAWN_MACHINE → places a machine sprite in the next grid cell
 *   • SPAWN_FEEDBACK→ shows a floating "+X TF/s" popup text
 * ─────────────────────────────────────────────────────────────────
 */

/* global Phaser */

// ── GRID CONFIGURATION ───────────────────────────────────────────

const GRID_COLS     = 8;
const GRID_ROWS     = 3;
const CELL_W        = 82;
const CELL_H        = 68;
const GRID_X_MARGIN = 20;   // left margin from canvas edge
const GRID_Y_FACTOR = 0.44; // top of grid as fraction of canvas height

// ── ASSET PATHS ──────────────────────────────────────────────────

const ASSET_BASE = 'assets/images/';

// ── WARM RETRO COLOUR PALETTE ────────────────────────────────────

const R = {
  // Room colours
  wall:        0xd4b882,
  wallStripe:  0xc0a870,
  floor:       0xb89050,
  floorAlt:    0xa87e40,
  ceiling:     0xe8d4a8,
  skirting:    0x7a5230,
  windowFrame: 0x6a3c14,
  windowGlass: 0x90c4e8,
  windowSky:   0x5aa0d0,
  door:        0x8a5c28,
  poster:      0xe8a840,
  lightPanel:  0xfff0c0,

  // Machine fallback colours (warm, no neon)
  gpuPCB:      0x6a8c2a,
  gpuEdge:     0x3a5010,
  gpuFan:      0xb0b8c0,
  rackBody:    0x606870,
  rackEdge:    0x2a2e34,
  rackLedR:    0xe03030,
  rackLedG:    0x30d050,
  deskWood:    0x9c6830,
  deskEdge:    0x5a3810,
  monitorCase: 0xd0c8b0,
  monitorScr:  0x2a3c18,
  chairBack:   0x3850a0,

  // Text / UI
  textDark:    0x1a1208,
  feedGold:    0xc8960c,
  feedGreen:   0x3d7a2e,
  feedBlue:    0x1e5fa8,
  black:       0x000000,
  white:       0xffffff,
};

// ── PHASER SCENE ─────────────────────────────────────────────────

class GameDevStoryScene extends Phaser.Scene {

  constructor() {
    super({ key: 'GameDevStoryScene' });
    this._cells     = [];   // grid cell descriptors
    this._workers   = [];   // { cell, container }
    this._machines  = [];   // { cell, container }
    this._spritesOk = {};   // tracks which texture keys loaded OK
  }

  // ── PRELOAD ────────────────────────────────────────────────────

  preload() {
    // Load sprite sheets / images.
    // Each uses an onError so we fall back to procedural drawing
    // if the file is missing (CORS-free local dev, etc.).
    const tryLoad = (key, path) => {
      this.load.image(key, ASSET_BASE + path);
      this.load.on('filecomplete-image-' + key, () => {
        this._spritesOk[key] = true;
      });
    };

    tryLoad('bg',     'bg.png');
    tryLoad('desk',   'desk.png');
    tryLoad('gpu',    'gpu.png');
    tryLoad('server', 'server.png');
  }

  // ── CREATE ─────────────────────────────────────────────────────

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // 1. Room background — sprite if available, else procedural
    if (this._spritesOk['bg']) {
      // Scale bg to COVER the canvas while preserving aspect ratio
      const tex    = this.textures.get('bg').getSourceImage();
      const scaleX = W / tex.width;
      const scaleY = H / tex.height;
      const scale  = Math.max(scaleX, scaleY);
      this.add.image(W / 2, H / 2, 'bg')
        .setScale(scale)
        .setDepth(0);
    } else {
      this._drawRetroRoom(W, H);
    }

    // 2. Build invisible grid
    this._buildGrid(W, H);

    // 3. Faint grid overlay (helps see the office floor layout)
    this._drawGridOverlay();

    // 4. Listen for React/UI CustomEvents
    window.addEventListener('SPAWN_WORKER',   (e) => this._onSpawnWorker(e.detail));
    window.addEventListener('SPAWN_MACHINE',  (e) => this._onSpawnMachine(e.detail));
    window.addEventListener('SPAWN_FEEDBACK', (e) => this._onSpawnFeedback(e.detail));

    // 5. Replay items already in game state (on load)
    this._syncWithGameState();

    // 6. Ambient tick — random worker activity sparks
    this.time.addEvent({
      delay: 1800,
      loop:  true,
      callback: this._ambientTick,
      callbackScope: this,
    });
  }

  // ── PROCEDURAL ROOM BACKGROUND ─────────────────────────────────

  /**
   * Draw a warm Game Dev Story–style office room when bg.png is absent.
   */
  _drawRetroRoom(W, H) {
    const g = this.add.graphics().setDepth(0);

    const wallH = H * 0.44;

    // ── CEILING ──
    g.fillStyle(R.ceiling);
    g.fillRect(0, 0, W, 14);

    // ── FLUORESCENT LIGHT PANELS ──
    const lCount = Math.floor(W / 180);
    for (let i = 0; i < lCount; i++) {
      const lx = (i + 0.5) * (W / lCount);
      g.fillStyle(R.lightPanel);
      g.fillRect(lx - 45, 2, 90, 10);
      g.lineStyle(2, R.windowFrame, 1);
      g.strokeRect(lx - 45, 2, 90, 10);
    }

    // ── WALL (upper) ──
    g.fillStyle(R.wall);
    g.fillRect(0, 14, W, wallH - 14);

    // Dado rail stripe
    g.fillStyle(R.wallStripe);
    g.fillRect(0, wallH - 24, W, 12);
    g.lineStyle(2, R.skirting, 1);
    g.strokeRect(0, wallH - 24, W, 12);

    // ── WINDOWS ──
    const winCount = Math.floor(W / 220);
    for (let i = 0; i < winCount; i++) {
      const wx = 70 + i * (W / winCount);
      const wy = 22;
      const ww = 120; const wh = wallH - 60;

      // Window reveal
      g.fillStyle(R.windowFrame);
      g.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);

      // Sky gradient (solid blocks)
      g.fillStyle(R.windowSky);
      g.fillRect(wx, wy, ww, wh * 0.6);
      g.fillStyle(R.windowGlass);
      g.fillRect(wx, wy + wh * 0.6, ww, wh * 0.4);

      // City silhouette (simplified blocky buildings)
      g.fillStyle(0x2a3848);
      const buildings = [0.1, 0.25, 0.15, 0.3, 0.2, 0.35];
      buildings.forEach((h, j) => {
        const bx = wx + j * (ww / buildings.length);
        const bh = wh * 0.4 * h + 10;
        g.fillRect(bx, wy + wh * 0.6 - bh, ww / buildings.length - 2, bh);
      });

      // Window cross-frame
      g.lineStyle(4, R.windowFrame, 1);
      g.strokeRect(wx, wy, ww, wh);
      g.beginPath();
      g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh);
      g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2);
      g.strokePath();

      // Window sill
      g.fillStyle(R.windowFrame);
      g.fillRect(wx - 8, wy + wh + 6, ww + 16, 8);
    }

    // ── MOTIVATIONAL POSTER ──
    const px = W * 0.62; const py = 28;
    g.fillStyle(R.poster);
    g.fillRect(px - 40, py, 80, 55);
    g.lineStyle(3, R.skirting, 1);
    g.strokeRect(px - 40, py, 80, 55);
    // Text placeholder lines
    g.fillStyle(R.skirting);
    for (let k = 0; k < 4; k++) g.fillRect(px - 28, py + 12 + k * 10, 56, 4);

    // ── SIDE WALL CLOCK ──
    const clkX = W - 60; const clkY = wallH * 0.35;
    g.fillStyle(R.ceiling);
    g.fillCircle(clkX, clkY, 22);
    g.lineStyle(3, R.windowFrame, 1);
    g.strokeCircle(clkX, clkY, 22);
    g.lineStyle(3, R.windowFrame, 1);
    g.beginPath();
    g.moveTo(clkX, clkY); g.lineTo(clkX, clkY - 14); // 12 o'clock hand
    g.moveTo(clkX, clkY); g.lineTo(clkX + 10, clkY); // 3 o'clock hand
    g.strokePath();

    // ── SKIRTING BOARD ──
    g.fillStyle(R.skirting);
    g.fillRect(0, wallH, W, 10);

    // ── FLOOR (lower half) — checkerboard parquet ──
    const TILE = 44;
    const fRows = Math.ceil((H - wallH) / TILE) + 2;
    const fCols = Math.ceil(W / TILE) + 2;
    for (let r = 0; r < fRows; r++) {
      for (let c = 0; c < fCols; c++) {
        const fy = wallH + 10 + r * TILE;
        const fx = c * TILE;
        g.fillStyle((r + c) % 2 === 0 ? R.floor : R.floorAlt);
        g.fillRect(fx, fy, TILE, TILE);
      }
    }

    // Subtle floor grid lines
    g.lineStyle(1, R.skirting, 0.15);
    for (let r = 0; r < fRows; r++) {
      g.beginPath();
      g.moveTo(0, wallH + 10 + r * TILE);
      g.lineTo(W, wallH + 10 + r * TILE);
      g.strokePath();
    }

    // ── HQ NAME PLATE on wall ──
    const signX = W / 2, signY = wallH - 52;
    g.fillStyle(R.skirting);
    g.fillRect(signX - 96, signY - 4, 192, 30);
    g.fillStyle(R.poster);
    g.fillRect(signX - 92, signY, 184, 22);

    const signTxt = this.add.text(signX, signY + 11, '★ ChillGPT HQ ★', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '10px',
      color:      '#3a1a00',
    }).setOrigin(0.5).setDepth(4);
  }

  // ── GRID ───────────────────────────────────────────────────────

  _buildGrid(W, H) {
    this._cells = [];
    const gridW  = GRID_COLS * CELL_W;
    const startX = Math.floor((W - gridW) / 2) + GRID_X_MARGIN;
    const startY = Math.floor(H * GRID_Y_FACTOR);
    this._gridStartX = startX;
    this._gridStartY = startY;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        this._cells.push({
          x: startX + col * CELL_W + CELL_W / 2,
          y: startY + row * CELL_H + CELL_H / 2,
          row, col,
          occupied: false,
          obj: null,
        });
      }
    }
  }

  _drawGridOverlay() {
    const g = this.add.graphics().setDepth(3);
    g.lineStyle(1, R.skirting, 0.12);
    const sx = this._gridStartX, sy = this._gridStartY;
    for (let row = 0; row <= GRID_ROWS; row++) {
      g.beginPath();
      g.moveTo(sx, sy + row * CELL_H);
      g.lineTo(sx + GRID_COLS * CELL_W, sy + row * CELL_H);
      g.strokePath();
    }
    for (let col = 0; col <= GRID_COLS; col++) {
      g.beginPath();
      g.moveTo(sx + col * CELL_W, sy);
      g.lineTo(sx + col * CELL_W, sy + GRID_ROWS * CELL_H);
      g.strokePath();
    }
  }

  /**
   * Next free cell.
   * Workers prefer the BACK rows (lower indices), machines prefer FRONT.
   */
  _nextFreeCell(preferBack = true) {
    const sorted = [...this._cells].sort((a, b) =>
      preferBack ? a.row - b.row : b.row - a.row
    );
    return sorted.find(c => !c.occupied) || null;
  }

  // ── SPAWN HANDLERS ─────────────────────────────────────────────

  _onSpawnWorker(detail) {
    const cell = this._nextFreeCell(true);
    if (!cell) return;
    cell.occupied = true;

    const obj = this._spritesOk['desk']
      ? this._spawnDeskSprite(cell.x, cell.y)
      : this._spawnDeskProc(cell.x, cell.y);

    cell.obj = obj;
    this._workers.push({ cell, obj });
    this._animateWorker(obj, cell.y);
    this.cameras.main.shake(160, 0.003);
  }

  _onSpawnMachine(detail) {
    const cell = this._nextFreeCell(false);
    if (!cell) return;
    cell.occupied = true;

    const hwId = detail.hwId || 'gpu';
    const obj  = this._spawnMachineObj(cell.x, cell.y, hwId);
    cell.obj   = obj;
    this._machines.push({ cell, obj });

    // Appear animation
    this.tweens.add({
      targets: obj, scaleX: { from: 0, to: 1 }, scaleY: { from: 0, to: 1 },
      ease: 'Back.easeOut', duration: 380,
    });

    // Floating feedback
    const label = detail.computePS ? `+${detail.computePS} TF/s` : (detail.label || '+CU');
    this._spawnFeedbackText(cell.x, cell.y - 30, label, R.feedBlue);

    this.cameras.main.shake(100, 0.002);
  }

  _onSpawnFeedback(detail) {
    const W = this.scale.width, H = this.scale.height;
    const x = detail.x ?? W / 2 + (Math.random() - 0.5) * 200;
    const y = detail.y ?? H * 0.5;
    this._spawnFeedbackText(x, y, detail.text, detail.color || R.feedGold);
  }

  // ── DESK — SPRITE VERSION ──────────────────────────────────────

  _spawnDeskSprite(cx, cy) {
    const img = this.add.image(cx, cy, 'desk')
      .setDisplaySize(CELL_W - 8, CELL_H - 6)
      .setDepth(6)
      .setOrigin(0.5, 0.85);
    return img;
  }

  // ── DESK — PROCEDURAL FALLBACK ─────────────────────────────────

  /**
   * Draw a warm pixel-art worker+desk using Graphics when desk.png is absent.
   */
  _spawnDeskProc(cx, cy) {
    const g  = this.add.graphics().setDepth(6);
    const dW = CELL_W - 10;
    const dH = 30;
    const dX = cx - dW / 2;
    const dY = cy - dH / 2 + 8;

    // ── CHAIR (behind desk) ──
    g.fillStyle(R.chairBack);
    g.fillRect(cx - 10, dY - 20, 20, 16);
    g.lineStyle(2, R.black, 1);
    g.strokeRect(cx - 10, dY - 20, 20, 16);

    // ── DESK TOP ──
    g.fillStyle(R.deskWood);
    g.fillRect(dX, dY, dW, dH);
    g.lineStyle(3, R.deskEdge, 1);
    g.strokeRect(dX, dY, dW, dH);
    // Desk edge band (front)
    g.fillStyle(R.deskEdge);
    g.fillRect(dX, dY + dH - 6, dW, 6);

    // Desk legs
    g.fillStyle(R.deskEdge);
    g.fillRect(dX + 4,       dY + dH, 6, 10);
    g.fillRect(dX + dW - 10, dY + dH, 6, 10);

    // ── MONITOR ──
    const mW = 28, mH = 22;
    const mX = cx - mW / 2 + 4;
    const mY = dY - mH - 2;

    g.fillStyle(R.monitorCase);
    g.fillRect(mX - 4, mY - 4, mW + 8, mH + 8);
    g.lineStyle(2, R.deskEdge, 1);
    g.strokeRect(mX - 4, mY - 4, mW + 8, mH + 8);

    // Screen
    g.fillStyle(R.monitorScr);
    g.fillRect(mX, mY, mW, mH);
    // Green "code" lines on screen
    g.fillStyle(0x50e050);
    for (let i = 0; i < 5; i++) {
      const lw = 5 + Math.floor(Math.random() * (mW - 8));
      g.fillRect(mX + 2, mY + 2 + i * 4, lw, 2);
    }

    // Monitor stand
    g.fillStyle(R.monitorCase);
    g.fillRect(cx - 4, dY - 4, 8, 6);

    // ── KEYBOARD ──
    g.fillStyle(R.monitorCase);
    g.fillRect(cx - 16, dY + 4, 32, 8);
    g.lineStyle(1, R.deskEdge, 1);
    g.strokeRect(cx - 16, dY + 4, 32, 8);

    // ── WORKER (pixel character, seated) ──
    const pX = mX - 14;
    const pY = dY - 16;
    // Body
    g.fillStyle(0x4870d0);  // blue shirt
    g.fillRect(pX, pY + 8, 12, 11);
    // Head
    g.fillStyle(0xf0c880);  // skin
    g.fillRect(pX + 1, pY, 10, 9);
    // Hair
    g.fillStyle(0x301808);
    g.fillRect(pX + 1, pY, 10, 3);
    // Arms reaching to keyboard
    g.fillStyle(0x4870d0);
    g.fillRect(pX + 12, pY + 9, 18, 5);

    return g;
  }

  // ── MACHINE SPAWNER ────────────────────────────────────────────

  _spawnMachineObj(cx, cy, hwId) {
    const isServer = (hwId === 'rack' || hwId === 'megaDC' || hwId === 'quantumDC');
    const spriteKey = isServer ? 'server' : 'gpu';

    if (this._spritesOk[spriteKey]) {
      return this._spawnMachineSprite(cx, cy, spriteKey, hwId);
    } else {
      return this._spawnMachineProc(cx, cy, hwId);
    }
  }

  // ── MACHINE — SPRITE version ────────────────────────────────────

  _spawnMachineSprite(cx, cy, key, hwId) {
    // Size scales with hardware tier
    const sizes = {
      gpu:       { w: 48,  h: 60  },
      cluster:   { w: 60,  h: 74  },
      rack:      { w: 56,  h: 90  },
      megaDC:    { w: 70,  h: 108 },
      quantumDC: { w: 84,  h: 128 },
    };
    const sz = sizes[hwId] || sizes.gpu;

    const img = this.add.image(cx, cy, key)
      .setDisplaySize(sz.w, sz.h)
      .setOrigin(0.5, 0.9)
      .setDepth(7);

    // Gentle LED pulse via alpha tween
    this.tweens.add({
      targets: img, alpha: { from: 0.85, to: 1 },
      duration: 900 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    return img;
  }

  // ── MACHINE — PROCEDURAL FALLBACK ─────────────────────────────

  /**
   * Draw warm-coloured retro machines when sprites are absent.
   */
  _spawnMachineProc(cx, cy, hwId) {
    const g = this.add.graphics().setDepth(7);

    const defs = {
      gpu: {
        w: 44, h: 56,
        body: R.gpuPCB, edge: R.gpuEdge,
        leds: [0x50e050, 0xe05050],
        label: 'GPU',
      },
      cluster: {
        w: 58, h: 70,
        body: 0x5a7c22, edge: 0x2a4008,
        leds: [0x50e050, 0x50e050, 0xe0e050],
        label: 'CLSTR',
      },
      rack: {
        w: 56, h: 90,
        body: R.rackBody, edge: R.rackEdge,
        leds: [R.rackLedR, R.rackLedG, R.rackLedR, R.rackLedG],
        label: 'RACK',
      },
      megaDC: {
        w: 70, h: 108,
        body: 0x505860, edge: 0x1a1e24,
        leds: [R.rackLedG, R.rackLedG, R.rackLedR],
        label: 'MEGA',
      },
      quantumDC: {
        w: 84, h: 126,
        body: 0x3a2848, edge: 0x18101e,
        leds: [0x9050c0, R.rackLedG, 0x9050c0],
        label: 'QNTM',
      },
    };

    const def = defs[hwId] || defs.gpu;
    const bX  = cx - def.w / 2;
    const bY  = cy - def.h / 2;

    // Outer casing
    g.fillStyle(def.body);
    g.fillRect(bX, bY, def.w, def.h);
    g.lineStyle(3, def.edge, 1);
    g.strokeRect(bX, bY, def.w, def.h);

    // Inner panel inset
    g.fillStyle(def.edge);
    g.fillRect(bX + 4, bY + 4, def.w - 8, 4);

    // Vent slots
    g.lineStyle(1, def.edge, 0.4);
    const slotCnt = Math.floor(def.h / 10);
    for (let i = 0; i < slotCnt; i++) {
      const sy = bY + 12 + i * 10;
      g.beginPath();
      g.moveTo(bX + 6, sy); g.lineTo(bX + def.w - 14, sy);
      g.strokePath();
    }

    // Fan circle (GPU / cluster only)
    if (hwId === 'gpu' || hwId === 'cluster') {
      g.fillStyle(R.gpuFan);
      g.fillCircle(cx, bY + def.h * 0.4, def.w * 0.28);
      g.lineStyle(2, def.edge, 1);
      g.strokeCircle(cx, bY + def.h * 0.4, def.w * 0.28);
      g.fillStyle(def.edge);
      g.fillCircle(cx, bY + def.h * 0.4, 4);
    }

    // Gold contacts at bottom (GPU style)
    if (hwId === 'gpu' || hwId === 'cluster') {
      g.fillStyle(0xc8a820);
      const contactW = Math.floor(def.w / 6);
      for (let c = 0; c < 5; c++) {
        g.fillRect(bX + 6 + c * contactW, bY + def.h - 10, contactW - 2, 10);
      }
    }

    // LEDs column (right side)
    const ledSpacing = (def.h - 20) / (def.leds.length + 1);
    def.leds.forEach((col, i) => {
      const lx = bX + def.w - 9;
      const ly = bY + 10 + (i + 1) * ledSpacing;
      g.fillStyle(col);
      g.fillCircle(lx, ly, 4);
      g.lineStyle(1, def.edge, 0.6);
      g.strokeCircle(lx, ly, 4);
    });

    // Shadow under machine
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(cx, bY + def.h + 4, def.w * 0.8, 8);

    // Label text
    const labelColors = {
      gpu: '#1e3a08', cluster: '#1e3a08', rack: '#1a1e24',
      megaDC: '#0e1218', quantumDC: '#10081a',
    };
    this.add.text(cx, bY + def.h - 6, def.label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '6px',
      color:      labelColors[hwId] || '#1a1208',
    }).setOrigin(0.5, 1).setDepth(8);

    // Pulse alpha like LEDs
    this.tweens.add({
      targets: g, alpha: { from: 0.88, to: 1 },
      duration: 1000 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    return g;
  }

  // ── WORKER ANIMATION ───────────────────────────────────────────

  _animateWorker(obj, baseY) {
    this.tweens.add({
      targets:  obj,
      y:        obj.y - 3,
      duration: 380 + Math.random() * 180,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
      delay:    Math.random() * 500,
    });
  }

  // ── FLOATING FEEDBACK TEXT ─────────────────────────────────────

  _spawnFeedbackText(x, y, text, color = R.feedGold) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const txt = this.add.text(x, y, text, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '9px',
      color:      hex,
      stroke:     '#ffffff',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);

    this.tweens.add({
      targets:    txt,
      y:          y - 65,
      alpha:      { from: 1, to: 0 },
      duration:   1500,
      ease:       'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  // ── AMBIENT TICK ───────────────────────────────────────────────

  _ambientTick() {
    if (this._workers.length === 0) return;
    const w = this._workers[Math.floor(Math.random() * this._workers.length)];
    this._spawnFeedbackText(w.cell.x, w.cell.y - 24, '💻', R.feedGreen);
  }

  // ── SYNC FROM SAVE ─────────────────────────────────────────────

  _syncWithGameState() {
    if (typeof Game === 'undefined') return;
    const s = Game.state;

    // Workers
    const wCount = s.inventory ? (s.inventory.workers || 0) : 0;
    for (let i = 0; i < wCount; i++) this._onSpawnWorker({ type: 'worker' });

    // Machines (cap at 3 per type to avoid grid overflow on load)
    const hwIds = ['gpu', 'cluster', 'rack', 'megaDC', 'quantumDC'];
    hwIds.forEach(id => {
      const count = s.hardware ? (s.hardware[id] || 0) : 0;
      const hw    = typeof HARDWARE !== 'undefined' ? HARDWARE.find(h => h.id === id) : null;
      for (let i = 0; i < Math.min(count, 2); i++) {
        this._onSpawnMachine({ hwId: id, computePS: hw?.computePS || 0 });
      }
    });
  }
}

// ── PHASER GAME BOOTSTRAP ─────────────────────────────────────────

function initPhaserGame() {
  const factory = document.getElementById('factory');
  if (!factory) {
    console.warn('[Phaser] #factory not found.');
    return;
  }

  const W = factory.clientWidth  || window.innerWidth  - 320;
  const H = factory.clientHeight || window.innerHeight - 122;

  const wrapper = document.createElement('div');
  wrapper.id    = 'phaser-canvas-wrapper';
  factory.insertBefore(wrapper, factory.firstChild);

  window.__phaserGame = new Phaser.Game({
    type:            Phaser.AUTO,
    width:           W,
    height:          H,
    transparent:     true,
    parent:          wrapper,
    scene:           [GameDevStoryScene],
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

  console.log('[Phaser] GameDevStoryScene (Retro Tycoon) booted ✅');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhaserGame);
} else {
  setTimeout(initPhaserGame, 0);
}
