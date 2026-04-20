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

  _listenForAudioSettings() {
    const apply = () => this._applyAudioSettings();
    window.addEventListener('AUDIO_SETTINGS_CHANGED', apply);
    this.events.once('shutdown', () => window.removeEventListener('AUDIO_SETTINGS_CHANGED', apply));
    apply();
  }

  _applyAudioSettings() {
    const bgm = this.sound?.get?.('bgm');
    if (bgm) {
      bgm.setMute(!this._musicEnabled());
      bgm.setVolume(this._musicEnabled() ? 0.25 : 0);
      if (!this._musicEnabled() && bgm.isPlaying) bgm.pause();
      if (this._musicEnabled() && this.scene.isActive() && !bgm.isPlaying) {
        try {
          if (bgm.isPaused) bgm.resume();
          else bgm.play();
        } catch (e) { }
      }
    }
    if (this._sndKeyboard) {
      this._sndKeyboard.setMute(!this._sfxEnabled());
      this._sndKeyboard.setVolume(this._sfxEnabled() ? 0.35 : 0);
      if (!this._sfxEnabled() && this._sndKeyboard.isPlaying) this._sndKeyboard.stop();
      if (this._sfxEnabled() && this.scene.isActive() && !this._sndKeyboard.isPlaying) {
        try { this._sndKeyboard.play(); } catch (e) { }
      }
    }
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

    // Add background directly (Phaser handles missing textures with a fallback box)
    const bgImage = this.add.image(W / 2, H / 2, 'bg');
    const tex = this.textures.get('bg').getSourceImage();
    if (tex && tex.width > 0) {
      const s = Math.max(W / tex.width, H / tex.height);
      bgImage.setScale(s);
    }
    bgImage.setDepth(0);

    this._buildZones(W, H);

    const createNavBtn = (x, y, text, sceneKey, originX) => {
      const btn = this.add.text(x, y, text, {
        fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#5a3810', padding: 8, align: 'center',
        stroke: '#000000', strokeThickness: 2
      }).setOrigin(originX, 0.5).setInteractive({ useHandCursor: true }).setDepth(100);
      
      btn.on('pointerover', () => { btn.setBackgroundColor('#8b5a2b'); btn.setScale(1.1); });
      btn.on('pointerout', () => { btn.setBackgroundColor('#5a3810'); btn.setScale(1.0); });
      btn.on('pointerdown', () => { if(window.GameAudio) window.GameAudio.playClick(); this.scene.switch(sceneKey); });
      return btn;
    };

    createNavBtn(W - 20, H / 2, '▶\nSERVERS', 'ServerRoomScene', 1);
    createNavBtn(20, H / 2, '◀\nGPU ROOM', 'GPUClusterRoomScene', 0);

    if (this.textures.exists('worker_anim') && !this.anims.exists('worker_type')) {
      this.anims.create({
        key: 'worker_type',
        frames: this.anims.generateFrameNumbers('worker_anim', { start: 0, end: 1 }),
        frameRate: 5,
        repeat: -1,
      });
    }

    // Audio setup
    if (!this.sound.get('bgm')) {
      this._sndBGM = this.sound.add('bgm', { loop: true, volume: 0.25 });
    } else {
      this._sndBGM = this.sound.get('bgm');
    }

    this._sndKeyboard = this.sound.add('sfx_keyboard', { loop: true, volume: 0.35 });

    const unlockAudio = () => {
      if (this.sound.context.state === 'suspended') {
        this.sound.context.resume().then(() => {
          console.log('[Audio] Context resumed via interaction.');
          if (this._musicEnabled() && !this._sndBGM.isPlaying) this._sndBGM.play();
          if (this._sfxEnabled() && this.scene.isActive() && !this._sndKeyboard.isPlaying) this._sndKeyboard.play();
          this._applyAudioSettings();
        });
      } else {
        if (this._musicEnabled() && !this._sndBGM.isPlaying) this._sndBGM.play();
        if (this._sfxEnabled() && this.scene.isActive() && !this._sndKeyboard.isPlaying) this._sndKeyboard.play();
        this._applyAudioSettings();
      }
    };

    this.input.on('pointerdown', unlockAudio);
    this.events.on('wake', () => { if (this._sfxEnabled() && !this._sndKeyboard.isPlaying) this._sndKeyboard.play(); this._applyAudioSettings(); });
    this.events.on('sleep', () => this._sndKeyboard.stop());

    // Initial attempt to play (might fail but handled by click)
    try {
      if (this._sfxEnabled()) this._sndKeyboard.play();
      if (this._musicEnabled()) this._sndBGM.play();
    } catch (e) { }
    this._listenForAudioSettings();

    this._addGlobalListener('SPAWN_WORKER', (detail) => this._onSpawnWorker(detail));
    this._addGlobalListener('SPAWN_FEEDBACK', (detail) => this._onSpawnFeedback(detail));

    this._addGlobalListener('PLAY_SFX', (detail) => {
      if (!this._sfxEnabled()) return;
      if (detail.key === 'coin') this.sound.play('sfx_coin', { volume: 0.5 });
    });

    // ── Placed objects ──
    // ── EDITOR_LAYOUT_BEGIN ──
    // ── Placed by Visual Layout Editor (% of canvas, auto-scales) ──
    // ── EDITOR_LAYOUT_END ──

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
    const wH = 275;
    const wSpots = [
      { x: W * 0.2500, y: H * 1.0200 },
      { x: W * 0.3766, y: H * 1.0200 },
      { x: W * 0.4979, y: H * 1.0200 },
      { x: W * 0.6229, y: H * 1.0200 },
      { x: W * 0.7428, y: H * 1.0200 }
    ];
    if (this._workerCount >= wSpots.length) return;
    const pos = wSpots[this._workerCount];
    this._workerCount++;
    if (this.textures.exists('worker_anim')) {
      const obj = this.add.sprite(pos.x, pos.y, 'worker_anim', 0).setOrigin(0.5, 1).setDepth(8);
      this._scaleToTargetH(obj, UPGRADE_FRAME_H, wH);
      obj.play('worker_type');
      this._popIn(obj);
    }
  }

  _onSpawnFeedback(detail) {
    const W = this.scale.width, H = this.scale.height;
    this._spawnFeedbackText(detail.x ?? W / 2, detail.y ?? H / 2, detail.text, detail.color ?? C.feedGold);
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
    this._currentTier = 1;
  }

  preload() {
    // Load 4 tiers of server room backgrounds
    for (let i = 1; i <= 4; i++) {
      const key = `server_tier${i}`;
      this.load.image(key, `assets/images/upgrades/server_room/server_room_${i}.png`);
    }
  }

  create() {
    const W = this.scale.width, H = this.scale.height;

    // Aesthetic background fill for gaps
    this._bgFill = this.add.graphics().setDepth(-1);
    this._renderFill(W, H);

    // Create the background sprite (initially tier 1)
    this._bg = this.add.image(W / 2, H / 2, 'server_tier1').setDepth(0);
    this._updateBackgroundTexture();

    // Handle window resizing
    this.scale.on('resize', (gameSize) => {
      this._renderFill(gameSize.width, gameSize.height);
      this._updateBackgroundTexture();
    });

    const btnBack = this.add.text(20, H / 2, '◀\nOFFICE', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#5a3810', padding: 8, align: 'center',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true }).setDepth(100);
    
    btnBack.on('pointerover', () => { btnBack.setBackgroundColor('#8b5a2b'); btnBack.setScale(1.1); });
    btnBack.on('pointerout', () => { btnBack.setBackgroundColor('#5a3810'); btnBack.setScale(1.0); });
    btnBack.on('pointerdown', () => { if(window.GameAudio) window.GameAudio.playClick(); this.scene.switch('GameDevStoryScene'); });

    const unlockAudio = () => {
      if (this.sound.context.state === 'suspended') {
        this.sound.context.resume().then(() => {
          const bgm = this.sound.get('bgm');
          if (this._musicEnabled() && bgm && !bgm.isPlaying) bgm.play();
          this._applyAudioSettings();
        });
      } else {
        this._applyAudioSettings();
      }
    };
    this.input.on('pointerdown', unlockAudio);
    this._listenForAudioSettings();

    this._addGlobalListener('SPAWN_MACHINE', (detail) => this._onSpawnMachine(detail));

    // Ensure we sync when entering the scene
    this.events.on('wake', () => this._syncWithGameState());
    this._syncWithGameState();
  }

  _onSpawnMachine(detail) {
    const hwId = detail.hwId;
    if (!['rack', 'megaDC', 'quantumDC', 'server'].includes(hwId)) return;

    // Re-sync background whenever a machine is bought
    this._syncWithGameState();
  }

  _updateBackgroundTexture() {
    if (!this._bg) return;
    const key = `server_tier${this._currentTier}`;

    if (this.textures.exists(key)) {
      this._bg.setTexture(key);
      const W = this.scale.width, H = this.scale.height;
      const img = this.textures.get(key).getSourceImage();

      // Maintain original aspect ratio and fit within the screen (Letterbox/Pillarbox)
      const scale = Math.min(W / img.width, H / img.height);

      this._bg.setScale(scale);
      this._bg.setPosition(W / 2, H / 2);
    } else {
      console.warn(`[ServerRoom] Texture not found in cache: ${key}`);
    }
  }

  _renderFill(W, H) {
    if (!this._bgFill) return;
    this._bgFill.clear();
    // Solid Black for a clean, focused look
    this._bgFill.fillStyle(0x000000, 1);
    this._bgFill.fillRect(0, 0, W, H);
  }

  _syncWithGameState() {
    if (typeof Game === 'undefined') return;
    const st = Game.state;
    const hw = st.hardware || {};

    // Determine tier based on highest owned hardware
    let tier = 1;
    if (hw.quantumDC > 0) tier = 4;
    else if (hw.megaDC > 0) tier = 3;
    else if (hw.rack > 0) tier = 2; // Simplified as 'server' id was redundant/missing in upgrades

    console.log(`[ServerRoom] Syncing. Hardware:`, hw, `Resolved Tier:`, tier);

    if (this._currentTier !== tier) {
      console.log(`[ServerRoom] Tier Change: ${this._currentTier} -> ${tier}`);
      this._currentTier = tier;
      this._updateBackgroundTexture();

      // Screen flash effect on upgrade
      const flash = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0xffffff)
        .setAlpha(0).setDepth(1000);
      this.tweens.add({
        targets: flash,
        alpha: { from: 0.5, to: 0 },
        duration: 500,
        onComplete: () => flash.destroy()
      });
    }
  }
}

