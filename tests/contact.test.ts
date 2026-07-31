import { describe, it, expect } from 'vitest'
import { sampleContact } from '@/core/contact'
import { sampleRoad, toWorld, ROAD_EDGE } from '@/core/road'
import { terrainHeightAtWorld } from '@/core/terrain'
import { VEHICLE } from '@/core/vehicle'
import { hashString } from '@/core/rng'

const SEED = hashString('lastlight')
const HALF_WHEELBASE = VEHICLE.wheelbase / 2
const HALF_TRACK = 0.82

function contactAt(s: number, t: number, headingOffset = 0) {
  const road = sampleRoad(SEED, s)
  const world = toWorld(SEED, s, t)
  return sampleContact(
    SEED,
    world.x,
    world.z,
    road.heading + headingOffset,
    HALF_WHEELBASE,
    HALF_TRACK,
  )
}

describe('determinizm', () => {
  it('ayni girdi ayni temas cercevesini veriyor', () => {
    expect(contactAt(500, 0)).toEqual(contactAt(500, 0))
  })
})

describe('yol uzerinde', () => {
  it('yana yatma sifira yakin: asfalt enine duz', () => {
    for (const s of [0, 340, 1200, -800]) {
      expect(Math.abs(contactAt(s, 0).roll)).toBeLessThan(0.01)
    }
  })

  it('ileri egim yolun egimine esit', () => {
    for (const s of [0, 340, 1200, -800]) {
      const road = sampleRoad(SEED, s)
      const contact = contactAt(s, 0)
      expect(contact.forwardGrade).toBeCloseTo(road.grade, 2)
      expect(contact.pitch).toBeCloseTo(Math.atan(road.grade), 2)
    }
  })

  it('yukseklik yol yuksekligine esit', () => {
    for (const s of [0, 340, 1200]) {
      const road = sampleRoad(SEED, s)
      expect(contactAt(s, 0).height).toBeCloseTo(road.y, 1)
    }
  })
})

describe('arazi uzerinde', () => {
  it('yana egimli arazide arac yana yatiyor', () => {
    let maxRoll = 0
    for (let s = 0; s < 3000; s += 25) {
      maxRoll = Math.max(maxRoll, Math.abs(contactAt(s, 60).roll))
    }
    // Yol uzerinde sifira yakin olan bu deger arazide anlamli olmali,
    // yoksa araziye cikmak hicbir sey degistirmiyor demektir.
    expect(maxRoll).toBeGreaterThan(0.02)
  })

  it('arazide ileri egim yolun egiminden ayrisiyor', () => {
    let maxDifference = 0
    for (let s = 0; s < 3000; s += 25) {
      const road = sampleRoad(SEED, s)
      maxDifference = Math.max(maxDifference, Math.abs(contactAt(s, 90).forwardGrade - road.grade))
    }
    expect(maxDifference).toBeGreaterThan(0.02)
  })

  it('yukseklik dort temas noktasinin arasinda kaliyor', () => {
    for (let s = 0; s < 1500; s += 50) {
      const world = toWorld(SEED, s, 75)
      const contact = sampleContact(SEED, world.x, world.z, 0.3, HALF_WHEELBASE, HALF_TRACK)
      const around = [
        terrainHeightAtWorld(SEED, world.x + 2, world.z),
        terrainHeightAtWorld(SEED, world.x - 2, world.z),
        terrainHeightAtWorld(SEED, world.x, world.z + 2),
        terrainHeightAtWorld(SEED, world.x, world.z - 2),
      ]
      expect(contact.height).toBeGreaterThanOrEqual(Math.min(...around) - 0.5)
      expect(contact.height).toBeLessThanOrEqual(Math.max(...around) + 0.5)
    }
  })
})

describe('yon tutarliligi', () => {
  it('ters yone bakinca ileri egim isaret degistiriyor', () => {
    for (const s of [200, 900, 2400]) {
      const forward = contactAt(s, 30, 0)
      const backward = contactAt(s, 30, Math.PI)
      expect(Math.sign(forward.forwardGrade)).toBe(-Math.sign(backward.forwardGrade))
    }
  })

  it('ters yone bakinca yana yatma isaret degistiriyor', () => {
    for (const s of [200, 900, 2400]) {
      const forward = contactAt(s, 55, 0)
      const backward = contactAt(s, 55, Math.PI)
      expect(Math.sign(forward.roll)).toBe(-Math.sign(backward.roll))
    }
  })

  it('egim ve ileri egim birbiriyle tutarli', () => {
    const contact = contactAt(1100, 40)
    expect(contact.pitch).toBeCloseTo(Math.atan(contact.forwardGrade), 6)
  })
})

describe('dunya koordinatinda yukseklik sorgusu', () => {
  it('yol uzayi sorgusuyla ayni sonucu veriyor', () => {
    for (const s of [0, 640, -1500]) {
      for (const t of [0, 25, -110]) {
        const world = toWorld(SEED, s, t)
        const direct = terrainHeightAtWorld(SEED, world.x, world.z)
        const road = sampleRoad(SEED, s)
        if (Math.abs(t) < ROAD_EDGE) expect(direct).toBeCloseTo(road.y, 1)
        expect(Number.isFinite(direct)).toBe(true)
      }
    }
  })
})
