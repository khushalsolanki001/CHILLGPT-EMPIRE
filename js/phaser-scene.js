/**
 * phaser-scene.js
 * ─────────────────────────────────────────────────────────────────
 * Phaser 3 Scene: "GameDevStoryScene"
 *
 * Renders a top-down / Game Dev Story style office room.
 * Listens for CustomEvents fired from UI.js:
 *   • SPAWN_WORKER  → places an animated worker desk
 *   • SPAWN_MACHINE → places a glowing machine sprite
 *   • SPAWN_FEEDBACK → shows floating "+X CU" text feedback
 *
 * Layout: invisible grid fills the lower 60% of the canvas.
 * Items snap to the next free cell, left-to-right, row-by-row.
 * ─────────────────────────────────────────────────────────────────
 */

/* global Phaser */

// ── GRID CONFIGURATION ───────────────────────────────────────────

const GRID_COLS      = 8;     // cells per row
const GRID_ROWS      = 4;     // rows of cells
const CELL_W         = 72;    // px per cell width
const CELL_H         = 62;    // px per cell height
const GRID_ORIGIN_X  = 36;    // left margin (px from canvas left)
const GRID_ORIGIN_Y_FACTOR = 0.38; // top of grid as fraction of canvas height

// ── COLOUR PALETTE (matches the CSS neon theme) ──────────────────

const COLORS = {
  bg:          0x04060f,
  floor:       0x0a0f22,
  gridLine:    0x0d3055,
  wallTop:     0x080e25,
  wallStripe:  0x0b1530,
  desk:        0x142850,
  deskEdge:    0x1a3870,
  workerBody:  0x2a8fff,
  workerHead:  0xffc87a,
  workerScreen:0x00d4ff,
  gpuBody:     0x0d2040,
  gpuBorder:   0x00d4ff,
  rackBody:    0x0e1630,
  rackBorder:  0xb44fff,
  dcBody:      0x0c0c26,
  dcBorder:    0x39ff85,
  quantumBody: 0x150818,
  quantumBdr:  0xb44fff,
  clusterBody: 0x0b1a3e,
  clusterBdr:  0x00d4ff,
  windowGlass: 0x0d3050,
  windowFrame: 0x1a4070,
  neonYellow:  0xffd93d,
  neonGreen:   0x39ff85,
  neonBlue:    0x00d4ff,
  neonPurple:  0xb44fff,
  text:        0xe8f4ff,
};

// ── SCENE ───────────────────────────────────────────────────────

class GameDevStoryScene extends Phaser.Scene {

  constructor() {
    super({ key: 'GameDevStoryScene' });
    this._cells       = [];   // flat array of { x, y, occupied, obj }
    this._workers     = [];   // active worker objects for animation
    this._machines    = [];   // active machine objects
    this._feedTexts   = [];   // active floating feedback texts
  }

  // ── PRELOAD ────────────────────────────────────────────────────

  preload() {
    // All rendering is procedural (Graphics objects) —
    // no external assets needed, keeping the build self-contained.
  }

  // ── CREATE ─────────────────────────────────────────────────────

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Draw the static room background
    this._drawRoom(W, H);

    // Build the invisible grid
    this._buildGrid(W, H);

    // Draw faint grid overlay (debug-lite mode)
    this._drawGridOverlay(W, H);

    // Listen for events dispatched by UI.js via window CustomEvents
    window.addEventListener('SPAWN_WORKER',   (e) => this._onSpawnWorker(e.detail));
    window.addEventListener('SPAWN_MACHINE',  (e) => this._onSpawnMachine(e.detail));
    window.addEventListener('SPAWN_FEEDBACK', (e) => this._onSpawnFeedback(e.detail));

    // Replay any items already in state (e.g., after save load)
    this._syncWithGameState();

