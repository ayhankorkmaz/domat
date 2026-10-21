import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';
import { STR, LINES_ALL } from './i18n.js';

/* ================================================================
   Helpers
   ================================================================ */
const $ = s => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => smooth(clamp((x - a) / (b - a)));
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = a => a[Math.random() * a.length | 0];
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v); }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TMP = { v: V(), v2: V(), q: new THREE.Quaternion(), s: V(), m: new THREE.Matrix4(), c: new THREE.Color() };
const isSmall = matchMedia('(max-width: 700px)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const matCache = new Map();
function M(color, o = {}) { const k = color + JSON.stringify(o); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: .78, ...o })); return matCache.get(k); }
const RB = (w, h, d, r = .06, s = 3) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001));
function add(geo, mat, x = 0, y = 0, z = 0, parent, shadow = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; (parent || scene).add(m); return m; }
const SPH = new THREE.SphereGeometry(1, 20, 14), SPH_LO = new THREE.SphereGeometry(1, 12, 8), ICO = new THREE.IcosahedronGeometry(1, 0);

/* ================================================================
   i18n: Türkçe varsayılan, İngilizce tam
   ================================================================ */
let LANG = 'en';
const PAGE_TITLE = 'Domat - Boost Your Productivity'; // sekme ve arama başlığı; sayaç çalışırken yerini geri sayım alır
const LOC = () => (LANG === 'tr' ? 'tr-TR' : 'en-US');
function tr(key, ...a) { const v = (STR[LANG] && STR[LANG][key]) ?? STR.tr[key]; return typeof v === 'function' ? v(...a) : (v ?? key); }
const LN = () => LINES_ALL[LANG];
// Cadılar Bayramı'nda Hasan Dede çoğu zaman mevsimlik konuşur (hw_ anahtarları)
function LNP(k) { const L = LN(), h = L['hw_' + k]; return h && typeof hwOn === 'function' && hwOn() && Math.random() < .6 ? h : L[k]; }
function nm() { const n = (data?.profile?.name || '').trim(); return n || (LANG === 'tr' ? 'evlat' : 'friend'); }
function fillT(s, vars = {}) { return s.replace(/\{name\}/g, nm()).replace(/\{t\}/g, vars.t ?? ''); }
function hm(ts) { return new Date(ts).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' }); }
function applyI18n() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = tr(e.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(e => { e.innerHTML = tr(e.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-title]').forEach(e => { e.title = tr(e.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(e => { e.setAttribute('aria-label', tr(e.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-ph]').forEach(e => { e.placeholder = tr(e.dataset.i18nPh); });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === LANG)));
}

/* ================================================================
   Persistence
   ================================================================ */
const KEY = 'domat-v1';
const DEFAULTS = { season: 'auto', halloween: true, quality: 'auto', ambVol: 1, fxVol: 1, tick: false, chime: 'bells', focus: 25, short: 5, long: 15, interval: 4, goal: 40, autoBreak: true, autoFocus: false, volume: .7, ambient: 'birds', notify: false, fast: false, muted: false, tasksOpen: null };
let data = null;
try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
data = data || {};
data.version = 2;
data.settings = { ...DEFAULTS, ...(data.settings || {}) };
data.days = data.days || {};
data.tasks = Array.isArray(data.tasks) ? data.tasks : [];
data.profile = { name: '', lang: 'en', onboarded: false, ...(data.profile || {}) };
data.state = { phase: 'focus', running: false, endAt: 0, remaining: null, setDone: 0, sets: 0, task: '', curPlot: null, taskId: null, noTaskOk: false, ...(data.state || {}) };
LANG = data.profile.lang === 'tr' ? 'tr' : 'en';
const S = data.state, CFG = data.settings;
let saveT = 0;
function save(now = false) { clearTimeout(saveT); const w = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { } }; now ? w() : (saveT = setTimeout(w, 250)); }
function dayKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function today() { const k = dayKey(); if (!data.days[k]) { data.days[k] = { tomatoes: 0, golden: 0, sessions: [], plots: [], sets: 0 }; if (S.curPlot !== null && !S.running) S.curPlot = null; } return data.days[k]; }
if (S.curPlot !== null && !today().plots[S.curPlot]) S.curPlot = null;
if (S.taskId && !data.tasks.some(x => x.id === S.taskId && !x.doneAt)) S.taskId = null;

/* ================================================================
   Audio (all synthesized)
   ================================================================ */
function noiseBufs(ctx) {
  const len = ctx.sampleRate * 4, white = ctx.createBuffer(1, len, ctx.sampleRate), brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const wd = white.getChannelData(0), bd = brown.getChannelData(0); let last = 0;
  for (let i = 0; i < len; i++) { const r = Math.random() * 2 - 1; wd[i] = r; last = (last + .02 * r) / 1.02; bd[i] = last * 3.5; }
  return { white, brown };
}
function wavBlob(f32, sr) {  // 16 bit mono PCM
  const n = f32.length, b = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, str) => { for (let i = 0; i < str.length; i++) b.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f32[i])) * 32767, true);
  return new Blob([b], { type: 'audio/wav' });
}
const AudioFX = {
  ctx: null, lastTock: 0, lastStep: 0,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); this.ambPlay(); return true; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
      const ctx = this.ctx = new C();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
      this.master = ctx.createGain(); this.master.connect(comp); comp.connect(ctx.destination);
      this.fx = ctx.createGain(); this.fx.gain.value = .9; this.fx.connect(this.master);
      Object.assign(this, noiseBufs(ctx));
      // ortam sesi öğesi: ilk dokunuşta sessiz bir parçayla açılır ki sonraki play() çağrıları iOS'ta izinli olsun
      const el = this.el = new Audio(); el.loop = true; el.preload = 'auto'; el.src = URL.createObjectURL(wavBlob(new Float32Array(2400), 24000)); el.play().then(() => { if (CFG.ambient === 'off') el.pause(); }).catch(() => { });
      el.volume = .5; this.volOK = el.volume === .5;  // iOS'ta volume salt okunur: ses düzeyi dosyaya işlenir
      const ir = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
      this.verb = ctx.createConvolver(); this.verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = .3; this.verb.connect(vg); vg.connect(this.master);
      this.applyVolume();
      if (CFG.ambient !== 'off') this.setAmbient(CFG.ambient);
      return true;
    } catch (e) { return false; }
  },
  applyVolume() { if (!this.master) return; const t = this.ctx.currentTime; this.master.gain.setTargetAtTime(CFG.muted ? 0 : CFG.volume, t, .05); this.fx.gain.setTargetAtTime(.9 * (CFG.fxVol ?? 1), t, .05);
    const el = this.el; if (!el) return; el.muted = !!CFG.muted;
    if (this.volOK) el.volume = clamp((CFG.volume ?? .7) * (CFG.ambVol ?? 1));
    else { clearTimeout(this.ambT); this.ambT = setTimeout(() => { if (CFG.ambient !== 'off' && this.ambUrl?.key !== CFG.ambient + '@' + this.ambGain().toFixed(2)) this.setAmbient(CFG.ambient); }, 400); }
  },
  tick(on) { if (!this.ctx) return; this.osc('sine', on ? 1900 : 1500, this.ctx.currentTime, .03, .018); },
  src(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 3); return s; },
  lfo(freq, depth, param) { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.value = freq; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o; },
  env(node, t, a, peak, d, dest) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); node.connect(g); g.connect(dest || this.fx); return g; },
  osc(type, f, t, dur, peak, dest, f2) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); this.env(o, t, .006, peak, dur, dest); o.start(t); o.stop(t + dur + .05); return o; },
  noise(t, dur, peak, type, freq, q = 1, dest) { const n = this.ctx.createBufferSource(); n.buffer = this.white; const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; n.connect(f); this.env(f, t, .004, peak, dur, dest); n.start(t, Math.random() * 3); n.stop(t + dur + .05); return f; },
  birdCall(dest, t) {
    const ctx = this.ctx, base = rand(2400, 4200), n = 2 + (Math.random() * 5 | 0), kind = Math.random();
    for (let i = 0; i < n; i++) { const st = t + i * rand(.09, .16); const o = ctx.createOscillator(); o.type = 'sine'; const f = base * rand(.9, 1.15);
      if (kind < .5) { o.frequency.setValueAtTime(f, st); o.frequency.exponentialRampToValueAtTime(f * 1.5, st + .06); } else { o.frequency.setValueAtTime(f * 1.4, st); o.frequency.exponentialRampToValueAtTime(f * .8, st + .08); }
      this.env(o, st, .01, .035, .08, dest); o.start(st); o.stop(st + .12); }
  },
  /* Ortam sesi: aynı sentez OfflineAudioContext'te 60 sn'lik döngüye işlenir, <audio loop> ile çalınır.
     iOS sayfa arka plana geçince Web Audio'yu askıya alır; <audio> öğesi çalmaya devam eder (kilit ekranı kartıyla). */
  ambGraph(kind, g) {
    const ctx = this.ctx; let every = 0, fn = null;
    if (kind === 'birds') {
      const s = this.src(this.brown), lp = ctx.createBiquadFilter(), sg = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 600; sg.gain.value = .12; s.connect(lp); lp.connect(sg); sg.connect(g); this.lfo(.07, .06, sg.gain);
      every = 900; fn = tt => { if (Math.random() < .55) this.birdCall(g, tt + Math.random() * .5); };
    } else if (kind === 'rain') {
      const s = this.src(this.white), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), sg = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = 600; lp.type = 'lowpass'; lp.frequency.value = 7000; sg.gain.value = .15; s.connect(hp); hp.connect(lp); lp.connect(sg); sg.connect(g);
      const r = this.src(this.brown), rl = ctx.createBiquadFilter(), rg = ctx.createGain(); rl.type = 'lowpass'; rl.frequency.value = 400; rg.gain.value = .35; r.connect(rl); rl.connect(rg); rg.connect(g);
      every = 250; fn = tt => { for (let i = 0; i < 4; i++) this.osc('sine', rand(1600, 4200), tt + Math.random() * .25, .05, .022, g); if (Math.random() < .1) this.osc('sine', rand(500, 700), tt + .1, .12, .05, g, 300); };
    } else if (kind === 'wind') {
      const s = this.src(this.brown), bp = ctx.createBiquadFilter(), sg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = .9; sg.gain.value = .7;
      s.connect(bp); bp.connect(sg); sg.connect(g); this.lfo(.09, 220, bp.frequency); this.lfo(.13, .35, sg.gain);
      const s2 = this.src(this.white), bp2 = ctx.createBiquadFilter(), g2 = ctx.createGain(); bp2.type = 'bandpass'; bp2.frequency.value = 1400; bp2.Q.value = 4; g2.gain.value = .02;
      s2.connect(bp2); bp2.connect(g2); g2.connect(g); this.lfo(.05, 600, bp2.frequency);
      every = 1200; fn = tt => { if (Math.random() < .3) this.noise(tt, .5, .05, 'bandpass', 3000, .7, g); };
    } else if (kind === 'evening') {
      const s = this.src(this.brown), lp = ctx.createBiquadFilter(), sg = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 350; sg.gain.value = .2; s.connect(lp); lp.connect(sg); sg.connect(g);
      const chirp = (f, st, n, amp) => { for (let i = 0; i < n; i++) this.osc('sine', f, st + i * .055, .035, amp, g); };
      every = 700; fn = tt => { if (Math.random() < .75) chirp(rand(4300, 4700), tt + Math.random() * .4, 3 + (Math.random() * 3 | 0), .028); if (Math.random() < .25) chirp(rand(3000, 3300), tt + .6, 2, .02);
        if (Math.random() < .12) { for (let i = 0; i < 2; i++) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = rand(110, 140); const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 500; o.connect(lp2); this.env(lp2, tt + i * .35, .02, .05, .22, g); o.start(tt + i * .35); o.stop(tt + i * .35 + .3); } } };
    }
    return { every, fn };
  },
  async renderAmbient(kind, gain) {
    const key = kind + '@' + gain.toFixed(2); if (this.ambUrl?.key === key) return this.ambUrl.url;
    const C = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!C) return null;
    const SR = 24000, L = 60, F = 2, off = new C(1, (L + F) * SR, SR), A = Object.assign(Object.create(this), { ctx: off }, noiseBufs(off));
    const g = off.createGain(), bake = off.createGain(), comp = off.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; bake.gain.value = gain;
    g.connect(bake); bake.connect(comp); comp.connect(off.destination);
    const { every, fn } = A.ambGraph(kind, g); if (!fn) return null; for (let tt = 0; tt < L + F; tt += every / 1000) fn(tt);
    const d = (await off.startRendering()).getChannelData(0), out = d.slice(0, L * SR);
    for (let i = 0, n = F * SR; i < n; i++) { const w = i / n; out[i] = d[i] * Math.sqrt(w) + d[L * SR + i] * Math.sqrt(1 - w); }  // döngü ekini yumuşat
    if (this.ambUrl) URL.revokeObjectURL(this.ambUrl.url);
    this.ambUrl = { key, url: URL.createObjectURL(wavBlob(out, SR)) }; return this.ambUrl.url;
  },
  ambGain() { return this.volOK ? 1 : (CFG.volume ?? .7) * (CFG.ambVol ?? 1); },
  ambPlay() { const el = this.el; if (!el || CFG.ambient === 'off' || !el.paused) return; el.play().catch(() => { }); },
  setAmbient(kind) {
    CFG.ambient = kind; save();
    if (!this.el) return;
    const tok = this.ambTok = (this.ambTok || 0) + 1, el = this.el;
    if (kind === 'off') { el.pause(); return; }
    this.renderAmbient(kind, this.ambGain()).then(url => {
      if (!url || tok !== this.ambTok) return;
      if (el.src !== url) el.src = url; el.play().catch(() => { });
      const ms = navigator.mediaSession; if (ms && window.MediaMetadata) {
        ms.metadata = new MediaMetadata({ title: tr('a' + kind[0].toUpperCase() + kind.slice(1)), artist: 'Domat', artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
        try { ms.setActionHandler('play', () => el.play().catch(() => { })); ms.setActionHandler('pause', () => el.pause()); } catch (e) { }
      }
    }).catch(() => { });
  },
  bell(freq, when = 0, amp = .2, decay = 2.4) {
    if (!this.ctx) return; const t = this.ctx.currentTime + when;
    [[1, 1], [2.01, .4], [3, .22], [4.07, .12]].forEach(([m, a], i) => { const o = this.ctx.createOscillator(); o.frequency.value = freq * m; const e = this.env(o, t, .005, amp * a, decay / (1 + i * .7)); e.connect(this.verb); o.start(t); o.stop(t + decay + .1); });
  },
  marimba(freq, when = 0, amp = .2) { if (!this.ctx) return; const t = this.ctx.currentTime + when; this.osc('sine', freq, t, .5, amp); this.osc('sine', freq * 4, t, .08, amp * .3); },
  chimeStart() { [523.25, 659.25, 783.99].forEach((f, i) => this.marimba(f, i * .09, .16)); },
  chimeRipe() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.bell(f, i * .12, .15)); },
  chimeBreakDone() { this.marimba(783.99, 0, .2); this.marimba(587.33, .18, .2); this.marimba(392, .36, .22); },
  fanfare() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.marimba(f, i * .12, .2)); [1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => this.bell(f, .55 + i * .08, .12, 3)); },
  sad() { if (!this.ctx) return; const t = this.ctx.currentTime; this.osc('triangle', 392, t, .35, .1, null, 370); this.osc('triangle', 349, t + .3, .6, .1, null, 300); },
  tock(v) { if (!this.ctx) return; const now = performance.now(); if (now - this.lastTock < 30) return; this.lastTock = now; this.osc('sine', rand(300, 420) + v * 30, this.ctx.currentTime, .1, clamp(v / 6, .02, .2), null, 120); },
  pop() { if (!this.ctx) return; this.osc('sine', 500, this.ctx.currentTime, .12, .14, null, 1300); },
  pluck() { if (!this.ctx) return; const t = this.ctx.currentTime; this.osc('sine', 700, t, .08, .14, null, 1500); this.noise(t, .05, .05, 'highpass', 3000); },
  step() { if (!this.ctx) return; const n = performance.now(); if (n - this.lastStep < 180) return; this.lastStep = n; this.noise(this.ctx.currentTime, .07, .035, 'lowpass', 700); },
  dig() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(t, .18, .14, 'lowpass', 1100); this.osc('sine', 110, t, .2, .2, null, 50); },
  water(dur) { if (!this.ctx) return; const t = this.ctx.currentTime; const f = this.noise(t, dur, .07, 'bandpass', 2600, .8); for (let i = 0; i < 12; i++) this.osc('sine', rand(900, 1800), t + Math.random() * dur, .04, .02); },
  door(open) { if (!this.ctx) return; const t = this.ctx.currentTime; if (open) { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(170, t); o.frequency.linearRampToValueAtTime(240, t + .4); const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 6; o.connect(bp); this.env(bp, t, .05, .05, .4); o.start(t); o.stop(t + .5); } else { this.osc('sine', 120, t, .2, .2, null, 60); this.noise(t, .08, .08, 'lowpass', 900); } },
  cluck() { if (!this.ctx) return; const t = this.ctx.currentTime; for (let i = 0; i < 3; i++) { const st = t + i * .11; const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(rand(650, 800), st); o.frequency.exponentialRampToValueAtTime(380, st + .07); const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 2; o.connect(bp); this.env(bp, st, .005, .09, .07); o.start(st); o.stop(st + .1); } },
  whistle() { if (!this.ctx) return; const t = this.ctx.currentTime, notes = pick([[784, 880, 988, 880, 784, 659], [659, 784, 880, 784, 659, 587, 659], [880, 784, 659, 784, 880, 880]]);
    notes.forEach((f, i) => { const st = t + i * .2; const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.5, st); const vib = this.ctx.createOscillator(), vg = this.ctx.createGain(); vib.frequency.value = 6; vg.gain.value = 9; vib.connect(vg); vg.connect(o.frequency); vib.start(st); vib.stop(st + .22); this.env(o, st, .03, .045, .17); o.start(st); o.stop(st + .22); }); },
  splash() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(t, .3, .1, 'bandpass', 1500, .7); this.osc('sine', 600, t + .02, .15, .08, null, 1400); },
  creak() { if (!this.ctx) return; const t = this.ctx.currentTime; this.osc('sawtooth', 90, t, .5, .03, null, 70); },
  // hayaletin "böö"ü: titreyerek alçalan yumuşak ton + nefes
  boo() { if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.osc('sine', 540, t, .75, .13, null, 190); const vib = this.ctx.createOscillator(), vg = this.ctx.createGain(); vib.frequency.value = 7; vg.gain.value = 22; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + .8); this.noise(t, .55, .03, 'bandpass', 650, 1.5); },
};

/* ================================================================
   Renderer / scene / post
   ================================================================ */
const canvas = $('#scene');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { $('#loading').textContent = tr('webgl'); throw e; }
const DPR = Math.min(devicePixelRatio || 1, isSmall ? 1.5 : 1.75);
renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 60, 200);
const camera = new THREE.PerspectiveCamera(isSmall ? 40 : 32, innerWidth / innerHeight, .1, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .07; controls.enablePan = false;
controls.minDistance = 12; controls.maxDistance = isSmall ? 95 : 60; controls.maxPolarAngle = 1.38; controls.minPolarAngle = .35;
controls.rotateSpeed = .55; controls.zoomSpeed = .8;
const BASE_TARGET = isSmall ? V(.9, .3, -1.0) : V(.2, .3, -0.8);
controls.target.copy(BASE_TARGET);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .25, .55, .9);
composer.addPass(bloom); composer.addPass(new OutputPass());

/* ================================================================
   Themes
   ================================================================ */
const THEMES = {
  day:     { top: '#3f9be8', hor: '#bfe6f8', bot: '#7dbde6', sun: '#fff3da', sunI: 3.1, el: .9, az: .75, hSky: '#d2e9ff', hGr: '#6f8f4a', hI: 1.05, cL: '#ffffff', cS: '#8dbfe3', stars: 0, glow: .15, bloom: .16, fire: 0, exp: 1.0, accent: '#ef4e3a', deep: '#b8321f' },
  golden:  { top: '#4f86d6', hor: '#ffd29a', bot: '#dc8f78', sun: '#ffc583', sunI: 2.7, el: .42, az: 2.0, hSky: '#ffe2c0', hGr: '#6b5a3a', hI: .92, cL: '#fff0de', cS: '#d9957e', stars: 0, glow: .55, bloom: .26, fire: .25, exp: 1.02, accent: '#f08a24', deep: '#b8601a' },
  evening: { top: '#1b2156', hor: '#ff9775', bot: '#5c3060', sun: '#ff8a5a', sunI: 1.3, el: .1, az: 3.3, hSky: '#8a7ad8', hGr: '#3a2e44', hI: .9, cL: '#ffb59c', cS: '#4a3366', stars: .8, glow: 2.4, bloom: .5, fire: 1, exp: 1.08, accent: '#8d6cf0', deep: '#5d40b8' },
};
const RAIN_TINT = new THREE.Color('#7b8796');
const COLOR_KEYS = ['top', 'hor', 'bot', 'sun', 'hSky', 'hGr', 'cL', 'cS'];
const NUM_KEYS = ['sunI', 'el', 'az', 'hI', 'stars', 'glow', 'bloom', 'fire', 'exp'];
for (const k in THEMES) for (const c of COLOR_KEYS) THEMES[k][c] = new THREE.Color(THEMES[k][c]);
function themeKey() { if (CFG.ambient === 'evening' || S.phase === 'long') return 'evening'; if (S.phase === 'short') return 'golden'; return 'day'; }
const theme = {}; let rainMix = CFG.ambient === 'rain' ? 1 : 0, windMix = CFG.ambient === 'wind' ? 1 : 0;
(function () { const t = THEMES[themeKey()]; for (const c of COLOR_KEYS) theme[c] = t[c].clone(); for (const n of NUM_KEYS) theme[n] = t[n]; })();

/* ================================================================
   Sky + cloud sea
   ================================================================ */
