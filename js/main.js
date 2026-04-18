/**
 * main.js
 * ─────────────────────────────────────────────────────────────────
 * Entry point. Runs after all other scripts are loaded.
 *
 * Responsibilities:
 *   1. Load save data (or start fresh)
 *   2. Initialise UI (stars, shop, machines, leaderboard)
 *   3. Start the game loop (setInterval → Game.tick + UI.updateStats)
 *   4. Wire up auto-save
 *   5. Wire up page visibility change (pause/resume)
 *   6. Show welcome toast
 * ─────────────────────────────────────────────────────────────────
 */

(function bootstrap() {

  // ── LOAD SAVE ──────────────────────────────────────────────────
  const hasSave = Save.load();

  // ── UI INIT ────────────────────────────────────────────────────
  UI.initStars();
  UI.updateLocationSign();
  UI.renderMachines();
  UI.renderShop();
  UI.updateLeaderboard();
  UI.updateStats();

  // ── GAME LOOPS ─────────────────────────────────────────────────

  /**
   * Main tick: advance game state + refresh stats display.
   * Runs every 100ms (10×/sec) — smooth enough for idle games.
   */
  const TICK_MS = 100;
  setInterval(() => {
    Game.tick();
    UI.updateStats();
    UI.updateShopButtons();
  }, TICK_MS);

  /**
   * Leaderboard footer refresh — every 5 seconds is plenty.
   */
  setInterval(() => {
    UI.updateLeaderboard();
  }, 5000);

  /**
   * Auto-save every 30 seconds.
   */
  setInterval(() => {
    Save.save();
  }, 30_000);

  // ── PAGE VISIBILITY (pause tick while tab hidden) ───────────────
  // We don't actually pause — offline earnings handle the gap —
  // but this prevents stacked setIntervals in some browsers.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Update lastSave reference so offline calc is fresh on re-focus
      Game.state.lastSave = Date.now();
    }
  });

  // ── SAVE ON UNLOAD ──────────────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    Save.save();
  });

  // ── KEYBOARD SHORTCUT  [C] = collect revenue ───────────────────
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) {
      UI.handleCollect();
    }
  });

  // ── WELCOME TOAST ───────────────────────────────────────────────
  setTimeout(() => {
    if (hasSave) {
      UI.toast('💾 Save loaded! Welcome back to ChillGPT Empire.', 't-green');
    } else {
      UI.toast('👋 Welcome! Buy your first cluster and start computing.', '');
      UI.mascotSpeak();
    }
  }, 900);

})();
