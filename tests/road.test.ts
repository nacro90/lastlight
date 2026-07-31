import { describe, it, expect } from 'vitest'
import { sampleRoad, toWorld, toRoadSpace } from '@/core/road'
import { LIMITS, ROAD } from '@/core/config'
import { hashString } from '@/core/rng'

const SEEDS = ['lastlight', 'ankara', 'dusk', '42'].map(hashString)
const SPAN = 20_000
const STEP = 1

describe('sampleRoad: determinizm', () => {
  it('ayni seed ve ayni s ayni ornegi verir', () => {
    const a = sampleRoad(SEEDS[0]!, 1234.5)
    const b = sampleRoad(SEEDS[0]!, 1234.5)
    expect(a).toEqual(b)
  })

  it('farkli seed farkli yol verir', () => {
    const a = sampleRoad(SEEDS[0]!, 1234.5)
    const b = sampleRoad(SEEDS[1]!, 1234.5)
    expect(a.z).not.toBeCloseTo(b.z, 3)
  })

  it('s ileri eksenle ayni: merkez hat s noktasinda ornekleniyor', () => {
    expect(sampleRoad(SEEDS[0]!, 700).s).toBe(700)
  })
})

describe('sampleRoad: sinirlar (tasarim garantileri)', () => {
  it('egim maksimum degeri asmiyor', () => {
    for (const seed of SEEDS) {
      let maxGrade = 0
      for (let s = -SPAN; s <= SPAN; s += STEP) {
        maxGrade = Math.max(maxGrade, Math.abs(sampleRoad(seed, s).grade))
      }
      expect(maxGrade).toBeLessThanOrEqual(LIMITS.maxGrade)
    }
  })

  it('sapma acisi maksimum degeri asmiyor: yol her zaman ileri gidiyor', () => {
    for (const seed of SEEDS) {
      let maxHeading = 0
      for (let s = -SPAN; s <= SPAN; s += STEP) {
        maxHeading = Math.max(maxHeading, Math.abs(sampleRoad(seed, s).heading))
      }
      expect(maxHeading).toBeLessThanOrEqual(LIMITS.maxHeading)
    }
  })

  it('minimum viraj yaricapi koridor yari genisliginden buyuk', () => {
    // Bu test serit kendisiyle cakismasin diye var. Yaricap koridordan
    // kucuk olursa arazi katlanir ve gorunur bir yarik acilir.
    for (const seed of SEEDS) {
      let maxCurvature = 0
      for (let s = -SPAN; s <= SPAN; s += STEP) {
        maxCurvature = Math.max(maxCurvature, Math.abs(sampleRoad(seed, s).curvature))
      }
      const minRadius = 1 / maxCurvature
      expect(minRadius).toBeGreaterThan(ROAD.corridorHalfWidth)
    }
  })
})

describe('sampleRoad: sureklilik', () => {
  it('konum surekli', () => {
    const seed = SEEDS[0]!
    const eps = 0.05
    let maxJump = 0
    for (let s = 0; s < 4000; s += 0.5) {
      const a = sampleRoad(seed, s)
      const b = sampleRoad(seed, s + eps)
      const dy = b.y - a.y
      const dz = b.z - a.z
      maxJump = Math.max(maxJump, Math.hypot(dy, dz))
    }
    // Egim ve sapma sinirlari verildiginde eps adiminda bu ustten sinirli.
    expect(maxJump).toBeLessThan(eps * 0.6)
  })

  it('tegent surekli: sapma acisi sicramiyor (C1)', () => {
    // Kopukluk olursa arac viraja girerken gorunur sekilde zipla.
    const seed = SEEDS[0]!
    const eps = 0.05
    let maxTurn = 0
    for (let s = 0; s < 4000; s += 0.5) {
      maxTurn = Math.abs(sampleRoad(seed, s + eps).heading - sampleRoad(seed, s).heading)
      expect(maxTurn).toBeLessThan(eps / ROAD.corridorHalfWidth + 1e-6)
    }
  })
})

describe('sampleRoad: yol gercekten ilginc', () => {
  it('duz degil: sapma acisi anlamli olcude degisiyor', () => {
    const seed = SEEDS[0]!
    let min = Infinity
    let max = -Infinity
    for (let s = 0; s < 6000; s += 5) {
      const h = sampleRoad(seed, s).heading
      min = Math.min(min, h)
      max = Math.max(max, h)
    }
    expect(max - min).toBeGreaterThan((10 * Math.PI) / 180)
  })

  it('duz degil: yukseklik anlamli olcude degisiyor', () => {
    const seed = SEEDS[0]!
    let min = Infinity
    let max = -Infinity
    for (let s = 0; s < 6000; s += 5) {
      const y = sampleRoad(seed, s).y
      min = Math.min(min, y)
      max = Math.max(max, y)
    }
    expect(max - min).toBeGreaterThan(15)
  })
})

describe('yol uzayi donusumu', () => {
  const seed = SEEDS[0]!

  it('t=0 iken dunya konumu merkez hattin ustunde', () => {
    for (const s of [0, 137.5, -820, 4321]) {
      const road = sampleRoad(seed, s)
      const world = toWorld(seed, s, 0)
      expect(world.x).toBeCloseTo(road.x, 6)
      expect(world.y).toBeCloseTo(road.y, 6)
      expect(world.z).toBeCloseTo(road.z, 6)
    }
  })

  it('gidis donus: (s,t) -> dunya -> (s,t) kendine donuyor', () => {
    // Bu test, en yakin spline noktasi aramasindan kacinmamizi mumkun kilan
    // seyin gecerliligini dogruluyor.
    for (const s of [0, 250.25, -1100, 3333.3]) {
      for (const t of [0, 12, -45, 150, -199]) {
        const world = toWorld(seed, s, t)
        const back = toRoadSpace(seed, world.x, world.z)
        expect(back.s).toBeCloseTo(s, 1)
        expect(back.t).toBeCloseTo(t, 1)
      }
    }
  })

  it('t isaretli: pozitif t her zaman ayni tarafta', () => {
    for (const s of [0, 500, 1200]) {
      const road = sampleRoad(seed, s)
      const right = toWorld(seed, s, 30)
      const left = toWorld(seed, s, -30)
      const cross =
        Math.cos(road.heading) * (right.z - road.z) - Math.sin(road.heading) * (right.x - road.x)
      const crossLeft =
        Math.cos(road.heading) * (left.z - road.z) - Math.sin(road.heading) * (left.x - road.x)
      expect(cross).toBeGreaterThan(0)
      expect(crossLeft).toBeLessThan(0)
    }
  })

  it('yanal mesafe korunuyor', () => {
    for (const s of [0, 640.5, -2000]) {
      for (const t of [15, -80, 175]) {
        const road = sampleRoad(seed, s)
        const world = toWorld(seed, s, t)
        const planar = Math.hypot(world.x - road.x, world.z - road.z)
        expect(planar).toBeCloseTo(Math.abs(t), 6)
      }
    }
  })
})
