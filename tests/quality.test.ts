import { describe, it, expect } from 'vitest'
import {
  BENCHMARK,
  QUALITY,
  QUALITY_TIERS,
  createBenchmark,
  tierForFrameTime,
  type QualityTier,
} from '@/core/quality'

function feed(frames: number[]): ReturnType<typeof createBenchmark> {
  const benchmark = createBenchmark()
  for (const frameMs of frames) benchmark.add(frameMs)
  return benchmark
}

function repeat(count: number, value: number): number[] {
  return Array.from({ length: count }, () => value)
}

/** Kiyaslamayi tamamlayacak kadar kare, hepsi ayni surede. */
function fullRun(frameMs: number): number[] {
  return repeat(BENCHMARK.warmupFrames + BENCHMARK.sampleFrames, frameMs)
}

/** Karar gelene kadar kac kare gectigi; gelmezse null. */
function framesUntilDecision(frameMs: number, limit = 500): number | null {
  const benchmark = createBenchmark()
  for (let frame = 1; frame <= limit; frame++) {
    benchmark.add(frameMs)
    if (benchmark.done) return frame
  }
  return null
}

describe('kademe tanimlari', () => {
  it('uc kademe var ve hepsi tanimli', () => {
    expect(QUALITY_TIERS).toHaveLength(3)
    for (const tier of QUALITY_TIERS) expect(QUALITY[tier]).toBeDefined()
  })

  it('asagi kademe hicbir kalemde daha pahali degil', () => {
    // Bu tersine donerse "dusuk kalite" secmek isleri yavaslatiyor demektir.
    const order: QualityTier[] = ['low', 'medium', 'high']
    for (let i = 1; i < order.length; i++) {
      const lower = QUALITY[order[i - 1]!]
      const higher = QUALITY[order[i]!]
      expect(lower.maxPixelRatio).toBeLessThanOrEqual(higher.maxPixelRatio)
      expect(lower.shadowMapSize).toBeLessThanOrEqual(higher.shadowMapSize)
      expect(lower.dustScale).toBeLessThanOrEqual(higher.dustScale)
      expect(lower.scatterScale).toBeLessThanOrEqual(higher.scatterScale)
    }
  })

  it('en dusuk kademede bile sahne tam kaliyor', () => {
    // Kesilen sey cozunurluk ve yogunluk, imza gorunum degil: bloom ve
    // gokyuzu gradyani hicbir kademede kapanmiyor, serpistirme sifira
    // inmiyor, piksel orani birin altina dusmuyor.
    expect(QUALITY.low.scatterScale).toBeGreaterThan(0)
    expect(QUALITY.low.dustScale).toBeGreaterThan(0)
    expect(QUALITY.low.maxPixelRatio).toBeGreaterThanOrEqual(1)
  })

  it('olcekler makul araliklarda', () => {
    for (const tier of QUALITY_TIERS) {
      const settings = QUALITY[tier]
      expect(settings.maxPixelRatio).toBeLessThanOrEqual(2)
      expect(settings.dustScale).toBeGreaterThanOrEqual(0)
      expect(settings.dustScale).toBeLessThanOrEqual(1)
      expect(settings.scatterScale).toBeLessThanOrEqual(1)
      // Golge haritasi ikinin kuvveti olmak zorunda.
      expect(Math.log2(settings.shadowMapSize) % 1).toBe(0)
    }
  })
})

describe('kare suresinden kademe', () => {
  it('hizli makine en yuksek kademeyi aliyor', () => {
    expect(tierForFrameTime(6)).toBe('high')
    expect(tierForFrameTime(BENCHMARK.highMs - 0.1)).toBe('high')
  })

  it('orta makine orta kademeyi aliyor', () => {
    expect(tierForFrameTime(BENCHMARK.highMs + 0.1)).toBe('medium')
    expect(tierForFrameTime(BENCHMARK.mediumMs - 0.1)).toBe('medium')
  })

  it('yavas makine en dusuk kademeyi aliyor', () => {
    expect(tierForFrameTime(BENCHMARK.mediumMs + 0.1)).toBe('low')
    expect(tierForFrameTime(240)).toBe('low')
  })

  it('esikler sirali', () => {
    expect(BENCHMARK.highMs).toBeLessThan(BENCHMARK.mediumMs)
  })

  it('bozuk olcum en dusuk kademeye dusuyor', () => {
    // Olcum guvenilmezse en guvenli tarafa dusmek dogru: siyah ekran yok.
    expect(tierForFrameTime(Number.NaN)).toBe('low')
    expect(tierForFrameTime(0)).toBe('low')
    expect(tierForFrameTime(-5)).toBe('low')
  })
})

