/**
 * Arazi, dunya izgarasi olarak degil yol uzayinda bir serit olarak uretiliyor.
 * Her vertex (s,t) ile tanimli: s yol boyunca mesafe, t yandan sapma.
 *
 * Bunun iki kazanci var. Birincisi "bu nokta yola ne kadar yakin" sorusu hic
 * dogmuyor, cunku t zaten o cevap; spline yaklasiminda bu soru en yakin nokta
 * aramasi gerektirir ve yanlis segmenti buldugunda arazide yarik acar.
 * Ikincisi dikis garantisi: yukseklik (s,t)'nin saf fonksiyonu oldugu icin,
 * komsu iki dilim ayni s degerinde ayni satiri birebir ayni uretiyor.
 */

import { fbm2D } from './noise'
import { clamp01, lerp, smoothstep } from './math'
import { ROAD, SLICE } from './config'
import { ROAD_EDGE, roadElevation, roadHeading, roadLateral, toRoadSpace } from './road'

export const SLICE_VERTEX_COUNT = (SLICE.rows + 1) * SLICE.columns
export const SLICE_INDEX_COUNT = SLICE.rows * (SLICE.columns - 1) * 6

/** Satir araligi (metre). */
const ROW_STEP = SLICE.length / SLICE.rows

/** Normal hesabi icin bir onceki ve bir sonraki satir da gerekiyor. */
const EXTENDED_ROWS = SLICE.rows + 3

const RELIEF_AMPLITUDE = 19
const RELIEF_SCALE = 210
const RELIEF_SEED = 0x2b1f_49d3

/** Koridor kenarinin yukselmesi. Dunyanin kenarini sirtlara cevirip saklıyor. */
const VALLEY_RISE = 64
const VALLEY_SCALE = 640
const VALLEY_SEED = 0x71c4_0a95

const TINT_SCALE = 95
const TINT_SEED = 0x0d9a_3e57

/**
 * Temel renkler kasitli olarak soluk ve zeytin tonunda. Isinmayi gunes
 * yapiyor; malzemeyi de sicak yaparsak iki sicaklik birbirini yiyor.
 */
const GRASS: readonly [number, number, number] = [0.23, 0.26, 0.17]
const DRY: readonly [number, number, number] = [0.44, 0.37, 0.24]
const ROCK: readonly [number, number, number] = [0.3, 0.28, 0.27]
const ASPHALT: readonly [number, number, number] = [0.05, 0.047, 0.055]
const GRAVEL: readonly [number, number, number] = [0.29, 0.26, 0.21]
/** Kenar cizgisi. Bloom esigini asmayacak kadar sicak kirik beyaz. */
const MARKING: readonly [number, number, number] = [0.52, 0.47, 0.4]

/** Kenar cizgisinin serit kenarindan iceriye mesafesi. */
const LINE_OUTER_INSET = 0.35
const LINE_INNER_INSET = 0.55
/** Cizginin iki yanindaki koruma capalari; keskinligi bunlar sagliyor. */
const LINE_GUARD = 0.1

/** Koridor kenarina dogru seyrelmenin sertligi. */
const RAMP_EXPONENT = 2.2

/**
 * Yol kenarlarina birebir denk gelen sabit t degerleri. Asfalt ayri bir mesh
 * degil, arazinin kendisi: |t| yol kenarinin icindeyken arazi zaten tam olarak
 * yol yuksekliginde. Kenarin keskin cikmasi icin gecis noktalarina iki vertex
 * cok yakin konuluyor (4.45 ile 4.6, ve 6.65 ile 6.8); aradaki 15 santimlik
 * bosluk, vertex rengi enterpolasyonunun bulanik bir kenar uretmesini onluyor.
 */
function roadAnchors(): number[] {
  const lineOuter = ROAD.laneHalfWidth - LINE_OUTER_INSET
  const lineInner = ROAD.laneHalfWidth - LINE_INNER_INSET
  return [
    1.6,
    3.2,
    lineInner - LINE_GUARD,
    lineInner,
    lineOuter,
    lineOuter + LINE_GUARD,
    ROAD.laneHalfWidth - 0.15,
    ROAD.laneHalfWidth,
    5.8,
    ROAD_EDGE - 0.15,
    ROAD_EDGE,
  ]
}

/** Verilen yanal mesafe kenar cizgisi bandinin icinde mi. */
function isEdgeLine(distance: number): boolean {
  const epsilon = 1e-4
  return (
    distance >= ROAD.laneHalfWidth - LINE_INNER_INSET - epsilon &&
    distance <= ROAD.laneHalfWidth - LINE_OUTER_INSET + epsilon
  )
}

let cachedOffsets: Float32Array | null = null
let cachedIndices: Uint16Array | null = null

