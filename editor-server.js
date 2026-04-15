/**
 * ChillGPT Empire — Visual Layout Editor Server
 * Serves editor.html and provides file-read/write APIs so
 * the browser editor can directly update phaser-scene.js
 */
const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const http     = require('http');

const app  = express();
const ROOT = __dirname;
const PORT = 3333;

app.use(express.json({ limit: '8mb' }));
app.use(express.static(ROOT));   // serve all static files (editor.html, assets/, js/, css/)

// ─── CORS for local dev ────────────────────────────────────────
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ─── READ layout state ────────────────────────────────────────
// Returns the current kpe/layout.json (our editor save file)
app.get('/api/layout', (req, res) => {
  const file = path.join(ROOT, 'kpe', 'layout.json');
  if (!fs.existsSync(file)) return res.json({ objects: [] });
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});

// ─── SAVE layout state ────────────────────────────────────────
// Saves layout.json AND regenerates the injected section in phaser-scene.js
app.post('/api/layout', (req, res) => {
  const layout = req.body;
  if (!layout || !Array.isArray(layout.objects)) {
    return res.status(400).json({ error: 'Invalid layout data' });
  }

  // 1. Save layout.json
  const kpeDir = path.join(ROOT, 'kpe');
  if (!fs.existsSync(kpeDir)) fs.mkdirSync(kpeDir);
  fs.writeFileSync(path.join(kpeDir, 'layout.json'), JSON.stringify(layout, null, 2));

  // 2. Rebuild phaser-scene.js injected section
  const sceneFile = path.join(ROOT, 'js', 'phaser-scene.js');
  if (!fs.existsSync(sceneFile)) {
    return res.json({ ok: true, scene: false, message: 'layout.json saved; phaser-scene.js not found' });
  }

  let src = fs.readFileSync(sceneFile, 'utf8');
  const OPEN  = '// ── EDITOR_LAYOUT_BEGIN ──';
  const CLOSE = '// ── EDITOR_LAYOUT_END ──';

  // Build the injected code block
  const injected = buildInjectedCode(layout.objects);
  const block = `${OPEN}\n${injected}\n  ${CLOSE}`;

  if (src.includes(OPEN)) {
    // Replace existing block
    const re = new RegExp(`${escapeRe(OPEN)}[\\s\\S]*?${escapeRe(CLOSE)}`, 'g');
    src = src.replace(re, block);
  } else {
    // Insert before final closing brace of create()
    // We look for _syncWithGameState to insert just before it
    const target = '    // 6. Replay items already purchased';
    if (src.includes(target)) {
      src = src.replace(target, `    ${block}\n\n    ${target.trim()}`);
    } else {
      // fallback — append to end of create() before final }
      src = src.replace('_syncWithGameState();', `_syncWithGameState();\n\n    ${block}`);
    }
  }

  fs.writeFileSync(sceneFile, src, 'utf8');
  res.json({ ok: true, scene: true });
});

// ─── READ phaser-scene.js ─────────────────────────────────────
app.get('/api/scene-source', (req, res) => {
  const file = path.join(ROOT, 'js', 'phaser-scene.js');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
  res.json({ source: fs.readFileSync(file, 'utf8') });
});

// ─── LIST assets ─────────────────────────────────────────────
app.get('/api/assets', (req, res) => {
  const dir = path.join(ROOT, 'assets', 'images');
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir)
    .filter(f => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f))
    .map(f => ({
      key:      f.replace(/\.[^.]+$/, ''),
      src:      `assets/images/${f}`,
      isSprite: f.includes('_sheet') || f.includes('_anim'),
      label:    f.replace(/\.[^.]+$/, ''),
    }));
  res.json(files);
});

