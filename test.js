
'use strict';
// ─── CONSTANTS — must match GAME_W / GAME_H in phaser-scene.js ────
const W = 1208, H = 600;        // ← same as Phaser fixed canvas size
const SERVER = 'http://localhost:3333';

// ─── STATE ─────────────────────────────────────────────────────
let zoom     = 0.45;
let objects  = [];
let selId    = null;
let nextId   = 1;
let undoStack = [];
let dirty    = false;

let dragAsset      = null;
let isDrag         = false, dragSt   = {};
let isResize       = false, resizeSt = {}, resizeHdl = '';
let isRotate       = false, rotateSt = {};

const vp     = document.getElementById('vp');
const layer  = document.getElementById('obj-layer');
const bgImg  = document.getElementById('vp-bg');

// ─── INIT ──────────────────────────────────────────────────────
async function init() {
  vp.style.width  = W + 'px';
  vp.style.height = H + 'px';
  await loadAssets();
  await loadLayout();
  fitZoom();
  window.addEventListener('resize', fitZoom);
  markClean();
}

// ─── LOAD ASSETS FROM SERVER ────────────────────────────────────
async function loadAssets() {
  try {
    const res = await fetch(`${SERVER}/api/assets`);
    const list = await res.json();
    buildAssetGrid(list);
  } catch {
    // fallback — uses CORRECT Phaser texture keys matching preload()
    const fallback = [
      { key:'bg',          src:'assets/images/bg.png',           isSprite:false, isNew:false, label:'bg' },
      { key:'desk',        src:'assets/images/desk1.png',         isSprite:false, isNew:false, label:'desk' },
      { key:'gpu',         src:'assets/images/gpu.png',           isSprite:false, isNew:false, label:'gpu' },
      { key:'server',      src:'assets/images/server.png',        isSprite:false, isNew:false, label:'server' },
      { key:'gpu_anim',    src:'assets/images/gpu_sheet.png',     isSprite:true,  isNew:false, label:'gpu_anim (sheet)' },
      { key:'gpu_anim2',   src:'assets/images/gpu_sheet1.png',    isSprite:true,  isNew:false, label:'gpu_anim2' },
      { key:'server_anim', src:'assets/images/server_sheet.png',  isSprite:true,  isNew:false, label:'server_anim' },
      { key:'worker_anim', src:'assets/images/worker_sheet.png',  isSprite:true,  isNew:false, label:'worker_anim' },
      { key:'worker_anim2',src:'assets/images/worker_sheet2.png', isSprite:true,  isNew:false, label:'worker_anim2' },
    ];
    buildAssetGrid(fallback);
  }
}

function buildAssetGrid(list) {
  const grid = document.getElementById('asset-grid');
  grid.innerHTML = '';
  list.forEach(a => {
    const el = document.createElement('div');
    el.className = 'at'; el.draggable = true;
    // isNew = needs a new preload() entry (server will auto-inject it)
    const newWarn = a.isNew ? ' ⚠ needs preload' : '';
    el.title = `Key: ${a.key}${newWarn}\nFile: ${a.src}`;
    if (a.isSprite) el.innerHTML += `<span class="sps">SPS</span>`;
    if (a.isNew)    el.innerHTML += `<span class="sps" style="background:var(--yellow);color:#0c0d13;right:auto;left:3px">NEW</span>`;
    const img = document.createElement('img');
    img.src = a.src; img.alt = a.key;
    el.appendChild(img);
    const nm = document.createElement('div');
    nm.className = 'nm';
    // Show the actual Phaser key prominently
    nm.textContent = a.key;
    nm.title = a.label;
    el.appendChild(nm);
    el.addEventListener('dragstart', e => {
      // Always use the Phaser texture key, not the filename
      dragAsset = { type:'image', key:a.key, src:a.src, isSprite:a.isSprite, isNew:a.isNew, file:a.file };
      e.dataTransfer.effectAllowed = 'copy';
    });
    grid.appendChild(el);
  });
  // shapes drag
  document.querySelectorAll('.shp').forEach(btn => {
    btn.addEventListener('dragstart', e => {
      dragAsset = { type:'shape', shape:btn.dataset.shape, color:btn.dataset.color };
      e.dataTransfer.effectAllowed = 'copy';
    });
  });
}

// ─── LOAD SAVED LAYOUT ──────────────────────────────────────────
async function loadLayout() {
  try {
    const res = await fetch(`${SERVER}/api/layout`);
    const data = await res.json();
    if (data.objects && data.objects.length) {
      data.objects.forEach(o => {
        objects.push(o);
        nextId = Math.max(nextId, o.id + 1);
        renderObj(o);
      });
      refreshHier(); updateStatusCounts();
      toast(`Loaded ${data.objects.length} object(s) from saved layout ✓`, 3000);
    }
  } catch { /* no saved layout yet */ }
  // auto-load bg
  const bg = bgImg;
  bg.src = 'assets/images/bg.png';
  bg.style.display = 'block';
  bg.onerror = () => bg.style.display = 'none';
}

