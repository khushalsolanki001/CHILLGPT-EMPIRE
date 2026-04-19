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
  const $  = (id)  => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Tab state ('hardware' | 'ai' | 'staff')
  let _currentTab = 'hardware';

  // Mascot speech timer
  let _mascotTimer = null;


  // ── STAT BAR UPDATE ──────────────────────────────────────────────

  /**
   * Refresh all top-bar stat pills from current game state.
   * Called every tick from main.js.
   */
  function updateStats() {
    const s   = Game.state;
    const mps = Game.getNetMoneyPerSecond();
    const c   = s._computed || {};

    $('stat-money').textContent      = Fmt.money(s.money);
    $('stat-compute').textContent    = Fmt.compute(c.compute || 0);
    $('stat-electricity').textContent = Fmt.money(c.elec || 0) + '/s';
    $('stat-users').textContent      = Fmt.num(c.users || 0, 0);
    $('stat-net').textContent        = (mps >= 0 ? '+' : '') + Fmt.money(mps) + '/s';
    if ($('logo-ai-name')) $('logo-ai-name').textContent = s.aiName;

    // Year + Month display
    const month  = s.currentMonth || 1;
    const mo     = String(month).padStart(2, '0');
    $('year-value').textContent = `${s.year} / M${mo}`;

    // Workers pill (if element exists)
    const wEl = $('stat-workers');
    if (wEl) wEl.textContent = (c.workers || 0) + ' staff';

    // Electricity danger colour
    $('elec-pill').classList.toggle('danger', mps < 0);

    // Training progress bar
    const pct = s.trainProgress.toFixed(1);
    $('train-progress').style.width   = pct + '%';
    $('progress-percent').textContent = Math.round(pct) + '%';
    $('progress-label').textContent   =
      `${s.aiName} v${s.year - 2015}.0 — TRAINING`;

    // Collect button label
    const pending = s.pendingRevenue;
    $('collect-label').textContent =
      pending > 0.01 ? `COLLECT ${Fmt.money(pending)}` : 'COLLECT REVENUE';

    // Year countdown footer
    const rem = Math.max(0, s.yearDuration - s.yearProgress);
    const mm  = String(Math.floor(rem / 60)).padStart(2, '0');
    const ss  = String(Math.floor(rem % 60)).padStart(2, '0');
    $('next-comp').textContent = `NEXT ARENA: ${mm}:${ss}`;
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
  }



  // ── SHOP ─────────────────────────────────────────────────────────

  /**
   * Switch the shop to a different tab.
   * @param {'hardware'|'ai'} tab
   */
  function switchTab(tab) {
    _currentTab = tab;
    $('tab-hardware').classList.toggle('active', tab === 'hardware');
    $('tab-hardware').setAttribute('aria-selected', tab === 'hardware');
    $('tab-ai').classList.toggle('active',       tab === 'ai');
    $('tab-ai').setAttribute('aria-selected',       tab === 'ai');
    const staffTab = $('tab-staff');
    if (staffTab) {
      staffTab.classList.toggle('active', tab === 'staff');
      staffTab.setAttribute('aria-selected', tab === 'staff');
    }
    renderShop();
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
    } else {
      _renderAITab(container);
    }
  }

  /** Render the hardware purchase list */
  function _renderHardwareTab(container) {
    _sectionTitle(container, '⚙️ HARDWARE STORE');

    for (const hw of HARDWARE) {
      const owned  = Game.state.hardware[hw.id] || 0;
      const cost   = Game.getNextHardwareCost(hw);
      const locked = Game.state.year < hw.requireYear;
      const canBuy = !locked && Game.state.money >= cost;
      const maxed  = _isMaxed(hw.id);

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
      const owned  = Game.state.unlockedUpgrades.includes(upg.id);
      const locked = Game.state.year < upg.requireYear;
      const canBuy = !locked && !owned && Game.state.money >= upg.cost;

      const card = _el('div', `shop-card ai${locked ? ' locked' : ''}${owned ? ' owned' : ''}`);
      card.innerHTML = `
        <div class="card-icon">${upg.icon}</div>
        <div class="card-body">
          <div class="card-name">${upg.name}</div>
          <div class="card-desc">${upg.desc.replace(/ChillGPT/g, Game.state.aiName)}</div>
          <div class="card-badges">
            <span class="badge ${upg.badgeClass}">${upg.badge}</span>
            ${locked ? `<span class="badge badge-red">UNLOCKS ${upg.requireYear}</span>` : ''}
          </div>
        </div>
        <div class="card-right">
          <button
            class="buy-btn ai-btn${owned ? ' owned-btn' : ''}${!canBuy && !owned ? ' cant-afford' : ''}"
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

  /** Render the Hire Staff tab */
  function _renderStaffTab(container) {
    _sectionTitle(container, '👥 HIRE STAFF');

    const owned   = Game.state.inventory ? (Game.state.inventory.workers || 0) : 0;
    const cost    = Game.getNextWorkerCost();
    const canBuy  = Game.state.money >= cost;
    const maxed   = _isMaxed('worker');

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
  }

  /**
   * Re-render only the buy-button states without rebuilding the whole shop.
   * Lightweight update called every tick.
   */
  function updateShopButtons() {
    $$('.buy-btn[data-hw]').forEach(btn => {
      const hw = HARDWARE.find(h => h.id === btn.dataset.hw);
      if (!hw) return;
      const locked  = Game.state.year < hw.requireYear;
      const cost    = Game.getNextHardwareCost(hw);
      const canBuy  = !locked && Game.state.money >= cost;
      const maxed   = _isMaxed(hw.id);

      btn.classList.toggle('cant-afford', !canBuy && !maxed);
      btn.classList.toggle('owned-btn', maxed);
      btn.disabled = locked || maxed;

      if (maxed) btn.textContent = 'MAX';
      else if (!locked) btn.textContent = Fmt.money(cost);
    });

    $$('.buy-btn[data-ai]').forEach(btn => {
      const upg   = AI_UPGRADES.find(u => u.id === btn.dataset.ai);
      if (!upg) return;
      const owned  = Game.state.unlockedUpgrades.includes(upg.id);
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
      const cost   = Game.getNextWorkerCost();
      const canBuy = Game.state.money >= cost;
      const maxed  = _isMaxed('worker');
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
    const rowBack  = $('machine-row-back');
    rowFront.innerHTML = '';
    rowBack.innerHTML  = '';

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
        cluster:   'blue',
        megaDC:    'green',
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
    $('next-year-label').textContent  = nextYear;

    const entries = _buildRankings(completedYear);
    const body    = $('arena-body');
    const rEmoji  = ['🥇', '🥈', '🥉', '4️⃣'];
    const rCls    = ['r1', 'r2', 'r3', 'r4'];

    body.innerHTML = entries.map((e, i) => {
      const statusText = e.isYou
        ? (i === 0 ? '⬆️ LEADING' : `⚠️ RANK #${i + 1}`)
        : _trendText(i);
      const nameColor = e.isYou ? 'var(--neon-green)' : 'var(--text-bright)';
      return `
        <tr class="${e.isYou ? 'arena-you' : ''}">
          <td class="arena-rank-cell ${rCls[i]}">${rEmoji[i]}</td>
          <td>${e.icon}
            <strong style="color:${nameColor}">${e.name}</strong>
            ${e.isYou ? '<span style="font-size:0.6rem;color:var(--text-muted)">(YOU)</span>' : ''}
          </td>
          <td class="arena-score-cell">${Fmt.num(e.score, 0)}</td>
          <td style="color:${e.isYou ? 'var(--neon-green)' : 'var(--text-muted)'};font-size:0.7rem">${statusText}</td>
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
      // Small delay before arena pops up
      setTimeout(() => showArena(prevYear, newYear), 400);
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
    const el    = _el('div', 'money-pop');
    el.textContent = text;
    el.style.left  = (28 + Math.random() * 42) + '%';
    el.style.top   = (35 + Math.random() * 25) + '%';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  /** Burst confetti particles in the factory area. */
  function spawnParticles() {
    const layer  = $('notif-layer');
    const colors = [
      'var(--neon-yellow)',
      'var(--neon-blue)',
      'var(--neon-green)',
      'var(--neon-purple)',
      'var(--neon-orange)',
    ];
    const count  = 20;

    for (let i = 0; i < count; i++) {
      const p = _el('div', 'particle');
      const angle = (Math.PI * 2 * i) / count;
      const dist  = 55 + Math.random() * 90;
      p.style.setProperty('--px', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--py', Math.sin(angle) * dist + 'px');
      p.style.left       = (42 + Math.random() * 14) + '%';
      p.style.top        = '60%';
      p.style.background = colors[i % colors.length];
      p.style.boxShadow  = `0 0 6px ${colors[i % colors.length]}`;
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
    flash.style.opacity    = big ? '0.12' : '0.07';
    setTimeout(() => { flash.style.opacity = '0'; }, 200);
  }


  // ── MASCOT ───────────────────────────────────────────────────────

  /**
   * Show a random quip in the mascot's speech bubble.
   */
  function mascotSpeak() {
    const speech = $('mascot-speech');
    const quip   = MASCOT_QUIPS[Math.floor(Math.random() * MASCOT_QUIPS.length)];
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
    mouth.style.width       = '38px';
    mouth.style.borderColor = 'var(--neon-yellow)';
    setTimeout(() => {
      mouth.style.width       = '';
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
    
    if (isServer && window.__phaserGame) {
      // Switch to the server scene first
      const sm = window.__phaserGame.scene;
      sm.switch('GameDevStoryScene', 'ServerRoomScene');
      sm.switch('GPUClusterRoomScene', 'ServerRoomScene');

      // Wait 1 second before processing the purchase to show the transition
      toast(`Accessing Server Room...`, 't-blue');
      setTimeout(() => {
        _performHardwareBuy(hwId);
      }, 1000);
    } else {
      _performHardwareBuy(hwId);
    }
  }

  function _performHardwareBuy(hwId) {
    const result = Game.buyHardware(hwId);
    if (result.ok) {
      renderMachines();
      renderShop();
      flash(result.bigUpgrade);
      if (result.bigUpgrade) mascotHappy(true);
      toast(result.message, 't-green');
      // Phaser SPAWN_MACHINE already fired from game.js
    } else {
      toast(result.message, 't-red');
    }
  }

  function handleBuyAI(upgradeId) {
    const result = Game.buyAIUpgrade(upgradeId);
    if (result.ok) {
      renderShop();
      flashScreen(true);
      mascotHappy(true);
      toast(result.message, 't-purple');
      // Phaser SPAWN_FEEDBACK already fired from game.js
    } else {
      toast(result.message, 't-red');
    }
  }

  /** Handle hiring a worker — updates state, visual room, and toast. */
  function handleHireWorker() {
    const result = Game.hireWorker();
    if (result.ok) {
      renderShop();
      flashScreen(false);
      mascotHappy(true);
      toast(result.message, 't-green');
      // Phaser SPAWN_WORKER already fired from game.js
    } else {
      toast(result.message, 't-red');
    }
  }

  // Alias for collect button (wired to onclick in HTML)
  function handleCollect() {
    const result = Game.collectMoney();
    if (result.ok) {
      spawnMoneyPop(`+${Fmt.money(result.amount)}`);
      spawnParticles();
      flashScreen(false);
      mascotHappy(false);
      mascotSpeak();
    } else {
      toast('No revenue yet! Buy hardware first.', '');
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


  // ── STAR FIELD INIT ──────────────────────────────────────────────

  function initStars() {
    const container = $('stars-container');
    for (let i = 0; i < 90; i++) {
      const star = _el('div', 'star');
      star.style.left = Math.random() * 100 + '%';
      star.style.top  = Math.random() * 65 + '%';
      star.style.setProperty('--dur',   (1.8 + Math.random() * 4) + 's');
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

    // Tick updates
    updateStats,
    updateShopButtons,

    // Full renders
    renderShop,
    renderMachines,
    updateLeaderboard,

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

    // Dev Mode
    activateDevMode,
    devSkipYear,
    devSetTier,

    // Mascot
    mascotSpeak,
    mascotHappy,

    // Notifications
    toast,
  };

})();

// ── Wire up collect button (HTML onclick calls Game.collectMoney but we want UI.handleCollect)
// Override the simple reference in index.html
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('collect-btn');
  if (btn) btn.onclick = () => UI.handleCollect();
});
