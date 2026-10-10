// Yedek testi: JSON ve CSV indir, başka bir profilde birleştir ve değiştir
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:8767/index.html', TMP = process.env.TMP || '/tmp';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const errs = [];
const key = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
async function page(seed) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!localStorage.getItem('domat-v1')) localStorage.setItem('domat-v1', JSON.stringify(s)); }, seed);
  await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500); return p;
}
const A = { version: 2, profile: { name: 'A', lang: 'tr', onboarded: true }, settings: {}, tasks: [{ id: 'ta', title: 'Rapor, "taslak"', est: 2, act: 1, tag: 'İş', createdAt: 1, doneAt: null }],
  days: { '2026-09-30': { tomatoes: 10, golden: 0, sessions: [{ at: 1000, task: 'Rapor, "taslak"', taskId: 'ta', min: 25, n: 5, status: 'harvested' }, { at: 2000, task: '', min: 10, n: 0, status: 'dead' }], plots: [], sets: 0 } } };
const B = { version: 2, profile: { name: 'B', lang: 'en', onboarded: true }, settings: {}, tasks: [{ id: 'tb', title: 'Okuma', est: 1, act: 0, tag: '', createdAt: 5, doneAt: null }],
  days: { '2026-09-30': { tomatoes: 4, golden: 0, sessions: [{ at: 3000, task: 'Okuma', min: 25, n: 4, status: 'harvested' }], plots: [], sets: 0 }, '2026-10-01': { tomatoes: 6, golden: 0, sessions: [{ at: 4000, task: 'x', min: 25, n: 6, status: 'harvested' }], plots: [], sets: 0 } } };

const p1 = await page(A);
await p1.click('#btnSettings');
let [dl] = await Promise.all([p1.waitForEvent('download'), p1.click('#btnExport')]);
const jsonPath = TMP + '/domat-yedek.json'; await dl.saveAs(jsonPath);
[dl] = await Promise.all([p1.waitForEvent('download'), p1.click('#btnCsv')]);
const csvPath = TMP + '/domat.csv'; await dl.saveAs(csvPath);
const csv = fs.readFileSync(csvPath, 'utf8');
console.log('JSON bytes', fs.statSync(jsonPath).size, 'CSV lines', csv.trim().split('\n').length, '| row1:', csv.split('\n')[1]);

// birleştir
const p2 = await page(B);
await p2.click('#btnSettings'); await p2.setInputFiles('#importFile', jsonPath); await p2.waitForTimeout(400);
console.log('preview:', await p2.textContent('#cfText'));
await Promise.all([p2.waitForNavigation(), p2.click('#cfYes')]); await p2.waitForTimeout(1200);
let d = await p2.evaluate(() => JSON.parse(localStorage.getItem('domat-v1')));
console.log('MERGE tasks', d.tasks.map(x => x.title), 'day30 sessions', d.days['2026-09-30'].sessions.length, 'tomatoes', d.days['2026-09-30'].tomatoes, 'day01', !!d.days['2026-10-01'], 'name', d.profile.name);
// değiştir
await p2.click('#btnSettings'); await p2.setInputFiles('#importFile', jsonPath); await p2.waitForTimeout(400);
await Promise.all([p2.waitForNavigation(), p2.click('#cfAlt')]); await p2.waitForTimeout(1200);
d = await p2.evaluate(() => JSON.parse(localStorage.getItem('domat-v1')));
console.log('REPLACE tasks', d.tasks.map(x => x.title), 'days', Object.keys(d.days), 'name', d.profile.name);
// bozuk dosya
fs.writeFileSync(TMP + '/bad.json', '{nope'); await p2.click('#btnSettings'); await p2.setInputFiles('#importFile', TMP + '/bad.json'); await p2.waitForTimeout(500);
console.log('bad file toast:', await p2.locator('.toast b').first().textContent());
console.log('ERRORS', JSON.stringify(errs));
await b.close();
