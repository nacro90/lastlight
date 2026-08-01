/**
 * Kesikli orta cizgi.
 *
 * Kenar cizgileri arazi geometrisinin vertex renklerinde tasiniyor, ama orta
 * cizgi ayni yolla yapilamiyor: satirlar iki bucuk metre aralikli ve alti
 * metrelik bir kesik desenini vertex renkleriyle uretmek desen frekansinin
 * ornekleme frekansinin ustune cikmasi demek, yani takma. Cizgiler bu yuzden
 * ayri ornekler halinde yerlestiriliyor: dilim basina sabit sayida yamuk,
 * asfaltin bir bucuk santim ustunde.
 *
 * Desen fazi global s'ten turetiliyor, dilim indeksinden degil. Boylece dikiste
 * kayma olmuyor; ayni sebeple donem dilim uzunlugunun tam boleni olmak zorunda
 * ve bu test ediliyor.
 *
 * Kesikli cizginin isi susleme degil: hiz duyusu. Sabit aralikli bir desen
 * yanindan gectikce hizi okutuyor, ve bu bilgi hiz gostergesinden daha once
 * geliyor.
 */

import { SLICE } from './config'
import { roadHeading } from './road'
import { terrainHeight } from './terrain'
import { toWorld } from './road'

export const MARKING = {
  /**
   * Dilim basina cizgi sayisi. Donem buradan turetiliyor, elle secilmiyor:
   * donem dilim uzunlugunun tam boleni olmazsa dikiste desen aksiyor.
   */
  perSlice: 4,
  /** Bir cizginin uzunlugu (metre). Doluluk orani ucte bir civari. */
  dashLength: 2.1,
  /** Cizgi yari genisligi (metre). */
  halfWidth: 0.09,
  /**
   * Asfaltin ustune kaldirma (metre). Sifir olursa yuzeyle ayni derinlikte
   * kalip z-fighting yapiyor; fazla olursa alcak gunes altinda kendi golgesini
   * dusuruyor.
   */
  lift: 0.015,
} as const

/** Iki cizgi basi arasindaki mesafe (metre). */
export const MARKING_PERIOD = SLICE.length / MARKING.perSlice

/** Cizgi basina alan sayisi: x, y, z, yon, egim. */
export const MARKING_STRIDE = 5

export function createSliceMarkings(): Float32Array {
  return new Float32Array(MARKING.perSlice * MARKING_STRIDE)
}

/** Egim icin merkez hattin ileri yondeki turevi. */
const GRADE_EPSILON = 0.5

export function writeSliceMarkings(seed: number, sliceIndex: number, out: Float32Array): void {
  const base = sliceIndex * SLICE.length

  for (let i = 0; i < MARKING.perSlice; i++) {
    // Cizgi merkezi donemin ortasinda: boylece dilim sinirina hicbir cizgi
    // denk gelmiyor ve kirpilma sorusu hic dogmuyor.
    const s = base + (i + 0.5) * MARKING_PERIOD
    const world = toWorld(seed, s, 0)

    const behind = terrainHeight(seed, s - GRADE_EPSILON, 0)
    const ahead = terrainHeight(seed, s + GRADE_EPSILON, 0)
    const grade = (ahead - behind) / (2 * GRADE_EPSILON)

    const offset = i * MARKING_STRIDE
    out[offset] = world.x
    out[offset + 1] = terrainHeight(seed, s, 0) + MARKING.lift
    out[offset + 2] = world.z
    out[offset + 3] = roadHeading(seed, s)
    out[offset + 4] = Math.atan(grade)
  }
}
