/**
 * upgrades.js
 * ─────────────────────────────────────────────────────────────────
 * Defines all static game data:
 *   HARDWARE   — buyable machines (GPUs, server racks, data centers)
 *   AI_UPGRADES — one-time research unlocks
 *   COMPETITORS — rival AI companies for the Arena
 *   LOCATIONS   — factory location labels per year
 *   MASCOT_QUIPS — random robot speech lines
 * ─────────────────────────────────────────────────────────────────
 */

const HARDWARE = [

  {
    id: 'cluster',
    name: 'GPU Cluster',
    icon: '🔋',
    desc: '8× consumer GPUs networked together. Max 4 clusters.',
    computePS: 5,
    elecPS: 0.4,
    baseCost: 400,
    costMult: 1.14,
    cssClass: 'm-cluster',
    row: 'front',
    requireYear: 2016,
    maxRender: 8,
  },
  {
    id: 'rack',
    name: 'Server Rack',
    icon: '🗄️',
    desc: 'Enterprise server rack. Max 2 racks.',
    computePS: 30,
    elecPS: 2,
    baseCost: 3000,
    costMult: 1.15,
    cssClass: 'm-rack',
    row: 'back',
    requireYear: 2018,
    maxRender: 7,
  },
  {
    id: 'megaDC',
    name: 'Mega Data Center',
    icon: '🏭',
    desc: 'An entire data center floor. Max 1 floor.',
    computePS: 250,
    elecPS: 15,
    baseCost: 40000,
    costMult: 1.18,
    cssClass: 'm-mega',
    row: 'back',
    requireYear: 2020,
    maxRender: 5,
  },
  {
    id: 'quantumDC',
    name: 'Quantum Data Center',
    icon: '⚛️',
    desc: 'Quantum-accelerated compute. Max 1 unit.',
    computePS: 2000,
    elecPS: 100,
    baseCost: 600000,
    costMult: 1.20,
    cssClass: 'm-quantum',
    row: 'back',
    requireYear: 2023,
    maxRender: 4,
  },
];

const AI_UPGRADES = [
  {
    id: 'advanced_text',
    name: 'Advanced Text AI',
    icon: '📝',
    desc: 'Better language models. 3× revenue from each user.',
    cost: 200,
    tfCost: 500,
    requireYear: 2016,
    /**
     * Apply the upgrade effect to the running game state.
     * @param {object} G - live game state
     */
    apply: (G) => { G.mult.moneyPerUser *= 3; },
    badge: '3× Money',
    badgeClass: 'badge-blue',
  },
  {
    id: 'image_gen',
    name: 'Image Generation',
    icon: '🎨',
    desc: 'ChillGPT can generate images. Users flock in — 2× users.',
    cost: 2000,
    tfCost: 8000,
    requireYear: 2018,
    apply: (G) => { G.mult.computeToUsers *= 2; },
    badge: '2× Users',
    badgeClass: 'badge-purple',
  },
  {
    id: 'efficient_power',
    name: 'Efficient Power',
    icon: '🔋',
    desc: 'Better cooling & PSUs. Cuts electricity cost by 40%.',
    cost: 5000,
    tfCost: 20000,
    requireYear: 2019,
    apply: (G) => { G.mult.elecReduction *= 0.6; },
    badge: '–40% Power',
    badgeClass: 'badge-green',
  },
  {
    id: 'video_gen',
    name: 'Video Generation',
    icon: '🎬',
    desc: 'ChillGPT makes videos. Viral moment — 5× money.',
    cost: 25000,
    tfCost: 100000,
    requireYear: 2021,
    apply: (G) => { G.mult.moneyPerUser *= 5; },
    badge: '5× Money',
    badgeClass: 'badge-yellow',
  },
  {
    id: 'voice_mode',
    name: 'Voice Mode',
    icon: '🎙️',
    desc: 'Real-time voice AI. People won\'t stop talking to it — 3× users.',
    cost: 80000,
    tfCost: 350000,
    requireYear: 2022,
    apply: (G) => { G.mult.computeToUsers *= 3; },
    badge: '3× Users',
    badgeClass: 'badge-purple',
  },
  {
    id: 'model_quantization',
    name: 'Model Quantization',
    icon: '📉',
    desc: 'Efficient weights. +15% Perf Score for all new designs.',
    cost: 8000,
    tfCost: 15000,
    requireYear: 2017,
    apply: (G) => { G.mult.perfBonus = (G.mult.perfBonus || 1.0) + 0.15; },
    badge: '+15% Perf',
    badgeClass: 'badge-blue',
  },
  {
    id: 'rlhf_training',
    name: 'RLHF Training',
    icon: '👍',
    desc: 'Human feedback fine-tuning. +30% Perf Score for all new designs.',
    cost: 45000,
    tfCost: 120000,
    requireYear: 2019,
    apply: (G) => { G.mult.perfBonus = (G.mult.perfBonus || 1.0) + 0.30; },
    badge: '+30% Perf',
    badgeClass: 'badge-purple',
  },
  {
    id: 'distributed_training',
    name: 'Distributed Compute',
    icon: '🔗',
    desc: 'Train across multiple clusters. +25% Perf Score & -20% training time.',
    cost: 150000,
    tfCost: 500000,
    requireYear: 2021,
    apply: (G) => { G.mult.perfBonus = (G.mult.perfBonus || 1.0) + 0.25; },
    badge: '+25% Perf',
    badgeClass: 'badge-yellow',
  },
  {
    id: 'auto_scaling',
    name: 'Auto-Scaling Architecture',
    icon: '📈',
    desc: 'Dynamic parameter scaling. +50% Perf Score for all new designs.',
    cost: 800000,
    tfCost: 3000000,
    requireYear: 2023,
    apply: (G) => { G.mult.perfBonus = (G.mult.perfBonus || 1.0) + 0.50; },
    badge: '+50% Perf',
    badgeClass: 'badge-green',
  },
  {
    id: 'multimodal',
    name: 'Multimodal AI',
    icon: '🌐',
    desc: 'Everything unified: text + image + video + audio. 10× money.',
    cost: 300000,
    tfCost: 1200000,
    requireYear: 2023,
    apply: (G) => { G.mult.moneyPerUser *= 10; },
    badge: '10× Money',
    badgeClass: 'badge-blue',
  },
  {
    id: 'agents',
    name: 'AI Agents',
    icon: '🤖',
    desc: 'Autonomous agents work 24/7. 4× users per compute.',
    cost: 1000000,
    tfCost: 5000000,
    requireYear: 2024,
    apply: (G) => { G.mult.computeToUsers *= 4; },
    badge: '4× Users',
    badgeClass: 'badge-green',
  },
];

