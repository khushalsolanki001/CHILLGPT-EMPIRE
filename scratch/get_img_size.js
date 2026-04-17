const fs = require('fs');
const path = require('path');

// Basic PNG size reader
function getPNGSize(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
    };
}

const info = getPNGSize('d:/PROJECTS/github/CHILLGPT EMPIRE/assets/images/gpu_cluster_sheet.png');
console.log(JSON.stringify(info));
