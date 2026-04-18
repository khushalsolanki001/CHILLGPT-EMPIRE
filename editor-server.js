/**
 * ChillGPT Empire — Visual Layout Editor Server
 * Serves editor.html and provides file-read/write APIs so
 * the browser editor can directly update phaser-scene.js
 *
 * Key fix: also injects this.load.image() / spritesheet() entries
 * into preload() for any assets that aren't already preloaded.
 */
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const ROOT = __dirname;
const PORT = 3333;

app.use(express.json({ limit: '8mb' }));
app.use(express.static(ROOT));
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Headers', 'Content-Type'); next(); });

// ─── Known Phaser keys (already in preload) ─────────────────────
// key → { file, type: 'image'|'spritesheet', frameW?, frameH? }
const KNOWN_PRELOADS = {
  'bg':          { file: 'assets/images/bg.png',           type: 'image' },
  'desk':        { file: 'assets/images/desk1.png',         type: 'image' },
  'gpu':         { file: 'assets/images/gpu.png',           type: 'image' },
  'server':      { file: 'assets/images/server.png',        type: 'image' },
  'server_anim': { file: 'assets/images/server_sheet.png',  type: 'spritesheet', frameW: 512, frameH: 1024 },
  'worker_anim': { file: 'assets/images/worker_sheet.png',  type: 'spritesheet', frameW: 512, frameH: 1024 },
  'gpu_anim':    { file: 'assets/images/gpu_sheet.png',     type: 'spritesheet', frameW: 512, frameH: 1024 },
  'gpu_anim2':   { file: 'assets/images/gpu_sheet1.png',    type: 'spritesheet', frameW: 512, frameH: 1024 },
  'worker_anim2':{ file: 'assets/images/worker_sheet2.png', type: 'spritesheet', frameW: 512, frameH: 1024 },
};

// ─── GET /api/assets ─────────────────────────────────────────────
// Returns assets mapped to their correct Phaser texture keys
app.get('/api/assets', (req, res) => {
  // Build a reverse map: filename → phaser key
  const fileToKey = {};
  Object.keys(KNOWN_PRELOADS).forEach(key => {
    const f = path.basename(KNOWN_PRELOADS[key].file);
    fileToKey[f] = key;
  });

  const dir = path.join(ROOT, 'assets', 'images');
  if (!fs.existsSync(dir)) return res.json([]);

  const files = fs.readdirSync(dir)
    .filter(f => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f));

  const list = files.map(f => {
    const fileName = f;
    const phaserKey = fileToKey[fileName] || f.replace(/\.[^.]+$/, '');
    const isNew     = !fileToKey[fileName];  // true if not in KNOWN_PRELOADS
    const isSprite  = KNOWN_PRELOADS[phaserKey]?.type === 'spritesheet' ||
                      (!fileToKey[fileName] && (f.includes('_sheet') || f.includes('_anim')));
    return {
      key:      phaserKey,         // ← actual Phaser texture key to use in code
      src:      `assets/images/${f}`,
      isSprite,
      isNew,                       // ← editor shows warning badge if preload needed
      label:    `${phaserKey}${isNew ? ' ⚠' : ''}`,
      file:     f,
    };
  });

  res.json(list);
});

// ─── GET /api/layout ─────────────────────────────────────────────
app.get('/api/layout', (req, res) => {
  const file = path.join(ROOT, 'kpe', 'layout.json');
  if (!fs.existsSync(file)) return res.json({ objects: [] });
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});

// ─── POST /api/layout ────────────────────────────────────────────
app.post('/api/layout', (req, res) => {
  const layout = req.body;
  if (!layout || !Array.isArray(layout.objects)) return res.status(400).json({ error: 'Invalid layout' });

  // 1. Save layout.json
  const kpeDir = path.join(ROOT, 'kpe');
  if (!fs.existsSync(kpeDir)) fs.mkdirSync(kpeDir);
  fs.writeFileSync(path.join(kpeDir, 'layout.json'), JSON.stringify(layout, null, 2));

  // 2. Patch phaser-scene.js
  const sceneFile = path.join(ROOT, 'js', 'phaser-scene.js');
  if (!fs.existsSync(sceneFile)) return res.json({ ok: true, scene: false });

  let src = fs.readFileSync(sceneFile, 'utf8');

  // ── 2a. Patch preload() ────────────────────────────────────────
  src = patchPreload(src, layout.objects);

  // ── 2b. Patch create() ────────────────────────────────────────
  src = patchCreate(src, layout.objects);

  fs.writeFileSync(sceneFile, src, 'utf8');
  res.json({ ok: true, scene: true });
});

