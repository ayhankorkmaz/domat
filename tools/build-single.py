#!/usr/bin/env python3
"""Çift tıkla açılan tek dosya: Domat.html (JS, CSS ve fontlar gömülü, sunucu gerekmez).
Chrome file:// ile açılan sayfada ayrı modül dosyalarını yüklemez; bu yüzden her şey tek dosyaya gömülür.
Kullanım: python3 tools/build-single.py  (npx esbuild gerekir)"""
import base64, os, re, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
with tempfile.TemporaryDirectory() as tmp:
    out = os.path.join(tmp, 'app.js')
    subprocess.run(['npx', '--yes', 'esbuild', 'js/app.js', '--bundle', '--format=esm', '--minify', '--log-level=warning',
                    '--alias:three/addons=./vendor/three/examples/jsm', '--alias:three=./vendor/three/build/three.module.js',
                    '--alias:cannon-es=./vendor/cannon-es/cannon-es.js', '--outfile=' + out], check=True)
    js = open(out, encoding='utf-8').read()
js = js.replace('</script', '<\\/script')
css = open('css/app.css', encoding='utf-8').read()
def font(m):
    data = base64.b64encode(open(os.path.join('css', m.group(1)), 'rb').read()).decode()
    return "url(data:font/woff2;base64," + data + ")"
css = re.sub(r"url\('(\.\./fonts/[^']+)'\)", font, css)
html = open('index.html', encoding='utf-8').read()
html = re.sub(r'<link rel="manifest"[^>]*>\n?|<link rel="apple-touch-icon"[^>]*>\n?', '', html)
html = html.replace('<link rel="stylesheet" href="css/app.css">', '<style>\n' + css + '\n</style>')
html = re.sub(r'<script type="importmap">.*?</script>\n?', '', html, flags=re.S)
html = re.sub(r'<script>\n/\* index.html çift tıkla.*?</script>\n', '', html, flags=re.S)
html = html.replace('<script type="module" src="js/app.js"></script>', '<script type="module">\n' + js + '\n</script>')
assert 'js/app.js' not in html and 'importmap' not in html
open('Domat.html', 'w', encoding='utf-8').write(html)
print('Domat.html', round(os.path.getsize('Domat.html') / 1024), 'KB')
