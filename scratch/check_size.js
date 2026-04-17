const fs = require('fs');
const buffer = fs.readFileSync('d:\\PROJECTS\\github\\CHILLGPT EMPIRE\\assets\\images\\gpu_cluster_sheet.png');
// IHDR chunk starts at byte 12 (4 bytes length + 4 bytes 'IHDR' + 4 bytes width + 4 bytes height)
// Correct offsets: 16-19 width, 20-23 height
const w = buffer.readUInt32BE(16);
const h = buffer.readUInt32BE(20);
console.log(`W:${w} H:${h}`);
