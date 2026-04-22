/**
 * phaser-scene.js  ★ RETRO TYCOON — Zoned Grid Placement ★
 * ─────────────────────────────────────────────────────────────────
 */

/* global Phaser */

// Common frame dimensions for the new 1024x1024 sheets (2 horizontal frames)
const UPGRADE_FRAME_W = 512;
const UPGRADE_FRAME_H = 1024;

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
  constructor(config) {
    super(config);
    this._spawnedObjects = [];
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

  // Helper to add clean event listeners
  _addGlobalListener(event, callback) {
    const wrapped = (e) => callback(e.detail);
    window.addEventListener(event, wrapped);
    this.events.once('shutdown', () => {
      window.removeEventListener(event, wrapped);
    });
  }

  _musicEnabled() {
    return !window.GameAudio || window.GameAudio.isMusicEnabled();
  }

  _sfxEnabled() {
    return !window.GameAudio || window.GameAudio.isSfxEnabled();
  }

  _isGameStarted() {
    return !!window.__gameStarted;
  }

  _listenForAudioSettings() {
    const apply = () => this._applyAudioSettings();
    window.addEventListener('AUDIO_SETTINGS_CHANGED', apply);
    window.addEventListener('GAME_STARTED', apply);
    this.events.once('shutdown', () => {
      window.removeEventListener('AUDIO_SETTINGS_CHANGED', apply);
      window.removeEventListener('GAME_STARTED', apply);
    });
    apply();
  }

  _applyAudioSettings() {
    const gameStarted = this._isGameStarted();
    const bgm = this.sound?.get?.('bgm');
    if (bgm) {
      bgm.setMute(!this._musicEnabled() || !gameStarted);
      bgm.setVolume(this._musicEnabled() && gameStarted ? 0.25 : 0);
      if ((!this._musicEnabled() || !gameStarted) && bgm.isPlaying) bgm.pause();
      if (this._musicEnabled() && gameStarted && this.scene.isActive() && !bgm.isPlaying) {
        try {
          if (bgm.isPaused) bgm.resume();
          else bgm.play();
        } catch (e) { }
      }
    }
    if (this._sndKeyboard) {
      this._sndKeyboard.setMute(!this._sfxEnabled() || !gameStarted);
      this._sndKeyboard.setVolume(this._sfxEnabled() && gameStarted ? 0.35 : 0);
      if ((!this._sfxEnabled() || !gameStarted) && this._sndKeyboard.isPlaying) this._sndKeyboard.stop();
      if (this._sfxEnabled() && gameStarted && this.scene.isActive() && !this._sndKeyboard.isPlaying) {
        try { this._sndKeyboard.play(); } catch (e) { }
      }
    }
  }

  /** Cover-scale a background image to always fill the canvas. */
  _fitBg(img, texKey) {
    const W = this.scale.width, H = this.scale.height;
    const src = this.textures.get(texKey).getSourceImage();
    if (!src || !src.width) return;
    const s = Math.max(W / src.width, H / src.height);
    img.setPosition(W / 2, H / 2).setScale(s);
  }

  _fitObjects() {
    const W = this.scale.width, H = this.scale.height;
    this._spawnedObjects.forEach(item => {
        if (!item.obj || !item.obj.active) return;
        item.obj.x = item.nx * W;
        item.obj.y = item.ny * H;
        // Also scale height proportionally to maintain alignment on background features
        // Since background is cover-scaled, we should scale relative to the background's current scale factor
        const src = this.textures.get(item.texKey).getSourceImage();
        const bgKey = this.scene.key === 'GameDevStoryScene' ? 'bg' : 'gpu_bg';
        const bgSrc = this.textures.get(bgKey).getSourceImage();
        if (bgSrc) {
            const bgs = Math.max(W / bgSrc.width, H / bgSrc.height);
            // Re-apply target scaling based on screen size
            const targetH = item.baseTargetH * (bgs / item.initialBgScale);
            this._scaleToTargetH(item.obj, UPGRADE_FRAME_H, targetH);
        }
    });
  }

  /** Wire a background image to auto cover-scale on resize. */
  _autoCoverBg(img, texKey) {
    this._fitBg(img, texKey);
    this.scale.on('resize', () => {
      if (img && img.active) this._fitBg(img, texKey);
      this._fitObjects();
      // Reposition navigation buttons as well
      this._fitNavButtons();
    });
  }

  _fitNavButtons() {
    const W = this.scale.width, H = this.scale.height;
    if (this._navLeft) this._navLeft.setPosition(20, H / 2);
    if (this._navRight) this._navRight.setPosition(W - 20, H / 2);
  }

  _createNavButton(x, y, label, targetScene, isRight = true) {
    const width = 100;
    const height = 54;
    const container = this.add.container(x, y).setDepth(200);

    // Drop shadow for depth
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillRoundedRect(isRight ? -width - 4 : 4, -height / 2 + 4, width, height, 12);

    // Main Glass Panel Background
    const bg = this.add.graphics();
    const drawBg = (glow = false) => {
      bg.clear();
      bg.fillStyle(glow ? 0x2a2e4a : 0x1a1c2c, 0.9);
      bg.fillRoundedRect(isRight ? -width : 0, -height / 2, width, height, 12);
      const borderColor = glow ? 0x00f0ff : 0x6a3c14;
      const thickness = glow ? 3 : 2;
      bg.lineStyle(thickness, borderColor, 1);
      bg.strokeRoundedRect(isRight ? -width : 0, -height / 2, width, height, 12);
      if (glow) {
        bg.lineStyle(1, 0xffffff, 0.3);
        bg.strokeRoundedRect(isRight ? -width + 3 : 3, -height / 2 + 3, width - 6, height - 6, 10);
      }
    };
    drawBg(false);

    const text = this.add.text(isRight ? -width / 2 - 10 : width / 2 + 10, 0, label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '9px',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    const arrowSym = isRight ? '▶' : '◀';
    const arrow = this.add.text(isRight ? -18 : 5, 0, arrowSym, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: '#00f0ff'
    }).setOrigin(0.5);

    this.tweens.add({
      targets: arrow,
      x: isRight ? '-=6' : '+=6',
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    container.add([shadow, bg, text, arrow]);

    const rect = new Phaser.Geom.Rectangle(isRight ? -width : 0, -height / 2, width, height);
    container.setInteractive(rect, Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      if (window.GameAudio && window.GameAudio.playHover) window.GameAudio.playHover();
      drawBg(true);
      this.tweens.add({ targets: container, scale: 1.05, duration: 200, ease: 'Back.easeOut' });
      arrow.setColor('#ffffff');
      text.setTint(0x00f0ff);
      if (typeof document !== 'undefined' && document.body) document.body.style.cursor = 'pointer';
    });

    container.on('pointerout', () => {
      drawBg(false);
      this.tweens.add({ targets: container, scale: 1.0, duration: 200, ease: 'Cubic.easeOut' });
      arrow.setColor('#00f0ff');
      text.clearTint();
      if (typeof document !== 'undefined' && document.body) document.body.style.cursor = 'default';
    });

    container.on('pointerdown', () => {
      if (window.GameAudio) window.GameAudio.playClick();
      container.setScale(0.95);
      this.time.delayedCall(120, () => {
        this.scene.switch(targetScene);
      });
    });

    if (isRight) this._navRight = container;
    else this._navLeft = container;

    return container;
  }
}

class GameDevStoryScene extends BaseTycoonScene {
  constructor() {
    super({ key: 'GameDevStoryScene' });
    this._ok = {};
    this._workerCount = 0;
  }

  preload() {
    this.load.image('bg', 'assets/images/empty_office_room_wide.png');
    this.load.image('desk', 'assets/images/desk1.png');
    this.load.spritesheet('worker_anim', 'assets/images/staff.png', { frameWidth: UPGRADE_FRAME_W, frameHeight: UPGRADE_FRAME_H });
    this.load.audio('sfx_keyboard', 'assets/sound/keybord.wav');
    this.load.audio('sfx_coin', 'assets/sound/coin.wav');
    this.load.audio('bgm', 'assets/sound/music.mp3');
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this._spawnedObjects = [];

    const bgImage = this.add.image(0, 0, 'bg').setDepth(0);
    if (this.textures.exists('bg')) this._autoCoverBg(bgImage, 'bg');

    this._createNavButton(W - 20, H / 2, 'SERVERS', 'ServerRoomScene', true);
    this._createNavButton(20, H / 2, 'GPU ROOM', 'GPUClusterRoomScene', false);

    if (this.textures.exists('worker_anim') && !this.anims.exists('worker_type')) {
      this.anims.create({
        key: 'worker_type',
        frames: this.anims.generateFrameNumbers('worker_anim', { start: 0, end: 1 }),
        frameRate: 5,
        repeat: -1,
      });
    }

    if (!this.sound.get('bgm')) this._sndBGM = this.sound.add('bgm', { loop: true, volume: 0.25 });
    else this._sndBGM = this.sound.get('bgm');

    this._sndKeyboard = this.sound.add('sfx_keyboard', { loop: true, volume: 0.35 });

    const unlockAudio = () => {
      if (this.sound.context.state === 'suspended') {
        this.sound.context.resume().then(() => {
          if (this._musicEnabled() && this._isGameStarted() && !this._sndBGM.isPlaying) this._sndBGM.play();
          if (this._sfxEnabled() && this._isGameStarted() && this.scene.isActive() && !this._sndKeyboard.isPlaying) this._sndKeyboard.play();
          this._applyAudioSettings();
        });
      } else {
        if (this._musicEnabled() && this._isGameStarted() && !this._sndBGM.isPlaying) this._sndBGM.play();
        if (this._sfxEnabled() && this._isGameStarted() && this.scene.isActive() && !this._sndKeyboard.isPlaying) this._sndKeyboard.play();
        this._applyAudioSettings();
      }
    };

    this.input.on('pointerdown', unlockAudio);
    this.events.on('wake', () => { if (this._sfxEnabled() && !this._sndKeyboard.isPlaying) this._sndKeyboard.play(); this._applyAudioSettings(); });
    this.events.on('sleep', () => this._sndKeyboard.stop());

    try {
      if (this._sfxEnabled() && this._isGameStarted()) this._sndKeyboard.play();
      if (this._musicEnabled() && this._isGameStarted()) this._sndBGM.play();
    } catch (e) { }
    this._listenForAudioSettings();

    this._addGlobalListener('SPAWN_WORKER', (detail) => this._onSpawnWorker(detail));
    this._addGlobalListener('SPAWN_FEEDBACK', (detail) => this._onSpawnFeedback(detail));
    this._addGlobalListener('PLAY_SFX', (detail) => {
      if (!this._sfxEnabled()) return;
      if (detail.key === 'coin') this.sound.play('sfx_coin', { volume: 0.5 });
    });

    this._syncWithGameState();
  }

  _onSpawnWorker(_detail) {
    const W = this.scale.width, H = this.scale.height;
    const nx = 0.25 + (this._workerCount * 0.125);
    const ny = 1.02;
    const wH = 275;
    
    if (this._workerCount >= 5) return;
    this._workerCount++;

    if (this.textures.exists('worker_anim')) {
      const obj = this.add.sprite(nx * W, ny * H, 'worker_anim', 0).setOrigin(0.5, 1).setDepth(8);
      this._scaleToTargetH(obj, UPGRADE_FRAME_H, wH);
      obj.play('worker_type');
      this._popIn(obj);

      const bgSrc = this.textures.get('bg').getSourceImage();
      const bgs = Math.max(W / bgSrc.width, H / bgSrc.height);

      this._spawnedObjects.push({ obj, nx, ny, baseTargetH: wH, texKey: 'worker_anim', initialBgScale: bgs });
    }
  }

  _onSpawnFeedback(detail) {
    const W = this.scale.width, H = this.scale.height;
    this._spawnFeedbackText(detail.x ?? W / 2, detail.y ?? H / 2, detail.text, detail.color ?? C.feedGold);
  }

  _syncWithGameState() {
    this._workerCount = 0;
    this._spawnedObjects = this._spawnedObjects.filter(o => { if(o.obj.active) o.obj.destroy(); return false; });
    if (typeof Game === 'undefined') return;
    const count = Math.min(Game.state.inventory?.workers ?? 0, 5);
    for (let i = 0; i < count; i++) this._onSpawnWorker({});
  }
}

class ServerRoomScene extends BaseTycoonScene {
  constructor() {
    super({ key: 'ServerRoomScene' });
    this._currentTier = 1;
  }

  preload() {
    for (let i = 1; i <= 4; i++) {
        this.load.image(`server_tier${i}`, `assets/images/upgrades/server_room/server_room_${i}.png`);
    }
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this._bgFill = this.add.graphics().setDepth(-1);
    this._renderFill(W, H);
    this._bg = this.add.image(W / 2, H / 2, 'server_tier1').setDepth(0);
    this._updateBackgroundTexture();

    this.scale.on('resize', (gameSize) => {
      this._renderFill(gameSize.width, gameSize.height);
      this._updateBackgroundTexture();
      this._fitNavButtons();
    });

    this._createNavButton(20, H / 2, 'OFFICE', 'GameDevStoryScene', false);
    const unlockAudio = () => {
      if (this.sound.context.state === 'suspended') {
        this.sound.context.resume().then(() => {
          const bgm = this.sound.get('bgm');
          if (this._musicEnabled() && bgm && !bgm.isPlaying) bgm.play();
          this._applyAudioSettings();
        });
      } else this._applyAudioSettings();
    };
    this.input.on('pointerdown', unlockAudio);
    this._listenForAudioSettings();
    this._addGlobalListener('SPAWN_MACHINE', (detail) => this._onSpawnMachine(detail));
    this.events.on('wake', () => this._syncWithGameState());
    this._syncWithGameState();
  }

  _onSpawnMachine(detail) {
    if (!['rack', 'megaDC', 'quantumDC', 'server'].includes(detail.hwId)) return;
    this._syncWithGameState();
  }

  _updateBackgroundTexture() {
    if (!this._bg) return;
    const key = `server_tier${this._currentTier}`;
    if (this.textures.exists(key)) {
      this._bg.setTexture(key);
      const W = this.scale.width, H = this.scale.height;
      const img = this.textures.get(key).getSourceImage();
      const scale = Math.min(W / img.width, H / img.height);
      this._bg.setScale(scale).setPosition(W / 2, H / 2);
    }
  }

  _renderFill(W, H) {
    if (!this._bgFill) return;
    this._bgFill.clear().fillStyle(0x000000, 1).fillRect(0, 0, W, H);
  }

  _syncWithGameState() {
    if (typeof Game === 'undefined') return;
    const hw = Game.state.hardware || {};
    let tier = 1;
    if (hw.quantumDC > 0) tier = 4;
    else if (hw.megaDC > 0) tier = 3;
    else if (hw.rack > 0) tier = 2;
    if (this._currentTier !== tier) {
      this._currentTier = tier;
      this._updateBackgroundTexture();
      const flash = this.add.rectangle(this.scale.width/2, this.scale.height/2, this.scale.width, this.scale.height, 0xffffff).setAlpha(0).setDepth(1000);
      this.tweens.add({ targets: flash, alpha: { from: 0.5, to: 0 }, duration: 500, onComplete: () => flash.destroy() });
    }
  }
}

class GPUClusterRoomScene extends BaseTycoonScene {
  constructor() {
    super({ key: 'GPUClusterRoomScene' });
    this._clusterCount = 0;
  }

  preload() {
    this.load.image('gpu_bg', 'assets/images/empty_gpu_room_wide.png');
    for (let i = 0; i < 4; i++) {
      this.load.spritesheet(`cluster_${i}`, `assets/images/upgrades/gpu.png`, { frameWidth: UPGRADE_FRAME_W, frameHeight: UPGRADE_FRAME_H });
    }
    this.load.audio('sfx_gpu', 'assets/sound/gpu.wav');
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this._spawnedObjects = [];

    if (this.textures.exists('gpu_bg')) {
      this._gpuBgImg = this.add.image(0, 0, 'gpu_bg').setDepth(0);
      this._autoCoverBg(this._gpuBgImg, 'gpu_bg');
    }
    this._createNavButton(W - 20, H / 2, 'OFFICE', 'GameDevStoryScene', true);

    for (let i = 0; i < 4; i++) {
        const key = `cluster_${i}`;
        if (this.textures.exists(key) && !this.anims.exists(`${key}_anim`)) {
            this.anims.create({ key: `${key}_anim`, frames: this.anims.generateFrameNumbers(key, { start: 0, end: 1 }), frameRate: 3 + i, repeat: -1, yoyo: true });
        }
    }

    const unlockAudio = () => {
      if (this.sound.context.state === 'suspended') {
        this.sound.context.resume().then(() => {
          this._startGpuAmbient();
          const bgm = this.sound.get('bgm');
          if (this._musicEnabled() && bgm && !bgm.isPlaying) bgm.play();
          this._applyAudioSettings();
        });
      } else {
        this._startGpuAmbient();
        const bgm = this.sound.get('bgm');
        if (this._musicEnabled() && bgm && !bgm.isPlaying) bgm.play();
        this._applyAudioSettings();
      }
    };
    this._gpuTimer = null;
    this.input.on('pointerdown', unlockAudio);
    this._listenForAudioSettings();
    this.events.on('wake', () => { this._applyAudioSettings(); this._startGpuAmbient(); });
    this.events.on('sleep', () => this._stopGpuAmbient());
    this._addGlobalListener('SPAWN_MACHINE', (detail) => this._onSpawnMachine(detail));
    this._syncWithGameState();
    if (this.scene.isActive()) this._startGpuAmbient();
  }

  _startGpuAmbient() {
    this._stopGpuAmbient();
    const clusterCount = Game.state.hardware?.cluster || 0;
    if (clusterCount <= 0 || !this._sfxEnabled() || !this._isGameStarted()) return;
    const playNext = () => {
      const delay = Phaser.Math.Between(3000, 8000);
      this._gpuTimer = this.time.delayedCall(delay, () => {
        if (this.scene.isActive() && this._sfxEnabled()) {
          this.sound.play('sfx_gpu', { volume: 0.45 });
          playNext();
        }
      });
    };
    if (this._sfxEnabled()) this.sound.play('sfx_gpu', { volume: 0.45 });
    playNext();
  }

  _stopGpuAmbient() {
    if (this._gpuTimer) { this._gpuTimer.remove(); this._gpuTimer = null; }
    this.sound.stopByKey('sfx_gpu');
  }

  _applyAudioSettings() {
    super._applyAudioSettings();
    if (!this._sfxEnabled()) this._stopGpuAmbient();
    else if (this.scene.isActive() && !this._gpuTimer) this._startGpuAmbient();
  }

  _onSpawnMachine(detail) {
    if (detail.hwId !== 'cluster' || this._clusterCount >= 4) return;
    const W = this.scale.width, H = this.scale.height;
    const gH = 310;
    const gSpots = [
      { x: 0.3682, y: 0.8110 },
      { x: 0.3153, y: 0.9789 },
      { x: 0.6698, y: 0.8115 },
      { x: 0.7333, y: 0.9766 }
    ];
    const idx = this._clusterCount % 4;
    const pos = gSpots[idx];
    this._clusterCount++;
    if (this.textures.exists(`cluster_${idx}`)) {
      const obj = this.add.sprite(pos.x * W, pos.y * H, `cluster_${idx}`, 0).setOrigin(0.5, 1).setDepth(7);
      this._scaleToTargetH(obj, UPGRADE_FRAME_H, gH);
      obj.play(`cluster_${idx}_anim`);
      this._popIn(obj);

      const bgSrc = this.textures.get('gpu_bg').getSourceImage();
      const bgs = Math.max(W / bgSrc.width, H / bgSrc.height);

      this._spawnedObjects.push({ obj, nx: pos.x, ny: pos.y, baseTargetH: gH, texKey: `cluster_${idx}`, initialBgScale: bgs });
    }
  }

  _syncWithGameState() {
    this._clusterCount = 0;
    this._spawnedObjects = this._spawnedObjects.filter(o => { if(o.obj.active) o.obj.destroy(); return false; });
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
    render: { antialias: true, pixelArt: false, roundPixels: true },
    loader: { baseURL: (function() {
      // Use absolute base URL so assets load correctly inside iframes (e.g. Wavedash)
      var base = document.baseURI || window.location.href;
      return base.substring(0, base.lastIndexOf('/') + 1);
    })() },
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPhaserGame);
else setTimeout(initPhaserGame, 0);