const skyU = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uSunDir: { value: V(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uStars: { value: 0 }, uTime: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform vec3 uTop,uHor,uBot,uSunDir,uSunCol; uniform float uStars,uTime; varying vec3 vDir;
    float hash(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    void main(){ vec3 d = normalize(vDir); float h = d.y;
      vec3 col = h > 0.0 ? mix(uHor, uTop, pow(clamp(h,0.,1.), .55)) : mix(uHor, uBot, pow(clamp(-h,0.,1.), .45));
      float sd = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSunCol * (smoothstep(.9993, .9997, sd) * 3.0 + pow(sd, 30.0) * .4 + pow(sd, 5.0) * .12);
      if (uStars > .001 && h > 0.0) { vec3 p = d * 230.0; vec3 c = floor(p); vec3 f = fract(p) - .5; float r = hash(c);
        if (r > .975) { vec3 o = vec3(hash(c+1.3), hash(c+2.7), hash(c+4.1)) - .5; float dd = length(f - o * .6); float tw = .55 + .45 * sin(uTime * (1.2 + r * 5.0) + r * 60.0);
          col += vec3(1.,.97,.9) * smoothstep(.24, .0, dd) * tw * uStars * smoothstep(.05, .3, h) * (.5 + (r - .975) * 40.0); } }
      gl_FragColor = vec4(col, 1.0); }`
}));
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
const cloudVS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const cloudFS = `uniform float uTime,uAlpha,uScale; uniform vec3 uLight,uShade,uHor,uCam; varying vec3 vW;
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f); return mix(mix(h2(i), h2(i+vec2(1,0)), u.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a*n2(p); p = p*2.03 + vec2(1.7,9.2); a *= .5; } return s; }
  void main(){ vec2 p = vW.xz * uScale + vec2(uTime*.012, uTime*.007); float q = fbm(p*.6 - uTime*.004); float n = fbm(p + q*1.5);
    float d = smoothstep(.36, .74, n); vec3 col = mix(uShade, uLight, d) + uLight*smoothstep(.55,.9,n)*.12;
    float fade = smoothstep(40.0, 420.0, length(vW.xz - uCam.xz)); col = mix(col, uHor, fade);
    gl_FragColor = vec4(col, uAlpha > .99 ? 1.0 : d * uAlpha * (1.0 - fade)); }`;
function cloudLayer(y, size, alpha, scale) {
  const u = { uTime: { value: 0 }, uAlpha: { value: alpha }, uScale: { value: scale }, uLight: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uCam: { value: V() } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShaderMaterial({ uniforms: u, vertexShader: cloudVS, fragmentShader: cloudFS, transparent: alpha < 1, depthWrite: alpha >= 1, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); return u;
}
const cloudLayers = [cloudLayer(-16, 1600, 1, .026), cloudLayer(-8.5, 380, .5, .045)];
const puffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: .25 });
const puffs = new THREE.Group(); scene.add(puffs);
for (let i = 0; i < 9; i++) {
  const g = new THREE.Group(); const n = 4 + (Math.random() * 3 | 0);
  for (let j = 0; j < n; j++) { const m = new THREE.Mesh(SPH, puffMat); const s = rand(1.2, 2.5) * (1 - Math.abs(j - n / 2) / n * .5); m.scale.set(s * 1.3, s * .75, s); m.position.set((j - n / 2) * 1.8, rand(-.2, .5), rand(-.6, .6)); g.add(m); }
  g.userData = { r: rand(34, 60), a: rand(0, 6.28), y: rand(-2, 9), sp: rand(.005, .012) * (Math.random() < .5 ? 1 : -1), bob: rand(0, 6) };
  puffs.add(g);
}

/* ================================================================
   Lights
   ================================================================ */
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true; sun.shadow.mapSize.set(isSmall ? 1536 : 2048, isSmall ? 1536 : 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 1, far: 90 });
sun.shadow.bias = -.0005; sun.shadow.normalBias = .04; sun.shadow.radius = 5;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xbfd8ff, .35); fill.position.set(-14, 8, 10); scene.add(fill);

/* ================================================================
   Layout constants
   ================================================================ */
const TW = 24, TD = 18, TRAD = 2.4;
const HOUSE = { x: -6, z: -5.0 };
const PORCH = { x0: -8.4, x1: -3.6, z0: -3.1, z1: -1.75, top: .28 };
const DOOR_X = -5.0;
const GARDEN = { x0: .6, x1: 9.4, z0: -4.3, z1: 2.7, gateZ0: -1.65, gateZ1: -.15 };
const AISLE_Z = -.9;
// bahçe genişlemesi: 3. tarh sırası ve ikinci koridor
const AISLE2_Z = 3.15, GARDEN_Z1_BIG = 6.6, CORR_X = 1.3;
const ROWS = [{ z: -2.9, stand: -1.55, yaw: Math.PI, aisle: AISLE_Z }, { z: 1.3, stand: -.25, yaw: 0, aisle: AISLE_Z }, { z: 5.0, stand: 3.6, yaw: 0, aisle: AISLE2_Z }];
const aisleOf = z => (z > (AISLE_Z + AISLE2_Z) / 2 ? AISLE2_Z : AISLE_Z);
const totalTomatoes = () => Object.values(data.days).reduce((s, d) => s + (d.tomatoes || 0), 0);
data.garden = { rows: 2, ...(data.garden || {}) };
if (totalTomatoes() >= 100) data.garden.rows = 3;
if (data.garden.rows >= 3) GARDEN.z1 = GARDEN_Z1_BIG;
const PLOT_XS = [2.1, 4.1, 6.1, 8.1];
const CRATE = { x: -2.55, z: -2.45 };
const POND = { x: -7.6, z: 4.7, r: 1.6 };
const WINDMILL = { x: 8.6, z: -6.8 };
const TREES = [{ x: -10.2, z: -6.7, s: 1.15, apple: false }, { x: 10.2, z: 6.3, s: 1.05, apple: true }, { x: -1.0, z: -7.4, s: .9, apple: false }, { x: -10.6, z: 1.2, s: .75, apple: false }];
const TREE_BIG_POS = { x: 11.1, z: -7.2 };
if (data.garden.rows >= 3) Object.assign(TREES[1], TREE_BIG_POS);
const PATH_FRONT = [], PATH_GATE = [];
function tileSDF(x, z) { const qx = Math.abs(x) - (TW / 2 - TRAD), qz = Math.abs(z) - (TD / 2 - TRAD); return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - TRAD; }
function groundY(x, z) {
  if (x > PORCH.x0 && x < PORCH.x1 && z > PORCH.z0 - .5 && z < PORCH.z1 + .3) { if (z <= PORCH.z1) return PORCH.top; return lerp(PORCH.top, 0, (z - PORCH.z1) / .3); }
  return 0;
}

/* ================================================================
   Floating diorama tile
   ================================================================ */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.allowSleep = true; // NaiveBroadphase: SAP sorts static bodies by stale AABBs and misses them
const groundMat = new CANNON.Material('g'), fruitMat = new CANNON.Material('f');
world.addContactMaterial(new CANNON.ContactMaterial(groundMat, fruitMat, { friction: .4, restitution: .35 }));
world.addContactMaterial(new CANNON.ContactMaterial(fruitMat, fruitMat, { friction: .3, restitution: .4 }));
function staticBox(x, y, z, hx, hy, hz) { const b = new CANNON.Body({ mass: 0, material: groundMat, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) }); b.position.set(x, y, z); world.addBody(b); return b; }
staticBox(0, -1, 0, TW / 2, 1, TD / 2);

const grassTopMat = M('#7cc35a', { roughness: .95 }), dirtMat = M('#a0663f', { roughness: 1 });
(() => {
  const sh = new THREE.Shape(); const w = TW / 2, d = TD / 2, r = TRAD;
  sh.moveTo(-w + r, -d); sh.lineTo(w - r, -d); sh.quadraticCurveTo(w, -d, w, -d + r); sh.lineTo(w, d - r); sh.quadraticCurveTo(w, d, w - r, d); sh.lineTo(-w + r, d); sh.quadraticCurveTo(-w, d, -w, d - r); sh.lineTo(-w, -d + r); sh.quadraticCurveTo(-w, -d, -w + r, -d);
  const top = new THREE.ExtrudeGeometry(sh, { depth: .5, bevelEnabled: true, bevelThickness: .2, bevelSize: .2, bevelSegments: 4, curveSegments: 20 });
  top.rotateX(-Math.PI / 2); top.computeBoundingBox(); top.translate(0, -top.boundingBox.max.y, 0);
  add(top, [grassTopMat, M('#6aa94b', { roughness: 1 })], 0, 0, 0, null, false).receiveShadow = true;
  const mid = new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: true, bevelThickness: .15, bevelSize: .1, bevelSegments: 3, curveSegments: 20 });
  mid.rotateX(-Math.PI / 2); mid.computeBoundingBox(); mid.translate(0, -mid.boundingBox.max.y - .62, 0); mid.scale(.985, 1, .985);
  add(mid, [dirtMat, dirtMat], 0, 0, 0, null, false);
  // strata stripe
  const band = new THREE.ExtrudeGeometry(sh, { depth: .25, bevelEnabled: false, curveSegments: 20 }); band.rotateX(-Math.PI / 2); band.scale(.99, 1, .99); band.translate(0, -1.55, 0);
  add(band, M('#8b5434', { roughness: 1 }), 0, 0, 0, null, false);
  // rock underside
  const rockM = M('#8c7f95', { roughness: 1, flatShading: true }), rockD = M('#6c6078', { roughness: 1, flatShading: true });
  const rng = mulberry32(3);
  for (let i = 0; i < 22; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), n = .8 + vnoise(x * 2 + i, z * 2 - i) * .4; p.setXYZ(k, x * n, y * n * (y < 0 ? 1.6 : .6), z * n); }
    g.computeVertexNormals();
    const a = rng() * 6.28, rr = Math.sqrt(rng()); const x = Math.cos(a) * rr * (TW / 2 - 3), z = Math.sin(a) * rr * (TD / 2 - 3);
    const s = rand(1.6, 3.2) * (1.2 - rr * .5);
    add(g, i % 3 ? rockM : rockD, x, -2.1 - s * .4 - (1 - rr) * 1.2, z, null, false).scale.set(s * 1.2, s, s);
  }
  // hanging roots
  const rootM = M('#5b3a26');
  for (let i = 0; i < 16; i++) {
    const a = rng() * 6.28; const x0 = Math.cos(a) * (TW / 2 - .6) * .97, z0 = Math.sin(a) * (TD / 2 - .6) * .97; if (tileSDF(x0, z0) > -.2) continue;
    const pts = []; const len = rand(1.5, 4); for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(V(x0 + Math.sin(t * 4 + i) * .2, -2 - t * len, z0 + Math.cos(t * 3 + i) * .2)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, rand(.03, .06), 5), rootM, 0, 0, 0, null, false);
  }
})();

/* ================================================================
   Grass (wind + cursor push + click wave)
   ================================================================ */
const grassU = { uTime: { value: 0 }, uWind: { value: .6 }, uGust: { value: 0 }, uBase: { value: new THREE.Color('#3f8a2f') }, uTip: { value: new THREE.Color('#c4ec74') }, uLight: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uPush: { value: V(99, 0, 99) }, uPushK: { value: 0 }, uWave: { value: new THREE.Vector4(0, 0, 0, 0) } };
function blockedForGrass(x, z) {
  if (tileSDF(x, z) > -.25) return true;
  if (x > -8.8 && x < -3.2 && z > -7.2 && z < -1.5) return true;
  if (x > GARDEN.x0 - .3 && x < GARDEN.x1 + .3 && z > GARDEN.z0 - .3 && z < GARDEN.z1 + .3) return true;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + .25) return true;
  if (Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 1.4) return true;
  if (x > -3.5 && x < -.6 && z > -5.9 && z < -1.7) return true;
  for (const p of PATH_FRONT) if (Math.hypot(x - p.x, z - p.z) < .38) return true;
  for (const p of PATH_GATE) if (Math.hypot(x - p.x, z - p.z) < .38) return true;
  return false;
}
const GRASS = [];
function clearGrassIn(x0, x1, z0, z1) {
  const m4 = new THREE.Matrix4(), p = V(), q = new THREE.Quaternion(), sc = V();
  for (const mesh of GRASS) { for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m4); m4.decompose(p, q, sc); if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) { m4.compose(p, q, sc.set(0, 0, 0)); mesh.setMatrixAt(i, m4); } } mesh.instanceMatrix.needsUpdate = true; }
}
// stepping stones (needed before grass)
for (let i = 0; i < 12; i++) PATH_FRONT.push({ x: DOOR_X + Math.sin(i * 1.3) * .22, z: -1.25 + i * .82 });
for (let i = 0; i < 6; i++) PATH_GATE.push({ x: -3.9 + i * .78, z: -.95 + Math.sin(i * 1.7) * .15 });
(() => {
  const g = new THREE.CylinderGeometry(.34, .38, .1, 9); const m = new THREE.InstancedMesh(g, M('#d9cfc0', { roughness: 1, flatShading: true }), PATH_FRONT.length + PATH_GATE.length); const d = new THREE.Object3D(); let i = 0;
  for (const p of [...PATH_FRONT, ...PATH_GATE]) { if (tileSDF(p.x, p.z) > -.4) { d.scale.setScalar(0); } else { d.position.set(p.x, .02, p.z); d.rotation.y = rand(0, 3); d.scale.set(rand(.8, 1.1), 1, rand(.75, 1)); } d.updateMatrix(); m.setMatrixAt(i++, d.matrix); }
  m.receiveShadow = true; scene.add(m);
})();
(() => {
  const W = .05; const pos = [-W, 0, 0, W, 0, 0, -W * .72, .35, 0, W * .72, .35, 0, -W * .4, .7, 0, W * .4, .7, 0, 0, 1, 0], uv = [0, 0, 1, 0, 0, .35, 1, .35, 0, .7, 1, .7, .5, 1];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6]);
  const COUNT = isSmall ? 7000 : 14000; const randA = new Float32Array(COUNT);
  const mat = new THREE.ShaderMaterial({ uniforms: grassU, side: THREE.DoubleSide,
    vertexShader: `uniform float uTime,uWind,uGust,uPushK; uniform vec3 uPush; uniform vec4 uWave; attribute float aRand; varying float vH; varying float vRand;
      void main(){ vH = uv.y; vRand = aRand; vec4 root = instanceMatrix * vec4(0.,0.,0.,1.); vec4 w = instanceMatrix * vec4(position, 1.0); float h2 = vH * vH;
        float sway = sin(uTime*1.6 + root.x*.55 + root.z*.35) * .55 + sin(uTime*2.9 + root.x*1.4 - root.z*.8) * .2 + uGust * (.8 + .4*sin(root.x*.3 + uTime*4.));
        float bend = h2 * uWind * (.16 + .1*aRand); w.x += bend * sway; w.z += bend * sway * .45;
        vec2 dv = root.xz - uPush.xz; float dl = length(dv); w.xz += normalize(dv + 1e-4) * smoothstep(1.4, .0, dl) * h2 * .35 * uPushK; w.y -= smoothstep(1.4, .0, dl) * h2 * .1 * uPushK;
        float wd = length(root.xz - uWave.xy); float ring = exp(-pow((wd - uWave.z) * 2.2, 2.)) * uWave.w; w.xz += normalize(root.xz - uWave.xy + 1e-4) * ring * h2 * .45;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * w; }`,
    fragmentShader: `uniform vec3 uBase,uTip,uLight,uAmb; varying float vH; varying float vRand;
      void main(){ vec3 c = mix(uBase, uTip, vH) * (.8 + .4 * vRand); c = mix(c, c * vec3(1.12, 1.08, .7), step(.92, vRand) * vH);
        gl_FragColor = vec4(c * (uAmb + uLight * (.3 + .7 * vH)) * (.55 + .45 * vH), 1.0); }` });
  const mesh = new THREE.InstancedMesh(g, mat, COUNT); const d = new THREE.Object3D(); let n = 0, guard = 0;
  while (n < COUNT && guard++ < COUNT * 6) {
    const x = rand(-TW / 2, TW / 2), z = rand(-TD / 2, TD / 2); if (blockedForGrass(x, z)) continue;
    const dens = vnoise(x * .4 + 9, z * .4); if (Math.random() > .3 + dens * .9) continue;
    d.position.set(x, -.01, z); d.rotation.set(rand(-.15, .15), rand(0, 6.28), rand(-.15, .15)); d.scale.set(rand(.8, 1.2), rand(.1, .24) * (.7 + dens * .7), 1); d.updateMatrix();
    mesh.setMatrixAt(n, d.matrix); randA[n] = Math.random(); n++;
  }
  mesh.count = n; g.setAttribute('aRand', new THREE.InstancedBufferAttribute(randA, 1)); mesh.frustumCulled = false; scene.add(mesh); GRASS.push(mesh);
})();
// wildflowers
(() => {
  const N = isSmall ? 220 : 420; const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.055, 0), new THREE.MeshStandardMaterial({ roughness: .6, flatShading: true }), N);
  const pal = [0xffffff, 0xfff1a0, 0xffb3d1, 0xc8b6ff, 0xff8f70, 0x9fd8ff]; const d = new THREE.Object3D(); let i = 0, guard = 0;
  while (i < N && guard++ < N * 10) { const x = rand(-TW / 2, TW / 2), z = rand(-TD / 2, TD / 2); if (blockedForGrass(x, z)) continue; const cl = vnoise(x * .5 - 4, z * .5 + 2); if (cl < .55) continue; d.position.set(x, rand(.14, .26), z); d.scale.setScalar(rand(.7, 1.3)); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, TMP.c.set(pal[(x * 3 + z * 7 & 7) % pal.length] ?? pal[0])); i++; }
  m.count = i; scene.add(m); GRASS.push(m);
})();

/* ================================================================
   The cottage
   ================================================================ */
const glowMats = []; // emissive materials driven by theme.glow
function glowMat(color, k = 1) { const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: .4 }); m.userData.k = k; glowMats.push(m); return m; }
const door = new THREE.Group();
const house = new THREE.Group(); house.position.set(HOUSE.x, 0, HOUSE.z); scene.add(house);
(() => {
  const wood = M('#8a5a3b'), cream = M('#f7e8c9'), roof = M('#e0654c'), roofD = M('#c24f3a'), stone = M('#bdb3a6', { roughness: 1 }), white = M('#fffaf0'), green = M('#5e9c6a'), brick = M('#b5523b');
  add(RB(5.3, .3, 4.1, .08), stone, 0, .15, 0, house);
  add(RB(5, 2.5, 3.8, .1), cream, 0, 1.55, 0, house);
  for (const [x, z] of [[-2.5, 1.9], [2.5, 1.9], [-2.5, -1.9], [2.5, -1.9]]) add(RB(.2, 2.55, .2, .05), wood, x, 1.55, z, house);
  add(RB(5.15, .16, 3.95, .05), wood, 0, 2.85, 0, house);
  const a = .62, run = 2.3, L = run / Math.cos(a) + .1;
  for (const sgn of [1, -1]) {
    const slab = add(RB(5.8, .24, L, .07), roof, 0, 2.9 + run / 2 * Math.tan(a), sgn * run / 2, house); slab.rotation.x = sgn * a;
    for (let k = 0; k < 4; k++) add(RB(5.86, .07, .14, .03), roofD, 0, .13, -L / 2 + .45 + k * (L - .7) / 3, slab);
  }
  const ridge = add(new THREE.CylinderGeometry(.15, .15, 5.9, 12), roofD, 0, 2.95 + run * Math.tan(a), 0, house); ridge.rotation.z = Math.PI / 2;
  const tri = new THREE.Shape(); const hh = 1.9 * Math.tan(a); tri.moveTo(-1.9, 0); tri.lineTo(1.9, 0); tri.lineTo(0, hh); tri.lineTo(-1.9, 0);
  const tg = new THREE.ExtrudeGeometry(tri, { depth: .12, bevelEnabled: false });
  for (const sx of [-2.44, 2.32]) { const m = add(tg, cream, sx, 2.93, 0, house); m.rotation.y = Math.PI / 2; }
  const attic = add(new THREE.CylinderGeometry(.28, .28, .08, 20), glowMat('#ffd27a', .8), 2.5, 3.5, 0, house); attic.rotation.z = Math.PI / 2;
  add(new THREE.TorusGeometry(.3, .05, 8, 20), white, 2.54, 3.5, 0, house).rotation.y = Math.PI / 2;
  add(RB(.55, 1.4, .55, .05), brick, 1.5, 4.05, -.95, house); add(RB(.68, .14, .68, .04), M('#8c3a2a'), 1.5, 4.8, -.95, house);
  // door
  add(RB(1.12, 1.98, .12, .04), wood, DOOR_X - HOUSE.x, .3 + .95, 1.9, house);
  door.position.set(DOOR_X - HOUSE.x - .45, .3, 1.97); house.add(door);
  const dm = add(RB(.9, 1.78, .08, .04), M('#b36b3d'), .45, .89, 0, door);
  add(RB(.62, .06, .04, .02), M('#8a4f2c'), 0, .45, .05, dm); add(RB(.62, .06, .04, .02), M('#8a4f2c'), 0, -.35, .05, dm);
  add(new THREE.CylinderGeometry(.14, .14, .04, 16), glowMat('#ffd27a', .4), 0, .62, .05, dm).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(.05, 10, 8), M('#e8c04a', { metalness: .6, roughness: .3 }), .33, -.05, .07, dm);
  // windows
  for (const wx of [-1.65, -.25]) {
    add(RB(1.0, 1.0, .14, .04), white, wx, 1.7, 1.9, house);
    add(RB(.78, .78, .06, .02), glowMat('#ffd890', .55), wx, 1.7, 1.95, house);
    add(RB(.06, .8, .04, .01), white, wx, 1.7, 1.99, house); add(RB(.8, .06, .04, .01), white, wx, 1.7, 1.99, house);
    for (const s of [-1, 1]) add(RB(.3, 1.0, .06, .03), green, wx + s * .66, 1.7, 1.92, house);
    add(RB(1.0, .22, .3, .05), wood, wx, 1.1, 2.03, house);
    for (let k = 0; k < 6; k++) add(SPH_LO, M(pick(['#ff6b6b', '#ffd36b', '#ff9ad1', '#ffffff'])), wx - .38 + k * .15, 1.26, 2.03 + rand(-.05, .05), house).scale.setScalar(rand(.06, .085));
  }
  // porch + step + bench
  add(RB(PORCH.x1 - PORCH.x0, PORCH.top, PORCH.z1 - PORCH.z0, .05), M('#c8915c'), (PORCH.x0 + PORCH.x1) / 2 - HOUSE.x, PORCH.top / 2, (PORCH.z0 + PORCH.z1) / 2 - HOUSE.z, house);
  for (let k = 0; k < 5; k++) add(RB(PORCH.x1 - PORCH.x0 - .1, .02, .03, .01), M('#a8774a'), (PORCH.x0 + PORCH.x1) / 2 - HOUSE.x, PORCH.top + .005, PORCH.z0 - HOUSE.z + .25 + k * .26, house, false);
  add(RB(1.5, .14, .35, .04), M('#b98552'), DOOR_X - HOUSE.x, .07, PORCH.z1 - HOUSE.z + .17, house);
  const bx = -7.35 - HOUSE.x, bz = -2.85 - HOUSE.z, by = PORCH.top;
  add(RB(1.4, .09, .44, .03), wood, bx, by + .44, bz, house); add(RB(1.4, .48, .07, .03), wood, bx, by + .78, bz - .22, house);
  for (const sx of [-.6, .6]) for (const sz of [-.17, .17]) add(RB(.07, .44, .07, .02), wood, bx + sx, by + .22, bz + sz, house);
  add(RB(.5, .1, .4, .04), M('#d9785a'), bx - .3, by + .52, bz + .02, house); // cushion
  // flower pots on porch
  for (const [px, pc] of [[-3.85, '#ff8a6b'], [-8.15, '#ffd36b']]) { add(new THREE.CylinderGeometry(.2, .15, .3, 14), M('#c4673f'), px - HOUSE.x, by + .15, -2.0 - HOUSE.z, house); for (let k = 0; k < 5; k++) add(SPH_LO, M(k % 2 ? '#5aa845' : pc), px - HOUSE.x + rand(-.12, .12), by + .38 + rand(0, .12), -2.0 - HOUSE.z + rand(-.12, .12), house).scale.setScalar(rand(.08, .12)); }
  // lantern next to door
  add(RB(.22, .32, .22, .04), M('#3c3330'), DOOR_X + .8 - HOUSE.x, 1.95, 2.0, house);
  add(RB(.15, .22, .15, .03), glowMat('#ffcf6a', 1.3), DOOR_X + .8 - HOUSE.x, 1.95, 2.0, house);
  // bushes
  const bushM = [M('#4f9a3c'), M('#5fae47'), M('#447f33')];
  for (const [x, z, s] of [[-2.7, 2.0, .45], [2.7, 2.1, .5], [2.75, .9, .4], [-2.75, -1.0, .45], [-2.8, .6, .38], [2.8, -1.2, .4]]) for (let k = 0; k < 3; k++) add(SPH, pick(bushM), x + rand(-.25, .25), s * .8 + rand(0, .15), z + rand(-.25, .25), house).scale.setScalar(s * rand(.75, 1.1));
})();
const lanternLight = new THREE.PointLight(0xffb45a, 0, 9, 1.6); lanternLight.position.set(DOOR_X + .8, 1.9, -2.6); scene.add(lanternLight);
staticBox(HOUSE.x, 1.6, HOUSE.z, 2.55, 1.6, 1.95);
staticBox((PORCH.x0 + PORCH.x1) / 2, PORCH.top / 2, (PORCH.z0 + PORCH.z1) / 2, (PORCH.x1 - PORCH.x0) / 2, PORCH.top / 2, (PORCH.z1 - PORCH.z0) / 2);
// chimney smoke
const Smoke = (() => {
  const N = 26, pos = new Float32Array(N * 3), a = new Float32Array(N), sz = new Float32Array(N), life = new Float32Array(N);
  for (let i = 0; i < N; i++) life[i] = i / N * 6;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aA', new THREE.BufferAttribute(a, 1)); g.setAttribute('aS', new THREE.BufferAttribute(sz, 1));
  const u = { uColor: { value: new THREE.Color('#ffffff') }, uPR: { value: DPR } };
  const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false,
    vertexShader: `uniform float uPR; attribute float aA; attribute float aS; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; vA = aA; gl_PointSize = aS * uPR * 300. / -mv.z; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .15, d); gl_FragColor = vec4(uColor, a * vA); }` }));
  m.frustumCulled = false; scene.add(m);
  const origin = V(HOUSE.x + 1.5, 4.95, HOUSE.z - .95);
  return { u, update(dt, wx) { for (let i = 0; i < N; i++) { life[i] += dt; if (life[i] > 6) life[i] -= 6; const t = life[i] / 6; pos[i * 3] = origin.x + t * 2.2 * wx + Math.sin(t * 6 + i) * .15; pos[i * 3 + 1] = origin.y + t * 3.2; pos[i * 3 + 2] = origin.z + t * .6 + Math.cos(t * 5 + i) * .15; a[i] = Math.sin(t * Math.PI) * .55; sz[i] = .25 + t * .9; } g.attributes.position.needsUpdate = g.attributes.aA.needsUpdate = g.attributes.aS.needsUpdate = true; } };
})();

/* ================================================================
   Crate + full-crate stack
   ================================================================ */
(() => {
  const w = M('#c99459'), wd = M('#a6743f');
  const g = new THREE.Group(); g.position.set(CRATE.x, 0, CRATE.z); scene.add(g);
  add(RB(1.25, .08, .95, .02), wd, 0, .04, 0, g);
  for (const s of [-1, 1]) { add(RB(1.25, .34, .07, .02), w, 0, .19, s * .44, g); add(RB(.07, .34, .95, .02), w, s * .59, .19, 0, g); }
  for (const s of [-1, 1]) add(RB(1.29, .07, .09, .02), wd, 0, .34, s * .46, g);
  staticBox(CRATE.x, .04, CRATE.z, .62, .04, .47);
  for (const s of [-1, 1]) { staticBox(CRATE.x, .55, CRATE.z + s * .44, .62, .55, .035); staticBox(CRATE.x + s * .59, .55, CRATE.z, .035, .55, .47); } // taller than the visual walls so bounces stay in
})();
const STACK_POS = [[-2.15, 0, -4.15], [-1.0, 0, -4.15], [-2.15, 0, -5.15], [-1.0, 0, -5.15], [-1.58, .64, -4.65], [-1.58, 0, -3.3]];
const stackCrates = [];
function makeFullCrate(i) {
  const g = new THREE.Group(); const [x, y, z] = STACK_POS[i]; g.position.set(x, y, z); scene.add(g);
  add(RB(1.0, .6, .8, .04), M('#c99459'), 0, .3, 0, g);
  for (const s of [-1, 1]) add(RB(1.04, .08, .1, .02), M('#a6743f'), 0, .48, s * .36, g);
  for (let k = 0; k < 9; k++) add(SPH, M('#e8402e', { roughness: .35 }), -.32 + (k % 3) * .32 + rand(-.04, .04), .62 + rand(0, .04), -.24 + (k / 3 | 0) * .24 + rand(-.04, .04), g).scale.set(.15, .13, .15);
  g.scale.setScalar(.001); g.userData.pop = 0; stackCrates.push(g);
  staticBox(x, y + .3, z, .5, .3, .4);
  return g;
}

/* ================================================================
   Garden: fence, plots, sunflowers, scarecrow
   ================================================================ */
const sunflowers = [], pondMesh = {};
let fenceGroup = null;
function buildFence() {
  const before = new Set(scene.children); sunflowers.length = 0;
  const soil = add(RB(GARDEN.x1 - GARDEN.x0 - .2, .05, GARDEN.z1 - GARDEN.z0 - .2, .02), M('#c99a68', { roughness: 1 }), (GARDEN.x0 + GARDEN.x1) / 2, .0, (GARDEN.z0 + GARDEN.z1) / 2, null, false); soil.receiveShadow = true;
  const picket = new THREE.CylinderGeometry(.075, .075, .62, 6); picket.translate(0, .31, 0);
  const tipG = new THREE.ConeGeometry(.075, .14, 6); tipG.translate(0, .69, 0);
  const pts = [];
  const pushLine = (x0, z0, x1, z1, skip) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / .3); for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t); if (skip && skip(x, z)) continue; pts.push([x, z]); } };
  const gate = (x, z) => Math.abs(x - GARDEN.x0) < .01 && z > GARDEN.gateZ0 - .05 && z < GARDEN.gateZ1 + .05;
  pushLine(GARDEN.x0, GARDEN.z0, GARDEN.x1, GARDEN.z0); pushLine(GARDEN.x1, GARDEN.z0, GARDEN.x1, GARDEN.z1); pushLine(GARDEN.x1, GARDEN.z1, GARDEN.x0, GARDEN.z1); pushLine(GARDEN.x0, GARDEN.z1, GARDEN.x0, GARDEN.z0, gate);
  const white = M('#fffaf2', { roughness: .7 });
  const im = new THREE.InstancedMesh(picket, white, pts.length), it = new THREE.InstancedMesh(tipG, white, pts.length); const d = new THREE.Object3D();
  pts.forEach(([x, z], i) => { d.position.set(x, 0, z); d.scale.set(1, rand(.92, 1.08), 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); it.setMatrixAt(i, d.matrix); });
  im.castShadow = it.castShadow = true; scene.add(im, it);
  const rail = (x0, z0, x1, z1) => { for (const y of [.2, .48]) { const L = Math.hypot(x1 - x0, z1 - z0); const m = add(RB(L, .07, .05, .02), white, (x0 + x1) / 2, y, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); } };
  rail(GARDEN.x0, GARDEN.z0, GARDEN.x1, GARDEN.z0); rail(GARDEN.x1, GARDEN.z0, GARDEN.x1, GARDEN.z1); rail(GARDEN.x1, GARDEN.z1, GARDEN.x0, GARDEN.z1);
  rail(GARDEN.x0, GARDEN.z1, GARDEN.x0, GARDEN.gateZ1 + .1); rail(GARDEN.x0, GARDEN.gateZ0 - .1, GARDEN.x0, GARDEN.z0);
  for (const z of [GARDEN.gateZ0 - .1, GARDEN.gateZ1 + .1]) { add(RB(.16, 1.0, .16, .04), M('#d9c3a0'), GARDEN.x0, .5, z); add(SPH_LO, glowMat('#ffe08a', 1.6), GARDEN.x0, 1.07, z).scale.setScalar(.09); }
  const gateG = new THREE.Group(); gateG.position.set(GARDEN.x0, 0, GARDEN.gateZ1 + .05); gateG.rotation.y = -1.25; scene.add(gateG);
  for (let k = 0; k < 4; k++) add(RB(.11, .58, .05, .02), white, .0, .3, -.15 - k * .3, gateG); add(RB(.05, .07, 1.25, .02), white, 0, .2, -.6, gateG); add(RB(.05, .07, 1.25, .02), white, 0, .45, -.6, gateG);
  // sunflowers
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(); g.position.set(1.4 + i * 1.25 + rand(-.15, .15), 0, GARDEN.z1 + .55 + rand(-.1, .1)); scene.add(g);
    const h = rand(1.1, 1.6); add(new THREE.CylinderGeometry(.035, .045, h, 6), M('#4f8f35'), 0, h / 2, 0, g);
    for (const s of [-1, 1]) { const lf = add(SPH_LO, M('#5aa845'), s * .14, h * .45, 0, g); lf.scale.set(.18, .04, .1); lf.rotation.z = s * .4; }
    const head = new THREE.Group(); head.position.set(0, h, .05); head.rotation.x = .35; g.add(head);
    const petals = add(new THREE.CylinderGeometry(.32, .32, .04, 16), M('#ffcf33', { roughness: .6 }), 0, 0, 0, head); petals.rotation.x = Math.PI / 2;
    for (let k = 0; k < 12; k++) { const p = add(SPH_LO, M('#ffc21f'), Math.cos(k / 12 * 6.28) * .32, Math.sin(k / 12 * 6.28) * .32, 0, head); p.scale.set(.1, .06, .03); p.rotation.z = k / 12 * 6.28; }
    const c = add(new THREE.CylinderGeometry(.16, .16, .08, 16), M('#6b3f1f', { roughness: 1 }), 0, 0, .02, head); c.rotation.x = Math.PI / 2;
    g.userData = { sway: rand(0, 6) }; sunflowers.push(g);
  }
  const fg = new THREE.Group(); for (const o of scene.children.slice()) if (!before.has(o)) fg.add(o); scene.add(fg); return fg;
}
fenceGroup = buildFence();
const scarecrow = (() => {
  // scarecrow
  const sc = new THREE.Group(); sc.position.set(10.6, 0, -1.6); sc.rotation.y = -.5; scene.add(sc);
  add(new THREE.CylinderGeometry(.05, .05, 1.9, 6), M('#8a5a3b'), 0, .95, 0, sc); const arm = add(new THREE.CylinderGeometry(.04, .04, 1.3, 6), M('#8a5a3b'), 0, 1.45, 0, sc); arm.rotation.z = Math.PI / 2;
  add(RB(.62, .55, .3, .08), M('#5b8fd0'), 0, 1.3, 0, sc); add(RB(.66, .1, .32, .04), M('#d9473b'), 0, 1.08, 0, sc);
  add(SPH, M('#e2c58e', { roughness: 1 }), 0, 1.9, 0, sc).scale.setScalar(.24);
  add(new THREE.CylinderGeometry(.42, .42, .03, 20), M('#e9c46a'), 0, 2.08, 0, sc); add(new THREE.CylinderGeometry(.18, .22, .2, 16), M('#e9c46a'), 0, 2.18, 0, sc);
  for (const s of [-1, 1]) { add(SPH_LO, M('#2d2320'), s * .08, 1.95, .21, sc).scale.setScalar(.03); add(ICO, M('#f2c95a'), s * .7, 1.42, 0, sc).scale.set(.12, .08, .08); }
  add(new THREE.TorusGeometry(.07, .015, 6, 12, Math.PI), M('#2d2320'), 0, 1.84, .21, sc).rotation.z = Math.PI;
  // kafa, şapka, gözler ve ağız (Cadılar Bayramı'nda balkabağı kafayla değişir); kollardaki saman uçları kalır
  const head = sc.children.filter(m => m.position.y > 1.7);
  return { sc, head };
})();

/* ================================================================
   Pond, windmill, trees
   ================================================================ */
const pondU = { uTime: { value: 0 }, uA: { value: new THREE.Color('#5fb9dd') }, uB: { value: new THREE.Color('#bdf0ff') }, uSky: { value: new THREE.Color() } };
(() => {
  const w = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 40), new THREE.ShaderMaterial({ uniforms: pondU,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uA,uB,uSky; varying vec2 vUv; varying vec3 vW;
      void main(){ vec2 p = vW.xz * 2.2; float r = length(vUv - .5) * 2.;
        float s = sin(p.x * 1.7 + uTime * 1.3 + sin(p.y * 1.3 + uTime)) * sin(p.y * 1.9 - uTime * 1.1);
        float hl = smoothstep(.82, .97, s); vec3 c = mix(uA, uSky, .35) * (.85 + .15 * (1. - r)); c = mix(c, uB, hl * .8); c = mix(c, uA * .7, smoothstep(.75, 1., r) * .4);
        gl_FragColor = vec4(c, 1.); }` }));
  w.rotation.x = -Math.PI / 2; w.position.set(POND.x, .03, POND.z); scene.add(w); w.userData.pond = true; pondMesh.m = w;
  const stoneM = [M('#c9c1b5', { flatShading: true }), M('#a9a093', { flatShading: true })];
  for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; add(new THREE.DodecahedronGeometry(1, 0), pick(stoneM), POND.x + Math.cos(a) * (POND.r + .05), .05, POND.z + Math.sin(a) * (POND.r + .05)).scale.set(rand(.2, .3), rand(.12, .2), rand(.18, .26)); }
  for (const [dx, dz, s] of [[.5, .3, .32], [-.6, -.4, .26], [.1, -.7, .22]]) { const p = add(new THREE.CylinderGeometry(1, 1, .02, 16, 1, false, .3, 5.9), M('#58a646'), POND.x + dx, .05, POND.z + dz); p.scale.set(s, 1, s); }
  add(SPH_LO, M('#ff9fc8'), POND.x + .5, .12, POND.z + .3).scale.set(.09, .07, .09);
  for (let i = 0; i < 4; i++) { const x = POND.x - 1.3 + i * .18, z = POND.z - .9 - i * .12; add(new THREE.CylinderGeometry(.015, .02, .9, 5), M('#5c8f3a'), x, .45, z); add(new THREE.CapsuleGeometry(.04, .14, 4, 8), M('#7a4a2a'), x, .92, z); }
})();
const windmillBlades = new THREE.Group();
(() => {
  const g = new THREE.Group(); g.position.set(WINDMILL.x, 0, WINDMILL.z); g.rotation.y = -.35; scene.add(g);
  add(RB(2, .3, 2, .1), M('#bdb3a6', { roughness: 1 }), 0, .15, 0, g);
  add(new THREE.CylinderGeometry(.6, .95, 3.6, 16), M('#f6ecd9'), 0, 2.1, 0, g);
  for (const y of [1.3, 2.5]) add(new THREE.CylinderGeometry(y === 1.3 ? .86 : .74, y === 1.3 ? .86 : .74, .1, 16), M('#c06a46'), 0, y, 0, g);
  add(new THREE.ConeGeometry(.85, 1.0, 16), M('#c24f3a'), 0, 4.4, 0, g);
  add(RB(.5, .8, .1, .05), M('#8a5a3b'), 0, .7, .86, g);
  add(new THREE.CylinderGeometry(.18, .18, .08, 16), glowMat('#ffd27a', .9), 0, 2.9, .67, g).rotation.x = Math.PI / 2;
  windmillBlades.position.set(0, 3.6, .9); g.add(windmillBlades);
  add(new THREE.CylinderGeometry(.16, .16, .3, 12), M('#8a5a3b'), 0, 0, 0, windmillBlades).rotation.x = Math.PI / 2;
  for (let k = 0; k < 4; k++) { const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; windmillBlades.add(arm); add(RB(.09, 2.2, .06, .02), M('#8a5a3b'), 0, 1.1, 0, arm); add(RB(.46, 1.6, .03, .02), M('#fff6e6', { side: THREE.DoubleSide }), .28, 1.3, .02, arm); for (let j = 0; j < 4; j++) add(RB(.5, .03, .04, .01), M('#8a5a3b'), .28, .6 + j * .45, .04, arm); }
  windmillBlades.userData.hit = add(new THREE.SphereGeometry(2.1, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0, windmillBlades, false);
  staticBox(WINDMILL.x, 1.8, WINDMILL.z, .8, 1.8, .8);
})();
const treeGroups = [];
(() => {
  const leafM = [M('#5fae47'), M('#4f9a3c'), M('#72c255')];
  for (const T of TREES) {
    const g = new THREE.Group(); g.position.set(T.x, 0, T.z); g.scale.setScalar(T.s); scene.add(g);
    add(new THREE.CylinderGeometry(.22, .34, 1.9, 10), M('#8a5a3b'), 0, .95, 0, g);
    const crown = new THREE.Group(); crown.position.y = 2.3; g.add(crown);
    for (const [x, y, z, r] of [[0, .4, 0, 1.25], [.85, 0, .2, .9], [-.8, .05, -.1, .95], [.1, -.1, .85, .85], [-.1, .1, -.8, .9], [.3, 1.1, -.1, .8]]) add(SPH, pick(leafM), x, y, z, crown).scale.setScalar(r);
    if (T.apple) for (let k = 0; k < 12; k++) { const a = rand(0, 6.28), b = rand(-.4, .9); const r = 1.2; add(SPH_LO, M('#e8402e', { roughness: .35 }), Math.cos(a) * r * Math.cos(b) * .95, .3 + Math.sin(b) * r, Math.sin(a) * r * Math.cos(b) * .95, crown).scale.setScalar(.12); }
    g.userData = { crown, ph: rand(0, 6) }; treeGroups.push(g);
    const b = new CANNON.Body({ mass: 0, material: groundMat, shape: new CANNON.Cylinder(.3 * T.s, .35 * T.s, 2 * T.s, 8) }); b.position.set(T.x, T.s, T.z); world.addBody(b); g.userData.body = b;
  }
})();
// string lights (porch post → gate post)
(() => {
  const a = V(PORCH.x1 + .05, 2.25, PORCH.z1 - .05), b = V(GARDEN.x0, 1.05, GARDEN.gateZ1 + .1), c = V(-8.5, 2.6, -3.15);
  const post = add(RB(.12, 2.2, .12, .03), M('#8a5a3b'), PORCH.x1 - .05, 1.1 + .1, PORCH.z1 - .05); post.castShadow = true;
  const wire = (p0, p1, sag, n) => { const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push(V().lerpVectors(p0, p1, t).add(V(0, -Math.sin(t * Math.PI) * sag, 0))); }
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a2a24 })); scene.add(ln);
    const cols = ['#ffd66b', '#ff9a6b', '#9fe0ff', '#ffb3d9', '#b6ff8a'];
    for (let i = 1; i < n; i++) { const t = i / n; const p = V().lerpVectors(p0, p1, t).add(V(0, -Math.sin(t * Math.PI) * sag - .06, 0)); add(SPH_LO, glowMat(cols[i % cols.length], 1.5), p.x, p.y, p.z, null, false).scale.set(.07, .09, .07); } };
  wire(a, b, .55, 14); wire(c, a, .35, 12);
})();

