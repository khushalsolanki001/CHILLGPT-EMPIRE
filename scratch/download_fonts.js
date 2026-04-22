/**
 * Downloads Google Fonts locally to avoid COEP cross-origin issues on Wavedash.
 * Run: node scratch/download_fonts.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const req = https.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers: { 'User-Agent': 'Mozilla/5.0', ...headers } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
    });
    req.on('error', reject);
  });
}

async function main() {
  console.log('Fetching Google Fonts CSS...');
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap';
  const { body: cssBody } = await get(cssUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
  let css = cssBody.toString();

  // Find all font file URLs
  const fontUrls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
  console.log(`Found ${fontUrls.length} font files to download`);

  const urlMap = {};
  for (const url of fontUrls) {
    const name = path.basename(new URL(url).pathname);
    const outFile = path.join(FONTS_DIR, name);
    console.log(`  Downloading ${name}...`);
    const { body } = await get(url);
    fs.writeFileSync(outFile, body);
    urlMap[url] = `assets/fonts/${name}`;
  }

  // Replace all Google Fonts URLs in CSS with local paths
  for (const [remote, local] of Object.entries(urlMap)) {
    css = css.replaceAll(remote, local);
  }

  const outCss = path.join(__dirname, '..', 'assets', 'fonts', 'fonts.css');
  fs.writeFileSync(outCss, css);
  console.log('\nDone! fonts.css written to assets/fonts/fonts.css');
  console.log('\nNow update index.html: replace the Google Fonts <link> with:');
  console.log('  <link rel="stylesheet" href="assets/fonts/fonts.css" />');
}

main().catch(e => { console.error(e); process.exit(1); });
