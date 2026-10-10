import { chromium } from 'playwright-core';
const OUT = process.env.OUT || '/tmp', URL = process.env.URL || 'http://localhost:8767/index.html';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errs = [];
async function mk(opts) { const ctx = await browser.newContext(opts); const p = await ctx.newPage(); p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); }); return p; }
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
const W = ms => new Promise(r => setTimeout(r, ms));
const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1') || 'null'));

// A: yeni kullanıcı, masaüstü
{
  const p = await mk({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL, { waitUntil: 'networkidle' }); await W(4500);
  await shot(p, 'a1-onboard');
  await p.fill('#obName', 'Ayhan'); await p.click('[data-ob="next"]'); await W(300);
  await p.click('[data-rh="classic"]'); await p.click('[data-stepper="obgoal"] [data-d="1"]'); await W(200);
  await shot(p, 'a2-rhythm');
  await p.click('[data-ob="next"]'); await W(300);
  await p.fill('#obTask', 'Sunum taslağı'); await p.click('[data-stepper="obest"] [data-d="1"]'); await p.click('[data-stepper="obest"] [data-d="1"]');
  await shot(p, 'a3-firsttask');
  await p.click('[data-ob="finish"]'); await W(800);
  // ikinci görev: etiketle
  if (await p.isHidden('#tasksPanel')) await p.click('#btnTasks');
  await p.fill('#taddTitle', 'E-postaları yanıtla'); await p.click('#taddMore'); await W(100);
  await p.fill('#taddTitle', 'E-postaları yanıtla'); await p.fill('#taddTag', 'İş'); await p.press('#taddTitle', 'Enter'); await W(300);
  await p.fill('#taddTitle', 'Makale oku'); await p.click('[data-stepper="add"] [data-d="1"]'); await p.press('#taddTitle', 'Enter'); await W(300);
  await shot(p, 'a4-tasks');
  let d = await store(p); console.log('A tasks', d.tasks.map(x => `${x.title}:${x.est}:${x.tag}`).join(' | '), 'name', d.profile.name, 'goal', d.settings.goal, 'active', d.state.taskId === d.tasks[0].id);
  // hızlı mod + 5 sn odak
  await p.evaluate(() => { const sf = document.querySelector('#setFast'); sf.click(); const f = document.querySelector('#setFocus'); f.value = 5; f.dispatchEvent(new Event('input')); });
  await p.click('#btnMain'); await W(5000);
  await shot(p, 'a5-planting');
  await W(4500);
  d = await store(p); console.log('A after focus act', d.tasks[0].act, 'phase', d.state.phase, 'sessions', d.days[Object.keys(d.days)[0]].sessions.map(x => x.task));
  // tahmin 3 -> iki tur daha tamamla
  for (let k = 0; k < 2; k++) { await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('domat-v1')).state; }); await p.keyboard.press('s'); await W(1800); if (await p.isVisible('#cfYes')) await p.click('#cfYes'); await W(400); await p.click('#btnMain'); await W(9000); }
  await W(3000);
  await shot(p, 'a6-doneq');
  const q = await p.isVisible('#confirmSheet'); console.log('A done question visible', q, await p.textContent('#cfTitle'));
  if (q) await p.click('#cfYes'); await W(1500);
  d = await store(p); console.log('A task0 doneAt', !!d.tasks[0].doneAt, 'act', d.tasks[0].act, 'new active', d.tasks.find(x => x.id === d.state.taskId)?.title);
  await shot(p, 'a7-afterdone');
  await p.mouse.move(980, 520); for (let i = 0; i < 9; i++) { await p.mouse.wheel(0, -120); await W(60); } await W(1500); await shot(p, 'a7b-signs');
  // dil: İngilizce
  await p.click('#btnSettings'); await W(300); await p.click('#settingsSheet [data-lang="en"]'); await W(300);
  await shot(p, 'a8-settings-en'); await p.click('#settingsSheet [data-close]'); await W(300);
  await shot(p, 'a9-en');
  // istatistik
  await p.click('#btnStats'); await W(400); await shot(p, 'a10-stats-en'); await p.keyboard.press('Escape');
  // tarh ipucu
  await p.close();
}
// C: mobil, İngilizce seçerek
{
  const p = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(URL, { waitUntil: 'networkidle' }); await W(4500);
  await p.click('#obBody [data-lang="en"]'); await W(200); await shot(p, 'c1-onboard-en');
  await p.click('[data-ob="skip"]'); await W(600);
  await shot(p, 'c2-main');
  await p.click('#btnTasks'); await W(300); await p.fill('#taddTitle', 'Write the report'); await p.press('#taddTitle', 'Enter'); await W(300);
  await shot(p, 'c3-tasks');
  await p.click('#tclose'); await W(300); await shot(p, 'c4-active');
  await p.close();
}
console.log('ERRORS', JSON.stringify(errs.slice(0, 15), null, 1));
await browser.close();