// ─── PATCH preload() ─────────────────────────────────────────────
function patchPreload(src, objects) {
  const OPEN  = '// ── EDITOR_PRELOAD_BEGIN ──';
  const CLOSE = '// ── EDITOR_PRELOAD_END ──';

  // Collect keys that need loading
  const newLoads = [];
  objects.filter(o => !o._hidden && o.type === 'image').forEach(obj => {
    const key  = obj.key;
    const file = obj.src || `assets/images/${obj.file || key + '.png'}`;
    if (!KNOWN_PRELOADS[key]) {
      // Need to inject a preload for this key
      if (obj.isSprite) {
        newLoads.push(
          `    this.load.spritesheet('${key}', '${file}', { frameWidth: 512, frameHeight: 1024 });`,
          `    this.load.on('filecomplete-spritesheet-${key}', () => { this._ok['${key}'] = true; });`
        );
      } else {
        newLoads.push(
          `    this.load.image('${key}', '${file}');`,
          `    this.load.on('filecomplete-image-${key}', () => { this._ok['${key}'] = true; });`
        );
      }
    }
  });

  const block = newLoads.length
    ? `    ${OPEN}\n${newLoads.join('\n')}\n    ${CLOSE}`
    : `    ${OPEN}\n    ${CLOSE}`;

  if (src.includes(OPEN)) {
    const re = new RegExp(`\\s*${esc(OPEN)}[\\s\\S]*?${esc(CLOSE)}`, 'g');
    src = src.replace(re, '\n    ' + block.trim());
  } else {
    // Insert at end of preload(), just before closing brace
    src = src.replace(/(\s*}\s*\/\/ ── CREATE)/, `\n    ${block}\n$1`);
    if (!src.includes(OPEN)) {
      // fallback: insert before the closing brace of preload()
      src = src.replace(
        /( {2}preload\(\)[\s\S]*?)(  }\n\n  \/\/ ── CREATE)/,
        (match, body, after) => body + `\n    ${block}\n  }\n\n  // ── CREATE`
      );
    }
  }
  return src;
}

// ─── PATCH create() ──────────────────────────────────────────────
function patchCreate(src, objects) {
  const OPEN  = '// ── EDITOR_LAYOUT_BEGIN ──';
  const CLOSE = '// ── EDITOR_LAYOUT_END ──';

  const injected = buildCreateCode(objects);
  const block = `${OPEN}\n${injected}\n    ${CLOSE}`;

  if (src.includes(OPEN)) {
    const re = new RegExp(`${esc(OPEN)}[\\s\\S]*?${esc(CLOSE)}`, 'g');
    src = src.replace(re, block);
  } else {
    // Insert before _syncWithGameState
    const target = '_syncWithGameState();';
    if (src.includes(target)) {
      src = src.replace(target, `// ── Placed objects ──\n    ${block}\n\n    ${target}`);
    }
  }
  return src;
}

// ─── BUILD create() SNIPPET ──────────────────────────────────────
// Positions saved as percentages of REF_W×REF_H (the editor canvas size).
// Generated code multiplies by W/H (scene live dims) → auto-scales on any display.
const REF_W = 1208;
const REF_H = 600;
function wp(px)  { return `Math.round(W*${(px/REF_W).toFixed(4)})`; }
function hp(px)  { return `Math.round(H*${(px/REF_H).toFixed(4)})`; }

