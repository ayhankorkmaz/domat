// Cadılar Bayramı: süsler, ayar düğmesi, hayalet, balkabağı hasadı, hasat kartı ve tarih penceresi.
// Sunucu 8767'de açıkken: node tests/halloween.mjs   (ekran görüntüleri OUT klasörüne)
import { chromium } from 'playwright-core';
const OUT = process.env.OUT || '/tmp', BASE = process.env.BASE || 'http://localhost:8767/index.html';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const seed = settings => ({ version: 2, profile: { name: 'Ayhan', lang: 'en', onboarded: true }, settings: { quality: 'high', ...settings }, days: {}, tasks: [] });
async function mk(opts, data, clock) {
  const ctx = await browser.newContext(opts); const errs = [];
  if (clock) await ctx.clock.install({ time: new Date(clock) });
  await ctx.addInitScript(d => { if (!localStorage.getItem('domat-v1')) localStorage.setItem('domat-v1', JSON.stringify(d)); }, data);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
  return { ctx, p, errs };
}
const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('domat-v1')));

// 1) gündüz, masaüstü
{ const { ctx, p, errs } = await mk({ viewport: { width: 1440, height: 900 } }, seed({}));
  await p.goto(BASE + '?halloween=1', { waitUntil: 'networkidle' }); await W(7500);
  ok(await p.evaluate(() => window.__hw.on()), 'süsler açık'); ok(await p.evaluate(() => window.__hw.hat()), 'Hasan Dede cadı şapkalı');
  await p.screenshot({ path: `${OUT}/hw-day.png` });
  // ayar düğmesi: kapat, kontrol et, aç
  ok(await p.evaluate(() => !document.querySelector('#rowHalloween').hidden), 'ayar satırı görünür');
  await p.evaluate(() => document.querySelector('#setHalloween').click()); await W(600);
  ok(!(await p.evaluate(() => window.__hw.on())) && !(await p.evaluate(() => window.__hw.hat())), 'kapatınca süsler ve şapka gidiyor');
  await p.screenshot({ path: `${OUT}/hw-off.png` });
  await p.evaluate(() => document.querySelector('#setHalloween').click()); await W(600);
  ok(await p.evaluate(() => window.__hw.on()), 'yeniden açılıyor');
  // hayalet
  await p.evaluate(() => window.__hw.poke()); await W(250);
  ok((await p.evaluate(() => window.__hw.ghost())).spin > 0, 'hayalet dokununca dönüyor');
  const bub = await p.textContent('#bubbleText'); ok(/ghost|Boo|pond/i.test(bub), 'Hasan Dede hayalet repliği: ' + bub);
  await W(500); await p.screenshot({ path: `${OUT}/hw-ghost.png` });
  ok(!errs.length, 'konsol hatası yok ' + errs.join(' | ')); await ctx.close(); }

// 2) akşam teması: oyma yüzler yanmalı
{ const { ctx, p, errs } = await mk({ viewport: { width: 1440, height: 900 } }, seed({ ambient: 'evening' }));
  await p.goto(BASE + '?halloween=1', { waitUntil: 'networkidle' }); await W(8000);
  await p.screenshot({ path: `${OUT}/hw-evening.png` }); ok(!errs.length, 'akşam: konsol hatası yok ' + errs.join(' | ')); await ctx.close(); }

// 3) telefon
{ const { ctx, p, errs } = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, seed({}));
  await p.goto(BASE + '?halloween=1', { waitUntil: 'networkidle' }); await W(8000);
  await p.screenshot({ path: `${OUT}/hw-mobile.png` }); ok(!errs.length, 'telefon: konsol hatası yok ' + errs.join(' | ')); await ctx.close(); }

// 4) balkabağı hasadı: hızlı mod, 5 sn odak → ekim → mola → hasat
{ const { ctx, p, errs } = await mk({ viewport: { width: 1440, height: 900 } }, seed({ fast: true, focus: 20, short: 40, autoBreak: true }));
  await p.goto(BASE + '?halloween=1', { waitUntil: 'networkidle' }); await W(6000);
  await p.click('#btnMain'); await W(3000);
  let d = await store(p); const k = Object.keys(d.days)[0]; const rec = d.days[k].plots.find(Boolean);
  ok(rec && rec.pumpkin === true, 'ekilen fide balkabağı taşıyor');
  await W(14000); await p.screenshot({ path: `${OUT}/hw-grown.png` });
  for (let i = 0; i < 60; i++) { d = await store(p); if ((d.days[k].pumpkins || 0) > 0) break; await W(1000); }
  ok((d.days[k].pumpkins || 0) === 1, 'hasatta 1 balkabağı kasaya: ' + d.days[k].pumpkins + ', domates ' + d.days[k].tomatoes);
  ok(d.days[k].tomatoes > 0, 'domates sayısı da işledi');
  await W(2500); await p.screenshot({ path: `${OUT}/hw-crate.png` });
  await p.evaluate(() => document.querySelector('#btnCard').click()); await W(3500);
  await p.screenshot({ path: `${OUT}/hw-card.png` });
  ok(!errs.length, 'hasat: konsol hatası yok ' + errs.join(' | ')); await ctx.close(); }

// 5) tarih penceresi (parametresiz): 22 Ekim açık, 2 Kasım kapalı
for (const [when, want] of [['2026-10-22T10:00:00', true], ['2026-11-01T22:00:00', true], ['2026-11-02T09:00:00', false], ['2026-10-21T09:00:00', false]]) {
  const { ctx, p, errs } = await mk({ viewport: { width: 1280, height: 800 } }, seed({}), when);
  await p.goto(BASE, { waitUntil: 'load' }); await W(3000);
  const st = await p.evaluate(() => ({ row: !document.querySelector('#rowHalloween').hidden, on: document.querySelector('#setHalloween').getAttribute('aria-checked') }));
  ok(st.row === want && (st.on === 'true') === want, `${when}: süsler ${want ? 'açık' : 'kapalı'} (satır ${st.row}, düğme ${st.on})`);
  ok(!errs.length, `${when}: konsol hatası yok ` + errs.join(' | ')); await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} HATA` : 'HEPSİ TAMAM'); process.exit(fails ? 1 : 0);