    // Ambient ticker: worker screens flicker, LEDs pulse
    this._ambientTimer = this.time.addEvent({
      delay: 1200,
      loop: true,
      callback: this._ambientTick,
      callbackScope: this,
    });
  }

  // ── UPDATE ─────────────────────────────────────────────────────

  update() {
    // Floating text ascent is handled via tweens — nothing needed here.
  }

  // ── ROOM DRAWING ───────────────────────────────────────────────

  /**
   * Draw the static background: wall, windows, floor.
   */
  _drawRoom(W, H) {
    const g = this.add.graphics();

    // ── FLOOR ──
    g.fillStyle(COLORS.floor);
    g.fillRect(0, H * 0.35, W, H);

    // ── FLOOR CHECKERBOARD tiles ──
    const TILE = 36;
    const rows = Math.ceil(H / TILE) + 2;
    const cols = Math.ceil(W / TILE) + 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tileY = H * 0.35 + r * TILE;
        const tileX = c * TILE;
        if ((r + c) % 2 === 0) {
          g.fillStyle(0x0b1228);
          g.fillRect(tileX, tileY, TILE, TILE);
        }
      }
    }

    // ── WALL ──
    g.fillStyle(COLORS.wallTop);
    g.fillRect(0, 0, W, H * 0.38);

    // Wall horizontal stripe accents
    for (let i = 0; i < 4; i++) {
      g.fillStyle(COLORS.wallStripe);
      g.fillRect(0, H * 0.32 + i * 18, W, 2);
    }

    // ── CEILING STRIP (neon glow line) ──
    g.fillStyle(COLORS.neonBlue);
    g.fillRect(0, H * 0.35 - 3, W, 3);

    // Drop-ceiling lights
    const lightCount = Math.floor(W / 160);
    for (let i = 0; i < lightCount; i++) {
      const lx = (i + 0.5) * (W / lightCount);
      const ly = H * 0.35 - 3;
      g.fillStyle(0x003a5c);
      g.fillRect(lx - 25, ly - 18, 50, 18);
      g.fillStyle(COLORS.neonBlue);
      g.fillRect(lx - 22, ly - 4, 44, 4);
    }

    // ── WINDOWS ──
    const windowCount = Math.floor(W / 200);
    for (let i = 0; i < windowCount; i++) {
      const wx = 60 + i * (W / windowCount);
      const wy = H * 0.06;
      const ww = 100;
      const wh = 70;

      // Frame
      g.fillStyle(COLORS.windowFrame);
      g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

      // Glass (night-time city glow)
      g.fillStyle(COLORS.windowGlass);
      g.fillRect(wx, wy, ww, wh);

      // City lights — tiny dots
      for (let k = 0; k < 12; k++) {
        const cx = wx + 6 + Math.floor(k * 8.2) % (ww - 10);
        const cy = wy + 10 + Math.floor(k * 5.3) % (wh - 20);
        const lightCols = [0xffda63, 0x00d4ff, 0xff8c42, 0xb44fff];
        g.fillStyle(lightCols[k % 4]);
        g.fillRect(cx, cy, 3, 3);
      }

      // Cross divider
      g.fillStyle(COLORS.windowFrame);
      g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      g.fillRect(wx, wy + wh / 2 - 2, ww, 4);
    }

    // ── WALL BANNER / SIGN ──
    const signX = W / 2;
    const signY = H * 0.18;
    const signW = 180;
    const signH = 28;
    g.fillStyle(0x06102a);
    g.fillRect(signX - signW / 2 - 4, signY - 4, signW + 8, signH + 8);
    g.fillStyle(COLORS.neonBlue);
    g.fillRect(signX - signW / 2 - 4, signY - 4, signW + 8, 2);
    g.fillRect(signX - signW / 2 - 4, signY + signH + 2, signW + 8, 2);
    g.fillRect(signX - signW / 2 - 4, signY - 4, 2, signH + 8);
    g.fillRect(signX + signW / 2 + 2, signY - 4, 2, signH + 8);

    const signText = this.add.text(signX, signY + signH / 2, '⚡ ChillGPT HQ ⚡', {
      fontFamily: 'monospace',
      fontSize:   '11px',
      color:      '#00d4ff',
      align:      'center',
    }).setOrigin(0.5, 0.5);
    signText.setDepth(5);

    // ── FLOOR-WALL SKIRTING BOARD ──
    g.fillStyle(0x101c3a);
    g.fillRect(0, H * 0.35, W, 8);
  }

  // ── GRID ───────────────────────────────────────────────────────

  /**
   * Build the logical grid data structure.
   * Grid origin is near the bottom-centre of the canvas.
   */
  _buildGrid(W, H) {
    this._cells = [];
    const gridW    = GRID_COLS * CELL_W;
    const startX   = Math.floor((W - gridW) / 2) + GRID_ORIGIN_X;
    const startY   = Math.floor(H * GRID_ORIGIN_Y_FACTOR);

    this._gridStartX = startX;
    this._gridStartY = startY;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        this._cells.push({
          x:        startX + col * CELL_W + CELL_W / 2,
          y:        startY + row * CELL_H + CELL_H / 2,
          row,
          col,
          occupied: false,
          obj:      null,
        });
      }
    }
  }

  /**
   * Render a faint grid overlay for the "office floor" look.
   */
  _drawGridOverlay(W, H) {
    const g = this.add.graphics();
    g.lineStyle(1, COLORS.gridLine, 0.18);
    g.setDepth(2);

    const startX = this._gridStartX;
    const startY = this._gridStartY;

    for (let row = 0; row <= GRID_ROWS; row++) {
      g.beginPath();
      g.moveTo(startX, startY + row * CELL_H);
      g.lineTo(startX + GRID_COLS * CELL_W, startY + row * CELL_H);
      g.strokePath();
    }
    for (let col = 0; col <= GRID_COLS; col++) {
      g.beginPath();
      g.moveTo(startX + col * CELL_W, startY);
      g.lineTo(startX + col * CELL_W, startY + GRID_ROWS * CELL_H);
      g.strokePath();
    }
  }

  /**
   * Return the next free cell or null if grid is full.
   * Workers fill from row 0 (back), machines from row 2 (front).
   */
  _nextFreeCell(preferFront = false) {
    // preferFront: machines go to rows 2–3, workers to rows 0–1
    const cells = preferFront
      ? [...this._cells].sort((a, b) => b.row - a.row)
      : [...this._cells].sort((a, b) => a.row - b.row);

    return cells.find(c => !c.occupied) || null;
  }

  // ── EVENT HANDLERS ─────────────────────────────────────────────

  /**
   * Spawn a worker at a desk in the next free grid cell.
   * @param {{ type?: string }} detail
   */
  _onSpawnWorker(detail) {
    const cell = this._nextFreeCell(false);
    if (!cell) return;
    cell.occupied = true;

    const worker = this._drawWorkerDesk(cell.x, cell.y);
    cell.obj = worker;
    this._workers.push({ cell, gfx: worker });

    // Start the worker's bouncing/coding animation
    this._animateWorker(worker, cell.x, cell.y);

    // Camera nudge to show new item
    this.cameras.main.shake(180, 0.003);
  }

  /**
   * Spawn a machine in the next available front-row grid cell.
   * @param {{ hwId: string, computePS: number, label: string }} detail
   */
  _onSpawnMachine(detail) {
    const cell = this._nextFreeCell(true);
    if (!cell) return;
    cell.occupied = true;

    const machine = this._drawMachine(cell.x, cell.y, detail.hwId || 'gpu');
    cell.obj = machine;
    this._machines.push({ cell, gfx: machine });

    // Show floating "+X CU" feedback
    const cuLabel = detail.computePS
      ? `+${detail.computePS} TF/s`
      : (detail.label || '+CU');
    this._spawnFeedbackText(cell.x, cell.y, cuLabel, COLORS.neonBlue);

    // Machine appear animation
    this.tweens.add({
      targets:  machine,
      scaleX:   { from: 0, to: 1 },
      scaleY:   { from: 0, to: 1 },
      ease:     'Back.easeOut',
      duration: 420,
    });

    this.cameras.main.shake(120, 0.002);
  }

  /**
   * Show a floating feedback popup from outside.
   * @param {{ x?: number, y?: number, text: string, color?: number }} detail
   */
  _onSpawnFeedback(detail) {
    const W = this.scale.width;
    const H = this.scale.height;
    const x = detail.x !== undefined ? detail.x : W / 2 + (Math.random() - 0.5) * 200;
    const y = detail.y !== undefined ? detail.y : H * 0.55;
    this._spawnFeedbackText(x, y, detail.text, detail.color || COLORS.neonYellow);
  }

  // ── WORKER DRAWING ─────────────────────────────────────────────

  /**
   * Draw a pixel-art worker at a desk using Phaser Graphics.
   * Returns a Container so we can animate it as one unit.
   */
  _drawWorkerDesk(cx, cy) {
    const g  = this.add.graphics();
    const dW = 56;
    const dH = 36;
    const dX = cx - dW / 2;
    const dY = cy - dH / 2;

    // ── DESK ──
    g.fillStyle(COLORS.desk);
    g.fillRect(dX, dY + 12, dW, dH - 12);
    g.lineStyle(2, COLORS.deskEdge, 0.9);
    g.strokeRect(dX, dY + 12, dW, dH - 12);

    // Desk legs
    g.fillStyle(COLORS.deskEdge);
    g.fillRect(dX + 4,  dY + dH - 4, 4, 6);
    g.fillRect(dX + dW - 8, dY + dH - 4, 4, 6);

    // ── MONITOR ──
    const mW = 22;
    const mH = 16;
    const mX = cx - mW / 2 + 4;
    const mY = dY - mH + 8;

    g.fillStyle(0x0a1520);
    g.fillRect(mX - 2, mY - 2, mW + 4, mH + 4);
    g.lineStyle(2, COLORS.gpuBorder, 1);
    g.strokeRect(mX - 2, mY - 2, mW + 4, mH + 4);

    // Monitor screen (random green text lines = "coding")
    g.fillStyle(COLORS.workerScreen);
    for (let i = 0; i < 4; i++) {
      const lw = 4 + Math.floor(Math.random() * (mW - 6));
      g.fillRect(mX, mY + 2 + i * 3, lw, 2);
    }

    // ── WORKER BODY (pixel character) ──
    const pX = mX - 4;
    const pY = dY + 6;

    // Body
    g.fillStyle(COLORS.workerBody);
    g.fillRect(pX, pY + 6, 11, 12);

    // Head
    g.fillStyle(COLORS.workerHead);
    g.fillRect(pX + 1, pY, 9, 8);

    // Hair
    g.fillStyle(0x1a0a04);
    g.fillRect(pX + 1, pY, 9, 3);

    // Arms
    g.fillStyle(COLORS.workerBody);
    g.fillRect(pX - 3, pY + 7, 4, 7);
    g.fillRect(pX + 11, pY + 7, 4, 7);

    g.setDepth(6);
    return g;
  }

  /**
   * Animate a worker with a gentle "typing" bob.
   */
  _animateWorker(gfx, cx, cy) {
    // Head bobs up and down to simulate typing
    this.tweens.add({
      targets:    gfx,
      y:          gfx.y - 3,
      duration:   350 + Math.random() * 200,
      yoyo:       true,
      repeat:     -1,
      ease:       'Sine.easeInOut',
      delay:      Math.random() * 400,
    });
  }

  // ── MACHINE DRAWING ────────────────────────────────────────────

  /**
   * Draw a pixel machine body and return its Graphics object.
   * @param {number} cx centre X
   * @param {number} cy centre Y
   * @param {string} hwId hardware type ID
   */
  _drawMachine(cx, cy, hwId) {
    const g = this.add.graphics();
    g.setDepth(7);

    const defs = {
      gpu:       { w: 40, h: 52, body: COLORS.gpuBody,     border: COLORS.gpuBorder,     leds: [COLORS.neonBlue] },
      cluster:   { w: 52, h: 64, body: COLORS.clusterBody, border: COLORS.clusterBdr,    leds: [COLORS.neonBlue, COLORS.neonBlue] },
      rack:      { w: 58, h: 88, body: COLORS.rackBody,     border: COLORS.rackBorder,    leds: [COLORS.neonPurple, COLORS.neonPurple, COLORS.neonPurple] },
      megaDC:    { w: 72, h: 104,body: COLORS.dcBody,       border: COLORS.dcBorder,      leds: [COLORS.neonGreen, COLORS.neonGreen] },
      quantumDC: { w: 86, h: 120,body: COLORS.quantumBody,  border: COLORS.quantumBdr,    leds: [COLORS.neonPurple, COLORS.neonBlue, COLORS.neonPurple] },
    };

    const def = defs[hwId] || defs.gpu;
    const bX  = cx - def.w / 2;
    const bY  = cy - def.h / 2;

    // Outer casing
    g.fillStyle(def.body);
    g.fillRect(bX, bY, def.w, def.h);
    g.lineStyle(2, def.border, 1);
    g.strokeRect(bX, bY, def.w, def.h);

    // Inner panel
    g.fillStyle(def.body + 0x050510);
    g.fillRect(bX + 4, bY + 4, def.w - 8, def.h - 8);

    // LEDs running down the side
    const ledSpacing = (def.h - 20) / (def.leds.length + 1);
    def.leds.forEach((col, i) => {
      const lx = bX + def.w - 10;
      const ly = bY + 10 + (i + 1) * ledSpacing;
      g.fillStyle(col);
      g.fillCircle(lx, ly, 4);
    });

    // Ventilation slots (horizontal lines)
    g.lineStyle(1, def.border, 0.25);
    const slotCount = Math.floor(def.h / 12);
    for (let i = 0; i < slotCount; i++) {
      const sy = bY + 8 + i * 12;
      g.beginPath();
      g.moveTo(bX + 6,        sy);
      g.lineTo(bX + def.w - 16, sy);
      g.strokePath();
    }

    // Label text
    const labels = {
      gpu: 'GPU', cluster: 'CLSTR', rack: 'RACK',
      megaDC: 'MEGA', quantumDC: 'QNTM',
    };
    const lblText = this.add.text(cx, bY + def.h - 8, labels[hwId] || 'HW', {
      fontFamily: 'monospace',
      fontSize:   '8px',
      color:      Phaser.Display.Color.IntegerToColor(def.border).rgba,
    }).setOrigin(0.5, 1).setDepth(8);

    // Animate LEDs by changing alpha on the Graphics (cheap pulsing)
    this.tweens.add({
      targets:  g,
      alpha:    { from: 0.82, to: 1 },
      duration: 800 + Math.random() * 600,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });

    return g;
  }

  // ── FLOATING FEEDBACK TEXT ─────────────────────────────────────

  /**
   * Spawn a "+X TF/s" text that floats up and fades out.
   */
  _spawnFeedbackText(x, y, text, color = COLORS.neonBlue) {
    const hexStr = '#' + color.toString(16).padStart(6, '0');
    const txt = this.add.text(x, y, text, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '10px',
      color:      hexStr,
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(20);

    this.tweens.add({
      targets:  txt,
      y:        y - 70,
      alpha:    { from: 1, to: 0 },
      duration: 1600,
      ease:     'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  // ── AMBIENT TICK ───────────────────────────────────────────────

  /**
   * Periodically spawn small "+$" feedback on every worker's screen
   * to give the sense that work is happening.
   */
  _ambientTick() {
    const workers = this._workers;
    if (workers.length === 0) return;

    // Pick a random worker and flash their screen
    const w = workers[Math.floor(Math.random() * workers.length)];
    const fx = w.cell.x + 4;
    const fy = w.cell.y - 20;
    this._spawnFeedbackText(fx, fy, '+💻', COLORS.neonGreen);
  }

  // ── SYNC FROM SAVE ─────────────────────────────────────────────

  /**
   * Replay all items already in Game.state so Phaser room matches
   * the save file on first load.
   */
  _syncWithGameState() {
    // Guard against Game not being defined yet
    if (typeof Game === 'undefined') return;
    const state = Game.state;

    // Spawn workers
    const workerCount = state.inventory
      ? (state.inventory.workers || 0)
      : 0;
    for (let i = 0; i < workerCount; i++) {
      this._onSpawnWorker({ type: 'worker' });
    }

    // Spawn machines from hardware counts
    const hwIds = ['gpu', 'cluster', 'rack', 'megaDC', 'quantumDC'];
    hwIds.forEach(id => {
      const count = state.hardware ? (state.hardware[id] || 0) : 0;
      const hw = typeof HARDWARE !== 'undefined'
        ? HARDWARE.find(h => h.id === id)
        : null;
      for (let i = 0; i < Math.min(count, 3); i++) {
        this._onSpawnMachine({
          hwId:      id,
          computePS: hw ? hw.computePS : 0,
          label:     hw ? `+${hw.computePS} TF/s` : '+TF/s',
        });
      }
    });
  }

}

// ── PHASER GAME INIT ─────────────────────────────────────────────

/**
 * Boot the Phaser game once the DOM is ready.
 * The canvas is injected behind #factory and sized to match it.
 */
function initPhaserGame() {
  const factory = document.getElementById('factory');
  if (!factory) {
    console.warn('[Phaser] #factory element not found — aborting Phaser init.');
    return;
  }

  const W = factory.clientWidth  || window.innerWidth  - 310;
  const H = factory.clientHeight || window.innerHeight - 118;

  // Create a wrapper div that sits BEHIND all UI elements
  const wrapper = document.createElement('div');
  wrapper.id    = 'phaser-canvas-wrapper';
  wrapper.style.cssText = `
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  `;
  factory.insertBefore(wrapper, factory.firstChild);

  window.__phaserGame = new Phaser.Game({
    type:            Phaser.AUTO,
    width:           W,
    height:          H,
    backgroundColor: '#04060f',
    transparent:     true,
    parent:          wrapper,
    scene:           [GameDevStoryScene],
    scale: {
      mode:        Phaser.Scale.RESIZE,
      autoCenter:  Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias:       false,   // keep pixelated look
      pixelArt:        true,
      roundPixels:     true,
    },
  });

  console.log('[Phaser] GameDevStoryScene booted ✅');
}

// Kick off after all other scripts have run
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhaserGame);
} else {
  // DOMContentLoaded already fired
  setTimeout(initPhaserGame, 0);
}
