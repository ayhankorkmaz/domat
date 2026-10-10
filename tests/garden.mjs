// Bahçe gelişimi testi: her şey açık bahçe, 3. sıraya ekim rotası, canlı genişleme
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:8767/index.html', OUT = process.env.OUT || '/tmp';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const errs = [];
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
async function run(name, seed, fn) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.addInitScript(s => { if (!localStorage.getItem('domat-v1')) localStorage.setItem('domat-v1', JSON.stringify(s)); }, seed);
  await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(4500); await fn(p); await ctx.close();
}
const ripe = (t) => ({ state: 'ripe', seed: Math.random() * 1e6 | 0, n: 5, g: 1, planted: true, at: Date.now() - 5e6, title: t });
// 1) 600 domates: her şey açık, 3 sıra
await run('all', { version: 2, profile: { name: 'A', lang: 'tr', onboarded: true }, settings: { tasksOpen: false, fast: true, focus: 5 }, tasks: [], days: { '2026-09-01': { tomatoes: 600, golden: 0, sessions: [], plots: [], sets: 0 }, [today()]: { tomatoes: 0, golden: 0, sessions: [], plots: [ripe('Sunum'), ripe('Rapor'), ripe('Okuma'), ripe('Bütçe'), ripe('Spor'), ripe('Kod'), ripe('Not'), ripe('Ders')], sets: 0 } } },
  async p => {
    await p.mouse.move(720, 450); for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(60); } await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + '/g1-all.png' });
    await p.click('#btnMain'); await p.waitForTimeout(6500); await p.screenshot({ path: OUT + '/g2-row3.png' });
    const d = await p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1'))); const k = Object.keys(d.days).sort().pop();
    console.log('rows', d.garden.rows, 'last planted', d.days[k].plots.length - 1, d.days[k].plots.at(-1)?.state, 'plots', d.days[k].plots.length);
    await p.click('#btnStats'); await p.waitForTimeout(500); await p.evaluate(() => { document.querySelector('#statsSheet .card').scrollTop = 1500; }); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/g3-progress.png' });
  });
// 2) 95 domates, 8 tarh dolu: ekim isteği bahçeyi canlı genişletir
await run('live', { version: 2, profile: { name: 'A', lang: 'tr', onboarded: true }, settings: { tasksOpen: false, fast: true, focus: 5 }, tasks: [], days: { '2026-09-01': { tomatoes: 60, golden: 0, sessions: [], plots: [], sets: 0 }, [today()]: { tomatoes: 35, golden: 0, sessions: [], plots: [ripe('a'), ripe('b'), ripe('c'), ripe('d'), ripe('e'), ripe('f'), ripe('g'), ripe('h')], sets: 0 } } },
  async p => {
    console.log('hive before', await p.evaluate(() => true));
    await p.evaluate(() => document.querySelector('#btnMain').click()); await p.waitForTimeout(1200);
    await p.screenshot({ path: OUT + '/g4-expanding.png' });
    const d = await p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1'))); console.log('live rows', d.garden.rows);
  });
console.log('ERRORS', JSON.stringify(errs)); await b.close();
