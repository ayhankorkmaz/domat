// Mini zamanlayıcı testi (Chrome Document Picture-in-Picture)
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:8767/index.html';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('domat-v1', JSON.stringify({ version: 2, profile: { name: '', lang: 'tr', onboarded: true }, settings: { tasksOpen: false, fast: true, focus: 5 }, tasks: [{ id: 'x', title: 'Sunum taslağı', est: 2, act: 0, tag: 'İş', createdAt: Date.now(), doneAt: null }], state: { taskId: 'x' }, days: {} })));
await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(4200);
console.log('api', await p.evaluate(() => 'documentPictureInPicture' in window), 'button visible', await p.isVisible('#btnPip'));
await p.click('#btnPip'); await p.waitForTimeout(800);
const pip = await p.evaluate(() => { const w = window.documentPictureInPicture?.window; return w ? { ck: w.document.getElementById('pck')?.textContent, tk: w.document.getElementById('ptk')?.textContent, btn: w.document.getElementById('pmain')?.textContent } : null; });
console.log('pip window', JSON.stringify(pip));
if (pip) { await p.evaluate(() => window.documentPictureInPicture.window.document.getElementById('pmain').click()); await p.waitForTimeout(2200);
  console.log('after start', JSON.stringify(await p.evaluate(() => { const d = window.documentPictureInPicture.window.document; return { ck: d.getElementById('pck').textContent, btn: d.getElementById('pmain').textContent, ph: d.getElementById('pph').textContent }; }))); }
console.log('ERRORS', JSON.stringify(errs)); await b.close();
