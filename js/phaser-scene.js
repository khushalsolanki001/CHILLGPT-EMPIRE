/**
 * phaser-scene.js  ★ RETRO TYCOON — Zoned Grid Placement ★
 * ─────────────────────────────────────────────────────────────────
 */

/* global Phaser */

const FRAME_W = 512;
const FRAME_H = 1024;

const TARGET_H = {
  worker: 160,
  cluster: 130,
  rack: 160,
  megaDC: 185,
  quantumDC: 210,
};

const C = {
  wall: 0xd4b882, wallStripe: 0xc0a870,
  floor: 0xb89050, floorAlt: 0xa87e40,
  skirting: 0x7a5230, ceiling: 0xe8d4a8,
  lightPanel: 0xfff0c0, winFrame: 0x6a3c14,
  winGlass: 0x90c4e8, winSky: 0x5aa0d0,
  cityBldg: 0x2a3848, poster: 0xe8a840,
  deskWood: 0x9c6830, deskEdge: 0x5a3810,
  monCase: 0xd0c8b0, monScr: 0x2a3c18,
  chairBack: 0x3850a0, gpuPCB: 0x6a8c2a,
  gpuEdge: 0x3a5010, gpuFan: 0xb0b8c0,
  rackBody: 0x606870, rackEdge: 0x2a2e34,
  ledR: 0xe03030, ledG: 0x30d050,
  feedGold: 0xc8960c, feedGreen: 0x3d7a2e,
  feedBlue: 0x1e5fa8, black: 0x000000,
};

class BaseTycoonScene extends Phaser.Scene {
  _scaleToTargetH(obj, naturalH, targetPx) {
    const s = naturalH > 0 ? targetPx / naturalH : 0.15;
    obj.setScale(s);
    obj._ts = s;
  }

  _popIn(obj) {
    const ts = obj._ts ?? obj.scaleX;
    obj.setScale(0.001);
    this.tweens.add({
      targets: obj,
      scaleX: ts,
      scaleY: ts,
      ease: 'Back.easeOut',
      duration: 420,
    });
  }

