/**
 * Durumsuz value noise. Perlin veya simplex yerine value noise secildi:
 * yeterince yumusak, cok daha ucuz, ve kafes degerleri dogrudan hash'ten
 * geldigi icin herhangi bir noktayi komsularindan bagimsiz ornekleyebiliyoruz.
 * Dilim havuzlamasi tam olarak bunu gerektiriyor.
 */

import { hashInts } from './rng'

const UINT32_MAX = 0xffffffff

/** Oktavlar arasi tohum kaymasi. o=0 icin tohum aynen korunur. */
const OCTAVE_STRIDE = 1013904223

/** Kafes noktasinda [-1,1] araliginda deger. */
function lattice1(seed: number, i: number): number {
  return (hashInts(seed, i) / UINT32_MAX) * 2 - 1
}

function lattice2(seed: number, i: number, j: number): number {
  return (hashInts(seed, i, j) / UINT32_MAX) * 2 - 1
}

/**
 * Quintic fade. Kubik smoothstep yerine bu secildi cunku ikinci turevi de
 * kafes noktalarinda sifir; yol yuksekligi bundan turedigi icin ivme
 * sureksizligi araci gorunur sekilde sarsiyor.
 */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function noise1D(seed: number, x: number): number {
  const i = Math.floor(x)
  const t = fade(x - i)
  const a = lattice1(seed, i)
  const b = lattice1(seed, i + 1)
  return a + (b - a) * t
}

export function noise2D(seed: number, x: number, y: number): number {
  const i = Math.floor(x)
  const j = Math.floor(y)
  const tx = fade(x - i)
  const ty = fade(y - j)

  const a = lattice2(seed, i, j)
  const b = lattice2(seed, i + 1, j)
  const c = lattice2(seed, i, j + 1)
  const d = lattice2(seed, i + 1, j + 1)

  const top = a + (b - a) * tx
  const bottom = c + (d - c) * tx
  return top + (bottom - top) * ty
}

/** Normalize edilmis fBm; cikti her zaman [-1,1] araliginda kalir. */
export function fbm1D(seed: number, x: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let sum = 0
  let norm = 0
  let amplitude = 1
  let frequency = 1

  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise1D(seed + o * OCTAVE_STRIDE, x * frequency)
    norm += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }

  return sum / norm
}

export function fbm2D(
  seed: number,
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
): number {
  let sum = 0
  let norm = 0
  let amplitude = 1
  let frequency = 1

  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise2D(seed + o * OCTAVE_STRIDE, x * frequency, y * frequency)
    norm += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }

  return sum / norm
}
