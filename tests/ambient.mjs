// Ortam sesi testi: 60 sn'lik döngü <audio> öğesine işlenir, seçim/sessiz/ses düzeyi öğeye yansır.
// IOS=1 ile iOS'taki salt okunur volume taklit edilir (ses düzeyi dosyaya işlenmeli). Sunucu 8767'de açıkken çalıştır.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:8767', IOS = !!process.env.IOS;
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const errs = [], seed = { version: 2, profile: { name: 'A', lang: 'tr', onboarded: true }, settings: { tasksOpen: false, ambient: 'birds' }, tasks: [], days: {} };
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(([s, ios]) => {
  if (!localStorage.getItem('domat-v1')) localStorage.setItem('domat-v1', JSON.stringify(s));
  const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__amb = this; return play.call(this); };
  if (ios) Object.defineProperty(HTMLMediaElement.prototype, 'volume', { get() { return 1; }, set() { } });
}, [seed, IOS]);
await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
const st = () => p.evaluate(() => { const a = window.__amb; return a && { paused: a.paused, muted: a.muted, vol: +a.volume.toFixed(2), dur: Math.round(a.duration), src: a.src.slice(-8), title: navigator.mediaSession?.metadata?.title }; });
await p.mouse.click(640, 500); await p.waitForTimeout(2500);
const s1 = await st(); console.log('kuşlar:', JSON.stringify(s1));
await p.click('#btnAmbient'); await p.click('[data-amb="rain"]'); await p.waitForTimeout(2500);
const s2 = await st(); console.log('yağmur:', JSON.stringify(s2));
await p.keyboard.press('Escape'); await p.keyboard.press('m'); await p.waitForTimeout(200); const s3 = await st(); console.log('m:', JSON.stringify(s3));
await p.keyboard.press('m'); await p.click('#btnAmbient'); await p.fill('#volPop', '0.3'); await p.dispatchEvent('#volPop', 'input'); await p.waitForTimeout(2500);
const s4 = await st(); console.log('ses 0.3:', JSON.stringify(s4));
// döngünün sesi gerçekten var mı: blobu çözüp RMS ölç
const rms = await p.evaluate(async () => { const buf = await (await fetch(window.__amb.src)).arrayBuffer(); const d = new Int16Array(buf, 44); let q = 0; for (let i = 0; i < d.length; i += 7) q += (d[i] / 32768) ** 2; return +Math.sqrt(q / (d.length / 7)).toFixed(4); });
console.log('rms:', rms);
await p.click('[data-amb="off"]'); await p.waitForTimeout(300); const s5 = await st(); console.log('kapalı:', JSON.stringify(s5));
const ok = s1?.dur === 60 && !s1.paused && s2.src !== s1.src && !s2.paused && s2.title === 'Yağmur' && s3.muted && !s4.muted && rms > .005 && s5.paused
  && (IOS ? s4.src !== s2.src : s4.vol === .3);
console.log(ok && !errs.length ? 'TAMAM' : 'HATA', errs.join(' | ')); await b.close(); process.exit(ok && !errs.length ? 0 : 1);