  _spawnFeedbackText(x, y, text, color = C.feedGold) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const txt = this.add.text(x, y, text, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '9px',
      color: hex,
      stroke: '#ffffff',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(25);

    this.tweens.add({
      targets: txt,
      y: y - 58,
      alpha: { from: 1, to: 0 },
      duration: 1600,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }
}

class GameDevStoryScene extends BaseTycoonScene {
  constructor() {
    super({ key: 'GameDevStoryScene' });
    this._ok = {};
    this._workerCount = 0;
  }

  preload() {
    const ok = (key) => { this._ok[key] = true; };
    this.load.image('bg', 'assets/images/bg.png');
    this.load.on('filecomplete-image-bg', () => ok('bg'));
    this.load.spritesheet('worker_anim', 'assets/images/worker_sheet.png', { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.on('filecomplete-spritesheet-worker_anim', () => ok('worker_anim'));
    this.load.image('desk', 'assets/images/desk1.png');
    this.load.on('filecomplete-image-desk', () => ok('desk'));
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    if (this._ok['bg']) {
      const tex = this.textures.get('bg').getSourceImage();
      const s = Math.min(W / tex.width, H / tex.height);
      this.add.image(W / 2, H / 2, 'bg').setScale(s).setDepth(0);
    }
    this._buildZones(W, H);

    const btnServers = this.add.text(W - 20, H / 2, '▶\nSERVERS', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#5a3810', padding: 8, align: 'center'
    }).setOrigin(1, 0.5).setInteractive().setDepth(100);
    btnServers.on('pointerdown', () => this.scene.switch('ServerRoomScene'));

    const btnGPU = this.add.text(20, H / 2, '◀\nGPU ROOM', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#5a3810', padding: 8, align: 'center'
    }).setOrigin(0, 0.5).setInteractive().setDepth(100);
    btnGPU.on('pointerdown', () => this.scene.switch('GPUClusterRoomScene'));

    if (this._ok['worker_anim'] && !this.anims.exists('worker_type')) {
      this.anims.create({
        key: 'worker_type',
        frames: this.anims.generateFrameNumbers('worker_anim', { start: 0, end: 1 }),
        frameRate: 5, repeat: -1,
      });
    }

    window.addEventListener('SPAWN_WORKER', (e) => this._onSpawnWorker(e.detail));
    window.addEventListener('SPAWN_FEEDBACK', (e) => this._onSpawnFeedback(e.detail));
    this._syncWithGameState();
  }

  _buildZones(W, H) {
    const mH = 40;
    const mStartX = Math.round(W * 0.8665);
    const mStartY = Math.round(H * 0.8067);
    const mSpacingX = 10;
    const mSpacingY = 10;
    this._machineHeight = mH;
    this._mStartX = mStartX; this._mStartY = mStartY;
    this._mSpacingX = mSpacingX; this._mSpacingY = mSpacingY;
  }

  _onSpawnWorker(_detail) {
    const W = this.scale.width, H = this.scale.height;
    const wH = 200;
    const wSpots = [
      { x: W * 0.3434, y: H * 0.8189 },
      { x: W * 0.4514, y: H * 0.8176 },
      { x: W * 0.5710, y: H * 0.8176 },
      { x: W * 0.6877, y: H * 0.8176 },
      { x: W * 0.8026, y: H * 0.8176 }
    ];
    if (this._workerCount >= wSpots.length) return;
    const pos = wSpots[this._workerCount];
    this._workerCount++;
    if (this._ok['worker_anim']) {
      const obj = this.add.sprite(pos.x, pos.y, 'worker_anim', 0).setOrigin(0.5, 1).setDepth(8);
      this._scaleToTargetH(obj, FRAME_H, wH);
      obj.play('worker_type');
      this._popIn(obj);
    }
  }

  _onSpawnFeedback(detail) {
    const W = this.scale.width, H = this.scale.height;
    this._spawnFeedbackText(detail.x ?? W/2, detail.y ?? H/2, detail.text, detail.color ?? C.feedGold);
  }

  _syncWithGameState() {
    this._workerCount = 0;
    if (typeof Game === 'undefined') return;
    const count = Math.min(Game.state.inventory?.workers ?? 0, 5);
    for (let i = 0; i < count; i++) this._onSpawnWorker({});
  }
}

class ServerRoomScene extends BaseTycoonScene {
  constructor() {
    super({ key: 'ServerRoomScene' });
    this._ok = {};
    this._serverCount = 0;
  }

  preload() {
    const ok = (key) => { this._ok[key] = true; };
    this.load.image('server1', 'assets/images/server1.png');
    this.load.on('filecomplete-image-server1', () => ok('server1'));
    this.load.spritesheet('server_anim', 'assets/images/server_sheet.png', { frameWidth: 627, frameHeight: 1254 });
    this.load.on('filecomplete-spritesheet-server_anim', () => ok('server_anim'));
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    if (this._ok['server1']) {
      const tex = this.textures.get('server1').getSourceImage();
      const s = Math.min(W / tex.width, H / tex.height);
      this.add.image(W / 2, H / 2, 'server1').setScale(s).setDepth(0);
    }
    const btnBack = this.add.text(20, H / 2, '◀\nOFFICE', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#5a3810', padding: 8, align: 'center'
    }).setOrigin(0, 0.5).setInteractive().setDepth(100);
    btnBack.on('pointerdown', () => this.scene.switch('GameDevStoryScene'));

    if (this._ok['server_anim'] && !this.anims.exists('server_blink')) {
      this.anims.create({
        key: 'server_blink',
        frames: this.anims.generateFrameNumbers('server_anim', { start: 0, end: 1 }),
        frameRate: 3, repeat: -1,
      });
    }
    window.addEventListener('SPAWN_MACHINE', (e) => this._onSpawnMachine(e.detail));
    this._syncWithGameState();
  }

  _onSpawnMachine(detail) {
    const hwId = detail.hwId;
    if (!['rack', 'megaDC', 'quantumDC', 'server'].includes(hwId)) return;
    if (this._serverCount >= 4) return;
    const W = this.scale.width, H = this.scale.height;
    const spots = [
      { x: W * 0.4700, y: H * 0.5692 }, { x: W * 0.5587, y: H * 0.5596 },
      { x: W * 0.4731, y: H * 0.7323 }, { x: W * 0.5619, y: H * 0.7259 },
    ];
    const pos = spots[this._serverCount];
    this._serverCount++;
    if (this._ok['server_anim']) {
      const obj = this.add.sprite(pos.x, pos.y, 'server_anim', 0).setOrigin(0.5, 1).setDepth(7);
      this._scaleToTargetH(obj, 1254, TARGET_H[hwId] ?? 160);
      obj.play('server_blink');
      this._popIn(obj);
    }
  }

  _syncWithGameState() {
    this._serverCount = 0;
    if (typeof Game === 'undefined') return;
    const st = Game.state;
    ['rack', 'megaDC', 'quantumDC', 'server'].forEach(id => {
      const count = Math.min(st.hardware?.[id] ?? 0, 4);
      for (let i = 0; i < count; i++) if (this._serverCount < 4) this._onSpawnMachine({ hwId: id });
    });
  }
}

class GPUClusterRoomScene extends BaseTycoonScene {
  constructor() {
    super({ key: 'GPUClusterRoomScene' });
    this._ok = {};
    this._clusterCount = 0;
  }

