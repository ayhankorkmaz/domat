// Otomatik üretildi: tools/make-sw.py
const CACHE = 'domat-ac287cd413';
const ASSETS = [
 "./",
 "./index.html",
 "./manifest.webmanifest",
 "./og.jpg",
 "./css/app.css",
 "./fonts/X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_DWg89XgHPyhRMw.woff2",
 "./fonts/X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_DWu89XgHPyh.woff2",
 "./fonts/XRXV3I6Li01BKofINeaBTMnFcQ.woff2",
 "./fonts/XRXV3I6Li01BKofIO-aBTMnFcQIG.woff2",
 "./icons/apple-touch-icon.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/icon-maskable-512.png",
 "./js/app.js",
 "./js/i18n.js",
 "./vendor/cannon-es/cannon-es.js",
 "./vendor/three/build/three.module.js",
 "./vendor/three/examples/jsm/controls/OrbitControls.js",
 "./vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js",
 "./vendor/three/examples/jsm/postprocessing/EffectComposer.js",
 "./vendor/three/examples/jsm/postprocessing/MaskPass.js",
 "./vendor/three/examples/jsm/postprocessing/OutputPass.js",
 "./vendor/three/examples/jsm/postprocessing/Pass.js",
 "./vendor/three/examples/jsm/postprocessing/RenderPass.js",
 "./vendor/three/examples/jsm/postprocessing/ShaderPass.js",
 "./vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js",
 "./vendor/three/examples/jsm/shaders/CopyShader.js",
 "./vendor/three/examples/jsm/shaders/LuminosityHighPassShader.js",
 "./vendor/three/examples/jsm/shaders/OutputShader.js"
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; }).catch(() => caches.match('./'))));
});