/* ================================================================
   Particles: generic bits (dirt, water, confetti, feathers, petals), fireflies, sparkles, rain
   ================================================================ */
class Bits {
  constructor(geo, max, opts = {}) {
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: .7, side: THREE.DoubleSide, ...(opts.mat || {}) }), max);
    this.mesh.frustumCulled = false; this.mesh.castShadow = !!opts.shadow; scene.add(this.mesh);
    this.max = max; this.o = { gravity: 9, drag: .6, flutter: 0, life: 2, ground: true, ...opts };
    this.P = new Float32Array(max * 3); this.Vv = new Float32Array(max * 3); this.R = new Float32Array(max * 3); this.W = new Float32Array(max * 3); this.L = new Float32Array(max); this.L0 = new Float32Array(max); this.Sc = new Float32Array(max); this.rest = new Uint8Array(max);
    this.head = 0; this.d = new THREE.Object3D(); const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, z); this.mesh.setColorAt(i, TMP.c.set(0xffffff)); }
  }
  spawn(p, color, v, scale = 1, life) {
    const i = this.head; this.head = (this.head + 1) % this.max; const k = i * 3;
    this.P[k] = p.x; this.P[k + 1] = p.y; this.P[k + 2] = p.z; this.Vv[k] = v.x; this.Vv[k + 1] = v.y; this.Vv[k + 2] = v.z;
    for (let j = 0; j < 3; j++) { this.R[k + j] = rand(0, 6.28); this.W[k + j] = rand(-8, 8); }
    this.L[i] = this.L0[i] = (life ?? this.o.life) * rand(.8, 1.2); this.Sc[i] = scale * rand(.7, 1.3); this.rest[i] = 0;
    this.mesh.setColorAt(i, TMP.c.set(color)); this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt, t, wx = 0, wz = 0) {
    const { P, Vv, R, W, L, L0, Sc, d, o } = this;
    for (let i = 0; i < this.max; i++) {
      if (L[i] <= 0) continue; L[i] -= dt; const k = i * 3;
      if (!this.rest[i]) {
        Vv[k + 1] -= o.gravity * dt;
        if (o.flutter) { Vv[k] += (wx + Math.sin(t * 3 + i) * o.flutter) * dt; Vv[k + 2] += (wz + Math.cos(t * 2.6 + i) * o.flutter) * dt; }
        const dr = Math.exp(-dt * o.drag); Vv[k] *= dr; Vv[k + 1] *= dr; Vv[k + 2] *= dr;
        P[k] += Vv[k] * dt; P[k + 1] += Vv[k + 1] * dt; P[k + 2] += Vv[k + 2] * dt;
        R[k] += W[k] * dt; R[k + 1] += W[k + 1] * dt; R[k + 2] += W[k + 2] * dt;
        if (o.ground && P[k + 1] < .02 && tileSDF(P[k], P[k + 2]) < 0) { P[k + 1] = .02; if (o.bounce && Math.abs(Vv[k + 1]) > 1) { Vv[k + 1] *= -o.bounce; Vv[k] *= .6; Vv[k + 2] *= .6; } else { this.rest[i] = 1; R[k] = Math.PI / 2 * (o.flat ? 1 : 0); R[k + 2] = 0; } }
      }
      const fade = Math.min(1, L[i] / (L0[i] * .3)); d.position.set(P[k], P[k + 1], P[k + 2]); d.rotation.set(R[k], R[k + 1], R[k + 2]); d.scale.setScalar(Sc[i] * fade); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
      if (L[i] <= 0) { d.scale.setScalar(0); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix); }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const Dirt = new Bits(new THREE.DodecahedronGeometry(.06, 0), 260, { gravity: 9, drag: .3, life: 1.8, bounce: .3, mat: { flatShading: true } });
const Drops = new Bits(new THREE.SphereGeometry(.035, 6, 4), 300, { gravity: 9.8, drag: .2, life: .9, mat: { roughness: .1, metalness: .1 } });
const Confetti = new Bits(new THREE.PlaneGeometry(.12, .08), 500, { gravity: 2.2, drag: 1.6, flutter: 3, life: 6, flat: true });
const Petals = new Bits((() => { const g = new THREE.SphereGeometry(.07, 6, 4); g.scale(1, .25, .7); return g; })(), 300, { gravity: 1.6, drag: 1.8, flutter: 2.2, life: 7, flat: true });
const Feathers = new Bits(new THREE.PlaneGeometry(.1, .05), 80, { gravity: 1.2, drag: 2, flutter: 2.5, life: 2.4, flat: true });
function glowPoints(uniforms, vs) { return new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: vs, fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); a = a*a; gl_FragColor = vec4(vC * 2.2, a * vA); }` }); }
const fireU = { uTime: { value: 0 }, uOpacity: { value: 0 }, uSize: { value: 34 * DPR } };
(() => {
  const N = 110, p = new Float32Array(N * 3), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) { let x, z; do { x = rand(-11, 11); z = rand(-8, 8); } while (tileSDF(x, z) > -.5); p.set([x, rand(.3, 2.6), z], i * 3); ph[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.Points(g, glowPoints(fireU, `uniform float uTime,uOpacity,uSize; attribute float aPh; varying float vA; varying vec3 vC;
    void main(){ vec3 p = position + vec3(sin(uTime*.5 + aPh*40.)*.8, sin(uTime*.8 + aPh*20.)*.35, cos(uTime*.4 + aPh*30.)*.8); vec4 mv = modelViewMatrix * vec4(p,1.); gl_Position = projectionMatrix * mv;
      vA = uOpacity * (.25 + .75 * pow(.5 + .5*sin(uTime*2. + aPh*90.), 3.)); vC = mix(vec3(1.,.85,.35), vec3(.7,1.,.45), fract(aPh*7.)); gl_PointSize = uSize / -mv.z; }`));
  m.frustumCulled = false; scene.add(m);
})();
const Sparks = (() => {
  const N = 500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), al = new Float32Array(N), sz = new Float32Array(N), vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aA', new THREE.BufferAttribute(al, 1)); g.setAttribute('aS', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.Points(g, glowPoints({ uPR: { value: DPR } }, `uniform float uPR; attribute vec3 aCol; attribute float aA; attribute float aS; varying float vA; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; vA = aA; vC = aCol; gl_PointSize = aS * uPR * 60. / -mv.z; }`));
  m.frustumCulled = false; scene.add(m); let head = 0;
  return {
    emit(p, color, n = 20, speed = 2, up = 1.5, size = 1, lifeT = 1.2) { const c = TMP.c.set(color); for (let k = 0; k < n; k++) { const i = head; head = (head + 1) % N; pos.set([p.x, p.y, p.z], i * 3); const a = rand(0, 6.28), b = rand(-1, 1), s = speed * rand(.3, 1); vel.set([Math.cos(a) * Math.sqrt(1 - b * b) * s, b * s * .6 + up * rand(.4, 1), Math.sin(a) * Math.sqrt(1 - b * b) * s], i * 3); col.set([c.r, c.g, c.b], i * 3); life[i] = max[i] = lifeT * rand(.6, 1.2); sz[i] = size * rand(.5, 1.3); } },
    update(dt) { for (let i = 0; i < N; i++) { if (life[i] <= 0) { al[i] = 0; continue; } life[i] -= dt; const k = i * 3; vel[k + 1] -= 1.5 * dt; const dr = Math.exp(-dt * 1.5); vel[k] *= dr; vel[k + 1] *= dr; vel[k + 2] *= dr; pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt; al[i] = Math.min(1, life[i] / max[i] * 2) * (.7 + .3 * Math.sin(life[i] * 30)); }
      g.attributes.position.needsUpdate = g.attributes.aA.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aS.needsUpdate = true; }
  };
})();
const Rain = (() => {
  const N = isSmall ? 1000 : 2000, p = new Float32Array(N * 6), sp = new Float32Array(N);
  const reset = (i, top) => { const x = rand(-14, 14), z = rand(-11, 11), y = top ? rand(12, 18) : rand(-6, 18); p.set([x, y, z, x - .05, y + .5, z - .02], i * 6); sp[i] = rand(16, 22); };
  for (let i = 0; i < N; i++) reset(i, false);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xd8e6ff, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(g, mat); lines.frustumCulled = false; scene.add(lines); let acc = 0;
  return { update(dt) { mat.opacity = rainMix * .38; lines.visible = rainMix > .02; if (!lines.visible) return;
    for (let i = 0; i < N; i++) { const k = i * 6, dy = sp[i] * dt; p[k + 1] -= dy; p[k + 4] -= dy; p[k] -= dy * .05; p[k + 3] -= dy * .05;
      const x = p[k], z = p[k + 2], on = tileSDF(x, z) < 0, floor = on ? groundY(x, z) : -14;
      if (p[k + 1] < floor) { if (on && acc < 5 && Math.random() < .06) { acc++; Drops.spawn(V(x, floor + .03, z), 0xcfe3ff, V(rand(-.4, .4), rand(.8, 1.4), rand(-.4, .4)), .6, .35); if (Math.hypot(x - POND.x, z - POND.z) < POND.r && Math.random() < .5) ring(V(x, .05, z), 0xffffff, .5, .8); } reset(i, true); } }
    acc = 0; g.attributes.position.needsUpdate = true; } };
})();
const rings = []; const ringGeo = new THREE.RingGeometry(.9, 1, 48); ringGeo.rotateX(-Math.PI / 2);
function ring(p, color = 0xffffff, maxR = 2, dur = .8) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false })); m.position.copy(p); m.position.y += .02; m.renderOrder = 5; scene.add(m); rings.push({ m, t: 0, dur, maxR }); }

/* ================================================================
   Chickens and butterflies
   ================================================================ */
const chickens = [];
class Chicken {
  constructor(x, z, brown) {
    const g = this.g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const body = this.body = new THREE.Group(); g.add(body);
    const feather = M(brown ? '#c98845' : '#fffaf0'), red = M('#e8402e'), orange = M('#ffa63d'), black = M('#2a201c');
    add(SPH, feather, 0, .32, 0, body).scale.set(.24, .22, .28);
    const tail = add(SPH_LO, feather, 0, .44, -.24, body); tail.scale.set(.12, .16, .08); tail.rotation.x = -.5;
    for (const s of [-1, 1]) { const w = add(SPH_LO, M(brown ? '#b0723a' : '#f1ebdf'), s * .2, .33, -.02, body); w.scale.set(.06, .13, .2); }
    this.head = new THREE.Group(); this.head.position.set(0, .5, .2); body.add(this.head);
    add(SPH, feather, 0, .05, 0, this.head).scale.setScalar(.13);
    const beak = add(new THREE.ConeGeometry(.04, .1, 6), orange, 0, .03, .14, this.head); beak.rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) add(SPH_LO, red, 0, .17 + (k === 1 ? .02 : 0), -.04 + k * .045, this.head).scale.setScalar(.045);
    add(SPH_LO, red, 0, -.04, .1, this.head).scale.set(.03, .05, .03);
    for (const s of [-1, 1]) add(SPH_LO, black, s * .08, .08, .08, this.head).scale.setScalar(.022);
    this.legs = [-1, 1].map(s => { const l = new THREE.Group(); l.position.set(s * .08, .14, 0); body.add(l); add(new THREE.CylinderGeometry(.015, .015, .16, 5), orange, 0, -.08, 0, l, false); add(RB(.08, .02, .1, .01), orange, 0, -.16, .03, l, false); return l; });
    this.hit = add(new THREE.SphereGeometry(.38, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), 0, .35, 0, g, false); this.hit.userData.chicken = this;
    this.target = V(x, 0, z); this.state = 'peck'; this.timer = rand(1, 3); this.ph = rand(0, 6); this.hop = 0; this.vy = 0; this.yaw = rand(0, 6);
  }
  newTarget() { for (let k = 0; k < 20; k++) { const x = rand(-10.8, -1.4), z = rand(.2, 7.8); if (tileSDF(x, z) < -.8 && Math.hypot(x - POND.x, z - POND.z) > POND.r + .5 && !PATH_FRONT.some(p => Math.hypot(x - p.x, z - p.z) < .2)) { this.target.set(x, 0, z); return; } } }
  poke() { this.vy = 3.2; this.hop = .001; this.state = 'walk'; this.newTarget(); AudioFX.cluck(); for (let k = 0; k < 6; k++) Feathers.spawn(this.g.position.clone().add(V(0, .4, 0)), this.body.children[0].material.color.getHex(), V(rand(-1, 1), rand(1, 2), rand(-1, 1))); }
  update(dt, t) {
    const g = this.g;
    if (this.hop > 0 || this.vy > 0) { this.vy -= 12 * dt; this.hop += this.vy * dt; if (this.hop <= 0) { this.hop = 0; this.vy = 0; } }
    if (this.state === 'walk') {
      const d = TMP.v.copy(this.target).sub(g.position); d.y = 0; const L = d.length();
      if (L < .1) { this.state = Math.random() < .7 ? 'peck' : 'idle'; this.timer = rand(1.5, 4); }
      else { d.normalize(); const sp = (this.hop > 0 ? 2.4 : .8) * dt; g.position.addScaledVector(d, Math.min(sp, L)); this.yaw = Math.atan2(d.x, d.z); this.ph += dt * 14; }
      this.legs[0].rotation.x = Math.sin(this.ph) * .6; this.legs[1].rotation.x = -Math.sin(this.ph) * .6; this.body.rotation.z = Math.sin(this.ph) * .06; this.head.rotation.x = Math.sin(this.ph * 2) * .15;
    } else {
      this.timer -= dt; this.legs[0].rotation.x = this.legs[1].rotation.x = 0; this.body.rotation.z = 0;
      this.head.rotation.x = this.state === 'peck' ? Math.max(0, Math.sin(t * 7 + this.ph)) * 1.1 : Math.sin(t * .8 + this.ph) * .2;
      this.head.rotation.y = this.state === 'idle' ? Math.sin(t * 1.3 + this.ph) * .6 : 0;
      if (this.timer <= 0) { this.state = 'walk'; this.newTarget(); if (Math.random() < .12) AudioFX.cluck(); }
    }
    let dy = this.yaw - g.rotation.y; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283; g.rotation.y += dy * Math.min(1, dt * 6);
    g.position.y = this.hop;
  }
}
chickens.push(new Chicken(-4, 3, false), new Chicken(-6.5, 1.5, true), new Chicken(-2.5, 5.5, false));
const butterflies = [];
(() => {
  const wingG = new THREE.CircleGeometry(.11, 10); wingG.translate(.1, 0, 0); wingG.scale(1, .8, 1);
  const cols = ['#ffd1f0', '#fff1a8', '#b9e2ff', '#ffc89a', '#d6c4ff'];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group(); scene.add(g); const mat = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: .5, emissive: cols[i % cols.length], emissiveIntensity: .15 });
    const wl = new THREE.Mesh(wingG, mat), wr = new THREE.Mesh(wingG, mat); wr.scale.x = -1; wl.rotation.x = wr.rotation.x = -Math.PI / 2; const lw = new THREE.Group(), rw = new THREE.Group(); lw.add(wl); rw.add(wr); g.add(lw, rw);
    add(new THREE.CapsuleGeometry(.015, .1, 3, 6), M('#3a2a24'), 0, 0, 0, g, false).rotation.x = Math.PI / 2;
    const c = pick([[-3.5, 4], [4.5, 3.6], [-8, -.5], [1.5, 6], [6, 5.5], [-6, 7]]);
    g.userData = { lw, rw, cx: c[0], cz: c[1], ph: rand(0, 6), sp: rand(.4, .8), r: rand(1, 2.2), mat }; butterflies.push(g);
  }
})();

/* ================================================================
   Tomato plants
   ================================================================ */
const STEM_CURVE = new THREE.CatmullRomCurve3([V(0, 0, 0), V(.03, .35, .02), V(-.03, .7, 0), V(.02, 1.05, -.01), V(0, 1.25, 0)]);
const STEM_GEO = new THREE.TubeGeometry(STEM_CURVE, 24, .035, 6);
const TOM_GEO = (() => { const g = new THREE.SphereGeometry(1, 22, 16); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x); const lobe = 1 + .05 * Math.cos(a * 5) * (1 - Math.abs(y)); p.setXYZ(i, x * lobe, y * .82, z * lobe); } g.computeVertexNormals(); return g; })();
const CALYX_GEO = (() => { const g = new THREE.ConeGeometry(.5, .25, 5, 1); g.translate(0, .1, 0); g.scale(1, .5, 1); return g; })();
// balkabağı (Cadılar Bayramı): 8 dilimli basık gövde, tepesi sap için çukur; merkez y=0, taban -.72
const PUMPKIN_GEO = (() => { const g = new THREE.SphereGeometry(1, 32, 20); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x); const k = (1 + .09 * Math.pow(Math.abs(Math.cos(a * 4)), .6) - .045) * (1 - .1 * y ** 4); p.setXYZ(i, x * k, y * .72 - (y > .8 ? (y - .8) * .9 : 0), z * k); } g.computeVertexNormals(); return g; })();
const PK_STEM_GEO = (() => { const g = new THREE.CylinderGeometry(.06, .1, .34, 7); g.translate(0, .17, 0); return g; })();
const PK_STEM_M = M('#6b7a33', { roughness: .9 }), PK_M = M('#f07a1a', { roughness: .55 }), PK_ORANGE = new THREE.Color('#f07a1a');
const BAT_WING_GEO = (() => { const sh = new THREE.Shape(); sh.moveTo(0, .03); sh.lineTo(.2, .1); sh.lineTo(.44, .05); sh.quadraticCurveTo(.37, -.02, .39, -.1); sh.quadraticCurveTo(.31, -.04, .26, -.1); sh.quadraticCurveTo(.19, -.03, .14, -.09); sh.quadraticCurveTo(.08, -.02, 0, -.04); sh.closePath(); const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2); return g; })();
const leafMats = [M('#4f9a3c'), M('#5fae47'), M('#3f8a2f')];
const PS = 1.65;
const GREEN_T = new THREE.Color('#7cc04a'), ORANGE_T = new THREE.Color('#ff9a3c'), RED_T = new THREE.Color('#e8342a');
// çeşitler: etiket hangi çeşidin yetişeceğini belirler
const VARIETIES = { red: { c: '#e8342a', s: 1, dn: 0 }, pink: { c: '#f2708f', s: 1.22, dn: -1 }, yellow: { c: '#f5c02a', s: 1, dn: 0 }, black: { c: '#5c2a36', s: 1.05, dn: 0 }, cherry: { c: '#e5302a', s: .62, dn: 3 } };
const VAR_IDS = ['pink', 'yellow', 'black', 'cherry'];
function varietyFor(tag) { if (!tag) return 'red'; let h = 7; for (const ch of tag.toLocaleLowerCase('tr')) h = (h * 131 + ch.charCodeAt(0)) | 0; return VAR_IDS[Math.abs(h) % VAR_IDS.length]; }
class Plant {
  constructor(plot, rec) {
    this.plot = plot; this.rec = rec; const rng = mulberry32(rec.seed || 1); this.var = VARIETIES[rec.variety] || VARIETIES.red; this.ripeC = new THREE.Color(this.var.c);
    const g = this.g = new THREE.Group(); g.position.set(plot.x, .3, plot.z); g.rotation.y = rng() * 6.28; g.scale.setScalar(PS); scene.add(g);
    this.stake = add(new THREE.CylinderGeometry(.025, .03, 1.5, 6), M('#a8743f'), .14, .75, -.06, g);
    this.stem = add(STEM_GEO, M('#5a9a3a'), 0, 0, 0, g);
    this.leaves = []; for (let i = 0; i < 9; i++) { const h = .18 + i * .12, a = i * 2.4 + rng(); const L = new THREE.Group(); L.position.set(Math.cos(a) * .05, h, Math.sin(a) * .05); L.rotation.y = -a; g.add(L);
      for (let k = 0; k < 3; k++) { const m = add(SPH_LO, leafMats[(i + k) % 3], .1 + k * .07, k * .02, (k - 1) * .05, L); m.scale.set(.11 - k * .015, .035, .07); m.rotation.z = -.3; }
      L.userData = { h, base: rng() * .3 }; this.leaves.push(L); }
    this.n = rec.n || 5; this.toms = []; this.flowers = [];
    this.mat = new THREE.MeshStandardMaterial({ color: GREEN_T.clone(), roughness: .3, metalness: .02 });
    for (let i = 0; i < this.n; i++) {
      const a = i / this.n * 6.28 + rng() * .5, h = .5 + rng() * .55, r = .2 + rng() * .1;
      const gold = rec.golden && i === 0;
      const tg = new THREE.Group(); tg.position.set(Math.cos(a) * r, h, Math.sin(a) * r); g.add(tg);
      const m = add(TOM_GEO, gold ? M('#ffc53d', { roughness: .2, metalness: .35, emissive: '#ff9d00', emissiveIntensity: .35 }) : this.mat, 0, -.02, 0, tg); const cal = add(CALYX_GEO, M('#4f9a3c'), 0, .08, 0, tg, false);
      tg.userData = { size: rand(.1, .13) * (gold ? 1.15 : this.var.s), gold, picked: false, mesh: m }; this.toms.push(tg);
      const f = add(SPH_LO, M('#ffe14a', { emissive: '#ffcc00', emissiveIntensity: .2 }), tg.position.x, tg.position.y + .03, tg.position.z, g, false); f.scale.setScalar(.0001); this.flowers.push(f);
    }
    this.mound = add(SPH, M('#5b3a26', { roughness: 1 }), 0, -.02, 0, g); this.mound.scale.set(.32, .08, .32);
    if (rec.pumpkin) { const pk = this.pk = new THREE.Group(); pk.position.set(-.22, .0, .17); g.add(pk); this.pkMat = new THREE.MeshStandardMaterial({ color: GREEN_T.clone(), roughness: .5 }); add(PUMPKIN_GEO, this.pkMat, 0, .72, 0, pk); add(PK_STEM_GEO, PK_STEM_M, .02, 1.22, 0, pk, false).rotation.z = -.3; pk.userData = { picked: false }; pk.scale.setScalar(.0001); }
    this.hit = add(new THREE.CylinderGeometry(.55, .55, 1.5, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, .75, 0, g, false); this.hit.userData.plant = this;
    this.shown = 0; this.planted = rec.state !== 'growing' || rec.planted; this.shake = 0; this.removing = 0; this.bounce = 0;
    if (rec.title) { this.sign = makeSign(plot, rec.title, rec.color); if (rec.state !== 'growing') this.sign.k = 1; }
    if (rec.color) { const knot = add(SPH_LO, M(rec.color, { roughness: .6 }), .14, 1.32, -.06, g, false); knot.scale.set(.05, .035, .05); }
    if (rec.state === 'dead') this.applyDead();
    this.apply(this.target());
  }
  target() { const r = this.rec; if (r.state === 'growing') return this.planted ? r.g || 0 : 0; if (r.state === 'dead') return r.g || .3; return 1; }
  apply(G) {
    this.shown = G; const harvested = this.rec.state === 'harvested'; const vis = this.planted || this.rec.state !== 'growing';
    this.g.visible = vis; this.stake.scale.setScalar(vis ? 1 : .001);
    const stemK = smoothstep(.02, .55, G); this.stem.scale.set(1, Math.max(.001, stemK), 1); this.stem.visible = stemK > .01;
    const stemH = stemK * 1.25;
    this.leaves.forEach(L => { const k = clamp((stemH - L.userData.h + .05) / .18); L.scale.setScalar(Math.max(.001, easeOutBack(k) * (this.rec.state === 'dead' ? .8 : 1))); L.rotation.z = (this.rec.state === 'dead' ? .9 : L.userData.base); });
    const flowerK = smoothstep(.45, .55, G) * (1 - smoothstep(.62, .7, G));
    const tomK = smoothstep(.6, .85, G);
    this.toms.forEach((tg, i) => { const u = tg.userData; const s = u.picked || harvested || this.rec.state === 'dead' ? 0 : Math.max(.0001, easeOutBack(tomK) * u.size); if (!u.flying) tg.scale.setScalar(s || .0001); this.flowers[i].scale.setScalar(Math.max(.0001, flowerK * .05)); });
    const ripe = smoothstep(.82, 1, G);
    if (ripe < .5) this.mat.color.copy(GREEN_T).lerp(ORANGE_T, ripe * 2); else this.mat.color.copy(ORANGE_T).lerp(this.ripeC, (ripe - .5) * 2);
    if (this.pk) { const gone = this.pk.userData.picked || harvested || this.rec.state === 'dead'; this.pk.scale.setScalar(gone ? .0001 : Math.max(.0001, easeOutBack(tomK) * .12)); this.pkMat.color.copy(GREEN_T).lerp(PK_ORANGE, ripe); }
  }
  applyDead() { this.stem.material = M('#8a6a45'); this.leaves.forEach(L => L.children.forEach(m => m.material = M(pick(['#9a7a4a', '#8a6a3a', '#a6884f'])))); this.g.rotation.z = .25; }
  wither() { this.rec.state = 'dead'; this.applyDead(); this.apply(this.shown); for (let k = 0; k < 14; k++) Petals.spawn(this.g.position.clone().add(V(rand(-.3, .3), rand(.3, 1), rand(-.3, .3))), pick(['#9a7a4a', '#8a6a3a', '#b08d55']), V(rand(-.5, .5), rand(0, .5), rand(-.5, .5))); }
  tomatoWorld(i, out = V()) { this.g.updateMatrixWorld(); return this.toms[i].getWorldPosition(out); }
  remove() { this.removing = .001; this.hit.userData.plant = null; removeSign(this.sign); for (let k = 0; k < 10; k++) Petals.spawn(this.g.position.clone().add(V(rand(-.3, .3), rand(.2, .8), rand(-.3, .3))), pick(['#5fae47', '#4f9a3c']), V(rand(-1, 1), rand(.5, 1.5), rand(-1, 1))); }
  update(dt, t, windK) {
    if (this.removing) { this.removing += dt * 2.5; this.g.scale.setScalar(Math.max(.001, PS * (1 - this.removing))); if (this.removing >= 1) { scene.remove(this.g); return false; } }
    const tgt = this.target(); if (Math.abs(tgt - this.shown) > .0005) this.apply(lerp(this.shown, tgt, 1 - Math.exp(-dt * 1.6)));
    this.shake *= Math.exp(-dt * 4); this.bounce *= Math.exp(-dt * 5);
    const sw = (Math.sin(t * 1.5 + this.plot.x) * .03 + Math.sin(t * 2.7 + this.plot.z) * .015) * windK;
    this.g.rotation.x = sw + Math.sin(t * 30) * this.shake * .08; if (this.rec.state !== 'dead') this.g.rotation.z = sw * .7 + Math.cos(t * 26) * this.shake * .08;
    if (!this.removing) this.g.scale.set(PS, PS * (1 + Math.sin(t * 16) * this.bounce * .12), PS);
    return true;
  }
}
const PLOTS = [], growers = [];
function addPlotRow(r, grow) {
  const soilM = M('#6e4630', { roughness: 1 }), ridgeM = M('#5c3a27', { roughness: 1 }), R = ROWS[r];
  for (let c = 0; c < 4; c++) {
    const x = PLOT_XS[c], g = new THREE.Group(); g.position.set(x, 0, R.z); scene.add(g);
    add(RB(1.55, .3, 1.6, .14), soilM, 0, .15, 0, g);
    for (const dz of [-.45, 0, .45]) add(RB(1.35, .08, .2, .04), ridgeM, 0, .31, dz, g, false);
    if (grow) { g.scale.set(1, .001, 1); growers.push({ g, t: -c * .18 }); }
    PLOTS.push({ i: PLOTS.length, x, z: R.z, stand: V(x, 0, R.stand), yaw: R.yaw, aisle: R.aisle, row: r, plant: null });
  }
}
for (let r = 0; r < data.garden.rows; r++) addPlotRow(r, false);
function expandGarden(anim) {
  if (data.garden.rows >= 3) return; data.garden.rows = 3; save(true);
  GARDEN.z1 = GARDEN_Z1_BIG; if (fenceGroup) scene.remove(fenceGroup); fenceGroup = buildFence();
  clearGrassIn(GARDEN.x0 - .3, GARDEN.x1 + .3, 2.3, GARDEN.z1 + .35);
  addPlotRow(2, anim);
  const tg = treeGroups[1]; if (tg) { if (anim) for (let k = 0; k < 30; k++) Petals.spawn(tg.position.clone().add(V(rand(-1, 1), rand(1.5, 3), rand(-1, 1))), pick(['#5fae47', '#72c255']), V(rand(-1, 1), rand(0, 1), rand(-1, 1))); tg.position.set(TREE_BIG_POS.x, 0, TREE_BIG_POS.z); tg.userData.body?.position.set(TREE_BIG_POS.x, tg.scale.x, TREE_BIG_POS.z); }
  if (!anim) return;
  AudioFX.fanfare(); toast(tr('gExpand'), tr('gExpandSub'), 'gtomato'); setTimeout(() => F.say(fillT(pick(LN().expand)), 5), 600);
  for (let k = 0; k < 40; k++) Sparks.emit(V(rand(1.5, 8.5), .5, rand(4.2, 5.8)), 0xb6ff8a, 3, 1.2, 1.4, .8, 1);
}
function plotRec(i) { return today().plots[i]; }

/* ================================================================
   Hasan Dede
   ================================================================ */
const WP = { BENCH: V(-7.35, PORCH.top, -2.55), DOOR_IN: V(DOOR_X, PORCH.top, -3.7), DOOR_OUT: V(DOOR_X, PORCH.top, -2.35), PORCH_EXIT: V(DOOR_X, 0, -1.15), GATE_OUT: V(-.2, 0, -.9), GATE_IN: V(1.3, 0, AISLE_Z), CRATE: V(CRATE.x, 0, -1.4), PORCH_FRONT: V(DOOR_X, PORCH.top, -2.05) };
// Hasan Dede'nin replikleri i18n bölümünde (LINES_ALL)
class Farmer {
  constructor() {
    const root = this.root = new THREE.Group(); root.scale.setScalar(1.22); scene.add(root);
    const body = this.body = new THREE.Group(); root.add(body);
    const skin = M('#f2c4a0'), denim = M('#4374bd'), shirt = M('#d9473b'), boot = M('#6b4126'), white = M('#f8f5ef', { roughness: 1 }), hatM = M('#ecc66d', { roughness: .9 }), band = M('#b13b2e'), blush = M('#f4a094'), black = M('#2a201c');
    this.hips = new THREE.Group(); this.hips.position.y = .5; body.add(this.hips);
    const leg = x => { const g = new THREE.Group(); g.position.set(x, 0, 0); add(new THREE.CapsuleGeometry(.09, .26, 4, 10), denim, 0, -.23, 0, g); add(RB(.18, .11, .27, .045), boot, 0, -.45, .04, g); this.hips.add(g); return g; };
    this.legL = leg(.11); this.legR = leg(-.11);
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    add(new THREE.CapsuleGeometry(.26, .2, 6, 16), shirt, 0, .33, 0, this.torso);
    add(new THREE.CylinderGeometry(.285, .27, .3, 18), denim, 0, .12, 0, this.torso);
    add(RB(.32, .26, .07, .03), denim, 0, .33, .22, this.torso);
    for (const s of [-1, 1]) { const st = add(RB(.06, .3, .05, .02), denim, s * .12, .5, .17, this.torso); st.rotation.x = -.35; add(SPH_LO, M('#ffd34a', { metalness: .5, roughness: .3 }), s * .11, .42, .26, this.torso).scale.setScalar(.03); }
    const arm = x => { const g = new THREE.Group(); g.position.set(x, .55, 0); add(new THREE.CapsuleGeometry(.075, .2, 4, 10), shirt, 0, -.16, 0, g); const hand = new THREE.Group(); hand.position.set(0, -.36, 0); g.add(hand); add(SPH, skin, 0, 0, 0, hand).scale.setScalar(.08); g.userData.hand = hand; this.torso.add(g); return g; };
    this.armL = arm(.33); this.armR = arm(-.33);
    this.head = new THREE.Group(); this.head.position.set(0, .78, 0); this.torso.add(this.head);
    add(SPH, skin, 0, .12, 0, this.head).scale.setScalar(.28);
    add(SPH, M('#eda283'), 0, .1, .27, this.head).scale.setScalar(.08);
    for (const s of [-1, 1]) { add(SPH_LO, blush, s * .16, .05, .21, this.head).scale.set(.06, .04, .03); add(SPH_LO, skin, s * .28, .12, 0, this.head).scale.setScalar(.06); }
    this.eyes = [-1, 1].map(s => { const e = add(SPH_LO, black, s * .095, .19, .245, this.head); e.scale.setScalar(.032); add(SPH_LO, white, s * .085, .2, .27, this.head, false).scale.setScalar(.009); return e; });
    for (const s of [-1, 1]) { const b = add(new THREE.CapsuleGeometry(.03, .09, 3, 8), white, s * .1, .265, .225, this.head); b.rotation.z = Math.PI / 2 + s * .15; }
    for (const [x, y, z, r] of [[0, -.08, .17, .18], [.13, -.03, .14, .13], [-.13, -.03, .14, .13], [0, -.22, .16, .16], [.1, -.17, .13, .13], [-.1, -.17, .13, .13], [0, -.34, .13, .11], [.18, .06, .09, .1], [-.18, .06, .09, .1], [.05, -.42, .1, .07]]) add(SPH, white, x, y + .02, z, this.head).scale.setScalar(r);
    for (const s of [-1, 1]) { const m = add(SPH, white, s * .07, .045, .27, this.head); m.scale.set(.09, .04, .05); m.rotation.z = -s * .35; }
    for (const s of [-1, 1]) add(SPH, white, s * .24, .18, -.06, this.head).scale.setScalar(.09);
    add(SPH, white, 0, .2, -.16, this.head).scale.set(.2, .14, .12);
    this.hat = new THREE.Group(); this.hat.position.y = .33; this.hat.rotation.set(-.12, 0, .06); this.head.add(this.hat);
    add(new THREE.CylinderGeometry(.5, .52, .035, 30), hatM, 0, 0, 0, this.hat); add(new THREE.CylinderGeometry(.22, .27, .2, 22), hatM, 0, .11, 0, this.hat); add(new THREE.CylinderGeometry(.275, .275, .06, 22), band, 0, .04, 0, this.hat);
    // tools
    const T = this.tools = {};
    T.hoe = new THREE.Group(); add(new THREE.CylinderGeometry(.025, .025, 1.25, 6), M('#a8743f'), 0, -.25, 0, T.hoe); const bl = add(RB(.24, .04, .16, .01), M('#8f98a3', { metalness: .6, roughness: .35 }), 0, -.84, .07, T.hoe); bl.rotation.x = .4;
    T.can = new THREE.Group(); add(new THREE.CylinderGeometry(.13, .14, .22, 16), M('#5aa875', { metalness: .3, roughness: .4 }), 0, -.12, .12, T.can); const sp = add(new THREE.CylinderGeometry(.02, .03, .34, 8), M('#5aa875', { metalness: .3 }), 0, -.08, .34, T.can); sp.rotation.x = 1.0; add(new THREE.TorusGeometry(.08, .015, 6, 14, Math.PI), M('#4a8e62'), 0, .0, .12, T.can).rotation.y = Math.PI / 2;
    T.can.userData.spout = new THREE.Object3D(); T.can.userData.spout.position.set(0, .07, .48); T.can.add(T.can.userData.spout);
    T.basket = new THREE.Group(); const bm = M('#c9934f', { roughness: .9 }); add(new THREE.CylinderGeometry(.24, .18, .22, 18, 1, true), M('#c9934f', { roughness: .9, side: THREE.DoubleSide }), 0, 0, 0, T.basket); add(new THREE.CylinderGeometry(.18, .18, .02, 18), bm, 0, -.1, 0, T.basket); add(new THREE.TorusGeometry(.24, .025, 6, 20), M('#a6743f'), 0, .11, 0, T.basket).rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) add(new THREE.TorusGeometry(.215 + k * .01, .008, 4, 20), M('#a6743f'), 0, -.06 + k * .06, 0, T.basket, false).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(.2, .018, 6, 16, Math.PI), M('#a6743f'), 0, .1, 0, T.basket);
    T.basket.userData.toms = []; for (let k = 0; k < 10; k++) { const m = add(TOM_GEO, M('#e8342a', { roughness: .3 }), Math.cos(k * 2.4) * (k < 5 ? .1 : .05), .06 + (k / 5 | 0) * .07, Math.sin(k * 2.4) * (k < 5 ? .1 : .05), T.basket, false); m.scale.setScalar(.085); m.visible = false; T.basket.userData.toms.push(m); }
    this.armR.userData.hand.add(T.hoe, T.can); T.basket.position.set(0, .12, .4); this.torso.add(T.basket);
    for (const k in T) T[k].visible = false;
    this.hit = add(new THREE.CylinderGeometry(.45, .45, 1.8, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, .9, 0, root, false); this.hit.userData.farmer = true;
    // state
    this.pos = WP.DOOR_IN.clone(); this.zone = 'inside'; this.sitting = false; root.visible = false;
    this.yaw = 0; this.targetYaw = 0; this.queue = []; this.cur = null; this.walkPh = 0; this.anim = null; this.basketCount = 0; this.status = '';
    this.P = { legL: 0, legR: 0, armL: 0, armR: 0, armLz: .1, armRz: -.1, crouch: 0, lean: 0, headX: 0, headY: 0, bob: 0, toolTilt: 0 };
    this.blinkT = 2; this.idleT = 0; this.sitRock = 0;
  }
  equip(name) { for (const k in this.tools) this.tools[k].visible = k === name; this.tool = name; }
  setBasket(n) { this.basketCount = n; this.tools.basket.userData.toms.forEach((m, i) => m.visible = i < n); }
  task(t) { this.queue.push(t); return this; }
  // plan the final state of queue to route new tasks from it
  plan() { let p = { pos: this.pos.clone(), zone: this.zone, sitting: this.sitting }; for (const t of [this.cur, ...this.queue]) { if (!t) continue; if (t.end) p = { ...p, ...t.end }; } return p; }
  goTo(target, zone, status, aisle = AISLE_Z) {
    const p = this.plan(); const pts = [];
    if (p.sitting) this.task({ type: 'stand', end: { sitting: false } });
    let z = p.zone, cur = p.pos;
    const push = (pt, zz) => { pts.push({ p: pt.clone(), zone: zz }); cur = pt; z = zz; };
    if (z === 'inside') { this.task({ type: 'door', open: true, end: {} }); this.task({ type: 'walk', pts: [{ p: WP.DOOR_OUT.clone(), zone: 'porch' }], status, end: { pos: WP.DOOR_OUT.clone(), zone: 'porch' }, closeDoorAfter: true }); cur = WP.DOOR_OUT; z = 'porch'; }
    if (z === 'garden' && zone !== 'garden') { const a0 = aisleOf(cur.z); push(V(cur.x, 0, a0), 'garden'); if (a0 !== AISLE_Z) push(V(CORR_X, 0, a0), 'garden'); push(WP.GATE_IN, 'garden'); push(WP.GATE_OUT, 'yard'); }
    if (z === 'porch' && zone !== 'porch' && zone !== 'inside') { if (Math.abs(cur.x - DOOR_X) > .1 || cur.z < -2.2) push(WP.PORCH_FRONT, 'porch'); push(WP.PORCH_EXIT, 'yard'); }
    if (z === 'yard' || (z !== zone && pts.length && pts[pts.length - 1].zone === 'yard')) {
      if (zone === 'garden') { push(WP.GATE_OUT, 'yard'); push(WP.GATE_IN, 'garden'); if (aisle !== AISLE_Z) push(V(CORR_X, 0, aisle), 'garden'); push(V(target.x, 0, aisle), 'garden'); }
      else if (zone === 'porch' || zone === 'inside') { push(WP.PORCH_EXIT, 'yard'); push(WP.PORCH_FRONT, 'porch'); }
    }
    if (z === 'garden' && zone === 'garden') { const a0 = aisleOf(cur.z); push(V(cur.x, 0, a0), 'garden'); if (a0 !== aisle) { push(V(CORR_X, 0, a0), 'garden'); push(V(CORR_X, 0, aisle), 'garden'); } push(V(target.x, 0, aisle), 'garden'); }
    if (zone === 'inside') { if (z !== 'porch') {} push(WP.DOOR_OUT, 'porch'); }
    if (zone !== 'inside') push(target, zone);
    const clean = pts.filter((q, i) => i === 0 ? q.p.distanceTo(p.pos) > .05 : q.p.distanceTo(pts[i - 1].p) > .05);
    if (clean.length) this.task({ type: 'walk', pts: clean, status, end: { pos: target.clone(), zone, sitting: false } });
    if (zone === 'inside') { this.task({ type: 'door', open: true, end: {} }); this.task({ type: 'walk', pts: [{ p: WP.DOOR_IN.clone(), zone: 'inside' }], end: { pos: WP.DOOR_IN.clone(), zone: 'inside' }, closeDoorAfter: true, hideAfter: true }); }
    return this;
  }
  say(text, dur = 4) { showBubble(fillT(text), dur); }
  busy() { return !!this.cur || this.queue.length > 0; }
  start(t) {
    this.cur = t; t.t = 0; if (t.status) this.status = t.status;
    if (t.type === 'walk') { this.root.visible = true; t.i = 0; }
    else if (t.type === 'door') { doorAnim.target = t.open ? 1 : 0; AudioFX.door(t.open); t.dur = .55; }
    else if (t.type === 'sit') { this.sitting = true; t.dur = .5; AudioFX.creak(); }
    else if (t.type === 'stand') { this.sitting = false; t.dur = .4; }
    else if (t.type === 'equip') { this.equip(t.tool); t.dur = .25; if (t.tool) AudioFX.pop(); }
    else if (t.type === 'face') { this.targetYaw = t.yaw; t.dur = .35; }
    else if (t.type === 'call') { t.fn(); t.dur = 0; }
    else if (t.type === 'wait') { t.dur = t.dur || .5; }
    else if (t.type === 'anim') { this.anim = t.name; t.fired = false; t.onStart?.(); }
  }
  finish() { const t = this.cur; if (t.type === 'anim') { this.anim = null; t.onEnd?.(); } if (t.end) Object.assign(this, { pos: t.end.pos ? t.end.pos.clone() : this.pos, zone: t.end.zone ?? this.zone }); if (t.closeDoorAfter) setTimeout(() => { doorAnim.target = 0; AudioFX.door(false); }, 450); if (t.hideAfter) setTimeout(() => { if (this.zone === 'inside') this.root.visible = false; }, 500); this.cur = null; if (!this.queue.length) this.status = ''; }
  update(dt, t) {
    const mul = CFG.fast ? 1.5 : 1;
    if (!this.cur && this.queue.length) this.start(this.queue.shift());
    const P = { legL: 0, legR: 0, armL: 0, armR: 0, armLz: .1, armRz: -.1, crouch: 0, lean: 0, headX: 0, headY: 0, bob: 0, toolTilt: 0 };
    let walking = false;
    const c = this.cur;
    if (c) {
      c.t += dt * mul;
      if (c.type === 'walk') {
        const q = c.pts[c.i]; const d = TMP.v.copy(q.p).sub(this.pos); d.y = 0; const L = d.length(); const sp = 2.0 * mul * dt;
        if (L <= sp) { this.pos.x = q.p.x; this.pos.z = q.p.z; this.zone = q.zone; c.i++; if (c.i >= c.pts.length) this.finish(); }
        else { d.normalize(); this.pos.addScaledVector(d, sp); this.targetYaw = Math.atan2(d.x, d.z); walking = true; }
      } else if (c.type === 'anim') {
        const k = clamp(c.t / c.dur); animPose(c.name, k, P, this, t);
        if (!c.fired && c.hit !== undefined && k >= c.hit) { c.fired = true; c.onHit?.(); }
        if (c.t >= c.dur) this.finish();
      } else if (c.t >= (c.dur || 0)) this.finish();
    }
    if (walking) {
      this.walkPh += dt * 9 * mul; const s = Math.sin(this.walkPh);
      P.legL = s * .65; P.legR = -s * .65; P.armL = -s * .5; P.armR = s * .5; P.bob = Math.abs(Math.cos(this.walkPh)) * .05; P.lean = .06;
      if (Math.abs(Math.cos(this.walkPh)) < .12) AudioFX.step();
    } else if (this.sitting) {
      this.sitRock += dt; P.legL = P.legR = -1.45; P.crouch = .1; P.armL = P.armR = -.45; P.armLz = .25; P.armRz = -.25; P.lean = -.12 + Math.sin(this.sitRock * 1.2) * .04; P.headX = Math.sin(this.sitRock * .4) * .08 - .05;
    } else if (!c || c.type !== 'anim') {
      this.idleT += dt; P.headY = Math.sin(this.idleT * .7) * .35; P.bob = Math.sin(this.idleT * 2) * .008;
    }
    if (this.tool === 'basket') { P.armL = Math.min(P.armL, -1.15) * (walking ? 1 : 1); P.armR = Math.min(P.armR, -1.15); P.armLz = .35; P.armRz = -.35; if (walking) { P.armL = -1.15 + Math.sin(this.walkPh) * .05; P.armR = -1.15 - Math.sin(this.walkPh) * .05; } }
    // blend
    const k = 1 - Math.exp(-dt * 14); for (const key in P) this.P[key] = lerp(this.P[key], P[key], k);
    const Q = this.P;
    this.legL.rotation.x = Q.legL; this.legR.rotation.x = Q.legR; this.armL.rotation.x = Q.armL; this.armR.rotation.x = Q.armR; this.armL.rotation.z = Q.armLz; this.armR.rotation.z = Q.armRz;
    this.torso.rotation.x = Q.lean; this.body.position.y = Q.bob - Q.crouch; this.head.rotation.x = Q.headX; this.head.rotation.y = Q.headY;
    this.tools.can.rotation.x = Q.toolTilt;
    // blink
    this.blinkT -= dt; const bl = this.blinkT < .12 ? .15 : 1; if (this.blinkT < 0) this.blinkT = rand(2, 5); this.eyes.forEach(e => e.scale.set(.032, .032 * bl, .032));
    // place
    let dy = this.targetYaw - this.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283; this.yaw += dy * Math.min(1, dt * 8);
    if (this.sitting) { this.targetYaw = 0; this.root.position.set(WP.BENCH.x, PORCH.top + .02, -2.8); }
    else this.root.position.set(this.pos.x, groundY(this.pos.x, this.pos.z), this.pos.z);
    this.root.rotation.y = this.yaw;
  }
  headWorld(out = V()) { this.head.updateWorldMatrix(true, false); return this.head.getWorldPosition(out); }
}
function animPose(name, k, P, F, t) {
  if (name === 'hoe') { const up = k < .55; const e = up ? easeInOut(k / .55) : clamp((k - .55) / .12); const a = up ? lerp(-.3, -2.7, e) : lerp(-2.7, -.55, e); P.armL = P.armR = a; P.armLz = .05; P.armRz = -.05; P.lean = up ? -.1 * e : .35; P.crouch = up ? 0 : .05; P.legL = .2; P.legR = -.2; }
  else if (name === 'plant') { const e = Math.sin(k * Math.PI); P.crouch = .22 * e; P.legL = -.7 * e; P.legR = -.5 * e; P.lean = .55 * e; P.armR = -1.2 * e; P.armL = -.6 * e; P.headX = .3 * e; }
  else if (name === 'water') { P.armR = -1.15; P.armL = -.2; P.lean = .12; P.toolTilt = lerp(0, .7, smoothstep(0, .15, k)) * (1 - smoothstep(.85, 1, k)); P.headX = .25; }
  else if (name === 'pick') { const e = Math.sin(k * Math.PI); P.armR = -1.3 - e * .6; P.armL = -1.15; P.armLz = .35; P.lean = .18 * e; P.headX = -.1; }
  else if (name === 'dump') { const e = Math.sin(clamp(k * 1.2) * Math.PI); P.armL = P.armR = -1.15 - e * .9; P.armLz = .35; P.armRz = -.35; P.lean = .3 * e; F.tools.basket.rotation.x = e * 1.2; if (k > .98) F.tools.basket.rotation.x = 0; }
  else if (name === 'wave') { P.armR = -2.9; P.armRz = -.35 + Math.sin(k * 30) * .35; P.headY = Math.sin(k * 8) * .15; P.bob = Math.abs(Math.sin(k * 12)) * .03; }
  else if (name === 'sad') { P.headY = Math.sin(k * 16) * .45 * (1 - k); P.headX = .3; P.armL = P.armR = .1; P.lean = .1; }
  else if (name === 'dance') { const s = Math.sin(k * 26); P.bob = Math.abs(s) * .2; P.armL = -2.6 + s * .4; P.armR = -2.6 - s * .4; P.armLz = .5; P.armRz = -.5; P.legL = s * .4; P.legR = -s * .4; P.headY = s * .2; }
  else if (name === 'stretch') { const e = Math.sin(k * Math.PI); P.armL = P.armR = -3 * e; P.armLz = .2; P.armRz = -.2; P.lean = -.15 * e; P.headX = -.3 * e; }
}
const doorAnim = { v: 0, target: 0 };
const F = new Farmer();
let WATER = null;

/* ================================================================
   Tomato flights + physics tomatoes
   ================================================================ */
const flights = [];
function flyTomato(plant, i) {
  const tg = plant.toms[i]; if (!tg || tg.userData.picked) return;
  const from = plant.tomatoWorld(i); tg.userData.picked = true;
  const m = new THREE.Mesh(TOM_GEO, tg.userData.gold ? tg.userData.mesh.material : M(plant.var.c, { roughness: .3 })); m.scale.setScalar(tg.userData.size); m.castShadow = true; m.position.copy(from); scene.add(m);
  tg.scale.setScalar(.0001); plant.shake = .6; AudioFX.pluck();
  Sparks.emit(from, tg.userData.gold ? 0xffd34a : 0xffe2a0, 6, .8, .8, .5, .6);
  flights.push({ m, from, t: 0, dur: .5, gold: tg.userData.gold });
}
const fruits = [];
function spawnFruit(p, v, gold, color = '#e8342a', pumpkin = false) {
  const r = pumpkin ? .19 : .12; const body = new CANNON.Body({ mass: .2, material: fruitMat, shape: new CANNON.Sphere(r), linearDamping: .1, angularDamping: .4, position: new CANNON.Vec3(p.x, p.y, p.z) });
  body.sleepSpeedLimit = .15; body.sleepTimeLimit = .5; body.velocity.set(v.x, v.y, v.z); body.angularVelocity.set(rand(-4, 4), rand(-4, 4), rand(-4, 4));
  body.addEventListener('collide', e => { const iv = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (iv > 1) AudioFX.tock(iv); });
  world.addBody(body);
  const mesh = new THREE.Mesh(pumpkin ? PUMPKIN_GEO : TOM_GEO, pumpkin ? PK_M : gold ? M('#ffc53d', { roughness: .2, metalness: .35, emissive: '#ff9d00', emissiveIntensity: .35 }) : M(color, { roughness: .3 })); mesh.scale.setScalar(r); mesh.castShadow = true; scene.add(mesh);
  const cal = new THREE.Mesh(pumpkin ? PK_STEM_GEO : CALYX_GEO, pumpkin ? PK_STEM_M : M('#4f9a3c')); cal.position.y = pumpkin ? .5 : .85; mesh.add(cal);
  const f = { body, mesh }; mesh.userData.fruit = f; fruits.push(f);
  if (fruits.length > 55) removeFruit(fruits[0]);
}
function removeFruit(f) { world.removeBody(f.body); scene.remove(f.mesh); fruits.splice(fruits.indexOf(f), 1); }

/* ================================================================
   Farm scripts
   ================================================================ */
function freePlot() {
  const recs = today().plots;
  for (let i = 0; i < PLOTS.length; i++) if (!recs[i]) return i;
  let best = -1, bestAt = Infinity;
  for (let i = 0; i < PLOTS.length; i++) { const r = recs[i]; if (r && (r.state === 'harvested' || r.state === 'dead') && (r.at || 0) < bestAt) { best = i; bestAt = r.at || 0; } }
  if (best >= 0) return best;
  // yer kalmadı: önce bahçe genişler, sonra Hasan Dede en eski olgun tarhı kendisi toplar
  if (data.garden.rows < 3) { expandGarden(true); return PLOTS.length - 4; }
  let old = -1, oldAt = Infinity;
  for (let i = 0; i < PLOTS.length; i++) { const r = recs[i]; if (r && r.state === 'ripe' && (r.at || 0) < oldAt) { old = i; oldAt = r.at || 0; } }
  if (old >= 0) { const r = recs[old], d = today(); d.tomatoes += r.n || 0; bankPumpkin(r); r.state = 'harvested'; PLOTS[old].plant?.apply(1); save(true); updateHarvestUI(true); toast(tr('gAutoHarvest'), tr('tCrateTotal', d.tomatoes)); }
  return old;
}
function startPlanting() {
  const i = freePlot(); if (i < 0) return;
  const recs = today().plots; const old = PLOTS[i].plant;
  const golden = S.setDone === CFG.interval - 1;
  const n = clamp(Math.round(CFG.focus / 5), 3, 8);
  const tk = activeTask(), vr = varietyFor(tk?.tag); recs[i] = { state: 'growing', seed: (Math.random() * 1e9) | 0, n: clamp(n + VARIETIES[vr].dn, 3, 10), golden, g: 0, planted: false, at: Date.now(), taskId: tk?.id || null, title: tk?.title || '', color: tk ? tagColor(tk.tag) || '#ef4e3a' : null, variety: vr, ...(hwOn() ? { pumpkin: true } : {}) };
  S.curPlot = i; S.intIn = 0; S.intOut = 0; save(true);
  const plot = PLOTS[i]; const q0 = F.queue.length;
  F.goTo(plot.stand, 'garden', 'fToGarden', plot.aisle);
  F.task({ type: 'call', fn: () => AudioFX.whistle() });
  F.task({ type: 'face', yaw: plot.yaw, status: 'fHoe' });
  F.task({ type: 'equip', tool: 'hoe' });
  for (let k = 0; k < 2; k++) F.task({ type: 'anim', name: 'hoe', dur: 1.0, hit: .64, onHit: () => { digAt(plot); if (k === 0 && old) { old.remove(); } } });
  F.task({ type: 'equip', tool: null });
  F.task({ type: 'call', fn: () => { if (recs[i]?.state !== 'growing') return; if (plot.plant && !plot.plant.removing) plot.plant.remove(); const p = new Plant(plot, recs[i]); p.planted = false; p.apply(0); plot.plant = p; } });
  F.task({ type: 'anim', name: 'plant', dur: 1.5, hit: .55, status: 'fSeed', onHit: () => { const r = recs[i]; if (r?.state !== 'growing') return; r.planted = true; if (plot.plant) { plot.plant.planted = true; plot.plant.apply(.001); } Sparks.emit(V(plot.x, .45, plot.z), 0xb6ff8a, 18, 1.2, 1.2, .8, 1); AudioFX.pop(); save(); } });
  F.task({ type: 'equip', tool: 'can' });
  F.task({ type: 'anim', name: 'water', dur: 2.4, status: 'fWater', onStart: () => { WATER = { plot }; AudioFX.water(2.2); }, onEnd: () => { WATER = null; } });
  F.task({ type: 'equip', tool: null });
  F.task({ type: 'call', fn: () => F.say(recs[i]?.title ? fillT(pick(LN().task), { t: recs[i].title }) : pick(LNP('plant'))) });
  F.goTo(WP.BENCH, 'porch', 'fToPorch');
  F.task({ type: 'face', yaw: 0 }); F.task({ type: 'sit', end: { sitting: true }, status: 'fRest' });
  for (let k = q0; k < F.queue.length; k++) F.queue[k].tag = 'plant' + i;
}
// silinen görevin yatakları: Hasan Dede tabelayı ve fideyi söküp yatağı boşaltır
function taskPlots(id) { const recs = today().plots; return PLOTS.filter(p => recs[p.i]?.taskId === id); }
function clearTaskPlots(id) {
  const recs = today().plots, dig = [];
  for (const p of taskPlots(id)) {
    const r = recs[p.i];
    // büyüyen (süren seans) ya da sepetteki fide sökülmez; yalnız tabelası kalkar
    if (r.state === 'growing' || r.state === 'picked') { r.taskId = null; r.title = ''; r.color = null; if (p.plant) { removeSign(p.plant.sign); p.plant.sign = null; } }
    else dig.push(p);
  }
  save(true); if (!dig.length) return;
  F.task({ type: 'call', fn: () => F.say(pick(LN().clear)) });
  F.task({ type: 'equip', tool: 'hoe' });
  for (const plot of dig) {
    F.goTo(plot.stand, 'garden', 'fClear', plot.aisle); F.task({ type: 'face', yaw: plot.yaw, status: 'fClear' });
    F.task({ type: 'anim', name: 'hoe', dur: 1.0, hit: .64, status: 'fClear', onHit: () => {
      const r = recs[plot.i]; if (!r || r.taskId !== id) return;
      digAt(plot);
      // toplanmamış domates kaybolmaz: günün hasadına eklenir
      if (r.state === 'ripe') { today().tomatoes += r.n || 0; bankPumpkin(r); updateHarvestUI(true); }
      recs[plot.i] = null; if (plot.plant && !plot.plant.removing) plot.plant.remove(); save(true);
    } });
  }
  F.task({ type: 'equip', tool: null });
  F.goTo(WP.BENCH, 'porch', 'fToPorch');
  F.task({ type: 'face', yaw: 0 }); F.task({ type: 'sit', end: { sitting: true }, status: 'fRest' });
}
// tek dokunuşla sil, 5 sn geri alınabilir; Hasan Dede yatakları süre dolunca boşaltır
function deleteTask(x) {
  const idx = data.tasks.indexOf(x), wasActive = S.taskId === x.id, hasPlots = taskPlots(x.id).length > 0;
  data.tasks = data.tasks.filter(y => y.id !== x.id); if (wasActive) S.taskId = null; TP.editId = null; save(true); renderTasks(); renderActive();
  const timer = setTimeout(() => clearTaskPlots(x.id), 5000);
  toast(tr('tDeleted', x.title), hasPlots ? tr('tDeletedPlots') : '', 'tomato', { label: tr('undo'), fn: () => {
    clearTimeout(timer); data.tasks.splice(Math.min(idx, data.tasks.length), 0, x); if (wasActive) S.taskId = x.id; save(true); renderTasks(); renderActive();
  } }, 5000);
}
function digAt(plot) { AudioFX.dig(); for (let k = 0; k < 14; k++) Dirt.spawn(V(plot.x + rand(-.25, .25), .35, plot.z + rand(-.25, .25)), pick(['#6e4630', '#5c3a27', '#8a5a3b']), V(rand(-1.2, 1.2), rand(2, 3.5), rand(-1.2, 1.2)), rand(.7, 1.3)); }
let harvestQueued = false;
function startHarvest() {
  const recs = today().plots; const ripe = PLOTS.filter(p => recs[p.i]?.state === 'ripe' && p.plant);
  if (!ripe.length || harvestQueued) return; harvestQueued = true;
  F.task({ type: 'call', fn: () => F.say(pick(LNP('harvest'))) });
  F.task({ type: 'equip', tool: 'basket', status: 'fBasket' });
  F.task({ type: 'call', fn: () => F.setBasket(0) });
  let total = 0, gold = 0, pkN = 0; const cols = [];
  for (const plot of ripe) {
    F.goTo(plot.stand, 'garden', 'fToHarvest', plot.aisle); F.task({ type: 'face', yaw: plot.yaw });
    const pl = plot.plant;
    pl.toms.forEach((tg, k) => { total++; if (tg.userData.gold) gold++; else cols.push(pl.var.c); F.task({ type: 'anim', name: 'pick', dur: .6, hit: .5, status: 'fPicking', onHit: () => flyTomato(pl, k) }); });
    if (pl.pk && !pl.pk.userData.picked) { pkN++; F.task({ type: 'anim', name: 'pick', dur: .7, hit: .5, status: 'fPicking', onHit: () => flyPumpkin(pl) }); }
    F.task({ type: 'call', fn: () => { recs[plot.i].state = 'picked'; } });
  }
  F.goTo(WP.CRATE, 'yard', 'fToCrate'); F.task({ type: 'face', yaw: Math.PI });
  F.task({ type: 'anim', name: 'dump', dur: 1.4, hit: .45, status: 'fDumping', onHit: () => dumpBasket(ripe, total, gold, cols, pkN) });
  F.task({ type: 'equip', tool: null });
  F.task({ type: 'call', fn: () => { harvestQueued = false; } });
}
function dumpBasket(ripe, total, gold, cols = [], pkN = 0) {
  const n = F.basketCount; const bp = F.tools.basket.getWorldPosition(V());
  for (let k = 0; k < Math.max(n, total); k++) setTimeout(() => spawnFruit(V(CRATE.x + ((k % 5) - 2) * .2 + rand(-.03, .03), Math.max(bp.y + .45, 1.0) + (k / 5 | 0) * .26, CRATE.z + .22), V(rand(-.15, .15), rand(.6, 1), -.5 + rand(-.15, .15)), k < gold, cols[k - gold] || '#e8342a'), k * 110);
  F.setBasket(0);
  const totalBefore = totalTomatoes(); const d = today(); const before = d.tomatoes; d.tomatoes += total; d.golden = (d.golden || 0) + gold;
  if (pkN) { basketPumpkin(false); d.pumpkins = (d.pumpkins || 0) + pkN; for (let k = 0; k < pkN; k++) setTimeout(() => spawnFruit(V(CRATE.x + rand(-.3, .3), Math.max(bp.y + .6, 1.2), CRATE.z + .15), V(rand(-.1, .1), .4, -.35), false, '#f07a1a', true), 250 + k * 170);
    setTimeout(() => toast(tr('hwPk', pkN), tr('hwPkSub', d.pumpkins), 'pumpkin'), 1900); }
  setTimeout(() => checkUnlocks(totalBefore, totalTomatoes()), 2200);
  for (const p of ripe) { const r = d.plots[p.i]; if (r) { r.state = 'harvested'; } p.plant?.apply(1); }
  const s = d.sessions.filter(x => x.status === 'ripe'); s.forEach(x => x.status = 'harvested');
  save(true); updateHarvestUI(true);
  toast(tr('tCrate', total), gold ? tr('tCrateGold', gold) : tr('tCrateTotal', d.tomatoes), gold ? 'gtomato' : 'tomato');
  const crates = Math.floor(d.tomatoes / 25); for (let i = Math.floor(before / 25); i < Math.min(crates, STACK_POS.length); i++) setTimeout(() => { const c = makeFullCrate(i); c.userData.pop = .001; AudioFX.marimba(1046.5, 0, .2); Sparks.emit(c.position.clone().add(V(0, .7, 0)), 0xffd34a, 30, 2, 1.5, 1, 1.2); toast(tr('tCrateFull'), tr('tCrateFullSub', (i + 1) * 25), 'tomato'); }, 1200);
  if (before < CFG.goal && d.tomatoes >= CFG.goal) setTimeout(goalReached, 1600);
}
function goalReached() {
  AudioFX.fanfare(); F.say(pick(LN().goal), 5); toast(tr('tGoal'), tr('tGoalSub', today().tomatoes), 'gtomato'); setTimeout(() => toast(tr('cardReady'), tr('cardReadySub'), 'tomato'), 3500);
  const cols = ['#ef4e3a', '#ffc53d', '#5aa845', '#5aaeea', '#ff9ad1', '#ffffff'];
  for (let k = 0; k < 260; k++) Confetti.spawn(V(rand(-10, 10), rand(8, 12), rand(-7, 7)), pick(cols), V(rand(-1, 1), rand(-1, 0), rand(-1, 1)), rand(.8, 1.3));
  if (!F.sitting || true) { F.queue.unshift({ type: 'anim', name: 'dance', dur: 2.6 }); }
}
function sitOnBench() { F.goTo(WP.BENCH, 'porch', 'fToPorch'); F.task({ type: 'face', yaw: 0 }); F.task({ type: 'sit', end: { sitting: true }, status: 'fRest' }); }

/* ================================================================
   Timer engine
   ================================================================ */
const LABEL = new Proxy({}, { get: (o, k) => tr(k) });
function phaseDur(ph) { return CFG[ph] * (CFG.fast ? 1000 : 60000); }
function remaining() { return S.running ? Math.max(0, S.endAt - Date.now()) : Math.min(S.remaining ?? phaseDur(S.phase), phaseDur(S.phase)); }
function progress() { return clamp(1 - remaining() / phaseDur(S.phase)); }
function start(opts = {}) {
  AudioFX.ensure(); if (S.running) return;
  if (S.phase === 'focus' && S.curPlot === null && !activeTask() && openTasks().length && !opts.skipPick && !S.noTaskOk) { openPicker(true); return; }
  if (S.phase === 'focus' && S.curPlot === null) { if (PLOTS.some(p => today().plots[p.i]?.state === 'ripe')) startHarvest(); startPlanting(); }
  S.endAt = Date.now() + remaining(); S.running = true; S.remaining = null;
  AudioFX.chimeStart(); keepAwake(true); save(true); onPhaseVisual(); renderUI();
}
function pause() { if (!S.running) return; S.remaining = remaining(); S.running = false; keepAwake(false); save(true); renderUI(); }
function toggle() { S.running ? pause() : start(); }
function setPhase(ph, auto) {
  S.phase = ph; S.running = false; S.remaining = phaseDur(ph); S.endAt = 0; save(true); onPhaseVisual(); renderUI();
  if (ph !== 'focus') { startHarvest(); if (!F.busy() || !F.plan().sitting) sitOnBench(); if (ph === 'long') setTimeout(() => F.say(pick(LN().evening)), 9000); }
  if (auto) setTimeout(() => { if (S.phase === ph && !S.running) start(); }, 1500);
}
function complete() {
  if (S.phase === 'focus') {
    const i = S.curPlot; const d = today(); const rec = i !== null ? d.plots[i] : null;
    if (rec) { rec.state = 'ripe'; rec.planted = true; rec.g = 1; rec.at = Date.now(); const pl = PLOTS[i].plant; if (pl) { pl.planted = true; pl.bounce = 1; pl.apply(.86); }
      const tk = taskById(rec.taskId); if (tk) { tk.act = (tk.act || 0) + 1; tk.last = Date.now(); }
      d.sessions.push({ at: Date.now(), taskId: rec.taskId || null, task: rec.title || '', tag: tk?.tag || '', intIn: S.intIn || 0, intOut: S.intOut || 0, min: CFG.focus, n: rec.n, golden: rec.golden, fast: CFG.fast, status: 'ripe', variety: rec.variety || 'red' });
      if (tk && !tk.doneAt && tk.act >= tk.est) setTimeout(() => askTaskDone(tk), 2600);
      else setTimeout(() => { const nx = activeTask(); if (nx && S.phase !== 'focus') F.say(fillT(pick(LN().next), { t: nx.title }), 4.5); }, 9000);
      renderTasks(); renderActive();
      playChime(); setTimeout(() => F.say(pick(rec.golden ? LN().gold : LN().ripe)), 600);
      Sparks.emit(V(PLOTS[i].x, 1.1, PLOTS[i].z), rec.golden ? 0xffd34a : 0xff7a5c, 50, 2.4, 1.6, 1.1, 1.4); ring(V(PLOTS[i].x, .32, PLOTS[i].z), 0xffffff, 1.6, .9);
      toast(tr(rec.golden ? 'tRipeGold' : 'tRipe'), tr('tRipeSub', rec.n, rec.title), rec.golden ? 'gtomato' : 'tomato');
      notify(tr('tRipe'), tr('nRipeBody')); afterFocusCare(); }
    S.curPlot = null; S.setDone++;
    const isLong = S.setDone >= CFG.interval; if (isLong) { S.sets++; d.sets = (d.sets || 0) + 1; }
    setPhase(isLong ? 'long' : 'short', CFG.autoBreak);
  } else {
    if (S.phase === 'long') S.setDone = 0;
    AudioFX.chimeBreakDone(); toast(tr('tBreakDone'), tr('tBreakDoneSub'), 'tomato'); notify(tr('tBreakDone'), tr('nBreakDoneBody'));
    setPhase('focus', CFG.autoFocus);
  }
}
function abandon() {
  const i = S.curPlot; if (i === null) return; const rec = today().plots[i];
  if (rec) { rec.state = 'dead'; rec.g = Math.max(.12, PLOTS[i].plant?.shown || .12); rec.at = Date.now(); today().sessions.push({ at: Date.now(), taskId: rec.taskId || null, task: rec.title || '', tag: taskById(rec.taskId)?.tag || '', intIn: S.intIn || 0, intOut: S.intOut || 0, min: Math.round(progress() * CFG.focus), n: 0, status: 'dead', fast: CFG.fast }); }
  const pl = PLOTS[i].plant; if (pl) { pl.planted = true; pl.wither(); }
  F.queue = F.queue.filter(t => t.tag !== 'plant' + i); AudioFX.sad();
  F.task({ type: 'anim', name: 'sad', dur: 1.6 }); sitOnBench(); F.say(pick(LN().dead));
  S.curPlot = null; save(true);
}
const meaningful = () => S.phase === 'focus' && S.curPlot !== null && progress() > .03;
async function doReset() {
  if (meaningful()) { if (!await confirmBox(tr('cfResetT'), tr('cfResetX'), tr('cfResetY'))) return; abandon(); }
  else if (S.phase === 'focus' && S.curPlot !== null) { /* barely started: keep the seedling */ }
  S.running = false; S.remaining = phaseDur(S.phase); keepAwake(false); save(true); renderUI();
}
async function doSkip() {
  if (S.phase === 'focus') { if (meaningful()) { if (!await confirmBox(tr('cfSkipT'), tr('cfSkipX'), tr('cfSkipY'))) return; abandon(); } else if (S.curPlot !== null) abandon(); setPhase('short', CFG.autoBreak); }
  else complete();
}
async function switchPhase(ph) {
  if (ph === S.phase) return;
  if (meaningful()) { if (!await confirmBox(tr('cfSwitchT', tr(ph)), tr('cfSwitchX'), tr('cfSwitchY'))) return; abandon(); }
  else if (S.phase === 'focus' && S.curPlot !== null) abandon();
  setPhase(ph, false);
}

/* ================================================================
   Camera
   ================================================================ */
let camAnim = null, lastUser = -99, appTime = 0; const sph = new THREE.Spherical();
const CAM = { r: isSmall ? 80 : 31, phi: isSmall ? .9 : .96, theta: isSmall ? .12 : .38 };
function camTo(target, dist, dur, opts = {}) {
  sph.setFromVector3(camera.position.clone().sub(controls.target)); let th = opts.theta ?? sph.theta; while (th - sph.theta > Math.PI) th -= 6.283; while (th - sph.theta < -Math.PI) th += 6.283;
  camAnim = { t: 0, dur: reduceMotion ? .01 : dur, fT: controls.target.clone(), tT: target.clone(), f: { r: sph.radius, p: sph.phi, th: sph.theta }, to: { r: dist, p: opts.phi ?? sph.phi, th } };
}
controls.addEventListener('start', () => { camAnim = null; lastUser = appTime; });
function onPhaseVisual() { const th = THEMES[themeKey()]; document.documentElement.style.setProperty('--accent', th.accent); document.documentElement.style.setProperty('--accent-deep', th.deep); }
function applyViewOffset() { const w = innerWidth, h = innerHeight; if (document.body.classList.contains('zen')) camera.clearViewOffset(); else if (w >= 1000) camera.setViewOffset(w, h, -Math.min(230, w * .15) + (typeof TP !== 'undefined' && TP.open ? Math.min(190, w * .12) : 0), h * .02, w, h); else camera.setViewOffset(w, h, 0, h * (h > 560 ? .17 : .08), w, h); }

/* ================================================================
   UI
   ================================================================ */
const el = { clock: $('#clock'), status: $('#status'), statusText: $('#statusText'), bar: $('#barFill'), dots: $('#dots'), cycle: $('#cycleText'), mainLabel: $('#mainLabel'), mainIcon: $('#mainIcon'), zen: $('#zenClock') };
let lastClock = '';
function fmt(ms) { const s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function renderClock() {
  const str = fmt(remaining()); if (str !== lastClock) { lastClock = str; pipUpdate(str); el.clock.innerHTML = [...str].map(ch => `<span${ch === ':' ? ' class="c"' : ''}>${ch}</span>`).join(''); el.zen.textContent = str; document.title = S.running ? `${str} · ${tr(S.phase)}` : PAGE_TITLE; }
  el.bar.style.width = (progress() * 100).toFixed(2) + '%';
}
let lastStatus = '';
function renderStatus() {
  let st = F.status ? tr(F.status) : '';
  if (!st) {
    if (S.phase === 'focus') { const r = S.curPlot !== null ? today().plots[S.curPlot] : null; st = tr(!S.running && !r ? (S.setDone === CFG.interval - 1 ? 'stGoldNext' : 'stStart') : r && r.golden ? 'stGold' : progress() < .5 ? 'stGrow1' : progress() < .7 ? 'stGrow2' : 'stGrow3'); }
    else st = tr(S.phase === 'short' ? 'stShort' : 'stLong');
  }
  if (CFG.fast) st += tr('stFast');
  if (st !== lastStatus) { lastStatus = st; el.statusText.textContent = st; el.status.classList.toggle('busy', F.busy()); }
}
function renderUI() {
  document.querySelectorAll('#phases button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.phase === S.phase)));
  const full = remaining() >= phaseDur(S.phase) - 500;
  el.mainLabel.textContent = tr(S.running ? 'btnPause' : full ? (S.phase === 'focus' ? 'btnStart' : 'btnBreak') : 'btnResume');
  el.mainIcon.innerHTML = S.running ? '<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>' : '<path d="M7 4.5v15l13-7.5z"/>';
  el.clock.classList.toggle('paused', !S.running && !full);
  const inFocus = S.phase === 'focus' && S.curPlot !== null; $('#btnInt').hidden = !inFocus; $('#intCount').textContent = inFocus ? ((S.intIn || 0) + (S.intOut || 0) || '') : '';
  const dots = []; for (let i = 0; i < CFG.interval; i++) dots.push(`<i class="${i < S.setDone ? 'done' : ''} ${i === S.setDone && S.phase === 'focus' ? 'now' : ''} ${i === CFG.interval - 1 ? 'gold' : ''}"></i>`);
  el.dots.innerHTML = dots.join('');
  el.cycle.textContent = S.phase === 'long' ? tr('setDone', Math.max(1, S.sets)) : tr('setProg', S.sets + 1, S.setDone, CFG.interval);
  lastStatus = ''; renderStatus(); renderClock(); updateHarvestUI(); pipUpdate(fmt(remaining()));
}
function updateHarvestUI(popIt) {
  const d = today(); $('#hvCount').textContent = tr('tomatoes', d.tomatoes); const left = CFG.goal - d.tomatoes;
  $('#hvSub').textContent = left > 0 ? tr('goalLeft', left) : tr('goalDone', CFG.goal, d.golden);
  $('#hvBar').style.width = Math.min(100, d.tomatoes / CFG.goal * 100) + '%';
  if (popIt) { const h = $('#harvest'); h.classList.remove('bump'); void h.offsetWidth; h.classList.add('bump'); }
}
$('#btnMain').addEventListener('click', () => toggle());
$('#btnReset').addEventListener('click', doReset);
$('#btnSkip').addEventListener('click', doSkip);
document.querySelectorAll('#phases button').forEach(b => b.addEventListener('click', () => switchPhase(b.dataset.phase)));
function toast(title, sub, icon = 'tomato', action = null, ms = 4200) {
  const t = document.createElement('div'); t.className = 'toast card';
  t.innerHTML = `<svg class="sw" aria-hidden="true"><use href="#${icon}"/></svg>`; const box = document.createElement('div'); const b = document.createElement('b'); b.textContent = title; const s = document.createElement('span'); s.textContent = sub; box.append(b, s); t.append(box);
  if (action) { const acts = Array.isArray(action) ? action : [action], box2 = document.createElement('span'); box2.className = 'tacts';
    for (const ac of acts) { const a = document.createElement('button'); a.type = 'button'; a.className = 'tact'; a.textContent = ac.label; a.addEventListener('click', () => { ac.fn(); t.classList.add('out'); setTimeout(() => t.remove(), 500); }, { once: true }); box2.append(a); }
    t.append(box2); }
  $('#toasts').prepend(t); while ($('#toasts').children.length > 3) $('#toasts').lastChild.remove(); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, ms);
}
function notify(title, body) { try { if (CFG.notify && 'Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body }); } catch (e) { } }
let wakeLock = null;
async function keepAwake(on) { try { if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.running) keepAwake(true); });
// bubble
const bubble = $('#bubble'); let bubbleT = 0;
function showBubble(text, dur = 4) { $('#bubbleText').textContent = text; bubble.hidden = false; bubble.classList.remove('in'); void bubble.offsetWidth; bubble.classList.add('in'); bubbleT = dur; }
// sheets
function openSheet(id) { closePop(); const s = $(id); s.hidden = false; s.querySelector('button, input')?.focus({ preventScroll: true }); }
function closeSheets() { document.querySelectorAll('.sheet:not(#onboardSheet)').forEach(s => s.hidden = true); }
document.querySelectorAll('.sheet:not(#onboardSheet)').forEach(s => s.addEventListener('click', e => { if (e.target === s || e.target.closest('[data-close]')) { if (s.id === 'confirmSheet') cfResolve?.(false); s.hidden = true; } }));
let cfResolve = null;
function confirmBox(title, text, yes, no = tr('cancel'), alt = null) { $('#cfTitle').textContent = title; $('#cfText').textContent = text; $('#cfYes').textContent = yes; $('#cfNo').textContent = no; $('#cfAlt').hidden = !alt; if (alt) $('#cfAlt').textContent = alt; openSheet('#confirmSheet'); $('#cfYes').focus(); return new Promise(res => { cfResolve = v => { cfResolve = null; $('#confirmSheet').hidden = true; res(v); }; }); }
$('#cfYes').addEventListener('click', () => cfResolve?.(true)); $('#cfNo').addEventListener('click', () => cfResolve?.(false));
const setMap = [['setFocus', 'focus', 'outFocus', v => tr('uMin', v)], ['setShort', 'short', 'outShort', v => tr('uMin', v)], ['setLong', 'long', 'outLong', v => tr('uMin', v)], ['setInterval', 'interval', 'outInterval', v => tr('uInterval', v)], ['setGoal', 'goal', 'outGoal', v => tr('uGoal', v)], ['setVolume', 'volume', 'outVolume', v => Math.round(v * 100) + '%']];
function syncSettingsUI() { for (const [id, k, out, f] of setMap) { $('#' + id).value = CFG[k]; $('#' + out).textContent = f(CFG[k]); } for (const [id, k] of [['setAutoBreak', 'autoBreak'], ['setAutoFocus', 'autoFocus'], ['setNotify', 'notify'], ['setFast', 'fast']]) $('#' + id).setAttribute('aria-checked', String(!!CFG[k])); $('#volPop').value = CFG.volume; $('#setName').value = data.profile.name || ''; applyI18n(); syncLookUI(); }
for (const [id, k, out, f] of setMap) $('#' + id).addEventListener('input', e => { const v = parseFloat(e.target.value); const was = phaseDur(S.phase); CFG[k] = v; $('#' + out).textContent = f(v); if (k === 'volume') { AudioFX.applyVolume(); $('#volPop').value = v; } if (k === 'interval') S.setDone = Math.min(S.setDone, v - 1); if (!S.running && (S.remaining == null || S.remaining >= was - 500)) S.remaining = phaseDur(S.phase); save(); renderUI(); });
for (const [id, k] of [['setAutoBreak', 'autoBreak'], ['setAutoFocus', 'autoFocus'], ['setFast', 'fast']]) $('#' + id).addEventListener('click', e => { CFG[k] = !CFG[k]; e.currentTarget.setAttribute('aria-checked', String(CFG[k])); if (k === 'fast') { const p = progress(); if (S.running) S.endAt = Date.now() + (1 - p) * phaseDur(S.phase); else S.remaining = (1 - p) * phaseDur(S.phase); } save(); renderUI(); });
$('#setNotify').addEventListener('click', async e => { const btn = e.currentTarget; CFG.notify = !CFG.notify; if (CFG.notify) { try { if (!('Notification' in window)) CFG.notify = false; else if (Notification.permission !== 'granted') { const r = await Notification.requestPermission(); if (r !== 'granted') { CFG.notify = false; toast(tr('tNotifyDenied'), tr('tNotifyDeniedSub')); } } } catch (err) { CFG.notify = false; } } btn.setAttribute('aria-checked', String(CFG.notify)); save(); });
/* ---- yedek: JSON indir/yükle, CSV ---- */
function download(name, mime, text) { const blob = new Blob([text], { type: mime }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function exportJSON() { data.profile.lastBackup = Date.now(); save(true); download(`domat-yedek-${dayKey()}.json`, 'application/json', JSON.stringify({ app: 'domat', version: 2, exportedAt: new Date().toISOString(), data }, null, 1)); toast(tr('bkSaved'), tr('bkSavedSub', Object.keys(data.days).length)); }
function exportCSV() {
  const q = v => { const x = String(v ?? ''); return /[",\n;]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
  const rows = [['date', 'time', 'task', 'tag', 'minutes', 'tomatoes', 'golden', 'status', 'interruptions_internal', 'interruptions_external', 'fast_test']];
  for (const k of Object.keys(data.days).sort()) for (const r of data.days[k].sessions || []) { const tk = taskById(r.taskId); rows.push([k, hm(r.at), r.task || '', r.tag ?? tk?.tag ?? '', r.min ?? '', r.n ?? '', r.golden ? 1 : 0, r.status || '', r.intIn || 0, r.intOut || 0, r.fast ? 1 : 0]); }
  download(`domat-seanslar-${dayKey()}.csv`, 'text/csv;charset=utf-8', '\ufeff' + rows.map(r => r.map(q).join(',')).join('\n')); toast(tr('bkCsvSaved', rows.length - 1), '');
}
function mergeData(inc) {
  for (const [k, dIn] of Object.entries(inc.days || {})) {
    const cur = data.days[k]; if (!cur) { data.days[k] = dIn; continue; }
    const seen = new Set((cur.sessions || []).map(x => x.at)); for (const x of dIn.sessions || []) if (!seen.has(x.at)) cur.sessions.push(x);
    cur.sessions.sort((a, b) => a.at - b.at); cur.tomatoes = Math.max(cur.tomatoes || 0, dIn.tomatoes || 0); cur.golden = Math.max(cur.golden || 0, dIn.golden || 0); cur.sets = Math.max(cur.sets || 0, dIn.sets || 0);
    if (!(cur.plots || []).some(Boolean) && k !== dayKey()) cur.plots = dIn.plots || [];
  }
  const stamp = x => x.doneAt || x.last || x.createdAt || 0;
  for (const tIn of inc.tasks || []) { const i = data.tasks.findIndex(x => x.id === tIn.id); if (i < 0) data.tasks.push(tIn); else if (stamp(tIn) > stamp(data.tasks[i])) data.tasks[i] = tIn; }
}
async function importFile(file) {
  let inc = null; try { const j = JSON.parse(await file.text()); inc = j.data || j; } catch (e) { inc = null; }
  if (!inc || typeof inc !== 'object' || (!inc.days && !inc.tasks)) { toast(tr('bkBad'), tr('bkBadSub')); return; }
  const days = Object.keys(inc.days || {}).length, sess = Object.values(inc.days || {}).reduce((s, d) => s + (d.sessions || []).length, 0), tasks = (inc.tasks || []).length;
  closeSheets(); const r = await confirmBox(tr('bkPrevT'), tr('bkPrevX', days, sess, tasks), tr('bkMerge'), tr('cancel'), tr('bkReplace'));
  if (r === 'alt') { const prof = data.profile; data = Object.assign(data, inc); data.profile = { ...prof, ...(inc.profile || {}), onboarded: true }; data.tasks = inc.tasks || []; data.days = inc.days || {}; save(true); location.reload(); }
  else if (r === true) { mergeData(inc); save(true); location.reload(); }
}
$('#btnExport').addEventListener('click', exportJSON);
$('#btnCsv').addEventListener('click', exportCSV);
$('#btnImport').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); });
$('#cfAlt').addEventListener('click', () => cfResolve?.('alt'));
$('#btnClearToday').addEventListener('click', async () => { closeSheets(); if (!await confirmBox(tr('cfTodayT'), tr('cfTodayX'), tr('cfTodayY'))) return; data.days[dayKey()] = { tomatoes: 0, golden: 0, sessions: [], plots: [], sets: 0 }; S.curPlot = null; S.running = false; S.remaining = phaseDur(S.phase); save(true); location.reload(); });
$('#btnClearAll').addEventListener('click', async () => { closeSheets(); if (!await confirmBox(tr('cfAllT'), tr('cfAllX'), tr('cfAllY'))) return; data.days = {}; data.tasks = []; S.taskId = null; Object.assign(S, { phase: 'focus', running: false, remaining: null, setDone: 0, sets: 0, curPlot: null }); save(true); location.reload(); });
$('#btnSettings').addEventListener('click', () => { syncSettingsUI(); openSheet('#settingsSheet'); });
$('#settingsSheet').addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
$('#setName').addEventListener('input', e => { data.profile.name = e.target.value.trim().slice(0, 24); save(); });
const pop = $('#ambientPop');
function syncAmb() { pop.querySelectorAll('[data-amb]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.amb === CFG.ambient))); $('#btnAmbient').classList.toggle('on', CFG.ambient !== 'off'); }
function closePop() { pop.hidden = true; $('#btnAmbient').setAttribute('aria-expanded', 'false'); }
$('#btnAmbient').addEventListener('click', e => { e.stopPropagation(); AudioFX.ensure(); pop.hidden = !pop.hidden; $('#btnAmbient').setAttribute('aria-expanded', String(!pop.hidden)); syncAmb(); $('#volPop').value = CFG.volume; });
pop.addEventListener('click', e => e.stopPropagation());
pop.querySelectorAll('[data-amb]').forEach(b => b.addEventListener('click', () => { AudioFX.ensure(); AudioFX.setAmbient(b.dataset.amb); if (CFG.muted) { CFG.muted = false; AudioFX.applyVolume(); } syncAmb(); onPhaseVisual(); if (b.dataset.amb === 'evening') F.say(pick(LN().evening)); }));
$('#volPop').addEventListener('input', e => { CFG.volume = parseFloat(e.target.value); CFG.muted = false; AudioFX.applyVolume(); save(); });
document.addEventListener('click', closePop);
$('#btnStats').addEventListener('click', () => { renderStats(); openSheet('#statsSheet'); });
/* ---- istatistik: dönem, etiket, görev, saat, ısı haritası ---- */
let STAT_PER = 'week';
const pct = n => (LANG === 'tr' ? `%${n}` : `${n}%`);
function periodStart(per) { const d = new Date(); d.setHours(0, 0, 0, 0); if (per === 'week') { d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); } if (per === 'month') { d.setDate(1); return d.getTime(); } return 0; }
function sessionsSince(t0) { const out = []; for (const k of Object.keys(data.days)) for (const r of data.days[k].sessions || []) if ((r.at || 0) >= t0) out.push(r); return out; }
const sMin = r => (r.fast ? 0 : (r.min || 0));
function barsHTML(rows, max) { return rows.map(r => `<div class="hbar2"><span class="l">${r.dot ? `<i class="dot" style="background:${r.dot}"></i>` : ''}<span class="lt">${esc(r.label)}</span></span><span class="b"><i style="width:${Math.max(3, r.v / max * 100)}%;--c:${r.dot || 'var(--accent)'}"></i></span><span class="v">${esc(r.text)}</span></div>`).join(''); }
function renderInsights() {
  document.querySelectorAll('#statPeriod [data-per]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.per === STAT_PER)));
  const t0 = periodStart(STAT_PER), ss = sessionsSince(t0), ok = ss.filter(r => r.status !== 'dead'), dead = ss.length - ok.length;
  const focusMin = ok.reduce((s, r) => s + sMin(r), 0), doneT = data.tasks.filter(x => x.doneAt && x.doneAt >= t0);
  const ints = ok.length ? ok.reduce((s, r) => s + (r.intIn || 0) + (r.intOut || 0), 0) / ok.length : 0;
  const est = doneT.reduce((s, x) => s + x.est, 0), act = doneT.reduce((s, x) => s + (x.act || 0), 0);
  let acc, ratio = '–';
  if (doneT.length < 2 || !est) acc = tr('accNone'); else { const r = act / est; ratio = r.toFixed(1).replace('.', LANG === 'tr' ? ',' : '.') + '×'; acc = r > 1.1 ? tr('accUnder', Math.round((r - 1) * 100)) : r < .9 ? tr('accOver', Math.round((1 - r) * 100)) : tr('accOk'); }
  const ins = (v, l) => `<div class="ins"><b>${v}</b><span>${esc(l)}</span></div>`;
  $('#insights').innerHTML = ins(esc(tr('hmDur', focusMin)), tr('insFocus')) + ins(doneT.length, tr('insDone')) + ins(pct(ss.length ? Math.round(dead / ss.length * 100) : 0), tr('insAbandon'))
    + `<div class="ins wide"><b>${ratio}</b><span>${acc}</span></div>` + `<div class="ins wide"><b>${ints.toFixed(1).replace('.', LANG === 'tr' ? ',' : '.')}</b><span>${esc(tr('insInt'))}</span></div>`;
  const byTag = new Map(), byTask = new Map();
  for (const r of ok) { const tag = r.tag ?? taskById(r.taskId)?.tag ?? ''; byTag.set(tag, (byTag.get(tag) || 0) + sMin(r)); if (r.task) { const k = r.taskId || r.task; const e = byTask.get(k) || { label: r.task, v: 0, dot: tagColor(tag) }; e.v += sMin(r); byTask.set(k, e); } }
  const tagRows = [...byTag].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ label: t || tr('noTag'), v, text: tr('hmDur', v), dot: tagColor(t) || '#c9b6a6' }));
  $('#tagBars').innerHTML = tagRows.length ? barsHTML(tagRows, tagRows[0].v) : `<p class="empty">${esc(tr('noData'))}</p>`;
  const taskRows = [...byTask.values()].filter(e => e.v > 0).sort((a, b) => b.v - a.v).slice(0, 5).map(e => ({ ...e, text: tr('hmDur', e.v) }));
  $('#taskBars').innerHTML = taskRows.length ? barsHTML(taskRows, taskRows[0].v) : `<p class="empty">${esc(tr('noData'))}</p>`;
  const hrs = new Array(24).fill(0); for (const r of ok) hrs[new Date((r.at || 0) - sMin(r) * 60000).getHours()]++;
  const H0 = 6, mx = Math.max(...hrs.slice(H0)), best = mx ? hrs.indexOf(mx, H0) : -1;
  $('#hours').innerHTML = hrs.slice(H0).map((n, i) => `<div><i class="${H0 + i === best ? 'peak' : ''}" style="height:${mx ? Math.max(4, n / mx * 100) : 4}%"></i><small>${(H0 + i) % 3 === 0 ? H0 + i : ''}</small></div>`).join('');
  $('#bestHour').textContent = best >= 0 ? tr('bestHour', `${String(best).padStart(2, '0')}:00`, `${String(best + 1).padStart(2, '0')}:00`) : '';
  // son 12 ay ısı haritası (pazartesiden başlayan haftalar)
  const end = new Date(); end.setHours(0, 0, 0, 0); const start = new Date(end); start.setDate(start.getDate() - 364 - (start.getDay() + 6) % 7);
  const cells = []; const lvl = n => !n ? '' : n <= 5 ? 'l1' : n <= 15 ? 'l2' : n <= 30 ? 'l3' : 'l4';
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const n = data.days[dayKey(d)]?.tomatoes || 0; cells.push(`<i class="${lvl(n)}" title="${d.toLocaleDateString(LOC())}: ${tr('tomatoes', n)}"></i>`); }
  $('#heat').innerHTML = cells.join('');
  $('#heatLeg').innerHTML = `${esc(tr('heatLess'))} <i style="background:rgba(74,46,34,.07)"></i><i style="background:#ffd2c4"></i><i style="background:#ff9c80"></i><i style="background:#ef4e3a"></i><i style="background:#a82a1a"></i> ${esc(tr('heatMore'))}`;
  requestAnimationFrame(() => { const w = $('#heatWrap'); w.scrollLeft = w.scrollWidth; });
}
$('#statPeriod').addEventListener('click', e => { const b = e.target.closest('[data-per]'); if (!b) return; STAT_PER = b.dataset.per; renderInsights(); });
/* ---- kesinti sayacı ---- */
function openInt() { if (!(S.phase === 'focus' && S.curPlot !== null)) return; $('#intNote').value = ''; openSheet('#intSheet'); }
$('#btnInt').addEventListener('click', openInt);
$('#intSheet').addEventListener('click', e => {
  const b = e.target.closest('[data-int]'); if (!b) return; const kind = b.dataset.int;
  if (kind === 'in') { S.intIn = (S.intIn || 0) + 1; const note = $('#intNote').value.trim(); if (note) { data.tasks.push(newTask(note, 1)); renderTasks(); setTimeout(() => toast(tr('intTaskAdded', note), ''), 300); } }
  else S.intOut = (S.intOut || 0) + 1;
  save(); $('#intSheet').hidden = true; toast(tr('intSaved', (S.intIn || 0) + (S.intOut || 0)), ''); F.say(fillT(pick(LN()[kind === 'in' ? 'intIn' : 'intOut'])), 3.5); renderUI();
});
$('#intNote').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#intSheet [data-int="in"]').click(); } });
/* ---- gün sonu hasat kartı ---- */
let cardBlob = null;
function streakDays() { let n = 0; const dd = new Date(); if (!today().tomatoes) dd.setDate(dd.getDate() - 1); while ((data.days[dayKey(dd)]?.tomatoes || 0) > 0) { n++; dd.setDate(dd.getDate() - 1); } return n; }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
async function makeCard() {
  try { await Promise.all(['600 80px Fredoka', '700 40px Nunito', '800 30px Nunito'].map(f => document.fonts.load(f))); } catch (e) { }
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const d = today(), done = data.tasks.filter(x => x.doneAt && isToday(x.doneAt)), focusMin = d.sessions.filter(x => x.status !== 'dead').reduce((s, x) => s + sMin(x), 0);
  g.fillStyle = '#fff6e6'; g.fillRect(0, 0, W, H);
  // 3D sahne fotoğrafı
  composer.render(); const shot = new Image(); shot.src = renderer.domElement.toDataURL('image/jpeg', .92); await shot.decode().catch(() => { });
  const px = 48, py = 48, pw = W - 96, ph = 560; g.save(); rrect(g, px, py, pw, ph, 44); g.clip();
  if (shot.width) { const sc = Math.max(pw / shot.width, ph / shot.height); const sw = shot.width * sc, sh = shot.height * sc; g.drawImage(shot, px + (pw - sw) / 2, py + (ph - sh) / 2 - 20, sw, sh); }
  const gr = g.createLinearGradient(0, py + ph - 220, 0, py + ph); gr.addColorStop(0, 'rgba(40,20,10,0)'); gr.addColorStop(1, 'rgba(40,20,10,.55)'); g.fillStyle = gr; g.fillRect(px, py, pw, ph); g.restore();
  g.fillStyle = '#fff'; g.font = '700 30px Nunito, sans-serif'; g.fillText(new Date().toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), px + 40, py + ph - 40);
  // başlık
  g.fillStyle = '#4a2e22'; g.font = '600 70px Fredoka, sans-serif'; g.fillText(tr('cardHead'), 72, 712);
  const nmv = (data.profile.name || '').trim(); if (nmv) { g.fillStyle = '#b8321f'; g.font = '800 30px Nunito, sans-serif'; g.fillText(nmv.toLocaleUpperCase(LOC()), 76, 758); }
  // üç büyük sayı
  const stats = [[String(d.tomatoes), tr('cardTom')], [tr('hmDur', focusMin), tr('cardFocus')], [String(done.length), tr('cardDone')]];
  stats.forEach(([v, l], i) => { const x = 72 + i * 318, y = 792; g.fillStyle = '#fff'; rrect(g, x, y, 296, 160, 34); g.fill(); g.strokeStyle = 'rgba(74,46,34,.08)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#ef4e3a'; let fs = 74; g.font = `600 ${fs}px Fredoka, sans-serif`; while (g.measureText(v).width > 250 && fs > 40) { fs -= 4; g.font = `600 ${fs}px Fredoka, sans-serif`; } g.fillText(v, x + 26, y + 88);
    g.fillStyle = '#7d5c4c'; g.font = '800 26px Nunito, sans-serif'; g.fillText(l, x + 28, y + 132); });
  // biten görevler
  let y = 1030; g.font = '700 34px Nunito, sans-serif';
  if (!done.length) { g.fillStyle = '#7d5c4c'; g.fillText(tr('cardNoTasks'), 76, y); }
  done.slice(0, 4).forEach(x => { g.fillStyle = '#5aa845'; g.beginPath(); g.arc(92, y - 11, 17, 0, 6.283); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(84, y - 11); g.lineTo(90, y - 4); g.lineTo(101, y - 18); g.stroke();
    g.fillStyle = '#4a2e22'; let t = x.title; while (g.measureText(t).width > 800 && t.length > 3) t = t.slice(0, -2); if (t !== x.title) t += '…'; g.fillText(t, 128, y);
    if (x.tag) { g.fillStyle = tagColor(x.tag); g.beginPath(); g.arc(132 + g.measureText(t).width + 22, y - 11, 9, 0, 6.283); g.fill(); } y += 54; });
  if (done.length > 4) { g.fillStyle = '#7d5c4c'; g.font = '700 28px Nunito, sans-serif'; g.fillText(tr('cardMore', done.length - 4), 128, y - 8); }
  // alt şerit
  g.fillStyle = '#ef4e3a'; g.fillRect(0, H - 96, W, 96);
  g.fillStyle = '#fff'; g.font = '600 46px Fredoka, sans-serif'; g.fillText('Domat', 72, H - 34);
  const bw = g.measureText('Domat').width; g.font = '800 28px Nunito, sans-serif'; g.globalAlpha = .9; g.fillText('getdomat.com', 72 + bw + 22, H - 38); g.globalAlpha = 1;
  g.font = '800 26px Nunito, sans-serif'; const extra = [streakDays() ? tr('cardStreak', streakDays()) : '', d.golden ? tr('cardGold', d.golden) : '', d.pumpkins ? tr('cardPk', d.pumpkins) : ''].filter(Boolean).join(' · ');
  const tw = g.measureText(extra).width; g.fillText(extra, W - 72 - tw, H - 38);
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
async function openCard() {
  $('#statsSheet').hidden = true; openSheet('#cardSheet'); $('#cardImg').removeAttribute('src');
  cardBlob = await makeCard(); if (!cardBlob) return;
  $('#cardImg').src = URL.createObjectURL(cardBlob); $('#cardImg').alt = tr('cardTitle');
  const file = new File([cardBlob], `domat-hasat-${dayKey()}.png`, { type: 'image/png' });
  // telefonda paylaşım menüsü (X seçilince görsel gönderiye ekli gelir); bilgisayarda X'te paylaş: kart iner, gönderi penceresi açılır
  const canFiles = !!(navigator.canShare && navigator.canShare({ files: [file] })), mobile = canFiles && matchMedia('(pointer: coarse)').matches;
  $('#cardShare').hidden = !canFiles; $('#cardX').hidden = mobile; $('#cardSubTxt').textContent = tr(mobile ? 'cardSubM' : 'cardSubD');
}
function cardText() { const d = today(), m = d.sessions.filter(x => x.status !== 'dead').reduce((s, x) => s + sMin(x), 0); return tr('cardShareText', d.tomatoes, tr('hmDur', m)); }
function cardDownload() { const a = document.createElement('a'); a.href = URL.createObjectURL(cardBlob); a.download = `domat-hasat-${dayKey()}.png`; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000); }
$('#btnCard').addEventListener('click', openCard);
$('#cardDl').addEventListener('click', () => { if (cardBlob) cardDownload(); });
$('#cardShare').addEventListener('click', async () => { if (!cardBlob) return;
  try { await navigator.share({ files: [new File([cardBlob], `domat-hasat-${dayKey()}.png`, { type: 'image/png' })], text: cardText() }); } catch (e) { } });
$('#cardX').addEventListener('click', () => { if (!cardBlob) return; cardDownload();
  window.open('https://x.com/intent/post?text=' + encodeURIComponent(cardText()), '_blank', 'noopener'); toast(tr('cardXT'), tr('cardXSub')); });
/* ---- mini zamanlayıcı: Document Picture-in-Picture (Chrome) ---- */
let pipWin = null;
const PIP_OK = 'documentPictureInPicture' in window;
$('#btnPip').hidden = !PIP_OK;
const PIP_CSS = `body{margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:10px 16px;box-sizing:border-box;background:#fff6e6;color:#4a2e22;font-family:Nunito,system-ui,sans-serif;user-select:none}
.ph{font:600 12px Fredoka,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--a,#ef4e3a)}
.ck{font:600 54px/1 Fredoka,system-ui,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.01em}
.tk{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#7d5c4c}
.bar{height:6px;border-radius:6px;background:rgba(74,46,34,.1);overflow:hidden}.bar i{display:block;height:100%;background:var(--a,#ef4e3a)}
.row{display:flex;gap:8px;align-items:center;justify-content:space-between}
button{border:0;border-radius:12px;padding:8px 14px;font:600 14px Fredoka,system-ui,sans-serif;cursor:pointer;background:var(--a,#ef4e3a);color:#fff}
button.g{background:#fff;color:#4a2e22;border:2px solid rgba(74,46,34,.1)}`;
async function openPip() {
  if (!PIP_OK) return; if (pipWin) { pipWin.close(); return; }
  try { pipWin = await documentPictureInPicture.requestWindow({ width: 300, height: 176 }); } catch (e) { pipWin = null; return; }
  const d = pipWin.document; d.title = 'Domat';
  const st = d.createElement('style'); st.textContent = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].filter(r => r instanceof CSSFontFaceRule).map(r => r.cssText); } catch (e) { return []; } }).join('\n') + PIP_CSS; d.head.append(st);
  d.body.innerHTML = `<div class="row"><span class="ph" id="pph"></span><span class="tk" id="pint"></span></div><div class="ck" id="pck"></div><div class="bar"><i id="pbar"></i></div><div class="row"><span class="tk" id="ptk"></span><span style="display:flex;gap:6px;flex:none"><button class="g" id="pskip" aria-label="${esc(tr('ttSkip'))}">⏭</button><button id="pmain"></button></span></div>`;
  d.getElementById('pmain').addEventListener('click', () => toggle());
  d.getElementById('pskip').addEventListener('click', () => doSkip());
  pipWin.addEventListener('pagehide', () => { pipWin = null; $('#btnPip').classList.remove('on'); });
  $('#btnPip').classList.add('on'); pipUpdate(fmt(remaining()));
}
function pipUpdate(str) {
  if (!pipWin) return; const d = pipWin.document, x = activeTask();
  d.documentElement.style.setProperty('--a', getComputedStyle(document.documentElement).getPropertyValue('--accent'));
  d.getElementById('pck').textContent = str; d.getElementById('pph').textContent = tr(S.phase);
  d.getElementById('pbar').style.width = (progress() * 100).toFixed(1) + '%';
  d.getElementById('ptk').textContent = S.phase === 'focus' ? (x ? `${x.title} · ${x.act || 0}/${x.est}` : tr('pipNoTask')) : tr(S.phase === 'short' ? 'stShort' : 'stLong');
  const full = remaining() >= phaseDur(S.phase) - 500;
  d.getElementById('pmain').textContent = tr(S.running ? 'btnPause' : full ? (S.phase === 'focus' ? 'btnStart' : 'btnBreak') : 'btnResume');
}
$('#btnPip').addEventListener('click', openPip);
function renderStats() {
  const days = data.days, keys = Object.keys(days).sort(); const d = today();
  const total = keys.reduce((s, k) => s + (days[k].tomatoes || 0), 0), goldAll = keys.reduce((s, k) => s + (days[k].golden || 0), 0);
  const minToday = d.sessions.filter(x => x.status !== 'dead' && !x.fast).reduce((s, x) => s + (x.min || 0), 0);
  let streak = 0; const dd = new Date(); if (!d.tomatoes) dd.setDate(dd.getDate() - 1); while ((days[dayKey(dd)]?.tomatoes || 0) > 0) { streak++; dd.setDate(dd.getDate() - 1); }
  $('#statSub').textContent = tr('stSub', total, goldAll);
  const kpi = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
  $('#kpis').innerHTML = kpi(d.tomatoes, tr('kpiTom')) + kpi(minToday, tr('kpiMin')) + kpi(streak, tr('kpiStreak'));
  const wdf = new Intl.DateTimeFormat(LOC(), { weekday: 'short' }); const week = [];
  for (let i = 6; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); week.push({ n: days[dayKey(x)]?.tomatoes || 0, l: i === 0 ? tr('today') : wdf.format(x).replace('.', '') }); }
  const mx = Math.max(CFG.goal, ...week.map(w => w.n));
  $('#week').innerHTML = week.map(w => `<div><em>${w.n || ''}</em><i class="${w.n ? '' : 'zero'}" style="height:${w.n ? Math.max(6, w.n / mx * 100) : 3}%"></i><small>${w.l}</small></div>`).join('');
  const maxDay = Math.max(0, ...keys.map(k => days[k].tomatoes || 0));
  const BN = tr('badges', CFG.goal), BOK = [total >= 1, maxDay >= 25, maxDay >= CFG.goal, goldAll >= 1, total >= 100, streak >= 3], BIC = ['tomato', 'tomato', 'tomato', 'gtomato', 'tomato', 'gtomato'];
  const B = BN.map(([n, s2], i) => [n, s2, BOK[i], BIC[i]]);
  renderInsights(); renderProgress(); renderVarieties();
  $('#badges').innerHTML = B.map(([n, s, ok, ic]) => `<div class="badge ${ok ? '' : 'locked'}"><svg aria-hidden="true"><use href="#${ic}"/></svg><div style="min-width:0"><b>${n}</b><span>${s}</span></div></div>`).join('');
  const log = $('#log'); log.innerHTML = '';
  if (!d.sessions.length) { log.innerHTML = `<p class="empty">${esc(tr('logEmpty'))}</p>`; return; }
  [...d.sessions].reverse().forEach(r => { const row = document.createElement('div'); const tm = document.createElement('time'); tm.textContent = hm(r.at); const sp = document.createElement('span'); sp.textContent = r.task || tr(r.status === 'dead' ? 'logDead' : 'logSession'); const em = document.createElement('em'); em.textContent = r.status === 'dead' ? tr('logWithered') : tr('logTom', r.n, r.golden); if (r.status === 'dead') em.className = 'dead'; row.append(tm, sp, em); log.append(row); });
}
function zen(on = !document.body.classList.contains('zen')) { document.body.classList.toggle('zen', on); $('#btnZen').classList.toggle('on', on); applyViewOffset(); camera.updateProjectionMatrix(); }
$('#btnZen').addEventListener('click', () => zen(true)); $('#btnZenExit').addEventListener('click', () => zen(false));
function fullscreen() { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.()?.catch?.(() => { }); } catch (e) { } }
$('#btnFull').addEventListener('click', fullscreen);
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea') && e.key !== 'Escape') return; if (e.metaKey || e.ctrlKey || e.altKey) return;
  const anySheet = [...document.querySelectorAll('.sheet')].some(s => !s.hidden);
  if (e.key === 'Escape') { if (!$('#onboardSheet').hidden) return; if (!$('#confirmSheet').hidden) cfResolve?.(false); closeSheets(); closePop(); if (document.body.classList.contains('zen')) zen(false); e.target.blur?.(); return; }
  if (anySheet) { if (e.key === 'Enter' && !$('#confirmSheet').hidden) { e.preventDefault(); cfResolve?.(true); } return; }
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); toggle(); } else if (k === 's') doSkip(); else if (k === 'r') doReset(); else if (k === 'z') zen(); else if (k === 'f') fullscreen();
  else if (k === 't') toggleTasks();
  else if (k === 'd') { e.preventDefault(); openInt(); }
  else if (k === 'p') openPip();
  else if (k === 'n') { e.preventDefault(); toggleTasks(true); setTimeout(() => $('#taddTitle')?.focus(), 40); }
  else if (/^[1-9]$/.test(e.key)) { const x = openTasks()[+e.key - 1]; if (x) { setActive(x.id); toast(tr('tkNow') + ': ' + x.title, `${x.act || 0}/${x.est}`); } }
  else if (k === 'm') { AudioFX.ensure(); CFG.muted = !CFG.muted; AudioFX.applyVolume(); save(); toast(tr(CFG.muted ? 'tMuted' : 'tUnmuted'), tr('tMKey')); }
  else if (k === 'a') $('#btnAmbient').click();
});

