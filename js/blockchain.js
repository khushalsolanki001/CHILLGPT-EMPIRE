/**
 * blockchain.js
 * ─────────────────────────────────────────────────────────────────
 * MetaMask + Ethereum Sepolia testnet integration.
 *
 * SAVE STRATEGY (cross-browser / cross-device):
 *  • On connect  → auto-load on-chain save (silent, no prompt to dismiss)
 *  • Periodic    → auto-save to chain every CHAIN_SAVE_INTERVAL_MS (5 min)
 *                  piggybacking on the existing local-save timer
 *  • Manual      → "SAVE TO CHAIN" button in settings for immediate save
 *
 * OTHER FEATURES:
 *  • Balance check on connect — shows low-ETH modal if < 0.01 ETH
 *  • First-time MetaMask bonus: +$500K cash + permanent +20% TF rate
 *  • Auto-starts the game after successful wallet connect
 *  • Mascot announcement of the one-time bonus
 *
 * CONTRACT: ChillGPTSave.sol (deployed on Sepolia)
 * ─────────────────────────────────────────────────────────────────
 *
 * Solidity Contract (for reference):
 * ───────────────────────────────────────────────────────────────
 * // SPDX-License-Identifier: MIT
 * pragma solidity ^0.8.0;
 * contract ChillGPTSave {
 *   mapping(address => string) private _saves;
 *   event ProgressSaved(address indexed player, uint256 timestamp);
 *   function saveProgress(string calldata data) external {
 *     _saves[msg.sender] = data;
 *     emit ProgressSaved(msg.sender, block.timestamp);
 *   }
 *   function loadProgress(address player) external view returns (string memory) {
 *     return _saves[player];
 *   }
 * }
 * ─────────────────────────────────────────────────────────────────
 */