// ─── SAVE LAYOUT TO SERVER (writes phaser-scene.js) ────────────
async function saveLayout() {
  markSaving();
  try {
    const res = await fetch(`${SERVER}/api/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects }),
    });
    const data = await res.json();
    dirty = false;
    markClean();
    toast(data.scene
      ? '✅ Saved! phaser-scene.js updated directly!'
      : '✅ Saved layout.json (phaser-scene.js not found — check server)');
  } catch {
    toast('⚠ Could not reach editor server. Run: node editor-server.js', 5000);
    markDirty();
  }
}

function markSaving() {
  const el = document.getElementById('save-indicator');
  el.textContent = '● saving…'; el.className = 'saving';
}
function markClean() {
  const el = document.getElementById('save-indicator');
  el.textContent = '✓ saved'; el.className = 'saved'; dirty = false;
}
function markDirty() {
  if (dirty) return;
  const el = document.getElementById('save-indicator');
  el.textContent = '● unsaved'; el.className = ''; dirty = true;
}

// ─── ZOOM ───────────────────────────────────────────────────────
function applyZoom() {
  vp.style.transform = `scale(${zoom})`;
  document.getElementById('zoom-lbl').textContent = Math.round(zoom * 100) + '%';
}
function fitZoom() {
  const area = document.getElementById('canvas-area');
  const pad = 32;
  zoom = Math.min((area.clientWidth - pad) / W, (area.clientHeight - pad) / H, 1);
  applyZoom(); centerVP();
}
function centerVP() {
  const area = document.getElementById('canvas-area');
  const vw = W * zoom, vh = H * zoom;
  vp.style.left = Math.max(0, (area.clientWidth  - vw) / 2) + 'px';
  vp.style.top  = Math.max(0, (area.clientHeight - vh) / 2) + 'px';
  vp.style.position = 'absolute';
}

document.getElementById('zin').addEventListener('click', ()=>{ zoom=Math.min(zoom+.1, 3); applyZoom(); centerVP(); });
document.getElementById('zout').addEventListener('click',()=>{ zoom=Math.max(zoom-.1,.1); applyZoom(); centerVP(); });
document.getElementById('zfit').addEventListener('click', fitZoom);
document.getElementById('canvas-area').addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoom = Math.max(.1, Math.min(3, zoom + (e.deltaY < 0 ? .06 : -.06)));
  applyZoom(); centerVP();
}, { passive:false });

// ─── DROP ───────────────────────────────────────────────────────
vp.addEventListener('dragover', e => { e.preventDefault(); vp.classList.add('drop-over'); });
vp.addEventListener('dragleave', ()=> vp.classList.remove('drop-over'));
vp.addEventListener('drop', e => {
  e.preventDefault(); vp.classList.remove('drop-over');
  if (!dragAsset) return;
  const rect = vp.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / zoom;
  const cy = (e.clientY - rect.top)  / zoom;
  pushUndo();
  if (dragAsset.type === 'image') {
    addObj({ type:'image', key:dragAsset.key, src:dragAsset.src, isSprite:dragAsset.isSprite,
      name:dragAsset.key, x:cx-64, y:cy-64, w:128, h:128,
      rotation:0, alpha:1, depth:nextId, originX:.5, originY:.5, flipX:false, flipY:false });
  } else {
    const def = { rect:{w:160,h:80}, circle:{w:100,h:100}, text:{w:200,h:50},
                  zone:{w:240,h:120}, line:{w:200,h:4}, freeimg:{w:128,h:128} };
    const d = def[dragAsset.shape] || {w:120,h:80};
    addObj({ type:'shape', shape:dragAsset.shape, color:dragAsset.color,
      name:dragAsset.shape, text:'LABEL', fontSize:16,
      x:cx-d.w/2, y:cy-d.h/2, w:d.w, h:d.h,
      rotation:0, alpha: dragAsset.shape==='zone' ? .25 : .85,
      depth:nextId, originX:.5, originY:.5 });
  }
  dragAsset = null;
  markDirty();
});

// ─── OBJECT MANAGEMENT ──────────────────────────────────────────
function addObj(data) {
  const obj = { id: nextId++, ...data };
  objects.push(obj);
  renderObj(obj);
  select(obj.id);
  refreshHier(); updateStatusCounts(); markDirty();
}

function getObj(id) { return objects.find(o => o.id === +id); }

function renderObj(obj) {
  const el = document.createElement('div');
  el.className = 'sobj'; el.id = 'o'+obj.id; el.dataset.id = obj.id;
  applyStyle(el, obj);

  if (obj.type === 'image') {
    const img = document.createElement('img');
    img.src = obj.src || `assets/images/${obj.key}.png`; img.draggable = false;
    el.appendChild(img);
  } else {
    let inner;
    if (obj.shape === 'circle') {
      inner = document.createElement('div'); inner.className = 's-circ';
      inner.style.background = obj.color;
    } else if (obj.shape === 'text') {
      inner = document.createElement('div'); inner.className = 's-text';
      inner.style.color = obj.color; inner.style.fontSize = (obj.fontSize||16)+'px';
      inner.textContent = obj.text || 'LABEL';
    } else {
      inner = document.createElement('div'); inner.className = 's-rect';
      inner.style.background = obj.color;
      if (obj.shape === 'zone') { inner.style.background='transparent'; inner.style.border=`2px dashed ${obj.color}`; }
    }
    el.appendChild(inner);
  }
  el.addEventListener('mousedown', onObjDown);
  layer.appendChild(el);
}

function applyStyle(el, obj) {
  el.style.left      = obj.x + 'px';
  el.style.top       = obj.y + 'px';
  el.style.width     = obj.w + 'px';
  el.style.height    = obj.h + 'px';
  el.style.opacity   = obj.alpha ?? 1;
  el.style.zIndex    = obj.depth ?? 1;
  el.style.transform = `rotate(${obj.rotation||0}deg)`;
  el.style.display   = obj._hidden ? 'none' : '';
}

function syncStyle(id) {
  const obj = getObj(id); if (!obj) return;
  const el = document.getElementById('o'+id); if (!el) return;
  applyStyle(el, obj);
  if (obj.type === 'shape') {
    const inner = el.firstElementChild;
    if (!inner) return;
    if (obj.shape === 'text') {
      inner.textContent = obj.text || 'LABEL';
      inner.style.color = obj.color;
      inner.style.fontSize = (obj.fontSize||16) + 'px';
    } else if (obj.shape !== 'zone') {
      inner.style.background = obj.color;
    } else {
      inner.style.border = `2px dashed ${obj.color}`;
    }
  }
}

// ─── SELECTION ───────────────────────────────────────────────────
function select(id) {
  deselect();
  selId = +id;
  const obj = getObj(selId); if (!obj) return;
  const el = document.getElementById('o'+selId);
  if (el) { el.classList.add('sel'); addHandles(el); }
  showProps(obj);
  refreshHier();
  document.getElementById('st-sel').textContent = obj.name || 'obj'+selId;
}
function deselect() {
  if (selId) {
    const el = document.getElementById('o'+selId);
    if (el) { el.classList.remove('sel'); removeHandles(el); }
  }
  selId = null;
  showPropsEmpty();
  refreshHier();
  document.getElementById('st-sel').textContent = 'none';
}

// click canvas background → deselect
vp.addEventListener('mousedown', e => {
  if (e.target === vp || e.target.id === 'obj-layer' ||
      e.target.id === 'vp-bg' || e.target.id === 'vp-grid' || e.target.id ==='vp-grid-minor') {
    deselect();
  }
});

// ─── HANDLES ────────────────────────────────────────────────────
const HDL = ['tl','tm','tr','ml','mr','bl','bm','br','rot'];
function addHandles(el) {
  removeHandles(el);
  const rl = document.createElement('div'); rl.className = 'rot-line'; rl.dataset.rl='1'; el.appendChild(rl);
  HDL.forEach(h => {
    const d = document.createElement('div');
    d.className = 'hdl '+h; d.dataset.hdl = h;
    d.addEventListener('mousedown', onHdlDown);
    el.appendChild(d);
  });
}
function removeHandles(el) {
  el.querySelectorAll('[data-hdl],[data-rl]').forEach(x=>x.remove());
}

// ─── DRAG: OBJECT MOVE ──────────────────────────────────────────
function onObjDown(e) {
  if (e.button !== 0 || e.target.dataset.hdl) return;
  const id = +e.currentTarget.dataset.id;
  if (selId !== id) select(id);
  if (!selId) return;
  isDrag = true;
  const obj = getObj(selId);
  dragSt = { mx:e.clientX, my:e.clientY, ox:obj.x, oy:obj.y };
  e.preventDefault();
}

// ─── DRAG: HANDLE (RESIZE / ROTATE) ─────────────────────────────
function onHdlDown(e) {
  if (!selId) return;
  const h = e.target.dataset.hdl;
  const obj = getObj(selId);
  if (h === 'rot') {
    const el = document.getElementById('o'+selId);
    const r  = el.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    isRotate = true;
    rotateSt = { cx, cy, start: obj.rotation||0, ma: atan2(cx,cy,e.clientX,e.clientY) };
  } else {
    isResize = true; resizeHdl = h;
    resizeSt = { mx:e.clientX, my:e.clientY, ox:obj.x, oy:obj.y, ow:obj.w, oh:obj.h };
  }
  e.preventDefault(); e.stopPropagation();
}

function atan2(cx,cy,mx,my) { return Math.atan2(my-cy, mx-cx) * 180/Math.PI; }

// ─── GLOBAL MOUSE MOVE/UP ──────────────────────────────────────
document.addEventListener('mousemove', e => {
  // update cursor coords in status bar
  const r = vp.getBoundingClientRect();
  const mx = (e.clientX - r.left)/zoom, my = (e.clientY - r.top)/zoom;
  document.getElementById('st-x').textContent = Math.round(mx);
  document.getElementById('st-y').textContent = Math.round(my);

  if (!selId) return;
  const obj = getObj(selId);

  if (isDrag) {
    const dx = (e.clientX - dragSt.mx)/zoom;
    const dy = (e.clientY - dragSt.my)/zoom;
    obj.x = snap(dragSt.ox + dx);
    obj.y = snap(dragSt.oy + dy);
    syncStyle(selId); updatePropsLive();
  }

  if (isResize) {
    const dx = (e.clientX - resizeSt.mx)/zoom;
    const dy = (e.clientY - resizeSt.my)/zoom;
    const h = resizeHdl, { ox,oy,ow,oh } = resizeSt;
    if (h.includes('r')) obj.w = Math.max(4, snap(ow+dx));
    if (h.includes('l')) { obj.w = Math.max(4, snap(ow-dx)); obj.x = snap(ox+dx); }
    if (h.includes('b')) obj.h = Math.max(4, snap(oh+dy));
    if (h.includes('t')) { obj.h = Math.max(4, snap(oh-dy)); obj.y = snap(oy+dy); }
    syncStyle(selId); updatePropsLive();
  }

  if (isRotate) {
    const cur = atan2(rotateSt.cx, rotateSt.cy, e.clientX, e.clientY);
    let rot = rotateSt.start + (cur - rotateSt.ma);
    if (e.shiftKey) rot = Math.round(rot/15)*15;
    obj.rotation = rot;
    syncStyle(selId); updatePropsLive();
  }
});

document.addEventListener('mouseup', () => {
  if (isDrag || isResize || isRotate) { pushUndo(); markDirty(); }
  isDrag = isResize = isRotate = false; resizeHdl = '';
});

// ─── SNAP ───────────────────────────────────────────────────────
function snap(v) {
  if (!document.getElementById('snap-on').checked) return v;
  const sz = parseInt(document.getElementById('snap-sz').value) || 10;
  return Math.round(v/sz)*sz;
}

// ─── KEYBOARD ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.activeElement !== document.body) return; // don't interfere with inputs
  if ((e.key==='Delete'||e.key==='Backspace') && selId) { e.preventDefault(); deleteObj(selId); }
  if (e.ctrlKey && e.key==='z') { e.preventDefault(); undo(); }
  if (e.ctrlKey && e.key==='d' && selId) { e.preventDefault(); dupObj(selId); }
  if (e.ctrlKey && e.key==='s') { e.preventDefault(); saveLayout(); }
  if (selId && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const a = e.shiftKey ? 10 : 1, obj = getObj(selId);
    if (e.key==='ArrowUp')    obj.y -= a;
    if (e.key==='ArrowDown')  obj.y += a;
    if (e.key==='ArrowLeft')  obj.x -= a;
    if (e.key==='ArrowRight') obj.x += a;
    syncStyle(selId); updatePropsLive(); markDirty();
  }
  if (e.key==='Escape') deselect();
});

// ─── DELETE / DUP ───────────────────────────────────────────────
function deleteObj(id) {
  pushUndo();
  const el = document.getElementById('o'+id); if (el) el.remove();
  objects = objects.filter(o => o.id !== +id);
  if (selId === +id) { selId = null; showPropsEmpty(); }
  refreshHier(); updateStatusCounts(); markDirty();
}
function dupObj(id) {
  const orig = getObj(id); if (!orig) return;
  pushUndo();
  addObj({ ...orig, id:undefined, x:orig.x+20, y:orig.y+20, name:(orig.name||'obj')+'_copy' });
}

// ─── UNDO ────────────────────────────────────────────────────────
function pushUndo() { undoStack.push(JSON.stringify(objects)); if (undoStack.length>60) undoStack.shift(); }
function undo() {
  if (!undoStack.length) return;
  const prev = JSON.parse(undoStack.pop());
  layer.querySelectorAll('.sobj').forEach(el=>el.remove());
  objects = prev; nextId = Math.max(1, ...objects.map(o=>o.id+1));
  objects.forEach(renderObj);
  selId = null; showPropsEmpty(); refreshHier(); updateStatusCounts(); markDirty();
  toast('Undo ✓');
}

// ─── HIERARCHY LIST ──────────────────────────────────────────────
function refreshHier() {
  const list = document.getElementById('hier-list');
  list.innerHTML = '';
  document.getElementById('obj-count').textContent = objects.length + ' objects';
  [...objects].reverse().forEach(obj => {
    const el = document.createElement('div');
    el.className = 'hi' + (selId===obj.id ? ' sel' : '');
    el.dataset.id = obj.id;
    el.innerHTML = `
      <span class="hico">${obj.type==='image'?'🖼':obj.shape==='text'?'Aa':obj.shape==='circle'?'○':'□'}</span>
      <span class="hnm">${obj.name||'obj'+obj.id}</span>
      <span class="hact" data-vis="${obj.id}" title="toggle">${obj._hidden?'🙈':'👁'}</span>
      <span class="hact" data-del="${obj.id}" title="delete" style="color:var(--red)">✕</span>`;
    el.addEventListener('click', ev => {
      if (ev.target.dataset.del) { deleteObj(+ev.target.dataset.del); return; }
      if (ev.target.dataset.vis) {
        const o = getObj(+ev.target.dataset.vis);
        if (o) { o._hidden = !o._hidden; syncStyle(o.id); refreshHier(); markDirty(); }
        return;
      }
      select(+el.dataset.id);
    });
    list.appendChild(el);
  });
}

// ─── PROPERTIES PANEL ───────────────────────────────────────────
function showPropsEmpty() {
  document.getElementById('props-body').innerHTML =
    `<div class="empty-sel"><div class="eico">🎯</div><p>Select an object on<br>the canvas, or drag<br>an asset to begin.</p></div>`;
}

function showProps(obj) {
  const pb = document.getElementById('props-body');
  let html = '';

  html += sect('Transform',
    row('X',      num('p-x',   Math.round(obj.x), -W, W)) +
    row('Y',      num('p-y',   Math.round(obj.y), -H, H)) +
    row('Width',  num('p-w',   Math.round(obj.w), 1, W*2)) +
    row('Height', num('p-h',   Math.round(obj.h), 1, H*2)) +
    row('Angle °',num('p-rot', Math.round(obj.rotation||0), -360, 360))
  );

  html += sect('Appearance',
    row('Alpha',  `<input type="range" class="pi" id="p-alpha" min="0" max="1" step=".01" value="${obj.alpha??1}"/><span class="pu" id="p-alpha-v">${(obj.alpha??1).toFixed(2)}</span>`) +
    row('Depth',  num('p-depth', obj.depth??1, 0, 200)) +
    (obj.type==='image' ?
      row('FlipX', `<input type="checkbox" class="pi" id="p-fx" ${obj.flipX?'checked':''} />`) +
      row('FlipY', `<input type="checkbox" class="pi" id="p-fy" ${obj.flipY?'checked':''} />`)
    : row('Color', `<input type="color" class="pi" id="p-col" value="${obj.color||'#7b68ee'}"/>`))
  );

  html += sect('Origin (0–1)',
    row('Orig X', num('p-ox', obj.originX??0.5, 0, 1, .05)) +
    row('Orig Y', num('p-oy', obj.originY??0.5, 0, 1, .05))
  );

  if (obj.type==='shape' && obj.shape==='text') {
    html += sect('Text',
      row('Text',    `<input type="text" class="pi" id="p-txt" value="${esc(obj.text||'')}" />`) +
      row('Px Size', num('p-fsz', obj.fontSize||16, 4, 200))
    );
  }

  html += sect('Phaser',
    row('Name', `<input type="text" class="pi" id="p-name" value="${esc(obj.name||'')}"/>`) +
    (obj.type==='image' ? row('Key', `<input class="pi" style="color:var(--accent3)" value="${esc(obj.key||'')}" readonly/>`) : '') +
    (obj.isSprite ? row('Anim', `<input type="text" class="pi" id="p-anim" placeholder="e.g. server_blink" value="${esc(obj.anim||'')}"/>`) : '')
  );

  html += sect('Actions', `<div class="qa-row">
    <button class="tbtn" id="qa-dup">⧉ Dup</button>
    <button class="tbtn warn" id="qa-del">🗑 Del</button>
    <button class="tbtn" id="qa-front">▲ Front</button>
    <button class="tbtn" id="qa-back">▼ Back</button>
    <button class="tbtn" id="qa-fh">↔ FlipH</button>
    <button class="tbtn" id="qa-fv">↕ FlipV</button>
    <button class="tbtn" id="qa-rr">↺ 0°</button>
  </div>`);

  pb.innerHTML = html;
  bindProps(obj);
}

function sect(title, body) { return `<div class="psh">${title}</div>${body}<div style="height:4px"></div>`; }
function row(label, inp)   { return `<div class="pr"><label>${label}</label><div class="ig">${inp}</div></div>`; }
function num(id, val, min, max, step=1) {
  return `<input type="number" class="pi" id="${id}" value="${val}" min="${min}" max="${max}" step="${step}" />`;
}
function esc(s) { return s.replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function updatePropsLive() {
  const obj = getObj(selId); if (!obj) return;
  [['p-x',obj.x],['p-y',obj.y],['p-w',obj.w],['p-h',obj.h],['p-rot',obj.rotation||0]].forEach(([id,v])=>{
    const el=document.getElementById(id); if(el) el.value=Math.round(v);
  });
}

function bindProps(obj) {
  function bind(id, field, type='num') {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('input', () => {
      obj[field] = type==='num' ? parseFloat(el.value)||0
                 : type==='bool' ? el.checked : el.value;
      syncStyle(obj.id); markDirty();
    });
    el.addEventListener('change', () => { pushUndo(); markDirty(); });
  }
  bind('p-x','x'); bind('p-y','y'); bind('p-w','w'); bind('p-h','h');
  bind('p-rot','rotation'); bind('p-depth','depth');
  bind('p-ox','originX'); bind('p-oy','originY');
  bind('p-fx','flipX','bool'); bind('p-fy','flipY','bool');
  bind('p-col','color','str'); bind('p-txt','text','str');
  bind('p-fsz','fontSize'); bind('p-name','name','str'); bind('p-anim','anim','str');

  const alphaEl = document.getElementById('p-alpha');
  const alphaV  = document.getElementById('p-alpha-v');
  if (alphaEl) alphaEl.addEventListener('input', () => {
    obj.alpha = parseFloat(alphaEl.value); alphaV.textContent = obj.alpha.toFixed(2);
    syncStyle(obj.id); markDirty();
  });

  // quick actions
  const g = id => document.getElementById(id);
  g('qa-dup')?.addEventListener('click',   ()=> dupObj(obj.id));
  g('qa-del')?.addEventListener('click',   ()=> deleteObj(obj.id));
  g('qa-rr')?.addEventListener('click',    ()=> { obj.rotation=0; syncStyle(obj.id); showProps(obj); markDirty(); });
  g('qa-front')?.addEventListener('click', ()=> { obj.depth=Math.max(...objects.map(o=>o.depth||0))+1; syncStyle(obj.id); showProps(obj); markDirty(); });
  g('qa-back')?.addEventListener('click',  ()=> { obj.depth=Math.max(0,Math.min(...objects.map(o=>o.depth||0))-1); syncStyle(obj.id); showProps(obj); markDirty(); });
  g('qa-fh')?.addEventListener('click',    ()=> { obj.flipX=!obj.flipX; syncStyle(obj.id); showProps(obj); markDirty(); });
  g('qa-fv')?.addEventListener('click',    ()=> { obj.flipY=!obj.flipY; syncStyle(obj.id); showProps(obj); markDirty(); });
}

// ─── STATUS COUNTS ─────────────────────────────────────────────
function updateStatusCounts() {
  document.getElementById('st-cnt').textContent = objects.length;
  document.getElementById('st-sel').textContent = selId ? (getObj(selId)?.name || 'obj'+selId) : 'none';
}

document.getElementById('btn-loadbg').addEventListener('click', ()=> document.getElementById('fi-bg').click());
document.getElementById('fi-bg').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  bgImg.src = URL.createObjectURL(f); bgImg.style.display = 'block';
  toast('Background loaded ✓');
});
document.getElementById('fi-img').addEventListener('change', e => {
  Array.from(e.target.files).forEach(file => {
    const key = file.name.replace(/\.[^.]+$/,'');
    // add to grid
    const grid = document.getElementById('asset-grid');
    const el = document.createElement('div');
    el.className = 'at'; el.draggable = true;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file); img.alt = key;
    el.appendChild(img);
    const nm = document.createElement('div'); nm.className='nm'; nm.textContent=key; el.appendChild(nm);
    el.addEventListener('dragstart', ev => {
      dragAsset = { type:'image', key, src:img.src, isSprite:false };
      ev.dataTransfer.effectAllowed='copy';
    });
    grid.appendChild(el);
  });
  toast('Images added to panel ✓');
});
document.getElementById('btn-addimg').addEventListener('click', ()=> document.getElementById('fi-img').click());

// ─── CLEAR ─────────────────────────────────────────────────────
document.getElementById('btn-clear').addEventListener('click', ()=> {
  if (!confirm('Clear all objects from canvas?')) return;
  pushUndo();
  layer.querySelectorAll('.sobj').forEach(el=>el.remove());
  objects=[]; selId=null; showPropsEmpty(); refreshHier(); updateStatusCounts(); markDirty();
  toast('Canvas cleared');
});

// ─── VIEW CODE ─────────────────────────────────────────────────
document.getElementById('btn-code').addEventListener('click', ()=> {
  document.getElementById('code-out').value = buildCodePreview();
  document.getElementById('code-modal').classList.add('open');
});
document.getElementById('cm-close').addEventListener('click',    ()=> document.getElementById('code-modal').classList.remove('open'));
document.getElementById('btn-cm-close').addEventListener('click',()=> document.getElementById('code-modal').classList.remove('open'));
document.getElementById('btn-copy').addEventListener('click',    ()=> {
  navigator.clipboard.writeText(document.getElementById('code-out').value)
    .then(()=> toast('Copied! ✓'));
});

function buildCodePreview() {
  const lines = ['// ── EDITOR_LAYOUT_BEGIN ──','// Generated by ChillGPT Layout Editor',''];
  objects.filter(o=>!o._hidden).forEach(obj => {
    const varName = (obj.name||'obj').replace(/[^a-zA-Z0-9_]/g,'_')+'_'+obj.id;
    const cx = Math.round(obj.x + obj.w/2), cy = Math.round(obj.y + obj.h/2);
    if (obj.type==='image') {
      const method = obj.isSprite ? 'sprite' : 'image';
      const frame  = obj.isSprite ? ', 0' : '';
      lines.push(`const ${varName} = this.add.${method}(${cx}, ${cy}, '${obj.key}'${frame})`);
      lines.push(`  .setOrigin(${(obj.originX??0.5).toFixed(2)}, ${(obj.originY??0.5).toFixed(2)})`);
      lines.push(`  .setDisplaySize(${Math.round(obj.w)}, ${Math.round(obj.h)})`);
      lines.push(`  .setDepth(${obj.depth??1}).setAlpha(${(obj.alpha??1).toFixed(2)});`);
      if (obj.rotation) lines.push(`${varName}.setAngle(${Math.round(obj.rotation)});`);
      if (obj.flipX)    lines.push(`${varName}.setFlipX(true);`);
      if (obj.flipY)    lines.push(`${varName}.setFlipY(true);`);
      if (obj.anim)     lines.push(`${varName}.play('${obj.anim}');`);
    } else {
      const hex = parseInt((obj.color||'#888').replace('#',''),16).toString(16).padStart(6,'0');
      if (obj.shape==='text') {
        lines.push(`const ${varName} = this.add.text(${cx}, ${cy}, '${(obj.text||'').replace(/'/g,"\\'")}', {`);
        lines.push(`  fontFamily:'"Press Start 2P", monospace', fontSize:'${obj.fontSize||16}px', color:'${obj.color}',`);
        lines.push(`}).setOrigin(${(obj.originX??0.5).toFixed(2)}, ${(obj.originY??0.5).toFixed(2)})`);
        lines.push(`  .setDepth(${obj.depth??1}).setAlpha(${(obj.alpha??1).toFixed(2)});`);
      } else if (obj.shape==='circle') {
        lines.push(`const ${varName} = this.add.graphics().setDepth(${obj.depth??1}).setAlpha(${(obj.alpha??1).toFixed(2)});`);
        lines.push(`${varName}.fillStyle(0x${hex}, 1);`);
        lines.push(`${varName}.fillCircle(${cx}, ${cy}, ${Math.round(Math.min(obj.w,obj.h)/2)});`);
      } else {
        lines.push(`const ${varName} = this.add.graphics().setDepth(${obj.depth??1}).setAlpha(${(obj.alpha??1).toFixed(2)});`);
        lines.push(`${varName}.fillStyle(0x${hex}, 1);`);
        lines.push(`${varName}.fillRect(${Math.round(obj.x)}, ${Math.round(obj.y)}, ${Math.round(obj.w)}, ${Math.round(obj.h)});`);
        if (obj.shape==='zone') lines.push(`${varName}.lineStyle(2, 0x${hex}, 0.8); ${varName}.strokeRect(${Math.round(obj.x)}, ${Math.round(obj.y)}, ${Math.round(obj.w)}, ${Math.round(obj.h)});`);
      }
    }
    lines.push('');
  });
  lines.push('// ── EDITOR_LAYOUT_END ──');
  return lines.join('\n');
}