function buildCreateCode(objects) {
  const lines = ['    // ── Placed by Visual Layout Editor (% of canvas, auto-scales) ──'];

  objects.filter(o => !o._hidden).forEach(obj => {
    const varName = san(obj.name || 'obj') + '_' + obj.id;
    // Centre coords and size — all expressed as fractions of canvas so they
    // scale correctly on any display resolution via W*pct / H*pct
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    const cxE = wp(cx),  cyE = hp(cy);
    const wE  = wp(obj.w), hE  = hp(obj.h);
    const xE  = wp(obj.x), yE  = hp(obj.y);
    const rE  = `Math.round(Math.min(W,H)*${(Math.min(obj.w,obj.h)/2/REF_W).toFixed(4)})`;

    if (obj.type === 'image') {
      const method = obj.isSprite ? 'sprite' : 'image';
      const frame  = obj.isSprite ? ', 0' : '';
      lines.push(`    const ${varName} = this.add.${method}(${cxE}, ${cyE}, '${obj.key}'${frame})`);
      lines.push(`      .setOrigin(${f2(obj.originX ?? 0.5)}, ${f2(obj.originY ?? 0.5)})`);
      lines.push(`      .setDisplaySize(${wE}, ${hE})`);
      lines.push(`      .setDepth(${obj.depth ?? 1}).setAlpha(${f2(obj.alpha ?? 1)});`);
      if (obj.rotation) lines.push(`    ${varName}.setAngle(${Math.round(obj.rotation)});`);
      if (obj.flipX)    lines.push(`    ${varName}.setFlipX(true);`);
      if (obj.flipY)    lines.push(`    ${varName}.setFlipY(true);`);
      if (obj.isSprite && obj.anim) lines.push(`    ${varName}.play('${obj.anim}');`);

    } else if (obj.type === 'shape') {
      const hexRaw = parseInt((obj.color || '#888888').replace('#', ''), 16);
      const hex6   = hexRaw.toString(16).padStart(6, '0');

      if (obj.shape === 'text') {
        const safe = (obj.text || 'LABEL').replace(/'/g, "\\'");
        lines.push(`    const ${varName} = this.add.text(${cxE}, ${cyE}, '${safe}', {`);
        lines.push(`      fontFamily: '"Press Start 2P", monospace',`);
        lines.push(`      fontSize: '${obj.fontSize || 16}px',`);
        lines.push(`      color: '${obj.color || '#ffffff'}',`);
        lines.push(`    }).setOrigin(${f2(obj.originX ?? 0.5)}, ${f2(obj.originY ?? 0.5)})`);
        lines.push(`      .setDepth(${obj.depth ?? 1}).setAlpha(${f2(obj.alpha ?? 1)});`);
        if (obj.rotation) lines.push(`    ${varName}.setAngle(${Math.round(obj.rotation)});`);

      } else if (obj.shape === 'circle') {
        lines.push(`    const ${varName} = this.add.graphics().setDepth(${obj.depth ?? 1}).setAlpha(${f2(obj.alpha ?? 1)});`);
        lines.push(`    ${varName}.fillStyle(0x${hex6}, 1);`);
        lines.push(`    ${varName}.fillCircle(${cxE}, ${cyE}, ${rE});`);

      } else {
        lines.push(`    const ${varName} = this.add.graphics().setDepth(${obj.depth ?? 1}).setAlpha(${f2(obj.alpha ?? 1)});`);
        if (obj.shape !== 'zone') {
          lines.push(`    ${varName}.fillStyle(0x${hex6}, 1);`);
          lines.push(`    ${varName}.fillRect(${xE}, ${yE}, ${wE}, ${hE});`);
        } else {
          lines.push(`    ${varName}.lineStyle(2, 0x${hex6}, 0.8);`);
          lines.push(`    ${varName}.strokeRect(${xE}, ${yE}, ${wE}, ${hE});`);
        }
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}

function san(s)  { return s.replace(/[^a-zA-Z0-9_]/g, '_'); }
function f2(n)   { return parseFloat(n).toFixed(2); }
function esc(s)  { return s.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&'); }

// ─── GET /api/zones ──────────────────────────────────────────────
// Returns parsed zone config from phaser-scene.js so the editor
// can show live, editable zone overlays.
app.get('/api/zones', (req, res) => {
  const sceneFile = path.join(ROOT, 'js', 'phaser-scene.js');
  if (!fs.existsSync(sceneFile)) return res.json({ error: 'phaser-scene.js not found' });
  const src = fs.readFileSync(sceneFile, 'utf8');

  // Extract _buildZones numbers via regex
  const parseNum = (name) => {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*([\\d.]+)`));
    return m ? parseFloat(m[1]) : null;
  };
  const parseExpr = (name) => {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*([^;\\n]+)`));
    return m ? m[1].trim() : null;
  };

  // machineZone and workerZone params from _buildZones
  const zones = {
    machineZone: {
      leftMarginFrac: parseFloat((src.match(/mStartX.*?W\s*\*\s*([\d.]+)/) || [,'0.32'])[1]),
      rightMarginFrac: parseFloat((src.match(/RIGHT_MARGIN.*?W\s*\*\s*([\d.]+)/) || [,'0.19'])[1]),
      startYFrac: parseFloat((src.match(/mStartY.*?H\s*\*\s*([\d.]+)/) || [,'0.56'])[1]),
      spacingX: parseFloat((src.match(/mSpacingX\s*=\s*([\d.]+)/) || [,'140'])[1]),
      spacingY: parseFloat((src.match(/mSpacingY\s*=\s*([\d.]+)/) || [,'95'])[1]),
      height: parseFloat((src.match(/const mH\s*=\s*([\d.]+)/) || [,'110'])[1]),
    },
    gpuZone: {
      height: parseFloat((src.match(/[g_]H\s*=\s*([\d.]+)/) || [,'110'])[1]),
      width: parseFloat((src.match(/[g_]W\s*=\s*([\d.]+)/) || [,'330'])[1]),
      spots: (() => {
        const block = src.match(/[g_]Spots\s*=\s*\[([\s\S]*?)\];?/);
        if (!block) return [{ xFrac:0.4, yFrac:0.45 }, { xFrac:0.5, yFrac:0.45 }, { xFrac:0.6, yFrac:0.45 }, { xFrac:0.7, yFrac:0.45 }];
        const raw = block[1];
        const rows = [...raw.matchAll(/W\s*\*\s*([\d.e-]+)[\s\S]*?H\s*\*\s*([\d.e-]+)/g)];
        return rows.map(r => ({ xFrac: parseFloat(r[1]), yFrac: parseFloat(r[2]) }));
      })(),
    },
    workerZone: {
      height: parseFloat((src.match(/[w_]H\s*=\s*([\d.]+)/) || [,'150'])[1]),
      spots: (() => {
        const block = src.match(/[w_]Spots\s*=\s*\[([\s\S]*?)\];?/);
        if (!block) return [
          { xFrac:0.35, yFrac:0.85 }, { xFrac:0.50, yFrac:0.85 }, { xFrac:0.65, yFrac:0.85 },
          { xFrac:0.40, yFrac:0.95 }, { xFrac:0.60, yFrac:0.95 }
        ];
        const raw = block[1];
        // Robust multi-line regex for spot coordinates
        const rows = [...raw.matchAll(/W\s*\*\s*([\d.e-]+)[\s\S]*?H\s*\*\s*([\d.e-]+)/g)];
        return rows.map(r => ({ xFrac: parseFloat(r[1]), yFrac: parseFloat(r[2]) }));
      })(),
    },
    serverRoom: {
      // Parse the 4 spots from ServerRoomScene._onSpawnMachine
      spots: (() => {
        const block = src.match(/const spots = \[(\s*[\s\S]*?)\];/);
        if (!block) return [
          { xFrac:0.40, yFrac:0.55 }, { xFrac:0.60, yFrac:0.55 },
          { xFrac:0.40, yFrac:0.79 }, { xFrac:0.60, yFrac:0.79 },
        ];
        const raw = block[1];
        const rows = [...raw.matchAll(/W\s*\*\s*([\d.]+).*?H\s*\*\s*([\d.]+)/g)];
        return rows.map(r => ({ xFrac: parseFloat(r[1]), yFrac: parseFloat(r[2]) }));
      })(),
      // Parse the +/-90 offset used  (W*0.5 ± offset → derive from first spot xFrac)
      offsetX: (() => {
        const m = src.match(/W\s*\*\s*0\.5\s*-\s*([\d.]+)/);
        return m ? parseFloat(m[1]) : 90;
      })(),
    },
    canvasW: 1208,
    canvasH: 600,
  };
  res.json(zones);
});

// ─── POST /api/zones ─────────────────────────────────────────────
// Patch _buildZones() and ServerRoomScene spots[] in phaser-scene.js
app.post('/api/zones', (req, res) => {
  const sceneFile = path.join(ROOT, 'js', 'phaser-scene.js');
  if (!fs.existsSync(sceneFile)) return res.status(404).json({ error: 'phaser-scene.js not found' });

  const { machineZone, gpuZone, workerZone, serverRoom } = req.body;
  let src = fs.readFileSync(sceneFile, 'utf8');

  // Patch machineZone
  if (machineZone) {
    src = src
      .replace(/(const mStartX\s*=\s*Math\.round\(W\s*\*\s*)[\d.]+(\))/, `$1${machineZone.leftMarginFrac.toFixed(4)}$2`)
      .replace(/(const RIGHT_MARGIN\s*=\s*Math\.round\(W\s*\*\s*)[\d.]+(\))/, `$1${machineZone.rightMarginFrac.toFixed(4)}$2`)
      .replace(/(const mStartY\s*=\s*Math\.round\(H\s*\*\s*)[\d.]+(\))/, `$1${machineZone.startYFrac.toFixed(4)}$2`)
      .replace(/(const mSpacingX\s*=\s*)[\d.]+/, `$1${Math.round(machineZone.spacingX)}`)
      .replace(/(const mSpacingY\s*=\s*)[\d.]+/, `$1${Math.round(machineZone.spacingY)}`)
      .replace(/(const mH\s*=\s*)[\d.]+/, `$1${Math.round(machineZone.height)}`);
  }

  // Patch gpuZone (4 spots)
  if (gpuZone) {
    src = src.replace(/((?:const g|this\._gpu)H\s*=\s*)[\d.]+/, `$1${Math.round(gpuZone.height)}`);
    src = src.replace(/((?:const g|this\._gpu)W\s*=\s*)[\d.]+/, `$1${Math.round(gpuZone.width)}`);
    const spotsStr = gpuZone.spots.map(s => `      { x: W * ${s.xFrac.toFixed(4)}, y: H * ${s.yFrac.toFixed(4)} }`).join(',\n');
    src = src.replace(/((?:const g|this\._gpu)Spots\s*=\s*\[)[\s\S]*?(\];?)/, `$1\n${spotsStr}\n    $2`);
  }

  // Patch workerZone
  if (workerZone) {
    src = src
      .replace(/(const wH\s*=\s*)[\d.]+/, `$1${Math.round(workerZone.height)}`);
    
    if (workerZone.spots && workerZone.spots.length > 0) {
      const sp = workerZone.spots;
      const newSpots = sp.map((s, i) => {
        return `      { x: W * ${s.xFrac.toFixed(4)}, y: H * ${s.yFrac.toFixed(4)} }${i < sp.length-1 ? ',' : ''}`;
      }).join('\n');
      src = src.replace(
        /const wSpots = \[([\s\S]*?)\];/,
        `const wSpots = [\n${newSpots}\n    ];`
      );
    }
  }

  // Patch serverRoom spots[]
  if (serverRoom && serverRoom.spots && serverRoom.spots.length === 4) {
    const sp = serverRoom.spots;
    // Reconstruct offsets from absolute fracs — spots[0] is W*0.5 - offsetX
    // We now store as plain fracs:
    const newSpots = sp.map((s, i) => {
      const label = ['back left','back right','front left','front right'][i];
      return `      { x: W * ${s.xFrac.toFixed(4)}, y: H * ${s.yFrac.toFixed(4)} }, // ${label}`;
    }).join('\n');
    src = src.replace(
      /const spots = \[([\s\S]*?)\];/,
      `const spots = [\n${newSpots}\n    ];`
    );
  }

  fs.writeFileSync(sceneFile, src, 'utf8');
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n  ✅  ChillGPT Editor Server running!');
  console.log(`  🌐  Open: http://localhost:${PORT}/editor.html\n`);
});