const Blockchain = (() => {

  // ── CONFIG ───────────────────────────────────────────────────────

  const CONTRACT_ADDRESS = '0xeF21263D9AA5392315464894c09d4962642D8bfA';
  const SEPOLIA_CHAIN_ID = '0xaa36a7';

  const CONTRACT_ABI = [
    'function saveProgress(string calldata data) external',
    'function loadProgress(address player) external view returns (string memory)',
  ];

  // ── $TF TOKEN CONTRACT ────────────────────────────────────────────
  // ⚠️  Deploy ChillGPTTF.sol on Sepolia and paste the address below:
  const TF_TOKEN_ADDRESS = '0x94750697819A66A032e2e2953bD2A3249213D87D'; // TODO: update after deploy

  const TF_TOKEN_ABI = [
    'function claimTF(uint256 amount) external',
    'function burnTF(uint256 amount) external',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
  ];

  // Exchange rates (game-tunable)
  const TF_CASH_BUY_RATE = 1_000;  // $1000 cash  → 1 $TF minted
  const TF_CASH_SELL_RATE = 800;    // 1 $TF burned → $800 cash

  // MetaMask one-time bonus
  const BONUS_CASH = 500_000;
  const BONUS_TF_MULT = 1.2;

  // Minimum Sepolia ETH to use blockchain saves
  const MIN_ETH = 0.01;


  // ── STATE ────────────────────────────────────────────────────────

  let _provider = null;
  let _signer = null;
  let _contract = null;    // ChillGPTSave
  let _tfContract = null;    // ChillGPTTF ($TF token)
  let _address = null;
  let _connected = false;

  // ── HELPERS ──────────────────────────────────────────────────────

  function _isMetaMaskInstalled() {
    return typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask;
  }

  function _updateUI(status, address) {
    const btn = document.getElementById('signin-btn');
    const indicator = document.getElementById('wallet-indicator');
    const addrEl = document.getElementById('wallet-address-display');

    if (btn) {
      if (address) {
        btn.textContent = `🦊 ${address.slice(0, 6)}...${address.slice(-4)}`;
        btn.style.background = 'linear-gradient(135deg, #27ae60, #1e8449)';
        btn.style.borderColor = '#1a5010';
      } else {
        btn.textContent = status;
        btn.style.background = '';
        btn.style.borderColor = '';
      }
    }

    if (indicator) {
      indicator.style.background = address
        ? '#27ae60'
        : (status.includes('...') ? '#f39c12' : '#e74c3c');
    }

    if (addrEl) {
      addrEl.textContent = address
        ? `CONNECTED: ${address.slice(0, 6)}...${address.slice(-4)}`
        : status;
    }
  }

  function _showNotice(msg, type = 'info') {
    if (typeof UI !== 'undefined' && UI.toast) {
      const cls = type === 'success' ? 't-green' : type === 'error' ? 't-red' : '';
      UI.toast(msg, cls);
    } else {
      console.log('[Blockchain]', msg);
    }
  }

  // ── LOADING OVERLAY ──────────────────────────────────────────────

  function _showLoadingOverlay(msg) {
    let el = document.getElementById('bc-loading-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bc-loading-overlay';
      el.style.cssText = `
        position:fixed; inset:0; z-index:199999;
        background:rgba(10,8,20,0.88);
        backdrop-filter:blur(8px);
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        font-family:var(--font-pixel,'Press Start 2P',monospace);
        gap:24px;
      `;
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div style="font-size:2.5rem; animation:loadSpin 1.2s linear infinite;">⛓️</div>
      <div style="font-size:0.45rem; color:#f39c12; letter-spacing:2px; text-align:center; line-height:2;">${msg}</div>
      <div style="font-size:0.28rem; color:rgba(255,255,255,0.35); font-family:var(--font-mono,'Share Tech Mono',monospace);">SEPOLIA TESTNET</div>
    `;
    if (!document.getElementById('bc-loading-style')) {
      const s = document.createElement('style');
      s.id = 'bc-loading-style';
      s.textContent = `@keyframes loadSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`;
      document.head.appendChild(s);
    }
    el.style.display = 'flex';
  }

  function _hideLoadingOverlay() {
    const el = document.getElementById('bc-loading-overlay');
    if (el) el.style.display = 'none';
  }

  // ── NETWORK ──────────────────────────────────────────────────────

  async function _ensureSepolia() {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== SEPOLIA_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: SEPOLIA_CHAIN_ID }],
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: SEPOLIA_CHAIN_ID,
              chainName: 'Sepolia Testnet',
              nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.sepolia.org'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            }],
          });
        } else {
          throw switchErr;
        }
      }
    }
  }

  // ── BALANCE CHECK ────────────────────────────────────────────────

  async function _getSepoliaBalance(address) {
    try {
      const balHex = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      return Number(BigInt(balHex)) / 1e18;
    } catch (err) {
      console.warn('[Blockchain] Could not fetch balance:', err);
      return null;
    }
  }

  function _showLowEthModal(address, balEth) {
    const modal = document.getElementById('low-eth-modal');
    const addrEl = document.getElementById('low-eth-addr');
    const balEl = document.getElementById('low-eth-balance');
    if (!modal) return;
    if (addrEl) addrEl.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
    if (balEl) balEl.textContent = `${balEth !== null ? balEth.toFixed(4) : '?.???'} ETH`;
    modal.style.display = 'flex';
  }

  function _continueAfterLowEth() {
    _finishConnect();
  }

  // ── AUTO-LOAD FROM CHAIN ──────────────────────────────────────────

  /**
   * After connecting, silently try to load on-chain save.
   * If found → merge & reload. If not → continue with local/fresh save.
   * This is the key fix: no dismissible toast, just actually loads it.
   */
  async function _autoLoadOnConnect() {
    if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return;

    _showLoadingOverlay('LOADING YOUR CLOUD SAVE...');

    try {
      // Use MetaMask's own provider for reads — avoids CORS issues with public RPCs
      const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, _provider);
      const raw = await readContract.loadProgress(_address);

      _hideLoadingOverlay();

      if (!raw || raw.trim() === '') {
        // No on-chain save found — start fresh / use local save
        console.log('[Blockchain] No on-chain save found for this wallet. Starting fresh.');
        _showNotice('🆕 No cloud save found — starting fresh on this wallet.', 'info');
        return;
      }

      // Found a save — load it
      let saved;
      try {
        saved = JSON.parse(raw);
      } catch (e) {
        console.warn('[Blockchain] Could not parse on-chain save:', e);
        _showNotice('⚠️ Cloud save corrupted, using local data.', 'error');
        return;
      }

      // Merge into game state
      if (typeof Game !== 'undefined' && typeof Game.createDefaults === 'function') {
        Game.state = deepMerge(Game.createDefaults(), saved);
      } else if (typeof Game !== 'undefined') {
        Object.assign(Game.state, saved);
      }

      // Also persist locally
      if (typeof Save !== 'undefined') Save.save();

      _showNotice('☁️ Cloud save loaded! Progress restored from blockchain.', 'success');
      console.log('[Blockchain] On-chain save loaded successfully.');

      // ── KEY FIX: dismiss onboarding modal if player data already exists ──
      // The onboarding check in main.js fires at 500ms, but chain load takes
      // ~900ms+, so we need to explicitly close it here after the data arrives.
      const playerName = Game.state.playerName;
      if (playerName && playerName.trim().length > 0 && playerName !== 'CEO') {
        // Hide onboarding
        const obModal = document.getElementById('onboarding-modal');
        if (obModal) obModal.classList.remove('show');

        // Also clear the tutorial pointer if it's still visible from the
        // onboarding step that may have already triggered
        const pointer = document.getElementById('tutorial-pointer');
        if (pointer) pointer.remove();
        document.querySelectorAll('.tutorial-target')
          .forEach(el => el.classList.remove('tutorial-target'));
      }

      // Refresh UI with loaded state (name, stats, shop, machines)
      if (typeof UI !== 'undefined') {
        UI.updateStats();
        UI.renderShop();
        UI.renderMachines();
        // Update start-screen teaser visibility for returning players
        if (typeof UI.initStartScreen === 'function') UI.initStartScreen();
      }

      // Update AI name label in header immediately
      const logoName = document.getElementById('logo-ai-name');
      if (logoName && Game.state.aiName) logoName.textContent = Game.state.aiName;

    } catch (err) {
      _hideLoadingOverlay();
      console.warn('[Blockchain] Auto-load failed (RPC issue?):', err);
      // Don't block the game — just continue with whatever state we have
      _showNotice('⚠️ Could not reach Sepolia RPC. Using local save.', 'error');
    }
  }

  // ── ONE-TIME METAMASK BONUS ───────────────────────────────────────

  function _applyMetaMaskBonus() {
    if (!Game || !Game.state) return;
    if (Game.state.metamaskBoostClaimed) return;

    Game.state.money += BONUS_CASH;
    Game.state.totalMoneyEarned += BONUS_CASH;
    Game.state.metamaskTfMult = BONUS_TF_MULT;
    Game.state.metamaskBoostClaimed = true;

    if (typeof Save !== 'undefined') Save.save();

    _showNotice('🦊 MetaMask Bonus! +$500K & +20% permanent TF boost!', 'success');

    setTimeout(() => {
      if (typeof UI !== 'undefined' && UI.mascotAnnounce) {
        UI.mascotAnnounce(
          '🦊 WELCOME, WEB3 CEO! You got +$500K & +20% TF rate — FOREVER! 🚀',
          8000
        );
        if (UI.mascotHappy) UI.mascotHappy(false);
      }
    }, 1200);

    console.log('[Blockchain] MetaMask first-time bonus applied: +$500K, +20% TF');
  }

  // ── CHAIN SAVE BADGE ─────────────────────────────────────────────

  function _updateChainSaveBadge(status) {
    let badge = document.getElementById('chain-save-badge');
    if (!badge) return;
    const configs = {
      idle: { icon: '⛓️', text: 'CHAIN SAVE ON', color: '#27ae60' },
      saving: { icon: '⏳', text: 'SAVING...', color: '#f39c12' },
      saved: { icon: '✅', text: 'CHAIN SAVED', color: '#27ae60' },
      error: { icon: '❌', text: 'SAVE FAILED', color: '#e74c3c' },
    };
    const c = configs[status] || configs.idle;
    badge.innerHTML = `<span>${c.icon}</span> <span style="color:${c.color}">${c.text}</span>`;
  }



  // ── CONNECT FLOW ─────────────────────────────────────────────────

  function _finishConnect() {
    _updateUI('', _address);
    _showNotice(
      `✅ Wallet connected! ${_address.slice(0, 6)}...${_address.slice(-4)} on Sepolia`,
      'success'
    );

    // Show the in-game chain-save badge
    const badge = document.getElementById('chain-save-badge');
    if (badge) badge.style.display = 'flex';

    // Show MetaMask-only UI elements
    const claimBtn = document.getElementById('claim-tf-btn');
    if (claimBtn) claimBtn.style.display = 'flex';
    const onchainPill = document.getElementById('onchain-tf-pill');
    if (onchainPill) onchainPill.style.display = '';
    const exchangeSection = document.getElementById('tf-exchange-section');
    if (exchangeSection) exchangeSection.style.display = 'flex';
    const cloudSaveSection = document.getElementById('cloud-save-section');
    if (cloudSaveSection) cloudSaveSection.style.display = 'flex';

    // Auto-start the game
    if (typeof UI !== 'undefined' && UI.startGame) {
      UI.startGame();
    }

    // Apply the one-time MetaMask bonus (only if not yet claimed)
    _applyMetaMaskBonus();

    // Refresh on-chain TF display (delayed so contract is ready)
    setTimeout(() => _updateOnChainTFDisplay(), 1500);

    // KEY FIX: Auto-load on-chain save
    // Small delay so the start-screen fade-out happens first
    setTimeout(() => _autoLoadOnConnect(), 900);
  }

  async function connect() {
    if (!_isMetaMaskInstalled()) {
      _showNotice('MetaMask not found! Install it at metamask.io', 'error');
      window.open('https://metamask.io/download/', '_blank');
      return false;
    }

    _updateUI('🦊 CONNECTING...', null);

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        _showNotice('No accounts found. Please unlock MetaMask.', 'error');
        _updateUI('🦊 CONNECT & START', null);
        return false;
      }

      await _ensureSepolia();

      _address = accounts[0];
      _connected = true;

      _provider = new ethers.BrowserProvider(window.ethereum);
      _signer = await _provider.getSigner();
      _contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, _signer);

      // Init $TF token contract if deployed
      if (TF_TOKEN_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        _tfContract = new ethers.Contract(TF_TOKEN_ADDRESS, TF_TOKEN_ABI, _signer);
      }

      window.ethereum.on('accountsChanged', (accs) => {
        if (!accs.length) { disconnect(); } else { _address = accs[0]; _updateUI('', _address); }
      });
      window.ethereum.on('chainChanged', () => window.location.reload());

      // Check balance
      const balEth = await _getSepoliaBalance(_address);
      const isLow = balEth !== null && balEth < MIN_ETH;

      if (isLow) {
        _showLowEthModal(_address, balEth);
        _updateUI('', _address);
        _showNotice(`⚠️ Low Sepolia ETH (${balEth.toFixed(4)} ETH). Get more from faucet.`, 'error');
        return true;
      }

      _finishConnect();
      return true;

    } catch (err) {
      if (err.code === 4001) {
        _showNotice('Wallet connection cancelled.', 'error');
      } else {
        _showNotice(`Connection error: ${err.message}`, 'error');
        console.error('[Blockchain] connect error:', err);
      }
      _updateUI('🦊 CONNECT & START', null);
      return false;
    }
  }

  function disconnect() {
    _provider = null;
    _signer = null;
    _contract = null;
    _address = null;
    _connected = false;
    _updateUI('🦊 CONNECT & START', null);
    _showNotice('Wallet disconnected.', 'info');
    const badge = document.getElementById('chain-save-badge');
    if (badge) badge.style.display = 'none';
  }

  // ── MANUAL SAVE ON-CHAIN ─────────────────────────────────────────

  async function saveOnChain() {
    if (!_connected || !_contract) {
      _showNotice('Connect your wallet first!', 'error');
      return false;
    }

    if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      _showNotice('⚠️ No contract deployed yet. Using local save.', 'error');
      if (typeof Save !== 'undefined') Save.save();
      return false;
    }

    _updateChainSaveBadge('saving');
    _showNotice('⛓️ Sending save transaction to Sepolia...', 'info');

    try {
      const stateJson = JSON.stringify(Game.state);
      const tx = await _contract.saveProgress(stateJson);
      _showNotice(`⏳ Transaction sent! Waiting for confirmation...`, 'info');
      await tx.wait();

      _updateChainSaveBadge('saved');
      setTimeout(() => _updateChainSaveBadge('idle'), 10000);

      _showNotice(`✅ Progress saved on-chain! Tx: ${tx.hash.slice(0, 10)}...`, 'success');
      console.log('[Blockchain] Manual save tx confirmed:', tx.hash);

      if (typeof Save !== 'undefined') Save.save();
      return true;

    } catch (err) {
      _updateChainSaveBadge('error');
      setTimeout(() => _updateChainSaveBadge('idle'), 8000);
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        _showNotice('❌ Transaction rejected by user.', 'error');
      } else {
        _showNotice(`❌ Save failed: ${err.message?.slice(0, 60)}`, 'error');
        console.error('[Blockchain] saveOnChain error:', err);
      }
      return false;
    }
  }

  // ── MANUAL LOAD FROM CHAIN ────────────────────────────────────────

  async function loadFromChain() {
    if (!_connected || !_address) {
      _showNotice('Connect your wallet first!', 'error');
      return false;
    }

    if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      _showNotice('⚠️ No contract deployed yet.', 'error');
      return false;
    }

    _showLoadingOverlay('LOADING CLOUD SAVE...');

    try {
      // Use MetaMask's own provider for reads — avoids CORS issues with public RPCs
      const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, _provider);
      const raw = await readContract.loadProgress(_address);

      _hideLoadingOverlay();

      if (!raw || raw.trim() === '') {
        _showNotice('No on-chain save found for this wallet.', 'info');
        return false;
      }

      const saved = JSON.parse(raw);
      Game.state = typeof Game.createDefaults === 'function'
        ? deepMerge(Game.createDefaults(), saved)
        : Object.assign(Game.state, saved);

      if (typeof Save !== 'undefined') Save.save();

      _showNotice('✅ On-chain save loaded!', 'success');
      window.location.reload();
      return true;

    } catch (err) {
      _hideLoadingOverlay();
      _showNotice(`❌ Load failed: ${err.message?.slice(0, 60)}`, 'error');
      console.error('[Blockchain] loadFromChain error:', err);
      return false;
    }
  }

  // ── $TF TOKEN FUNCTIONS ───────────────────────────────────────────

  function _hasTfContract() {
    return _tfContract !== null &&
      TF_TOKEN_ADDRESS !== '0x0000000000000000000000000000000000000000';
  }

  /**
   * Get the player's on-chain $TF wallet balance.
   * Returns 0 if not connected or contract not deployed.
   */
  async function getOnChainTFBalance() {
    if (!_connected || !_hasTfContract() || !_address) return 0;
    try {
      const bal = await _tfContract.balanceOf(_address);
      return Number(bal); // decimals=0, so this is safe
    } catch (e) {
      console.warn('[Blockchain] Could not fetch $TF balance:', e);
      return 0;
    }
  }

  /**
   * Claim all local TF to the wallet as on-chain $TF tokens.
   * After success: resets local TF bucket to 0.
   * Only available to MetaMask-connected players.
   */
  async function claimTF() {
    if (!_connected) {
      _showNotice('Connect MetaMask to claim $TF!', 'error');
      return false;
    }
    if (!_hasTfContract()) {
      _showNotice('⚠️ $TF contract not deployed yet. Update TF_TOKEN_ADDRESS in blockchain.js', 'error');
      return false;
    }

    const localTF = Math.floor(Game.state.tf || 0);
    if (localTF <= 0) {
      _showNotice('No local TF to claim! Generate more compute first.', 'error');
      return false;
    }

    _showNotice(`⛓️ Minting ${localTF.toLocaleString()} $TF to your wallet...`, 'info');
    try {
      const tx = await _tfContract.claimTF(localTF);
      _showNotice('⏳ Minting transaction sent...', 'info');
      await tx.wait();

      // Reset local TF bucket to 0
      Game.state.tf = 0;
      if (typeof Save !== 'undefined') Save.save();

      // Update the on-chain TF display
      _updateOnChainTFDisplay();

      _showNotice(`✅ ${localTF.toLocaleString()} $TF minted to your wallet!`, 'success');
      console.log('[Blockchain] Claimed', localTF, '$TF on-chain, tx:', tx.hash);

      // Mascot celebrate
      if (typeof UI !== 'undefined' && UI.mascotAnnounce) {
        UI.mascotAnnounce(`🧠 ${localTF.toLocaleString()} $TF minted to your MetaMask! 🚀`, 5000);
      }
      return true;
    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        _showNotice('❌ Mint cancelled.', 'error');
      } else {
        _showNotice(`❌ Mint failed: ${err.message?.slice(0, 60)}`, 'error');
        console.error('[Blockchain] claimTF error:', err);
      }
      return false;
    }
  }

  /**
   * Burn on-chain $TF for an AI Tech upgrade.
   * Called before Game.buyAIUpgradeChain() for MetaMask users.
   * @param {number} tfAmount - whole TF units to burn
   */
  async function burnTFForUpgrade(tfAmount) {
    if (!_connected || !_hasTfContract()) {
      _showNotice('Connect MetaMask to use on-chain upgrades!', 'error');
      return false;
    }

    const balance = await getOnChainTFBalance();
    if (balance < tfAmount) {
      _showNotice(
        `❌ Need ${tfAmount.toLocaleString()} $TF in wallet (you have ${balance.toLocaleString()}). Claim your local TF first!`,
        'error'
      );
      return false;
    }

    _showNotice(`🔥 Burning ${tfAmount.toLocaleString()} $TF for upgrade...`, 'info');
    try {
      const tx = await _tfContract.burnTF(tfAmount);
      _showNotice('⏳ Burn transaction sent...', 'info');
      await tx.wait();
      _updateOnChainTFDisplay();
      _showNotice(`✅ ${tfAmount.toLocaleString()} $TF burned! Upgrade unlocked.`, 'success');
      console.log('[Blockchain] Burned', tfAmount, '$TF, tx:', tx.hash);
      return true;
    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        _showNotice('❌ Burn cancelled.', 'error');
      } else {
        _showNotice(`❌ Burn failed: ${err.message?.slice(0, 60)}`, 'error');
        console.error('[Blockchain] burnTFForUpgrade error:', err);
      }
      return false;
    }
  }

  /**
   * Exchange: Buy $TF with local cash (mint on-chain).
   * @param {number} tfAmount - whole TF units to buy
   */
  async function buyTFWithCash(tfAmount) {
    if (!_connected || !_hasTfContract()) {
      _showNotice('Connect MetaMask to use the exchange!', 'error');
      return false;
    }
    const cashCost = tfAmount * TF_CASH_BUY_RATE;
    if (Game.state.money < cashCost) {
      _showNotice(`❌ Need ${Fmt.money(cashCost)} cash to buy ${tfAmount} $TF.`, 'error');
      return false;
    }
    try {
      const tx = await _tfContract.claimTF(tfAmount);
      await tx.wait();
      Game.state.money -= cashCost;
      if (typeof Save !== 'undefined') Save.save();
      _updateOnChainTFDisplay();
      _showNotice(`✅ Bought ${tfAmount} $TF for ${Fmt.money(cashCost)}!`, 'success');
      return true;
    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        _showNotice('❌ Purchase cancelled.', 'error');
      } else {
        _showNotice(`❌ Purchase failed: ${err.message?.slice(0, 60)}`, 'error');
      }
      return false;
    }
  }

  /**
   * Exchange: Sell $TF for local cash (burn on-chain).
   * @param {number} tfAmount - whole TF units to sell
   */
  async function sellTFForCash(tfAmount) {
    if (!_connected || !_hasTfContract()) {
      _showNotice('Connect MetaMask to use the exchange!', 'error');
      return false;
    }
    const balance = await getOnChainTFBalance();
    if (balance < tfAmount) {
      _showNotice(`❌ You only have ${balance} $TF in wallet.`, 'error');
      return false;
    }
    try {
      const tx = await _tfContract.burnTF(tfAmount);
      await tx.wait();
      const cashGain = tfAmount * TF_CASH_SELL_RATE;
      Game.state.money += cashGain;
      Game.state.totalMoneyEarned += cashGain;
      if (typeof Save !== 'undefined') Save.save();
      _updateOnChainTFDisplay();
      _showNotice(`✅ Sold ${tfAmount} $TF for ${Fmt.money(cashGain)}!`, 'success');
      return true;
    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        _showNotice('❌ Sale cancelled.', 'error');
      } else {
        _showNotice(`❌ Sale failed: ${err.message?.slice(0, 60)}`, 'error');
      }
      return false;
    }
  }

  /**
   * Refresh the on-chain $TF balance display in the stat bar.
   */
  async function _updateOnChainTFDisplay() {
    const el = document.getElementById('stat-onchain-tf');
    if (!el) return;
    if (!_connected || !_hasTfContract()) {
      el.closest('.stat-pill')?.style && (el.closest('.stat-pill').style.display = 'none');
      return;
    }
    const bal = await getOnChainTFBalance();
    el.textContent = Fmt.num(bal) + ' $TF';
    const pill = el.closest('.stat-pill');
    if (pill) pill.style.display = '';
  }

  // ── GETTERS ───────────────────────────────────────────────────────

  function isConnected() { return _connected; }
  function getAddress() { return _address; }

  // ── PUBLIC API ────────────────────────────────────────────────────

  return {
    connect,
    disconnect,
    saveOnChain,
    loadFromChain,
    isConnected,
    getAddress,
    // $TF token
    claimTF,
    burnTFForUpgrade,
    buyTFWithCash,
    sellTFForCash,
    getOnChainTFBalance,
    refreshTFDisplay: _updateOnChainTFDisplay,
    hasTfContract: _hasTfContract,
    // internal
    _continueAfterLowEth,
  };

})();

// ── deepMerge helper ──────────────────────────────────────────────
function deepMerge(target, source) {
  const out = Object.assign({}, target);
  if (typeof source !== 'object' || source === null) return out;
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}