class GPUClusterRoomScene extends BaseTycoonScene {
  constructor() {
    super({ key: 'GPUClusterRoomScene' });
    this._ok = {};
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
    if (this.textures.exists('gpu_bg')) {
      const tex = this.textures.get('gpu_bg').getSourceImage();
      const s = Math.max(W / tex.width, H / tex.height);
      this.add.image(W / 2, H / 2, 'gpu_bg').setScale(s).setDepth(0);
    }
    const btnBack = this.add.text(W - 20, H / 2, '▶\nOFFICE', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#5a3810', padding: 8, align: 'center',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true }).setDepth(100);
    
    btnBack.on('pointerover', () => { btnBack.setBackgroundColor('#8b5a2b'); btnBack.setScale(1.1); });
    btnBack.on('pointerout', () => { btnBack.setBackgroundColor('#5a3810'); btnBack.setScale(1.0); });
    btnBack.on('pointerdown', () => { if(window.GameAudio) window.GameAudio.playClick(); this.scene.switch('GameDevStoryScene'); });

    for (let i = 0; i < 4; i++) {
      const key = `cluster_${i}`;
      if (this.textures.exists(key) && !this.anims.exists(`${key}_anim`)) {
        this.anims.create({
          key: `${key}_anim`,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: 1 }),
          frameRate: 3 + i,
          repeat: -1,
          yoyo: true
        });
      }
    }