// ─── SAVE BUTTON ───────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', saveLayout);

// ─── TOAST ─────────────────────────────────────────────────────
let tTimer;
function toast(msg, dur=2600) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(tTimer); tTimer = setTimeout(()=> el.classList.remove('on'), dur);
}

// ─── LIVE ZONE EDITOR ──────────────────────────────────────────────
const zCodeModal = document.getElementById('zone-modal');
const zCanvas = document.getElementById('ze-canvas');
const zCtx = zCanvas.getContext('2d');
const zOverlay = document.getElementById('ze-overlay');

let zData = null;
let zActiveTab = 'm'; // 'm' | 'w' | 'server'
const RefW = 1208, RefH = 600;

document.getElementById('btn-zone-edit').addEventListener('click', async () => {
  zCodeModal.classList.add('open');
  await loadZoneData();
  resizeZCanvas();
  renderZones();
});

['ze-cancel', 'ze-close'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => {
    zCodeModal.classList.remove('open');
  });
});

// Tabs
document.querySelectorAll('.ztab').forEach(t => {
  t.addEventListener('click', (e) => {
    document.querySelectorAll('.ztab').forEach(x => x.classList.remove('active'));
    e.target.classList.add('active');
    zActiveTab = e.target.dataset.tab;
    document.getElementById('ze-panel-machine').style.display = zActiveTab==='m'?'block':'none';
    document.getElementById('ze-panel-worker').style.display  = zActiveTab==='w'?'block':'none';
    document.getElementById('ze-panel-server').style.display  = zActiveTab==='server'?'block':'none';
    renderZones();
  });
});

