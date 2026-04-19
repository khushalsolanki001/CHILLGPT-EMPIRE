/**
 * save.js
 * ─────────────────────────────────────────────────────────────────
 * Handles saving the game state to localStorage and restoring it.
 * Also calculates offline earnings for when the player was away.
 * ─────────────────────────────────────────────────────────────────
 */

const SAVE_KEY = 'chillgpt_empire_v3';

const Save = (() => {

  let isResetting = false;

  /**
   * Serialise the live game state and write to localStorage.
   * Call this periodically (every 30s) and on page unload.
   */
  function save() {
    if (isResetting) return;
    Game.state.lastSave = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(Game.state));
    } catch (e) {
      console.warn('[Save] Could not write to localStorage:', e);
    }
  }

  /**
   * Read saved state from localStorage and merge into Game.state.
   * Then calculate and award any offline earnings.
   *
   * @returns {boolean} true if a save was found and loaded
   */
  function load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    let saved;
    try {
      saved = JSON.parse(raw);
    } catch (e) {
      console.warn('[Save] Corrupt save data, starting fresh.', e);
      return false;
    }

    // Deep-merge saved data onto the fresh defaults
    Game.state = deepMerge(Game.createDefaults(), saved);

    // ── OFFLINE PROGRESS ──────────────────────────────────────────
    const offlineSecs = Math.min(
      (Date.now() - (saved.lastSave || Date.now())) / 1000,
      3600  // cap at 1 hour of offline earnings
    );

    if (offlineSecs > 5) {
      // Use 50% efficiency while offline (no active clicking bonus)
      const mps     = Game.getNetMoneyPerSecond();
      const offline = mps * offlineSecs * 0.5;

      if (offline > 0) {
        Game.state.money           += offline;
        Game.state.totalMoneyEarned += offline;
        // Show the welcome-back toast after the UI is ready
        setTimeout(() => {
          UI.toast(
            `💤 Offline: +${Fmt.money(offline)} while you were away!`,
            't-green'
          );
        }, 1200);
      }
    }

    return true;
  }

  /**
   * Wipe the save and reload the page (fresh start).
   */
  function reset() {
    isResetting = true; 
    localStorage.removeItem(SAVE_KEY);
    // Explicitly nullify the state in memory too
    Game.state = null;
    location.reload();
  }

  /**
   * Deep-merge `src` into `dst` (non-destructively).
   * Arrays in `src` replace those in `dst`.
   */
  function deepMerge(dst, src) {
    for (const key of Object.keys(src)) {
      if (
        src[key] !== null &&
        typeof src[key] === 'object' &&
        !Array.isArray(src[key])
      ) {
        if (typeof dst[key] !== 'object' || dst[key] === null) dst[key] = {};
        deepMerge(dst[key], src[key]);
      } else {
        dst[key] = src[key];
      }
    }
    return dst;
  }

  return { save, load, reset };
})();
