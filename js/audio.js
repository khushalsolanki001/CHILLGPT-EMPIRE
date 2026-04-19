/**
 * audio.js
 * ─────────────────────────────────────────────────────────────────
 * (Optional) Placeholder for future Web Audio API sound effects.
 *
 * Sounds to add:
 *   • Collect "cha-ching" coin sound
 *   • Hardware purchase click
 *   • Big upgrade whoosh + chime
 *   • Year transition sweep
 *   • Arena fanfare
 *
 * Uses the Web Audio API (no external files needed —
 * procedurally generated tones).
 * ─────────────────────────────────────────────────────────────────
 */

const GameAudio = (() => {
  let _ctx = null;
  const STORE_KEY = 'chillgpt_audio_settings';
  const DEFAULTS = { music: true, sfx: true };
  let _settings = _loadSettings();

  function _loadSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
    } catch(e) {
      return { ...DEFAULTS };
    }
  }

  function _saveSettings() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(_settings));
    } catch(e) {}
    window.dispatchEvent(new CustomEvent('AUDIO_SETTINGS_CHANGED', { detail: getSettings() }));
  }

  /** Lazily create AudioContext on first user interaction. */
  function _getCtx() {
    if (!_ctx) {
      try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {
        console.warn('[Audio] Web Audio not supported:', e);
      }
    }
    return _ctx;
  }

  /**
   * Play a short beep tone.
   * @param {number} frequency - Hz (e.g. 440 for A4)
   * @param {number} duration  - seconds
   * @param {string} type      - OscillatorType ('sine'|'square'|'triangle'|'sawtooth')
   * @param {number} gain      - 0–1 volume
   */
  function _beep(frequency, duration, type = 'sine', gain = 0.2) {
    if (!_settings.sfx) return;
    const ctx = _getCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const vol = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    vol.gain.setValueAtTime(gain, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(vol);
    vol.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  /** "Cha-ching" for collecting money */
  function playCoin() {
    if (!_settings.sfx) return;
    _beep(880, 0.1, 'triangle', 0.15);
    setTimeout(() => _beep(1320, 0.15, 'triangle', 0.12), 80);
  }

  /** Soft click for hardware purchase */
  function playClick() {
    if (!_settings.sfx) return;
    _beep(440, 0.08, 'square', 0.1);
  }

  /** Ascending chime for big AI upgrade */
  function playUpgrade() {
    if (!_settings.sfx) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => _beep(f, 0.2, 'sine', 0.15), i * 80);
    });
  }

  /** Fanfare sweep for year change */
  function playYearChange() {
    if (!_settings.sfx) return;
    [392, 523, 659, 784].forEach((f, i) => {
      setTimeout(() => _beep(f, 0.25, 'triangle', 0.1), i * 100);
    });
  }

  function getSettings() {
    return { ..._settings };
  }

  function isMusicEnabled() {
    return !!_settings.music;
  }

  function isSfxEnabled() {
    return !!_settings.sfx;
  }

  function setMusicEnabled(enabled) {
    _settings.music = !!enabled;
    _saveSettings();
  }

  function setSfxEnabled(enabled) {
    _settings.sfx = !!enabled;
    _saveSettings();
  }

  return {
    getSettings,
    isMusicEnabled,
    isSfxEnabled,
    setMusicEnabled,
    setSfxEnabled,
    playCoin,
    playClick,
    playUpgrade,
    playYearChange,
  };
})();

window.GameAudio = GameAudio;