/* ================================================================
   Pointer interactions
   ================================================================ */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let pointerOnGround = false, downAt = null; let waveT = 99;
const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(TW, TD), new THREE.MeshBasicMaterial({ visible: false })); groundPlane.rotation.x = -Math.PI / 2; scene.add(groundPlane);
function pickAt(ev) {
  const r = canvas.getBoundingClientRect(); ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera);
  const targets = [F.hit, ...extraHits, ...chickens.map(c => c.hit), ...fruits.map(f => f.mesh), ...PLOTS.filter(p => p.plant && p.plant.hit.userData.plant).map(p => p.plant.hit), windmillBlades.userData.hit, pondMesh.m, groundPlane];
  const hits = ray.intersectObjects(targets, false); return hits[0];
}
canvas.addEventListener('pointermove', ev => {
  if (ev.pointerType === 'touch') return; const h = pickAt(ev); if (!h) { pointerOnGround = false; canvas.style.cursor = ''; return; }
  const o = h.object; pointerOnGround = o === groundPlane && tileSDF(h.point.x, h.point.z) < 0; if (pointerOnGround) grassU.uPush.value.copy(h.point);
  canvas.style.cursor = o === groundPlane ? '' : 'pointer';
  const tip = $('#tip'), pl = o.userData.plant;
  if (pl && pl.rec) { const r2 = pl.rec; tip.innerHTML = `${esc(r2.title || tr('tipNoTask'))}<small>${esc(tr('v_' + (r2.variety || 'red')))} · ${esc(tr('tipPlanted', r2.title, hm(r2.at || Date.now())))}</small>`; tip.style.left = ev.clientX + 'px'; tip.style.top = ev.clientY + 'px'; tip.hidden = false; }
  else tip.hidden = true;
});
canvas.addEventListener('pointerleave', () => { pointerOnGround = false; $('#tip').hidden = true; });
canvas.addEventListener('pointerdown', ev => { downAt = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', ev => {
  if (!downAt) return; const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y), dt = performance.now() - downAt.t; downAt = null; if (moved > 7 || dt > 450) return;
  AudioFX.ensure(); closePop(); const h = pickAt(ev); if (!h) return; const o = h.object;
  if (o.userData.farmer) { F.say(pick(LNP('poke'))); if (!F.busy() || F.sitting) { const wasSitting = F.plan().sitting; if (wasSitting) F.task({ type: 'stand', end: { sitting: false } }); F.task({ type: 'anim', name: 'wave', dur: 1.4 }); if (wasSitting) { F.task({ type: 'sit', end: { sitting: true } }); } } AudioFX.marimba(659, 0, .15); return; }
  if (o.userData.chicken) { o.userData.chicken.poke(); return; }
  if (o.userData.dog) { pokeDog(); return; }
  if (o.userData.ghost) { pokeGhost(); return; }
  if (o.userData.fruit) { const b = o.userData.fruit.body; b.wakeUp(); b.applyImpulse(new CANNON.Vec3(rand(-.2, .2), rand(1.1, 1.5), rand(-.2, .2))); b.angularVelocity.set(rand(-8, 8), rand(-8, 8), rand(-8, 8)); AudioFX.pop(); Sparks.emit(o.position.clone(), 0xffb39a, 10, 1, .8, .6, .6); return; }
  if (o.userData.plant) { const p = o.userData.plant; p.shake = 1; if (AudioFX.ctx) AudioFX.noise(AudioFX.ctx.currentTime, .4, .07, 'bandpass', 3000, .7); for (let k = 0; k < 4; k++) Petals.spawn(p.g.position.clone().add(V(rand(-.3, .3), rand(.4, 1), rand(-.3, .3))), pick(['#5fae47', '#4f9a3c']), V(rand(-.5, .5), rand(0, .6), rand(-.5, .5))); return; }
  if (o === windmillBlades.userData.hit) { windBoost = 6; AudioFX.creak(); return; }
  if (o === pondMesh.m) { AudioFX.splash(); ring(h.point, 0xffffff, 1, .9); setTimeout(() => ring(h.point, 0xffffff, .7, .7), 150); for (let k = 0; k < 10; k++) Drops.spawn(h.point.clone().add(V(0, .05, 0)), 0xbfefff, V(rand(-1, 1), rand(2, 3.5), rand(-1, 1))); return; }
  if (o === groundPlane && tileSDF(h.point.x, h.point.z) < 0) { grassU.uWave.value.set(h.point.x, h.point.z, 0, 1); waveT = 0; if (AudioFX.ctx) AudioFX.noise(AudioFX.ctx.currentTime, .3, .05, 'bandpass', 1800, .6); for (const f of fruits) { const b = f.body, dx = b.position.x - h.point.x, dz = b.position.z - h.point.z, dd = Math.hypot(dx, dz); if (dd < 2.5) { b.wakeUp(); b.applyImpulse(new CANNON.Vec3(dx / (dd + .1) * .3, .8 * (1 - dd / 2.5) + .1, dz / (dd + .1) * .3)); } } for (const c of chickens) if (c.g.position.distanceTo(h.point) < 2) c.poke(); }
});
let windBoost = 0;

