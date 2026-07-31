import { describe, it, expect } from 'vitest'
import {
  SCATTER_STRIDE,
  createSliceScatter,
  writeSliceScatter,
  type SliceScatter,
} from '@/core/scatter'
import { SCATTER, SLICE, ROAD } from '@/core/config'
import { ROAD_EDGE, toRoadSpace } from '@/core/road'
import { terrainHeightAtWorld } from '@/core/terrain'
import { hashString } from '@/core/rng'

const SEED = hashString('lastlight')

interface Item {
  x: number
  y: number
  z: number
  scale: number
  rotation: number
}

function items(buffer: Float32Array): Item[] {
  const result: Item[] = []
  for (let offset = 0; offset < buffer.length; offset += SCATTER_STRIDE) {
    result.push({
      x: buffer[offset]!,
      y: buffer[offset + 1]!,
      z: buffer[offset + 2]!,
      scale: buffer[offset + 3]!,
      rotation: buffer[offset + 4]!,
    })
  }
  return result
}

function allItems(scatter: SliceScatter): Item[] {
  return [...items(scatter.trees), ...items(scatter.bushes), ...items(scatter.rocks)]
}

function visible(scatter: SliceScatter): Item[] {
  return allItems(scatter).filter((item) => item.scale > 0)
}

describe('tampon olculeri (havuz degismezi)', () => {
  it('her tur icin sabit boyut', () => {
    const scatter = createSliceScatter()
    expect(scatter.trees).toHaveLength(SCATTER.trees * SCATTER_STRIDE)
    expect(scatter.bushes).toHaveLength(SCATTER.bushes * SCATTER_STRIDE)
    expect(scatter.rocks).toHaveLength(SCATTER.rocks * SCATTER_STRIDE)
  })

  it('hangi dilim olursa olsun boyut degismiyor', () => {
    const scatter = createSliceScatter()
    for (const index of [-30, 0, 3, 512]) {
      writeSliceScatter(SEED, index, scatter)
      expect(scatter.trees).toHaveLength(SCATTER.trees * SCATTER_STRIDE)
    }
  })
})

describe('determinizm ve havuz temizligi', () => {
  it('ayni dilim iki kez ayni sonucu veriyor', () => {
    const a = createSliceScatter()
    const b = createSliceScatter()
    writeSliceScatter(SEED, 21, a)
    writeSliceScatter(SEED, 21, b)
    expect(a.trees).toEqual(b.trees)
    expect(a.bushes).toEqual(b.bushes)
    expect(a.rocks).toEqual(b.rocks)
  })

  it('geri donusturulen tamponda kalinti kalmiyor', () => {
    const recycled = createSliceScatter()
    const fresh = createSliceScatter()
    writeSliceScatter(SEED, 4, recycled)
    writeSliceScatter(SEED, 77, recycled)
    writeSliceScatter(SEED, 77, fresh)
    expect(recycled.trees).toEqual(fresh.trees)
    expect(recycled.bushes).toEqual(fresh.bushes)
    expect(recycled.rocks).toEqual(fresh.rocks)
  })

  it('farkli seed farkli yerlesim veriyor', () => {
    const a = createSliceScatter()
    const b = createSliceScatter()
    writeSliceScatter(SEED, 9, a)
    writeSliceScatter(hashString('ankara'), 9, b)
    expect(a.trees).not.toEqual(b.trees)
  })
})

describe('yola hicbir sey konmuyor', () => {
  it('gorunur hicbir nesne yol ve banket uzerinde degil', () => {
    // Yolun uzerinde bir agac cikarsa arac icinden gecer ve butun illuzyon
    // biter; bu testin dusmesi kabul edilemez.
    const scatter = createSliceScatter()
    for (let index = -20; index < 60; index++) {
      writeSliceScatter(SEED, index, scatter)
      for (const item of visible(scatter)) {
        const road = toRoadSpace(SEED, item.x, item.z)
        expect(Math.abs(road.t)).toBeGreaterThan(ROAD_EDGE)
      }
    }
  })
})

