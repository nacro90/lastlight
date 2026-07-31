/**
 * Zemin temasi. Aracin durusunu yolun egiminden degil gercek yuzeyden
 * turetiyor.
 *
 * Neden gerekli: yol yuzeyi ile arazi ayni sey degil. Yolun egimini kullanmak
 * asfalt uzerinde dogru sonuc veriyor, ama araziye cikildiginda arac hala yol
 * duzlemindeymis gibi davraniyor; yani araziye surmek gorsel olarak hicbir sey
 * degistirmiyor. Dort teker temas noktasi orneklenince arac yuzeyi takip
 * ediyor, ve bu ayni ornekleme fizige de ileri egimi veriyor.
 *
 * Maliyeti kare basina dort yukseklik sorgusu; onemsiz.
 */

import { terrainHeightAtWorld } from './terrain'

export interface SurfaceContact {
  /** Dort temas noktasinin ortalama yuksekligi. */
  height: number
  /** Ileri egim acisi (radyan); tirmanista pozitif. */
  pitch: number
  /** Yana yatma acisi (radyan). */
  roll: number
  /** Ileri yondeki egim (dy/dmesafe). Fizik bunu kullaniyor. */
  forwardGrade: number
}

export function sampleContact(
  seed: number,
  x: number,
  z: number,
  heading: number,
  halfWheelbase: number,
  halfTrack: number,
): SurfaceContact {
  const forwardX = Math.cos(heading)
  const forwardZ = Math.sin(heading)
  const rightX = -forwardZ
  const rightZ = forwardX

  const front = terrainHeightAtWorld(seed, x + forwardX * halfWheelbase, z + forwardZ * halfWheelbase)
  const rear = terrainHeightAtWorld(seed, x - forwardX * halfWheelbase, z - forwardZ * halfWheelbase)
  const right = terrainHeightAtWorld(seed, x + rightX * halfTrack, z + rightZ * halfTrack)
  const left = terrainHeightAtWorld(seed, x - rightX * halfTrack, z - rightZ * halfTrack)

  const forwardGrade = (front - rear) / (2 * halfWheelbase)
  const lateralGrade = (right - left) / (2 * halfTrack)

  return {
    height: (front + rear + right + left) / 4,
    pitch: Math.atan(forwardGrade),
    // Isaret, sag taraf yukseldiginde aracin ust vektoru sola yatacak sekilde.
    roll: -Math.atan(lateralGrade),
    forwardGrade,
  }
}
