import { describe, it, expect } from 'vitest'
import { hashString, hashInts, mulberry32, rngFrom } from '@/core/rng'

describe('hashString', () => {
  it('ayni girdi icin ayni degeri verir', () => {
    expect(hashString('lastlight')).toBe(hashString('lastlight'))
  })

  it('farkli girdiler icin farkli deger verir', () => {
    expect(hashString('lastlight')).not.toBe(hashString('lastligh'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  it('bos dizgeyi kabul eder', () => {
    expect(Number.isFinite(hashString(''))).toBe(true)
  })

  it('isaretsiz 32 bit tamsayi dondurur', () => {
    for (const s of ['', 'a', 'lastlight', 'çok uzun bir seed dizgesi 12345']) {
      const h = hashString(s)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })
})

describe('hashInts', () => {
  it('determinist', () => {
    expect(hashInts(7, 42, -3)).toBe(hashInts(7, 42, -3))
  })

  it('argument sirasina duyarli', () => {
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1))
  })

  it('komsu girdileri dagitir', () => {
    // Kotu bir hash burada bitisik degerler uretir ve arazi serpistirmesi
    // gorunur sekilde duzenli hale gelir.
    const a = hashInts(0, 0)
    const b = hashInts(0, 1)
    const c = hashInts(1, 0)
    expect(Math.abs(a - b)).toBeGreaterThan(1000)
    expect(Math.abs(a - c)).toBeGreaterThan(1000)
    expect(Math.abs(b - c)).toBeGreaterThan(1000)
  })
})

describe('mulberry32', () => {
  it('ayni seed ayni diziyi verir', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    for (let i = 0; i < 32; i++) expect(a()).toBe(b())
  })

  it('farkli seed farkli dizi verir', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const first = Array.from({ length: 8 }, () => a())
    const second = Array.from({ length: 8 }, () => b())
    expect(first).not.toEqual(second)
  })

  it('cikti [0,1) araliginda', () => {
    const r = mulberry32(99)
    for (let i = 0; i < 10000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('kabaca duzgun dagilir', () => {
    const r = mulberry32(2026)
    const buckets = new Array<number>(10).fill(0)
    const n = 100_000
    let sum = 0
    for (let i = 0; i < n; i++) {
      const v = r()
      sum += v
      buckets[Math.floor(v * 10)]! += 1
    }
    expect(sum / n).toBeCloseTo(0.5, 2)
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 * 0.9)
      expect(count).toBeLessThan(n / 10 * 1.1)
    }
  })
})

describe('rngFrom', () => {
  it('koordinatlardan durumsuz ve determinist uretec kurar', () => {
    const a = rngFrom(3, 17)
    const b = rngFrom(3, 17)
    expect(a()).toBe(b())
  })

  it('farkli koordinat farkli akis verir', () => {
    expect(rngFrom(3, 17)()).not.toBe(rngFrom(3, 18)())
  })
})