async function loadZoneData() {
  document.getElementById('ze-status').textContent = 'Loading...';
  try {
    const res = await fetch('http://localhost:3333/api/zones');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    zData = data;
    document.getElementById('ze-status').textContent = 'Loaded from phaser-scene.js';
    populateZInputs();
  } catch(err) {
    document.getElementById('ze-status').textContent = 'Error: ' + err.message;
  }
}

document.getElementById('ze-reload').addEventListener('click', async () => {
  await loadZoneData();
  renderZones();
});

const Z_INPUTS = {
  m: ['ze-m-lm', 'ze-m-rm', 'ze-m-sy', 'ze-m-sx', 'ze-m-sy2'],
  w: ['ze-w-lm', 'ze-w-sy', 'ze-w-sx', 'ze-w-sy2'],
  server: ['ze-s-x0','ze-s-y0','ze-s-x1','ze-s-y1','ze-s-x2','ze-s-y2','ze-s-x3','ze-s-y3']
};

function populateZInputs() {
  if (!zData) return;
  const $ = id => document.getElementById(id);
  if (zData.machineZone) {
    $('ze-m-lm').value = (zData.machineZone.leftMarginFrac).toFixed(4);
    $('ze-m-rm').value = (zData.machineZone.rightMarginFrac).toFixed(4);
    $('ze-m-sy').value = (zData.machineZone.startYFrac).toFixed(4);
    $('ze-m-sx').value = zData.machineZone.spacingX;
    $('ze-m-sy2').value = zData.machineZone.spacingY;
  }
  if (zData.workerZone) {
    $('ze-w-lm').value = (zData.workerZone.leftMarginFrac).toFixed(4);
    $('ze-w-sy').value = (zData.workerZone.startYFrac).toFixed(4);
    $('ze-w-sx').value = zData.workerZone.spacingX;
    $('ze-w-sy2').value = zData.workerZone.spacingY;
  }
  if (zData.serverRoom && zData.serverRoom.spots) {
    zData.serverRoom.spots.forEach((s,i) => {
      $('ze-s-x'+i).value = (s.xFrac).toFixed(4);
      $('ze-s-y'+i).value = (s.yFrac).toFixed(4);
    });
  }
}

