import { describe, it, expect } from 'vitest'
import {
  SLICE_VERTEX_COUNT,
  SLICE_INDEX_COUNT,
  createSliceBuffers,
  sliceIndices,
  sliceOriginX,
  lateralOffsets,
  terrainHeight,
  writeSlice,
} from '@/core/terrain'
import { ROAD_EDGE } from '@/core/road'
import { ROAD, SLICE } from '@/core/config'
import { hashString } from '@/core/rng'

const SEED = hashString('lastlight')

describe('dilim olculeri (havuz degismezi)', () => {
  it('vertex sayisi sabit ve beklenen degerde', () => {
    expect(SLICE_VERTEX_COUNT).toBe((SLICE.rows + 1) * SLICE.columns)
  })

  it('index sayisi sabit ve beklenen degerde', () => {
    expect(SLICE_INDEX_COUNT).toBe(SLICE.rows * (SLICE.columns - 1) * 6)
    expect(sliceIndices()).toHaveLength(SLICE_INDEX_COUNT)
  })

  it('tampon boyutlari vertex sayisiyla tutarli', () => {
    const buffers = createSliceBuffers()
    expect(buffers.positions).toHaveLength(SLICE_VERTEX_COUNT * 3)
    expect(buffers.normals).toHaveLength(SLICE_VERTEX_COUNT * 3)
    expect(buffers.colors).toHaveLength(SLICE_VERTEX_COUNT * 3)
  })

  it('hangi dilim ve hangi seed olursa olsun boyut degismiyor', () => {
    // Havuzlama buna bagli: boyut degisirse tamponu yerinde guncelleyemeyiz.
    const buffers = createSliceBuffers()
    for (const index of [-40, 0, 1, 7, 999]) {
      for (const seed of [SEED, hashString('ankara')]) {
        writeSlice(seed, index, buffers)
        expect(buffers.positions).toHaveLength(SLICE_VERTEX_COUNT * 3)
      }
    }
  })

  it('index tamponu Uint16 sinirlarina siginiyor', () => {
    expect(SLICE_VERTEX_COUNT).toBeLessThan(65536)
    for (const value of sliceIndices()) {
      expect(value).toBeLessThan(SLICE_VERTEX_COUNT)
    }
  })
})

describe('yanal dagilim', () => {
  const offsets = lateralOffsets()

  it('koridorun tamamini kapsiyor', () => {
    expect(offsets[0]).toBeCloseTo(-ROAD.corridorHalfWidth, 3)
    expect(offsets[offsets.length - 1]).toBeCloseTo(ROAD.corridorHalfWidth, 3)
  })

  it('artan sirada', () => {
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!)
    }
  })

  it('merkeze gore simetrik', () => {
    for (let i = 0; i < offsets.length; i++) {
      expect(offsets[i]!).toBeCloseTo(-offsets[offsets.length - 1 - i]!, 5)
    }
  })

  it('yol kenarlarina birebir denk gelen vertex var', () => {
    // Asfalt ayri mesh degil; kenarin keskin cikmasi bu capalara bagli.
    const has = (value: number) => offsets.some((offset) => Math.abs(offset - value) < 1e-4)
    expect(has(ROAD.laneHalfWidth)).toBe(true)
    expect(has(-ROAD.laneHalfWidth)).toBe(true)
    expect(has(ROAD_EDGE)).toBe(true)
    expect(has(-ROAD_EDGE)).toBe(true)
  })

  it('merkez hattin uzerinde bir vertex var', () => {
    expect(offsets.some((offset) => offset === 0)).toBe(true)
  })

  it('gecis noktalarinda iki vertex birbirine cok yakin', () => {
    const sorted = Array.from(offsets).filter((offset) => offset > 0)
    const gapBefore = (value: number) => {
      const index = sorted.findIndex((offset) => Math.abs(offset - value) < 1e-4)
      return value - sorted[index - 1]!
    }
    expect(gapBefore(ROAD.laneHalfWidth)).toBeLessThan(0.25)
    expect(gapBefore(ROAD_EDGE)).toBeLessThan(0.25)
  })

  it('yola yakin yogun, uzaga seyrek', () => {
    // LOD'u bedavaya veren sey bu; duzgun dagilim olsa uzakta vertex israfi olur.
    const mid = Math.floor(offsets.length / 2)
    const nearSpacing = Math.abs(offsets[mid + 1]! - offsets[mid]!)
    const farSpacing = Math.abs(offsets[offsets.length - 1]! - offsets[offsets.length - 2]!)
    expect(farSpacing).toBeGreaterThan(nearSpacing * 4)
    expect(nearSpacing).toBeLessThan(4)
  })
})

