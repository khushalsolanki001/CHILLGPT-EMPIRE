/**
 * market.js — AI Market Demand System
 * ─────────────────────────────────────────────────────
 * Manages the different AI markets that models can be released into.
 * Demand fluctuates each year based on hype cycles and trends.
 */

const Market = (() => {

  const BASE_MARKETS = [
    {
      id:      'chat',
      name:    'Chat Assistant',
      icon:    '💬',
      desc:    'Chatbots and virtual assistants. Highest volume market.',
      baseDemand: 0.9,
    },
    {
      id:      'image',
      name:    'Image Generator',
      icon:    '🎨',
      desc:    'Text-to-image and image editing. High creativity demand.',
      baseDemand: 0.7,
    },
    {
      id:      'code',
      name:    'Code Assistant',
      icon:    '💻',
      desc:    'AI pair programmers. Devs love it.',
      baseDemand: 0.75,
    },
    {
      id:      'medical',
      name:    'Medical AI',
      icon:    '🩺',
      desc:    'Healthcare diagnostics. Low volume — huge payouts per user.',
      baseDemand: 0.4,
    },
    {
      id:      'creative',
      name:    'Creative AI',
      icon:    '✨',
      desc:    'Storytelling, game design, art direction. Niche but lucrative.',
      baseDemand: 0.55,
    },
  ];

  // State is minimal — just the demand overrides per year
  function _getState() {
    if (!Game.state.marketState) {
      Game.state.marketState = {
        demandOverrides: {},    // marketId -> current demand (0-1)
        trendYear: 2015,       // last year trends were updated
      };
    }
    return Game.state.marketState;
  }

  /**
   * Refresh demand values at start of each new year.
   * Simulates hype cycles and regulation.
   */
  function refreshDemand(year) {
    const s = _getState();
    if (s.trendYear >= year) return;
    s.trendYear = year;

    // Trending up: certain categories get boosted based on game year
    const trends = {};
    if (year >= 2016) trends.chat    = 0.8 + Math.random() * 0.2;
    if (year >= 2018) trends.image   = 0.5 + Math.random() * 0.4;
    if (year >= 2019) trends.code    = 0.6 + Math.random() * 0.35;
    if (year >= 2021) trends.medical = 0.3 + Math.random() * 0.5;
    if (year >= 2020) trends.creative = 0.4 + Math.random() * 0.4;

    // Random events
    const rand = Math.random();
    if (rand < 0.2) {
      // Regulation hit: medical demand crashes, chat gets scrutiny
      trends.medical = 0.1;
      trends.chat  = (trends.chat || 0.8) * 0.7;
      if (typeof UI !== 'undefined') {
        const el = document.getElementById('x-news-ticker');
        if (el) el.textContent = `[BREAKING] Year ${year}: Regulators crack down on AI in medical sector. Stock prices plunge.`;
      }
    } else if (rand > 0.85) {
      // Hype boom: all demand spikes
      Object.keys(trends).forEach(k => { trends[k] = Math.min(1, (trends[k] || 0.5) * 1.4); });
      if (typeof UI !== 'undefined') {
        const el = document.getElementById('x-news-ticker');
        if (el) el.textContent = `[BREAKING] Year ${year}: Global AI hype boom! Investment floods in. All markets surge.`;
      }
    }

    s.demandOverrides = trends;
    if (typeof Save !== 'undefined') Save.save();
  }

  /**
   * Get all markets with current demand values.
   */
  function getMarkets() {
    const s = _getState();
    return BASE_MARKETS.map(mk => ({
      ...mk,
      demand: s.demandOverrides[mk.id] !== undefined
        ? s.demandOverrides[mk.id]
        : mk.baseDemand,
    }));
  }

  function getMarket(id) {
    return getMarkets().find(m => m.id === id);
  }

  return {
    getMarkets,
    getMarket,
    refreshDemand,
  };

})();
