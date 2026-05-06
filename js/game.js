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
      money: 1000,
      playerName: '',
      companyName: '',
      aiName: 'ChillGPT',    // current cash ($)  [Phase 1: start with more]
      pendingRevenue: 0,       // revenue queued up awaiting Collect
      totalMoneyEarned: 1000,    // all-time total for leaderboard/score

      year: 2016,
      yearProgress: 0,       // seconds elapsed inside the current year
      yearDuration: 210,     // real seconds per in-game year (3.5 min)

      /** Date breakdown */
      currentMonth: 1,
      currentDay: 1,

      tf: 0,       // Collected Teraflops (TF) currency

      trainProgress: 0,       // 0–100, controls the training bar

      /* Multipliers from AI upgrades — mutable during a run */
      mult: {
        moneyPerUser: 0.01,   // $ per user per second
        computeToUsers: 0.5,    // users gained per TF/s of compute
        elecReduction: 0.6,    // multiplied onto electricity (lower = cheaper)
        workerIncome: 2.0,    // $ earned per worker per second
      },

      /* Counts of each hardware tier purchased */
      hardware: {
        cluster: 0,
        rack: 0,
        megaDC: 0,
        quantumDC: 0,
      },
      hardwareFailures: {
        cluster: 0,
        rack: 0,
        megaDC: 0,
        quantumDC: 0,
      },

      /* Staff / physical room inventory */
      inventory: {
        workers: 1,    // starting with one worker (the founder)
        workersList: [],   // Array of { id, skill, name }
        serverRacks: 0,
        dataCenters: 0,
      },

      /** Array of AI upgrade IDs that have been purchased */
      unlockedUpgrades: [],

      /** Business Data */
      modelType: 'opensource', // 'opensource', 'subscription', 'private'
      marketing: {
        hackathon: 0,
        gamejam: 0,
        xCampaign: 0
      },

      tutorial: {
        introDone: false,
        introDismissed: false,
        step: '',
        serverRackDone: false,
        serverRackDismissed: false,
      },

      /** Business Deep Logic */
      billingTier: 2,        // 1=Free, 2=Paid ($0.01), 3=Enterprise ($0.05)
      contracts: [],       // Active B2B requests
      acceptedContracts: [], // Accepted contracts
      reputation: 1.0,      // Multiplier on user growth
      rivalPressure: 0,      // Penalty from better competitor models

      /** Buffs */
      buffs: {
        serverDiscount: 1.0,
        marketingHype: 1.0,
      },

      /** MetaMask one-time bonus — granted only once ever */
      metamaskBoostClaimed: false,
      /** Permanent TF rate multiplier from MetaMask (1.0 = none, 1.2 = +20%) */
      metamaskTfMult: 1.0,

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
    const raw = HARDWARE.reduce((sum, hw) => {
      const activeUnits = Math.max(0, (state.hardware[hw.id] || 0) - (state.hardwareFailures[hw.id] || 0));
      return sum + activeUnits * hw.computePS;
    }, 0);

    // Data Scientist bonus: +0.5 TF/s each
    const scientists = (state.inventory.workersList || []).filter(w => w.role === 'Data Scientist').length;
    return raw + (scientists * 0.5);
  }

  /**
   * Raw electricity cost per second before efficiency multiplier.
   * @returns {number}
   */
  function getRawElectricity() {
    return HARDWARE.reduce((sum, hw) => {
      // Failed units still consume 20% power (maintenance/cooling/standby)
      const owned = state.hardware[hw.id] || 0;
      const failed = state.hardwareFailures[hw.id] || 0;
      const active = owned - failed;
      return sum + (active * hw.elecPS) + (failed * hw.elecPS * 0.2);
    }, 0);
  }

  /**
   * Electricity cost after efficiency upgrades.
   * @returns {number}
   */
  function getElectricityCost() {
    const raw = getRawElectricity() * state.mult.elecReduction;
    // DevOps Engineer bonus: -10% cost each (stacking)
    const engs = (state.inventory.workersList || []).filter(w => w.role === 'DevOps Engineer').length;
    const mult = Math.pow(0.9, engs);
    return raw * mult;
  }

  /**
   * Active user count derived from compute, multiplier, model type, and marketing.
   * @returns {number}
   */
  function getUsers() {
    let baseUsers = getTotalCompute() * state.mult.computeToUsers;

    // Marketing boosts (+10% per level)
    const m = state.marketing || { hackathon: 0, gamejam: 0, xCampaign: 0 };
    let marketMult = 1 + (m.hackathon * 0.05) + (m.gamejam * 0.05) + (m.xCampaign * 0.1);
    if (state.buffs && state.buffs.marketingHype) {
      marketMult *= state.buffs.marketingHype;
    }
    baseUsers *= marketMult;

    // Model type affects user base size
    const model = state.modelType || 'opensource';
    if (model === 'opensource') baseUsers *= 1.5;   // Broad reach
    if (model === 'subscription') baseUsers *= 0.5; // Gated access
    if (model === 'private') baseUsers *= 0.1;      // Exclusive

    // User base affected by reputation and rival pressure
    let growthFactor = (state.reputation || 1.0) - (state.rivalPressure || 0);
    baseUsers *= Math.max(0.1, growthFactor);

    // Billing tier affects growth dramatically
    if (state.billingTier === 1) baseUsers *= 2.5; // Free/Open
    if (state.billingTier === 3) baseUsers *= 0.2; // Enterprise (heavy gate)

    return Math.floor(baseUsers);
  }

  /**
   * Gross revenue per second (before electricity cost).
   * Combines compute-based user revenue + direct worker income.
   * @returns {number}
   */
  function getGrossMoneyPerSecond() {
    let userRevenue = getUsers() * state.mult.moneyPerUser;

    // Billing Tier Multiplier
    if (state.billingTier === 1) userRevenue *= 0;    // $0 from free tier (pure growth)
    if (state.billingTier === 3) userRevenue *= 5.0;  // $0.05 per user (Enterprise)

    // Model type affects revenue per user
    const model = state.modelType || 'opensource';
    if (model === 'opensource') userRevenue *= 0.5;   // Free, maybe ad supported
    if (model === 'subscription') userRevenue *= 2.0; // Steady income
    if (model === 'private') userRevenue *= 10.0;     // Enterprise contracts

    // Income from released custom AI models
    const modelIncome = (typeof ModelBuilder !== 'undefined') ? ModelBuilder.getModelIncomePerSecond() : 0;

    const workerCount = state.inventory ? (state.inventory.workers || 0) : 0;
    const workerRevenue = workerCount * (state.mult.workerIncome || 2.0);
    return userRevenue + workerRevenue + modelIncome;
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
    const mps = Math.max(0, getNetMoneyPerSecond());
    return Math.floor(
      getTotalCompute() * 10 +
      hwCount * 5 +
      aiCount * 100 +
      mps * 2
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
    let cost = Math.floor(hw.baseCost * Math.pow(hw.costMult, owned));
    if (state.buffs && state.buffs.serverDiscount) {
      cost = Math.floor(cost * state.buffs.serverDiscount);
    }
    return cost;
  }

  function applyBuff(b) {
    if (!state.buffs) state.buffs = { serverDiscount: 1.0, marketingHype: 1.0 };
    if (b.type === 'hype') state.buffs.marketingHype = Math.max(state.buffs.marketingHype, b.value);
    if (b.type === 'elec') state.mult.elecReduction *= b.value;
    if (b.type === 'reputation') state.reputation = (state.reputation || 1.0) + b.value;
    if (b.type === 'serverDiscount') state.buffs.serverDiscount = Math.min((state.buffs.serverDiscount || 1.0), b.value);
    if (typeof Save !== 'undefined') Save.save();
  }

  function acceptContract(c) {
    if (!state.acceptedContracts) state.acceptedContracts = [];
    if (state.acceptedContracts.find(x => x.id === c.id)) return { ok: false, message: 'Already accepted.' };

    if (state.marketState && state.marketState.availableContracts) {
      state.marketState.availableContracts = state.marketState.availableContracts.filter(x => x.id !== c.id);
    }

    c.deadlineYear = state.year + 2; // 2 years to complete
    state.acceptedContracts.push(c);
    if (typeof Save !== 'undefined') Save.save();
    return { ok: true, message: 'Contract accepted!' };
  }

  function fulfillContract(contractId, model) {
    if (!state.acceptedContracts) state.acceptedContracts = [];
    const c = state.acceptedContracts.find(x => x.id === contractId);
    if (!c) return { ok: false, message: 'Contract not found.' };

    if (c.req.archId && model.archId !== c.req.archId) return { ok: false, message: 'Wrong architecture.' };
    const sizes = ['mini', 'mid', 'large', 'giant'];
    if (c.req.maxSizeId && sizes.indexOf(model.sizeId) > sizes.indexOf(c.req.maxSizeId)) return { ok: false, message: 'Model too large.' };
    if (c.req.minSizeId && sizes.indexOf(model.sizeId) < sizes.indexOf(c.req.minSizeId)) return { ok: false, message: 'Model too small.' };
    if (c.req.minScore && model.perfScore < c.req.minScore) return { ok: false, message: 'Score too low.' };
    if (c.req.requiresOpenSource && state.modelType !== 'opensource') return { ok: false, message: 'Must be Open Source.' };

    state.acceptedContracts = state.acceptedContracts.filter(x => x.id !== contractId);
    state.money += c.rewardOptions.cash;
    if (typeof Save !== 'undefined') Save.save();
    return { ok: true, message: `Contract fulfilled! Earned ${Fmt.money(c.rewardOptions.cash)}.` };
  }

  function tickContracts() {
    if (!state.acceptedContracts) return;
    let expired = false;
    state.acceptedContracts = state.acceptedContracts.filter(c => {
      if (state.year > c.deadlineYear) {
        if (c.penalty && c.penalty.rep) {
          state.reputation = Math.max(0.1, (state.reputation || 1.0) + c.penalty.rep);
          if (typeof UI !== 'undefined') UI.toast(`Contract Failed: Lost reputation!`, 't-red');
        } else {
          if (typeof UI !== 'undefined') UI.toast(`Contract Expired: ${c.title}`, 't-red');
        }
        expired = true;
        return false;
      }
      return true;
    });
    if (expired && typeof Save !== 'undefined') Save.save();
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

    // Specific hardware limits
    const owned = state.hardware[hwId] || 0;
    if (hwId === 'rack' && owned >= 2) {
      return { ok: false, message: `❌ Max 2 Server Racks allowed.` };
    }
    if (hwId === 'megaDC' && owned >= 1) {
      return { ok: false, message: `❌ Max 1 Mega Data Center allowed.` };
    }
    if (hwId === 'quantumDC' && owned >= 1) {
      return { ok: false, message: `❌ Max 1 Quantum Data Center allowed.` };
    }
    if (hwId === 'cluster' && owned >= 4) {
      return { ok: false, message: `❌ Max 4 GPU Clusters allowed.` };
    }

    const cost = getNextHardwareCost(hw);
    if (state.money < cost) {
      return { ok: false, message: `💸 Need ${Fmt.money(cost)} to buy ${hw.name}!` };
    }

    state.money -= cost;
    state.hardware[hwId] = (state.hardware[hwId] || 0) + 1;
    if (!state.hardwareFailures) state.hardwareFailures = { cluster: 0, rack: 0, megaDC: 0, quantumDC: 0 };
    if (state.hardwareFailures[hwId] === undefined) state.hardwareFailures[hwId] = 0;

    // Fire event for Phaser canvas
    window.dispatchEvent(new CustomEvent('SPAWN_MACHINE', {
      detail: { hwId, computePS: hw.computePS, label: `+${hw.computePS} TF/s` },
    }));

    const bigUpgrade = hwId === 'megaDC' || hwId === 'quantumDC';
    // Immediate Save
    if (typeof Save !== 'undefined') Save.save();

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
    const tfCost = upg.tfCost || 0;
    if (state.tf < tfCost) {
      return { ok: false, message: `💻 Need ${Fmt.num(tfCost)} TF for ${upg.name}!` };
    }

    state.money -= upg.cost;
    state.tf -= tfCost;
    state.unlockedUpgrades.push(upgradeId);
    upg.apply(state);  // Mutate multipliers now

    // Feedback burst in Phaser
    window.dispatchEvent(new CustomEvent('SPAWN_FEEDBACK', {
      detail: { text: `🧠 ${upg.badge}` },
    }));

    // Immediate Save
    if (typeof Save !== 'undefined') Save.save();

    return {
      ok: true,
      bigUpgrade: true,
      message: `🧠 Unlocked ${upg.name}! ${upg.badge}`,
    };
  }

  /**
   * Buy an AI upgrade for MetaMask users — skips local TF check/deduction
   * because the $TF was already burned on-chain via burnTFForUpgrade().
   * Cash is still deducted locally.
   */
  function buyAIUpgradeChain(upgradeId) {
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

    // Deduct ONLY cash — TF was already burned on-chain
    state.money -= upg.cost;
    state.unlockedUpgrades.push(upgradeId);
    upg.apply(state);

    window.dispatchEvent(new CustomEvent('SPAWN_FEEDBACK', {
      detail: { text: `🧠 ${upg.badge}` },
    }));

    if (typeof Save !== 'undefined') Save.save();

    return {
      ok: true,
      bigUpgrade: true,
      message: `⛓️ ${upg.name} unlocked via on-chain $TF! ${upg.badge}`,
    };
  }

  // ── STAFF ACTIONS ─────────────────────────────────────────────────

  /**
   * Hire one worker.
   * Workers provide direct income per second AND fill the Phaser room.
   * Cost scales geometrically with the number of workers owned.
   * @returns {{ ok: boolean, message: string }}
   */
  function hireWorker() {
    const BASE_COST = 50;
    const COST_MULT = 1.18;
    const owned = state.inventory ? (state.inventory.workers || 0) : 0;
    if (owned >= 5) {
      return { ok: false, message: `❌ Max 5 staff members allowed.` };
    }

    const cost = Math.floor(BASE_COST * Math.pow(COST_MULT, owned));
    if (state.money < cost) {
      return { ok: false, message: `💸 Need ${Fmt.money(cost)} to hire a worker!` };
    }

    state.money -= cost;
    if (!state.inventory) state.inventory = { workers: 0, workersList: [], serverRacks: 0, dataCenters: 0 };
    if (!state.inventory.workersList) state.inventory.workersList = [];

    state.inventory.workers++;

    const roles = ['Data Scientist', 'Marketing Manager', 'DevOps Engineer'];
    const assignedRole = roles[Math.floor(Math.random() * roles.length)];

    state.inventory.workersList.push({
      id: Date.now(),
      name: `Employee #${state.inventory.workers}`,
      role: assignedRole,
      salary: 10 + (state.inventory.workers * 5)
    });

    // Notify Phaser to place a worker sprite
    window.dispatchEvent(new CustomEvent('SPAWN_WORKER', {
      detail: { type: 'worker', role: assignedRole },
    }));

    // Immediate Save
    if (typeof Save !== 'undefined') Save.save();

    return { ok: true, message: `👨‍💻 Hired Worker #${state.inventory.workers}!` };
  }

  // ── BUSINESS ACTIONS ──────────────────────────────────────────────

  function changeModel(model) {
    if (!['opensource', 'subscription', 'private'].includes(model)) return { ok: false, message: 'Invalid model' };
    state.modelType = model;
    if (typeof Save !== 'undefined') Save.save();
    return { ok: true, message: `Switched business model to ${model.toUpperCase()}!` };
  }

  function buyMarketing(type) {
    const COSTS = {
      hackathon: 2000,
      gamejam: 10000,
      xCampaign: 75000
    };
    if (!state.marketing) state.marketing = { hackathon: 0, gamejam: 0, xCampaign: 0 };
    if (!COSTS[type]) return { ok: false, message: 'Unknown marketing type.' };

    if (state.money < COSTS[type]) {
      return { ok: false, message: `💸 Need ${Fmt.money(COSTS[type])} for ${type}!` };
    }

    state.money -= COSTS[type];
    state.marketing[type]++;
    if (typeof Save !== 'undefined') Save.save();
    return { ok: true, message: `📢 Sponsored ${type}! Active Users +` + (type === 'xCampaign' ? '10%' : '5%') };
  }

  /**
   * Calculate the cost to hire the next worker.
   * @returns {number}
   */
  function getNextWorkerCost() {
    const BASE_COST = 50;
    const COST_MULT = 1.18;
    const owned = state.inventory ? (state.inventory.workers || 0) : 0;
    return Math.floor(BASE_COST * Math.pow(COST_MULT, owned));
  }

  /**
   * Collect all accumulated pending revenue.
   * Resets pendingRevenue and trainProgress.
   * @returns {{ ok: boolean, amount: number }}
   */
  function collectMoney() {
    const amount = state.pendingRevenue;
    if (amount < 0.01) return { ok: false, amount: 0 };

    state.money += amount;
    state.totalMoneyEarned += amount;
    state.pendingRevenue = 0;
    state.trainProgress = 0;

    return { ok: true, amount };
  }

  function repairHardware(hwId) {
    if (!state.hardwareFailures || !state.hardwareFailures[hwId]) return { ok: false, message: 'Already functional.' };
    const hw = HARDWARE.find(h => h.id === hwId);
    // Repair cost is 10% of base cost
    const repairCost = Math.floor(hw.baseCost * 0.1);
    if (state.money < repairCost) return { ok: false, message: `Need ${Fmt.money(repairCost)}!` };
    state.money -= repairCost;
    state.hardwareFailures[hwId]--;
    if (typeof Save !== 'undefined') Save.save();
    return { ok: true, message: `${hw.name} repaired!` };
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
    const dt = Math.min((now - _lastTick) / 1000, 1.0); // cap at 1s to avoid jumps
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
    const computeBar = getTotalCompute();
    const computeBonus = Math.min(computeBar * 0.008, 5);
    state.trainProgress = Math.min(100, state.trainProgress + (0.4 + computeBonus) * dt);

    // TF Generation based on compute power (with permanent MetaMask boost)
    const computeGen = getTotalCompute();
    const mmTfMult = state.metamaskTfMult || 1.0;
    state.tf += computeGen * dt * mmTfMult;

    // Random Failure Logic
    _processRandomFailures(dt);

    // Year, Month, Day progression
    state.yearProgress += dt;
    if (state.yearProgress >= state.yearDuration && state.year < 2026) {
      state.yearProgress -= state.yearDuration;
      _triggerNewYear();
    }

    const monthsPerYear = 12;
    const daysPerMonth = 30; // Simplified 30-day month
    const secsPerMonth = state.yearDuration / monthsPerYear;
    const secsPerDay = secsPerMonth / daysPerMonth;

    const newMonth = Math.floor((state.yearProgress / secsPerMonth) % monthsPerYear) + 1;
    state.currentMonth = Math.max(1, Math.min(newMonth, 12));

    const monthProgress = state.yearProgress % secsPerMonth;
    const newDay = Math.floor((monthProgress / secsPerDay)) + 1;
    state.currentDay = Math.max(1, Math.min(newDay, 30));

    // Tick model training
    if (typeof ModelBuilder !== 'undefined') {
      const result = ModelBuilder.tickTraining(dt);
      if (result && result.done) {
        // Training complete — notify UI
        window.dispatchEvent(new CustomEvent('MODEL_TRAINED', {
          detail: { model: result.model }
        }));
      }
    }

    // Expose derived values for UI.js to read
    const workers = state.inventory ? (state.inventory.workers || 0) : 0;
    state._computed = {
      compute: getTotalCompute(),
      users: getUsers(),
      elec: getElectricity(),
      mps: mps,
      workers,
    };
  }

  function _processRandomFailures(dt) {
    if (state.year < 2017) return;
    HARDWARE.forEach(hw => {
      const owned = (state.hardware[hw.id] || 0);
      const failed = (state.hardwareFailures[hw.id] || 0);
      const active = owned - failed;
      if (active <= 0) return;
      // 0.015% per second per unit
      if (Math.random() < 0.00015 * dt * active) {
        state.hardwareFailures[hw.id]++;
        window.dispatchEvent(new CustomEvent('HARDWARE_FAILURE', { detail: { hwId: hw.id, name: hw.name } }));
        if (typeof Save !== 'undefined') Save.save();
      }
    });
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

    // Refresh market demand for the new year
    if (typeof Market !== 'undefined') Market.refreshDemand(state.year);
    tickContracts();

    setTimeout(() => { _yearLock = false; }, 500);
  }


  // ── PUBLIC API ────────────────────────────────────────────────────

  return {
    // State access
    get state() { return state; },
    set state(v) { state = v; },
    createDefaults,

    // Calculations
    getTotalCompute,
    getElectricityCost,
    getUsers,
    getNetMoneyPerSecond,
    getArenaScore,
    getCompetitorScore,
    getNextHardwareCost,
    getNextWorkerCost,

    // Actions
    buyHardware,
    buyAIUpgrade,
    buyAIUpgradeChain,  // MetaMask users: TF already burned on-chain
    hireWorker,
    collectMoney,
    repairHardware,
    changeModel,
    setBillingTier,
    buyMarketing,
    applyBuff,
    acceptContract,
    fulfillContract,

    // Loop
    tick,
    skipYear: _triggerNewYear,
  };
})();

function setBillingTier(t) {
  if (t < 1 || t > 3) return { ok: false, message: 'Invalid tier' };
  state.billingTier = t;
  if (typeof Save !== 'undefined') Save.save();
  return { ok: true, message: `API Billing set to ${t === 1 ? 'FREE' : t === 2 ? 'PAID' : 'ENTERPRISE'}` };
}



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
    if (abs >= 1e9) return (n / 1e9).toFixed(dp) + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(dp) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(dp) + 'K';
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
