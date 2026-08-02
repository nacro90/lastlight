import { describe, it, expect } from 'vitest'
import { CLOUD, cloudCoverage } from '@/core/sky'

/** Kubbeyi tarayan bakis yonleri: yukseklik ve azimut ile. */
function direction(elevation: number, azimuth: number): [number, number, number] {
  const horizontal = Math.cos(elevation)
  return [horizontal * Math.cos(azimuth), Math.sin(elevation), horizontal * Math.sin(azimuth)]
}

function sample(step = 0.06): number[] {
  const values: number[] = []
  for (let elevation = -0.4; elevation < 1.5; elevation += step) {
    for (let azimuth = -Math.PI; azimuth < Math.PI; azimuth += step * 2) {
      values.push(cloudCoverage(direction(elevation, azimuth)))
    }
  }
  return values
}

describe('bulut bandi olculeri', () => {
  it('bant yalnizca ufka yakin bolgede', () => {
    expect(CLOUD.topElevation).toBeGreaterThan(CLOUD.bottomElevation)
    // Yaklasik yirmi derecenin ustunde bulut yok: yukarisi temiz gokyuzu
    // kalmak zorunda, yoksa altin saat kapali havaya donuyor.
    expect(CLOUD.topElevation).toBeLessThan(0.4)
  })

  it('yogunluk makul aralikta', () => {
    expect(CLOUD.opacity).toBeGreaterThan(0)
    expect(CLOUD.opacity).toBeLessThanOrEqual(1)
  })
})

describe('bulut kaplamasi', () => {
  it('deger her zaman [0,1] araliginda ve sonlu', () => {
    for (const value of sample()) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('ufkun altinda bulut yok', () => {
    for (let elevation = -0.6; elevation < -0.01; elevation += 0.05) {
      for (let azimuth = -3; azimuth < 3; azimuth += 0.3) {
        expect(cloudCoverage(direction(elevation, azimuth))).toBe(0)
      }
    }
  })

  it('yukarida bulut yok', () => {
    for (let elevation = CLOUD.topElevation + 0.02; elevation < 1.5; elevation += 0.05) {
      for (let azimuth = -3; azimuth < 3; azimuth += 0.3) {
        expect(cloudCoverage(direction(elevation, azimuth))).toBe(0)
      }
    }
  })

  it('bant icinde gercekten bulut var', () => {
    const middle = (CLOUD.bottomElevation + CLOUD.topElevation) / 2
    let covered = 0
    let total = 0
    for (let azimuth = -Math.PI; azimuth < Math.PI; azimuth += 0.02) {
      total++
      if (cloudCoverage(direction(middle, azimuth)) > 0.5) covered++
    }
    // Ne bos ne kapali: seyrek serit deseni.
    const fraction = covered / total
    expect(fraction).toBeGreaterThan(0.1)
    expect(fraction).toBeLessThan(0.75)
  })

  it('azimutla degisiyor: halka degil serit', () => {
    // Sadece yukseklige bagli olsa gokyuzunde tam bir halka olusuyor ve bu
    // dogal durmuyor.
    const middle = (CLOUD.bottomElevation + CLOUD.topElevation) / 2
    const values = []
    for (let azimuth = -Math.PI; azimuth < Math.PI; azimuth += 0.05) {
      values.push(cloudCoverage(direction(middle, azimuth)))
    }
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.4)
  })

  it('determinist', () => {
    const view = direction(0.1, 0.7)
    expect(cloudCoverage(view)).toBe(cloudCoverage(view))
  })

  it('kenarlarda yumusak: sert kesme yok', () => {
    // Bant sinirinda ani bir kesme cizgisi gorunurse gokyuzu iki parcaya
    // ayriliyor.
    let maxJump = 0
    let previous = cloudCoverage(direction(-0.05, 0.4))
    for (let elevation = -0.05; elevation < 0.5; elevation += 0.002) {
      const value = cloudCoverage(direction(elevation, 0.4))
      maxJump = Math.max(maxJump, Math.abs(value - previous))
      previous = value
    }
    expect(maxJump).toBeLessThan(0.2)
  })
})
