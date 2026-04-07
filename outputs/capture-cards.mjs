import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = `file://${path.join(__dirname, 'story-cards.html')}`;
const outDir = path.join(__dirname, 'cards');
fs.mkdirSync(outDir, { recursive: true });

// Find Chrome executable
const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

// Also check puppeteer cache
const cacheDir = path.join(process.env.HOME, '.cache/puppeteer/chrome');
if (fs.existsSync(cacheDir)) {
  for (const ver of fs.readdirSync(cacheDir)) {
    chromePaths.unshift(path.join(cacheDir, ver, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    chromePaths.unshift(path.join(cacheDir, ver, 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    chromePaths.unshift(path.join(cacheDir, ver, 'chrome-linux64/chrome'));
  }
}

const executablePath = chromePaths.find(p => fs.existsSync(p));
if (!executablePath) {
  console.error('Chrome not found. Searched:', chromePaths.filter(p => !p.includes('.cache')));
  process.exit(1);
}
console.log(`Using Chrome: ${executablePath}`);

const browser = await puppeteer.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
await page.goto(htmlPath, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 2000));

const totalCards = await page.$$eval('.card', cards => cards.length);
console.log(`Found ${totalCards} cards, capturing...`);

for (let i = 1; i <= totalCards; i++) {
  const el = await page.$(`#card-${i}`);
  if (!el) { console.warn(`card-${i} not found, skipping`); continue; }
  const outPath = path.join(outDir, `card-${i}.png`);
  await el.screenshot({ path: outPath, type: 'png' });
  const stat = fs.statSync(outPath);
  console.log(`card-${i}.png — ${Math.round(stat.size / 1024)}KB`);
}

await browser.close();
console.log('Done!');