['m','w','server'].forEach(k => {
  Z_INPUTS[k].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', () => {
      syncInputsToData();
      renderZones();
    });
  });
});

function syncInputsToData() {
  if (!zData) return;
  const val = id => parseFloat(document.getElementById(id).value)||0;
  if (zActiveTab === 'm') {
    zData.machineZone.leftMarginFrac = val('ze-m-lm');
    zData.machineZone.rightMarginFrac = val('ze-m-rm');
    zData.machineZone.startYFrac = val('ze-m-sy');
    zData.machineZone.spacingX = val('ze-m-sx');
    zData.machineZone.spacingY = val('ze-m-sy2');
  }
  if (zActiveTab === 'w') {
    zData.workerZone.leftMarginFrac = val('ze-w-lm');
    zData.workerZone.startYFrac = val('ze-w-sy');
    zData.workerZone.spacingX = val('ze-w-sx');
    zData.workerZone.spacingY = val('ze-w-sy2');
  }
  if (zActiveTab === 'server') {
    for(let i=0;i<4;i++) {
      zData.serverRoom.spots[i].xFrac = val('ze-s-x'+i);
      zData.serverRoom.spots[i].yFrac = val('ze-s-y'+i);
    }
  }
}

let zw = 604, zh = 300, zScale = 0.5;

