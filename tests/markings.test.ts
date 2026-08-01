import { describe, it, expect } from 'vitest'
import { SLICE } from '@/core/config'
import {
  MARKING,
  MARKING_PERIOD,
  MARKING_STRIDE,
  createSliceMarkings,
  writeSliceMarkings,
} from '@/core/markings'
import { roadHeading, toRoadSpace } from '@/core/road'
import { hashString } from '@/core/rng'
import { terrainHeight } from '@/core/terrain'

const SEED = hashString('lastlight')

function dashes(sliceIndex: number) {
  const out = createSliceMarkings()
  writeSliceMarkings(SEED, sliceIndex, out)

  const list = []
  for (let i = 0; i < MARKING.perSlice; i++) {
    const offset = i * MARKING_STRIDE
    list.push({
      x: out[offset]!,
      y: out[offset + 1]!,
      z: out[offset + 2]!,
      heading: out[offset + 3]!,
      pitch: out[offset + 4]!,
    })
  }
  return list
}

describe('cizgi olculeri', () => {
  it('dilim uzunlugu donemin tam kati', () => {
    // Bu bozulursa dikislerde cizgi kayiyor: bir dilimin son bosluk uzunlugu
    // digerinden farkli oluyor ve desen gozle gorunur sekilde aksiyor.
    expect(SLICE.length / MARKING_PERIOD).toBeCloseTo(MARKING.perSlice, 12)
    expect(Number.isInteger(MARKING.perSlice)).toBe(true)
  })

  it('cizgi donemden kisa: bosluk gercekten var', () => {
    expect(MARKING.dashLength).toBeGreaterThan(0)
    expect(MARKING.dashLength).toBeLessThan(MARKING_PERIOD)
    // Doluluk orani gercek yollara yakin: ucte bir civari, yarisi degil.
    expect(MARKING.dashLength / MARKING_PERIOD).toBeLessThan(0.45)
  })

  it('genislik seridin icinde kaliyor', () => {
    expect(MARKING.halfWidth).toBeGreaterThan(0)
    expect(MARKING.halfWidth).toBeLessThan(0.3)
  })
})

describe('cizgi yerlesimi', () => {
  it('determinist ve sonlu', () => {
    const a = createSliceMarkings()
    const b = createSliceMarkings()
    writeSliceMarkings(SEED, 17, a)
    writeSliceMarkings(SEED, 17, b)
    expect(a).toEqual(b)
    for (const value of a) expect(Number.isFinite(value)).toBe(true)
  })

  it('cizgiler merkez hattin uzerinde', () => {
    for (const sliceIndex of [0, 5, -3, 240]) {
      for (const dash of dashes(sliceIndex)) {
        const road = toRoadSpace(SEED, dash.x, dash.z)
        expect(Math.abs(road.t)).toBeLessThan(0.02)
      }
    }
  })

  it('cizgiler yol yuzeyinin hemen ustunde', () => {
    for (const sliceIndex of [0, 12, -8]) {
      for (const dash of dashes(sliceIndex)) {
        const road = toRoadSpace(SEED, dash.x, dash.z)
        const surface = terrainHeight(SEED, road.s, road.t)
        expect(dash.y - surface).toBeCloseTo(MARKING.lift, 3)
      }
    }
  })

  it('desen dilim boyunca ve dilimler arasinda duzenli', () => {
    // Faz global s'ten turetildigi icin dikiste desen kaymiyor.
    const first = dashes(9)
    const second = dashes(10)

    const spans = []
    for (let i = 1; i < first.length; i++) {
      spans.push(toRoadSpace(SEED, first[i]!.x, first[i]!.z).s - toRoadSpace(SEED, first[i - 1]!.x, first[i - 1]!.z).s)
    }
    spans.push(
      toRoadSpace(SEED, second[0]!.x, second[0]!.z).s -
        toRoadSpace(SEED, first.at(-1)!.x, first.at(-1)!.z).s,
    )

    for (const span of spans) expect(span).toBeCloseTo(MARKING_PERIOD, 1)
  })

  it('yon ve egim yolu takip ediyor', () => {
    for (const sliceIndex of [3, 77]) {
      for (const dash of dashes(sliceIndex)) {
        const road = toRoadSpace(SEED, dash.x, dash.z)
        expect(dash.heading).toBeCloseTo(roadHeading(SEED, road.s), 3)
        // Egim yolun egiminden geliyor; duz yolda sifira yakin, hicbir yerde
        // makul acinin otesinde degil.
        expect(Math.abs(dash.pitch)).toBeLessThan(0.2)
      }
    }
  })

  it('farkli dilim farkli konum veriyor', () => {
    const a = dashes(4)
    const b = dashes(5)
    expect(a[0]!.x).not.toBeCloseTo(b[0]!.x, 3)
  })
})
