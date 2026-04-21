/**
 * blockchain.js
 * ─────────────────────────────────────────────────────────────────
 * MetaMask + Ethereum Sepolia testnet integration.
 * Allows players to save/load their full game state on-chain.
 *
 * NEW FEATURES:
 *  • Balance check on connect — shows low-ETH modal if < 0.01 ETH
 *  • First-time MetaMask bonus: +$500K cash + permanent +20% TF rate
 *  • Auto-starts the game after successful wallet connect
 *  • Mascot announcement of the one-time bonus
 *
 * CONTRACT: ChillGPTSave.sol (deployed on Sepolia)
 * ─────────────────────────────────────────────────────────────────
 *
 * Solidity Contract (for reference — deploy this on Sepolia):
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
 * ───────────────────────────────────────────────────────────────
 * After deploying, replace CONTRACT_ADDRESS below with your address.
 * ─────────────────────────────────────────────────────────────────
 */

const Blockchain = (() => {

  // ── CONFIG ───────────────────────────────────────────────────────

  // ⚠️ Replace with your deployed Sepolia contract address:
  const CONTRACT_ADDRESS = '0xeF21263D9AA5392315464894c09d4962642D8bfA';

  const SEPOLIA_CHAIN_ID = '0xaa36a7'; // Sepolia testnet

  const CONTRACT_ABI = [
    'function saveProgress(string calldata data) external',
    'function loadProgress(address player) external view returns (string memory)',
  ];

  // MetaMask one-time bonus values
  const BONUS_CASH    = 500_000;   // $500K
  const BONUS_TF_MULT = 1.2;       // +20% TF generation (permanent multiplier)

  // Minimum ETH required on Sepolia to use blockchain saves
  const MIN_ETH = 0.01;

  // ── STATE ────────────────────────────────────────────────────────

  let _provider = null;
  let _signer   = null;
  let _contract = null;
  let _address  = null;
  let _connected = false;
  let _pendingGameStart = false; // whether to auto-start game after connect

  // ── HELPERS ──────────────────────────────────────────────────────

  function _isMetaMaskInstalled() {
    return typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask;
  }

  function _updateUI(status, address) {
    const btn       = document.getElementById('signin-btn');
    const indicator = document.getElementById('wallet-indicator');
    const addrEl    = document.getElementById('wallet-address-display');

    if (btn) {
      if (address) {
        btn.textContent = `🦊 ${address.slice(0, 6)}...${address.slice(-4)}`;
        btn.style.background   = 'linear-gradient(135deg, #27ae60, #1e8449)';
        btn.style.borderColor  = '#1a5010';
      } else {
        btn.textContent = status;
        btn.style.background  = '';
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
          // Add Sepolia if not present in wallet
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

  /**
   * Fetch the ETH balance (in ether units) for the connected wallet on Sepolia.
   * Returns null on failure.
   */
  async function _getSepoliaBalance(address) {
    try {
      const balHex = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      // balHex is in wei (hex). Convert to ether.
      const balWei  = BigInt(balHex);
      const balEth  = Number(balWei) / 1e18;
      return balEth;
    } catch (err) {
      console.warn('[Blockchain] Could not fetch balance:', err);
      return null;
    }
  }

  /**
   * Show the low-ETH warning modal.
   */
  function _showLowEthModal(address, balEth) {
    const modal   = document.getElementById('low-eth-modal');
    const addrEl  = document.getElementById('low-eth-addr');
    const balEl   = document.getElementById('low-eth-balance');
    if (!modal) return;

    if (addrEl) addrEl.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
    if (balEl)  balEl.textContent  = `${balEth !== null ? balEth.toFixed(4) : '?.???'} ETH`;

    modal.style.display = 'flex';
  }

  /**
   * Called by the "CONTINUE ANYWAY" button inside the low-ETH modal
   * so game start proceeds even with low balance.
   */
  function _continueAfterLowEth() {
    _finishConnect();
  }

  // ── ONE-TIME METAMASK BONUS ───────────────────────────────────────

  /**
   * Grant the first-time MetaMask bonus if not already claimed.
   * • +$500,000 cash
   * • Permanent +20% TF generation rate
   * Also triggers a mascot announcement.
   */
  function _applyMetaMaskBonus() {
    if (!Game || !Game.state) return;
    if (Game.state.metamaskBoostClaimed) return; // already claimed — skip

    // Apply cash bonus
    Game.state.money              += BONUS_CASH;
    Game.state.totalMoneyEarned   += BONUS_CASH;

    // Apply permanent TF multiplier
    Game.state.metamaskTfMult = BONUS_TF_MULT;

    // Mark as claimed (persisted in save)
    Game.state.metamaskBoostClaimed = true;

    // Save immediately
    if (typeof Save !== 'undefined') Save.save();

    // Toast notification
    _showNotice(`🦊 MetaMask Bonus! +$500K & +20% permanent TF boost!`, 'success');

    // Mascot announcement — slightly delayed so start-screen fades first
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

  // ── CONNECT FLOW ─────────────────────────────────────────────────

  /**
   * Finalise the connection after all checks pass.
   * Starts the game, checks for on-chain save.
   */
  function _finishConnect() {
    _updateUI('', _address);
    _showNotice(
      `✅ Wallet connected! ${_address.slice(0, 6)}...${_address.slice(-4)} on Sepolia`,
      'success'
    );

    // Auto-start the game
    if (typeof UI !== 'undefined' && UI.startGame) {
      UI.startGame();
    }

    // Apply the one-time MetaMask bonus
    _applyMetaMaskBonus();

    // Auto-offer to load save if one exists
    _checkForOnChainSave();
  }

  /**
   * Main connect flow — called from the start screen "CONNECT WALLET" button.
   * After connecting:
   *   1. Validates Sepolia network
   *   2. Checks ETH balance
   *   3. Shows low-ETH modal if < MIN_ETH (user can still continue)
   *   4. Auto-starts the game
   *   5. Grants one-time MetaMask bonus (first connect only)
   */
  async function connect() {
    if (!_isMetaMaskInstalled()) {
      _showNotice('MetaMask not found! Install it at metamask.io', 'error');
      window.open('https://metamask.io/download/', '_blank');
      return false;
    }

    _updateUI('🦊 CONNECTING...', null);

    try {
      // Request accounts
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        _showNotice('No accounts found. Please unlock MetaMask.', 'error');
        _updateUI('🦊 CONNECT WALLET', null);
        return false;
      }

      // Switch to Sepolia
      await _ensureSepolia();

      _address   = accounts[0];
      _connected = true;

      // ethers.js — loaded from CDN in index.html
      _provider = new ethers.BrowserProvider(window.ethereum);
      _signer   = await _provider.getSigner();
      _contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, _signer);

      // Listen for account/chain changes
      window.ethereum.on('accountsChanged', (accs) => {
        if (!accs.length) { disconnect(); } else { _address = accs[0]; _updateUI('', _address); }
      });
      window.ethereum.on('chainChanged', () => window.location.reload());

      // ── CHECK BALANCE ────────────────────────────────────────────
      const balEth = await _getSepoliaBalance(_address);
      const isLow  = balEth !== null && balEth < MIN_ETH;

      if (isLow) {
        // Show the low-ETH modal — user can dismiss and continue, or get ETH first
        _showLowEthModal(_address, balEth);
        // _finishConnect() will be called by "CONTINUE ANYWAY" button
        // OR if user closes the modal manually, nothing happens until they click it.
        // We still update the UI so the button shows as connected.
        _updateUI('', _address);
        _showNotice(`⚠️ Low Sepolia ETH (${balEth.toFixed(4)} ETH). Get more from faucet.`, 'error');
        return true; // connected but warned
      }

      // All good — proceed normally
      _finishConnect();
      return true;

    } catch (err) {
      if (err.code === 4001) {
        _showNotice('Wallet connection cancelled.', 'error');
      } else {
        _showNotice(`Connection error: ${err.message}`, 'error');
        console.error('[Blockchain] connect error:', err);
      }
      _updateUI('🦊 CONNECT WALLET', null);
      return false;
    }
  }

  function disconnect() {
    _provider  = null;
    _signer    = null;
    _contract  = null;
    _address   = null;
    _connected = false;
    _updateUI('🦊 CONNECT WALLET', null);
    _showNotice('Wallet disconnected.', 'info');
  }

  // ── SAVE ON-CHAIN ─────────────────────────────────────────────────

  /**
   * Saves the full game state to the Sepolia smart contract.
   * This is a WRITE transaction and requires a small amount of SepoliaETH for gas.
   * Get free SepoliaETH from: https://cloud.google.com/application/web3/faucet/ethereum/sepolia
   */
  async function saveOnChain() {
    if (!_connected || !_contract) {
      _showNotice('Connect your wallet first!', 'error');
      return false;
    }

    // Placeholder check — no real contract yet
    if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      _showNotice('⚠️ No contract deployed yet. Using local save.', 'error');
      if (typeof Save !== 'undefined') Save.save();
      return false;
    }

    _showNotice('⛓️ Sending save transaction to Sepolia...', 'info');

    try {
      // Compress game state to JSON string
      const stateJson = JSON.stringify(Game.state);

      const tx = await _contract.saveProgress(stateJson);
      _showNotice(`⏳ Transaction sent! Waiting for confirmation...`, 'info');

      await tx.wait(); // Wait for block confirmation

      _showNotice(`✅ Progress saved on-chain! Tx: ${tx.hash.slice(0, 10)}...`, 'success');
      console.log('[Blockchain] Save tx confirmed:', tx.hash);

      // Also save locally for offline fallback
      if (typeof Save !== 'undefined') Save.save();
      return true;

    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        _showNotice('❌ Transaction rejected by user.', 'error');
      } else {
        _showNotice(`❌ Save failed: ${err.message?.slice(0, 60)}`, 'error');
        console.error('[Blockchain] saveOnChain error:', err);
      }
      return false;
    }
  }

  // ── LOAD FROM CHAIN ───────────────────────────────────────────────

  /**
   * Loads game state from the on-chain save. FREE to call (read-only).
   */
  async function loadFromChain() {
    if (!_connected || !_contract || !_address) {
      _showNotice('Connect your wallet first!', 'error');
      return false;
    }

    if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      _showNotice('⚠️ No contract deployed yet.', 'error');
      return false;
    }

    _showNotice('📖 Loading your on-chain save...', 'info');

    try {
      // Use a read-only provider for free load
      const readProvider = new ethers.JsonRpcProvider('https://rpc.sepolia.org');
      const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);

      const raw = await readContract.loadProgress(_address);

      if (!raw || raw.trim() === '') {
        _showNotice('No on-chain save found for this wallet.', 'info');
        return false;
      }

      const saved = JSON.parse(raw);
      Game.state = typeof Game.createDefaults === 'function'
        ? deepMerge(Game.createDefaults(), saved)
        : Object.assign(Game.state, saved);

      // Persist locally too
      if (typeof Save !== 'undefined') Save.save();

      _showNotice('✅ On-chain save loaded!', 'success');
      window.location.reload(); // Restart with the loaded state
      return true;

    } catch (err) {
      _showNotice(`❌ Load failed: ${err.message?.slice(0, 60)}`, 'error');
      console.error('[Blockchain] loadFromChain error:', err);
      return false;
    }
  }

  // ── AUTO-CHECK ────────────────────────────────────────────────────

  async function _checkForOnChainSave() {
    if (!_connected || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return;
    try {
      const readProvider = new ethers.JsonRpcProvider('https://rpc.sepolia.org');
      const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
      const raw = await readContract.loadProgress(_address);
      if (raw && raw.trim() !== '') {
        // Prompt user to load their cloud save
        if (typeof UI !== 'undefined') {
          UI.showBlockchainLoadPrompt();
        }
      }
    } catch (_) { /* silent — don't break game if RPC fails */ }
  }

  // ── GETTERS ───────────────────────────────────────────────────────

  function isConnected() { return _connected; }
  function getAddress()  { return _address; }

  // ── PUBLIC API ────────────────────────────────────────────────────

  return {
    connect,
    disconnect,
    saveOnChain,
    loadFromChain,
    isConnected,
    getAddress,
    // Exposed for the "CONTINUE ANYWAY" button in the low-ETH modal
    _continueAfterLowEth,
  };

})();

// ── deepMerge helper (shared with save.js pattern) ────────────────
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
