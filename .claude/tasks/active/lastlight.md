# Lastlight

**Status:** active
**Created:** 2026-07-31
**Budget:** 3 gün (hafta sonu yoğun)
**Tags:** 3d, webgl, r3f, procedural, portfolio

---

## Amaç

Portfolyo vitrini olarak paylaşılabilecek, hedefsiz sürüşe dayalı, tek oturuşta beş dakika huzur veren 3D web deneyimi. slowroads.io ile aynı ailede ama klon olarak okunmayacak: ayrışma sanat yönetimi, sinematik açılış ve teknik karar kalitesi üzerinden kuruluyor, içerik hacmi üzerinden değil.

**Başarı ölçütü:** linki paylaşınca insanın üç saniyede yakalanması, telefonda da çalışması, ve kaynağa bakan birinin "bunu düşünen biri yapmış" demesi.

## Brainstorm Outcome (2026-07-31)

**Seçilen yaklaşım:** Sonsuz altın saat estetiği, Vite + React + R3F, kendi arcade fiziği, prosedürel her şey (geometri ve ses dahil), sıfır indirilen asset.

**Estetik yön:** ufka gömülü güneş, uzun gölgeler, sıcak sis, toz zerreleri, bloom.
Sahne paleti: `#F2A65A` `#E4572E` `#6C4A8F` `#1B1033`

## Kilitlenen kararlar

Aşağıdaki on iki karar sorgulanarak alındı ve kapalı. Uygulama sırasında bunlara dönülmeyecek.

1. **Gölge sisle saklanıyor.** Tek directional light, tek shadow map, araç çevresinde yaklaşık 120 m dar frustum. Sis mesafesi frustum kenarından daha yakın, böylece gölge kesme çizgisi hiç görünmüyor. Cascaded shadow map yazılmıyor. Bedeli: berrak uzak manzara yok, 300-400 m'de sıcak sis duvarı var. Bu bir kayıp değil, hem drama hem LOD bahanesi.
2. **Dünya yol uzayında üretiliyor.** Her arazi vertex'i `(s, t)` ile tanımlı: `s` yol boyunca mesafe, `t` yandan sapma. Yükseklik `t` küçükken yol yüksekliğine, büyüdükçe gürültüye smoothstep ile karışıyor. Bu, "en yakın spline noktası" problemini tamamen ortadan kaldırıyor, LOD'u ve streaming'i bedavaya veriyor. Koridor iki yana 250 m. Açık dünya yok, özgürlük hissi yeterli.
3. **Üretim ana thread'de, üç disiplinle.** Amortisman (kare başına en fazla bir dilim, dilim 25 m), havuzlama (sabit 40 mesh, halka tampon, vertex tamponu yerinde güncelleniyor, sıfır tahsis), saflık (üretim fonksiyonu three.js tanımıyor). Worker'a geçiş mekanik bir iş olarak kapıda bekliyor.
4. **Sıfır doku, sıfır indirilen model.** Prosedürel geometri ve vertex renkleri. Gerekçe: ters ışıkta form görünür detay görünmez, asset boru hattı yarım gün yer, ve küçük bundle ilk boyanmayı kurtarır. Araç da prosedürel, ama ayrı bileşen arkasında (sonra GLB takılabilir).
5. **Mobilde oyun değil sinematik.** Dokunmatik cihazda araç kendi sürüyor, parmak kamerayı hafifçe döndürüyor, kalite profili düşük. Auto-drive zaten yazıldığı için maliyeti sıfıra yakın.
6. **Bütün ses prosedürel, tek byte inmiyor.** Web Audio ile rüzgar, lastik, motor, ortam pedi. Açılışta kapı yok: sinematik sessiz başlıyor, ilk etkileşimde ses iki saniyede süzülüyor. Ses ikonu sabit duruyor, nabız atmıyor.
7. **Kamera üç parçalı.** Sinematik mod (dört çerçeveleme, 8-10 sn'de yumuşak kesme), devir teslim (tuşa dokununca 0.6 sn'de takip kamerasına), boşta kalma dönüşü (25 sn dokunulmazsa sinematik geri alıyor). Takip kamerası yaylı, ileri bakış kaymalı, hıza bağlı FOV. Kamera sarsıntısı yok, kokpit görüşü yok.
8. **Kalite kademesi sinematik pencerede ölçülüp kilitleniyor.** İlk üç saniyede kare süresi ortalaması alınıyor, kademe seçiliyor, oyuncu kontrolü almadan sahne ona göre ayarlanmış oluyor. Oyun ortasında dinamik değişim yok (pop görünür olur). Seçim `localStorage`'da, ayarlardan elle geçersiz kılınabiliyor.
9. **Test: saf çekirdekte gerçek TDD, görsel katmanda duman testi.** Shader ve estetiğe test yazılmıyor; onun yerine Playwright duman testi ve ekran görüntüsüyle gözle doğrulama.
10. **Arayüz gün batımıyla yarışmıyor.** Bütün arayüz alt bantta, gökyüzü ve ufuk temiz. Sürerken ekranda sadece hız var. Mesafe sayacı ayarlar panelinde. Sinematik moddayken HUD tamamen yok, sadece ses ikonu. Arayüzde renk yok: kırık beyaz, düşük opaklık, yumuşak gölge.
11. **İsim Lastlight.** Alt satır: "an endless evening drive". Açılışta bir kere görünüp soluyor.
12. **Depo yerelde, README çekirdek kapsamda.** Conventional commit'ler, ama push/tag yok (kullanıcı onayına bağlı). Deploy Vercel statik build. README dört ilginç kararı anlatıyor, çünkü demo üç saniye etkiler, gerekçe ikna eder.

