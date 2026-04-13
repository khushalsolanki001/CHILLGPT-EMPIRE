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

const Audio = (() => {
  let _ctx = null;

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
    _beep(880, 0.1, 'triangle', 0.15);
    setTimeout(() => _beep(1320, 0.15, 'triangle', 0.12), 80);
  }

  /** Soft click for hardware purchase */
  function playClick() {
    _beep(440, 0.08, 'square', 0.1);
  }

  /** Ascending chime for big AI upgrade */
  function playUpgrade() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => _beep(f, 0.2, 'sine', 0.15), i * 80);
    });
  }

  /** Fanfare sweep for year change */
  function playYearChange() {
    [392, 523, 659, 784].forEach((f, i) => {
      setTimeout(() => _beep(f, 0.25, 'triangle', 0.1), i * 100);
    });
  }

  return {
    playCoin,
    playClick,
    playUpgrade,
    playYearChange,
  };
})();