function resizeZCanvas() {
  const p = zCanvas.parentElement.getBoundingClientRect();
  const ar = RefW/RefH;
  if (p.width / p.height > ar) {
    zh = p.height - 40; zw = zh * ar;
  } else {
    zw = p.width - 40; zh = zw / ar;
  }
  zCanvas.width = zw; zCanvas.height = zh;
  zScale = zw / RefW;
}
window.addEventListener('resize', () => { if(zCodeModal.classList.contains('open')) { resizeZCanvas(); renderZones(); }});

function renderZones() {
  zCtx.clearRect(0,0,zw,zh);
  zOverlay.innerHTML = '';
  if (!zData) return;
  
  if (zActiveTab === 'm') renderMachineZone();
  if (zActiveTab === 'w') renderWorkerZone();
  if (zActiveTab === 'server') renderServerZone();
}

function renderMachineZone() {
  zCtx.strokeStyle = '#00ffff'; zCtx.lineWidth = 1;
  const m = zData.machineZone;
  const lx = m.leftMarginFrac * zw;
  const rx = zw - (m.rightMarginFrac * zw);
  const my = m.startYFrac * zh;
  
  zCtx.beginPath(); zCtx.moveTo(lx, 0); zCtx.lineTo(lx, zh);
  zCtx.moveTo(rx, 0); zCtx.lineTo(rx, zh);
  zCtx.moveTo(0, my); zCtx.lineTo(zw, my); zCtx.stroke();
  
  zCtx.fillStyle = '#00ffff';
  let gx = lx, gy = my, gcnt = 0;
  while(gy < zh - 20 && gcnt < 30) {
    let rowX = gx;
    while(rowX < rx - 10) {
      zCtx.fillRect(rowX-10 * zScale, gy-10 * zScale, 20*zScale, 20*zScale);
      rowX += m.spacingX * zScale;
    }
    gy += m.spacingY * zScale;
    gcnt++;
  }
  
  createHandle(lx, my, 'mtl', (dx,dy) => {
    m.leftMarginFrac = Math.max(0, lx + dx)/zw; 
    m.startYFrac = Math.max(0, my + dy)/zh; 
  });
}