## Mimari

### Dosya düzeni

```
src/
  core/            saf, three.js bilmez, %100 test edilir
    rng.ts         mulberry32, seed'li deterministik PRNG
    noise.ts       deterministik value noise + fBm
    road.ts        sampleRoad(seed, s) -> { pos, tangent, normal, banking, curvature, grade }
    terrain.ts     buildSlice(seed, s0, s1, res) -> { positions, normals, colors, indices }
    vehicle.ts     step(state, input, dt) -> state
    sliceManager.ts  hangi dilim hangi havuz yuvasında, geri dönüşüm mantığı
    quality.ts     frameTimeAvg -> tier
    types.ts
  scene/           three / R3F katmanı
    World.tsx      dilim havuzu, attribute yerinde güncelleme
    RoadRibbon.tsx yol yüzeyi, kenar çizgileri, banket
    Scatter.tsx    instanced ağaç / çalı / taş, t eksenine bağlı LOD
    Atmosphere.tsx gökyüzü, sis, güneş, toz zerreleri
    Lighting.tsx   directional light, shadow frustumu aracı takip ediyor
    Effects.tsx    ACES tone mapping, bloom (yarım çözünürlük), vinyet, grain
    CarModel.tsx   prosedürel araç, sahte gövde yalpası
    CameraRig.tsx  chase + cinematic + geçiş mantığı
  input/
    inputSource.ts DriveInput arayüzü (throttle, brake, steer)
    keyboard.ts    klavye kaynağı
    autopilot.ts   sinematik/mobil kaynağı, aynı arayüz
  audio/
    graph.ts       AudioContext, master, unlock
    layers.ts      wind, tires, engine, pad
  ui/
    Hud.tsx        hız (tabular), ses ikonu, ayar ikonu
    TitleCard.tsx  Lastlight açılış kartı
    Settings.tsx   in-world liste, modal değil, dünya arkada akmaya devam ediyor
    tokens.css     tasarım token'ları
  state/
    store.ts       zustand, transient (React her karede render etmiyor)
tests/             vitest, core/* birim testleri
e2e/               playwright duman testi
```

### Veri akışı

