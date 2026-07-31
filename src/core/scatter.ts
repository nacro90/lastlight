/**
 * Serpistirme: agac, cali ve tas yerlesimi.
 *
 * Yerlesim dilim indeksine bagli olarak durumsuz uretiliyor, yani bir dilim
 * havuzda geri donusup tekrar uretildiginde icindeki agaclar tam olarak ayni
 * yerde duruyor. Bu, yol ve arazi ile ayni sozlesme.
 *
 * Her dilim her tur icin sabit sayida yuva ayiriyor. Gorunmeyecek nesneler
 * silinmiyor, sifir olcekle saklaniyor. Bunun sebebi instanced mesh: yuva
 * indeksi (dilimYuvasi * adet + i) formuluyle hesaplanabiliyor ve hicbir
 * defter tutmaya gerek kalmiyor.
 *
 * Yogunluk alcak frekansli bir gurultu alanindan geliyor. Duzgun serpistirme
 * yapay duruyor; bu alan ormanlik ve aciklik uretiyor.
 */

import { ROAD, SCATTER, SLICE } from './config'
import { fbm2D } from './noise'
import { clamp01, smoothstep } from './math'
import { ROAD_EDGE, roadHeading, roadLateral } from './road'
import { rngFrom } from './rng'
import { terrainHeight } from './terrain'

/** Nesne basina yazilan alan sayisi: x, y, z, olcek, donus. */
export const SCATTER_STRIDE = 5

export interface SliceScatter {
  trees: Float32Array
  bushes: Float32Array
  rocks: Float32Array
}

export function createSliceScatter(): SliceScatter {
  return {
    trees: new Float32Array(SCATTER.trees * SCATTER_STRIDE),
    bushes: new Float32Array(SCATTER.bushes * SCATTER_STRIDE),
    rocks: new Float32Array(SCATTER.rocks * SCATTER_STRIDE),
  }
}

/** Tur basina farkli rastgelelik akisi; yoksa hepsi ayni yere dizilir. */
const SALT_TREE = 0x1a2b
const SALT_BUSH = 0x3c4d
const SALT_ROCK = 0x5e6f

const DENSITY_SEED = 0x4d7b_1e93
const DENSITY_SCALE = 520

const MIN_DISTANCE = ROAD_EDGE + SCATTER.clearance
const MAX_DISTANCE = ROAD.corridorHalfWidth * SCATTER.outerMargin

/** Yola yakin yogunlasma. Buyuk deger = daha cok nesne yol kenarinda. */
const TREE_BIAS = 1.9
const BUSH_BIAS = 1.5
const ROCK_BIAS = 1.2

/** Agaclarin dikilemedigi egim. Bu ustunde yamac cok dik. */
const TREE_MAX_SLOPE = 0.62

const TREE_SCALE = { min: 0.72, max: 1.45 }
const BUSH_SCALE = { min: 0.6, max: 1.25 }
const ROCK_SCALE = { min: 0.45, max: 1.5 }

/** Egim tahmini icin ornekleme adimi (metre). */
const SLOPE_STEP = 2.2

function localSlope(seed: number, s: number, t: number): number {
  const here = terrainHeight(seed, s, t)
  const alongS = terrainHeight(seed, s + SLOPE_STEP, t) - here
  const alongT = terrainHeight(seed, s, t + SLOPE_STEP) - here
  return Math.hypot(alongS, alongT) / SLOPE_STEP
}

/** Yol uzayindaki (s,t) noktasinin dunya konumu. */
function placeWorld(seed: number, s: number, t: number): { x: number; z: number } {
  const heading = roadHeading(seed, s)
  return {
    x: s - t * Math.sin(heading),
    z: roadLateral(seed, s) + t * Math.cos(heading),
  }
}

interface KindOptions {
  salt: number
  bias: number
  scale: { min: number; max: number }
  /** Egime gore gizlenme. Agaclar dik yamaca dikilmiyor. */
  maxSlope: number | null
  /** Yogunluk alanina duyarlilik. 0 ise her zaman gorunur. */
  densityWeight: number
}

function writeKind(
  seed: number,
  sliceIndex: number,
  count: number,
  out: Float32Array,
  options: KindOptions,
): void {
  const sliceStart = sliceIndex * SLICE.length

  for (let i = 0; i < count; i++) {
    const random = rngFrom(seed, sliceIndex, options.salt, i)

    const s = sliceStart + random() * SLICE.length
    const side = random() < 0.5 ? -1 : 1
    const spread = Math.pow(random(), options.bias)
    const t = side * (MIN_DISTANCE + (MAX_DISTANCE - MIN_DISTANCE) * spread)

    const world = placeWorld(seed, s, t)
    const height = terrainHeight(seed, s, t)

    let scale = options.scale.min + random() * (options.scale.max - options.scale.min)

    if (options.densityWeight > 0) {
      const field = clamp01(
        0.5 + 0.5 * fbm2D(seed ^ DENSITY_SEED, world.x / DENSITY_SCALE, world.z / DENSITY_SCALE, 2),
      )
      const threshold = 1 - options.densityWeight + options.densityWeight * field
      if (random() > threshold) scale = 0
    }

    if (scale > 0 && options.maxSlope !== null) {
      const slope = localSlope(seed, s, t)
      // Kesin esik yerine yumusak gecis: orman siniri cizgi gibi bitmiyor.
      const keep = 1 - smoothstep(options.maxSlope * 0.7, options.maxSlope, slope)
      if (random() > keep) scale = 0
    }

    const offset = i * SCATTER_STRIDE
    out[offset] = world.x
    out[offset + 1] = height
    out[offset + 2] = world.z
    out[offset + 3] = scale
    out[offset + 4] = random() * Math.PI * 2
  }
}

export function writeSliceScatter(seed: number, sliceIndex: number, out: SliceScatter): void {
  writeKind(seed, sliceIndex, SCATTER.trees, out.trees, {
    salt: SALT_TREE,
    bias: TREE_BIAS,
    scale: TREE_SCALE,
    maxSlope: TREE_MAX_SLOPE,
    densityWeight: 0.75,
  })

  writeKind(seed, sliceIndex, SCATTER.bushes, out.bushes, {
    salt: SALT_BUSH,
    bias: BUSH_BIAS,
    scale: BUSH_SCALE,
    maxSlope: null,
    densityWeight: 0.35,
  })

  writeKind(seed, sliceIndex, SCATTER.rocks, out.rocks, {
    salt: SALT_ROCK,
    bias: ROCK_BIAS,
    scale: ROCK_SCALE,
    maxSlope: null,
    densityWeight: 0.2,
  })
}
