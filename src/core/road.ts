/**
 * Yol, ileri eksenin bir fonksiyonunun grafigi olarak tanimli:
 * s dogrudan X eksenidir, yanal kayma ve yukseklik s'in fonksiyonudur.
 *
 * Bu, spline tabanli bir yola gore kasitli bir kisitlama ve uc sey kazandiriyor.
 * Birincisi (s,t) -> dunya donusumu kapali formda ve tersi ucuza cevrilebilir;
 * yani "spline uzerindeki en yakin nokta" problemi hic dogmuyor. Ikincisi yol
 * asla geri donmuyor, dolayisiyla gunes her zaman onde kaliyor ve butun
 * atmosfer kurgusu ayakta duruyor. Ucuncusu egim ve egrilik sinirlari
 * analitik olarak garanti edilebiliyor, yani serit kendisiyle cakisamiyor.
 *
 * Bedeli: yol donemiyor, sadece salindiyor. Istenen his de tam olarak bu.
 */

import { fbm1D } from './noise'
import { LIMITS, ROAD } from './config'

/** Bir value noise oktavinin egim ve egrilik ust sinirlari (quintic fade). */
const NOISE_MAX_SLOPE = 3.75
const NOISE_MAX_CURVATURE = 11.547_005

const OCTAVES = 3
const LACUNARITY = 2
const GAIN = 0.5

/** fBm turev ust sinirlari; genlikler bunlardan geriye dogru turetiliyor. */
function fbmBounds(octaves: number, lacunarity: number, gain: number) {
  let sumAmp = 0
  let sumAmpFreq = 0
  let sumAmpFreqSq = 0
  let amplitude = 1
  let frequency = 1

  for (let o = 0; o < octaves; o++) {
    sumAmp += amplitude
    sumAmpFreq += amplitude * frequency
    sumAmpFreqSq += amplitude * frequency * frequency
    amplitude *= gain
    frequency *= lacunarity
  }

  return {
    slope: (sumAmpFreq / sumAmp) * NOISE_MAX_SLOPE,
    curvature: (sumAmpFreqSq / sumAmp) * NOISE_MAX_CURVATURE,
  }
}

const BOUNDS = fbmBounds(OCTAVES, LACUNARITY, GAIN)

const LATERAL_WAVELENGTH = 1200
const ELEVATION_WAVELENGTH = 1800

/**
 * Genlikler sinirlardan turetiliyor, elle secilmiyor. Boylece egim ve sapma
 * sinirlarinin asilmasi matematiksel olarak mumkun degil; testler bunu
 * dogrulamakla kalmiyor, tasarim bunu garanti ediyor.
 */
const LATERAL_AMPLITUDE = (Math.tan(LIMITS.maxHeading) * LATERAL_WAVELENGTH) / BOUNDS.slope
const ELEVATION_AMPLITUDE = (LIMITS.maxGrade * ELEVATION_WAVELENGTH) / BOUNDS.slope

/** Yanal ve dusey alanlar ayri tohum kullaniyor, yoksa ikisi birlikte salinir. */
const LATERAL_SEED_OFFSET = 0
const ELEVATION_SEED_OFFSET = 0x5f3a_7c11

/** Turev ve egrilik icin merkezi fark adimi (metre). */
const H = 0.5

/** Maksimum egrilikte yaklasik 4 derece kanat verecek katsayi. */
const BANK_GAIN = 28.8
const MAX_BANK = (4.5 * Math.PI) / 180

export interface RoadSample {
  /** Yol boyunca mesafe. Ileri eksen ile ayni sayidir. */
  s: number
  x: number
  y: number
  z: number
  /** Ileri eksenden sapma acisi (radyan). */
  heading: number
  /** dy/ds. */
  grade: number
  /** Isaretli egrilik (1/yaricap). */
  curvature: number
  /** Yol yuzeyinin yana yatma acisi (radyan). */
  banking: number
}

