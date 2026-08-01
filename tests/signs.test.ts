import { describe, it, expect } from 'vitest'
import { SCATTER, SLICE } from '@/core/config'
import {
  SIGN,
  SIGN_BLOCK,
  SIGN_KINDS,
  SIGN_STRIDE,
  createSliceSigns,
  writeSliceSigns,
} from '@/core/signs'
import { ROAD_EDGE, roadHeading, toRoadSpace } from '@/core/road'
import { hashString } from '@/core/rng'
import { terrainHeight } from '@/core/terrain'

const SEED = hashString('lastlight')

interface Placed {
  sliceIndex: number
  x: number
  y: number
  z: number
  heading: number
  kind: number
}

function signAt(sliceIndex: number): Placed | null {
  const out = createSliceSigns()
  writeSliceSigns(SEED, sliceIndex, out)
  const kind = out[SIGN_STRIDE - 1]!
  if (kind < 0) return null
  return {
    sliceIndex,
    x: out[0]!,
    y: out[1]!,
    z: out[2]!,
    heading: out[3]!,
    kind,
  }
}

function span(from: number, to: number): Placed[] {
  const placed: Placed[] = []
  for (let sliceIndex = from; sliceIndex < to; sliceIndex++) {
    const sign = signAt(sliceIndex)
    if (sign) placed.push(sign)
  }
  return placed
}

describe('tabela tanimlari', () => {
  it('en az uc cesit var', () => {
    expect(SIGN_KINDS.length).toBeGreaterThanOrEqual(3)
  })

  it('blok uzunlugu makul: tabelalar arada gelir, her dilimde degil', () => {
    // Her dilimde tabela olsa yol bir sehir caddesine donuyor; cok seyrek olsa
    // hic fark edilmiyor. Blok basina bir tane, blok yuz metreden uzun.
    expect(SIGN_BLOCK * SLICE.length).toBeGreaterThan(100)
  })

  it('yolun disinda ama serpistirme boslugunun icinde', () => {
    // Iki kosul birden: asfalta veya bankete tabela dikilmiyor, ve tabela
    // agaclarin girebildigi bolgeye tasmiyor.
    expect(SIGN.lateral).toBeGreaterThan(ROAD_EDGE)
    expect(SIGN.lateral).toBeLessThan(ROAD_EDGE + SCATTER.clearance)
  })

  it('levha yuksekligi ve boyutu makul', () => {
    expect(SIGN.plateHeight).toBeGreaterThan(1.4)
    expect(SIGN.plateHeight).toBeLessThan(2.8)
    expect(SIGN.plateRadius).toBeGreaterThan(0.2)
    expect(SIGN.plateRadius).toBeLessThan(0.6)
  })
})

describe('tabela yerlesimi', () => {
  it('determinist ve sonlu', () => {
    const a = createSliceSigns()
    const b = createSliceSigns()
    writeSliceSigns(SEED, 33, a)
    writeSliceSigns(SEED, 33, b)
    expect(a).toEqual(b)
    for (const value of a) expect(Number.isFinite(value)).toBe(true)
  })

  it('her blokta tam bir tabela', () => {
    for (let block = -4; block < 40; block++) {
      const from = block * SIGN_BLOCK
      const found = span(from, from + SIGN_BLOCK)
      expect(found).toHaveLength(1)
    }
  })

  it('iki tabela arasinda en az iki dilim bosluk var', () => {
    // Yan yana iki tabela kumelenme gibi duruyor ve ritmi bozuyor.
    const placed = span(0, 400)
    expect(placed.length).toBeGreaterThan(40)
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i]!.sliceIndex - placed[i - 1]!.sliceIndex).toBeGreaterThanOrEqual(2)
    }
  })

  it('butun cesitler uzun mesafede gorunuyor', () => {
    const kinds = new Set(span(0, 600).map((sign) => sign.kind))
    expect(kinds.size).toBe(SIGN_KINDS.length)
  })

  it('iki taraf da kullaniliyor', () => {
    const sides = span(0, 600).map((sign) => Math.sign(toRoadSpace(SEED, sign.x, sign.z).t))
    expect(new Set(sides)).toEqual(new Set([-1, 1]))
  })

  it('hepsi yolun disinda', () => {
    for (const sign of span(0, 300)) {
      const road = toRoadSpace(SEED, sign.x, sign.z)
      expect(Math.abs(road.t)).toBeGreaterThan(ROAD_EDGE)
    }
  })

  it('tabani zemine oturuyor', () => {
    for (const sign of span(0, 120)) {
      const road = toRoadSpace(SEED, sign.x, sign.z)
      expect(sign.y).toBeCloseTo(terrainHeight(SEED, road.s, road.t), 3)
    }
  })

  it('yon yolu takip ediyor', () => {
    for (const sign of span(0, 120)) {
      const road = toRoadSpace(SEED, sign.x, sign.z)
      expect(sign.heading).toBeCloseTo(roadHeading(SEED, road.s), 3)
    }
  })

  it('farkli tohum farkli dizilim veriyor', () => {
    const other = hashString('ankara')
    const mine = span(0, 60).map((sign) => `${sign.sliceIndex}:${sign.kind}`)
    const theirs: string[] = []
    for (let sliceIndex = 0; sliceIndex < 60; sliceIndex++) {
      const out = createSliceSigns()
      writeSliceSigns(other, sliceIndex, out)
      if (out[SIGN_STRIDE - 1]! >= 0) theirs.push(`${sliceIndex}:${out[SIGN_STRIDE - 1]!}`)
    }
    expect(mine.join(',')).not.toBe(theirs.join(','))
  })
})