function renderWorkerZone() {
  zCtx.strokeStyle = '#ffbb00'; zCtx.lineWidth = 1;
  const m = zData.workerZone;
  const lx = m.leftMarginFrac * zw; 
  const my = m.startYFrac * zh;
  const rx = zw;
  
  zCtx.beginPath(); zCtx.moveTo(lx, 0); zCtx.lineTo(lx, zh);
  zCtx.moveTo(0, my); zCtx.lineTo(zw, my); zCtx.stroke();
  
  zCtx.fillStyle = '#ffbb00';
  let gx = lx, gy = my, gcnt = 0;
  while(gy < zh - 20 && gcnt < 30) {
    let rowX = gx;
    while(rowX < rx - 10) {
      zCtx.fillRect(rowX-10 * zScale, gy-10 * zScale, 20*zScale, 20*zScale);
      rowX += m.spacingX * zScale;
    }
    gy += m.spacingY * zScale;
    gcnt++;
  }
  
  createHandle(lx, my, 'wtl', (dx,dy) => {
    m.leftMarginFrac = Math.max(0, lx + dx)/zw;
    m.startYFrac = Math.max(0, my + dy)/zh;
  });
}

function renderServerZone() {
  const sp = zData.serverRoom.spots;
  if(!sp) return;
  sp.forEach((s,i) => {
    const x = s.xFrac * zw, y = s.yFrac * zh;
    zCtx.fillStyle = '#00ffaa';
    zCtx.fillRect(x - 20*zScale, y - 40*zScale, 40*zScale, 80*zScale);
    
    createHandle(x, y, `s${i}`, (dx,dy) => {
      s.xFrac = Math.max(0, Math.min(1, (x+dx)/zw));
      s.yFrac = Math.max(0, Math.min(1, (y+dy)/zh));
    });
  });
}