// ─────────────────────────────────────────────────────────────
// CODE GENERATOR — builds create() snippet from layout objects
// ─────────────────────────────────────────────────────────────
function buildInjectedCode(objects) {
  const lines = [];
  lines.push('// ── Placed by Visual Layout Editor ──');

  objects.filter(o => !o._hidden).forEach(obj => {
    const varName = sanitize(obj.name || 'obj') + '_' + obj.id;
    const cx = Math.round(obj.x + obj.w / 2);
    const cy = Math.round(obj.y + obj.h / 2);

    if (obj.type === 'image') {
      if (obj.isSprite) {
        lines.push(`    const ${varName} = this.add.sprite(${cx}, ${cy}, '${obj.key}', 0)`);
        lines.push(`      .setOrigin(${f2(obj.originX ?? 0.5)}, ${f2(obj.originY ?? 0.5)})`);
        lines.push(`      .setDisplaySize(${Math.round(obj.w)}, ${Math.round(obj.h)})`);
        lines.push(`      .setDepth(${obj.depth ?? 1})`);
        lines.push(`      .setAlpha(${f2(obj.alpha ?? 1)});`);
        if (obj.rotation) lines.push(`    ${varName}.setAngle(${Math.round(obj.rotation)});`);
        if (obj.flipX)    lines.push(`    ${varName}.setFlipX(true);`);
        if (obj.flipY)    lines.push(`    ${varName}.setFlipY(true);`);
        if (obj.anim)     lines.push(`    ${varName}.play('${obj.anim}');`);
      } else {
        lines.push(`    const ${varName} = this.add.image(${cx}, ${cy}, '${obj.key}')`);
        lines.push(`      .setOrigin(${f2(obj.originX ?? 0.5)}, ${f2(obj.originY ?? 0.5)})`);
        lines.push(`      .setDisplaySize(${Math.round(obj.w)}, ${Math.round(obj.h)})`);
        lines.push(`      .setDepth(${obj.depth ?? 1})`);
        lines.push(`      .setAlpha(${f2(obj.alpha ?? 1)});`);
        if (obj.rotation) lines.push(`    ${varName}.setAngle(${Math.round(obj.rotation)});`);
        if (obj.flipX)    lines.push(`    ${varName}.setFlipX(true);`);
        if (obj.flipY)    lines.push(`    ${varName}.setFlipY(true);`);
      }
    } else if (obj.type === 'shape') {
      const hexRaw = parseInt((obj.color || '#888888').replace('#', ''), 16);
      const hex6 = hexRaw.toString(16).padStart(6, '0');
      if (obj.shape === 'text') {
        const escaped = (obj.text || 'LABEL').replace(/'/g, "\\'");
        lines.push(`    const ${varName} = this.add.text(${cx}, ${cy}, '${escaped}', {`);
        lines.push(`      fontFamily: '"Press Start 2P", monospace',`);
        lines.push(`      fontSize: '${obj.fontSize || 16}px',`);
        lines.push(`      color: '${obj.color || '#ffffff'}',`);
        lines.push(`    })`);
        lines.push(`      .setOrigin(${f2(obj.originX ?? 0.5)}, ${f2(obj.originY ?? 0.5)})`);
        lines.push(`      .setDepth(${obj.depth ?? 1})`);
        lines.push(`      .setAlpha(${f2(obj.alpha ?? 1)});`);
        if (obj.rotation) lines.push(`    ${varName}.setAngle(${Math.round(obj.rotation)});`);
      } else {
        lines.push(`    const ${varName} = this.add.graphics().setDepth(${obj.depth ?? 1}).setAlpha(${f2(obj.alpha ?? 1)});`);
        if (obj.shape === 'circle') {
          lines.push(`    ${varName}.fillStyle(0x${hex6}, 1);`);
          lines.push(`    ${varName}.fillCircle(${cx}, ${cy}, ${Math.round(Math.min(obj.w, obj.h) / 2)});`);
        } else {
          lines.push(`    ${varName}.fillStyle(0x${hex6}, 1);`);
          lines.push(`    ${varName}.fillRect(${Math.round(obj.x)}, ${Math.round(obj.y)}, ${Math.round(obj.w)}, ${Math.round(obj.h)});`);
          if (obj.shape === 'zone') {
            lines.push(`    ${varName}.lineStyle(2, 0x${hex6}, 0.8);`);
            lines.push(`    ${varName}.strokeRect(${Math.round(obj.x)}, ${Math.round(obj.y)}, ${Math.round(obj.w)}, ${Math.round(obj.h)});`);
          }
        }
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}

function sanitize(s) { return s.replace(/[^a-zA-Z0-9_]/g, '_'); }
function f2(n) { return parseFloat(n).toFixed(2); }
function escapeRe(s) { return s.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&'); }

// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n  ✅  ChillGPT Editor Server running!');
  console.log(`  🌐  Open: http://localhost:${PORT}/editor.html\n`);
});
