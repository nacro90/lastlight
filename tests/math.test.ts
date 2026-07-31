import { describe, it, expect } from 'vitest'
import { clamp, clamp01, lerp, smoothstep, moveToward } from '@/core/math'

describe('clamp', () => {
  it('araliga sikistirir', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})

describe('clamp01', () => {
  it('[0,1] araligina sikistirir', () => {
    expect(clamp01(2)).toBe(1)
    expect(clamp01(-2)).toBe(0)
    expect(clamp01(0.25)).toBe(0.25)
  })
})

describe('lerp', () => {
  it('uc noktalari korur', () => {
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 1)).toBe(20)
  })

  it('ortayi bulur', () => {
    expect(lerp(10, 20, 0.5)).toBe(15)
  })
})

describe('smoothstep', () => {
  it('esiklerin disinda doyar', () => {
    expect(smoothstep(2, 5, 1)).toBe(0)
    expect(smoothstep(2, 5, 9)).toBe(1)
  })

  it('uc noktalarda turevi sifir: gecis gorunur bir kirilma yapmiyor', () => {
    const eps = 1e-4
    const nearStart = smoothstep(0, 1, eps) / eps
    const nearEnd = (1 - smoothstep(0, 1, 1 - eps)) / eps
    expect(nearStart).toBeLessThan(0.01)
    expect(nearEnd).toBeLessThan(0.01)
  })

  it('monoton artan', () => {
    let previous = -1
    for (let x = -0.5; x <= 1.5; x += 0.01) {
      const value = smoothstep(0, 1, x)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('bozuk aralikta patlamiyor', () => {
    expect(Number.isFinite(smoothstep(3, 3, 3))).toBe(true)
  })
})

describe('moveToward', () => {
  it('hedefe dogru en fazla verilen kadar ilerler', () => {
    expect(moveToward(0, 10, 2)).toBe(2)
    expect(moveToward(0, -10, 2)).toBe(-2)
  })

  it('hedefi asmiyor', () => {
    expect(moveToward(9, 10, 5)).toBe(10)
    expect(moveToward(-9, -10, 5)).toBe(-10)
  })
})
