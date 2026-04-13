# ⚡ ChillGPT Empire

> *Build the world's chillest and most powerful AI — from a garage in 2016 to global domination by 2026.*

A browser-based idle tycoon game built with **pure vanilla HTML + CSS + JavaScript** — no frameworks, no libraries.

---

## 🎮 How to Play

1. **Buy GPUs** in the Hardware shop to generate compute
2. Compute → Users → Money (auto-idle income)
3. **Click Collect Revenue** to bank your pending earnings
4. Buy **AI Tech upgrades** to multiply your income or cut electricity costs
5. Each year (3.5 min real-time) triggers a **Global AI Arena** competition
6. Survive the electricity bill — too many machines without upgrades = losing money
7. Reach **2026** as the #1 AI company to win

### Keyboard Shortcut
| Key | Action |
|-----|--------|
| `C` | Collect Revenue |

---

## 🗂️ Project Structure

```
CHILLGPT-EMPIRE/
├── index.html              ← Entry point (HTML skeleton only)
├── css/
│   └── style.css           ← Full styling: pixel font, CRT, neon glow
├── js/
│   ├── main.js             ← Bootstrap: init + game loop + auto-save
│   ├── game.js             ← Core logic: state, tick, buy actions, calculations
│   ├── ui.js               ← All DOM: shop, machines, effects, mascot, modals
│   ├── upgrades.js         ← Static data: hardware, AI upgrades, competitors
│   ├── save.js             ← localStorage save/load + offline progress
│   └── audio.js            ← (Optional) Web Audio API sound effects
├── assets/
│   ├── images/             ← Pixel art assets (add your own PNGs here)
│   └── fonts/              ← Custom pixel fonts (optional)
└── README.md
```

### Module Responsibilities

| File | Owns |
|------|------|
| `upgrades.js` | Static data (no logic) — loaded first |
| `save.js` | Read/write localStorage |
| `game.js` | Game state, math, buy actions, tick |
| `ui.js` | All DOM ops, visual effects, modals |
| `main.js` | Wires everything together, starts loop |

---

## 🚀 Running Locally

### Option A — Python (simplest)
```bash
cd "CHILLGPT EMPIRE"
python -m http.server 8080
# Open http://localhost:8080
```

### Option B — Node.js
```bash
npx -y serve .
# Opens automatically in browser
```

### Option C — VS Code
Install the **Live Server** extension → right-click `index.html` → *Open with Live Server*

> **⚠️ Do NOT open `index.html` directly as a `file://` URL.**  
> The Google Fonts import requires a real HTTP server.

---

## 🎨 Visual Style

- **Font**: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (pixel/retro)
- **Secondary**: [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono)
- **Theme**: Dark cyber-industrial with CRT scanlines
- **Colors**: Neon blue `#00d4ff` · Neon green `#39ff85` · Neon purple `#b44fff`

---

## 🖼️ Suggested Free Pixel Art Assets

| Asset | Source |
|-------|--------|
| GPU / Server sprites | [itch.io: kenney.nl assets](https://kenney.nl/assets) |
| Robot / character | [OpenGameArt.org – RPG characters](https://opengameart.org) |
| Sci-fi UI elements | [itch.io: free sci-fi UI pack](https://itch.io/c/2124368/free-pixel-art) |
| Backgrounds | [Ansimuz on itch.io](https://ansimuz.itch.io/) |

Place `.png` files in `assets/images/` and reference them in `css/style.css` or `js/ui.js`.

---

## 🗺️ Progression Overview

| Year | Location | Unlocks |
|------|----------|---------|
| 2016 | 🏠 Garage | GPU, Advanced Text AI |
| 2017 | 🏢 Office | GPU Cluster |
| 2018 | 🏗️ Startup Floor | Server Rack, Image Gen |
| 2019 | 🖥️ Server Room | Efficient Power |
| 2020 | 🏭 Micro DC | Mega Data Center |
| 2021 | ⚙️ Regional DC | Video Generation |
| 2022 | 🌐 National DC | Voice Mode |
| 2023 | 🌍 Mega DC | Quantum DC, Multimodal |
| 2024 | 🚀 Galactic HQ | AI Agents |
| 2025 | 🌌 Mothership | Final push |
| 2026 | 👑 Empire | Win condition |

---

## 🏆 Competitors in the Global AI Arena

| Company | Growth Rate | Difficulty |
|---------|-------------|------------|
| LuminaAI | 1.38× / year | ⭐⭐⭐ |
| AetherMind | 1.45× / year | ⭐⭐⭐⭐ |
| QuantumForge | 1.52× / year | ⭐⭐⭐⭐⭐ |

---

## 🔧 Developer Notes

- **Save key**: `chillgpt_empire_v3` in localStorage
- **Year duration**: 210 real seconds (3.5 min) — change `yearDuration` in `game.js`
- **Adding hardware**: Add an entry to the `HARDWARE` array in `upgrades.js`
- **Adding AI upgrades**: Add an entry to `AI_UPGRADES` in `upgrades.js`
- **Sound effects**: Enable in `audio.js` and call `Audio.playCoin()` etc. from `ui.js`

---

*Built for GameDev.js 2026 – Theme: MACHINES*
