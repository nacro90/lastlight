/**
 * Kalite kademesi ve makine kiyaslamasi.
 *
 * Portfolyo linki her makinede acılıyor: masaustunde ayrik ekran karti,
 * dizustunde entegre, telefonda baska bir dunya. Sabit ayar ikisinden birini
 * mahvediyor; ya guclu makinede gereksiz ucuz duruyor ya zayif makinede
 * slayt gosterisine iniyor.
 *
 * Karar sinematik pencerede veriliyor, cunku o pencerede kullanici zaten
 * bekliyor ve kimse bir sey kaybetmiyor. Karar bir kez veriliyor ve
 * kilitleniyor: kare suresi dalgalandikca kademe degisirse gorunum surekli
 * atliyor, ve o titreme dusuk cozunurlukten cok daha kotu.
 *
 * Kesilen sey cozunurluk ve yogunluk, imza gorunum degil. En dusuk kademede
 * de gokyuzu gradyani, bloom ve serpistirme duruyor; bloom'u kapatmak gunesi
 * olduruyor ve gunes olmadan bu sahnenin kimligi kalmiyor.
 */

export type QualityTier = 'low' | 'medium' | 'high'

export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high']

export interface QualitySettings {
  /**
   * Piksel orani ust siniri. En buyuk tek performans kolu bu: yogun ekranda
   * devicePixelRatio 3 olabiliyor ve bu dokuz kat piksel demek.
   */
  maxPixelRatio: number
  /** Golge haritasi kenar uzunlugu; ikinin kuvveti olmak zorunda. */
  shadowMapSize: number
  /** Toz zerresi sayisi carpani. */
  dustScale: number
  /** Agac, cali ve tas yogunlugu carpani. */
  scatterScale: number
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  low: {
    maxPixelRatio: 1,
    shadowMapSize: 1024,
    dustScale: 0.3,
    scatterScale: 0.55,
  },
  medium: {
    maxPixelRatio: 1.25,
    shadowMapSize: 2048,
    dustScale: 0.6,
    scatterScale: 0.8,
  },
  high: {
    maxPixelRatio: 1.5,
    shadowMapSize: 4096,
    dustScale: 1,
    scatterScale: 1,
  },
}

export const BENCHMARK = {
  /**
   * Ilk kareler her makinede yavas: shader derlemesi, tampon ayirma, ilk
   * dilimler. Bunlari saymak her makineyi dusuk kademeye atardi. Sayi kucuk
   * tutuluyor cunku isinma birkac kare suruyor, ve yavas makinede her kare
   * ucyuz milisaniye demek.
   */
  warmupFrames: 4,
  /** Hedef ornek sayisi (60 Hz'te ~1.5 saniye). */
  sampleFrames: 90,
  /**
   * Ornekleme bu kadar surdukten sonra elde olanla karar veriliyor.
   *
   * Sadece kare sayisina bakmak olculdu ve tasarim hatasi cikti: uc kare
   * hizinda yuz yirmi kare kirk saniye suruyor, yani kademeye en cok ihtiyaci
   * olan makine karari hic almiyor. Yavas makinede az ornekle karar vermek
   * sorun degil, cunku o makinede sonuc zaten belli.
   */
  decideAfterMs: 2500,
  /**
   * Felaket kare suresi. Ust uste bu kadar kare bu esigi asiyorsa makinenin tam
   * kaliteyi kaldirmadigi bellidir ve ornek toplamaya devam etmek o makineyi
   * sadece daha uzun sure kotu bir deneyimde tutuyor.
   *
   * Olculdu: yazilim rasterizer'da kare suresi saniyelere cikiyor ve normal yol
   * (asgari sekiz ornek) karari yetmis saniyeye tasiyor. Esik orta kademe
   * esiginin cok uzerinde, yani normal yolla "orta" cikacak bir makine buraya
   * dusmuyor.
   */
  panicMs: 250,
  panicFrames: 4,
  /** Ortanca kare suresi bunun altindaysa en yuksek kademe. */
  highMs: 13,
  /** Ortanca kare suresi bunun altindaysa orta kademe, ustundeyse en dusuk. */
  mediumMs: 20,
} as const

/**
 * Ortanca kare suresinden kademe. Bozuk veya anlamsiz olcum en dusuk kademeye
 * dusuyor: guvenilmez olcumde iyimser davranmak siyah ekran riski demek.
 */
export function tierForFrameTime(medianMs: number): QualityTier {
  if (!Number.isFinite(medianMs) || medianMs <= 0) return 'low'
  if (medianMs < BENCHMARK.highMs) return 'high'
  if (medianMs < BENCHMARK.mediumMs) return 'medium'
  return 'low'
}

export interface Benchmark {
  add(frameMs: number): void
  readonly done: boolean
  /**
   * Karar panik yolundan mi geldi. Uygulama tarafi bu ayrimi kullaniyor: normal
   * karar sinematik pencerede uygulanmayi bekleyebilir, panik karari beklemez.
   * O makinede beklemek kotu deneyimi uzatmak demek.
   */
  readonly urgent: boolean
  /** Karar hazir degilse null. Hazir olduktan sonra hep ayni degeri veriyor. */
  tier(): QualityTier | null
}

/**
 * Ortalama degil ortanca kullaniliyor. Cop toplama duraklamasi veya sekme
 * degisimi tek bir karede yuz milisaniye uretebiliyor ve ortalama bunu
 * yutmuyor; ortanca birkac sicramayi hic gormuyor.
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  if (sorted.length === 0) return Number.NaN
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function createBenchmark(): Benchmark {
  const samples: number[] = []
  let warmup = 0
  let elapsedMs = 0
  let panicRun = 0
  let decided: QualityTier | null = null
  let panicked = false

  return {
    add(frameMs: number): void {
      if (decided !== null) return
      if (warmup < BENCHMARK.warmupFrames) {
        warmup++
        return
      }

      samples.push(frameMs)
      // Gecen sure kare surelerinin toplami; ayri bir saat gerekmiyor ve
      // fonksiyon saf kaliyor.
      elapsedMs += frameMs

      // Panik yolu isinmadan sonra basliyor: shader derlemesi ilk karelerde
      // yuz milisaniyeleri yiyor ve o kareler hicbir karara girmiyor.
      panicRun = frameMs >= BENCHMARK.panicMs ? panicRun + 1 : 0
      if (panicRun >= BENCHMARK.panicFrames) {
        decided = 'low'
        panicked = true
        return
      }

      // Asgari ornek sayisi diye ayri bir sayac yok, cunku panik esigi onu
      // zaten garanti ediyor: esigin altindaki her kare suresinde iki bucuk
      // saniyeye en az on ornek sigiyor.
      const enough = samples.length >= BENCHMARK.sampleFrames
      const timedOut = elapsedMs >= BENCHMARK.decideAfterMs
      if (enough || timedOut) {
        decided = tierForFrameTime(median(samples))
      }
    },

    get done(): boolean {
      return decided !== null
    },

    get urgent(): boolean {
      return panicked
    },

    tier(): QualityTier | null {
      return decided
    },
  }
}
