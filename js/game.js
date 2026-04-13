/**
 * game.js
 * ─────────────────────────────────────────────────────────────────
 * Core game logic module.
 * Owns the game state (Game.state), all derived calculations,
 * buying actions, year progression, and the per-tick update.
 *
 * Does NOT touch the DOM — that's UI.js's job.
 * ─────────────────────────────────────────────────────────────────
 */

const Game = (() => {

  // ── STATE ────────────────────────────────────────────────────────

  /**
   * Return a fresh, default game state object.
   * Used on first play and for save-file migration.
   */
  function createDefaults() {
    return {
      money:              50,      // current cash ($)
      pendingRevenue:     0,       // revenue queued up awaiting Collect
      totalMoneyEarned:   50,      // all-time total for leaderboard/score

      year:               2016,
      yearProgress:       0,       // seconds elapsed inside the current year
      yearDuration:       210,     // real seconds per in-game year (3.5 min)

      trainProgress:      0,       // 0–100, controls the training bar

      /* Multipliers from AI upgrades — mutable during a run */
      mult: {
        moneyPerUser:   0.01,   // $ per user per second
        computeToUsers: 0.5,    // users gained per TF/s of compute
        elecReduction:  1.0,    // multiplied onto electricity (lower = cheaper)
      },

      /* Counts of each hardware tier purchased */
      hardware: {
        gpu:       0,
        cluster:   0,
        rack:      0,
        megaDC:    0,
        quantumDC: 0,
      },

      /** Array of AI upgrade IDs that have been purchased */
      unlockedUpgrades: [],

      lastSave: Date.now(),
    };
  }

  /** Live game state — replaced by Save.load() if a save exists */
  let state = createDefaults();


  // ── DERIVED CALCULATIONS ─────────────────────────────────────────

  /**
   * Total compute power in TF/s from all owned hardware.
   * @returns {number}
   */
  function getTotalCompute() {
    return HARDWARE.reduce((sum, hw) => {
      return sum + (state.hardware[hw.id] || 0) * hw.computePS;
    }, 0);
  }

  /**
   * Raw electricity cost per second before efficiency multiplier.
   * @returns {number}
   */
  function getRawElectricity() {
    return HARDWARE.reduce((sum, hw) => {
      return sum + (state.hardware[hw.id] || 0) * hw.elecPS;
    }, 0);
  }

  /**
   * Electricity cost after efficiency upgrades.
   * @returns {number}
   */
  function getElectricityCost() {
    return getRawElectricity() * state.mult.elecReduction;
  }

  /**
   * Active user count derived from compute and multiplier.
   * @returns {number}
   */
  function getUsers() {
    return Math.floor(getTotalCompute() * state.mult.computeToUsers);
  }

  /**
   * Gross revenue per second (before electricity cost).
   * @returns {number}
   */
  function getGrossMoneyPerSecond() {
    return getUsers() * state.mult.moneyPerUser;
  }

  /**
   * Net money per second = revenue − electricity.
   * Can be negative (you're losing money faster than you earn it).
   * @returns {number}
   */
  function getNetMoneyPerSecond() {
    return getGrossMoneyPerSecond() - getElectricityCost();
  }

  /**
   * Arena score — a compound metric used to rank companies.
   * Weights compute, hardware count, AI unlocks, and net income.
   * @returns {number}
   */
  function getArenaScore() {
    const hwCount = Object.values(state.hardware).reduce((a, b) => a + b, 0);
    const aiCount = state.unlockedUpgrades.length;
    const mps     = Math.max(0, getNetMoneyPerSecond());
    return Math.floor(
      getTotalCompute()    * 10  +
      hwCount              * 5   +
      aiCount              * 100 +
      mps                  * 2
    );
  }

  /**
   * Get a competitor's score for a given game year.
   * Competitors grow exponentially — creates increasing tension.
   * @param {object} comp - entry from COMPETITORS array
   * @param {number} year - the year to calculate for
   * @returns {number}
   */
  function getCompetitorScore(comp, year) {
    return Math.floor(comp.baseScore * Math.pow(comp.growthRate, year - 2016) * 100);
  }

  /**
   * Cost to buy the NEXT unit of a hardware type.
   * Uses geometric scaling: baseCost * mult^owned
   * @param {object} hw - hardware definition from HARDWARE array
   * @returns {number}
   */
  function getNextHardwareCost(hw) {
    const owned = state.hardware[hw.id] || 0;
    return Math.floor(hw.baseCost * Math.pow(hw.costMult, owned));
  }


  // ── BUY ACTIONS ──────────────────────────────────────────────────

  /**
   * Attempt to buy one unit of hardware.
   * Returns { ok, message, bigUpgrade } result object.
   * @param {string} hwId
   * @returns {{ ok: boolean, message: string, bigUpgrade?: boolean }}
   */
  function buyHardware(hwId) {
    const hw = HARDWARE.find(h => h.id === hwId);
    if (!hw) return { ok: false, message: 'Unknown hardware.' };

    if (state.year < hw.requireYear) {
      return { ok: false, message: `🔒 ${hw.name} unlocks in ${hw.requireYear}!` };
    }

    const cost = getNextHardwareCost(hw);
    if (state.money < cost) {
      return { ok: false, message: `💸 Need ${Fmt.money(cost)} to buy ${hw.name}!` };
    }

    state.money         -= cost;
    state.hardware[hwId] = (state.hardware[hwId] || 0) + 1;

    const bigUpgrade = hwId === 'megaDC' || hwId === 'quantumDC';
    return {
      ok: true,
      bigUpgrade,
      message: `✅ Bought ${hw.name}! +${hw.computePS} TF/s`,
    };
  }

  /**
   * Attempt to buy an AI research upgrade.
   * Returns { ok, message, bigUpgrade } result object.
   * @param {string} upgradeId
   * @returns {{ ok: boolean, message: string, bigUpgrade?: boolean }}
   */
  function buyAIUpgrade(upgradeId) {
    const upg = AI_UPGRADES.find(u => u.id === upgradeId);
    if (!upg) return { ok: false, message: 'Unknown upgrade.' };

    if (state.unlockedUpgrades.includes(upgradeId)) {
      return { ok: false, message: `Already own: ${upg.name}` };
    }
    if (state.year < upg.requireYear) {
      return { ok: false, message: `🔒 ${upg.name} unlocks in ${upg.requireYear}!` };
    }
    if (state.money < upg.cost) {
      return { ok: false, message: `💸 Need ${Fmt.money(upg.cost)} for ${upg.name}!` };
    }

    state.money -= upg.cost;
    state.unlockedUpgrades.push(upgradeId);
    upg.apply(state);  // Mutate multipliers now

    return {
      ok: true,
      bigUpgrade: true,
      message: `🧠 Unlocked ${upg.name}! ${upg.badge}`,
    };
  }

  /**
   * Collect all accumulated pending revenue.
   * Resets pendingRevenue and trainProgress.
   * @returns {{ ok: boolean, amount: number }}
   */
  function collectMoney() {
    const amount = state.pendingRevenue;
    if (amount < 0.01) return { ok: false, amount: 0 };

    state.money            += amount;
    state.totalMoneyEarned += amount;
    state.pendingRevenue    = 0;
    state.trainProgress     = 0;

    return { ok: true, amount };
  }


  // ── TICK (called every 100ms) ─────────────────────────────────────

  let _lastTick = Date.now();

  /**
   * Main game loop tick.
   * Advances all time-based state: pending revenue, year progress,
   * and training progress. Called by main.js via setInterval.
   */
  function tick() {
    const now = Date.now();
    const dt  = Math.min((now - _lastTick) / 1000, 1.0); // cap at 1s to avoid jumps
    _lastTick = now;

    const mps = getNetMoneyPerSecond();

    if (mps > 0) {
      // Positive income → accumulate in pending pot
      state.pendingRevenue += mps * dt;
    } else if (mps < 0) {
      // Negative income → drain real money immediately (electricity > revenue)
      state.money = Math.max(0, state.money + mps * dt);
    }

    // Training bar charges based on compute power
    const computeBonus = Math.min(getTotalCompute() * 0.008, 5);
    state.trainProgress = Math.min(100, state.trainProgress + (0.4 + computeBonus) * dt);

    // Year advancement
    state.yearProgress += dt;
    if (state.yearProgress >= state.yearDuration && state.year < 2026) {
      state.yearProgress = 0;
      _triggerNewYear();
    }

    // Expose derived values for UI.js to read
    state._computed = {
      compute:   getTotalCompute(),
      users:     getUsers(),
      elec:      getElectricity(),
      mps:       mps,
    };
  }

  // Alias (UI reads elec via _computed.elec)
  function getElectricity() { return getElectricityCost(); }

  /**
   * Internal: advance the year counter and notify UI.
   * Wrapped in a small closure flag to prevent double-fire.
   */
  let _yearLock = false;
  function _triggerNewYear() {
    if (_yearLock) return;
    _yearLock = true;
    const prevYear = state.year;
    state.year++;

    // Notify UI (it handles the visual transition + arena modal)
    UI.onNewYear(prevYear, state.year);

    setTimeout(() => { _yearLock = false; }, 500);
  }


  // ── PUBLIC API ────────────────────────────────────────────────────

  return {
    // State access
    get state()  { return state; },
    set state(v) { state = v;    },
    createDefaults,

    // Calculations
    getTotalCompute,
    getElectricityCost,
    getUsers,
    getNetMoneyPerSecond,
    getArenaScore,
    getCompetitorScore,
    getNextHardwareCost,

    // Actions
    buyHardware,
    buyAIUpgrade,
    collectMoney,

    // Loop
    tick,
  };
})();


// ── NUMBER FORMATTING HELPER ─────────────────────────────────────
// Attached to window so all modules can use it.
const Fmt = {
  /**
   * Format a large number with suffix (K, M, B, T).
   * @param {number} n
   * @param {number} [dp=1] - decimal places when using suffix
   */
  num(n, dp = 1) {
    if (n == null || isNaN(n)) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e15) return (n / 1e15).toFixed(dp) + 'Q';
    if (abs >= 1e12) return (n / 1e12).toFixed(dp) + 'T';
    if (abs >= 1e9)  return (n / 1e9).toFixed(dp)  + 'B';
    if (abs >= 1e6)  return (n / 1e6).toFixed(dp)  + 'M';
    if (abs >= 1e3)  return (n / 1e3).toFixed(dp)  + 'K';
    return n.toFixed(dp === 1 ? 0 : dp);
  },

  /** Format as dollar amount */
  money(n) {
    const sign = n < 0 ? '-' : '';
    return sign + '$' + this.num(Math.abs(n), 2);
  },

  /** Format as TF/s compute */
  compute(n) {
    return this.num(n, 1) + ' TF/s';
  },
};