    const unlockAudio = () => {
      if (this.sound.context.state === 'suspended') {
        this.sound.context.resume().then(() => {
          this._startGpuAmbient();
          // Ensure BGM keeps playing
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

    // GPU Ambient Sound (Triggered every 3-8s as requested)
    this._gpuTimer = null;
    this.input.on('pointerdown', unlockAudio);
    this._listenForAudioSettings();
    this.events.on('wake', () => { this._applyAudioSettings(); this._startGpuAmbient(); });
    this.events.on('sleep', () => this._stopGpuAmbient());

    this._addGlobalListener('SPAWN_MACHINE', (detail) => this._onSpawnMachine(detail));
    this._syncWithGameState();

    // Start if active
    if (this.scene.isActive()) this._startGpuAmbient();
  }

  _startGpuAmbient() {
    this._stopGpuAmbient();
    const clusterCount = Game.state.hardware?.cluster || 0;

    console.log(`[GPU Sound] Attempting start. Scene active: ${this.scene.isActive()}, Cluster count: ${clusterCount}`);

    if (clusterCount <= 0 || !this._sfxEnabled()) return;

    const playNext = () => {
      // Random gap between 3s and 8s
      const delay = Phaser.Math.Between(3000, 8000);
      this._gpuTimer = this.time.delayedCall(delay, () => {
        if (this.scene.isActive() && this._sfxEnabled()) {
          console.log(`[GPU Sound] Playing intermittent hum...`);
          this.sound.play('sfx_gpu', { volume: 0.45 });
          playNext();
        }
      });
    };

    // Play once immediately
    if (this._sfxEnabled()) this.sound.play('sfx_gpu', { volume: 0.45 });
    playNext();
  }

  _stopGpuAmbient() {
    if (this._gpuTimer) {
      this._gpuTimer.remove();
      this._gpuTimer = null;
    }
    this.sound.stopByKey('sfx_gpu');
  }

  _applyAudioSettings() {
    super._applyAudioSettings();
    if (!this._sfxEnabled()) {
      this._stopGpuAmbient();
    } else if (this.scene.isActive() && !this._gpuTimer) {
      this._startGpuAmbient();
    }
  }

  // Ensure AudioContext resumes here too
  _setupResumeOnClick() {
    this.input.on('pointerdown', () => {
      if (this.sound.context.state === 'suspended') this.sound.context.resume();
    });
  }

  _onSpawnMachine(detail) {
    if (detail.hwId !== 'cluster') return;
    if (this._clusterCount >= 4) return;
    const W = this.scale.width, H = this.scale.height;
    const gH = 310, gW = 164, gRot = 0;
    const gSpots = [
      { x: W * 0.3682, y: H * 0.8110 },
      { x: W * 0.3153, y: H * 0.9789 },
      { x: W * 0.6698, y: H * 0.8115 },
      { x: W * 0.7333, y: H * 0.9766 }
    ];
    const idx = this._clusterCount % 4;
    const pos = gSpots[idx];
    this._clusterCount++;
    if (this.textures.exists(`cluster_${idx}`)) {
      const obj = this.add.sprite(pos.x, pos.y, `cluster_${idx}`, 0).setOrigin(0.5, 1).setAngle(gRot).setDepth(7);
      this._scaleToTargetH(obj, UPGRADE_FRAME_H, gH);
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

  // Use './' as baseURL so assets resolve relative to index.html on any host
  window.__phaserGame = new Phaser.Game({
    type: Phaser.AUTO, width: factory.clientWidth || 1208, height: factory.clientHeight || 600, transparent: true, parent: wrapper,
    scene: [GameDevStoryScene, ServerRoomScene, GPUClusterRoomScene],
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false, roundPixels: true },
    loader: { baseURL: './' },
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPhaserGame);
else setTimeout(initPhaserGame, 0);