describe('koridor sinirlari', () => {
  it('hicbir nesne koridorun disina tasmiyor', () => {
    const scatter = createSliceScatter()
    for (let index = 0; index < 40; index++) {
      writeSliceScatter(SEED, index, scatter)
      for (const item of visible(scatter)) {
        const road = toRoadSpace(SEED, item.x, item.z)
        expect(Math.abs(road.t)).toBeLessThanOrEqual(ROAD.corridorHalfWidth)
      }
    }
  })

  it('nesneler dilimin kendi s araliginda kaliyor', () => {
    const scatter = createSliceScatter()
    for (const index of [0, 7, 33]) {
      writeSliceScatter(SEED, index, scatter)
      const start = index * SLICE.length
      for (const item of visible(scatter)) {
        const road = toRoadSpace(SEED, item.x, item.z)
        expect(road.s).toBeGreaterThanOrEqual(start - 0.5)
        expect(road.s).toBeLessThanOrEqual(start + SLICE.length + 0.5)
      }
    }
  })
})

describe('zemine oturma', () => {
  it('nesneler arazi yuzeyinde duruyor', () => {
    // Havada duran veya yere gomulen agac, gorsel guvenilirligi tek basina
    // yikan seydir.
    const scatter = createSliceScatter()
    for (const index of [2, 15, 44]) {
      writeSliceScatter(SEED, index, scatter)
      for (const item of visible(scatter)) {
        expect(item.y).toBeCloseTo(terrainHeightAtWorld(SEED, item.x, item.z), 1)
      }
    }
  })
})

describe('nesne ozellikleri', () => {
  it('olcek asla negatif degil, gizli nesneler tam sifir', () => {
    const scatter = createSliceScatter()
    for (let index = 0; index < 30; index++) {
      writeSliceScatter(SEED, index, scatter)
      for (const item of allItems(scatter)) {
        expect(item.scale).toBeGreaterThanOrEqual(0)
        if (item.scale === 0) continue
        expect(item.scale).toBeGreaterThan(0.1)
      }
    }
  })

  it('donus acisi tam turun icinde', () => {
    const scatter = createSliceScatter()
    writeSliceScatter(SEED, 11, scatter)
    for (const item of allItems(scatter)) {
      expect(item.rotation).toBeGreaterThanOrEqual(0)
      expect(item.rotation).toBeLessThan(Math.PI * 2)
    }
  })

  it('NaN yok', () => {
    const scatter = createSliceScatter()
    for (let index = 0; index < 20; index++) {
      writeSliceScatter(SEED, index, scatter)
      for (const buffer of [scatter.trees, scatter.bushes, scatter.rocks]) {
        for (const value of buffer) expect(Number.isFinite(value)).toBe(true)
      }
    }
  })
})

describe('yogunluk', () => {
  it('dunya bos degil: nesnelerin cogu gorunur', () => {
    const scatter = createSliceScatter()
    let total = 0
    let shown = 0
    for (let index = 0; index < 80; index++) {
      writeSliceScatter(SEED, index, scatter)
      total += allItems(scatter).length
      shown += visible(scatter).length
    }
    expect(shown / total).toBeGreaterThan(0.35)
  })

  it('agaclar obeklesiyor: yogunluk dilimden dilime degisiyor', () => {
    // Duzgun serpistirme yapay duruyor; alcak frekansli yogunluk alani
    // ormanlik ve aciklik olusturuyor.
    const scatter = createSliceScatter()
    const counts: number[] = []
    for (let index = 0; index < 120; index++) {
      writeSliceScatter(SEED, index, scatter)
      counts.push(items(scatter.trees).filter((item) => item.scale > 0).length)
    }
    const min = Math.min(...counts)
    const max = Math.max(...counts)
    expect(max - min).toBeGreaterThanOrEqual(3)
  })
})