function lateralAt(seed: number, s: number): number {
  return (
    LATERAL_AMPLITUDE * fbm1D(seed + LATERAL_SEED_OFFSET, s / LATERAL_WAVELENGTH, OCTAVES, LACUNARITY, GAIN)
  )
}

function elevationAt(seed: number, s: number): number {
  return (
    ELEVATION_AMPLITUDE *
    fbm1D(seed + ELEVATION_SEED_OFFSET, s / ELEVATION_WAVELENGTH, OCTAVES, LACUNARITY, GAIN)
  )
}

/** Merkezi fark. Analitik turev yerine bu secildi: uc ornek, sifir karmasiklik,
 *  ve ust sinirlari birebir koruyor. */
function headingAt(seed: number, s: number): number {
  const dz = (lateralAt(seed, s + H) - lateralAt(seed, s - H)) / (2 * H)
  return Math.atan(dz)
}

/** Merkez hattin yanal kaymasi. Arazi bunu satir basina bir kez okuyor. */
export function roadLateral(seed: number, s: number): number {
  return lateralAt(seed, s)
}

/** Merkez hattin yuksekligi. */
export function roadElevation(seed: number, s: number): number {
  return elevationAt(seed, s)
}

/** Merkez hattin sapma acisi. */
export function roadHeading(seed: number, s: number): number {
  return headingAt(seed, s)
}

export function sampleRoad(seed: number, s: number): RoadSample {
  const z = lateralAt(seed, s)
  const y = elevationAt(seed, s)

  const zBack = lateralAt(seed, s - H)
  const zForward = lateralAt(seed, s + H)
  const dz = (zForward - zBack) / (2 * H)
  const ddz = (zForward - 2 * z + zBack) / (H * H)

  const grade = (elevationAt(seed, s + H) - elevationAt(seed, s - H)) / (2 * H)
  const slopeSq = 1 + dz * dz
  const curvature = ddz / (slopeSq * Math.sqrt(slopeSq))

  const banking = Math.max(-MAX_BANK, Math.min(MAX_BANK, -curvature * BANK_GAIN))

  return {
    s,
    x: s,
    y,
    z,
    heading: Math.atan(dz),
    grade,
    curvature,
    banking,
  }
}

/** Yol uzayindaki (s,t) noktasini dunya koordinatina cevirir. */
export function toWorld(seed: number, s: number, t: number): { x: number; y: number; z: number } {
  const heading = headingAt(seed, s)
  return {
    x: s - t * Math.sin(heading),
    y: elevationAt(seed, s),
    z: lateralAt(seed, s) + t * Math.cos(heading),
  }
}

const INVERSE_MAX_ITERATIONS = 12
const INVERSE_TOLERANCE = 1e-6

/**
 * Dunya koordinatindan yol uzayina donus. Sabit nokta iterasyonu, buzulme
 * carpani yaklasik 0.16 oldugu icin birkac adimda yakinsiyor. Arac yola
 * yakinken iki uc adim yetiyor.
 *
 * Bu fonksiyonun varligi, spline yaklasiminda karsimiza cikacak "en yakin
 * nokta" aramasinin yerini aliyor; grafik formulasyonunun asil kazanci bu.
 */
export function toRoadSpace(seed: number, x: number, z: number): { s: number; t: number } {
  let s = x
  let t = 0

  for (let i = 0; i < INVERSE_MAX_ITERATIONS; i++) {
    const heading = headingAt(seed, s)
    const nextT = (z - lateralAt(seed, s)) / Math.cos(heading)
    const nextS = x + nextT * Math.sin(heading)

    const delta = Math.abs(nextS - s) + Math.abs(nextT - t)
    s = nextS
    t = nextT
    if (delta < INVERSE_TOLERANCE) break
  }

  return { s, t }
}

/** Yolun toplam yari genisligi (asfalt + banket). */
export const ROAD_EDGE = ROAD.laneHalfWidth + ROAD.shoulderWidth
