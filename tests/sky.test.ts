import { describe, it, expect } from 'vitest'
import { SKY, skyColorAt } from '@/core/sky'

/** Gunes ileri eksende, ufkun hemen uzerinde. */
const SUN: [number, number, number] = [Math.cos(0.12), Math.sin(0.12), 0.16]

function luminance(color: [number, number, number]): number {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
}

describe('determinizm ve saglik', () => {
  it('ayni yon ayni rengi veriyor', () => {
    expect(skyColorAt([1, 0.2, 0], SUN)).toEqual(skyColorAt([1, 0.2, 0], SUN))
  })

  it('normalize edilmemis yon ayni sonucu veriyor', () => {
    const unit = skyColorAt([1, 0.2, 0], SUN)
    const scaled = skyColorAt([7, 1.4, 0], SUN)
    for (let channel = 0; channel < 3; channel++) {
      expect(scaled[channel]).toBeCloseTo(unit[channel]!, 6)
    }
  })

  it('butun kanallar sonlu ve negatif degil', () => {
    for (let x = -1; x <= 1; x += 0.25) {
      for (let y = -1; y <= 1; y += 0.25) {
        for (let z = -1; z <= 1; z += 0.5) {
          if (x === 0 && y === 0 && z === 0) continue
          for (const channel of skyColorAt([x, y, z], SUN)) {
            expect(Number.isFinite(channel)).toBe(true)
            expect(channel).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })
})

describe('gradyan uc noktalari', () => {
  it('tam yukari zenit rengine yakin', () => {
    const color = skyColorAt([0, 1, 0], SUN)
    for (let channel = 0; channel < 3; channel++) {
      expect(color[channel]).toBeCloseTo(SKY.zenith[channel]!, 2)
    }
  })

  it('tam asagi alt rengine yakin', () => {
    const color = skyColorAt([0, -1, 0], SUN)
    for (let channel = 0; channel < 3; channel++) {
      expect(color[channel]).toBeCloseTo(SKY.below[channel]!, 2)
    }
  })
})

describe('yon duyarliligi (sis rengi buna bagli)', () => {
  it('gunese dogru bakmak en parlak yon', () => {
    const towardSun = skyColorAt([SUN[0], SUN[1], SUN[2]], SUN)
    const away = skyColorAt([-SUN[0], SUN[1], -SUN[2]], SUN)
    const side = skyColorAt([0, SUN[1], 1], SUN)
    expect(luminance(towardSun)).toBeGreaterThan(luminance(away))
    expect(luminance(towardSun)).toBeGreaterThan(luminance(side))
  })

  it('gunesten uzaga bakmak daha serin: mavi orani artiyor', () => {
    // Sisin tek sabit renk olmasi bu yuzden yanlisti: arkaya bakinca gokyuzu
    // mor ama sis turuncu kaliyordu.
    const towardSun = skyColorAt([SUN[0], 0.05, SUN[2]], SUN)
    const away = skyColorAt([-SUN[0], 0.05, -SUN[2]], SUN)
    const warmthToward = towardSun[0]! / Math.max(towardSun[2]!, 1e-6)
    const warmthAway = away[0]! / Math.max(away[2]!, 1e-6)
    expect(warmthAway).toBeLessThan(warmthToward)
  })

  it('gunes diski cok parlak: bloom esigini asan tek sey', () => {
    const disk = skyColorAt([SUN[0], SUN[1], SUN[2]], SUN)
    expect(Math.max(...disk)).toBeGreaterThan(2)
  })

  it('disk dar: bir derece yana kayinca parlaklik cokuyor', () => {
    const disk = skyColorAt([SUN[0], SUN[1], SUN[2]], SUN)
    const nearby = skyColorAt([Math.cos(0.16), Math.sin(0.16), 0.16], SUN)
    expect(luminance(nearby)).toBeLessThan(luminance(disk) * 0.5)
  })
})

describe('yukseklik gecisi', () => {
  it('ufuktan zenite monoton kararma', () => {
    let previous = Infinity
    for (let elevation = 0.02; elevation <= 1.5; elevation += 0.05) {
      // Gunesten uzak bir azimutta orneklendi ki disk ve hale karismasin.
      const color = skyColorAt([0, Math.sin(elevation), Math.cos(elevation)], SUN)
      const value = luminance(color)
      expect(value).toBeLessThanOrEqual(previous + 1e-9)
      previous = value
    }
  })
})