```
seed ──> road.sampleRoad(s) ──┐
                              ├──> terrain.buildSlice(s0,s1) ──> World (havuz yuvası, attribute update)
noise ────────────────────────┘

InputSource (klavye | autopilot) ──> vehicle.step(state, input, dt) ──> store (transient)
                                                                          ├──> CameraRig
                                                                          ├──> CarModel
                                                                          ├──> audio.layers (hız, devir)
                                                                          └──> Hud (8 Hz throttle)
```

**Kritik perf detayı:** hız gibi kare başına değişen değerler React state'ine yazılmayacak. Store transient güncelleniyor, HUD saniyede sekiz kez DOM'a yazıyor. Kare başına reconciliation olursa 60fps ölür.

## Sanat yönetimi

### Palet

Sahne (ışıktan geliyor, malzemeden değil):

| Token | Değer | Kullanım |
|---|---|---|
| `--sun` | `#F2A65A` | güneş diski, kenar ışığı |
| `--ember` | `#E4572E` | ufka yakın gökyüzü, sis yakını |
| `--dusk` | `#6C4A8F` | zenit geçişi, gölge içi |
| `--night` | `#1B1033` | zenit, uzak kütleler |
| `--ink` | `#0E0A16` | siluetler, araç gövdesi |
| `--paper` | `#F5EFE6` | arayüz metni (nötr, sahneye karşı) |

Arayüzde sıcak renk kullanılmıyor. Sahne zaten turuncu; arayüz de turuncu olursa ikisi birbirini yiyor. Nötr arayüz sıcak sahneyi güçlendiriyor.

### Tipografi

İki rol, iki gerekçe. İkisi de self-hosted woff2 subset, toplam 25 KB altı.

**Instrument Serif** sadece açılış kartında, tam olarak bir kez. Gerekçesi editoryal değil sinematik: bu bir film başlık kartı. Malick tonundaki altın saat filmlerinin sessiz serif başlığı. Sayfanın geri kalanında hiç görünmüyor, o yüzden "serif display" klişesine düşmüyor.

**Archivo** bütün arayüz metni ve rakamlar. Seçim sebebi doğrudan konunun dünyasından: Archivo Amerikan tabela (signage) gotiklerinden türüyor, yani yolun kendi harf dili. Rakamlar **tabular** kullanılacak, bu pazarlık konusu değil: hız 111'den 100'e düşerken rakamlar yatay zıplarsa o titreme bütün cilayı bozar.

Ölçek: hız 56px/300 ağırlık, birim etiketi 11px/500 uppercase 0.14em tracking, ayar satırları 14px/400.

### Signature

Arayüz sahnenin üstünde çıkartma gibi durmuyor, ışığın içine kazınmış gibi duruyor. Birim etiketleri ve ince ayırıcılar `mix-blend-mode` ile arkadaki sıcaklığı alıyor. Ama hız rakamı ve ayar metinleri düz `--paper` artı yumuşak gölge kalıyor, çünkü okunurluk blend moduna emanet edilemez. Yani risk bir yerde alınıyor, kritik metin korunuyor.

Ayarlar bir modal değil. Dünya arkada akmaya devam ederken alt bantta bir liste açılıyor. Hem daha ucuz hem daha az kesintili; deneyim hiç durmuyor.

### Erişilebilirlik (pazarlık konusu değil)

- `prefers-reduced-motion`: sinematik kesmeler yumuşak kaydırmaya iniyor, arayüz geçişleri kapanıyor.
- Ayarlar tamamen klavyeyle gezilebilir, odak halkaları görünür, Esc kapatıyor.
- İkonların erişilebilir etiketi var, ses durumu `aria-pressed` ile bildiriliyor.
- Alt banttaki metin, arkasındaki en açık sahne değerine karşı bile 4.5:1 kontrastı tutuyor (gölge katmanı bunu garanti ediyor).
- Klavye kontrolleri açılışta bir kez gösteriliyor, kalıcı yer kaplamıyor.

## Ses mimarisi

Dört katman, hepsi osilatör ve gürültü, sıfır dosya:

