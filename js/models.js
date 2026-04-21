/**
 * models.js — Custom AI Model Builder + Training System
 * ─────────────────────────────────────────────────────
 * Manages all custom AI models the player designs and trains.
 * Models go through: DESIGN → TRAINING → TRAINED → RELEASED
 */

const ModelBuilder = (() => {

  // ── STATIC DATA ─────────────────────────────────────────────────

  const ARCHITECTURES = [
    {
      id:         'transformer',
      name:       'Transformer',
      icon:       '🧠',
      desc:       'Versatile language model. Jack of all trades.',
      tfMult:     1.0,
      perfBonus:  0,
      markets:    ['chat', 'code'],
    },
    {
      id:         'diffusion',
      name:       'Diffusion',
      icon:       '🎨',
      desc:       'Specializes in stunning image generation.',
      tfMult:     1.4,
      perfBonus:  30,
      markets:    ['image', 'creative'],
    },
    {
      id:         'rnn',
      name:       'RNN Legacy',
      icon:       '⏪',
      desc:       'Old-school but fast and cheap to train.',
      tfMult:     0.6,
      perfBonus:  -20,
      markets:    ['chat'],
    },
    {
      id:         'multimodal',
      name:       'Multimodal',
      icon:       '🌐',
      desc:       'Handles text, image, audio and video. Premium tier.',
      tfMult:     2.0,
      perfBonus:  80,
      markets:    ['chat', 'image', 'medical', 'code'],
    },
  ];

  const MODEL_SIZES = [
    { id: 'mini',   label: 'Mini 7B',    tfBase: 5000,    timeSec: 30,   perfBase: 20, icon: '🟢' },
    { id: 'mid',    label: 'Mid 13B',    tfBase: 25000,   timeSec: 60,   perfBase: 45, icon: '🟡' },
    { id: 'large',  label: 'Large 70B',  tfBase: 200000,  timeSec: 120,  perfBase: 75, icon: '🟠' },
    { id: 'giant',  label: 'Giant 405B', tfBase: 2000000, timeSec: 300,  perfBase: 95, icon: '🔴' },
  ];

  const TRAITS = [
    { id: 'efficiency',   name: 'Efficiency Mode',    icon: '⚡', desc: '–30% electricity costs while deployed.',    effect: 'elec' },
    { id: 'creativity',   name: 'Creativity Boost',   icon: '✨', desc: '+25% revenue in creative markets.',        effect: 'creative' },
    { id: 'domain_chat',  name: 'Chat Expert',        icon: '💬', desc: '+20% revenue in chat/assistant markets.',  effect: 'chat' },
    { id: 'domain_code',  name: 'Code Expert',        icon: '💻', desc: '+20% revenue in code assistant markets.',  effect: 'code' },
    { id: 'domain_image', name: 'Image Expert',       icon: '🖼️', desc: '+20% revenue in image gen markets.',       effect: 'image' },
    { id: 'domain_med',   name: 'Medical AI',         icon: '🩺', desc: '+40% revenue in medical markets.',        effect: 'medical' },
  ];

  // ── STATE HELPERS ────────────────────────────────────────────────

  function _getState() {
    if (!Game.state.modelState) {
      Game.state.modelState = {
        models:       [],    // All created models
        training:     null,  // Active training job
        nextModelId:  1,
      };
    }
    // Ensure workersList/marketing exists
    if (!Game.state.modelState.models) Game.state.modelState.models = [];
    return Game.state.modelState;
  }

  // ── GETTERS ──────────────────────────────────────────────────────

  function getArchitectures() { return ARCHITECTURES; }
  function getModelSizes()    { return MODEL_SIZES;    }
  function getTraits()        { return TRAITS;         }

  function getTrainingJob() { return _getState().training; }
  function getAllModels()    { return _getState().models;   }

  function getReleasedModels() {
    return _getState().models.filter(m => m.status === 'released');
  }

  // ── DESIGN ACTION ─────────────────────────────────────────────────

  /**
   * Create a new model design. Does NOT start training.
   * Returns { ok, message, model }
   */
  function designModel({ name, archId, sizeId, traitIds }) {
    const arch  = ARCHITECTURES.find(a => a.id === archId);
    const size  = MODEL_SIZES.find(s => s.id === sizeId);
    const traits = (traitIds || []).slice(0, 2).map(tid => TRAITS.find(t => t.id === tid)).filter(Boolean);

    if (!arch) return { ok: false, message: 'Invalid architecture.' };
    if (!size) return { ok: false, message: 'Invalid size.' };

    const tfNeeded  = Math.floor(size.tfBase * arch.tfMult);
    const globalPerfMult = Game.state.mult?.perfBonus || 1.0;
    const perfScore = Math.floor((size.perfBase + arch.perfBonus) * (1 + traits.length * 0.1) * globalPerfMult);

    const s    = _getState();
    const model = {
      id:        s.nextModelId++,
      name:      name || `${arch.name}-${size.id.toUpperCase()}`,
      archId,
      sizeId,
      traitIds:  traits.map(t => t.id),
      tfNeeded,
      perfScore,
      status:    'designed', // designed | training | trained | released
      createdYear: Game.state.year,
      trainingProgress: 0,
    };

    s.models.push(model);
    if (typeof Save !== 'undefined') Save.save();
    return { ok: true, model, message: `✅ Model "${model.name}" designed! Needs ${Fmt.num(tfNeeded)} TF to train.` };
  }

  // ── TRAINING ACTIONS ─────────────────────────────────────────────

  /**
   * Start training a designed model. Requires enough TF budget.
   * Returns { ok, message }
   */
  function startTraining(modelId) {
    const s  = _getState();
    const m  = s.models.find(m => m.id === modelId);
    if (!m) return { ok: false, message: 'Model not found.' };
    if (m.status !== 'designed') return { ok: false, message: 'Model is not in design state.' };
    if (s.training) return { ok: false, message: `Already training: "${s.training.modelName}"` };

    if (Game.state.tf < m.tfNeeded) {
      return { ok: false, message: `💻 Need ${Fmt.num(m.tfNeeded)} TF to train (you have ${Fmt.num(Math.floor(Game.state.tf))}).` };
    }

    // Deduct TF cost upfront
    Game.state.tf -= m.tfNeeded;

    const size = MODEL_SIZES.find(sz => sz.id === m.sizeId);
    const compute = Game.getTotalCompute();
    const speedMult = Math.max(0.5, Math.min(4, compute / 20));
    const duration = Math.max(10, size.timeSec / speedMult);

    m.status = 'training';
    s.training = {
      modelId,
      modelName: m.name,
      totalSec:  duration,
      elapsed:   0,
    };

    if (typeof Save !== 'undefined') Save.save();
    return { ok: true, message: `🚀 Training "${m.name}" started! Est. ${Math.ceil(duration)}s.` };
  }

  /**
   * Called each tick. Advances active training.
   * Returns { done, model } if training complete.
   */
  function tickTraining(dt) {
    const s = _getState();
    if (!s.training) return null;

    s.training.elapsed += dt;
    const frac = Math.min(1, s.training.elapsed / s.training.totalSec);

    // Update model's training progress
    const m = s.models.find(m => m.id === s.training.modelId);
    if (m) m.trainingProgress = Math.round(frac * 100);

    if (frac >= 1) {
      if (m) {
        m.status = 'trained';
        m.trainingProgress = 100;
      }
      const done = s.training;
      s.training = null;
      if (typeof Save !== 'undefined') Save.save();
      return { done: true, model: m };
    }

    return { done: false, progress: frac };
  }

  // ── RELEASE ACTIONS ───────────────────────────────────────────────

  /**
   * Release a trained model into a market.
   * Returns { ok, message }
   */
  function releaseModel(modelId, marketId) {
    const s = _getState();
    const m = s.models.find(m => m.id === modelId);
    if (!m) return { ok: false, message: 'Model not found.' };
    if (m.status !== 'trained') return { ok: false, message: 'Model must be fully trained first.' };

    m.status     = 'released';
    m.marketId   = marketId;
    m.releasedYear = Game.state.year;
    // Track exact time of release for decay calculation
    m.releasedTime = Game.state.year + (Game.state.yearProgress / Game.state.yearDuration);

    if (typeof Save !== 'undefined') Save.save();
    return { ok: true, message: `🌍 "${m.name}" launched in ${marketId} market!` };
  }

  /**
   * Calculate current popularity multiplier for a model based on age.
   * Decay: Halves every year. Initial 20% hype bonus for first 2 months.
   */
  function getModelPopularity(model) {
    if (model.status !== 'released' || model.releasedTime === undefined) return 1.0;

    const now = Game.state.year + (Game.state.yearProgress / Game.state.yearDuration);
    const age = Math.max(0, now - model.releasedTime);

    // Initial hype bonus (20% extra for first 0.15 years ~ approx 1.8 months)
    let hype = 1.0;
    if (age < 0.15) hype = 1.25;
    else if (age < 0.3) hype = 1.1;

    // Decay factor (power of 0.5 per year)
    const decay = Math.pow(0.5, age);

    return Math.max(0.05, decay * hype);
  }

  // ── SCORING ──────────────────────────────────────────────────────

  /**
   * Calculate the effective score of a model in a given market.
   * Accounts for architecture affinity and traits.
   */
  function getModelMarketScore(model, marketId) {
    const arch   = ARCHITECTURES.find(a => a.id === model.archId);
    let score    = model.perfScore;

    // Architecture affinity
    if (arch && arch.markets.includes(marketId)) score *= 1.3;

    // Trait bonuses
    for (const tid of (model.traitIds || [])) {
      const t = TRAITS.find(t => t.id === tid);
      if (!t) continue;
      if (t.effect === marketId || (t.effect === 'creative' && ['image', 'creative'].includes(marketId))) {
        score *= 1.25;
      }
    }

    return Math.floor(score);
  }

  /**
   * Calculate total income per second from model(s).
   * @param {object} [specificModel] - If provided, returns income for just this model.
   */
  function getModelIncomePerSecond(specificModel = null) {
    const relModels = specificModel ? [specificModel] : getReleasedModels();
    if (!relModels.length) return 0;

    const marketData = (typeof Market !== 'undefined') ? Market.getMarkets() : [];
    const mktMap = {};
    marketData.forEach(mk => { mktMap[mk.id] = mk; });

    const mkt = Game.state.marketing || { hackathon: 0, gamejam: 0, xCampaign: 0 };
    const marketingMult = 1 + (mkt.hackathon * 0.05) + (mkt.gamejam * 0.05) + (mkt.xCampaign * 0.1);

    return relModels.reduce((sum, m) => {
      const score  = getModelMarketScore(m, m.marketId);
      const demand = mktMap[m.marketId] ? mktMap[m.marketId].demand : 0.5;
      const pop    = getModelPopularity(m);
      return sum + (score * demand * 0.02 * marketingMult * pop);
    }, 0);
  }

  // ── AWARDS ───────────────────────────────────────────────────────

  /**
   * Calculate year-end award results.
   * Returns array of { category, winner (player/npc), modelName, reward }
   */
  function calculateAwards() {
    const models = getReleasedModels();
    const awards = [];

    // Best Overall
    const best = models.sort((a, b) => b.perfScore - a.perfScore)[0];
    if (best) {
      awards.push({
        category: '🏆 Best Overall Model',
        playerWins: true,
        modelName: best.name,
        reward: { cash: 50000, prestige: 0.1, buff: { type: 'hype', value: 1.5, text: 'Massive Hype Boost' } },
      });
    } else {
      awards.push({
        category: '🏆 Best Overall Model',
        playerWins: false,
        modelName: 'Claude 3.5',
        reward: null,
      });
    }

    // Most Efficient
    const efficient = models.filter(m => m.traitIds && m.traitIds.includes('efficiency'));
    awards.push({
      category: '⚡ Most Efficient Model',
      playerWins: efficient.length > 0,
      modelName: efficient[0] ? efficient[0].name : 'Gemini Ultra',
      reward: { cash: 15000, prestige: 0, buff: { type: 'elec', value: 0.9, text: '-10% Power Cost' } },
    });

    // Best Creative
    const creative = models.filter(m => m.archId === 'diffusion');
    awards.push({
      category: '🎨 Best Creative AI',
      playerWins: creative.length > 0,
      modelName: creative[0] ? creative[0].name : 'Midjourney',
      reward: { cash: 30000, prestige: 0.05, buff: { type: 'serverDiscount', value: 0.85, text: '-15% Server Cost' } },
    });

    return awards;
  }

  // ── PUBLIC API ────────────────────────────────────────────────────

  return {
    // Data
    getArchitectures,
    getModelSizes,
    getTraits,

    // State
    getAllModels,
    getReleasedModels,
    getTrainingJob,

    // Actions
    designModel,
    startTraining,
    releaseModel,
    tickTraining,

    // Calculations
    getModelMarketScore,
    getModelIncomePerSecond,
    getModelPopularity,
    calculateAwards,
  };

})();
