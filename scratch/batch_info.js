const fs = require('fs');
const path = require('path');

function getPNGSize(filePath) {
    const buffer = fs.readFileSync(filePath);
    return {
        name: path.basename(filePath),
        w: buffer.readUInt32BE(16),
        h: buffer.readUInt32BE(20)
    };
}

const files = [
    'gpu_cluster_sheet.png',
    'gpu_cluster_sheet_1.png',
    'gpu_cluster_sheet_2.png',
    'gpu_cluster_sheet_3.png'
];

const results = files.map(f => {
    try {
        return getPNGSize(path.join('d:/PROJECTS/github/CHILLGPT EMPIRE/assets/images', f));
    } catch(e) {
        return { name: f, error: e.message };
    }
});

console.log(JSON.stringify(results, null, 2));
