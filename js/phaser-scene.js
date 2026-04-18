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
    this._workerSpots  = [];
    this._workerCount = 0;
    this._clusterCount = 0;
    this._ok          = {};
  }

  // ── PRELOAD ────────────────────────────────────────────────────

  preload() {
    const ok = (key) => { this._ok[key] = true; };

    // Background — empty room
    this.load.image('bg', 'assets/images/bg.png');
    this.load.on('filecomplete-image-bg', () => ok('bg'));

    // Sprite sheets (1024×1024 → 2 frames each @ 512×1024)
    this.load.spritesheet('server_anim', 'assets/images/server_sheet.png',
      { frameWidth: 627, frameHeight: 1254 });
    this.load.on('filecomplete-spritesheet-server_anim', () => ok('server_anim'));

    this.load.spritesheet('worker_anim', 'assets/images/worker_sheet.png',
      { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.on('filecomplete-spritesheet-worker_anim', () => ok('worker_anim'));



    this.load.spritesheet('cluster_0', 'assets/images/gpu_cluster_sheet.png', { frameWidth: 250, frameHeight: 81 });
    this.load.spritesheet('cluster_1', 'assets/images/gpu_cluster_sheet_1.png', { frameWidth: 250, frameHeight: 75 });
    this.load.spritesheet('cluster_2', 'assets/images/gpu_cluster_sheet_2.png', { frameWidth: 250, frameHeight: 81 });
    this.load.spritesheet('cluster_3', 'assets/images/gpu_cluster_sheet_3.png', { frameWidth: 250, frameHeight: 80 });
    ['0','1','2','3'].forEach(i => {
      this.load.on(`filecomplete-spritesheet-cluster_${i}`, () => ok(`cluster_${i}`));
    });

    // Static fallback images
    this.load.image('desk',   'assets/images/desk1.png');  // file is desk1.png (not desk.png)

    this.load.image('server', 'assets/images/server.png');
    this.load.on('filecomplete-image-desk',   () => ok('desk'));
    this.load.on('filecomplete-image-server', () => ok('server'));
    // ── EDITOR_PRELOAD_BEGIN ──
    // ── EDITOR_PRELOAD_END ──

  }

  // ── CREATE ─────────────────────────────────────────────────────

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // 1. Background
    this._drawBackground(W, H);

    // Navigation Button to Server Room
    const btn = this.add.text(1180, 270, '▶\nSERVERS', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '12px',
      color: '#ffffff',
      backgroundColor: '#5a3810',
      padding: { x: 10, y: 10 },
      align: 'center'
    }).setOrigin(1, 0.5).setInteractive().setDepth(100);

    btn.on('pointerdown', () => {
      this.scene.switch('ServerRoomScene');
    });

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

    // ── EDITOR_LAYOUT_BEGIN ──
    // ── Placed by Visual Layout Editor (% of canvas, auto-scales) ──
    // ── EDITOR_LAYOUT_END ──

    // 6. Replay items already purchased (on page load / save restore)
    this._syncWithGameState();
  }

  // ── BACKGROUND ─────────────────────────────────────────────────

  _drawBackground(W, H) {
    if (this._ok['bg']) {
      // Background fits the room dimensions exactly (matching the editor)
      this.add.image(W / 2, H / 2, 'bg')
        .setDisplaySize(W, H)
        .setDepth(0);
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

    const LEFT_MARGIN  = Math.round(W * 0.3200);  // ≈ 267px — past windows+mascot
    const RIGHT_MARGIN = Math.round(W * 0.2500);  // ≈ 73px
    const MAX_X        = W - RIGHT_MARGIN;

    const gH = 75;
    const gW = 175;
    const gSpots = [
      { x: W * 0.2533, y: H * 0.8350 },
      { x: W * 0.4483, y: H * 0.8350 },
      { x: W * 0.6465, y: H * 0.8383 },
      { x: W * 0.7583, y: H * 0.3328 }
    ];
    this._gpuHeight = gH;
    this._gpuWidth  = gW;
    this._gpuSpots  = gSpots;

    const mH = 40; // Fallback for other machines
    const mStartX   = Math.round(W * 0.8665);
    const mStartY   = Math.round(H * 0.8067);   // ≈ 456px on 600px canvas
    const mSpacingX = 10;   // wide enough for 110–160px‐wide sprite art
    const mSpacingY = 10;    // row-wrap vertical gap

    this._machineHeight = mH;
    this._machineZone = makeZone(mStartX, mStartY, mSpacingX, mSpacingY, MAX_X);

    // -- STAFF / WORKER SPOTS (Adjusted by Live Editor) --
    const wH = 200;
    const wSpots = [
      { x: W * 0.3400, y: H * 0.8176 },
      { x: W * 0.4514, y: H * 0.8176 },
      { x: W * 0.5710, y: H * 0.8176 },
      { x: W * 0.6877, y: H * 0.8176 },
      { x: W * 0.8026, y: H * 0.8176 }
    ];
    this._workerSpots = wSpots;
    this._workerHeight = wH;

    console.log('[Phaser] machineZone:', mStartX, mStartY, '→ maxX', MAX_X);
    console.log('[Phaser] workerSpots:', wSpots.length);
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

    for (let i=0; i<4; i++) {
      const key = `cluster_${i}`;
      if (this._ok[key]) {
        this.anims.create({
          key: `${key}_anim`,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: 1 }),
          frameRate: 3 + i, 
          repeat: -1,
          yoyo: true
        });
      }
    }
  }



  // ── SPAWN: WORKER ──────────────────────────────────────────────

  _onSpawnWorker(_detail) {
    const spots = this._workerSpots || [];
    const pos = spots[this._workerCount % spots.length] || { x: W * 0.5, y: H * 0.9 };
    this._workerCount++;
    const tH  = this._workerHeight || 150;
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
    const hwId     = detail.hwId || 'cluster';
    const isServer = ['rack', 'megaDC', 'quantumDC', 'server'].includes(hwId);
    
    // Servers are handled by the ServerRoomScene
    if (isServer) return;

    const tH       = (hwId === 'cluster') ? (this._gpuHeight || 110) : (this._machineHeight || 110);
    const v        = this._clusterCount % 4;
    const pos      = (hwId === 'cluster') ? (this._gpuSpots[v] || this._nextZonePos(this._machineZone)) : this._nextZonePos(this._machineZone);
    let   obj;

    if (hwId === 'cluster') {
      const key = `cluster_${v}`;
      this._clusterCount++;

      if (this._ok[key]) {
        obj = this.add.sprite(pos.x, pos.y, key, 0)
          .setOrigin(0.5, 1)
          .setDepth(7);
        const srcH = (v === 1) ? 75 : (v === 3 ? 80 : 81);
        this._scaleToTargetH(obj, srcH, tH);
        obj.play(`${key}_anim`);
      }
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
    const spots = this._workerSpots || [];
    if (spots.length === 0 || this._workerCount === 0) return;

    // Total filled spots is workerCount, but capped at spots.length
    const filledCount = Math.min(this._workerCount, spots.length);
    const idx = Math.floor(Math.random() * filledCount);
    const pos = spots[idx];

    if (pos) {
      const tH = this._workerHeight || 150;
      this._spawnFeedbackText(pos.x, pos.y - tH - 8, '💻', C.feedGreen);
    }
  }

  // ── SYNC SAVED STATE ───────────────────────────────────────────

  _syncWithGameState() {
    if (typeof Game === 'undefined') return;
    const st = Game.state;

    // Workers — cap at 6 on load to avoid zone overflow
    const wCount = Math.min(st.inventory?.workers ?? 0, 6);
    for (let i = 0; i < wCount; i++) this._onSpawnWorker({});

    // Machines — ignore servers here (handled by ServerRoomScene)
    const hwOrder = ['cluster'];
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
    const def = defs[hwId] ?? defs.cluster;
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
    // Fan (cluster)
    if (hwId === 'cluster') {
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
// SERVER ROOM SCENE
// ─────────────────────────────────────────────────────────────────

class ServerRoomScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ServerRoomScene' });
    this._ok = {};
    this._serverCount = 0;
  }

  preload() {
    const ok = (key) => { this._ok[key] = true; };
    this.load.image('server1', 'assets/images/server1.png');
    this.load.on('filecomplete-image-server1', () => ok('server1'));
    
    // We also need server assets, they might be cached from GameDevStoryScene
    // but calling load again is safe (Phaser skips cached)
    this.load.spritesheet('server_anim', 'assets/images/server_sheet.png', { frameWidth: 627, frameHeight: 1254 });
    this.load.on('filecomplete-spritesheet-server_anim', () => ok('server_anim'));
    this.load.image('server', 'assets/images/server.png');
    this.load.on('filecomplete-image-server', () => ok('server'));
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // 1. Background
    this.add.rectangle(0, 0, W, H, 0x111115).setOrigin(0).setDepth(0); // Add a dark background universally

    if (this.textures.exists('server1')) {
      const src = this.textures.get('server1').getSourceImage();
      // Use Math.min instead of Math.max to fit the entire image on the screen without cropping
      const scale = Math.min(W / src.width, H / src.height);
      this.add.image(W / 2, H / 2, 'server1').setScale(scale).setDepth(0);
    }

    // Navigation Button to Main Room
    const btnBack = this.add.text(28, 270, '◀\nOFFICE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '12px',
      color: '#ffffff',
      backgroundColor: '#5a3810',
      padding: { x: 10, y: 10 },
      align: 'center'
    }).setOrigin(0, 0.5).setInteractive().setDepth(100);

    btnBack.on('pointerdown', () => {
      this.scene.switch('GameDevStoryScene');
    });

    // 3. Define animations
    if (this.textures.exists('server_anim')) {
      if (!this.anims.exists('server_blink')) {
        this.anims.create({
          key: 'server_blink',
          frames: this.anims.generateFrameNumbers('server_anim', { start: 0, end: 1 }),
          frameRate: 3, repeat: -1,
        });
      }
    }

    // 4. Wire events
    window.addEventListener('SPAWN_MACHINE', (e) => this._onSpawnMachine(e.detail));
    
    // 5. Restore state
    this._syncWithGameState();
  }

  _onSpawnMachine(detail) {
    const hwId = detail.hwId || 'cluster';
    const isServer = ['rack', 'megaDC', 'quantumDC', 'server'].includes(hwId);
    
    // Only handle servers
    if (!isServer) return;
    
    // Max 4 servers according to instructions
    if (this._serverCount >= 4) return;
    
    const W = this.scale.width;
    const H = this.scale.height;
    
    // 2x2 grid — positions set by Live Zone Editor (W/H fractions, auto-scale)
    const spots = [
      { x: W * 0.4700, y: H * 0.5692 }, // back left
      { x: W * 0.5587, y: H * 0.5596 }, // back right
      { x: W * 0.4731, y: H * 0.7323 }, // front left
      { x: W * 0.5619, y: H * 0.7259 }, // front right
    ];
    
    const pos = spots[this._serverCount];
    this._serverCount++;
    
    const tH = TARGET_H[hwId] ?? TARGET_H.rack;
    let obj;

    if (this.textures.exists('server_anim')) {
      obj = this.add.sprite(pos.x, pos.y, 'server_anim', 0)
        .setOrigin(0.5, 1)
        .setDepth(7 + this._serverCount);
      this._scaleToTargetH(obj, 1254, tH);
      if (this.anims.exists('server_blink')) {
        obj.play('server_blink');
      }

    } else if (this.textures.exists('server')) {
      const tex = this.textures.get('server').getSourceImage();
      obj = this.add.image(pos.x, pos.y, 'server')
        .setOrigin(0.5, 1)
        .setDepth(7 + this._serverCount);
      this._scaleToTargetH(obj, tex.height, tH);
    }
    
    if (obj) this._popIn(obj);
    
    if (this.scene.isActive()) {
      this.cameras.main.shake(90, 0.002);
    }
  }

  _scaleToTargetH(obj, naturalH, targetPx) {
    const s = naturalH > 0 ? targetPx / naturalH : 0.15;
    obj.setScale(s);
    obj._ts = s;
  }

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

  _syncWithGameState() {
    this._serverCount = 0;
    if (typeof Game === 'undefined') return;
    const st = Game.state;

    // Hardware checks
    const hwOrder = ['rack', 'megaDC', 'quantumDC', 'server'];
    hwOrder.forEach(id => {
      // Allow up to 4 servers total
      const count = Math.min(st.hardware?.[id] ?? 0, 4);
      for (let i = 0; i < count; i++) {
        if (this._serverCount < 4) {
          this._onSpawnMachine({ hwId: id });
        }
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────

function initPhaserGame() {
  const factory = document.getElementById('factory');
  if (!factory) { console.warn('[Phaser] #factory not found.'); return; }

  const wrapper = document.createElement('div');
  wrapper.id    = 'phaser-canvas-wrapper';
  factory.insertBefore(wrapper, factory.firstChild);

  window.__phaserGame = new Phaser.Game({
    type:        Phaser.AUTO,
    width:       factory.clientWidth  || window.innerWidth  - 320,
    height:      factory.clientHeight || window.innerHeight - 122,
    transparent: true,
    parent:      wrapper,
    scene:       [GameDevStoryScene, ServerRoomScene],
    scale: {
      mode:       Phaser.Scale.RESIZE,  // fits any display — positions use W*pct/H*pct
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