/* ================================================================
   Tasks: list, estimates, active task, plot signs
   ================================================================ */
const TAG_COLORS = ['#ef4e3a', '#f08a24', '#d9a514', '#5aa845', '#2f9fb8', '#5a6fd6', '#9b59c9', '#d6559a'];
function tagColor(tag) { if (!tag) return null; let h = 0; for (const ch of tag.toLocaleLowerCase('tr')) h = (h * 31 + ch.charCodeAt(0)) | 0; return TAG_COLORS[Math.abs(h) % TAG_COLORS.length]; }
function newTask(title, est = 1, tag = '', note = '', repeat = 'none') { return { repeat, id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: title.slice(0, 80), est: clamp(Math.round(est), 1, 10), act: 0, tag: tag.slice(0, 24), note: note.slice(0, 200), createdAt: Date.now(), doneAt: null }; }
const taskById = id => data.tasks.find(x => x.id === id) || null;
const openTasks = () => data.tasks.filter(x => !x.doneAt);
const isToday = ts => ts && dayKey(new Date(ts)) === dayKey();
const leftOf = x => Math.max(1, x.est - (x.act || 0));
function activeTask() { const x = taskById(S.taskId); return x && !x.doneAt ? x : null; }
function setActive(id) { S.taskId = id; save(); renderTasks(); renderActive(); }
function nextOpen(exceptId) { return openTasks().find(x => x.id !== exceptId) || null; }

