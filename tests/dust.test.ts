import { describe, it, expect } from 'vitest'
import { DUST, DUST_STRIDE, createDustField, wrapCoordinate } from '@/core/dust'
import { hashString } from '@/core/rng'

const SEED = hashString('lastlight')

describe('sarmalama', () => {
  it('sonuc her zaman kutunun icinde', () => {
    const extent = 90
    const half = extent / 2
    for (const center of [0, 137.5, -420]) {
      for (let value = -1000; value <= 1000; value += 7.3) {
        const wrapped = wrapCoordinate(value, center, extent)
        expect(wrapped).toBeGreaterThanOrEqual(center - half - 1e-9)
        expect(wrapped).toBeLessThanOrEqual(center + half + 1e-9)
      }
    }
  })

  it('kutunun icindeki deger degismiyor', () => {
    for (let value = -44; value <= 44; value += 0.5) {
      expect(wrapCoordinate(value, 0, 90)).toBeCloseTo(value, 9)
    }
  })

  it('tam bir kutu boyu kayma ayni sonucu veriyor', () => {
    const extent = 90
    for (const value of [3.5, -21, 44.9]) {
      const base = wrapCoordinate(value, 0, extent)
      for (const shift of [-3, -1, 1, 2, 7]) {
        expect(wrapCoordinate(value + shift * extent, 0, extent)).toBeCloseTo(base, 6)
      }
    }
  })

  it('merkez kaydiginda sonuc birlikte kayiyor', () => {
    expect(wrapCoordinate(10, 100, 90)).toBeCloseTo(100, 9)
    expect(wrapCoordinate(190, 100, 90)).toBeCloseTo(100, 9)
  })
})

describe('toz alani', () => {
  const field = createDustField(SEED)

  it('beklenen uzunlukta', () => {
    expect(field).toHaveLength(DUST.count * DUST_STRIDE)
  })

  it('determinist', () => {
    expect(createDustField(SEED)).toEqual(createDustField(SEED))
  })

  it('farkli seed farkli alan uretiyor', () => {
    expect(createDustField(SEED)).not.toEqual(createDustField(hashString('ankara')))
  })

  it('konumlar kutunun icinde', () => {
    for (let i = 0; i < field.length; i += DUST_STRIDE) {
      expect(Math.abs(field[i]!)).toBeLessThanOrEqual(DUST.boxLength / 2)
      expect(Math.abs(field[i + 1]!)).toBeLessThanOrEqual(DUST.boxHeight / 2)
      expect(Math.abs(field[i + 2]!)).toBeLessThanOrEqual(DUST.boxWidth / 2)
    }
  })

  it('boyutlar tanimli aralikta', () => {
    for (let i = 0; i < field.length; i += DUST_STRIDE) {
      expect(field[i + 3]!).toBeGreaterThanOrEqual(DUST.minSize)
      expect(field[i + 3]!).toBeLessThanOrEqual(DUST.maxSize)
    }
  })

  it('NaN yok', () => {
    for (const value of field) expect(Number.isFinite(value)).toBe(true)
  })

  it('dagilim kutuyu gercekten dolduruyor', () => {
    // Kumelenirse toz bulut gibi degil leke gibi duruyor.
    let minX = Infinity
    let maxX = -Infinity
    for (let i = 0; i < field.length; i += DUST_STRIDE) {
      minX = Math.min(minX, field[i]!)
      maxX = Math.max(maxX, field[i]!)
    }
    expect(maxX - minX).toBeGreaterThan(DUST.boxLength * 0.9)
  })
})