/** Rival companies in the Global AI Arena */
const COMPETITORS = [
  { name: 'OK AI', icon: 'assets/images/AI/OK AI.jpg', baseScore: 10, growthRate: 1.48 },
  { name: 'brok', icon: 'assets/images/AI/brok.png', baseScore: 6, growthRate: 1.35 },
  { name: 'deepwhale', icon: 'assets/images/AI/deepwhale.png', baseScore: 5, growthRate: 1.55 },
  { name: 'glade', icon: 'assets/images/AI/glade.png', baseScore: 8, growthRate: 1.45 },
  { name: 'googlu', icon: 'assets/images/AI/googlu.png', baseScore: 12, growthRate: 1.38 },
  { name: 'midroad', icon: 'assets/images/AI/midroad.png', baseScore: 7, growthRate: 1.52 },
  { name: 'qwack', icon: 'assets/images/AI/qwack.png', baseScore: 4, growthRate: 1.40 }
];

/** Factory location label that updates each year */
const LOCATIONS = [
  { year: 2016, label: '🏠  GARAGE SETUP' },
  { year: 2017, label: '🏢  SMALL OFFICE' },
  { year: 2018, label: '🏗️   STARTUP FLOOR' },
  { year: 2019, label: '🖥️   SERVER ROOM' },
  { year: 2020, label: '🏭  MICRO DATA CENTER' },
  { year: 2021, label: '⚙️   REGIONAL DC' },
  { year: 2022, label: '🌐  NATIONAL DC' },
  { year: 2023, label: '🌍  MEGA DATA CENTER' },
  { year: 2024, label: '🚀  GALACTIC HQ' },
  { year: 2025, label: '🌌  THE MOTHERSHIP' },
  { year: 2026, label: '👑  CHILLGPT EMPIRE' },
];

/** Random lines the mascot says when clicked or upgraded */
const MASCOT_QUIPS = [
  'Vibes & teraflops, bro 😎',
  'Training... and chilling 🧊',
  'We do compute different here 🤙',
  'Servers don\'t sleep, neither do I 💪',
  'More servers, more chill 🏖️',
  'The AI is real. The stress is not. ✌️',
  'Buy the dip... in compute 📈',
  'We gonna win the Arena fr fr 🏆',
  'Electricity costs? Skill issue 🔥',
  'ChillGPT is inevitable 🤖',
  'Stay frosty. Stay computing. 🥶',
  'Have you tried turning it off and on? Just kidding — never off.',
];
