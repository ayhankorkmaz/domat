// İstatistik ve kesinti testi: zengin geçmişle Hasat defteri ekran görüntüleri, kesinti akışı
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:8767/index.html', OUT = process.env.OUT || '/tmp';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const errs = [];
function seed(lang) {
  let x = 7; const r = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const tags = ['İş', 'Okul', 'Kişisel', ''], days = {}, tasks = [];
  for (let i = 0; i < 12; i++) { const est = 1 + Math.floor(r() * 4), act = Math.max(1, est + Math.round(r() * 2.4 - .6)); tasks.push({ id: 't' + i, title: ['Sunum', 'Rapor', 'Makale', 'Bütçe', 'E-posta', 'Kod incelemesi'][i % 6] + ' ' + (i + 1), est, act, tag: tags[i % 4], createdAt: Date.now() - 864e5 * (40 - i * 3), doneAt: i < 9 ? Date.now() - 864e5 * (30 - i * 3) : null }); }
  for (let dd = 75; dd >= 0; dd--) { if (r() < .25 && dd) continue; const d = new Date(); d.setDate(d.getDate() - dd); const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const n = 1 + Math.floor(r() * 7), ss = []; let tom = 0;
    for (let j = 0; j < n; j++) { const h = [9, 10, 10, 11, 14, 15, 16, 20][Math.floor(r() * 8)]; const at = new Date(d); at.setHours(h, 25 + j, 0, 0); const t = tasks[Math.floor(r() * tasks.length)]; const dead = r() < .12;
      ss.push({ at: at.getTime(), taskId: t.id, task: t.title, tag: t.tag, min: dead ? 10 : 25, n: dead ? 0 : 5, status: dead ? 'dead' : 'harvested', intIn: Math.floor(r() * 2), intOut: r() < .3 ? 1 : 0 }); if (!dead) tom += 5; }
    if (dd === 0) continue; days[k] = { tomatoes: tom, golden: 0, sessions: ss, plots: [], sets: 0 }; }
  return { version: 2, profile: { name: 'Ayhan', lang, onboarded: true }, settings: { tasksOpen: false, fast: true, focus: 5 }, tasks, days };
}
for (const [lang, vp, tag] of [['tr', { width: 1440, height: 900 }, 'd'], ['en', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'm']]) {
  const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { if (!localStorage.getItem('domat-v1')) localStorage.setItem('domat-v1', JSON.stringify(s)); }, seed(lang));
  await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(4200);
  await p.click('#btnStats'); await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/${tag}-stats1.png` });
  await p.evaluate(() => { document.querySelector('#statsSheet .card').scrollTop = 520; }); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${tag}-stats2.png` });
  await p.click('#statPeriod [data-per="all"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector('#statsSheet .card').scrollTop = 0; }); await p.screenshot({ path: `${OUT}/${tag}-stats3-all.png` });
  console.log(tag, 'insights:', (await p.textContent('#insights')).replace(/\s+/g, ' ').slice(0, 260));
  await p.keyboard.press('Escape');
  if (tag === 'd') {
    await p.click('#btnMain'); await p.waitForTimeout(1200);
    if (await p.isVisible('#pickSheet')) { await p.click('#pickList [data-pick]'); await p.waitForTimeout(600); }
    console.log('int button visible', await p.isVisible('#btnInt'));
    await p.click('#btnInt'); await p.fill('#intNote', 'Faturayı öde'); await p.click('[data-int="in"]'); await p.waitForTimeout(300);
    await p.keyboard.press('d'); await p.click('[data-int="out"]'); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${tag}-int.png` });
    await p.waitForTimeout(6000);
    const d = await p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1')));
    const k = Object.keys(d.days).sort().pop(); const last = d.days[k].sessions.at(-1);
    console.log('session', last.task, 'tag', last.tag, 'intIn', last.intIn, 'intOut', last.intOut, '| new task', d.tasks.at(-1).title);
  }
  await ctx.close();
}
console.log('ERRORS', JSON.stringify(errs));
await b.close();