| Katman | Yapı | Modülasyon |
|---|---|---|
| Rüzgar | beyaz gürültü + alçak geçiren | kesim frekansı ve kazanç hıza bağlı |
| Lastik | pembe gürültü + bant geçiren | hıza bağlı kazanç, zemine bağlı parlaklık |
| Motor | 3 detune testere dişi + alçak geçiren | perde devire bağlı, gaz kazancı |
| Ortam pedi | 3 sinüs beşli aralıkta | çok yavaş LFO, kazanç ve filtre |

Kilit açma: `AudioContext` suspended başlıyor, ilk `pointerdown` veya `keydown` ile resume ediliyor, master kazanç 2 sn'de rampa ile yükseliyor.

**Kaçış kapısı:** ped bir saat sonunda cılız duyulursa tamamen atılıyor. Rüzgar ve lastik kalıyor, bu da meşru bir estetik. Rüzgar ve lastik prosedürel olmak zorunda çünkü hıza tepki vermeleri gerekiyor.

## Performans bütçesi

**Hedef:** 1080p, orta seviye entegre GPU, 60fps. Geliştirme makinesindeki RTX 3060 yanıltıcı, o yüzden bütçeler sayı olarak yazılı ve geliştirme HUD'unda sürekli görünür.

| Bütçe | Değer |
|---|---|
| Çizim çağrısı | < 150 |
| Üçgen | < 400k |
| Kare süresi | < 16.6 ms (hedef), < 20 ms (kabul) |
| Piksel oranı | masaüstü ≤ 1.5, mobil = 1.0 |
| Bloom çözünürlüğü | yarım |
| Dilim | 25 m, havuzda 40 tane (1 km koridor) |
| İlk boyanma | < 1.5 s |

Kademeler:

| | Yüksek | Orta | Düşük / mobil |
|---|---|---|---|
| Sis (yakın/uzak) | 60 / 380 m | 50 / 300 m | 40 / 220 m |
| Gölge haritası | 2048 | 1024 | kapalı |
| Bitki yoğunluğu | %100 | %55 | %30 |
| Post zinciri | bloom + vinyet + grain | bloom + vinyet | bloom |
| Piksel oranı | 1.5 | 1.25 | 1.0 |

Ölçüm: Brave üzerinden `web-perf`, CPU 4x yavaşlatma ile zayıf cihaz taklidi. GPU taklit edilemiyor, o yüzden GPU bütçesi muhafazakar.

## Test stratejisi

**Test önce yazılacak (saf çekirdek):**

- `rng`: aynı seed aynı diziyi veriyor, dağılım düzgün.
- `road`: determinizm; eğrilik yarıçapı koridor genişliğinin üstünde (kendiyle çakışma yok); teğet sürekliliği kopmuyor (C1); eğim %8'i geçmiyor.
- `terrain`: vertex sayısı sabit (havuzlama buna bağlı); `t -> 0` iken yükseklik yol yüksekliğine yakınsıyor; **komşu dilim dikişi birebir aynı** (N'in son satırı = N+1'in ilk satırı).
- `vehicle`: girdisiz araç yavaşlayıp duruyor ve durmuş kalıyor; determinist; hız üst sınırı; `dt` bağımsızlığı (iki yarım adım ≈ bir tam adım).
- `sliceManager`: ilerlerken doğru dilim geri dönüşüyor, önde asla boşluk yok, havuz kapasitesi aşılmıyor.
- `quality`: kare süresinden kademe seçimi.

**Test yazılmayacak:** shader, malzeme, kamera estetiği, ses tınısı.

**Duman testi (Playwright):** sayfa açılıyor, canvas var, WebGL bağlamı kurulmuş, konsol temiz, ekran görüntüsü alınıyor. Bunun tek işi var ve değerli: siyah ekran deploy etmemek.

## Kesme listesi (tartışmaya kapalı)

