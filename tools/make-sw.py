"""sw.js'yi üretir: uygulamanın bütün dosyalarını önbelleğe alma listesine yazar, içerik özetinden sürüm üretir.
Kullanım: python3 tools/make-sw.py (dosya eklediğinde ya da değiştirdiğinde yeniden çalıştır)."""
import hashlib, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'tests', 'tools', 'screenshots', 'node_modules', 'functions', '.wrangler', 'dist'}
files, h = [], hashlib.sha256()
for d, dirs, fs in os.walk(ROOT):
    dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
    for f in sorted(fs):
        if f.startswith('._') or f in ('.DS_Store', 'sw.js', 'README.md', 'README.tr.md', 'LICENSE', '.gitignore', '_headers', 'Domat.html', 'wrangler.toml'): continue
        p = os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/')
        files.append('./' + p); h.update(p.encode()); h.update(open(os.path.join(d, f), 'rb').read())
files.insert(0, './')
ver = 'domat-' + h.hexdigest()[:10]
sw = f"""// Otomatik üretildi: tools/make-sw.py
const CACHE = '{ver}';
const ASSETS = {json.dumps(files, indent=1)};
self.addEventListener('install', e => {{ e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, {{ cache: 'reload' }})))).then(() => self.skipWaiting())); }});
self.addEventListener('activate', e => {{ e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', e => {{
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, {{ ignoreSearch: true }}).then(hit => hit || fetch(r).then(res => {{ if (res.ok) {{ const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }} return res; }}).catch(() => caches.match('./'))));
}});
"""
open(os.path.join(ROOT, 'sw.js'), 'w').write(sw)
print(ver, len(files), 'dosya')
