import { describe, it, expect } from 'vitest'
import { createStepper, FIXED_STEP, MAX_FRAME_TIME } from '@/core/loop'

describe('sabit adim biriktirici', () => {
  it('60 Hz karede ortalama iki adim atiyor', () => {
    const stepper = createStepper()
    let steps = 0
    for (let frame = 0; frame < 600; frame++) steps += stepper.advance(1 / 60)
    expect(steps).toBeGreaterThanOrEqual(1198)
    expect(steps).toBeLessThanOrEqual(1200)
  })

  it('30 Hz karede ortalama dort adim atiyor', () => {
    const stepper = createStepper()
    let steps = 0
    for (let frame = 0; frame < 300; frame++) steps += stepper.advance(1 / 30)
    expect(steps).toBeGreaterThanOrEqual(1198)
    expect(steps).toBeLessThanOrEqual(1200)
  })

  it('kare hizi ne olursa olsun ayni simulasyon suresi cikiyor', () => {
    // Bu, "hizli bilgisayarda arac daha hizli gidiyor" sinifini kokten cozuyor.
    const simulate = (frameTime: number, seconds: number) => {
      const stepper = createStepper()
      let steps = 0
      const frames = Math.round(seconds / frameTime)
      for (let frame = 0; frame < frames; frame++) steps += stepper.advance(frameTime)
      return steps * FIXED_STEP
    }
    const at144 = simulate(1 / 144, 10)
    const at60 = simulate(1 / 60, 10)
    const at30 = simulate(1 / 30, 10)
    expect(at144).toBeCloseTo(10, 1)
    expect(at60).toBeCloseTo(10, 1)
    expect(at30).toBeCloseTo(10, 1)
  })

  it('duzensiz kare surelerinde de zamani takip ediyor', () => {
    const stepper = createStepper()
    const frameTimes = [0.016, 0.021, 0.009, 0.033, 0.014, 0.018]
    let real = 0
    let steps = 0
    for (let i = 0; i < 600; i++) {
      const frameTime = frameTimes[i % frameTimes.length]!
      real += frameTime
      steps += stepper.advance(frameTime)
    }
    expect(steps * FIXED_STEP).toBeCloseTo(real, 1)
  })
})

describe('olum sarmali korumasi', () => {
  it('cok uzun bir kare yuzlerce adim uretmiyor', () => {
    // Sekme arka plana alinip geri gelince olan sey. Korunmazsa arac
    // isinlaniyor ve simulasyon kilitleniyor.
    const stepper = createStepper()
    const steps = stepper.advance(5)
    expect(steps).toBeLessThanOrEqual(Math.ceil(MAX_FRAME_TIME / FIXED_STEP))
  })

  it('uzun kare sonrasi birikmis borc tasinmiyor', () => {
    const stepper = createStepper()
    stepper.advance(5)
    expect(stepper.advance(1 / 60)).toBeLessThanOrEqual(3)
  })

  it('sifir ve negatif kare suresi adim uretmiyor', () => {
    const stepper = createStepper()
    expect(stepper.advance(0)).toBe(0)
    expect(stepper.advance(-1)).toBe(0)
  })
})

describe('determinizm', () => {
  it('ayni kare surelerinde ayni adim dizisi', () => {
    const a = createStepper()
    const b = createStepper()
    for (let i = 0; i < 200; i++) {
      const frameTime = 0.011 + (i % 7) * 0.003
      expect(a.advance(frameTime)).toBe(b.advance(frameTime))
    }
  })
})