Başka biyom, hava durumu, gün döngüsü, trafik, diğer araçlar, çarpışma, fizik motoru, kokpit görüşü, tünel, köprü, kavşak, bina, yerleşim, araç seçimi, kayıt, ilerleme, başarım, çok oyunculu, müzik dosyası, dokunmatik sürüş, SSAO, alan derinliği, hareket bulanıklığı, ekran uzayı yansıması, mini harita, pusula, vites göstergesi.

İki savunma: **köprü ve tünel** yol uzayı koridor modelini bozuyor (şeridin altını oymak parametrizasyonu kırıyor), yarım gün ve mimari kirlilik. **Çarpışma** huzur deneyiminde cezalandırma demek, projenin duygusuna doğrudan saldırı; ağaçların içinden geçiyoruz.

## Vakit kalırsa (bu sırayla)

1. Fotoğraf modu (simülasyon duraklıyor, kamera serbest, HUD gizli, PNG indirme)
2. Yol kenarı çeşitliliği (çit, direk, tabela)
3. Hafif yağmur varyantı
4. Gamepad desteği

## Tasks

### Gün 1: iskelet

- [x] Vite + React + TS + R3F + drei + postprocessing + zustand + vitest kurulumu
- [x] `core/rng` testleri, sonra implementasyon
- [x] `core/noise` testleri, sonra implementasyon
- [x] `core/math` testleri, sonra implementasyon (planda yoktu, paylaşılan yardımcılar gerekti)
- [x] `core/road` testleri (determinizm, eğrilik, süreklilik, eğim), sonra implementasyon
- [x] `core/terrain` testleri (sabit vertex, yol yakınsaması, dikiş), sonra implementasyon
- [x] `core/sliceManager` testleri, sonra implementasyon
- [x] `core/vehicle` testleri (durma, determinizm, hız sınırı, dt bağımsızlığı), sonra implementasyon
- [x] `core/loop` sabit adım biriktiricisi (planda yoktu, `dt` bağımsızlığının gerçek çözümü)
- [x] `core/autopilot` testleri, sonra implementasyon (Gün 2'den öne alındı, fizik doğrulamasını da yapıyor)
- [x] `input/keyboard` klavye kaynağı
- [x] `scene/World` havuz ve attribute yerinde güncelleme
- [x] Yol yüzeyi ayrı mesh yerine arazinin kendisi (kolon çapaları yol kenarına birebir denk)
- [x] Geliştirme HUD'u (kare süresi, çizim çağrısı, üçgen, mod, mesafe)
- [x] Palet doğrulaması: kendi gradyan gökyüzü kubbesi, sis, AgX tone mapping, bloom eşiği
- [x] Playwright kurulumu ve 12 duman testi (Gün 3'ten öne alındı)
- [x] `scene/DebugBridge` ve elle çağrılan teşhis aracı (planda yoktu, ihtiyaç doğdu)
- [x] Proje `CLAUDE.md`: mimari kuralı, test kuralları, bütçeler, bilinen tuzaklar
- [x] **Kanıt:** 124 birim testi + 12 e2e testi yeşil, tip kontrolü temiz, ekran görüntüsü alındı

### Gün 1'de bulunan ve düzeltilen kusurlar

- **Üçgen sarım yönü ters** (`a, c, b`): arazi içi dışına dönmüş, yukarıdan bakınca zeminin içinden gökyüzü görünüyordu. Sarım testi eklendi.
- **`gl.info` post-processing ile yanlış okunuyordu**: `autoReset` kapatılmadan sadece zincirin son tam ekran geçişi ölçülüyordu (1 çizim, 2 üçgen).
- **Pozlama patlamıştı**: fiziksel gökyüzü modeli + düşük bloom eşiği ekranı sütbeyaz yapıyordu. Kendi gradyan kubbemiz yazıldı, bloom eşiği 1.05'e çıkarıldı, tampon yarım float yapıldı.
- **`dt` bağımsızlığı**: yay integrali ve adım ortası dönme oranı eklendi, ölçüt göreli hale getirildi, sabit adım biriktiricisi yazıldı.
- **e2e kırılganlığı**: sabit süre beklemek yerine koşula bekleme.

### Gün 2: sanat yönetimi

- [ ] `scene/Atmosphere`: gökyüzü gradyanı, güneş diski, sise oturtulmuş renk, toz zerreleri
- [ ] `scene/Lighting`: alçak açı directional, aracı takip eden dar shadow frustumu, sis mesafesi kalibrasyonu
- [ ] `scene/Effects`: ACES tone mapping, yarım çözünürlük bloom, vinyet, film grain
- [ ] `scene/Scatter`: instanced ağaç/çalı/taş, `t` eksenine bağlı LOD, sise karışma
- [ ] `scene/CarModel`: prosedürel araç, sahte gövde yalpası, tekerlek dönüşü
- [ ] `scene/CameraRig`: yaylı takip, ileri bakış, hıza bağlı FOV
- [ ] `input/autopilot` + sinematik çerçevelemeler ve kesmeler
- [ ] Devir teslim (0.6 sn) ve 25 sn boşta kalma dönüşü
- [ ] **Kanıt:** ekran görüntüleri mood board ile yan yana, çizim çağrısı bütçe içinde

### Gün 3: cila ve kanıt

- [ ] `audio/graph` + kilit açma rampası
- [ ] `audio/layers`: rüzgar, lastik, motor, ped (ped için kaçış kapısı açık)
- [ ] Font subset'leri, `ui/tokens.css`
- [ ] `ui/TitleCard`, `ui/Hud` (tabular hız, 8 Hz throttle), `ui/Settings` (in-world liste)
- [ ] Erişilebilirlik geçişi: reduced motion, klavye gezinme, odak halkaları, aria, kontrast
- [ ] `core/quality` + sinematik pencerede kıyaslama ve kademe kilitleme
- [ ] Mobil sinematik mod, dokunmatik algılama, düşük kademe
- [ ] Playwright duman testi
- [ ] `web-perf` profillemesi (Brave, CPU 4x), bulgulara göre düzeltme
- [ ] `web-design-guidelines` ve `impeccable` geçişi
- [ ] README: dört ilginç karar, üç dört paragraf
- [ ] İki aşamalı inceleme: spec-reviewer, sonra code-reviewer. Bulgular kullanıcıya sunulacak, düzeltme kararı kullanıcının.
- [ ] Conventional commit'ler. **Push ve tag yok**, kullanıcı onayı bekleniyor.

## Kabul kriterleri (kanıt gerekli)

1. `pnpm test` yeşil, saf çekirdek kapsamı tam.
2. Playwright duman testi geçiyor, ekran görüntüsü ekli.
3. `web-perf` raporu: CPU 4x yavaşlatmada kare süresi kabul eşiğinin altında, çizim çağrısı < 150.
4. Konsolda hata ve uyarı yok.
5. Dokunmatik cihaz taklidinde sinematik mod çalışıyor, sürüş kontrolü görünmüyor.
6. `prefers-reduced-motion` açıkken kesmeler yumuşuyor.
7. Ayarlar paneli sadece klavyeyle gezilebiliyor ve kapanabiliyor.
8. README dört kararı açıklıyor.

## Riskler ve kaçış kapıları

| Risk | Kaçış kapısı |
|---|---|
| Dilim üretimi ana thread'de takılma yapıyor | Üretim saf, Worker'a taşımak mekanik |
| Arcade fizik yavan hissettiriyor | Fizik arayüz arkasında, Rapier'a geçiş kapıda |
| Prosedürel ped cılız duyuluyor | Pedi at, rüzgar ve lastikle kal |
| Palet ekranda mood board gibi durmuyor | Gün 1 sonunda 45 dk erken doğrulama, yön düzeltme vakti var |
| Zaman yetişmiyor | Vakit kalırsa listesi zaten çekirdek dışında; Gün 3'te sırayla README ve inceleme korunur, geri kalan kesilir |