describe('yol yakinsamasi', () => {
  it('asfalt ve banket ustunde arazi yuksekligi yol yuksekligine esit', () => {
    // Esit olmazsa yolun kenarinda duvar veya bosluk olusur.
    for (const s of [0, 312.5, -1400, 5000]) {
      const roadY = terrainHeight(SEED, s, 0)
      for (const t of [0, 1, -3, ROAD_EDGE, -ROAD_EDGE]) {
        expect(terrainHeight(SEED, s, t)).toBeCloseTo(roadY, 6)
      }
    }
  })

  it('karisim mesafesinin otesinde arazi yoldan ayrisiyor', () => {
    let maxDeviation = 0
    for (let s = 0; s < 3000; s += 25) {
      const roadY = terrainHeight(SEED, s, 0)
      maxDeviation = Math.max(maxDeviation, Math.abs(terrainHeight(SEED, s, 120) - roadY))
    }
    expect(maxDeviation).toBeGreaterThan(5)
  })

  it('yatayda surekli: yol kenarindan karisima gecis sicramiyor', () => {
    const s = 640
    let maxJump = 0
    let previous = terrainHeight(SEED, s, 0)
    for (let t = 0; t <= ROAD.corridorHalfWidth; t += 0.25) {
      const current = terrainHeight(SEED, s, t)
      maxJump = Math.max(maxJump, Math.abs(current - previous))
      previous = current
    }
    expect(maxJump).toBeLessThan(0.5)
  })
})

describe('dikis (en pahali hata sinifi)', () => {
  it('komsu dilimlerin ortak satiri birebir ayni', () => {
    // Bu esitlik bozulursa arazide ince isik cizgileri olusur ve gozle
    // teshis etmek saatler alir.
    const a = createSliceBuffers()
    const b = createSliceBuffers()
    const rowStride = SLICE.columns * 3
    const lastRowStart = SLICE.rows * rowStride

    for (const index of [0, 5, -3, 120]) {
      writeSlice(SEED, index, a)
      writeSlice(SEED, index + 1, b)

      const originA = sliceOriginX(index)
      const originB = sliceOriginX(index + 1)

      for (let i = 0; i < rowStride; i += 3) {
        // X yerel koordinatta tutuluyor, karsilastirma icin kaydirmayi geri ekliyoruz.
        expect(a.positions[lastRowStart + i]! + originA).toBeCloseTo(
          b.positions[i]! + originB,
          4,
        )
        expect(a.positions[lastRowStart + i + 1]).toBe(b.positions[i + 1])
        expect(a.positions[lastRowStart + i + 2]).toBe(b.positions[i + 2])
        expect(a.normals[lastRowStart + i]).toBe(b.normals[i])
        expect(a.normals[lastRowStart + i + 1]).toBe(b.normals[i + 1])
        expect(a.normals[lastRowStart + i + 2]).toBe(b.normals[i + 2])
      }
    }
  })
})

describe('determinizm ve havuz temizligi', () => {
  it('ayni dilim iki kez ayni tamponu uretir', () => {
    const a = createSliceBuffers()
    const b = createSliceBuffers()
    writeSlice(SEED, 17, a)
    writeSlice(SEED, 17, b)
    expect(a.positions).toEqual(b.positions)
    expect(a.normals).toEqual(b.normals)
    expect(a.colors).toEqual(b.colors)
  })

  it('geri donusturulen tamponda onceki dilimden kalinti kalmiyor', () => {
    // Havuz mantiginin dogrulugu buna bagli.
    const recycled = createSliceBuffers()
    const fresh = createSliceBuffers()
    writeSlice(SEED, 3, recycled)
    writeSlice(SEED, 88, recycled)
    writeSlice(SEED, 88, fresh)
    expect(recycled.positions).toEqual(fresh.positions)
    expect(recycled.normals).toEqual(fresh.normals)
    expect(recycled.colors).toEqual(fresh.colors)
  })
})

