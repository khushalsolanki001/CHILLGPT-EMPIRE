/**
 * ui.js
 * ─────────────────────────────────────────────────────────────────
 * All DOM manipulation lives here.
 *
 * Responsibilities:
 *   • Render/update all stat pills in the top bar
 *   • Render the shop (hardware & AI tech tabs)
 *   • Render the factory machines
 *   • Show/hide modals (arena, year transition)
 *   • Toasts, floating money text, particle bursts, screen flash
 *   • Mascot speech bubble + animations
 *   • Footer leaderboard bar
 * ─────────────────────────────────────────────────────────────────
 */

const UI = (() => {

  // ── DOM REFERENCES ───────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Tab state ('hardware' | 'ai' | 'staff')
  let _currentTab = 'hardware';

  // Mascot speech timer
  let _mascotTimer = null;
  let _tutorialTimer = null;
  let _tutorialActiveStep = '';

  // Model Builder state
  let _mbSelectedArch = 'transformer';
  let _mbSelectedSize = 'mini';
  let _mbSelectedTraits = [];
  const _lastStatText = {};
  let _lastTfBrainFlow = 0;


  // News Tracker
  let _lastNewsDay = -1;
  const NEWS_HEADLINES = [
    "AI generated art wins state fair competition. Artists furious.",
    "Major incident: Self-driving AI hallucinated a stop sign. No injuries.",
    "New AI model passes the bar exam in the 90th percentile.",
    "Tech CEOs testify before congress about superhuman AI.",
    "Viral X trend: 'Is my boyfriend actually an AI?'",
    "Open Source community releases model challenging enterprise leaders.",
    "Hackathon weekend: Thousands of devs build apps on new AI API.",
    "AI generated video goes viral, plunging stock markets temporarily.",
    "AI agents spotted trading cryptos automatically. Markets volatile.",
    "New study claims AI may soon automate 40% of standard IT tasks.",
    "Incident: AI assistant ordered 100 pizzas to a user's home."
  ];

  function _updateNewsTicker(day) {
    if (day !== _lastNewsDay) {
      _lastNewsDay = day;
      if (Math.random() < 0.15) { // 15% chance per day to change news
        const news = NEWS_HEADLINES[Math.floor(Math.random() * NEWS_HEADLINES.length)];
        const el = $('x-news-ticker');
        // Randomly insert the company/AI name
        const personalizedNews = news.replace(/AI/g, Game.state.aiName);
        if (el) el.textContent = `[BREAKING] Day ${day}: ${personalizedNews}`;
      }
    }
  }


  // ── STAT BAR UPDATE ──────────────────────────────────────────────

  /**
   * Refresh all top-bar stat pills from current game state.
   * Called every tick from main.js.
   */
  function updateStats() {
    const s = Game.state;
    const mps = Game.getNetMoneyPerSecond();
    const c = s._computed || {};

    _setStatText('stat-money', Fmt.money(s.money));
    _setStatText('stat-compute', Fmt.compute(c.compute || 0));
    const tfEl = $('stat-tf');
    if (tfEl) _setStatText('stat-tf', Fmt.num(s.tf || 0, 0));
    _setStatText('stat-electricity', Fmt.money(c.elec || 0) + '/s');
    _setStatText('stat-users', Fmt.num(c.users || 0, 0));
    _setStatText('stat-net', (mps >= 0 ? '+' : '') + Fmt.money(mps) + '/s');
    if ($('logo-ai-name')) $('logo-ai-name').textContent = s.aiName;

    // Year + Month display
    // Date breakdown display
    const month = (s.currentMonth || 1).toString().padStart(2, '0');
    const day = (s.currentDay || 1).toString().padStart(2, '0');
    const dateLabelEl = $('date-label');
    if (dateLabelEl) dateLabelEl.textContent = `DAY ${day} MTH ${month}`;
    $('year-value').textContent = s.year;

    _updateNewsTicker(s.currentDay);

    // Workers pill (if element exists)
    const wEl = $('stat-workers');
    if (wEl) _setStatText('stat-workers', (c.workers || 0) + ' staff');
    _maybeSpawnTfBrainFlow(c.workers || 0);

    // Electricity danger colour
    $('elec-pill').classList.toggle('danger', mps < 0);

    // Training progress bar
    const pct = s.trainProgress.toFixed(1);
    $('train-progress').style.width = pct + '%';
    $('progress-percent').textContent = Math.round(pct) + '%';
    $('progress-label').textContent =
      `${s.aiName} v${s.year - 2015}.0 — TRAINING`;

    // Collect button label
    const pending = s.pendingRevenue;
    $('collect-label').textContent =
      pending > 0.01 ? Fmt.money(pending) : 'COLLECT';

    // Year countdown footer
    const rem = Math.max(0, s.yearDuration - s.yearProgress);
    const mm = String(Math.floor(rem / 60)).padStart(2, '0');
    const ss = String(Math.floor(rem % 60)).padStart(2, '0');
    $('next-comp').textContent = `NEXT ARENA: ${mm}:${ss}`;

    _maybeStartAITechIntro();
    _maybeStartServerRackGuide();
  }

  function _setStatText(id, text) {
    const el = $(id);
    if (!el) return;
    const value = String(text);
    if (_lastStatText[id] !== undefined && _lastStatText[id] !== value) {
      el.classList.remove('value-pulse');
      void el.offsetWidth;
      el.classList.add('value-pulse');
    }
    _lastStatText[id] = value;
    el.textContent = value;
  }

  function _maybeSpawnTfBrainFlow(workerCount) {
    if (workerCount <= 0 || document.hidden) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const now = performance.now();
    const interval = Math.max(900, 1900 - Math.min(workerCount, 5) * 180);
    if (now - _lastTfBrainFlow < interval) return;
    _lastTfBrainFlow = now;

    const from = $('stat-workers')?.closest('.stat-pill');
    const to = $('stat-tf-pill') || $('stat-tf')?.closest('.stat-pill');
    if (!from || !to) return;

    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    if (!a.width || !b.width) return;

    const icon = _el('div', 'tf-brain-fly');
    icon.textContent = '🧠';
    const endX = b.left + b.width / 2;
    const endY = b.top + b.height / 2;
    const startX = endX;
    const startY = b.bottom + 68;
    icon.style.left = startX + 'px';
    icon.style.top = startY + 'px';
    const dx = endX - startX;
    const dy = endY - startY;
    icon.style.setProperty('--tf-dx', dx + 'px');
    icon.style.setProperty('--tf-dy', dy + 'px');
    icon.style.setProperty('--tf-mid-x', (dx * 0.62) + 'px');
    icon.style.setProperty('--tf-mid-y', (dy * 0.62 - 28) + 'px');
    document.body.appendChild(icon);
    setTimeout(() => icon.remove(), 1250);
  }

  // ── MASCOT GUIDE ─────────────────────────────────────────────────

  function _tutorialState() {
    if (!Game.state.tutorial) {
      Game.state.tutorial = {
        introDone: false,
        introDismissed: false,
        step: '',
        serverRackDone: false,
        serverRackDismissed: false,
        aiTechIntroDone: false,
        aiTechIntroDismissed: false,
      };
    }
    Game.state.tutorial.aiTechIntroDone = !!Game.state.tutorial.aiTechIntroDone;
    Game.state.tutorial.aiTechIntroDismissed = !!Game.state.tutorial.aiTechIntroDismissed;
    return Game.state.tutorial;
  }

  function startNewUserGuide() {
    const t = _tutorialState();
    if (t.introDone || t.introDismissed) return;
    t.step = 'staff_buy';
    Save.save();
    switchTab('staff');
    setTimeout(() => _showTutorialStep('staff_buy'), 180);
  }

  function _maybeStartServerRackGuide() {
    const t = _tutorialState();
    if (_tutorialActiveStep || t.serverRackDone || t.serverRackDismissed) return;
    if (t.step === 'ai_tech_intro') return;
    if ($('arena-modal')?.classList.contains('show') || $('year-transition')?.classList.contains('show')) return;
    if ($('onboarding-modal')?.classList.contains('show')) return;
    if (Game.state.year < 2018 || (Game.state.hardware?.rack || 0) > 0) return;
    const rack = HARDWARE.find(h => h.id === 'rack');
    if (!rack || Game.state.money < Game.getNextHardwareCost(rack)) return;

    t.step = 'server_rack';
    Save.save();
    switchTab('hardware');
    setTimeout(() => _showTutorialStep('server_rack'), 180);
  }

  function _maybeStartAITechIntro() {
    const t = _tutorialState();
    if (_tutorialActiveStep || t.aiTechIntroDone || t.aiTechIntroDismissed) return;
    if ($('arena-modal')?.classList.contains('show') || $('year-transition')?.classList.contains('show')) return;
    if ($('onboarding-modal')?.classList.contains('show')) return;
    if (Game.state.year !== 2018 || Game.state.yearProgress < Game.state.yearDuration / 2) return;

    t.aiTechIntroDone = true;
    t.step = 'ai_tech_intro';
    Save.save();
    switchTab('ai');
    setTimeout(() => _showTutorialStep('ai_tech_intro'), 180);
  }

  function _syncTutorialAfterRender() {
    if (!_tutorialActiveStep) return;
    _placeTutorialPointer(_getTutorialTarget(_tutorialActiveStep));
  }

  function _showTutorialStep(step) {
    const t = _tutorialState();
    if (
      (step !== 'server_rack' && step !== 'ai_tech_intro' && (t.introDone || t.introDismissed)) ||
      (step === 'server_rack' && (t.serverRackDone || t.serverRackDismissed)) ||
      (step === 'ai_tech_intro' && t.aiTechIntroDismissed)
    ) {
      _clearTutorialGuide();
      return;
    }

    _tutorialActiveStep = step;
    document.body.classList.add('tutorial-mode');
    document.body.dataset.tutorialStep = step;
    $('mascot')?.classList.add('guide-active');

    const copy = {
      staff_buy: {
        title: 'First hire',
        body: `Staff make steady income even before the big servers arrive. Hire one worker for ${Fmt.money(Game.getNextWorkerCost())}, then I will take you to hardware.`,
      },
      gpu_buy: {
        title: 'First compute',
        body: 'Great hire. Now buy a GPU Cluster so your AI starts generating real compute and TF.',
      },
      server_rack: {
        title: '2018 upgrade',
        body: 'You have enough cash for a Server Rack. This is the first serious scale jump for the startup floor.',
      },
      ai_tech_intro: {
        title: 'AI Tech Lab',
        body: 'Quick tour: this menu is where research upgrades live. No rush to buy right now. Just remember it when you want stronger growth.',
      },
      collect_revenue: {
        title: 'Collect Revenue',
        body: 'Great hire! Staff generate revenue over time. See that green button? Click it to collect your earnings so you can afford new gear.',
      },
    }[step];

    _setMascotGuide(copy.title, copy.body);
    setTimeout(() => _placeTutorialPointer(_getTutorialTarget(step)), 60);
    if (step === 'ai_tech_intro') {
      clearTimeout(_tutorialTimer);
      _tutorialTimer = setTimeout(() => {
        const latest = _tutorialState();
        if (_tutorialActiveStep !== 'ai_tech_intro') return;
        latest.step = '';
        latest.aiTechIntroDone = true;
        Save.save();
        _clearTutorialGuide();
      }, 6500);
    }
  }

  function _getTutorialTarget(step) {
    if (step === 'staff_buy') return $('btn-hire-worker') || $('tab-staff');
    if (step === 'gpu_buy') return document.querySelector('.buy-btn[data-hw="cluster"]') || $('tab-hardware');
    if (step === 'server_rack') return document.querySelector('.buy-btn[data-hw="rack"]') || $('tab-hardware');
    if (step === 'ai_tech_intro') return null;
    if (step === 'collect_revenue') return $('collect-btn');
    return null;
  }

  function _setMascotGuide(title, body) {
    const speech = $('mascot-speech');
    if (!speech) return;
    clearTimeout(_mascotTimer);
    speech.innerHTML = `
      <button class="guide-close" type="button" onclick="UI.dismissTutorial()" aria-label="Close guide">×</button>
      <strong>${title}</strong>
      <span>${body}</span>
    `;
    speech.classList.add('show', 'guide-speech');
  }

  function _placeTutorialPointer(target) {
    if (!target) return;
    $$('.tutorial-target').forEach(el => el.classList.remove('tutorial-target'));
    target.classList.add('tutorial-target');

    let pointer = $('tutorial-pointer');
    if (!pointer) {
      pointer = _el('div', 'tutorial-pointer');
      pointer.id = 'tutorial-pointer';
      pointer.innerHTML = '<span>CLICK</span>';
      document.body.appendChild(pointer);
    }

    const r = target.getBoundingClientRect();
    pointer.style.left = Math.max(12, r.left + r.width / 2 - 28) + 'px';
    pointer.style.top = Math.max(72, r.top - 58) + 'px';
  }

  function dismissTutorial() {
    const t = _tutorialState();
    if (_tutorialActiveStep === 'server_rack') {
      t.serverRackDismissed = true;
    } else if (_tutorialActiveStep === 'ai_tech_intro') {
      t.aiTechIntroDismissed = true;
    } else {
      t.introDismissed = true;
    }
    t.step = '';
    Save.save();
    _clearTutorialGuide();
  }

  function _clearTutorialGuide() {
    _tutorialActiveStep = '';
    clearTimeout(_tutorialTimer);
    document.body.classList.remove('tutorial-mode');
    delete document.body.dataset.tutorialStep;
    $('mascot')?.classList.remove('guide-active');
    $('tutorial-pointer')?.remove();
    $$('.tutorial-target').forEach(el => el.classList.remove('tutorial-target'));
    const speech = $('mascot-speech');
    if (speech) {
      speech.classList.remove('show', 'guide-speech');
      speech.innerHTML = '';
    }
  }

  function _advanceTutorialAfterStaff() {
    const t = _tutorialState();
    if (_tutorialActiveStep !== 'staff_buy' || t.introDismissed) return;
    t.step = 'collect_revenue';
    Save.save();
    _clearTutorialGuide();
    _tutorialTimer = setTimeout(() => {
      const latest = _tutorialState();
      if (latest.introDone || latest.introDismissed || _tutorialActiveStep) return;
      _showTutorialStep('collect_revenue');
    }, 400);
  }

  function _advanceTutorialAfterCollect() {
    const t = _tutorialState();
    if (_tutorialActiveStep !== 'collect_revenue' || t.introDismissed) return;
    t.step = 'gpu_buy_wait';
    Save.save();
    _clearTutorialGuide();
    _tutorialTimer = setTimeout(() => {
      const latest = _tutorialState();
      if (latest.introDone || latest.introDismissed || _tutorialActiveStep) return;
      latest.step = 'gpu_buy';
      Save.save();
      switchTab('hardware');
      setTimeout(() => _showTutorialStep('gpu_buy'), 220);
    }, 2000);
  }

  function _advanceTutorialAfterHardware(hwId) {
    const t = _tutorialState();
    if (hwId === 'cluster' && (_tutorialActiveStep === 'gpu_buy' || t.step === 'gpu_buy_wait' || t.step === 'gpu_buy')) {
      t.introDone = true;
      t.step = '';
      Save.save();
      _setMascotGuide('Empire online', 'Nice. You have staff plus compute now. Keep collecting revenue and scaling.');
      mascotHappy(false);
      setTimeout(() => _clearTutorialGuide(), 2600);
    }

    if (hwId === 'rack' && _tutorialActiveStep === 'server_rack') {
      t.serverRackDone = true;
      t.step = '';
      Save.save();
      _setMascotGuide('Server room unlocked', 'Beautiful. That rack is your 2018 power move.');
      mascotHappy(false);
      setTimeout(() => _clearTutorialGuide(), 2600);
    }
  }

  // ── ONBOARDING ────────────────────────────────────────────────────

  function obNext(step) {
    $$('.ob-step').forEach(s => s.style.display = 'none');
    $(`ob-step-${step}`).style.display = 'block';
  }

  function obFinish() {
    const pName = $('ob-player-name').value.trim() || 'CEO';
    const cName = $('ob-company-name').value.trim() || 'Empire Inc';
    const aName = $('ob-ai-name').value.trim() || 'ChillGPT';

    Game.state.playerName = pName;
    Game.state.companyName = cName;
    Game.state.aiName = aName;

    $('onboarding-modal').classList.remove('show');
    toast(`Welcome, CEO ${pName}! Let's build ${cName}!`);

    // Save immediately
    Save.save();

    // Force immediate UI update
    updateStats();

    setTimeout(() => startNewUserGuide(), 650);
  }



  // ── SHOP ─────────────────────────────────────────────────────────

  /**
   * Switch the shop to a different tab.
   * @param {'hardware'|'ai'} tab
   */
  function switchTab(tab) {
    _currentTab = tab;
    const tabs = ['hardware', 'staff', 'ai', 'business', 'models'];
    tabs.forEach(t => {
      const el = $(`tab-${t}`);
      if (el) {
        el.classList.toggle('active', tab === t);
        el.setAttribute('aria-selected', String(tab === t));
      }
    });
    renderShop();
    setTimeout(() => _syncTutorialAfterRender(), 60);
  }

  /**
   * Re-render the entire shop content area.
   * Called on tab switch, after any purchase, and at init.
   */
  function renderShop() {
    const container = $('shop-content');
    container.innerHTML = '';

    if (_currentTab === 'hardware') {
      _renderHardwareTab(container);
    } else if (_currentTab === 'staff') {
      _renderStaffTab(container);
    } else if (_currentTab === 'business') {
      _renderBusinessTab(container);
    } else if (_currentTab === 'models') {
      _renderAILabTab(container);
    } else {
      _renderAITab(container);
    }
    setTimeout(() => _syncTutorialAfterRender(), 30);
  }

  /** Render the hardware purchase list */
  function _renderHardwareTab(container) {
    _sectionTitle(container, '⚙️ HARDWARE STORE');

    for (const hw of HARDWARE) {
      const owned = Game.state.hardware[hw.id] || 0;
      const cost = Game.getNextHardwareCost(hw);
      const locked = Game.state.year < hw.requireYear;
      const canBuy = !locked && Game.state.money >= cost;
      const maxed = _isMaxed(hw.id);

      const card = _el('div', `shop-card hw${locked ? ' locked' : ''}${maxed ? ' maxed' : ''}`);
      card.innerHTML = `
        <div class="card-icon">${hw.icon}</div>
        <div class="card-body">
          <div class="card-name">${hw.name}</div>
          <div class="card-desc">${hw.desc.replace(/ChillGPT/g, Game.state.aiName)}</div>
          <div class="card-badges">
            <span class="badge badge-blue">+${hw.computePS} TF/s</span>
            <span class="badge badge-red">⚡ +${Fmt.money(hw.elecPS)}/s</span>
            ${locked ? `<span class="badge badge-purple">UNLOCKS ${hw.requireYear}</span>` : ''}
            ${maxed ? `<span class="badge badge-red">MAX REACHED</span>` : ''}
          </div>
        </div>
        <div class="card-right">
          <div class="card-count">OWNED: <span>${owned}</span></div>
          <button
            class="buy-btn${canBuy ? '' : ' cant-afford'}${maxed ? ' owned-btn' : ''}"
            data-hw="${hw.id}"
            onclick="UI.handleBuyHardware('${hw.id}')"
            ${locked || maxed ? 'disabled' : ''}
            aria-label="Buy ${hw.name} for ${Fmt.money(cost)}"
          >${locked ? `🔒 ${hw.requireYear}` : maxed ? 'MAX' : Fmt.money(cost)}</button>
        </div>
      `;
      container.appendChild(card);
    }

    // Net income info row
    const mps = Game.getNetMoneyPerSecond();
    const info = _el('div', 'shop-card info-card');
    info.innerHTML = `
      <div class="card-icon">📊</div>
      <div class="card-body">
        <div class="card-name">NET INCOME</div>
        <div class="card-badges">
          <span class="badge ${mps >= 0 ? 'badge-green' : 'badge-red'}">
            ${mps >= 0 ? '+' : ''}${Fmt.money(mps)}/s
          </span>
          <span class="badge badge-blue">Users: ${Fmt.num(Game.getUsers(), 0)}</span>
          <span class="badge badge-purple">Compute: ${Fmt.compute(Game.getTotalCompute())}</span>
        </div>
      </div>
    `;
    container.appendChild(info);
  }

  /** Render the AI tech research list */
  function _renderAITab(container) {
    _sectionTitle(container, '🧠 AI RESEARCH LAB');

    for (const upg of AI_UPGRADES) {
      const owned = Game.state.unlockedUpgrades.includes(upg.id);
      const locked = Game.state.year < upg.requireYear;
      const tfCost = upg.tfCost || 0;
      const canBuy = !locked && !owned && Game.state.money >= upg.cost && Game.state.tf >= tfCost;

      const card = _el('div', `shop-card ai${locked ? ' locked' : ''}${owned ? ' owned' : ''}`);
      card.innerHTML = `
        <div class="card-icon">${upg.icon}</div>
        <div class="card-body">
          <div class="card-name">${upg.name}</div>
          <div class="card-desc">${upg.desc.replace(/ChillGPT/g, Game.state.aiName)}</div>
          <div class="card-badges">
            <span class="badge ${upg.badgeClass}">${upg.badge}</span>
            <span class="badge badge-purple" style="border-color:#9050c0; color:#501880;">Cost: ${Fmt.num(tfCost)} TF</span>
            ${locked ? `<span class="badge badge-red">UNLOCKS ${upg.requireYear}</span>` : ''}
          </div>
        </div>
        <div class="card-right" style="justify-content:center;">
          <button
            class="buy-btn ai-btn${owned ? ' owned-btn' : ''}${!canBuy && !owned ? ' cant-afford' : ''}"
            style="min-width: 90px; padding: 6px;"
            data-ai="${upg.id}"
            onclick="UI.handleBuyAI('${upg.id}')"
            ${owned || locked ? 'disabled' : ''}
            aria-label="${owned ? upg.name + ' owned' : 'Buy ' + upg.name}"
          >${owned ? '✅ OWNED' : locked ? `🔒 ${upg.requireYear}` : Fmt.money(upg.cost)}</button>
        </div>
      `;
      container.appendChild(card);
    }
  }

  // ── AI LAB TAB ────────────────────────────────────────────────────

  function _renderAILabTab(container) {
    _sectionTitle(container, '🤖 AI MODEL LAB');

    const training = ModelBuilder.getTrainingJob();
    if (training) {
      const prog = container.appendChild(_el('div', 'shop-card info-card'));
      const pct = Math.round(Math.min(training.elapsed / training.totalSec, 1) * 100);
      prog.innerHTML = `
        <div class="card-icon" style="font-size:20px;">⚙️</div>
        <div class="card-body" style="width:100%;">
          <div class="card-name" style="font-size:10px;">TRAINING: ${training.modelName}</div>
          <div style="background:#111; border: 1px solid var(--accent); height:8px; margin:6px 0;">
            <div style="background: linear-gradient(90deg, #39d87e, #2ba88f); height:100%; width:${pct}%; transition:width 0.5s;"></div>
          </div>
          <div style="font-family:var(--font-mono); font-size:0.4rem; color:var(--accent);">${pct}% — ${Math.round(Math.max(0, training.totalSec - training.elapsed))}s remaining</div>
        </div>`;
    }

    const openBtn = _el('div', 'shop-card hw');
    openBtn.innerHTML = `
      <div class="card-icon" style="font-size:24px;">➕</div>
      <div class="card-body"><div class="card-name">DESIGN NEW MODEL</div><div class="card-desc">Open the model builder to design a custom AI architecture from scratch.</div></div>
      <div class="card-right"><button class="buy-btn" onclick="UI.openModelBuilder()" style="min-width:80px;">DESIGN</button></div>`;
    container.appendChild(openBtn);

    const models = ModelBuilder.getAllModels();
    if (models.length > 0) {
      _sectionTitle(container, '📋 YOUR MODELS');
      for (const m of [...models].reverse()) {
        const arch = ModelBuilder.getArchitectures().find(a => a.id === m.archId);
        const size = ModelBuilder.getModelSizes().find(s => s.id === m.sizeId);
        const card = _el('div', 'shop-card ai');
        let actionBtn = '';
        if (m.status === 'designed') {
          const canTrain = Game.state.tf >= m.tfNeeded && !training;
          actionBtn = `<button class="buy-btn ${canTrain ? '' : 'cant-afford'}" ${training ? 'disabled' : ''} onclick="UI.handleStartTraining(${m.id})" style="min-width:80px;font-size:8px;">TRAIN<br><small>${Fmt.num(m.tfNeeded)} TF</small></button>`;
        } else if (m.status === 'training') {
          actionBtn = `<button class="buy-btn owned-btn" disabled style="min-width:80px;font-size:8px;">TRAINING...</button>`;
        } else if (m.status === 'trained') {
          actionBtn = `<button class="buy-btn" onclick="UI.openReleaseModal(${m.id})" style="min-width:80px;font-size:8px;">RELEASE 🚀</button>`;
        } else if (m.status === 'released') {
          const mkt = (typeof Market !== 'undefined') ? Market.getMarket(m.marketId) : null;
          actionBtn = `<div class="card-count" style="text-align:center;">${mkt ? mkt.icon : '🌍'} LIVE<br><small style="color:#39d87e">${Fmt.money(ModelBuilder.getModelIncomePerSecond())}/s</small></div>`;
        }
        card.innerHTML = `
          <div class="card-icon" style="font-size:20px;">${arch ? arch.icon : '🤖'}</div>
          <div class="card-body">
            <div class="card-name" style="font-size:10px;">${m.name}</div>
            <div class="card-desc">${arch ? arch.name : ''} · ${size ? size.label : ''} · Score: ${m.perfScore}</div>
            <div class="card-badges">
              <span class="badge badge-blue">${m.status.toUpperCase()}</span>
              ${(m.traitIds || []).map(tid => { const t = ModelBuilder.getTraits().find(t => t.id === tid); return t ? `<span class="badge badge-green">${t.icon}</span>` : ''; }).join('')}
            </div>
          </div>
          <div class="card-right" style="justify-content:center;">${actionBtn}</div>`;
        container.appendChild(card);
      }
    } else {
      const empty = _el('div', 'shop-card info-card');
      empty.innerHTML = `<div class="card-icon">💡</div><div class="card-body"><div class="card-name">NO MODELS YET</div><div class="card-desc">Design and train your first AI model to start earning AI deployment revenue!</div></div>`;
      container.appendChild(empty);
    }

    if (typeof Market !== 'undefined') {
      _sectionTitle(container, '📈 MARKET DEMAND');
      const markets = Market.getMarkets();
      const mktCard = _el('div', 'shop-card info-card');
      mktCard.innerHTML = `<div class="card-body" style="width:100%;">${markets.map(mk => `
        <div style="display:flex; align-items:center; margin:4px 0;">
          <span style="font-family:var(--font-pixel); font-size:0.4rem; min-width:100px;">${mk.icon} ${mk.name}</span>
          <div style="flex:1; margin:0 8px; background:#111; height:6px; border:1px solid #333;">
            <div style="background:${mk.demand > 0.7 ? '#39d87e' : mk.demand > 0.4 ? '#f5c842' : '#e74c3c'}; height:100%; width:${Math.round(mk.demand * 100)}%;"></div>
          </div>
          <span style="font-family:var(--font-mono); font-size:0.4rem;">${Math.round(mk.demand * 100)}%</span>
        </div>`).join('')}</div>`;
      container.appendChild(mktCard);
    }
  }

  function openModelBuilder() {
    _mbSelectedArch = 'transformer';
    _mbSelectedSize = 'mini';
    _mbSelectedTraits = [];
    _buildModelBuilderModal();
    document.getElementById('model-builder-modal').classList.add('show');
  }

  function _buildModelBuilderModal() {
    const archGrid = $('mb-arch-grid');
    if (archGrid) {
      archGrid.innerHTML = '';
      ModelBuilder.getArchitectures().forEach(arch => {
        const btn = document.createElement('button');
        btn.className = `buy-btn ${_mbSelectedArch === arch.id ? 'owned-btn' : ''}`;
        btn.style.cssText = 'text-align:left; padding:8px; display:flex; flex-direction:column; gap:2px; font-size:0.38rem;';
        btn.innerHTML = `<span style="font-size:1.5rem;">${arch.icon}</span><b>${arch.name}</b><small style="font-family:var(--font-mono);">${arch.desc}</small><small style="color:#f5c842;">TF ×${arch.tfMult}</small>`;
        btn.onclick = () => { _mbSelectedArch = arch.id; _buildModelBuilderModal(); };
        archGrid.appendChild(btn);
      });
    }

    const sizeGrid = $('mb-size-grid');
    if (sizeGrid) {
      sizeGrid.innerHTML = '';
      ModelBuilder.getModelSizes().forEach(sz => {
        const arch = ModelBuilder.getArchitectures().find(a => a.id === _mbSelectedArch);
        const tfNeeded = Math.floor(sz.tfBase * (arch ? arch.tfMult : 1));
        const haveTF = Game.state.tf >= tfNeeded;
        const btn = document.createElement('button');
        btn.className = `buy-btn ${_mbSelectedSize === sz.id ? 'owned-btn' : ''} ${!haveTF ? 'cant-afford' : ''}`;
        btn.style.cssText = 'text-align:left; padding:8px; font-size:0.38rem;';
        btn.innerHTML = `${sz.icon} <b>${sz.label}</b> · ${Fmt.num(tfNeeded)} TF · ${sz.timeSec}s`;
        btn.onclick = () => { _mbSelectedSize = sz.id; _buildModelBuilderModal(); };
        sizeGrid.appendChild(btn);
      });
    }

    const traitGrid = $('mb-trait-grid');
    if (traitGrid) {
      traitGrid.innerHTML = '';
      ModelBuilder.getTraits().forEach(t => {
        const sel = _mbSelectedTraits.includes(t.id);
        const btn = document.createElement('button');
        btn.className = `buy-btn ${sel ? 'owned-btn' : ''}`;
        btn.style.cssText = 'text-align:left; padding:6px; font-size:0.36rem;';
        btn.innerHTML = `${t.icon} ${t.name}<br><small style="font-weight:normal;">${t.desc}</small>`;
        btn.onclick = () => {
          if (sel) _mbSelectedTraits = _mbSelectedTraits.filter(id => id !== t.id);
          else if (_mbSelectedTraits.length < 2) _mbSelectedTraits.push(t.id);
          _buildModelBuilderModal();
        };
        traitGrid.appendChild(btn);
      });
    }

    const prev = $('mb-preview-content');
    if (prev) {
      const arch = ModelBuilder.getArchitectures().find(a => a.id === _mbSelectedArch);
      const sz = ModelBuilder.getModelSizes().find(s => s.id === _mbSelectedSize);
      if (arch && sz) {
        const tfNeeded = Math.floor(sz.tfBase * arch.tfMult);
        const perfScore = Math.floor((sz.perfBase + arch.perfBonus) * (1 + _mbSelectedTraits.length * 0.1));
        const canAfford = Game.state.tf >= tfNeeded;
        prev.innerHTML = `
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
            <div><div style="color:#888;">Architecture</div><b>${arch.name}</b></div>
            <div><div style="color:#888;">Size</div><b>${sz.label}</b></div>
            <div><div style="color:#888;">Perf Score</div><b style="color:#39d87e;">${perfScore}</b></div>
            <div><div style="color:#888;">TF Cost</div><b style="color:${canAfford ? '#39d87e' : '#e74c3c'};">${Fmt.num(tfNeeded)} TF</b></div>
            <div><div style="color:#888;">Train Time</div><b>${sz.timeSec}s</b></div>
            <div><div style="color:#888;">Traits</div><b>${_mbSelectedTraits.length}/2</b></div>
          </div>
          <div style="margin-top:8px; color:#999;">Best Markets: ${arch.markets.join(', ')}</div>
          ${!canAfford ? `<div style="color:#e74c3c;margin-top:6px;">⚠️ Need ${Fmt.num(tfNeeded - Math.floor(Game.state.tf))} more TF</div>` : ''}`;
      }
    }
  }

  function handleDesignModel() {
    const nameEl = $('mb-model-name');
    const result = ModelBuilder.designModel({ name: nameEl ? nameEl.value : '', archId: _mbSelectedArch, sizeId: _mbSelectedSize, traitIds: _mbSelectedTraits });
    if (result.ok) {
      document.getElementById('model-builder-modal').classList.remove('show');
      toast(result.message, 't-green');
      switchTab('models');
    } else {
      toast(result.message, 't-red');
    }
  }

  function handleStartTraining(modelId) {
    const result = ModelBuilder.startTraining(modelId);
    if (result.ok) { toast(result.message, 't-blue'); renderShop(); }
    else { toast(result.message, 't-red'); }
  }

  function openReleaseModal(modelId) {
    const existing = document.getElementById('release-overlay');
    if (existing) existing.remove();
    const markets = Market.getMarkets();
    const choices = markets.map(mk =>
      `<button class="buy-btn" style="margin:4px; padding:8px 12px; font-size:0.4rem;" onclick="UI.handleReleaseModel(${modelId},'${mk.id}')">${mk.icon} ${mk.name}<br><small>Demand: ${Math.round(mk.demand * 100)}%</small></button>`
    ).join('');
    const overlay = document.createElement('div');
    overlay.id = 'release-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:1800;';
    overlay.innerHTML = `<div class="modal-box pixel-border" style="width:500px;"><div class="modal-title">🚀 RELEASE MODEL</div><div class="modal-subtitle">Choose a market segment</div><div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin:12px 0;">${choices}</div><button class="modal-close-btn" style="background:#333;" onclick="document.getElementById('release-overlay')?.remove()">CANCEL</button></div>`;
    document.body.appendChild(overlay);
  }

  function handleReleaseModel(modelId, marketId) {
    document.getElementById('release-overlay')?.remove();
    const result = ModelBuilder.releaseModel(modelId, marketId);
    if (result.ok) { toast(result.message, 't-green'); if (typeof flashScreen === 'function') flashScreen(true); mascotHappy(true); renderShop(); }
    else { toast(result.message, 't-red'); }
  }

  function showAwards(year) {
    const awards = ModelBuilder.calculateAwards();
    const body = $('awards-body');
    const lbl = $('awards-year-label');
    if (lbl) lbl.textContent = `YEAR ${year} RESULTS`;
    if (body) {
      body.innerHTML = '';
      let bonus = 0;
      awards.forEach(award => {
        const row = _el('div', '');
        row.style.cssText = 'display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #333;font-family:var(--font-pixel);font-size:0.42rem;gap:10px;flex-wrap:wrap;';
        const win = award.playerWins ? `<span style="color:#39d87e;">🏆 YOU WIN — ${award.modelName}</span>` : `<span style="color:#e74c3c;">❌ ${award.modelName}</span>`;
        const rew = (award.playerWins && award.reward) ? `<span style="color:#f5c842;margin-left:auto;">+${Fmt.money(award.reward.cash)}</span>` : '';
        row.innerHTML = `<b>${award.category}</b>${win}${rew}`;
        body.appendChild(row);
        if (award.playerWins && award.reward) bonus += award.reward.cash;
      });
      if (bonus > 0) {
        Game.state.money += bonus; Game.state.totalMoneyEarned += bonus;
        const msg = _el('div', '');
        msg.style.cssText = 'text-align:center;padding:12px;font-family:var(--font-pixel);font-size:0.5rem;color:#f5c842;';
        msg.textContent = `🎊 AWARD PAYOUT: +${Fmt.money(bonus)}!`;
        body.appendChild(msg);
      }
    }
    const modal = $('awards-modal'); if (modal) modal.classList.add('show');
  }

  function closeAwards() {
    const modal = $('awards-modal'); if (modal) modal.classList.remove('show');
  }

  // ── BUSINESS TAB ──────────────────────────────────────────────────

  function _renderBusinessTab(container) {
    _sectionTitle(container, '💼 BUSINESS STRATEGY');

    // Model Selection
    const type = Game.state.modelType || 'opensource';
    const selBox = _el('div', 'shop-card info-card');
    selBox.innerHTML = `
      <div class="card-icon">🧠</div>
      <div class="card-body">
        <div class="card-name">AI MODEL TYPE</div>
        <div class="card-desc">Choose how you deploy your AI. This affects revenue and active users.</div>
        <div style="margin-top: 8px; display: flex; gap: 8px;">
          <button class="buy-btn ${type === 'opensource' ? 'owned-btn' : ''}" style="padding: 4px; font-size: 8px; flex: 1;" onclick="UI.handleChangeModel('opensource')">OPEN SOURCE</button>
          <button class="buy-btn ${type === 'subscription' ? 'owned-btn' : ''}" style="padding: 4px; font-size: 8px; flex: 1;" onclick="UI.handleChangeModel('subscription')">SUBSCRIPTION</button>
          <button class="buy-btn ${type === 'private' ? 'owned-btn' : ''}" style="padding: 4px; font-size: 8px; flex: 1;" onclick="UI.handleChangeModel('private')">PRIVATE</button>
        </div>
      </div>
    `;
    container.appendChild(selBox);

    // Marketing
    _sectionTitle(container, '📢 MARKETING CAMPAIGNS');
    const m = Game.state.marketing || { hackathon: 0, gamejam: 0, xCampaign: 0 };
    const campaigns = [
      { id: 'hackathon', name: 'Sponsor Hackathon', desc: 'Sponsor a local hackathon. +5% Users per level.', cost: 2000, lvl: m.hackathon },
      { id: 'gamejam', name: 'Sponsor GameJam', desc: 'Sponsor a global GameJam. +5% Users per level.', cost: 10000, lvl: m.gamejam },
      { id: 'xCampaign', name: 'X Viral Campaign', desc: 'Massive visibility on X (formerly Twitter). +10% Users.', cost: 75000, lvl: m.xCampaign },
    ];

    for (const c of campaigns) {
      const canBuy = Game.state.money >= c.cost;
      const card = _el('div', 'shop-card');
      card.innerHTML = `
        <div class="card-icon">📈</div>
        <div class="card-body">
          <div class="card-name">${c.name} <span class="badge badge-purple" style="font-size: 8px;">Lv ${c.lvl}</span></div>
          <div class="card-desc">${c.desc}</div>
        </div>
        <div class="card-right" style="justify-content:center;">
          <button class="buy-btn ${canBuy ? '' : 'cant-afford'}" style="min-width: 90px; padding: 6px;"
            onclick="UI.handleBuyMarketing('${c.id}')">
            ${Fmt.money(c.cost)}
          </button>
        </div>
      `;
      container.appendChild(card);
    }
  }

  /** Render the Hire Staff tab */
  function _renderStaffTab(container) {
    _sectionTitle(container, '👥 HIRE STAFF');

    const owned = Game.state.inventory ? (Game.state.inventory.workers || 0) : 0;
    const cost = Game.getNextWorkerCost();
    const canBuy = Game.state.money >= cost;
    const maxed = _isMaxed('worker');

    // Worker card
    const card = _el('div', `shop-card hw${maxed ? ' maxed' : ''}`);
    card.innerHTML = `
      <div class="card-icon">👨‍💻</div>
      <div class="card-body">
        <div class="card-name">Hire Worker</div>
        <div class="card-desc">A dedicated dev who codes 24/7. Earns $2/s base income and fills your office!</div>
        <div class="card-badges">
          <span class="badge badge-green">+$2/s income</span>
          <span class="badge badge-blue">Fills office room</span>
          ${maxed ? `<span class="badge badge-red">MAX REACHED (5)</span>` : ''}
        </div>
      </div>
      <div class="card-right">
        <div class="card-count">STAFF: <span>${owned}</span></div>
        <button
          class="buy-btn${canBuy ? '' : ' cant-afford'}${maxed ? ' owned-btn' : ''}"
          id="btn-hire-worker"
          onclick="UI.handleHireWorker()"
          ${maxed ? 'disabled' : ''}
          aria-label="Hire worker for ${Fmt.money(cost)}"
        >${maxed ? 'MAX' : Fmt.money(cost)}</button>
      </div>
    `;
    container.appendChild(card);

    // Info row
    const info = _el('div', 'shop-card info-card');
    info.innerHTML = `
      <div class="card-icon">📊</div>
      <div class="card-body">
        <div class="card-name">STAFF INCOME</div>
        <div class="card-badges">
          <span class="badge badge-green">+${Fmt.money(owned * 2)}/s from ${owned} workers</span>
          <span class="badge badge-blue">Each worker: +$2/s</span>
        </div>
      </div>
    `;
    container.appendChild(info);

    // Roster 
    if (Game.state.inventory && Game.state.inventory.workersList && Game.state.inventory.workersList.length > 0) {
      _sectionTitle(container, '🗂️ ACTIVE ROSTER');
      for (const w of Game.state.inventory.workersList) {
        const rosterCard = _el('div', 'shop-card info-card');
        rosterCard.style.minHeight = '40px';
        rosterCard.style.padding = '8px';
        rosterCard.innerHTML = `
          <div class="card-icon" style="font-size: 20px;">👤</div>
          <div class="card-body" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
            <div class="card-name" style="font-size: 10px;">${w.name}</div>
            <div class="card-badges">
              <span class="badge badge-purple" style="font-size: 9px; padding: 4px;">SKILL: ${w.skill}</span>
            </div>
          </div>
        `;
        container.appendChild(rosterCard);
      }
    }
  }

  /**
   * Re-render only the buy-button states without rebuilding the whole shop.
   * Lightweight update called every tick.
   */
  function updateShopButtons() {
    $$('.buy-btn[data-hw]').forEach(btn => {
      const hw = HARDWARE.find(h => h.id === btn.dataset.hw);
      if (!hw) return;
      const locked = Game.state.year < hw.requireYear;
      const cost = Game.getNextHardwareCost(hw);
      const canBuy = !locked && Game.state.money >= cost;
      const maxed = _isMaxed(hw.id);

      btn.classList.toggle('cant-afford', !canBuy && !maxed);
      btn.classList.toggle('owned-btn', maxed);
      btn.disabled = locked || maxed;

      if (maxed) btn.textContent = 'MAX';
      else if (!locked) btn.textContent = Fmt.money(cost);
    });

    $$('.buy-btn[data-ai]').forEach(btn => {
      const upg = AI_UPGRADES.find(u => u.id === btn.dataset.ai);
      if (!upg) return;
      const owned = Game.state.unlockedUpgrades.includes(upg.id);
      const locked = Game.state.year < upg.requireYear;
      const canBuy = !locked && !owned && Game.state.money >= upg.cost;
      if (!owned && !locked) {
        btn.classList.toggle('cant-afford', !canBuy);
        btn.textContent = Fmt.money(upg.cost);
      }
    });

    // Worker hire button
    const workerBtn = $('btn-hire-worker');
    if (workerBtn) {
      const cost = Game.getNextWorkerCost();
      const canBuy = Game.state.money >= cost;
      const maxed = _isMaxed('worker');
      workerBtn.classList.toggle('cant-afford', !canBuy && !maxed);
      workerBtn.classList.toggle('owned-btn', maxed);
      workerBtn.disabled = maxed;
      workerBtn.textContent = maxed ? 'MAX' : Fmt.money(cost);
    }
  }

  function _isMaxed(id) {
    const owned = Game.state.hardware[id] || 0;
    if (id === 'cluster') return owned >= 4;
    if (id === 'rack') return owned >= 2;
    if (id === 'megaDC') return owned >= 1;
    if (id === 'quantumDC') return owned >= 1;
    if (id === 'worker') return (Game.state.inventory?.workers || 0) >= 5;
    return false;
  }


  // ── FACTORY MACHINES ─────────────────────────────────────────────

  /**
   * Rebuild the machine display in the factory area.
   * Called after every hardware purchase and on year change.
   */
  function renderMachines() {
    const rowFront = $('machine-row-front');
    const rowBack = $('machine-row-back');
    rowFront.innerHTML = '';
    rowBack.innerHTML = '';

    for (const hw of HARDWARE) {
      const count = Game.state.hardware[hw.id] || 0;
      if (count === 0) continue;

      const visibleCount = Math.min(count, hw.maxRender);
      const row = hw.row === 'back' ? rowBack : rowFront;

      for (let i = 0; i < visibleCount; i++) {
        const card = _makeMachineCard(hw, count, i, visibleCount);
        row.appendChild(card);
      }
    }
  }

  /**
   * Build a single machine visual card element.
   */
  function _makeMachineCard(hw, totalCount, index, visibleCount) {
    const card = _el('div', 'machine-card');
    card.style.animationDelay = (index * 0.04) + 's';

    const body = _el('div', `machine-body ${hw.cssClass}`);

    // Build LED / strip decorations based on type
    if (hw.id === 'rack') {
      // Server racks get horizontal strips
      for (let j = 0; j < 4; j++) {
        const strip = _el('div', 'rack-strip');
        strip.style.animationDelay = (j * 0.2) + 's';
        body.appendChild(strip);
      }
    } else {
      // All others get LEDs
      const ledColors = {
        cluster: 'blue',
        megaDC: 'green',
        quantumDC: 'purple',
      };
      const color = ledColors[hw.id] || 'blue';
      const led = _el('div', `machine-led ${color}`);
      led.style.setProperty('--bspeed', (0.6 + Math.random() * 0.8) + 's');
      body.appendChild(led);

      // Big machines get extra LEDs
      if (hw.id === 'megaDC' || hw.id === 'quantumDC') {
        const led2 = _el('div', `machine-led ${color}`);
        led2.style.setProperty('--bspeed', (0.4 + Math.random() * 0.6) + 's');
        led2.style.animationDelay = '0.3s';
        body.appendChild(led2);
      }
    }

    // Machine label
    const shortNames = {
      cluster: 'CLUSTER', rack: 'SERVER',
      megaDC: 'MEGA DC', quantumDC: 'QUANTUM',
    };
    const tag = _el('div', 'machine-tag');
    tag.textContent = shortNames[hw.id] || hw.id.toUpperCase();
    body.appendChild(tag);

    card.appendChild(body);

    // Count label (×N) when we're capping display
    if (totalCount > visibleCount && index === visibleCount - 1) {
      const cnt = _el('div', 'machine-count');
      cnt.textContent = `×${totalCount}`;
      card.appendChild(cnt);
    }

    return card;
  }

  /**
   * Update the location sign text based on current year.
   */
  function updateLocationSign() {
    const loc = [...LOCATIONS].reverse().find(l => Game.state.year >= l.year);
    const el = $('location-sign');
    if (loc && el) el.textContent = loc.label;
  }


  // ── FOOTER LEADERBOARD ───────────────────────────────────────────

  /**
   * Re-render the compact leaderboard strip in the footer.
   * @param {Array} [entries] - optional pre-sorted ranking array
   */
  function updateLeaderboard(entries) {
    if (!entries) {
      entries = _buildRankings(Game.state.year - 1);
    }
    const container = $('lb-entries');
    const rCls = ['r1', 'r2', 'r3', 'r4'];
    container.innerHTML = entries.map((e, i) => `
      <div class="lb-entry">
        <div class="lb-rank ${rCls[i]}">#${i + 1}</div>
        <div class="lb-name ${e.isYou ? 'you' : ''}">${e.icon} ${e.name}</div>
        <div class="lb-score">${Fmt.num(e.score, 0)}</div>
      </div>
    `).join('');
  }

  /**
   * Build sorted rankings for a given year.
   * @param {number} year
   * @returns {Array}
   */
  function _buildRankings(year) {
    const entries = [
      { name: Game.state.aiName, icon: '🤖', score: Game.getArenaScore(), isYou: true },
      ...COMPETITORS.map(c => ({
        name: c.name,
        icon: c.icon,
        score: Game.getCompetitorScore(c, Math.max(2016, year)),
        isYou: false,
      })),
    ];
    return entries.sort((a, b) => b.score - a.score);
  }


  // ── ARENA MODAL ──────────────────────────────────────────────────

  /**
   * Show the arena results modal for the just-completed year.
   * @param {number} completedYear
   * @param {number} nextYear
   */
  function showArena(completedYear, nextYear) {
    $('arena-year-label').textContent = `YEAR ${completedYear} RESULTS`;
    $('next-year-label').textContent = nextYear;

    const entries = _buildRankings(completedYear);
    const body = $('arena-body');
    const spotlight = $('arena-spotlight');
    const winner = entries[0];
    if (spotlight) {
      spotlight.innerHTML = `
        <div class="arena-winner-medal">${winner.icon}</div>
        <div class="arena-winner-copy">
          <div class="arena-winner-label">#1 THIS YEAR</div>
          <div class="arena-winner-name">${winner.name}</div>
          <div class="arena-winner-note">Top AI company of this arena.</div>
        </div>
      `;
    }
    const rEmoji = ['🥇', '🥈', '🥉', '4️⃣'];
    const rCls = ['r1', 'r2', 'r3', 'r4'];

    body.innerHTML = entries.map((e, i) => {
      const statusText = e.isYou
        ? (i === 0 ? '⬆️ LEADING' : `⚠️ RANK #${i + 1}`)
        : _trendText(i);
      const statusClass = e.isYou ? 'status-you' : (i === 0 ? 'status-win' : 'status-normal');
      return `
        <tr class="${e.isYou ? 'arena-you' : ''}" style="--row-delay:${i * 70}ms">
          <td class="arena-rank-cell ${rCls[i]}">${rEmoji[i]}</td>
          <td class="arena-company-cell">
            <span class="arena-company-icon">${e.icon}</span>
            <strong>${e.name}</strong>
            ${e.isYou ? '<span class="arena-you-tag">YOU</span>' : ''}
          </td>
          <td class="arena-score-cell">${Fmt.num(e.score, 0)}</td>
          <td><span class="arena-status ${statusClass}">${statusText}</span></td>
        </tr>
      `;
    }).join('');

    $('arena-modal').classList.add('show');

    // Also update the footer LB
    updateLeaderboard(entries);
  }

  function _trendText(rank) {
    return ['', '↑ RISING', '→ STABLE', '↓ FALLING'][rank] || '↓ FALLING';
  }

  /** Close the arena modal. */
  function closeArena() {
    $('arena-modal').classList.remove('show');
    if (Game.state.year >= 2026) _showEndgame();
  }

  function _showEndgame() {
    toast(`🏆 GAME COMPLETE! ${Game.state.aiName} dominates 2026! Refresh to play again.`, 't-green');
  }


  // ── YEAR TRANSITION ──────────────────────────────────────────────

  /**
   * Show the year transition overlay, then reveal the arena.
   * Called from Game.js via ui.onNewYear().
   * @param {number} prevYear
   * @param {number} newYear
   */
  function onNewYear(prevYear, newYear) {
    const overlay = $('year-transition');
    $('year-splash-num').textContent = newYear;
    $('year-splash-sub').textContent = _yearSubtitle(newYear);

    overlay.classList.add('show');

    setTimeout(() => {
      overlay.classList.remove('show');
      // Small delay before arena pops up, then awards
      setTimeout(() => {
        showArena(prevYear, newYear);
        // Schedule awards to show after arena closes (we piggyback on arena close delay)
        const origClose = window._arenaCloseCallback;
        window._pendingAwardsYear = prevYear;
      }, 400);
    }, 2200);

    // Update location sign and refresh machines
    updateLocationSign();
    renderMachines();
    renderShop(); // unlock new items if any
  }

  function _yearSubtitle(year) {
    const subs = {
      2017: 'Series A secured. Scale NOW.',
      2018: 'Image generation just dropped.',
      2019: 'Competitors are catching up...',
      2020: 'Going full data center mode.',
      2021: 'Video AI is changing everything.',
      2022: 'Voice mode. Users explode.',
      2023: 'The multimodal era begins.',
      2024: 'AI Agents take over the world.',
      2025: 'One year left. Make it count.',
      2026: `${Game.state.aiName} Empire is complete. 👑`,
    };
    return subs[year] || 'A new year begins...';
  }


  // ── VISUAL EFFECTS ───────────────────────────────────────────────

  /**
   * Spawn a floating "+$X.XX" money text in the factory area.
   * @param {string} text
   */
  function spawnMoneyPop(text) {
    const layer = $('notif-layer');
    const el = _el('div', 'money-pop');
    el.textContent = text;
    el.style.left = (28 + Math.random() * 42) + '%';
    el.style.top = (35 + Math.random() * 25) + '%';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  /** Burst confetti particles in the factory area. */
  function spawnParticles() {
    const layer = $('notif-layer');
    const colors = [
      'var(--neon-yellow)',
      'var(--neon-blue)',
      'var(--neon-green)',
      'var(--neon-purple)',
      'var(--neon-orange)',
    ];
    const count = 20;

    for (let i = 0; i < count; i++) {
      const p = _el('div', 'particle');
      const angle = (Math.PI * 2 * i) / count;
      const dist = 55 + Math.random() * 90;
      p.style.setProperty('--px', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--py', Math.sin(angle) * dist + 'px');
      p.style.left = (42 + Math.random() * 14) + '%';
      p.style.top = '60%';
      p.style.background = colors[i % colors.length];
      p.style.boxShadow = `0 0 6px ${colors[i % colors.length]}`;
      p.style.animationDelay = (Math.random() * 0.1) + 's';
      layer.appendChild(p);
      setTimeout(() => p.remove(), 1000);
    }
  }

  /**
   * Flash the screen briefly on big upgrades.
   * @param {boolean} [big=false] - purple for AI upgrades, blue for hardware
   */
  function flashScreen(big = false) {
    const flash = $('upgrade-flash');
    flash.style.background = big ? 'var(--neon-purple)' : 'var(--neon-blue)';
    flash.style.opacity = big ? '0.12' : '0.07';
    setTimeout(() => { flash.style.opacity = '0'; }, 200);
  }


  // ── MASCOT ───────────────────────────────────────────────────────

  /**
   * Show a random quip in the mascot's speech bubble.
   */
  function mascotSpeak() {
    const speech = $('mascot-speech');
    const quip = MASCOT_QUIPS[Math.floor(Math.random() * MASCOT_QUIPS.length)];
    speech.textContent = quip;
    speech.classList.add('show');
    clearTimeout(_mascotTimer);
    _mascotTimer = setTimeout(() => speech.classList.remove('show'), 3200);
  }

  /**
   * Trigger mascot happy jump animation + optional speech.
   * @param {boolean} [speak=false]
   */
  function mascotHappy(speak = false) {
    const mascot = $('mascot');
    mascot.classList.remove('happy');
    // Force reflow to restart animation
    void mascot.offsetWidth;
    mascot.classList.add('happy');
    setTimeout(() => mascot.classList.remove('happy'), 600);

    if (speak) mascotSpeak();

    // Smile goes wider temporarily
    const mouth = $('mascot-mouth');
    mouth.style.width = '38px';
    mouth.style.borderColor = 'var(--neon-yellow)';
    setTimeout(() => {
      mouth.style.width = '';
      mouth.style.borderColor = '';
    }, 700);
  }


  // ── TOASTS ───────────────────────────────────────────────────────

  /**
   * Show a temporary notification toast.
   * @param {string} msg
   * @param {string} [type=''] - 't-green' | 't-purple' | 't-red' | ''
   */
  function toast(msg, type = '') {
    const container = $('toast-container');
    const el = _el('div', `toast ${type}`);
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }


  // ── BUY ACTION HANDLERS ──────────────────────────────────────────
  // These sit in UI because they orchestrate both Game logic + visual feedback.

  function handleBuyHardware(hwId) {
    const isServer = ['rack', 'megaDC', 'quantumDC'].includes(hwId);
    const isGPU = (hwId === 'cluster');

    if (window.__phaserGame && (isServer || isGPU)) {
      const sm = window.__phaserGame.scene;
      let targetScene = isServer ? 'ServerRoomScene' : 'GPUClusterRoomScene';
      let msg = isServer ? 'Accessing Server Room...' : 'Accessing GPU Cluster Room...';

      // Switch to the target scene first
      sm.switch('GameDevStoryScene', targetScene);
      sm.switch('ServerRoomScene', targetScene);
      sm.switch('GPUClusterRoomScene', targetScene);

      toast(msg, 't-blue');
      setTimeout(() => {
        _performHardwareBuy(hwId);
      }, 370);
    } else {
      _performHardwareBuy(hwId);
    }
  }

  function _performHardwareBuy(hwId) {
    const result = Game.buyHardware(hwId);
    if (result.ok) {
      renderMachines();
      renderShop();
      // use the correct function name (flashScreen)
      if (typeof flashScreen === 'function') flashScreen(result.bigUpgrade);
      if (result.bigUpgrade) mascotHappy(true);
      toast(result.message, 't-green');
      _advanceTutorialAfterHardware(hwId);
    } else {
      toast(result.message, 't-red');
    }
  }

  function handleBuyAI(upgradeId) {
    const result = Game.buyAIUpgrade(upgradeId);
    if (result.ok) {
      renderShop();
      if (typeof flashScreen === 'function') flashScreen(true);
      mascotHappy(true);
      toast(result.message, 't-purple');
    } else {
      toast(result.message, 't-red');
    }
  }

  /** Handle hiring a worker — updates state, visual room, and toast. */
  function handleHireWorker() {
    if (window.__phaserGame) {
      const sm = window.__phaserGame.scene;
      // Switch back to main Office scene
      sm.switch('ServerRoomScene', 'GameDevStoryScene');
      sm.switch('GPUClusterRoomScene', 'GameDevStoryScene');

      toast('Heading back to the Office...', 't-blue');
      setTimeout(() => {
        _performHireWorker();
      }, 500);
    } else {
      _performHireWorker();
    }
  }

  function _performHireWorker() {
    const result = Game.hireWorker();
    if (result.ok) {
      renderShop();
      if (typeof flashScreen === 'function') flashScreen(false);
      mascotHappy(true);
      toast(result.message, 't-green');
      _advanceTutorialAfterStaff();
    } else {
      toast(result.message, 't-red');
    }
  }

  // Alias for collect button (wired to onclick in HTML)
  function handleCollect() {
    const result = Game.collectMoney();
    if (result.ok) {
      window.dispatchEvent(new CustomEvent('PLAY_SFX', { detail: { key: 'coin' } }));
      spawnMoneyPop(`+${Fmt.money(result.amount)}`);
      spawnParticles();
      flashScreen(false);
      mascotHappy(false);
      mascotSpeak();
      _advanceTutorialAfterCollect();
    } else {
      toast('No revenue yet! Buy hardware first.', '');
    }
  }

  function handleChangeModel(model) {
    const result = Game.changeModel(model);
    if (result.ok) {
      renderShop();
      toast(result.message, 't-blue');
    } else {
      toast(result.message, 't-red');
    }
  }

  function handleBuyMarketing(type) {
    const result = Game.buyMarketing(type);
    if (result.ok) {
      updateStats();
      renderShop();
      if (typeof flashScreen === 'function') flashScreen(false);
      mascotHappy(true);
      toast(result.message, 't-green');
    } else {
      toast(result.message, 't-red');
    }
  }

  /** Grant $1M and save - developer only */
  function activateDevMode() {
    Game.state.money += 1000000;
    Game.state.totalMoneyEarned += 1000000;
    updateStats();
    if (typeof Save !== 'undefined') Save.save();
    toast('🚀 DEV MODE: +$1,000,000!', 't-green');
    spawnParticles();
    flashScreen(true);
  }

  /** Skip to next year - developer only */
  function devSkipYear() {
    if (Game.state.year >= 2026) {
      toast('Empire complete! No more years to skip.', 't-red');
      return;
    }
    Game.state.yearProgress = Game.state.yearDuration; // Force jump
    Game.skipYear();
    toast('🚀 DEV MODE: Skipping to next year...', 't-purple');
  }

  /** Manually trigger a tier level for testing */
  function devSetTier(t) {
    if (t === 3) {
      Game.state.hardware.megaDC = 1;
      toast('🚀 DEV MODE: Simulating Mega Data Center (Tier 3)', 't-blue');
    } else if (t === 4) {
      Game.state.hardware.quantumDC = 1;
      toast('🚀 DEV MODE: Simulating Quantum Center (Tier 4)', 't-purple');
    }
    // Fire event to update Phaser
    window.dispatchEvent(new CustomEvent('SPAWN_MACHINE', { detail: { hwId: t === 3 ? 'megaDC' : 'quantumDC' } }));
    updateStats();
    if (typeof Save !== 'undefined') Save.save();
  }

  // helper alias so flashScreen can be called as plain 'flash(big)'
  function flash(big) { flashScreen(big); }


  // ── SETTINGS MENU ────────────────────────────────────────────────

  function initAudioSettings() {
    _syncAudioSettingsUI();
    window.addEventListener('AUDIO_SETTINGS_CHANGED', _syncAudioSettingsUI);
    document.addEventListener('click', (e) => {
      const panel = $('settings-panel');
      if (!panel || panel.contains(e.target)) return;
      _setSettingsMenuOpen(false);
    });
  }

  function toggleSettingsMenu() {
    const menu = $('settings-menu');
    _setSettingsMenuOpen(!menu?.classList.contains('show'));
  }

  function _setSettingsMenuOpen(open) {
    const menu = $('settings-menu');
    const btn = $('settings-toggle');
    if (!menu || !btn) return;
    menu.classList.toggle('show', open);
    menu.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open));
  }

  function _syncAudioSettingsUI() {
    const settings = window.GameAudio?.getSettings?.() || { music: true, sfx: true };
    const music = $('setting-music');
    const sfx = $('setting-sfx');
    if (music) music.checked = !!settings.music;
    if (sfx) sfx.checked = !!settings.sfx;
  }

  function setAudioSetting(type, enabled) {
    if (!window.GameAudio) return;
    if (type === 'music') {
      window.GameAudio.setMusicEnabled(enabled);
    } else if (type === 'sfx') {
      window.GameAudio.setSfxEnabled(enabled);
    }
    toast(`${type === 'music' ? 'Music' : 'Sound effects'} ${enabled ? 'ON' : 'OFF'}`);
  }


  // ── STAR FIELD INIT ──────────────────────────────────────────────

  function initStars() {
    const container = $('stars-container');
    for (let i = 0; i < 90; i++) {
      const star = _el('div', 'star');
      star.style.left = Math.random() * 100 + '%';
      star.style.top = Math.random() * 65 + '%';
      star.style.setProperty('--dur', (1.8 + Math.random() * 4) + 's');
      star.style.setProperty('--delay', (Math.random() * 5) + 's');
      container.appendChild(star);
    }
  }


  // ── ELEMENT FACTORY ──────────────────────────────────────────────

  /**
   * Quick DOM element creator.
   * @param {string} tag
   * @param {string} [className]
   * @returns {HTMLElement}
   */
  function _el(tag, className = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  /**
   * Helper to create an element with an optional class.
   */
  function _el(tag, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  /**
   * Add a section title row to a container.
   */
  function _sectionTitle(container, text) {
    const t = _el('div', 'shop-section-title');
    t.textContent = text;
    container.appendChild(t);
  }


  // ── PUBLIC API ────────────────────────────────────────────────────

  return {
    // Init
    initStars,
    updateLocationSign,
    obNext,
    obFinish,
    startNewUserGuide,
    dismissTutorial,

    // Tick updates
    updateStats,
    updateShopButtons,

    // Full renders
    renderShop,
    renderMachines,
    updateLeaderboard,
    initAudioSettings,

    // Tab control
    switchTab,

    // Events from game.js
    onNewYear,

    // Modals
    showArena,
    closeArena,

    // Effects
    spawnMoneyPop,
    spawnParticles,
    flashScreen,

    // Buy handlers (called from onclick in HTML)
    handleBuyHardware,
    handleBuyAI,
    handleHireWorker,
    handleCollect,
    handleChangeModel,
    handleBuyMarketing,

    // AI Lab
    openModelBuilder,
    handleDesignModel,
    handleStartTraining,
    openReleaseModal,
    handleReleaseModel,
    showAwards,
    closeAwards,

    // Dev Mode
    activateDevMode,
    devSkipYear,
    devSetTier,

    // Mascot
    mascotSpeak,
    mascotHappy,

    // Notifications
    toast,

    // Settings
    toggleSettingsMenu,
    setAudioSetting,
  };

})();

// ── Wire up collect button
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('collect-btn');
  if (btn) btn.onclick = () => UI.handleCollect();
});

// ── Listen for training completion event
window.addEventListener('MODEL_TRAINED', (e) => {
  const model = e.detail.model;
  if (model) {
    UI.toast(`✅ "${model.name}" training complete! Go release it!`, 't-green');
    UI.mascotHappy(true);
    UI.switchTab('models');
  }
});