describe('kiyaslama', () => {
  it('yeterli kare gelmeden karar vermiyor', () => {
    const benchmark = feed(repeat(BENCHMARK.warmupFrames + BENCHMARK.sampleFrames - 1, 8))
    expect(benchmark.done).toBe(false)
    expect(benchmark.tier()).toBeNull()
  })

  it('yeterli kare gelince karar veriyor', () => {
    const benchmark = feed(fullRun(8))
    expect(benchmark.done).toBe(true)
    expect(benchmark.tier()).toBe('high')
  })

  it('isinma kareleri karari etkilemiyor', () => {
    // Ilk kareler shader derlemesi ve doku yuklemesi yuzunden her makinede
    // yavas; onlari saymak her makineyi dusuk kademeye atardi.
    const benchmark = feed([
      ...repeat(BENCHMARK.warmupFrames, 400),
      ...repeat(BENCHMARK.sampleFrames, 7),
    ])
    expect(benchmark.tier()).toBe('high')
  })

  it('yavas makinede karar kare sayisini beklemiyor', () => {
    // Olculdu ve tasarim hatasi cikti: karar sadece kare sayisina bagli
    // oldugunda uc kare hizinda yuz yirmi kare kirk saniye suruyor, yani
    // kademeye en cok ihtiyaci olan makine onu hic alamiyor. Karar artik
    // gecen sureye de bakiyor.
    const slowFrame = 360
    const frames = framesUntilDecision(slowFrame)
    expect(frames).not.toBeNull()
    expect(frames!).toBeLessThan(BENCHMARK.warmupFrames + BENCHMARK.sampleFrames)
    // Toplam sure de makul: birkac saniye, kirk degil.
    expect(frames! * slowFrame).toBeLessThan(9000)
  })

  it('hizli makinede tam ornek toplaniyor', () => {
    // Hizli makinede acele etmek gereksiz: kare basina bir buçuk milisaniye
    // fark eden bir karar veriyoruz, ornek ne kadar coksa o kadar iyi.
    const frames = framesUntilDecision(7)
    expect(frames).toBe(BENCHMARK.warmupFrames + BENCHMARK.sampleFrames)
  })

  it('karar hicbir zaman birkac ornekle verilmiyor', () => {
    // Ayri bir asgari ornek sayaci yok; panik esigi onu zaten garanti ediyor.
    // Esigin altindaki her kare suresinde iki bucuk saniyeye en az on ornek
    // sigiyor, ve ustundeki sureler panik yoluna gidiyor.
    const guaranteed = Math.ceil(BENCHMARK.decideAfterMs / BENCHMARK.panicMs)
    expect(guaranteed).toBeGreaterThanOrEqual(8)

    for (const frameMs of [30, 120, BENCHMARK.panicMs - 10]) {
      const frames = framesUntilDecision(frameMs)
      expect(frames).not.toBeNull()
      expect(frames! - BENCHMARK.warmupFrames).toBeGreaterThanOrEqual(guaranteed)
    }
  })

  it('sure esigi ile ornek esigi tutarli', () => {
    expect(BENCHMARK.decideAfterMs).toBeGreaterThan(0)
    expect(BENCHMARK.panicFrames).toBeGreaterThan(1)
    // Panik esigi orta kademe esiginin uzerinde olmak zorunda, yoksa normal
    // yolla "orta" cikacak bir makineyi panik yolu dusuge atiyor.
    expect(BENCHMARK.panicMs).toBeGreaterThan(BENCHMARK.mediumMs)
  })

  it('felaket kare surelerinde beklemeden dusuge iniyor', () => {
    // Ust uste birkac kare ceyrek saniyeyi asiyorsa makinenin tam kaliteyi
    // kaldirmadigi belli; ornek toplamaya devam etmek sadece o makineyi daha
    // uzun sure kotu bir deneyimde tutuyor.
    const benchmark = createBenchmark()
    for (let i = 0; i < BENCHMARK.warmupFrames; i++) benchmark.add(8)
    for (let i = 0; i < BENCHMARK.panicFrames; i++) benchmark.add(400)
    expect(benchmark.done).toBe(true)
    expect(benchmark.tier()).toBe('low')
  })

  it('tek tek yavas kareler panige sokmuyor', () => {
    // Ust uste olmayan sicramalar cop toplamadir, makine yavas degil.
    const benchmark = createBenchmark()
    for (let i = 0; i < BENCHMARK.warmupFrames; i++) benchmark.add(8)
    for (let i = 0; i < BENCHMARK.panicFrames - 1; i++) benchmark.add(400)
    expect(benchmark.done).toBe(false)
    for (let i = 0; i < BENCHMARK.sampleFrames; i++) benchmark.add(7)
    expect(benchmark.tier()).toBe('high')
  })

  it('isinma kareleri panige sokmuyor', () => {
    // Shader derlemesi ilk karelerde yuz milisaniyeleri yiyor; o kareler
    // hicbir karara girmiyor.
    const benchmark = createBenchmark()
    for (let i = 0; i < BENCHMARK.warmupFrames; i++) benchmark.add(700)
    expect(benchmark.done).toBe(false)
    for (let i = 0; i < BENCHMARK.sampleFrames; i++) benchmark.add(7)
    expect(benchmark.tier()).toBe('high')
  })

  it('tek tek sicramalar karari bozmuyor', () => {
    // Ortalama yerine ortanca kullanmanin sebebi bu: cop toplama duraklamasi
    // veya sekme degisimi tek bir karede yuz milisaniye uretebiliyor.
    const frames = fullRun(7)
    for (let i = 0; i < 8; i++) frames[BENCHMARK.warmupFrames + i * 5] = 900
    expect(feed(frames).tier()).toBe('high')
  })

  it('gercekten yavas makinede dusuk kademe cikiyor', () => {
    expect(feed(fullRun(38)).tier()).toBe('low')
  })

  it('karar bir kez veriliyor ve degismiyor', () => {
    // Kademe kilitleniyor: kare suresi dalgalandikca kademe degisirse gorunum
    // surekli atlıyor ve bu titreme her seyden kotu.
    const benchmark = createBenchmark()
    for (const frameMs of fullRun(7)) benchmark.add(frameMs)
    expect(benchmark.tier()).toBe('high')
    for (let i = 0; i < 500; i++) benchmark.add(90)
    expect(benchmark.tier()).toBe('high')
  })

  it('ayni girdi ayni kademe: karar determinist', () => {
    const frames = fullRun(15)
    expect(feed(frames).tier()).toBe(feed(frames).tier())
  })
})