/**
 * Kolon basina t degerleri. Yolun etrafinda sabit capalar, otesinde hizla
 * seyrelen bir rampa; LOD bedavaya geliyor.
 */
export function lateralOffsets(): Float32Array {
  if (cachedOffsets) return cachedOffsets

  const half = (SLICE.columns - 1) / 2
  const anchors = roadAnchors()
  const rampCount = half - anchors.length

  const values: number[] = [0, ...anchors]
  for (let i = 1; i <= rampCount; i++) {
    const progress = i / rampCount
    values.push(ROAD_EDGE + (ROAD.corridorHalfWidth - ROAD_EDGE) * Math.pow(progress, RAMP_EXPONENT))
  }

  const offsets = new Float32Array(SLICE.columns)
  for (let i = 0; i <= half; i++) {
    const value = values[i] as number
    offsets[half + i] = value
    offsets[half - i] = -value
  }

  cachedOffsets = offsets
  return offsets
}

/**
 * Index tamponu her dilim icin ayni oldugu icin bir kez uretilip butun
 * geometriler arasinda paylasiliyor.
 */
export function sliceIndices(): Uint16Array {
  if (cachedIndices) return cachedIndices

  const indices = new Uint16Array(SLICE_INDEX_COUNT)
  let write = 0

  for (let j = 0; j < SLICE.rows; j++) {
    for (let k = 0; k < SLICE.columns - 1; k++) {
      const a = j * SLICE.columns + k
      const b = a + 1
      const c = a + SLICE.columns
      const d = c + 1

      // Sarim yonu ust yuz yukari bakacak sekilde: (b-a) yanal, (c-a) ileri,
      // ve yanal x ileri = +Y. Ters sirada yazmak arazinin icini disina cevirir.
      indices[write++] = a
      indices[write++] = b
      indices[write++] = c
      indices[write++] = b
      indices[write++] = d
      indices[write++] = c
    }
  }

  cachedIndices = indices
  return indices
}

export function sliceOriginX(sliceIndex: number): number {
  return sliceIndex * SLICE.length
}

export interface SliceBuffers {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
}

export function createSliceBuffers(): SliceBuffers {
  return {
    positions: new Float32Array(SLICE_VERTEX_COUNT * 3),
    normals: new Float32Array(SLICE_VERTEX_COUNT * 3),
    colors: new Float32Array(SLICE_VERTEX_COUNT * 3),
  }
}

/**
 * Yukseklik alani. |t| yol kenarinin icindeyken tam olarak yol yuksekligini
 * dondurur; disari dogru smoothstep ile kabartmaya karisir.
 */
function heightField(seed: number, t: number, worldX: number, worldZ: number, roadY: number): number {
  const distance = Math.abs(t)
  const weight = smoothstep(ROAD_EDGE, ROAD_EDGE + ROAD.blendDistance, distance)
  if (weight === 0) return roadY

  const relief =
    RELIEF_AMPLITUDE * fbm2D(seed ^ RELIEF_SEED, worldX / RELIEF_SCALE, worldZ / RELIEF_SCALE, 4)

  const edgeRatio = clamp01(
    (distance - ROAD_EDGE) / (ROAD.corridorHalfWidth - ROAD_EDGE),
  )
  const valleyNoise = fbm2D(seed ^ VALLEY_SEED, worldX / VALLEY_SCALE, worldZ / VALLEY_SCALE, 2)
  const valley = VALLEY_RISE * edgeRatio * edgeRatio * (0.55 + 0.45 * valleyNoise)

  return roadY + weight * (relief + valley)
}

/** Tek nokta sorgusu. Arac zemin yuksekligi icin bunu kullaniyor. */
export function terrainHeight(seed: number, s: number, t: number): number {
  const heading = roadHeading(seed, s)
  const worldX = s - t * Math.sin(heading)
  const worldZ = roadLateral(seed, s) + t * Math.cos(heading)
  return heightField(seed, t, worldX, worldZ, roadElevation(seed, s))
}

/**
 * Dunya koordinatinda yukseklik sorgusu. Ters donusum sabit nokta
 * iterasyonuyla yapiliyor; kare basina birkac cagri icin bedeli onemsiz.
 */
export function terrainHeightAtWorld(seed: number, x: number, z: number): number {
  const { s, t } = toRoadSpace(seed, x, z)
  return terrainHeight(seed, s, t)
}

/** Genisletilmis izgara: normaller icin dilim sinirinin bir satir otesi. */
const scratch = new Float64Array(EXTENDED_ROWS * SLICE.columns * 3)

