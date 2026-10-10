// Faz 3 testi: mevsimler, çeşitler, kalite, ses ayarları, tekrarlı görevler
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:8767/index.html', OUT = process.env.OUT || '/tmp';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const errs = [];
const day = dd => { const d = new Date(); d.setDate(d.getDate() - dd); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function seed(lang, season) {
  const days = {};
  ['İş', 'Okul', 'Kişisel', 'Spor', ''].forEach((tag, i) => { days[day(i + 1)] = { tomatoes: 30, golden: 0, sets: 0, plots: [], sessions: [{ at: Date.now() - 864e5 * (i + 1), task: 'x', tag, min: 25, n: 30, status: 'harvested', variety: ['red', 'pink', 'yellow', 'black', 'cherry'][i] }] }; });
  const y = Date.now() - 864e5 * 2;
  return { version: 2, profile: { name: 'Ayhan', lang, onboarded: true }, settings: { tasksOpen: true, season }, days,
    tasks: [{ id: 'r1', title: 'Sabah planı', est: 1, act: 1, tag: 'İş', createdAt: y, doneAt: y + 1000, repeat: 'daily' }, { id: 'n1', title: 'Rapor', est: 2, act: 0, tag: 'İş', createdAt: Date.now(), doneAt: null }] };
}
for (const [lang, season, tag] of [['tr', 'autumn', 'autumn'], ['en', 'winter', 'winter'], ['tr', 'summer', 'summer']]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(tag + ': ' + e.message));
  await p.addInitScript(s => { if (!localStorage.getItem('domat-v1')) localStorage.setItem('domat-v1', JSON.stringify(s)); }, seed(lang, season));
  await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(4500);
  await p.screenshot({ path: `${OUT}/f3-${tag}.png` });
  if (tag === 'autumn') {
    const t = await p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1')).tasks.find(x => x.id === 'r1'));
    console.log('recurring reset doneAt', t.doneAt, 'act', t.act);
    console.log('task list:', (await p.textContent('#tasksPanel')).replace(/\s+/g, ' ').slice(0, 200));
    await p.click('#btnStats'); await p.waitForTimeout(600);
    console.log('varLine:', (await p.textContent('#varLine')).replace(/\s+/g, ' '));
    await p.locator('#varLine').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/f3-var.png` }); await p.keyboard.press('Escape');
    await p.click('#btnSettings'); await p.waitForTimeout(400);
    await p.locator('#setSeason').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/f3-settings.png` });
    await p.selectOption('#setQuality', 'low'); await p.selectOption('#setChime', 'birds'); await p.click('#setTick');
    await p.fill('#setFxVol', '0.4'); await p.dispatchEvent('#setFxVol', 'input');
    await p.waitForTimeout(500); const s = await p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1')).settings);
    console.log('settings', s.quality, s.chime, s.tick, s.fxVol, s.season);
  }
  await ctx.close();
}
console.log('ERRORS', JSON.stringify(errs));
await b.close();