describe('vertex verisi sagligi', () => {
  const buffers = createSliceBuffers()
  writeSlice(SEED, 12, buffers)

  it('NaN yok', () => {
    for (const array of [buffers.positions, buffers.normals, buffers.colors]) {
      for (const value of array) expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('ucgen sarim yonu yukari bakiyor', () => {
    // Sarim ters olursa arazi ici disina doner: yukaridan bakinca arka yuzler
    // kirpilir ve zeminin icinden gokyuzu gorunur. Normal attribute'u dogru
    // olsa bile bu olur, cunku kirpma sarima bakiyor.
    const indices = sliceIndices()
    const positions = buffers.positions

    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const i0 = indices[triangle]! * 3
      const i1 = indices[triangle + 1]! * 3
      const i2 = indices[triangle + 2]! * 3

      const ax = positions[i1]! - positions[i0]!
      const az = positions[i1 + 2]! - positions[i0 + 2]!
      const bx = positions[i2]! - positions[i0]!
      const bz = positions[i2 + 2]! - positions[i0 + 2]!

      // (a x b).y
      const normalY = az * bx - ax * bz
      expect(normalY).toBeGreaterThan(0)
    }
  })

  it('normaller birim uzunlukta ve yukari bakiyor', () => {
    for (let i = 0; i < buffers.normals.length; i += 3) {
      const x = buffers.normals[i]!
      const y = buffers.normals[i + 1]!
      const z = buffers.normals[i + 2]!
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4)
      expect(y).toBeGreaterThan(0)
    }
  })

  it('kenar cizgisi asfalttan belirgin sekilde acik', () => {
    // Bir yolu yol yapan sey cizgileridir; cizgi asfalta karisirsa yol
    // toprak seride benziyor.
    const offsets = lateralOffsets()
    const row = 5
    const luminance = (column: number) => {
      const base = (row * SLICE.columns + column) * 3
      return buffers.colors[base]! + buffers.colors[base + 1]! + buffers.colors[base + 2]!
    }

    let lineColumn = -1
    let asphaltColumn = -1
    for (let column = 0; column < SLICE.columns; column++) {
      const distance = Math.abs(offsets[column]!)
      if (distance > 4.0 && distance < 4.3) lineColumn = column
      if (distance < 2) asphaltColumn = column
    }

    expect(lineColumn).toBeGreaterThanOrEqual(0)
    expect(asphaltColumn).toBeGreaterThanOrEqual(0)
    expect(luminance(lineColumn)).toBeGreaterThan(luminance(asphaltColumn) * 4)
  })

  it('asfalt araziden belirgin sekilde koyu', () => {
    const offsets = lateralOffsets()
    const centerColumn = Math.floor(SLICE.columns / 2)
    const edgeColumn = SLICE.columns - 1
    const luminance = (column: number) => {
      const base = (5 * SLICE.columns + column) * 3
      return buffers.colors[base]! + buffers.colors[base + 1]! + buffers.colors[base + 2]!
    }
    expect(Math.abs(offsets[centerColumn]!)).toBeLessThan(ROAD.laneHalfWidth)
    expect(luminance(centerColumn)).toBeLessThan(luminance(edgeColumn) * 0.5)
  })

  it('renkler [0,1] araliginda', () => {
    for (const value of buffers.colors) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('dilim kendi yerel X araliginda kaliyor', () => {
    // Yerel koordinat, uzun surus sonrasi float32 hassasiyetini koruyor.
    for (let i = 0; i < buffers.positions.length; i += 3) {
      expect(Math.abs(buffers.positions[i]!)).toBeLessThan(SLICE.length + ROAD.corridorHalfWidth)
    }
  })
})
