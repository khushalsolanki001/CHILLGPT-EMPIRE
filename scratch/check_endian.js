const fs = require('fs');
const buffer = fs.readFileSync('d:\\PROJECTS\\github\\CHILLGPT EMPIRE\\assets\\images\\gpu_cluster_sheet.png');
const wBE = buffer.readUInt32BE(16);
const hBE = buffer.readUInt32BE(20);
const wLE = buffer.readUInt32LE(16);
const hLE = buffer.readUInt32LE(20);
console.log(`BE: ${wBE}x${hBE}, LE: ${wLE}x${hLE}`);
