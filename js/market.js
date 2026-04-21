/**
 * market.js — AI Market Demand System
 * ─────────────────────────────────────────────────────
 * Manages the different AI markets that models can be released into.
 * Demand fluctuates each year based on hype cycles and trends.
 */

const Market = (() => {

  const BASE_MARKETS = [
    {
      id: 'chat',
      name: 'Chat Assistant',
      icon: '💬',
      desc: 'Chatbots and virtual assistants. Highest volume market.',
      baseDemand: 0.9,
    },
    {
      id: 'image',
      name: 'Image Generator',
      icon: '🎨',
      desc: 'Text-to-image and image editing. High creativity demand.',
      baseDemand: 0.7,
    },
    {
      id: 'code',
      name: 'Code Assistant',
      icon: '💻',
      desc: 'AI pair programmers. Devs love it.',
      baseDemand: 0.75,
    },
    {
      id: 'medical',
      name: 'Medical AI',
      icon: '🩺',
      desc: 'Healthcare diagnostics. Low volume — huge payouts per user.',
      baseDemand: 0.4,
    },
    {
      id: 'creative',
      name: 'Creative AI',
      icon: '✨',
      desc: 'Storytelling, game design, art direction. Niche but lucrative.',
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
    if (year >= 2016) trends.chat = 0.8 + Math.random() * 0.2;
    if (year >= 2018) trends.image = 0.5 + Math.random() * 0.4;
    if (year >= 2019) trends.code = 0.6 + Math.random() * 0.35;
    if (year >= 2021) trends.medical = 0.3 + Math.random() * 0.5;
    if (year >= 2020) trends.creative = 0.4 + Math.random() * 0.4;

      // Random events
    const rand = Math.random();
    if (rand < 0.2) {
      // Regulation hit: medical demand crashes, chat gets scrutiny
      trends.medical = 0.1;
      trends.chat = (trends.chat || 0.8) * 0.7;
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
    generateContracts(year);
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

  /**
   * Contracts System
   */
  function generateContracts(year) {
      if(!Game.state.marketState) _getState();
      const s = Game.state.marketState;
      if(!s.availableContracts) s.availableContracts = [];
      
      // Expire old ones
      s.availableContracts = s.availableContracts.filter(c => year - c.generatedYear < 2);

      // Generate 1-2 new ones per year
      if(year >= 2017) {
          const numChoices = Math.floor(Math.random() * 2) + 1;
          for(let i=0; i<numChoices; i++) {
              if(s.availableContracts.length >= 4) break; // max 4 available
              s.availableContracts.push(_createRandomContract(year));
          }
      }
      if (typeof Save !== 'undefined') Save.save();
  }

  function _createRandomContract(year) {
      const type = Math.random() > 0.3 ? 'b2b' : 'vc';
      const arch = Math.random() > 0.5 ? 'transformer' : (year >= 2018 && Math.random() > 0.5 ? 'diffusion' : 'transformer');
      const minScore = 20 + ((year - 2016) * 12) + Math.floor(Math.random() * 10);
      const rewardCash = 5000 + ((year - 2016) * 15000) * (Math.random() * 0.5 + 0.8);
      
      if (type === 'b2b') {
          return {
              id: Date.now() + Math.floor(Math.random()*1000),
              type: 'b2b',
              title: `B2B Request: Specialized AI`,
              desc: `A tech corp needs a custom model. Deliver a model with at least ${minScore} Perf Score.`,
              req: { minScore, archId: arch },
              rewardOptions: { cash: Math.floor(rewardCash) },
              generatedYear: year
          };
      } else {
          return {
              id: Date.now() + Math.floor(Math.random()*1000),
              type: 'vc',
              title: `VC Sponsorship: Alpha Program`,
              desc: `VC will sponsor you to train an Open Source model scoring at least ${minScore}. Fail in 2 years = -0.2 Rep.`,
              req: { minScore, requiresOpenSource: true },
              rewardOptions: { cash: Math.floor(rewardCash * 1.5) },
              penalty: { rep: -0.2 },
              generatedYear: year
          };
      }
  }

  function getAvailableContracts() {
      return _getState().availableContracts || [];
  }

  return {
    getMarkets,
    getMarket,
    refreshDemand,
    generateContracts,
    getAvailableContracts,
  };

})();
