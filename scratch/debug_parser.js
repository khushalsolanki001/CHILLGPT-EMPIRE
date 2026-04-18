const fs = require('fs');
const path = require('path');

const src = fs.readFileSync('d:/PROJECTS/github/CHILLGPT EMPIRE/js/phaser-scene.js', 'utf8');

const gpuZone = {
    height: parseFloat((src.match(/const gH\s*=\s*([\d.]+)/) || [,'110'])[1]),
    width: parseFloat((src.match(/const gW\s*=\s*([\d.]+)/) || [,'330'])[1]),
    spots: (() => {
      const block = src.match(/const gSpots = \[([\s\S]*?)\];/);
      if (!block) return "BLOCK NOT FOUND";
      const raw = block[1];
      const rows = [...raw.matchAll(/W\s*\*\s*([\d.e-]+)[\s\S]*?H\s*\*\s*([\d.e-]+)/g)];
      return rows.map(r => ({ xFrac: parseFloat(r[1]), yFrac: parseFloat(r[2]) }));
    })(),
};

console.log(JSON.stringify(gpuZone, null, 2));
