// PWA testi: servis çalışanı kurulur, ağ kesilince uygulama yine açılır
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:8767/index.html', OUT = process.env.OUT || '/tmp';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL, { waitUntil: 'networkidle' });
const ver = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r.active?.scriptURL; });
const man = await p.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()).name);
console.log('sw active', ver, '| manifest', man);
await p.waitForTimeout(1500);
await ctx.setOffline(true);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(5000);
const ok = await p.evaluate(() => !document.querySelector('#loading') && document.querySelector('#hvCount').textContent.length > 0);
console.log('offline load ok', ok, '| online?', await p.evaluate(() => navigator.onLine));
await p.screenshot({ path: OUT + '/offline.png' });
console.log('ERRORS', JSON.stringify(errs)); await b.close();