  preload() {
    const ok = (key) => { this._ok[key] = true; };
    this.load.image('gpu_bg', 'assets/images/gpu_cluster_room.png');
    this.load.on('filecomplete-image-gpu_bg', () => ok('gpu_bg'));
    const gHeights = { 0: 81, 1: 75, 2: 81, 3: 80 };
    for (let i = 0; i < 4; i++) {
      const h = gHeights[i] || 81;
      this.load.spritesheet(`cluster_${i}`, `assets/images/gpu_cluster_sheet${i === 0 ? '' : '_' + i}.png`, { frameWidth: 250, frameHeight: h });
      this.load.on(`filecomplete-spritesheet-cluster_${i}`, () => ok(`cluster_${i}`));
    }
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    if (this._ok['gpu_bg']) {
      const tex = this.textures.get('gpu_bg').getSourceImage();
      const s = Math.min(W / tex.width, H / tex.height);
      this.add.image(W / 2, H / 2, 'gpu_bg').setScale(s).setDepth(0);
    }
    const btnBack = this.add.text(W - 20, H / 2, '▶\nOFFICE', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#5a3810', padding: 8, align: 'center'
    }).setOrigin(1, 0.5).setInteractive().setDepth(100);
    btnBack.on('pointerdown', () => this.scene.switch('GameDevStoryScene'));

    for (let i = 0; i < 4; i++) {
      const key = `cluster_${i}`;
      if (this._ok[key] && !this.anims.exists(`${key}_anim`)) {
        this.anims.create({ key: `${key}_anim`, frames: this.anims.generateFrameNumbers(key, { start: 0, end: 1 }), frameRate: 3 + i, repeat: -1, yoyo: true });
      }
    }
    window.addEventListener('SPAWN_MACHINE', (e) => this._onSpawnMachine(e.detail));
    this._syncWithGameState();
  }

  _onSpawnMachine(detail) {
    if (detail.hwId !== 'cluster') return;
    if (this._clusterCount >= 4) return;
    const W = this.scale.width, H = this.scale.height;
    const gH = 50, gW = 164, gRot = 90;
    const gSpots = [
      { x: W * 0.2369, y: H * 0.7407 }, { x: W * 0.2338, y: H * 0.4435 },
      { x: W * 0.5534, y: H * 0.7513 }, { x: W * 0.5521, y: H * 0.4599 }
    ];
    const idx = this._clusterCount % 4;
    const pos = gSpots[idx];
    this._clusterCount++;
    if (this._ok[`cluster_${idx}`]) {
      const obj = this.add.sprite(pos.x, pos.y, `cluster_${idx}`, 0).setOrigin(0.5, 1).setAngle(gRot).setDepth(7);
      const srcH = (idx === 1) ? 75 : (idx === 3 ? 80 : 81);
      this._scaleToTargetH(obj, srcH, gH);
      obj.play(`cluster_${idx}_anim`);
      this._popIn(obj);
    }
  }

  _syncWithGameState() {
    this._clusterCount = 0;
    if (typeof Game === 'undefined') return;
    const count = Math.min(Game.state.hardware?.cluster ?? 0, 4);
    for (let i = 0; i < count; i++) this._onSpawnMachine({ hwId: 'cluster' });
  }
}

function initPhaserGame() {
  const factory = document.getElementById('factory');
  if (!factory) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'phaser-canvas-wrapper';
  factory.insertBefore(wrapper, factory.firstChild);
  window.__phaserGame = new Phaser.Game({
    type: Phaser.AUTO, width: factory.clientWidth || 1208, height: factory.clientHeight || 600, transparent: true, parent: wrapper,
    scene: [GameDevStoryScene, ServerRoomScene, GPUClusterRoomScene],
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: false, pixelArt: true, roundPixels: true },
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPhaserGame);
else setTimeout(initPhaserGame, 0);