// günün bitiş tahmini: kalan pomodoroları mevcut aşamadan itibaren molalarıyla sırala
function finishAt(pomos) {
  if (pomos <= 0) return null;
  let tt = Date.now(), sd = S.setDone, left = pomos, lastFocus = false;
  if (S.phase === 'focus') { if (S.curPlot !== null) { tt += remaining(); left--; sd++; lastFocus = true; } }
  else { tt += remaining(); if (S.phase === 'long') sd = 0; }
  while (left > 0) { if (lastFocus) { if (sd >= CFG.interval) { tt += phaseDur('long'); sd = 0; } else tt += phaseDur('short'); } tt += phaseDur('focus'); sd++; left--; lastFocus = true; }
  return tt;
}

const TP = { open: false, adding: { est: 1, more: false }, editId: null, dragId: null };
const tasksPanel = () => $('#tasksPanel');
function toggleTasks(on = !TP.open) { TP.open = on; CFG.tasksOpen = on; save(); tasksPanel().hidden = !on; $('#btnTasks').classList.toggle('on', on); if (on) renderTasks(); applyViewOffset(); camera.updateProjectionMatrix(); }

function pomoDots(x) { const n = Math.max(x.est, x.act || 0); let s = ''; for (let i = 0; i < Math.min(n, 12); i++) s += `<i class="${i < (x.act || 0) ? (i >= x.est ? 'over' : 'on') : ''}"></i>`; return `<span class="pomos" aria-hidden="true">${s}</span><span>${x.act || 0}/${x.est}</span>`; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function tagChip(tag) { return tag ? `<span class="tag" style="--c:${tagColor(tag)}">${esc(tag)}</span>` : ''; }
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/><path d="M10.5 11v5M13.5 11v5"/></svg>';
const PEN = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const TOM = '<svg viewBox="0 0 40 40" aria-hidden="true"><use href="#tomato"/></svg>';

function repeatSel(id, val, f) { return `<select class="txtin" ${id ? `id="${id}"` : ''} ${f ? `data-f="${f}"` : ''} aria-label="${esc(tr('tkRepeat'))}">${[['none', 'rpNone'], ['daily', 'rpDaily'], ['weekdays', 'rpWeekdays']].map(([v, k]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(tr(k))}</option>`).join('')}</select>`; }
function stepperHTML(id, v) { return `<div class="stepper" data-stepper="${id}"><button type="button" data-d="-1" aria-label="-1">−</button><output>${TOM}<span>${v}</span></output><button type="button" data-d="1" aria-label="+1">+</button></div>`; }
function tagListHTML() { const tags = [...new Set(data.tasks.map(x => x.tag).filter(Boolean))].slice(0, 12); return `<datalist id="tagList">${tags.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`; }

function renderTasks() {
  if (!TP.open) { $('#taskCount').textContent = openTasks().length || ''; $('#taskCount').hidden = !openTasks().length; return; }
  const open = openTasks(), doneToday = data.tasks.filter(x => x.doneAt && isToday(x.doneAt));
  $('#taskCount').textContent = open.length || ''; $('#taskCount').hidden = !open.length;
  const pomos = open.reduce((s, x) => s + leftOf(x), 0); const fin = finishAt(pomos);
  $('#tsum').innerHTML = open.length ? tr('tkSum', open.length, pomos, fin ? hm(fin) : '') : tr('tkSumNone');
  const add = TP.adding;
  $('#taddWrap').innerHTML = `<form class="tadd" id="taddForm" autocomplete="off"><input id="taddTitle" maxlength="80" placeholder="${esc(tr('tkAddPh'))}" aria-label="${esc(tr('tkAddPh'))}">${stepperHTML('add', add.est)}<button class="addbtn" type="submit" aria-label="${esc(tr('tkAdd'))}"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></form>
    <div class="tmorebox" ${add.more ? '' : 'hidden'}><input class="txtin" id="taddTag" list="tagList" maxlength="24" placeholder="${esc(tr('tkTagPh'))}" aria-label="${esc(tr('tkTag'))}"><input class="txtin" id="taddNote" maxlength="200" placeholder="${esc(tr('tkNotePh'))}" aria-label="${esc(tr('tkNote'))}">${repeatSel('taddRepeat', 'none')}</div>
    <div class="taddfoot"><span id="taddDur">${tr('tkDur', add.est * CFG.focus)}</span><button type="button" class="linkbtn" id="taddMore">${tr(add.more ? 'tkLess' : 'tkMore')}</button></div>${tagListHTML()}`;
  const list = $('#tlist'); list.innerHTML = '';
  if (!open.length && !doneToday.length) list.innerHTML = `<li class="tempty">${esc(tr('tkEmpty'))}</li>`;
  const row = (x) => {
    if (TP.editId === x.id) return `<li class="tform" data-id="${x.id}"><input class="txtin" data-f="title" maxlength="80" value="${esc(x.title)}" aria-label="${esc(tr('tkTitle'))}">
      <div class="r"><label>${esc(tr('tkEst'))}</label>${stepperHTML('edit', x.est)}</div>
      <input class="txtin" data-f="tag" list="tagList" maxlength="24" value="${esc(x.tag || '')}" placeholder="${esc(tr('tkTagPh'))}" aria-label="${esc(tr('tkTag'))}">
      <input class="txtin" data-f="note" maxlength="200" value="${esc(x.note || '')}" placeholder="${esc(tr('tkNotePh'))}" aria-label="${esc(tr('tkNote'))}">
      ${repeatSel('', x.repeat || 'none', 'repeat')}
      <div class="r"><button type="button" class="btn danger" data-act="del">${esc(tr('tkDelete'))}</button><span style="display:flex;gap:8px"><button type="button" class="btn" data-act="cancel">${esc(tr('cancel'))}</button><button type="button" class="btn primary" data-act="save">${esc(tr('tkSave'))}</button></span></div></li>`;
    const carry = (!x.doneAt && !isToday(x.createdAt) ? `<span class="carry">${esc(tr('tkCarry'))}</span>` : '') + (x.repeat && x.repeat !== 'none' ? `<span class="carry">↻ ${esc(tr(x.repeat === 'daily' ? 'rpDaily' : 'rpWeekdays'))}</span>` : '');
    return `<li class="trow ${x.id === S.taskId && !x.doneAt ? 'active' : ''} ${x.doneAt ? 'done' : ''}" data-id="${x.id}" draggable="${x.doneAt ? 'false' : 'true'}">
      <button type="button" class="tcheck" data-act="check" aria-label="${esc(tr(x.doneAt ? 'tkReopen' : 'tkComplete'))}">${CHECK}</button>
      <div class="tmain" data-act="select"><div class="ttitle">${esc(x.title)}</div><div class="tmeta">${pomoDots(x)}${tagChip(x.tag)}${carry}</div>${x.note ? `<div class="tnote">${esc(x.note)}</div>` : ''}</div>
      <button type="button" class="tedit tdel" data-act="del" aria-label="${esc(tr('tkDelete'))}" title="${esc(tr('tkDelete'))}">${TRASH}</button><button type="button" class="tedit" data-act="edit" aria-label="${esc(tr('tkEdit'))}">${PEN}</button></li>`;
  };
  let html = open.map(row).join('');
  if (doneToday.length) html += `<li class="tsec">${esc(tr('tkDoneSec'))}</li>` + doneToday.map(row).join('');
  if (html) list.innerHTML = html;
  $('#tkeys').textContent = tr('tkKeys');
}
function renderActive() {
  const x = activeTask(), b = $('#activeTask');
  b.classList.toggle('none', !x);
  b.innerHTML = x ? `<span class="lbl">${esc(tr('tkNow'))}</span>${x.tag ? `<i class="dot" style="background:${tagColor(x.tag)}"></i>` : ''}<span class="tt">${esc(x.title)}</span><span class="pp">${x.act || 0}/${x.est}</span>`
    : `<span class="lbl">${esc(tr('tkNow'))}</span><span class="tt">${esc(tr('tkPickCta'))} · ${esc(tr('tkPickHint'))}</span>`;
}
function addTaskFromForm() {
  const ti = $('#taddTitle'); const title = ti.value.trim(); if (!title) { ti.focus(); return; }
  const x = newTask(title, TP.adding.est, $('#taddTag')?.value.trim() || '', $('#taddNote')?.value.trim() || '', $('#taddRepeat')?.value || 'none');
  data.tasks.push(x); if (!activeTask()) S.taskId = x.id; save(true);
  TP.adding.est = 1; renderTasks(); renderActive(); AudioFX.ensure(); AudioFX.pop();
  $('#taddTitle').focus();
}
async function completeTask(x, fromPrompt = false) {
  x.doneAt = Date.now();
  if (S.taskId === x.id) S.taskId = nextOpen(x.id)?.id || null;
  save(true); renderTasks(); renderActive();
  AudioFX.ensure(); AudioFX.fanfare(); toast(tr('tTaskDone'), tr('tTaskDoneSub', x.title), 'gtomato');
  F.say(fillT(pick(LN().done)), 4);
  if (!F.busy() || F.sitting) { const was = F.plan().sitting; if (was) F.task({ type: 'stand', end: { sitting: false } }); F.task({ type: 'anim', name: 'dance', dur: 2.2 }); if (was) F.task({ type: 'sit', end: { sitting: true } }); }
  const cols = ['#ef4e3a', '#ffc53d', '#5aa845', '#5aaeea', '#ffffff'];
  for (let k = 0; k < 90; k++) Confetti.spawn(V(rand(-6, 6), rand(7, 10), rand(-4, 4)), pick(cols), V(rand(-1, 1), rand(-1, 0), rand(-1, 1)), rand(.8, 1.2));
}
function reopenTask(x) { x.doneAt = null; save(true); renderTasks(); renderActive(); }

// panel etkileşimleri (olay delegasyonu)
function initTasksUI() {
  const P = tasksPanel();
  P.addEventListener('submit', e => { if (e.target.id === 'taddForm') { e.preventDefault(); addTaskFromForm(); } });
  P.addEventListener('input', e => { if (e.target.id === 'taddTitle') { /* yazarken bir şey yapma */ } });
  P.addEventListener('click', async e => {
    const st = e.target.closest('[data-stepper] button');
    if (st) { const box = st.closest('[data-stepper]'), span = box.querySelector('output span'); const v = clamp(parseInt(span.textContent, 10) + parseInt(st.dataset.d, 10), 1, 10); span.textContent = v;
      if (box.dataset.stepper === 'add') { TP.adding.est = v; $('#taddDur').textContent = tr('tkDur', v * CFG.focus); } return; }
    if (e.target.closest('#taddMore')) { TP.adding.more = !TP.adding.more; const keep = $('#taddTitle').value; renderTasks(); $('#taddTitle').value = keep; (TP.adding.more ? $('#taddTag') : $('#taddTitle')).focus(); return; }
    if (e.target.closest('#tclose')) { toggleTasks(false); return; }
    const li = e.target.closest('[data-id]'); if (!li) return; const x = taskById(li.dataset.id); if (!x) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'check') { x.doneAt ? reopenTask(x) : completeTask(x); return; }
    if (act === 'edit') { TP.editId = x.id; renderTasks(); P.querySelector(`.tform[data-id="${x.id}"] [data-f="title"]`)?.focus(); return; }
    if (act === 'cancel') { TP.editId = null; renderTasks(); return; }
    if (act === 'save') { const f = k => li.querySelector(`[data-f="${k}"]`).value.trim(); const ti = f('title'); if (ti) x.title = ti.slice(0, 80); x.tag = f('tag').slice(0, 24); x.note = f('note').slice(0, 200); x.repeat = li.querySelector('[data-f="repeat"]').value; x.est = clamp(parseInt(li.querySelector('[data-stepper] output span').textContent, 10), 1, 10); TP.editId = null; save(true); renderTasks(); renderActive(); return; }
    if (act === 'del') { deleteTask(x); return; }
    if (act === 'select' && !x.doneAt) { setActive(x.id); AudioFX.ensure(); AudioFX.marimba(784, 0, .12); }
  });
  P.addEventListener('keydown', e => {
    const li = e.target.closest('.tform'); if (li && e.key === 'Enter') { e.preventDefault(); li.querySelector('[data-act="save"]').click(); }
    if (li && e.key === 'Escape') { e.stopPropagation(); TP.editId = null; renderTasks(); }
  });
  // sürükle bırak ile sıralama
  P.addEventListener('dragstart', e => { const li = e.target.closest('.trow'); if (!li) return; TP.dragId = li.dataset.id; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', li.dataset.id); } catch (er) { } });
  P.addEventListener('dragend', () => { TP.dragId = null; P.querySelectorAll('.drag,.over').forEach(n => n.classList.remove('drag', 'over')); });
  P.addEventListener('dragover', e => { const li = e.target.closest('.trow'); if (!li || !TP.dragId) return; e.preventDefault(); P.querySelectorAll('.over').forEach(n => n !== li && n.classList.remove('over')); li.classList.add('over'); });
  P.addEventListener('drop', e => { const li = e.target.closest('.trow'); if (!li || !TP.dragId || li.dataset.id === TP.dragId) return; e.preventDefault();
    const from = data.tasks.findIndex(x => x.id === TP.dragId); const [m] = data.tasks.splice(from, 1); const to = data.tasks.findIndex(x => x.id === li.dataset.id); data.tasks.splice(to, 0, m); save(true); renderTasks(); });
  $('#btnTasks').addEventListener('click', () => toggleTasks());
  $('#activeTask').addEventListener('click', () => { if (!openTasks().length) { toggleTasks(true); setTimeout(() => $('#taddTitle')?.focus(), 50); } else openPicker(false); });
}

// odak başlarken görev seçici
let pickAfter = false;
function openPicker(thenStart) {
  pickAfter = thenStart;
  const box = $('#pickList'); const open = openTasks();
  box.innerHTML = open.slice(0, 8).map(x => `<button type="button" class="pickbtn ${x.id === S.taskId ? 'on' : ''}" data-pick="${x.id}">${x.tag ? `<i class="dot" style="background:${tagColor(x.tag)}"></i>` : ''}<span class="tt">${esc(x.title)}</span><span class="pp">${x.act || 0}/${x.est}</span></button>`).join('')
    + `<button type="button" class="pickbtn ghost" data-pick="__new">+ ${esc(tr('pickNew'))}</button>` + (thenStart ? `<button type="button" class="pickbtn ghost" data-pick="__none">${esc(tr('pickNone'))}</button>` : '');
  openSheet('#pickSheet');
}
function initPicker() {
  $('#pickList').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; const v = b.dataset.pick; $('#pickSheet').hidden = true;
    if (v === '__new') { toggleTasks(true); setTimeout(() => $('#taddTitle')?.focus(), 60); return; }
    if (v !== '__none') setActive(v);
    if (pickAfter) start({ skipPick: true });
  });
}

// görev bittiğinde sorulacak soru (molada)
async function askTaskDone(x) {
  const yes = await confirmBox(tr('doneQT', x.title), tr('doneQX', x.est), tr('doneQY'), tr('doneQN'));
  if (yes) completeTask(x, true); else { x.est = Math.min(10, (x.act || 0) + 1); save(true); renderTasks(); renderActive(); }
}

// tarh tabelası: görev adı tahta levhada
const signs = new Set();
function drawSign(c, text, color) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const r = 26; g.fillStyle = '#c99158'; g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, r); g.fill();
  for (let i = 0; i < 9; i++) { g.strokeStyle = `rgba(110,65,30,${.12 + (i % 3) * .04})`; g.lineWidth = 2; g.beginPath(); const y = 18 + i * (H - 36) / 8; g.moveTo(18, y + Math.sin(i) * 3); g.bezierCurveTo(W * .3, y - 4, W * .6, y + 5, W - 18, y); g.stroke(); }
  g.lineWidth = 6; g.strokeStyle = '#8f5c2c'; g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, r); g.stroke();
  if (color) { g.fillStyle = color; g.beginPath(); g.roundRect(22, 22, 16, H - 44, 8); g.fill(); }
  let fs = 84; const maxW = W - (color ? 92 : 64);
  g.font = `600 ${fs}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
  let s = text; while (g.measureText(s).width > maxW && fs > 56) { fs -= 4; g.font = `600 ${fs}px Fredoka, "Arial Rounded MT Bold", sans-serif`; }
  while (g.measureText(s + '…').width > maxW && s.length > 2) s = s.slice(0, -1);
  if (s !== text) s += '…';
  g.fillStyle = '#4a2e22'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(s, (W + (color ? 30 : 0)) / 2, H / 2 + 3);
}
function makeSign(plot, text, color) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 200; drawSign(c, text, color);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const g = new THREE.Group(); g.position.set(plot.x, .3, plot.z + .9); scene.add(g);
  for (const sx of [-.5, .5]) add(new THREE.CylinderGeometry(.03, .035, .62, 6), M('#8f5c2c'), sx, .22, -.04, g);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .44), new THREE.MeshStandardMaterial({ map: tex, roughness: .9, transparent: true, alphaTest: .5, side: THREE.DoubleSide }));
  board.position.set(0, .5, 0); board.rotation.x = -.5; board.castShadow = true; g.add(board);
  g.scale.setScalar(.001);
  const sign = { g, c, tex, text, color, k: 0 }; signs.add(sign); return sign;
}
function removeSign(sign) { if (!sign) return; sign.dying = true; }
function updateSigns(dt) {
  for (const s of signs) {
    if (s.dying) { s.k -= dt * 3; if (s.k <= 0) { scene.remove(s.g); s.tex.dispose(); signs.delete(s); continue; } }
    else if (s.k < 1) s.k = Math.min(1, s.k + dt * 2.2);
    s.g.scale.setScalar(Math.max(.001, easeOutBack(clamp(s.k))));
  }
}
document.fonts?.ready?.then(() => { for (const s of signs) { drawSign(s.c, s.text, s.color); s.tex.needsUpdate = true; } });