function colorAt(
  seed: number,
  t: number,
  worldX: number,
  worldZ: number,
  heightAboveRoad: number,
  normalY: number,
  out: SliceBuffers,
  offset: number,
): void {
  // Asfalt, cizgi ve banket geometrinin capa noktalari sayesinde keskin
  // ayrisiyor: gecis noktalarinda iki vertex on santim arayla duruyor.
  const distance = Math.abs(t)
  if (isEdgeLine(distance)) {
    for (let channel = 0; channel < 3; channel++) out.colors[offset + channel] = MARKING[channel]!
    return
  }
  if (distance < ROAD.laneHalfWidth - 0.05) {
    for (let channel = 0; channel < 3; channel++) out.colors[offset + channel] = ASPHALT[channel]!
    return
  }
  if (distance < ROAD_EDGE - 0.05) {
    for (let channel = 0; channel < 3; channel++) out.colors[offset + channel] = GRAVEL[channel]!
    return
  }

  const tint = fbm2D(seed ^ TINT_SEED, worldX / TINT_SCALE, worldZ / TINT_SCALE, 2)
  const dryness = clamp01(
    0.34 + 0.5 * clamp01(heightAboveRoad / (RELIEF_AMPLITUDE + VALLEY_RISE)) + 0.28 * tint,
  )
  const rockiness = smoothstep(0.3, 0.62, 1 - normalY)

  for (let channel = 0; channel < 3; channel++) {
    const soil = lerp(GRASS[channel]!, DRY[channel]!, dryness)
    out.colors[offset + channel] = clamp01(lerp(soil, ROCK[channel]!, rockiness))
  }
}

/**
 * Dilimi verilen tampona yazar. Yeni tampon tahsis etmiyor: havuzlama bunun
 * uzerine kurulu, ve sonsuz dunyada takilmanin asil sebebi cop toplayicidir.
 */
export function writeSlice(seed: number, sliceIndex: number, out: SliceBuffers): void {
  const originX = sliceOriginX(sliceIndex)
  const offsets = lateralOffsets()
  const columns = SLICE.columns

  // Genisletilmis izgarayi dolduruyoruz. Satir basina yol verisi bir kez
  // hesaplaniyor; vertex basina hesaplamak butun butceyi yerdi.
  for (let e = 0; e < EXTENDED_ROWS; e++) {
    const s = originX + (e - 1) * ROW_STEP
    const heading = roadHeading(seed, s)
    const sinHeading = Math.sin(heading)
    const cosHeading = Math.cos(heading)
    const lateral = roadLateral(seed, s)
    const roadY = roadElevation(seed, s)

    for (let k = 0; k < columns; k++) {
      const t = offsets[k]!
      const worldX = s - t * sinHeading
      const worldZ = lateral + t * cosHeading
      const base = (e * columns + k) * 3
      scratch[base] = worldX
      scratch[base + 1] = heightField(seed, t, worldX, worldZ, roadY)
      scratch[base + 2] = worldZ
    }
  }

  for (let j = 0; j <= SLICE.rows; j++) {
    const e = j + 1
    const rowBase = e * columns
    const previousRow = (e - 1) * columns
    const nextRow = (e + 1) * columns

    for (let k = 0; k < columns; k++) {
      const here = (rowBase + k) * 3
      const back = (previousRow + k) * 3
      const forward = (nextRow + k) * 3
      const left = (rowBase + Math.max(0, k - 1)) * 3
      const right = (rowBase + Math.min(columns - 1, k + 1)) * 3

      const duX = scratch[forward]! - scratch[back]!
      const duY = scratch[forward + 1]! - scratch[back + 1]!
      const duZ = scratch[forward + 2]! - scratch[back + 2]!

      const dvX = scratch[right]! - scratch[left]!
      const dvY = scratch[right + 1]! - scratch[left + 1]!
      const dvZ = scratch[right + 2]! - scratch[left + 2]!

      // dv x du yukari bakiyor: du ileri (+s), dv yana (+t).
      let nx = dvY * duZ - dvZ * duY
      let ny = dvZ * duX - dvX * duZ
      let nz = dvX * duY - dvY * duX

      const length = Math.hypot(nx, ny, nz) || 1
      nx /= length
      ny /= length
      nz /= length
      if (ny < 0) {
        nx = -nx
        ny = -ny
        nz = -nz
      }

      const vertex = (j * columns + k) * 3
      const worldX = scratch[here]!
      const worldY = scratch[here + 1]!
      const worldZ = scratch[here + 2]!

      // X yerel tutuluyor: uzun surus sonrasi float32 hassasiyeti korunuyor.
      out.positions[vertex] = worldX - originX
      out.positions[vertex + 1] = worldY
      out.positions[vertex + 2] = worldZ

      out.normals[vertex] = nx
      out.normals[vertex + 1] = ny
      out.normals[vertex + 2] = nz

      const roadY = scratch[(rowBase + Math.floor(columns / 2)) * 3 + 1]!
      colorAt(seed, offsets[k]!, worldX, worldZ, worldY - roadY, ny, out, vertex)
    }
  }
}
