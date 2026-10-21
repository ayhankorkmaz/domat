<div align="center">

# 🍅 Domat

**Sen odaklan, Hasan Dede domatesleri yetiştirsin.**

Görev listeli, 3D çiftlik görünümlü Pomodoro zamanlayıcısı. Her odak seansında Hasan Dede bir fide eker,
fidenin tabelasına üzerinde çalıştığın görevin adını yazar; molada domatesleri toplar.

**[getdomat.com](https://getdomat.com)** · [English](README.md)

</div>

### Görevler
- **Görev listesi:** görev ekle, kaç pomodoroda biteceğini seç (1–10), etiket ve not ekle, sürükleyerek sırala.
- **İlerleme ve bitiş saati:** her görevde "2/4 🍅"; listenin başında "4 görev · 9 pomodoro · bitiş ≈ 17:40".
- **Aktif görev:** zamanlayıcıda "Şimdi: …" çipi. Görev seçmeden odak başlatırsan kısa bir seçici açılır
  ("Görevsiz devam" da var). Tahmin dolunca "Bitti mi, bir pomodoro daha mı?" diye sorar.
- **Görevler bahçede:** her fidenin önünde görevin adını taşıyan küçük bir tahta tabela, çubuğunda etiket renginde bağcık.
  Fidenin üstüne gelince görev ve ekildiği saat görünür.
- **Karşılama:** ilk açılışta dil, isim (Hasan Dede seni adınla çağırır), çalışma ritmi (25/5, 50/10, 90/20), günlük
  hedef ve ilk görev. Hepsi atlanabilir.
- **İki dil:** Türkçe varsayılan, İngilizce tam (arayüz, Hasan Dede'nin bütün replikleri, tarih ve saat biçimleri).

### Hasat defteri ve veri
- **Hasat defteri:** bu hafta / bu ay / tümü; etiketlere ve görevlere göre odak süresi, günün saatleri ve en verimli saat,
  son 12 ayın ısı haritası, yarıda kalan seans oranı, seans başına kesinti ve **tahmin isabeti**
  ("Görevlerini ortalama %29 eksik tahmin ediyorsun").
- **Hasat kartı:** günün özeti tek görselde (1080×1350 PNG): bahçenin fotoğrafı, domates, odak süresi, biten görevler, seri.
- **Kesinti sayacı:** odak sırasında ⚡ düğmesi ya da `D`: iç (aklına gelen, istersen görevlere eklenir) ya da dış kesinti.
- **Yedek:** JSON yedek indir, yedekten yükle (birleştir ya da değiştir), seansları CSV olarak indir.
- **Kurulabilir ve çevrimdışı:** "Ana ekrana ekle" ile uygulama gibi açılır; internet yokken de çalışır.
- **Mini zamanlayıcı (Chrome):** başka pencerede çalışırken köşede duran küçük sayaç (`P`).

### Bahçe
- **Bahçe büyür:** toplam domates arttıkça bahçeye yeni şeyler gelir: arı kovanı (50), üçüncü yatak sırası (100), kuyu (200),
  Karabaş (350, sevilmeyi sever), sera (500). Fide yatakları dolunca bahçe kendiliğinden genişler.
- **Domates çeşitleri:** etiketli görevler farklı çeşit yetiştirir (pembe, sarı, kara, çeri); Hasat defterinde koleksiyonun görünür.
- **Mevsimler:** ilkbaharda pembe çiçekler, sonbaharda dökülen yapraklar, kışın kar. Takvime göre otomatik ya da elle.
- **Cadılar Bayramı (22 Ekim – 1 Kasım):** akşam içten yanan oyma balkabakları, yarasalar, dokununca "böö" diyen bir hayalet, Hasan Dede'ye cadı şapkası ve hasatta her fidenin dibinde küçük bir balkabağı. Ayarlar'dan kapatılabilir.
- **Tekrarlı görevler:** her gün ya da hafta içi kendiliğinden yenilenen görevler (↻).
- **Kolay silme:** satırdaki çöp kutusu (masaüstünde üzerine gelince görünür); 5 saniye içinde "Geri al".
- **Görev silinince yer açılır:** Hasan Dede o görevin fidelerini ve tabelasını söker, yatak yeniden kullanılır
  (toplanmamış domatesler günün hasadına eklenir; o an büyüyen fidenin yalnız tabelası kalkar).
- **Ses kanalları:** ortam sesi ve efektler ayrı ayrı; odakta isteğe bağlı tik-tak; odak bitiş sesi (çanlar, marimba, kuşlar).
- **Grafik kalitesi:** otomatik (yavaş cihazda kendini düşürür), yüksek, dengeli, düşük.

### Gizlilik ve veri koruması
- **Veri koruması:** ilk odaktan sonra tarayıcıdan kalıcı depolama istenir; iPhone Safari'de "Ana Ekrana Ekle" önerisi;
  iki haftadır yedek yoksa molada hatırlatma.
- **Veri yalnız cihazda:** hesap, analitik ve çerez yok; hiçbir şey sunucuya gönderilmez.
- **Hakkında ve gizlilik** sayfası; ayarlarda "X'te yaz" (geri bildirim X'ten, @ayhankorkmaz_).

### Kısayollar
`Boşluk` başlat/duraklat · `T` görevler · `N` yeni görev · `1–9` aktif görev · `D` dikkatim dağıldı · `P` mini zamanlayıcı ·
`S` geç · `R` sıfırla · `Z` zen · `F` tam ekran · `M` ses · `A` ortam sesi

### Çalıştırma ve yapı
**Yayın (Cloudflare Pages, statik):** `python3 tools/build-dist.py` → `wrangler pages deploy dist --project-name domat`.
Derleme yok. Klasörde `python3 -m http.server` çalıştırıp `http://localhost:8000` adresini aç.
**Çift tıkla açmak için:** `python3 tools/build-single.py` her şeyi gömülü tek bir `Domat.html` üretir (sunucu gerekmez;
yalnız çevrimdışı kurulum ve mini zamanlayıcı bu modda çalışmaz). `index.html` doğrudan çift tıkla açılmaz.
- `index.html`, `css/app.css`, `js/app.js`, `js/i18n.js` (bütün metinler, TR ve EN)
- `vendor/` Three.js r170 ve cannon-es, `fonts/` Fredoka ve Nunito: hepsi yerel, CDN gerekmez
- `manifest.webmanifest`, `icons/`, `sw.js` (servis çalışanı). Dosya ekleyip değiştirdikten sonra
  `python3 tools/make-sw.py` çalıştır; önbellek listesini ve sürümü yeniler.
- `tests/`: başsız Chrome testleri (`e2e`, `backup`, `stats`, `card`, `offline`, `pip`, `garden`, `faz3`, `clear`, `ambient`). Sunucu 8767'de açıkken
  `node tests/e2e.mjs` gibi çalıştırılır (`playwright-core` ve Chrome gerekir).

## Lisans
MIT · Ayhan Korkmaz · [ayhankorkmaz.com](https://ayhankorkmaz.com) · [@ayhankorkmaz_](https://x.com/ayhankorkmaz_)