// karşılama
const OB = { step: 0, steps: 3, rhythm: 'classic', goalN: 8, est: 1 };
const RHYTHMS = { classic: [25, 5, 15], deep: [50, 10, 20], long: [90, 20, 30] };
const perSession = f => clamp(Math.round(f / 5), 3, 8);
function renderOnboard() {
  const box = $('#obBody'), r = RHYTHMS[OB.rhythm];
  const dots = `<div class="steps">${[0, 1, 2].map(i => `<i class="${i <= OB.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const langSeg = `<div class="seg" role="group" aria-label="${esc(tr('obLang'))}"><button type="button" data-lang="en" aria-pressed="${LANG === 'en'}">English</button><button type="button" data-lang="tr" aria-pressed="${LANG === 'tr'}">Türkçe</button></div>`;
  let html = dots;
  if (OB.step === 0) {
    html += `<h2>${esc(tr('obHi'))}</h2><p class="sub">${esc(tr('obSub'))}</p>
      <div class="q">${esc(tr('obLang'))}</div>${langSeg}
      <div class="q"><label for="obName">${esc(tr('obName'))}</label></div><input class="txtin big" id="obName" maxlength="24" autocomplete="given-name" placeholder="${esc(tr('obNamePh'))}" value="${esc(data.profile.name || '')}">`;
  } else if (OB.step === 1) {
    html += `<h2>${esc(tr('obRhythm'))}</h2><div class="rcards" role="radiogroup">${Object.entries(RHYTHMS).map(([k, v]) => `<button type="button" class="rcard" role="radio" data-rh="${k}" aria-pressed="${OB.rhythm === k}" aria-checked="${OB.rhythm === k}"><b>${esc(tr(k === 'classic' ? 'obClassic' : k === 'deep' ? 'obDeep' : 'obLong'))}</b><span>${esc(tr('obRDesc', v[0], v[1]))}</span></button>`).join('')}</div>
      <div class="q">${esc(tr('obGoal'))}</div><div class="goalrow"><div class="stepper" data-stepper="obgoal"><button type="button" data-d="-1" aria-label="-1">−</button><output><span>${OB.goalN}</span></output><button type="button" data-d="1" aria-label="+1">+</button></div><span class="muted">${esc(tr('obGoalUnit', OB.goalN))} · ${esc(tr('obGoalTom', OB.goalN * perSession(r[0])))}</span></div>`;
  } else {
    html += `<h2>${esc(tr('obTask'))}</h2><input class="txtin big" id="obTask" maxlength="80" placeholder="${esc(tr('obTaskPh'))}">
      <div class="q">${esc(tr('tkEst'))}</div><div class="goalrow">${stepperHTML('obest', OB.est)}<span class="muted" id="obEstDur">${esc(tr('tkDur', OB.est * RHYTHMS[OB.rhythm][0]))}</span></div>`;
  }
  const last = OB.step === 2;
  html += `<div class="foot">${OB.step > 0 ? `<button type="button" class="linkbtn" data-ob="back">${esc(tr('obBack'))}</button>` : `<button type="button" class="linkbtn" data-ob="skip">${esc(tr('obSkip'))}</button>`}
    <button type="button" class="btn primary" data-ob="${last ? 'finish' : 'next'}">${esc(tr(last ? 'obFinish' : 'obNext'))}</button></div>`;
  box.innerHTML = html;
  const nameIn = $('#obName'); if (nameIn) setTimeout(() => nameIn.focus({ preventScroll: true }), 80);
  const tIn = $('#obTask'); if (tIn) setTimeout(() => tIn.focus({ preventScroll: true }), 80);
}
function obCommit() {
  if (OB.step === 0) { const n = $('#obName'); if (n) data.profile.name = n.value.trim().slice(0, 24); }
  if (OB.step === 1) { const r = RHYTHMS[OB.rhythm]; CFG.focus = r[0]; CFG.short = r[1]; CFG.long = r[2]; CFG.goal = OB.goalN * perSession(r[0]); if (!S.running) S.remaining = phaseDur(S.phase); }
  if (OB.step === 2) { const ti = $('#obTask')?.value.trim(); if (ti) { const x = newTask(ti, OB.est); data.tasks.push(x); S.taskId = x.id; } }
  save(true);
}
function finishOnboard() {
  data.profile.onboarded = true; save(true);
  $('#onboardSheet').hidden = true; renderUI(); renderTasks(); renderActive();
  setTimeout(() => F.say(fillT(pick(LNP('welcome'))), 5), 300);
}
function initOnboard() {
  $('#obBody').addEventListener('click', e => {
    const lb = e.target.closest('[data-lang]'); if (lb) { const keep = $('#obName')?.value; setLang(lb.dataset.lang); renderOnboard(); if (keep != null && $('#obName')) $('#obName').value = keep; return; }
    const rc = e.target.closest('[data-rh]'); if (rc) { OB.rhythm = rc.dataset.rh; renderOnboard(); return; }
    const st = e.target.closest('[data-stepper] button'); if (st) { const box = st.closest('[data-stepper]'); const d = parseInt(st.dataset.d, 10);
      if (box.dataset.stepper === 'obgoal') { OB.goalN = clamp(OB.goalN + d, 1, 16); renderOnboard(); }
      else { OB.est = clamp(OB.est + d, 1, 10); box.querySelector('output span').textContent = OB.est; $('#obEstDur').textContent = tr('tkDur', OB.est * RHYTHMS[OB.rhythm][0]); } return; }
    const b = e.target.closest('[data-ob]'); if (!b) return; const a = b.dataset.ob;
    if (a === 'skip') { obCommit(); finishOnboard(); }
    else if (a === 'back') { OB.step = Math.max(0, OB.step - 1); renderOnboard(); }
    else if (a === 'next') { obCommit(); OB.step++; renderOnboard(); }
    else if (a === 'finish') { obCommit(); finishOnboard(); }
  });
  $('#obBody').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); $('#obBody [data-ob="next"], #obBody [data-ob="finish"]')?.click(); } });
}
function maybeOnboard() {
  if (data.profile.onboarded) return;
  OB.step = 0;
  const r = Object.entries(RHYTHMS).find(([, v]) => v[0] === CFG.focus); OB.rhythm = r ? r[0] : 'classic';
  renderOnboard(); $('#onboardSheet').hidden = false;
}
function setLang(l) {
  LANG = l === 'tr' ? 'tr' : 'en'; data.profile.lang = LANG; save(true);
  applyI18n(); syncSettingsUI(); renderUI(); renderTasks(); renderActive(); syncAmb();
  if (!$('#statsSheet').hidden) renderStats();
}

/* ================================================================
   Bahçe gelişimi: toplam domatesle açılan eşyalar
   ================================================================ */
const extraHits = [], popIns = [];
function footprint(x0, x1, z0, z1) { clearGrassIn(x0, x1, z0, z1); }
function buildHive() {
  const g = new THREE.Group(); g.position.set(11.0, 0, 4.7); g.rotation.y = -.7; scene.add(g); footprint(10.3, 11.7, 4.0, 5.4);
  for (const [x, z] of [[-.25, -.2], [.25, -.2], [-.25, .2], [.25, .2]]) add(new THREE.CylinderGeometry(.04, .04, .5, 6), M('#8a5a3b'), x, .25, z, g);
  add(RB(.8, .08, .6, .03), M('#a9774a'), 0, .52, 0, g);
  [['#fff3d6', .56], ['#ffd76a', .84], ['#fff3d6', 1.12]].forEach(([c, y]) => add(RB(.7, .26, .52, .05), M(c), 0, y, 0, g));
  const roof = add(new THREE.ConeGeometry(.56, .32, 4), M('#c75b3c'), 0, 1.42, 0, g); roof.rotation.y = Math.PI / 4;
  add(RB(.22, .05, .04, .01), M('#5a3a22'), 0, .6, .27, g);
  const bees = []; for (let k = 0; k < 4; k++) { const b = new THREE.Group(); add(SPH_LO, M('#ffcf33'), 0, 0, 0, b).scale.set(.07, .055, .055); add(SPH_LO, M('#2d2320'), .03, 0, 0, b).scale.set(.03, .05, .05); for (const s of [-1, 1]) { const w = add(SPH_LO, M('#ffffff', { transparent: true, opacity: .7 }), 0, .04, s * .03, b, false); w.scale.set(.04, .01, .03); } g.add(b); bees.push({ b, ph: k * 1.6, r: .7 + k * .18, h: .9 + k * .15 }); }
  g.userData.bees = bees; return g;
}
function buildWell() {
  const g = new THREE.Group(); g.position.set(-2.6, 0, 6.2); scene.add(g); footprint(-3.5, -1.7, 5.3, 7.1);
  const ring = add(new THREE.CylinderGeometry(.62, .68, .62, 18, 1, true), M('#b9b2a6', { roughness: 1, flatShading: true, side: THREE.DoubleSide }), 0, .31, 0, g);
  add(new THREE.TorusGeometry(.64, .07, 6, 18), M('#a8a094', { flatShading: true }), 0, .62, 0, g).rotation.x = Math.PI / 2;
  add(new THREE.CircleGeometry(.6, 18), M('#2f4a6a', { roughness: .2 }), 0, .4, 0, g).rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) add(RB(.1, 1.3, .1, .02), M('#8a5a3b'), s * .58, .95, 0, g);
  const axle = add(new THREE.CylinderGeometry(.04, .04, 1.3, 8), M('#6b4126'), 0, 1.38, 0, g); axle.rotation.z = Math.PI / 2;
  const roof = add(new THREE.ConeGeometry(.95, .55, 4), M('#c75b3c'), 0, 1.85, 0, g); roof.rotation.y = Math.PI / 4;
  add(new THREE.CylinderGeometry(.008, .008, .7, 4), M('#d9c3a0'), .1, 1.03, 0, g);
  add(new THREE.CylinderGeometry(.12, .1, .18, 12), M('#8f98a3', { metalness: .5, roughness: .4 }), .1, .66, 0, g);
  return g;
}
function buildDog() {
  const g = new THREE.Group(); g.position.set(-2.3, 0, 1.4); g.rotation.y = .5; scene.add(g); footprint(-3.1, -1.5, .7, 2.1);
  const rug = add(new THREE.CylinderGeometry(.62, .62, .03, 24), M('#b13b2e', { roughness: 1 }), 0, .015, 0, g); rug.scale.set(1, 1, .7);
  const fawn = M('#d9b27a'), mask = M('#3a2a22');
  add(new THREE.CapsuleGeometry(.2, .5, 6, 12), fawn, 0, .22, 0, g).rotation.z = Math.PI / 2;
  const head = new THREE.Group(); head.position.set(.45, .26, .02); g.add(head);
  add(SPH, fawn, 0, 0, 0, head).scale.set(.17, .14, .15); add(SPH, mask, .14, -.03, 0, head).scale.set(.1, .08, .09);
  add(SPH_LO, mask, .23, -.01, 0, head).scale.setScalar(.03);
  for (const s of [-1, 1]) { const e = add(SPH_LO, mask, -.02, .06, s * .12, head); e.scale.set(.06, .1, .03); e.rotation.x = s * .5; add(SPH_LO, M('#1c1412'), .1, .04, s * .06, head).scale.set(.012, .006, .012); }
  for (const [x, z] of [[.3, .14], [.3, -.14], [-.25, .16], [-.25, -.16]]) add(new THREE.CapsuleGeometry(.05, .16, 4, 8), fawn, x + .08, .06, z, g).rotation.z = Math.PI / 2;
  const tail = new THREE.Group(); tail.position.set(-.42, .3, 0); g.add(tail);
  const tl = add(new THREE.CapsuleGeometry(.04, .22, 4, 8), fawn, 0, .1, 0, tail); tl.rotation.z = .5;
  const hit = add(new THREE.CylinderGeometry(.6, .6, .7, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, .35, 0, g, false); hit.userData.dog = g; extraHits.push(hit);
  g.userData = { tail, head, wag: 0, breathe: 0 }; return g;
}
function buildGreenhouse() {
  const g = new THREE.Group(); g.position.set(-10.4, 0, 6.35); scene.add(g); footprint(-11.5, -9.3, 5.5, 7.2);
  add(RB(2.0, .12, 1.5, .03), M('#d9cfc0', { roughness: 1 }), 0, .06, 0, g);
  const glass = new THREE.MeshStandardMaterial({ color: '#cfeefa', transparent: true, opacity: .32, roughness: .1, metalness: .1, side: THREE.DoubleSide, depthWrite: false });
  const frame = M('#f4f1ea', { roughness: .6 });
  const box = add(new THREE.BoxGeometry(1.9, 1.0, 1.4), glass, 0, .62, 0, g, false);
  const roofL = add(new THREE.PlaneGeometry(1.9, .86), glass, 0, 1.36, -.36, g, false); roofL.rotation.x = -Math.PI / 2 + .55;
  const roofR = add(new THREE.PlaneGeometry(1.9, .86), glass, 0, 1.36, .36, g, false); roofR.rotation.x = -Math.PI / 2 - .55;
  for (const x of [-.95, -.32, .32, .95]) for (const z of [-.7, .7]) add(RB(.05, 1.0, .05, .01), frame, x, .62, z, g);
  add(RB(1.95, .05, .05, .01), frame, 0, 1.6, 0, g); for (const z of [-.7, .7]) add(RB(1.95, .05, .05, .01), frame, 0, 1.12, z, g);
  for (let k = 0; k < 6; k++) { const x = -.65 + (k % 3) * .65, z = k < 3 ? -.32 : .32; add(RB(.5, .16, .36, .04), M('#6e4630', { roughness: 1 }), x, .2, z, g); const p = add(SPH_LO, M('#4f9a3c'), x, .42, z, g); p.scale.set(.18, .2, .14); for (let t = 0; t < 3; t++) add(SPH_LO, M('#e8342a', { roughness: .3 }), x + (t - 1) * .1, .4 + (t % 2) * .08, z + .1, g).scale.setScalar(.05); }
  return g;
}
const UNLOCKS = [{ at: 50, id: 'hive', build: buildHive }, { at: 100, id: 'expand' }, { at: 200, id: 'well', build: buildWell }, { at: 350, id: 'dog', build: buildDog }, { at: 500, id: 'greenhouse', build: buildGreenhouse }];
const builtU = {};
function buildUnlock(u, anim) {
  if (u.id === 'expand') { expandGarden(anim); return; }
  if (builtU[u.id]) return; const g = u.build(); builtU[u.id] = g;
  if (anim) { g.userData.baseScale = g.scale.x; g.scale.setScalar(.001); popIns.push({ g, t: 0 }); Sparks.emit(g.position.clone().add(V(0, .6, 0)), 0xffd34a, 40, 2, 1.6, 1, 1.2); }
}
function checkUnlocks(before, after) {
  for (const u of UNLOCKS) if (before < u.at && after >= u.at) {
    buildUnlock(u, true);
    if (u.id !== 'expand') { AudioFX.fanfare(); toast(tr('unlockT'), tr('u_' + u.id), 'gtomato'); setTimeout(() => F.say(fillT(pick(LN()['u_' + u.id])), 5), 800); }
  }
}
function updateUnlocks(dt, t) {
  for (let i = popIns.length - 1; i >= 0; i--) { const p = popIns[i]; p.t += dt * 1.3; p.g.scale.setScalar(Math.max(.001, easeOutBack(clamp(p.t)) * (p.g.userData.baseScale || 1))); if (p.t >= 1) popIns.splice(i, 1); }
  const hive = builtU.hive; if (hive) for (const b of hive.userData.bees) { const a = t * 1.7 + b.ph; b.b.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 3 + b.ph) * .15, Math.sin(a * 1.3) * b.r * .7); b.b.rotation.y = -a; }
  const dog = builtU.dog; if (dog) { const u = dog.userData; u.wag = Math.max(0, u.wag - dt * .5); u.tail.rotation.y = Math.sin(t * (u.wag > 0 ? 18 : 3)) * (u.wag > 0 ? .7 : .15); u.head.rotation.z = u.wag > 0 ? .25 : Math.sin(t * .6) * .03 - .05; }
}
function pokeDog() { const u = builtU.dog?.userData; if (!u) return; u.wag = 2.5; AudioFX.ensure(); if (AudioFX.ctx) { const c = AudioFX.ctx.currentTime; AudioFX.osc('sawtooth', 320, c, .12, .08, null, 160); AudioFX.osc('sawtooth', 300, c + .2, .12, .07, null, 150); } F.say(fillT(pick(LN().dog)), 3); }
function renderProgress() {
  const tot = totalTomatoes(); const next = UNLOCKS.find(u => tot < u.at);
  $('#progNext').innerHTML = next ? `${esc(tr('progNext', next.at - tot, tr('n_' + next.id)))}<div class="hbar"><i style="width:${Math.min(100, tot / next.at * 100)}%"></i></div>` : esc(tr('progAll'));
  $('#progList').innerHTML = UNLOCKS.map(u => `<div class="badge ${tot >= u.at ? '' : 'locked'}"><svg aria-hidden="true"><use href="#${tot >= u.at ? 'gtomato' : 'tomato'}"/></svg><div style="min-width:0"><b>${esc(tr('n_' + u.id))}</b><span>${tr('tomatoes', u.at)}</span></div></div>`).join('');
}

