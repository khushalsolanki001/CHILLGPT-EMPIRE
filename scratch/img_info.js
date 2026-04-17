const fs = require('fs');
const buffer = fs.readFileSync('d:/PROJECTS/github/CHILLGPT EMPIRE/assets/images/gpu_cluster_sheet.png');
const width = buffer.readUInt32BE(16);
const height = buffer.readUInt32BE(20);
console.log(`WIDTH: ${width}, HEIGHT: ${height}`);
