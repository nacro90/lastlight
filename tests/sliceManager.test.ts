import { describe, it, expect } from 'vitest'
import { createSliceManager, EMPTY_SLOT } from '@/core/sliceManager'
import { SLICE } from '@/core/config'

/** Koridorda ileride her zaman hazir olmasi gereken mesafe. */
const SAFE_AHEAD = 300

function residentIndices(slots: Int32Array): Set<number> {
  const set = new Set<number>()
  for (const value of slots) if (value !== EMPTY_SLOT) set.add(value)
  return set
}

describe('kurulum', () => {
  it('havuz boyutu yapilandirmadan geliyor ve bos basliyor', () => {
    const manager = createSliceManager()
    expect(manager.slots).toHaveLength(SLICE.poolSize)
    for (const value of manager.slots) expect(value).toBe(EMPTY_SLOT)
  })
})

describe('istenen aralik', () => {
  it('araligin uzunlugu havuz boyutuna esit: kapasite tam kullaniliyor', () => {
    const manager = createSliceManager()
    const { first, last } = manager.range(0)
    expect(last - first + 1) .toBe(SLICE.poolSize)
  })

  it('aracin arkasinda yapilandirilan kadar dilim tutuluyor', () => {
    const manager = createSliceManager()
    const s = 10 * SLICE.length
    const { first } = manager.range(s)
    expect(first).toBe(10 - SLICE.behind)
  })

  it('negatif s de calisiyor', () => {
    const manager = createSliceManager()
    const { first, last } = manager.range(-500)
    expect(last - first + 1).toBe(SLICE.poolSize)
    expect(first).toBeLessThan(0)
  })
})

describe('amortisman', () => {
  it('kare basina istenen sayidan fazla dilim uretmiyor', () => {
    const manager = createSliceManager()
    expect(manager.update(0, 1)).toHaveLength(1)
    expect(manager.update(0, 3)).toHaveLength(3)
  })

  it('ilk doldurma bittiginde is kalmiyor', () => {
    const manager = createSliceManager()
    let guard = 0
    while (manager.update(0, 1).length > 0) {
      guard += 1
      expect(guard).toBeLessThanOrEqual(SLICE.poolSize)
    }
    expect(guard).toBe(SLICE.poolSize)
    expect(manager.update(0, 8)).toHaveLength(0)
  })

  it('ayni s ile ikinci cagri bos donuyor', () => {
    const manager = createSliceManager()
    manager.update(0, SLICE.poolSize)
    expect(manager.update(0, SLICE.poolSize)).toHaveLength(0)
  })
})

describe('havuz degismezleri', () => {
  it('iki yuvada ayni dilim bulunmuyor', () => {
    const manager = createSliceManager()
    manager.update(0, SLICE.poolSize)
    for (let s = 0; s < 20_000; s += 7) {
      manager.update(s, 2)
      const resident = residentIndices(manager.slots)
      expect(resident.size).toBe(manager.slots.length)
    }
  })

  it('kapasite hic asilmiyor', () => {
    const manager = createSliceManager()
    for (let s = 0; s < 5000; s += 3) {
      manager.update(s, 4)
      expect(manager.slots).toHaveLength(SLICE.poolSize)
    }
  })

  it('yuva atamasi determinist: ayni dilim her zaman ayni yuvaya gider', () => {
    const a = createSliceManager()
    const b = createSliceManager()
    a.update(1234, SLICE.poolSize)
    b.update(1234, SLICE.poolSize)
    expect(Array.from(a.slots)).toEqual(Array.from(b.slots))
  })
})

describe('onde bosluk olmuyor (asil garanti)', () => {
  it('yuksek hizda ilerlerken ileri koridor her zaman dolu', () => {
    const manager = createSliceManager()
    manager.update(0, SLICE.poolSize)

    // 50 m/s, kare basina 1 dilim uretim izniyle en kotu durum.
    const dt = 1 / 60
    const speed = 50
    let s = 0

    for (let frame = 0; frame < 6000; frame++) {
      s += speed * dt
      manager.update(s, 1)

      const resident = residentIndices(manager.slots)
      const firstNeeded = Math.floor(s / SLICE.length)
      const lastNeeded = Math.floor((s + SAFE_AHEAD) / SLICE.length)
      for (let index = firstNeeded; index <= lastNeeded; index++) {
        expect(resident.has(index)).toBe(true)
      }
    }
  })

  it('geri giderken de bosluk olmuyor', () => {
    const manager = createSliceManager()
    manager.update(0, SLICE.poolSize)
    let s = 0
    for (let frame = 0; frame < 2000; frame++) {
      s -= 20 / 60
      manager.update(s, 2)
      const resident = residentIndices(manager.slots)
      const center = Math.floor(s / SLICE.length)
      expect(resident.has(center)).toBe(true)
    }
  })

  it('anlik buyuk ziplama sonrasi koridor toparlaniyor', () => {
    const manager = createSliceManager()
    manager.update(0, SLICE.poolSize)
    manager.update(100_000, SLICE.poolSize)
    const resident = residentIndices(manager.slots)
    const center = Math.floor(100_000 / SLICE.length)
    expect(resident.has(center)).toBe(true)
    expect(resident.size).toBe(SLICE.poolSize)
  })
})

describe('oncelik', () => {
  it('once ileri dilimler uretiliyor', () => {
    // Onde bosluk gorunurse felaket, arkada bosluk kimsenin gormedigi seydir.
    const manager = createSliceManager()
    const assignments = manager.update(0, 3)
    const centerIndex = 0
    for (const assignment of assignments) {
      expect(assignment.sliceIndex).toBeGreaterThanOrEqual(centerIndex)
    }
  })
})
