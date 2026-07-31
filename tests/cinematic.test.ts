import { describe, it, expect } from 'vitest'
import {
  CUT_DURATION,
  FRAMINGS,
  REDUCED_MOTION_CUT_DURATION,
  SHOT_MAX_DURATION,
  SHOT_MIN_DURATION,
  createCinematic,
  type Framing,
} from '@/core/cinematic'
import { hashString } from '@/core/rng'

const SEED = hashString('lastlight')
const STEP = 1 / 60

function run(seconds: number, cutDuration = CUT_DURATION) {
  const cinematic = createCinematic(SEED, cutDuration)
  const frames = []
  const steps = Math.round(seconds / STEP)
  for (let i = 0; i < steps; i++) frames.push(cinematic.advance(STEP))
  return frames
}

const FIELDS: Array<keyof Framing> = [
  'back',
  'height',
  'side',
  'lookAhead',
  'fov',
  'driftBack',
  'driftHeight',
  'driftSide',
]

describe('cerceveleme tanimlari', () => {
  it('en az dort cerceveleme var', () => {
    expect(FRAMINGS.length).toBeGreaterThanOrEqual(4)
  })

  it('cercevelemeler birbirinden farkli', () => {
    const signatures = FRAMINGS.map((framing) => FIELDS.map((field) => framing[field]).join(','))
    expect(new Set(signatures).size).toBe(FRAMINGS.length)
  })

  it('gorus acilari makul araliklarda', () => {
    for (const framing of FRAMINGS) {
      expect(framing.fov).toBeGreaterThan(30)
      expect(framing.fov).toBeLessThan(90)
    }
  })
})

describe('determinizm', () => {
  it('ayni delta dizisi ayni programi veriyor', () => {
    const first = run(40)
    const second = run(40)
    expect(first).toEqual(second)
  })
})

describe('cekim programi', () => {
  it('cekimler sirayla degisiyor', () => {
    const frames = run(120)
    const changes = frames.filter(
      (frame, index) => index > 0 && frame.framingIndex !== frames[index - 1]!.framingIndex,
    )
    expect(changes.length).toBeGreaterThan(8)
  })

  it('ust uste ayni cerceveleme secilmiyor', () => {
    // Ayni cerceveleme iki kez secilirse kesme hicbir sey degistirmiyor gibi
    // gorunuyor ve izleyici bir hata sanıyor.
    for (const frame of run(200)) {
      if (frame.framingIndex !== frame.previousIndex) {
        expect(frame.framingIndex).not.toBe(frame.previousIndex)
      }
    }
  })

  it('cekim sureleri sinirlar icinde', () => {
    const frames = run(240)
    let lastChangeAt = 0
    const durations: number[] = []

    frames.forEach((frame, index) => {
      if (index > 0 && frame.framingIndex !== frames[index - 1]!.framingIndex) {
        durations.push((index - lastChangeAt) * STEP)
        lastChangeAt = index
      }
    })

    expect(durations.length).toBeGreaterThan(10)
    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(SHOT_MIN_DURATION - 0.1)
      expect(duration).toBeLessThanOrEqual(SHOT_MAX_DURATION + 0.1)
    }
  })

  it('cekim zamani cekim icinde artiyor, kesmede sifirlaniyor', () => {
    const frames = run(60)
    frames.forEach((frame, index) => {
      if (index === 0) return
      const previous = frames[index - 1]!
      if (frame.framingIndex === previous.framingIndex) {
        expect(frame.shotTime).toBeGreaterThan(previous.shotTime)
      } else {
        expect(frame.shotTime).toBeLessThan(previous.shotTime)
      }
    })
  })
})

describe('kesme', () => {
  it('kesme suresinden sonra karisim tamamlaniyor', () => {
    const frames = run(60)
    for (const frame of frames) {
      if (frame.shotTime > CUT_DURATION + STEP) {
        expect(frame.blend).toBe(1)
        expect(frame.cutting).toBe(false)
      }
    }
  })

  it('karisim her zaman [0,1] araliginda', () => {
    for (const frame of run(80)) {
      expect(frame.blend).toBeGreaterThanOrEqual(0)
      expect(frame.blend).toBeLessThanOrEqual(1)
    }
  })

  it('azaltilmis hareket tercihinde kesme cok daha uzun suruyor', () => {
    // prefers-reduced-motion acikken kesme yumusak bir kaydirmaya inmeli.
    // Oran varsayilan kesme yavaslatildigi icin dorttten ikibucuga indi:
    // olculen sey mutlak hiz degil, azaltilmis hareketin belirgin sekilde
    // daha yavas olmasi.
    const quick = run(60).filter((frame) => frame.cutting).length
    const slow = run(60, REDUCED_MOTION_CUT_DURATION).filter((frame) => frame.cutting).length
    expect(slow).toBeGreaterThan(quick * 2.5)
  })
})

describe('karisim tasmiyor', () => {
  it('cerceveleme degerleri tanimlarin min ve max araliginda kaliyor', () => {
    // Tasma olursa kamera bir an sahnenin disina ciikip geri geliyor.
    const bounds = FIELDS.map((field) => ({
      field,
      min: Math.min(...FRAMINGS.map((framing) => framing[field])),
      max: Math.max(...FRAMINGS.map((framing) => framing[field])),
    }))

    for (const frame of run(150)) {
      for (const bound of bounds) {
        expect(frame.framing[bound.field]).toBeGreaterThanOrEqual(bound.min - 1e-9)
        expect(frame.framing[bound.field]).toBeLessThanOrEqual(bound.max + 1e-9)
      }
    }
  })
})
