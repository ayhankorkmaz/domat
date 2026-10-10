// Hasat kartı testi: bugünün verisiyle kartı üret, indir ve ekran görüntüsü al (TR ve EN)
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:8767/index.html', OUT = process.env.OUT || '/tmp';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const errs = [];
for (const lang of ['tr', 'en']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(lang => { const d = new Date(); const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); const y = new Date(d); y.setDate(y.getDate() - 1); const ky = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    const now = Date.now(), pl = (title, color) => ({ state: 'harvested', seed: Math.random() * 1e6 | 0, n: 5, g: 1, planted: true, at: now - 4e6, title, color });
    const tasks = [['Sunum taslağını bitir', 'İş'], ['E-postaları yanıtla', 'İş'], ['Makale oku: derin çalışma', 'Okul'], ['Bütçe tablosu', 'Kişisel'], ['Spor', ''], ['Kod incelemesi', 'İş']].map(([t, tag], i) => ({ id: 'c' + i, title: t, est: 2, act: 2, tag, createdAt: now - 9e6, doneAt: now - 3e6 + i * 1e5 }));
    const ss = [0, 1, 2, 3, 4, 5].map(i => ({ at: now - 7e6 + i * 1.6e6, taskId: 'c' + i, task: tasks[i].title, tag: tasks[i].tag, min: 25, n: 5, status: 'harvested' }));
    localStorage.setItem('domat-v1', JSON.stringify({ version: 2, profile: { name: 'Ayhan', lang, onboarded: true }, settings: { tasksOpen: false }, tasks, days: { [ky]: { tomatoes: 20, golden: 0, sessions: [], plots: [], sets: 0 }, [k]: { tomatoes: 30, golden: 1, sessions: ss, plots: [pl('Sunum', '#5a6fd6'), pl('E-posta', '#d9a514'), pl('Makale', '#5aa845'), null, pl('Bütçe', '#2f9fb8'), pl('Spor', null)], sets: 1 } } })); }, lang);
  await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(5000);
  await p.click('#btnStats'); await p.waitForTimeout(400); await p.click('#btnCard'); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/card-sheet-${lang}.png` });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#cardDl')]); await dl.saveAs(`${OUT}/card-${lang}.png`);
  await ctx.close();
}
console.log('ERRORS', JSON.stringify(errs)); await b.close();
