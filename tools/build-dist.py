#!/usr/bin/env python3
"""Yayın klasörü: dist/ (yalnız sw.js önbellek listesindeki dosyalar + sw.js + _headers).
Testler, ekran görüntüleri, README ve Domat.html yayına gitmez. Kullanım: python3 tools/build-dist.py"""
import json, os, re, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
assets = json.loads(re.search(r'const ASSETS = (\[.*?\]);', open('sw.js', encoding='utf-8').read(), re.S).group(1))
files = [a[2:] for a in assets if a not in ('./',)] + ['sw.js', '_headers']
shutil.rmtree('dist', ignore_errors=True)
for f in files:
    os.makedirs(os.path.dirname(os.path.join('dist', f)) or 'dist', exist_ok=True)
    shutil.copy2(f, os.path.join('dist', f))
# exFAT diskte macOS her kopyaya ._ gölge dosyası ekler; yayına gitmesin
for d, _, fs in os.walk('dist'):
    for f in fs:
        if f.startswith('._') or f == '.DS_Store': os.remove(os.path.join(d, f))
print('dist/', len(files), 'dosya')
