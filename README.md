# Lastlight

Sonsuz bir akşam sürüşü. Hedef yok, skor yok, bitiş yok: güneş her zaman önde, yol her zaman devam ediyor.

**Canlı: [lastlight-beta.vercel.app](https://lastlight-beta.vercel.app)**

Sayfa açıldığında kimse bir şey sormuyor; kamera kendi kendine sürerken sekiz on iki saniyede bir kesme yapıyor. Bir tuşa dokunulduğu an kontrol sürücüye geçiyor, yirmi beş saniye dokunulmazsa sinematik mod geri devralıyor.

```bash
pnpm install
pnpm dev
```

`W A S D` veya ok tuşları sürüyor, `M` sesi kapatıp açıyor, `Esc` ayarları kapatıyor. `?seed=ankara` yazınca başka bir dünya açılıyor; aynı tohum her zaman aynı yolu veriyor.

## Ne indiriliyor

Yazı tipi dışında hiçbir şey; o da kendi sunucumuzdan ve subset alınmış, toplam 16 KB. Doku yok, model yok, ses dosyası yok. Arazi, yol, ağaçlar, araç, gökyüzü, toz ve dört katmanlı ses; hepsi çalışma anında üretiliyor. Bu bir kısıtlama olarak seçildi çünkü ters ışıkta form görünür, detay görünmez: alçak güneşte doku eklemenin görsel getirisi yok, maliyeti tam.

## İlginç dört karar

**Yol, ileri eksenin bir fonksiyonunun grafiği.** Spline yerine `s` doğrudan X ekseni. Kasıtlı bir kısıtlama ve üç şey kazandırıyor: `(s,t)` ile dünya arasındaki dönüşümün tersi kapalı formda çözülüyor, yani "spline üzerindeki en yakın nokta" problemi hiç doğmuyor; yol asla geri dönemediği için güneş her zaman önde kalıyor ve bütün atmosfer kurgusu ayakta duruyor; eğim ve eğrilik sınırları analitik olarak garanti ediliyor. Genlikler elle seçilmiyor, o sınırlardan geriye doğru türetiliyor (`src/core/road.ts`): yolu daha hareketli yapmak için sınırı değiştiriyorsun, garanti kendiliğinden korunuyor.

**Çekirdek saf.** `src/core/` içindeki hiçbir dosya three.js'i, React'i veya DOM'u tanımıyor: girdi veri, çıktı veri. Dilim üretimi gerekirse Web Worker'a taşınabilir hale geliyor, fizik test edilebilir oluyor, ve girdiyi kimin ürettiğini bilmediği için klavye ile otopilot aynı fiziği besliyor. Test edilebilir yüzey, test edilemeyen görsel katmandan net ayrılıyor: shader ve kamera estetiğine birim testi yazılmıyor, onlar tarayıcı duman testiyle ve gözle doğrulanıyor.

**Fizik sabit adımda, render arada.** Fizik 120 Hz'te koşuyor. 144 Hz ekranda kare deseni 1,1,1,0 oluyor ve o sıfır karelerde araç duruyor, kamera devam ediyor; uzaktan piksel altı, yakında görünür bir mikro titreme. Çözüm render zamanını iki fizik durumu arasında konumlandırmak. Aynı sınıftan iki tuzak daha yaşandı ve ikisi de kılavuza yazıldı: türevleri değişken kare süresinden almamak, ve kamera kelepçelerini yaydan önce uygulamak.

**Ses de prosedürel ve hıza tepki veriyor.** Rüzgar filtrelenmiş pembe gürültü, lastik bant geçiren, motor üç detune üçgen dalga, altta çok yavaş dalgalanan bir ortam pedi. Karışım kararları saf çekirdekte (`src/core/audio.ts`) ve test ediliyor; Web Audio grafı sadece o kararı düğümlere bağlıyor. Motor perdesi sahte bir vites kutusundan geliyor, çünkü sürekli bir perde eğrisi elektrikli araç gibi duyuluyor: kulak hızı vites geçişinden okuyor.

## Ölçüm

Performans bütçeleri donanımdan bağımsız sayılarla yazılı, çünkü geliştirme makinesindeki güçlü GPU yanıltıcı.

| Bütçe | Sınır | Ölçülen |
|---|---|---|
| Çizim çağrısı | < 150 | 124 |
| Üçgen | < 400k | 140k |
| Dilim üretimi | kare bütçesinin altında | 0.37 ms |

Kare başına en fazla bir arazi dilimi üretiliyor; havuz sabit kırk sekiz mesh ve vertex tamponları yerinde güncelleniyor, yani sürüş sırasında ayırma ve çöp toplama duraklaması yok.

Kalite kademesi sinematik pencerede ölçülüyor ve kilitleniyor. Ölçüm en yüksek kademede yapılıyor, sonra gerekirse aşağı iniliyor: ters yönde ölçmek yalan sonuç verir. Kesilen şey çözünürlük ve yoğunluk; bloom ve gökyüzü gradyanı hiçbir kademede kapanmıyor.

Testler: 270 birim testi (sadece saf çekirdek), 23 tarayıcı testi (Playwright). Kritik testler kasten bozulup düştükleri görüldü, yani boşa geçmiyorlar.

## Yığın

Vite, React, TypeScript, three.js, React Three Fiber, postprocessing. Testler vitest ve Playwright.

## Bilinçli olarak yok

Başka biyom, hava durumu, gün döngüsü, trafik, çarpışma, fizik motoru, kokpit görüşü, tünel, köprü, kavşak, bina, mini harita, alan derinliği, hareket bulanıklığı. Köprü ve tünel yol uzayı koridor modelini bozuyor; çarpışma huzur deneyiminde cezalandırma demek.
