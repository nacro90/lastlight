import { describe, it, expect } from 'vitest'
import { noise1D, noise2D, fbm1D, fbm2D } from '@/core/noise'

const SEED = 1337

describe('noise1D', () => {
  it('determinist', () => {
    expect(noise1D(SEED, 12.34)).toBe(noise1D(SEED, 12.34))
  })

  it('[-1,1] araliginda kalir', () => {
    for (let x = -50; x < 50; x += 0.037) {
      const v = noise1D(SEED, x)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('surekli: kucuk adim kucuk degisim uretir', () => {
    // Sureklilik olmazsa yol yuksekliginde sicramalar olur ve arac zipla.
    const eps = 1e-3
    let maxJump = 0
    for (let x = -20; x < 20; x += 0.01) {
      maxJump = Math.max(maxJump, Math.abs(noise1D(SEED, x + eps) - noise1D(SEED, x)))
    }
    expect(maxJump).toBeLessThan(0.05)
  })

  it('duz degil: gercekten degisir', () => {
    const samples = Array.from({ length: 200 }, (_, i) => noise1D(SEED, i * 0.31))
    const min = Math.min(...samples)
    const max = Math.max(...samples)
    expect(max - min).toBeGreaterThan(0.5)
  })

  it('farkli seed farkli alan uretir', () => {
    let diff = 0
    for (let x = 0; x < 100; x += 0.5) {
      diff += Math.abs(noise1D(1, x) - noise1D(2, x))
    }
    expect(diff / 200).toBeGreaterThan(0.1)
  })
})

describe('noise2D', () => {
  it('determinist', () => {
    expect(noise2D(SEED, 3.5, -7.25)).toBe(noise2D(SEED, 3.5, -7.25))
  })

  it('[-1,1] araliginda kalir', () => {
    for (let x = -20; x < 20; x += 0.73) {
      for (let y = -20; y < 20; y += 0.73) {
        const v = noise2D(SEED, x, y)
        expect(v).toBeGreaterThanOrEqual(-1)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('iki eksende de surekli', () => {
    const eps = 1e-3
    let maxJump = 0
    for (let x = -10; x < 10; x += 0.05) {
      for (let y = -10; y < 10; y += 0.05) {
        maxJump = Math.max(
          maxJump,
          Math.abs(noise2D(SEED, x + eps, y) - noise2D(SEED, x, y)),
          Math.abs(noise2D(SEED, x, y + eps) - noise2D(SEED, x, y)),
        )
      }
    }
    expect(maxJump).toBeLessThan(0.05)
  })

  it('eksenler arasinda simetrik degil', () => {
    // n(x,y) === n(y,x) olursa arazi kosegen bir desen gosterir.
    expect(noise2D(SEED, 2.5, 9.5)).not.toBe(noise2D(SEED, 9.5, 2.5))
  })
})

describe('fbm', () => {
  it('1D determinist ve sinirli', () => {
    for (let x = -30; x < 30; x += 0.21) {
      const v = fbm1D(SEED, x, 4)
      expect(v).toBe(fbm1D(SEED, x, 4))
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('2D determinist ve sinirli', () => {
    for (let x = -10; x < 10; x += 1.1) {
      for (let y = -10; y < 10; y += 1.1) {
        const v = fbm2D(SEED, x, y, 4)
        expect(v).toBe(fbm2D(SEED, x, y, 4))
        expect(v).toBeGreaterThanOrEqual(-1)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('oktav sayisi arttikca detay artar', () => {
    const rough = (octaves: number) => {
      let total = 0
      let prev = fbm1D(SEED, 0, octaves)
      for (let x = 0.02; x < 10; x += 0.02) {
        const v = fbm1D(SEED, x, octaves)
        total += Math.abs(v - prev)
        prev = v
      }
      return total
    }
    expect(rough(5)).toBeGreaterThan(rough(1))
  })

  it('tek oktav ham gurultuye esittir', () => {
    expect(fbm1D(SEED, 4.2, 1)).toBeCloseTo(noise1D(SEED, 4.2), 10)
  })
})
