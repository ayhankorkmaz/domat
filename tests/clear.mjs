// Görev silinince Hasan Dede o görevin yataklarını söker: olgun domates hasada eklenir, yatak boşalır
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:8767/index.html', OUT = process.env.OUT || '/tmp';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const errs = [];
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const rec = (st, id, t) => ({ state: st, seed: Math.random() * 1e6 | 0, n: 5, g: 1, planted: true, at: Date.now() - 5e6, taskId: id, title: t, color: '#7c5cff' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(([s]) => { if (!localStorage.getItem('domat-v1')) localStorage.setItem('domat-v1', JSON.stringify(s)); }, [{ version: 2, profile: { name: 'A', lang: 'tr', onboarded: true }, settings: { tasksOpen: true },
  tasks: [{ id: 'a', title: 'Sunum', est: 2, act: 2, tag: 'İş', createdAt: Date.now() }, { id: 'b', title: 'Rapor', est: 1, act: 1, tag: '', createdAt: Date.now() }],
  days: { [today()]: { tomatoes: 10, golden: 0, sessions: [], sets: 0, plots: [rec('harvested', 'a', 'Sunum'), rec('ripe', 'a', 'Sunum'), rec('harvested', 'b', 'Rapor')] } } }]);
await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
await p.screenshot({ path: OUT + '/c1-before.png' });
// 1) çöp kutusu + geri al: görev geri gelir, yataklara dokunulmaz
await p.hover('#tasksPanel li[data-id="a"]'); await p.click('#tasksPanel li[data-id="a"] [data-act="del"]'); await p.waitForTimeout(400);
await p.screenshot({ path: OUT + '/c0-undo.png' });
console.log('toast:', (await p.textContent('.toast')).replace(/\s+/g, ' '));
await p.click('.toast .tact'); await p.waitForTimeout(6000);
let d0 = await p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1')));
console.log('after undo tasks', d0.tasks.map(x => x.title), 'plots', JSON.stringify(d0.days[Object.keys(d0.days).sort().pop()].plots.map(r => r && r.state)));
// 2) gerçek silme: 5 sn sonra Hasan Dede yatakları boşaltır
await p.hover('#tasksPanel li[data-id="a"]'); await p.click('#tasksPanel li[data-id="a"] [data-act="del"]'); await p.waitForTimeout(3500); await p.screenshot({ path: OUT + '/c2-clearing.png' });
for (let k = 0; k < 7; k++) { await p.waitForTimeout(3000); const s = await p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1'))); const t = Object.keys(s.days).sort().pop(); console.log('t+' + (3.5 + 3 * (k + 1)) + 's', JSON.stringify(s.days[t].plots.map(r => r && r.state)), await p.textContent('#status').catch(() => '')); } await p.screenshot({ path: OUT + '/c3-after.png' });
const d = await p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1')));
const pl = d.days[Object.keys(d.days).sort().pop()].plots;
console.log('plots', JSON.stringify(pl.map(r => r && r.title + ':' + r.state)), 'tomatoes', d.days[Object.keys(d.days).sort().pop()].tomatoes, 'tasks', d.tasks.map(x => x.title));
console.log('ERRORS', JSON.stringify(errs)); await b.close();