let zDragData = null;
function createHandle(x, y, id, onDrag) {
  const h = document.createElement('div');
  h.className = 'ze-handle'; h.id = 'zh_'+id;
  
  // Center relative to overlay bounds
  h.style.left = x + 'px';
  h.style.top = y + 'px';
  
  h.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    zDragData = { startX: e.clientX, startY: e.clientY, onDrag };
  });
  zOverlay.appendChild(h);
}

document.addEventListener('mousemove', e => {
  if(!zDragData) return;
  const dx = e.clientX - zDragData.startX;
  const dy = e.clientY - zDragData.startY;
  zDragData.onDrag(dx, dy);
  populateZInputs();
  renderZones();
});

document.addEventListener('mouseup', () => { zDragData = null; });

document.getElementById('ze-apply').addEventListener('click', async () => {
  if(!zData) return;
  document.getElementById('ze-status').textContent = 'Saving...';
  try {
    const res = await fetch('http://localhost:3333/api/zones', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(zData)
    });
    const { success, error } = await res.json();
    if(success) {
      document.getElementById('ze-status').textContent = 'Saved to phaser-scene.js ✅';
      toast('Zone config saved to project!');
    }
    else throw new Error(error);
  } catch(err) {
    document.getElementById('ze-status').textContent = 'Failed: ' + err.message;
  }
});

// ─── BOOT ──────────────────────────────────────────────────────
init();