/* ---- çeşit koleksiyonu ---- */
function renderVarieties() {
  const grown = new Set(); for (const d of Object.values(data.days)) { for (const r of d.plots || []) if (r && r.state !== 'dead' && r.state !== 'growing') grown.add(r.variety || 'red'); for (const x of d.sessions || []) if (x.n > 0) grown.add(x.variety || 'red'); }
  const ids = ['red', ...VAR_IDS]; const list = ids.filter(v => grown.has(v)).map(v => tr('v_' + v)).join(', ') || '–';
  $('#varLine').innerHTML = `${esc(tr('varGrown', grown.size, list))}<div class="vdots">${ids.map(v => `<i title="${esc(tr('v_' + v))}" style="background:${VARIETIES[v].c};opacity:${grown.has(v) ? 1 : .2}"></i>`).join('')}</div><small>${esc(tr('varHint'))}</small>`;
}
/* ---- mevsimler ---- */
const SEASONS = {
  spring: { leaves: ['#7cc35a', '#f4a6c6', '#ffd1e1', '#6fb84a', '#f7b9d2'], base: '#3f8a2f', tip: '#d2f08a', fall: ['#ffc0d6', '#ffffff', '#ffd9e6'], rate: .8, snow: 0 },
  summer: { leaves: ['#5fae47', '#4f9a3c', '#72c255'], base: '#3f8a2f', tip: '#c4ec74', fall: null, rate: 0, snow: 0 },
  autumn: { leaves: ['#e8892f', '#d9532c', '#f2b33d', '#b9612e', '#8fae4a'], base: '#5f8a2f', tip: '#e0c46a', fall: ['#e8892f', '#d9532c', '#f2b33d', '#b9612e'], rate: 1.6, snow: 0 },
  winter: { leaves: ['#e9f1f4', '#cfdde3', '#6f9a7a', '#f4f8fa'], base: '#7c9a84', tip: '#eef6f2', fall: null, rate: 0, snow: 14 },
};
let SEASON = SEASONS.summer;
const appleM = M('#e8402e', { roughness: .35 });
function seasonKey() { if (CFG.season && CFG.season !== 'auto') return CFG.season; const m = new Date().getMonth(); return m === 11 || m < 2 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn'; }
function applySeason() {
  const k = seasonKey(); SEASON = SEASONS[k];
  treeGroups.forEach(g => g.userData.crown.children.forEach((m, i) => { if (m.material === appleM) { m.visible = k !== 'winter'; return; } const L = SEASON.leaves.length; m.material = M(SEASON.leaves[(((i + Math.round(g.position.x * 7)) % L) + L) % L]); }));
  grassU.uBase.value.set(SEASON.base); grassU.uTip.value.set(SEASON.tip);
}
function updateSeason(dt) {
  if (SEASON.fall && Math.random() < dt * SEASON.rate) { const tg = pick(treeGroups); Petals.spawn(tg.position.clone().add(V(rand(-1.2, 1.2), 2.6 * tg.scale.x, rand(-1.2, 1.2))), pick(SEASON.fall), V(rand(-.6, .6), rand(-.2, .3), rand(-.6, .6))); }
  if (SEASON.snow) { const n = Math.random() < (dt * SEASON.snow % 1) ? Math.ceil(dt * SEASON.snow) : Math.floor(dt * SEASON.snow); for (let i = 0; i < n; i++) Petals.spawn(V(rand(-11, 11), rand(7, 10), rand(-8, 8)), pick(['#ffffff', '#f2f7ff']), V(rand(-.2, .2), -.4, rand(-.2, .2))); }
}
/* ---- Cadılar Bayramı (22 Ekim – 1 Kasım): balkabakları, yarasalar, hayalet, cadı şapkası, balkabağı hasadı ----
   Ayarlar'dan kapatılır. ?halloween=1 tarih dışında da açar (önizleme, test), ?halloween=0 kapatır. */
const HW_URL = new URLSearchParams(location.search).get('halloween');
function hwWindow(d = new Date()) { const m = d.getMonth(), day = d.getDate(); return (m === 9 && day >= 22) || (m === 10 && day <= 1); }
function hwOn() { if (HW_URL === '0' || CFG.halloween === false) return false; return HW_URL === '1' || hwWindow(); } // kullanıcının "kapalı" tercihi her zaman önce gelir
function hwOffered() { return HW_URL === '1' || hwWindow(); }
const HW = new THREE.Group(); HW.visible = false; scene.add(HW);
// oyma yüzler: gündüz koyu oyuk, akşam içten yanar (tema ışığına bağlı)
const hwFaceM = new THREE.MeshStandardMaterial({ color: '#241005', emissive: '#ffa62b', emissiveIntensity: 0, roughness: 1, side: THREE.DoubleSide });
const hwHaloM = new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,190,90,1)'); r.addColorStop(.35, 'rgba(255,140,40,.45)'); r.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
const hwLight = new THREE.PointLight(0xff9a3a, 0, 7, 1.8); hwLight.position.set(DOOR_X, .7, -.9); hwLight.visible = false; scene.add(hwLight);
const hwX = { built: false, bats: [], ghost: null, ghostHit: null, ghostMat: null, spin: 0, witch: null, scHead: null };
function carveFace(g, style) {
  const tri = (w, h) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(0, h / 2); sh.closePath(); return new THREE.ShapeGeometry(sh); };
  const grin = (() => { const sh = new THREE.Shape(); sh.moveTo(-.36, .04); sh.quadraticCurveTo(0, -.4, .36, .04);
    [[.26, -.03], [.18, .06], [.09, -.03], [0, .06], [-.09, -.03], [-.18, .06], [-.26, -.03]].forEach(([x, y]) => sh.lineTo(x, y)); sh.closePath(); return new THREE.ShapeGeometry(sh); })();
  const eye = style === 1 ? new THREE.CircleGeometry(.12, 18) : tri(.28, .25);
  const feats = [[eye, -.27, .19, style === 1 ? 0 : .15], [eye, .27, .19, style === 1 ? 0 : -.15], [tri(.13, .12), 0, .02, 0], [grin, 0, -.17, 0]];
  for (const [geo, x, y, rz] of feats) {
    const z = Math.sqrt(Math.max(.05, 1 - x * x - (y / .72) ** 2));
    const n = V(x, y / .52, z).normalize(); const m = new THREE.Mesh(geo, hwFaceM);
    m.position.set(x, .72 + y, z).addScaledVector(n, .07); m.quaternion.setFromUnitVectors(V(0, 0, 1), n); m.rotateZ(rz); g.add(m);
  }
}
function makePumpkin(size, carved, style = 0, color = '#f07a1a') {
  const g = new THREE.Group(); add(PUMPKIN_GEO, M(color, { roughness: .55 }), 0, .72, 0, g);
  const st = add(PK_STEM_GEO, PK_STEM_M, .02, 1.22, 0, g); st.rotation.z = -.28;
  if (carved) carveFace(g, style);
  g.scale.setScalar(size); return g;
}
function buildBat() {
  const b = new THREE.Group(), dark = M('#2b2236', { roughness: .7 }), wingM = M('#3a2f4a', { roughness: .8, side: THREE.DoubleSide });
  add(SPH, dark, 0, 0, 0, b, false).scale.set(.07, .065, .1); add(SPH, dark, 0, .02, .09, b, false).scale.setScalar(.055);
  for (const s of [-1, 1]) { const e = add(new THREE.ConeGeometry(.025, .07, 5), dark, s * .03, .08, .09, b, false); e.rotation.z = -s * .25; add(SPH_LO, M('#ffe08a', { emissive: '#ffcf40', emissiveIntensity: .8 }), s * .022, .03, .14, b, false).scale.setScalar(.012); }
  const wing = s => { const w = new THREE.Group(); w.position.set(s * .05, .01, 0); b.add(w); const m = new THREE.Mesh(BAT_WING_GEO, wingM); m.scale.x = s; w.add(m); return w; };
  b.userData.lw = wing(1); b.userData.rw = wing(-1); b.scale.setScalar(1.35); return b;
}
function buildGhost() {
  const g = new THREE.Group(); const mat = hwX.ghostMat = new THREE.MeshStandardMaterial({ color: '#f7f5ff', emissive: '#e3e8ff', emissiveIntensity: .3, roughness: .6, transparent: true, opacity: .94, side: THREE.DoubleSide });
  add(SPH, mat, 0, .62, 0, g).scale.set(.34, .36, .32);
  const sk = new THREE.CylinderGeometry(.34, .45, .62, 28, 6, true); const p = sk.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -.2) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y + Math.sin(a * 6) * .06 * (-y - .2) / .11); } }
  sk.computeVertexNormals(); add(sk, mat, 0, .31, 0, g);
  const ink = M('#2a201c'); for (const s of [-1, 1]) { add(SPH_LO, ink, s * .11, .7, .29, g, false).scale.set(.045, .07, .03); add(SPH_LO, M('#ffc2d1'), s * .18, .6, .3, g, false).scale.set(.05, .03, .02); const a = add(new THREE.CapsuleGeometry(.07, .14, 4, 8), mat, s * .38, .42, .02, g); a.rotation.z = s * .9; }
  add(SPH_LO, ink, 0, .54, .345, g, false).scale.set(.05, .065, .03);
  const hit = hwX.ghostHit = add(new THREE.SphereGeometry(.6, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), 0, .5, 0, g, false); hit.userData.ghost = true;
  g.traverse(o => { o.castShadow = false; }); g.scale.setScalar(1.25); return g; // hayaletin gölgesi olmaz
}
function buildWeb(x, y, z, flip, size) {
  // çit köşesinde çeyrek örümcek ağı: köşeden yayılan teller + aralarında sarkan halkalar
  const pts = [], N = 5, R = [.28, .5, .72, .94];
  const at = (a, r) => V(flip * -Math.cos(a) * r * size, -Math.sin(a) * r * size, 0);
  for (let i = 0; i < N; i++) { const a = i / (N - 1) * Math.PI / 2; pts.push(V(), at(a, 1)); }
  for (const r of R) for (let i = 0; i < N - 1; i++) { const a0 = i / (N - 1) * Math.PI / 2, a1 = (i + 1) / (N - 1) * Math.PI / 2, mid = at((a0 + a1) / 2, r * .9); pts.push(at(a0, r), mid, mid, at(a1, r)); }
  const ln = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf4f1ff, transparent: true, opacity: .75 }));
  ln.position.set(x, y, z); HW.add(ln);
}
function buildHalloween() {
  hwX.built = true;
  // balkabakları: veranda basamağı, bahçe kapısı, kasalar, değirmen, göl kıyısı
  for (const [x, z, s, carved, st, ry] of [[-6.1, -1.3, .44, true, 0, .35], [-3.9, -1.32, .4, true, 1, .25], [-3.5, -.92, .22, false, 0, 0], [-6.55, -.9, .21, false, 0, 1], [.05, -2.45, .4, true, 0, .45], [.1, .55, .26, false, 0, 2], [-1.35, .15, .46, true, 1, .4], [-.8, .55, .24, false, 0, 1.1], [-1.75, .62, .2, false, 0, 2.3], [-3.15, -3.6, .34, true, 0, .5], [7.15, -5.5, .42, true, 0, .3], [7.8, -5.15, .2, false, 0, 1.4], [-6.0, 6.35, .28, false, 0, .7]]) {
    const p = makePumpkin(s, carved, st, carved ? '#f07a1a' : pick(['#f2892a', '#e86d12', '#f5a142'])); p.position.set(x, 0, z); p.rotation.y = ry; HW.add(p);
    if (carved) { const h = new THREE.Sprite(hwHaloM); h.position.set(x, s * .9, z); h.scale.setScalar(s * 4.2); h.renderOrder = 4; HW.add(h); }
  }
  // örümcek ağları: arka çitin iki köşesi
  buildWeb(GARDEN.x1 - .04, .66, GARDEN.z0 + .02, 1, .55); buildWeb(GARDEN.x0 + .04, .66, GARDEN.z0 + .02, -1, .5);
  // flama: evin köşesinden veranda direğine, ampullerin arasına
  { const c = V(-8.5, 2.6, -3.15), a = V(PORCH.x1 + .05, 2.25, PORCH.z1 - .05), d = V().subVectors(a, c).normalize(), n = 12, cols = ['#f07a1a', '#6b4c9a', '#2a2230', '#fff3d6'];
    const flag = (() => { const sh = new THREE.Shape(); sh.moveTo(-.11, 0); sh.lineTo(.11, 0); sh.lineTo(0, -.24); sh.closePath(); return new THREE.ShapeGeometry(sh); })();
    for (let i = 0; i < n; i++) { const t = (i + .5) / n, p = V().lerpVectors(c, a, t).add(V(0, -Math.sin(t * Math.PI) * .35 - .02, 0)); const m = new THREE.Mesh(flag, M(cols[i % cols.length], { side: THREE.DoubleSide, roughness: .8 })); m.position.copy(p); m.rotation.y = -Math.atan2(d.z, d.x); HW.add(m); } }
  // yarasalar: ev çatısının ve değirmenin üstünde
  for (const o of [{ c: V(-6, 5.4, -4.6), r: 2.8, sp: .55, ph: 0 }, { c: V(-5.5, 4.8, -4.2), r: 2.0, sp: -.75, ph: 2 }, { c: V(4.5, 4.6, -2.5), r: 2.6, sp: .6, ph: 1 }, { c: V(5, 5.3, -3), r: 3.4, sp: -.48, ph: 3.5 }, { c: V(-1, 6.2, -3.5), r: 4.2, sp: .32, ph: 4.4 }]) { const b = buildBat(); HW.add(b); hwX.bats.push({ b, ...o }); }
  // hayalet: gölün üstünde süzülür, dokununca "böö"
  hwX.ghost = buildGhost(); HW.add(hwX.ghost);
  // Hasan Dede'ye cadı şapkası
  { const h = hwX.witch = new THREE.Group(), dark = M('#3b2d52', { roughness: .8 });
    h.position.copy(F.hat.position); h.rotation.copy(F.hat.rotation); F.head.add(h);
    add(new THREE.CylinderGeometry(.52, .54, .035, 30), dark, 0, 0, 0, h); add(new THREE.CylinderGeometry(.17, .27, .32, 22), dark, 0, .17, 0, h);
    const c2 = add(new THREE.CylinderGeometry(.08, .17, .26, 18), dark, .03, .44, -.01, h); c2.rotation.set(-.12, 0, -.28);
    const tip = add(new THREE.ConeGeometry(.08, .26, 16), dark, .12, .62, -.04, h); tip.rotation.set(-.2, 0, -.9);
    add(new THREE.CylinderGeometry(.275, .275, .07, 24), M('#f07a1a', { roughness: .6 }), 0, .06, 0, h);
    add(RB(.1, .075, .02, .01), M('#ffd34a', { metalness: .5, roughness: .3 }), 0, .06, .275, h); }
  // korkuluğun kafası oyma balkabağı
  { const p = hwX.scHead = makePumpkin(.28, true, 0); p.position.set(0, 1.66, .02); scarecrow.sc.add(p); }
}
function applyHalloween() {
  const on = hwOn(); $('#rowHalloween').hidden = !hwOffered(); $('#setHalloween').setAttribute('aria-checked', String(on)); if (on && !hwX.built) buildHalloween(); if (!hwX.built) return;
  HW.visible = hwLight.visible = hwX.witch.visible = hwX.scHead.visible = on; F.hat.visible = !on; scarecrow.head.forEach(m => m.visible = !on);
  const i = extraHits.indexOf(hwX.ghostHit); if (on && i < 0) extraHits.push(hwX.ghostHit); if (!on && i >= 0) extraHits.splice(i, 1);
}
function pokeGhost() { hwX.spin = 1; AudioFX.ensure(); AudioFX.boo(); Sparks.emit(hwX.ghost.position.clone().add(V(0, .7, 0)), 0xd9c8ff, 22, 1.6, 1, .8, 1); F.say(fillT(pick(LN().hw_ghost)), 3.5); }
function updateHalloween(dt, t) {
  if (!HW.visible) return;
  hwLight.intensity = theme.glow * .9; hwHaloM.opacity = clamp((theme.glow - .25) / 2) * .85; hwFaceM.emissiveIntensity = Math.max(0, theme.glow - .3) * 2.4; // gündüz koyu oyuk, akşam fener
  for (const o of hwX.bats) { const a = t * o.sp + o.ph, u = o.b.userData; o.b.position.set(o.c.x + Math.cos(a) * o.r, o.c.y + Math.sin(t * 1.3 + o.ph) * .4, o.c.z + Math.sin(a) * o.r * .8);
    o.b.rotation.set(0, Math.atan2(-Math.sin(a) * Math.sign(o.sp), Math.cos(a) * .8 * Math.sign(o.sp)), Math.sign(o.sp) * .35); const f = Math.sin(t * 15 + o.ph * 3) * .75; u.lw.rotation.z = f; u.rw.rotation.z = -f; }
  const g = hwX.ghost, a = t * .22; g.position.set(-3.2 + Math.cos(a) * 1.7, 1.45 + Math.sin(t * 1.6) * .16 + Math.sin(hwX.spin * Math.PI) * .45, 2.7 + Math.sin(a) * 1.1);
  // hep kameraya dönük süzülür (yüzü görünsün); dokununca kendi çevresinde döner
  if (hwX.spin > 0) { hwX.spin = Math.max(0, hwX.spin - dt * 1.25); g.rotation.y += dt * 16 * hwX.spin; }
  else { let dy = .35 + Math.sin(t * .7) * .4 - g.rotation.y; dy = ((dy + Math.PI) % 6.283 + 6.283) % 6.283 - Math.PI; g.rotation.y += dy * Math.min(1, dt * 2); }
  g.rotation.z = Math.sin(t * 1.1) * .08; hwX.ghostMat.emissiveIntensity = .25 + theme.glow * .2;
}
// balkabağı hasadı: Cadılar Bayramı'nda ekilen her fidenin dibinde bir balkabağı büyür, hasatta kasaya gider (domates sayısından ayrı)
function bankPumpkin(r) { if (r?.pumpkin) { const d = today(); d.pumpkins = (d.pumpkins || 0) + 1; } }
function flyPumpkin(plant) {
  const pk = plant.pk; if (!pk || pk.userData.picked) return; plant.g.updateMatrixWorld(); const from = pk.getWorldPosition(V()).add(V(0, .15, 0)); pk.userData.picked = true; pk.scale.setScalar(.0001);
  const m = new THREE.Mesh(PUMPKIN_GEO, PK_M); m.scale.setScalar(.2); m.castShadow = true; m.position.copy(from); scene.add(m);
  plant.shake = .6; AudioFX.pluck(); Sparks.emit(from, 0xffa64a, 8, .8, .8, .6, .6); flights.push({ m, from, t: 0, dur: .55, pumpkin: true });
}
// testler için (yalnız ?halloween= ile açılınca)
if (HW_URL !== null) window.__hw = { on: () => HW.visible, poke: () => pokeGhost(), ghost: () => ({ x: hwX.ghost.position.x, y: hwX.ghost.position.y, z: hwX.ghost.position.z, spin: hwX.spin }), hat: () => hwX.witch.visible && !F.hat.visible };
function basketPumpkin(on) { const B = F.tools.basket.userData; if (!B.pk && on) { B.pk = add(PUMPKIN_GEO, PK_M, .02, .2, 0, F.tools.basket, false); B.pk.scale.setScalar(.12); } if (B.pk) B.pk.visible = on; }
/* ---- grafik kalitesi (otomatik ölçüm) ---- */
const QUALITY = { high: { dpr: Math.min(devicePixelRatio || 1, isSmall ? 1.5 : 1.75), shadow: true, bloom: true }, balanced: { dpr: Math.min(devicePixelRatio || 1, 1.25), shadow: true, bloom: true }, low: { dpr: 1, shadow: false, bloom: false } };
let qLevel = 'high', qMeasure = { t: 0, f: 0, done: false, wait: 3 };
function applyQuality(level) {
  qLevel = level; const Q = QUALITY[level];
  renderer.setPixelRatio(Q.dpr); composer.setPixelRatio?.(Q.dpr); sun.castShadow = Q.shadow; bloom.enabled = Q.bloom;
  if (typeof onResize === 'function') onResize();
}
function updateQuality(dt) {
  if (CFG.quality !== 'auto' || qMeasure.done || document.hidden) return;
  if (qMeasure.wait > 0) { qMeasure.wait -= dt; return; }
  qMeasure.t += dt; qMeasure.f++;
  if (qMeasure.t >= 3) { const fps = qMeasure.f / qMeasure.t; qMeasure.t = 0; qMeasure.f = 0;
    if (fps < 40 && qLevel !== 'low') { applyQuality(qLevel === 'high' ? 'balanced' : 'low'); qMeasure.wait = 1; } else qMeasure.done = true; }
}
/* ---- ses: bitiş sesi, tik-tak ---- */
function playChime() { const c = CFG.chime; if (c === 'marimba') AudioFX.fanfare(); else if (c === 'birds') { if (AudioFX.ctx) for (let k = 0; k < 4; k++) AudioFX.birdCall(AudioFX.fx, AudioFX.ctx.currentTime + k * .35); } else AudioFX.chimeRipe(); }
let lastTickSec = -1, tickFlip = false;
function updateTick() { if (!CFG.tick || !S.running || S.phase !== 'focus') return; const sec = Math.ceil(remaining() / 1000); if (sec !== lastTickSec) { lastTickSec = sec; tickFlip = !tickFlip; AudioFX.tick(tickFlip); } }
/* ---- görünüm ve ses ayarları ---- */
function fillSelect(id, opts, val) { const s = $('#' + id); s.innerHTML = opts.map(([v, k]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(tr(k))}</option>`).join(''); }
function syncLookUI() {
  fillSelect('setSeason', [['auto', 'seasonAuto'], ['spring', 'spring'], ['summer', 'summer'], ['autumn', 'autumn'], ['winter', 'winter']], CFG.season);
  fillSelect('setQuality', [['auto', 'qAuto'], ['high', 'qHigh'], ['balanced', 'qBalanced'], ['low', 'qLow']], CFG.quality);
  fillSelect('setChime', [['bells', 'chBells'], ['marimba', 'chMarimba'], ['birds', 'chBirds']], CFG.chime);
  $('#setAmbVol').value = CFG.ambVol; $('#outAmbVol').textContent = Math.round(CFG.ambVol * 100) + '%';
  $('#setFxVol').value = CFG.fxVol; $('#outFxVol').textContent = Math.round(CFG.fxVol * 100) + '%';
  $('#setTick').setAttribute('aria-checked', String(!!CFG.tick));
  $('#rowHalloween').hidden = !hwOffered(); $('#setHalloween').setAttribute('aria-checked', String(hwOn()));
}
$('#setSeason').addEventListener('change', e => { CFG.season = e.target.value; save(); applySeason(); });
$('#setQuality').addEventListener('change', e => { CFG.quality = e.target.value; save(); if (CFG.quality === 'auto') { qMeasure = { t: 0, f: 0, done: false, wait: 1 }; applyQuality('high'); } else applyQuality(CFG.quality); });
$('#setChime').addEventListener('change', e => { CFG.chime = e.target.value; save(); AudioFX.ensure(); playChime(); });
for (const [id, k, out] of [['setAmbVol', 'ambVol', 'outAmbVol'], ['setFxVol', 'fxVol', 'outFxVol']]) $('#' + id).addEventListener('input', e => { CFG[k] = parseFloat(e.target.value); $('#' + out).textContent = Math.round(CFG[k] * 100) + '%'; AudioFX.applyVolume(); save(); });
$('#setTick').addEventListener('click', e => { CFG.tick = !CFG.tick; e.currentTarget.setAttribute('aria-checked', String(CFG.tick)); save(); });
$('#setHalloween').addEventListener('click', () => { CFG.halloween = CFG.halloween === false; save(); applyHalloween(); });
/* ---- tekrarlayan görevler ---- */
function repeatsOn(x, d = new Date()) { if (x.repeat === 'daily') return true; if (x.repeat === 'weekdays') { const w = d.getDay(); return w >= 1 && w <= 5; } return false; }
let lastRepeatDay = '';
function resetRecurring() {
  const k = dayKey(); if (k === lastRepeatDay) return; lastRepeatDay = k; let ch = false;
  for (const x of data.tasks) if (x.repeat && x.repeat !== 'none' && x.doneAt && dayKey(new Date(x.doneAt)) !== k && repeatsOn(x)) { x.doneAt = null; x.act = 0; x.createdAt = Date.now(); ch = true; }
  if (ch) { save(true); renderTasks(); renderActive(); }
}
setInterval(resetRecurring, 60000);

/* ================================================================
   Hatırlatmalar
   ================================================================ */
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// önceki sürümlerden kalan, artık kullanılmayan profil alanları
{ const P = data.profile; let ch = false; for (const k of ['st', 'dev', 'statsConsent', 'statsAskN', 'lastOpen']) if (k in P) { delete P[k]; ch = true; }
  if ('stats' in CFG) { delete CFG.stats; ch = true; } if (ch) save(); }
// odak bitince (molada): kalıcı depolama iste; iPhone'da ana ekran önerisi; uzun süredir yedek yoksa hatırlat
function afterFocusCare() {
  const P = data.profile, now = Date.now();
  if (!P.persistAsked && navigator.storage?.persist) { P.persistAsked = true; save(); navigator.storage.persist().catch(() => { }); }
  if (isIOS && !isStandalone() && (P.a2hsN || 0) < 3 && now - (P.a2hsAt || 0) > 3 * 864e5) {
    P.a2hsN = (P.a2hsN || 0) + 1; P.a2hsAt = now; save();
    setTimeout(() => toast(tr('a2hsT'), tr('a2hsX'), 'tomato', { label: tr('ok'), fn: () => { } }, 12000), 4500); return;
  }
  const total = Object.values(data.days).reduce((s, d) => s + (d.sessions || []).filter(x => x.n > 0).length, 0);
  if (total >= 10 && now - (P.lastBackup || P.firstAt || now) > 14 * 864e5 && now - (P.bkNagAt || 0) > 7 * 864e5) {
    P.bkNagAt = now; save();
    setTimeout(() => toast(tr('bkNagT'), tr('bkNagX'), 'tomato', { label: tr('bkExport'), fn: exportJSON }, 12000), 4500);
  }
}
if (!data.profile.firstAt) { data.profile.firstAt = Date.now(); save(); }
$('#btnAbout').addEventListener('click', () => { closeSheets(); openSheet('#aboutSheet'); });

/* ================================================================
   Boot: rebuild today's garden
   ================================================================ */
(() => {
  const d = today();
  d.plots.forEach((r, i) => { if (!r || !PLOTS[i]) return; if (r.state === 'picked') r.state = 'ripe'; if (r.state === 'growing' && S.curPlot !== i) { r.state = 'dead'; } if (r.state === 'growing') r.planted = true; PLOTS[i].plant = new Plant(PLOTS[i], r); });
  for (let i = 0; i < Math.min(STACK_POS.length, Math.floor(d.tomatoes / 25)); i++) { const c = makeFullCrate(i); c.scale.setScalar(1); }
  const inCrate = Math.min(30, d.tomatoes % 25 || (d.tomatoes ? 12 : 0));
  for (let k = 0; k < inCrate; k++) spawnFruit(V(CRATE.x + rand(-.4, .4), .5 + k * .08, CRATE.z + rand(-.3, .3)), V(0, 0, 0), false);
})();
{ const tot = totalTomatoes(); for (const u of UNLOCKS) if (u.id !== 'expand' && tot >= u.at) buildUnlock(u, false); }
applySeason(); applyHalloween(); if (CFG.quality !== 'auto') applyQuality(CFG.quality); resetRecurring();
// Cadılar Bayramı'nda her yıl bir kez haber ver
if (hwOn() && data.profile.hwSeen !== new Date().getFullYear()) { data.profile.hwSeen = new Date().getFullYear(); save(); setTimeout(() => toast(tr('hwT'), tr('hwSub'), 'pumpkin', null, 8000), data.profile.onboarded ? 5600 : 9500); }
applyI18n(); initTasksUI(); initPicker(); initOnboard();
TP.open = CFG.tasksOpen ?? (innerWidth >= 1280); tasksPanel().hidden = !TP.open; $('#btnTasks').classList.toggle('on', TP.open);
updateHarvestUI(); syncAmb(); renderUI(); renderTasks(); renderActive(); onPhaseVisual();

/* ================================================================
   Theme application
   ================================================================ */
const sunDir = V();
function applyTheme(dt) {
  const tgt = THEMES[themeKey()]; const k = 1 - Math.exp(-dt * .8);
  rainMix = lerp(rainMix, CFG.ambient === 'rain' ? 1 : 0, 1 - Math.exp(-dt * .6)); windMix = lerp(windMix, CFG.ambient === 'wind' ? 1 : 0, 1 - Math.exp(-dt * .6));
  for (const c of COLOR_KEYS) { TMP.c.copy(tgt[c]); if (c !== 'hGr') TMP.c.lerp(RAIN_TINT, rainMix * (c === 'sun' ? .2 : .4)); theme[c].lerp(TMP.c, k); }
  for (const n of NUM_KEYS) theme[n] = lerp(theme[n], tgt[n] * (n === 'sunI' ? 1 - rainMix * .5 : 1) * (n === 'stars' ? 1 - rainMix * .8 : 1), k);
  sunDir.set(Math.cos(theme.el) * Math.cos(theme.az), Math.sin(theme.el), Math.cos(theme.el) * Math.sin(theme.az));
  skyU.uTop.value.copy(theme.top); skyU.uHor.value.copy(theme.hor); skyU.uBot.value.copy(theme.bot); skyU.uSunDir.value.copy(sunDir); skyU.uSunCol.value.copy(theme.sun); skyU.uStars.value = theme.stars;
  scene.fog.color.copy(theme.hor); hemi.color.copy(theme.hSky); hemi.groundColor.copy(theme.hGr); hemi.intensity = theme.hI;
  sun.color.copy(theme.sun); sun.intensity = theme.sunI; sun.position.copy(sunDir).multiplyScalar(40); sun.position.y = Math.max(sun.position.y, 6);
  for (const u of cloudLayers) { u.uLight.value.copy(theme.cL); u.uShade.value.copy(theme.cS); u.uHor.value.copy(theme.hor); }
  puffMat.color.copy(theme.cL).lerp(theme.hSky, .2); puffMat.emissive.copy(theme.cL); puffMat.emissiveIntensity = .22;
  grassU.uLight.value.copy(theme.sun).multiplyScalar(theme.sunI * .4); grassU.uAmb.value.copy(theme.hSky).multiplyScalar(theme.hI * .68);
  pondU.uSky.value.copy(theme.top);
  bloom.strength = theme.bloom; renderer.toneMappingExposure = theme.exp; fireU.uOpacity.value = theme.fire;
  for (const m of glowMats) m.emissiveIntensity = theme.glow * m.userData.k;
  lanternLight.intensity = theme.glow * 1.4; Smoke.u.uColor.value.copy(theme.cL).lerp(TMP.c.set('#d8d8d8'), .3);
  butterflies.forEach(b => b.visible = theme.fire < .6);
}

/* ================================================================
   Main loop
   ================================================================ */
const clock = new THREE.Clock(); let t = 0, gust = 0, gustT = rand(6, 12), loaded = false;
function tickTimer() { if (S.running && Date.now() >= S.endAt) { S.running = false; S.remaining = 0; complete(); } }
setInterval(() => { tickTimer(); if (document.hidden) renderClock(); }, 500);
let nextChatter = 60;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20); t += dt; appTime = t;
  tickTimer(); renderClock(); renderStatus();
  gustT -= dt; if (gustT <= 0) { gustT = rand(6, 14) * (windMix > .5 ? .4 : 1); gust = 1; } gust *= Math.exp(-dt * .8);
  const windK = 1 + gust * 1.2 + rainMix * .5 + windMix * 1.8;
  grassU.uTime.value = t; grassU.uWind.value = .5 + rainMix * .3 + windMix * .7; grassU.uGust.value = gust * .9 + windMix * .4;
  grassU.uPushK.value = lerp(grassU.uPushK.value, pointerOnGround ? 1 : 0, 1 - Math.exp(-dt * 6));
  waveT += dt; grassU.uWave.value.z = waveT * 5.5; grassU.uWave.value.w = Math.max(0, 1 - waveT / .9);
  skyU.uTime.value = t; fireU.uTime.value = t; pondU.uTime.value = t; for (const u of cloudLayers) { u.uTime.value = t; u.uCam.value.copy(camera.position); }
  sky.position.copy(camera.position);
  applyTheme(dt);
  // plants
  const d = today();
  if (S.phase === 'focus' && S.curPlot !== null) { const r = d.plots[S.curPlot]; if (r && r.state === 'growing') { r.g = r.planted ? Math.pow(progress(), .85) : 0; } }
  for (const p of PLOTS) if (p.plant && !p.plant.update(dt, t, windK)) { p.plant = null; }
  for (const p of PLOTS) { const r = d.plots[p.i]; if (r && !p.plant && r.state !== 'growing') p.plant = new Plant(p, r); }
  // farmer
  F.update(dt, t); updateSigns(dt); updateUnlocks(dt, t); updateSeason(dt); updateHalloween(dt, t); updateQuality(dt); updateTick();
  for (let i = growers.length - 1; i >= 0; i--) { const gr = growers[i]; gr.t += dt * 1.4; gr.g.scale.y = Math.max(.001, easeOutBack(clamp(gr.t))); if (gr.t >= 1) { gr.g.scale.y = 1; growers.splice(i, 1); } }
  doorAnim.v = lerp(doorAnim.v, doorAnim.target, 1 - Math.exp(-dt * 7)); door.rotation.y = -doorAnim.v * 1.7;
  if (WATER) { const sp = F.tools.can.userData.spout.getWorldPosition(TMP.v); for (let k = 0; k < 3; k++) Drops.spawn(sp, 0x9fdcff, V((WATER.plot.x - sp.x) * 1.2 + rand(-.2, .2), rand(-.4, .2), (WATER.plot.z - sp.z) * 1.2 + rand(-.2, .2)), .8); }
  if (bubbleT > 0) { bubbleT -= dt; if (F.root.visible) { const hp = F.headWorld(TMP.v2).add(V(0, .75, 0)).project(camera); const r = canvas.getBoundingClientRect(); bubble.style.left = clamp((hp.x + 1) / 2 * r.width, 125, r.width - 125) + 'px'; bubble.style.top = ((1 - hp.y) / 2 * r.height) + 'px'; bubble.style.opacity = hp.z < 1 ? Math.min(1, bubbleT * 2) : 0; } else bubble.style.opacity = 0; if (bubbleT <= 0) bubble.hidden = true; }
  nextChatter -= dt; if (nextChatter <= 0) { nextChatter = rand(70, 140); if (S.running && S.phase === 'focus' && !F.busy() && !document.body.classList.contains('zen')) F.say(pick(LNP('focus'))); }
  // flights into basket
  for (let i = flights.length - 1; i >= 0; i--) { const f = flights[i]; f.t += dt / f.dur; const to = F.tools.basket.getWorldPosition(TMP.v).add(V(0, .15, 0)); const k = clamp(f.t); f.m.position.lerpVectors(f.from, to, k); f.m.position.y += Math.sin(k * Math.PI) * .6; f.m.rotation.x += dt * 8;
    if (f.t >= 1) { scene.remove(f.m); flights.splice(i, 1); if (f.pumpkin) basketPumpkin(true); else F.setBasket(Math.min(10, F.basketCount + 1)); AudioFX.tock(2); } }
  // critters + scenery
  chickens.forEach(c => c.update(dt, t));
  butterflies.forEach((b, i) => { const u = b.userData; const a = t * u.sp + u.ph; b.position.set(u.cx + Math.cos(a) * u.r + Math.sin(a * 2.3) * .4, .7 + Math.sin(a * 1.7) * .4 + Math.sin(t * 6 + i) * .05, u.cz + Math.sin(a) * u.r * .7); b.rotation.y = -a; const f = Math.sin(t * 22 + i) * 1.1; u.lw.rotation.z = f; u.rw.rotation.z = -f; });
  treeGroups.forEach(g => { g.userData.crown.rotation.z = Math.sin(t * .9 + g.userData.ph) * .025 * windK; g.userData.crown.rotation.x = Math.cos(t * .7 + g.userData.ph) * .02 * windK; });
  sunflowers.forEach(g => { g.rotation.z = Math.sin(t * 1.3 + g.userData.sway) * .04 * windK; });
  windBoost *= Math.exp(-dt * .6); windmillBlades.rotation.z -= dt * (.5 + windMix * 1.6 + gust * .8 + windBoost);
  if ((windMix > .3 || gust > .7) && Math.random() < dt * 3 * (windMix + gust)) { const tg = pick(treeGroups); Petals.spawn(tg.position.clone().add(V(rand(-1, 1), 2.4 * tg.scale.x, rand(-1, 1))), pick(['#5fae47', '#72c255', '#e8c84a']), V(rand(1, 3), rand(0, 1), rand(-.5, .5))); }
  puffs.children.forEach(g => { const u = g.userData; u.a += u.sp * dt; g.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * .2 + u.bob) * .4, Math.sin(u.a) * u.r); });
  stackCrates.forEach(c => { if (c.userData.pop > 0 && c.userData.pop < 1) { c.userData.pop = Math.min(1, c.userData.pop + dt * 2); c.scale.setScalar(Math.max(.001, easeOutBack(c.userData.pop))); } });
  Smoke.update(dt, 1 + windMix * 1.5);
  // physics
  world.step(1 / 60, dt, 3);
  for (let i = fruits.length - 1; i >= 0; i--) { const f = fruits[i]; f.mesh.position.copy(f.body.position); f.mesh.quaternion.copy(f.body.quaternion); if (f.body.position.y < -20) removeFruit(f); }
  Dirt.update(dt, t); Drops.update(dt, t); Confetti.update(dt, t, .2, .1); Petals.update(dt, t, 1 + windMix * 2, .3); Feathers.update(dt, t); Sparks.update(dt); Rain.update(dt);
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; const k = r.t / r.dur; r.m.scale.setScalar(.15 + easeOutCubic(k) * r.maxR); r.m.material.opacity = (1 - k) * .85; if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); } }
  // camera: intro anim, gentle drift, soft follow of Hasan Dede
  if (camAnim) { camAnim.t += dt; const k = easeInOut(clamp(camAnim.t / camAnim.dur)); controls.target.lerpVectors(camAnim.fT, camAnim.tT, k); sph.set(lerp(camAnim.f.r, camAnim.to.r, k), lerp(camAnim.f.p, camAnim.to.p, k), lerp(camAnim.f.th, camAnim.to.th, k)); camera.position.copy(controls.target).add(TMP.v.setFromSpherical(sph)); if (camAnim.t >= camAnim.dur) camAnim = null; }
  else if (t - lastUser > 6 && !reduceMotion) {
    const want = BASE_TARGET.clone(); if (F.busy() && F.root.visible) want.lerp(V(F.root.position.x, .4, F.root.position.z), .35);
    const prev = controls.target.clone(); controls.target.lerp(want, 1 - Math.exp(-dt * .8)); camera.position.add(TMP.v.copy(controls.target).sub(prev));
    sph.setFromVector3(camera.position.clone().sub(controls.target)); const wantTh = CAM.theta + Math.sin(t * .05) * .18; sph.theta = lerp(sph.theta, wantTh, 1 - Math.exp(-dt * .15)); camera.position.copy(controls.target).add(TMP.v.setFromSpherical(sph));
  }
  controls.update();
  composer.render();
  if (!loaded) { loaded = true; $('#loading').remove(); }
}
function onResize() { const w = innerWidth, h = innerHeight; camera.aspect = w / h; camera.fov = w < 700 ? 40 : 32; applyViewOffset(); camera.updateProjectionMatrix(); renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); }
addEventListener('resize', onResize);

// intro: fly in, Hasan Dede steps out and greets
sph.set(90, .7, CAM.theta - 1.2); camera.position.copy(controls.target).add(TMP.v.setFromSpherical(sph));
applyViewOffset(); camera.updateProjectionMatrix(); applyTheme(10);
requestAnimationFrame(frame);
setTimeout(() => camTo(BASE_TARGET, CAM.r, reduceMotion ? .01 : 4.4, { phi: CAM.phi, theta: CAM.theta }), 100);
setTimeout(() => {
  F.goTo(WP.PORCH_FRONT, 'porch', 'fOut'); F.task({ type: 'face', yaw: 0 }); F.task({ type: 'anim', name: 'stretch', dur: 1.4 });
  F.task({ type: 'call', fn: () => F.say(S.phase === 'focus' && !S.running ? pick(LNP('welcome')) : pick(LNP('poke'))) }); F.task({ type: 'anim', name: 'wave', dur: 1.4 });
  if (S.phase !== 'focus') startHarvest();
  sitOnBench();
}, reduceMotion ? 100 : 3600);
setTimeout(() => $('#intro')?.remove(), 4000);
setTimeout(maybeOnboard, reduceMotion ? 300 : 3300);
// çevrimdışı çalışma: servis çalışanı (yalnız http/https altında)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) addEventListener('load', () => {
  // getdomat.com tarayıcı önbelleği 4 saat: güncellemeyi HTTP önbelleğinden bağımsız denetle; yeni sürüm gelince sayaç çalışmıyorsa yenile
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !S.running) location.reload(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { });
});
