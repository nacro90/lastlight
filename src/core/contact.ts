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

/** Tekerlek sirasi: on sol, on sag, arka sol, arka sag. */
export type WheelValues = [number, number, number, number]

export interface SurfaceContact {
  /** Dort teker temas noktasinin ortalama yuksekligi (kasa merkezi). */
  height: number
  /** Ileri egim acisi (radyan); tirmanista pozitif. */
  pitch: number
  /** Yana yatma acisi (radyan). */
  roll: number
  /** Ileri yondeki egim (dy/dmesafe). Fizik bunu kullaniyor. */
  forwardGrade: number
  /**
   * Her tekerin, kasaya fit edilen duzlemden dusey sapmasi. Suspansiyon
   * hareketi bu: kasa duzleme oturuyor, tekerler bu sapmalarla kendi temas
   * noktalarinda kaliyor. Yuzey tam duzlemse hepsi sifir.
   */
  wheelOffsets: WheelValues
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

  const cornerHeight = (alongForward: number, alongRight: number): number =>
    terrainHeightAtWorld(
      seed,
      x + forwardX * alongForward + rightX * alongRight,
      z + forwardZ * alongForward + rightZ * alongRight,
    )

  // Dort koseden ornekliyoruz; orta noktalardan ornekleme burulmayi kaybediyor
  // ve tekerleri kendi temas noktalarina oturtmak imkansiz hale geliyor.
  const frontLeft = cornerHeight(halfWheelbase, -halfTrack)
  const frontRight = cornerHeight(halfWheelbase, halfTrack)
  const rearLeft = cornerHeight(-halfWheelbase, -halfTrack)
  const rearRight = cornerHeight(-halfWheelbase, halfTrack)

  const height = (frontLeft + frontRight + rearLeft + rearRight) / 4
  const forwardGrade =
    (frontLeft + frontRight - rearLeft - rearRight) / (4 * halfWheelbase)
  const lateralGrade = (frontRight + rearRight - frontLeft - rearLeft) / (4 * halfTrack)

  // Dort nokta uc serbestlik dereceli bir duzleme tam oturmuyor; artik
  // burulmadir ve tam olarak suspansiyonun yutmasi gereken sey.
  const predict = (alongForward: number, alongRight: number): number =>
    height + forwardGrade * alongForward + lateralGrade * alongRight

  return {
    height,
    pitch: Math.atan(forwardGrade),
    // Isaret, sag taraf yukseldiginde aracin ust vektoru sola yatacak sekilde.
    roll: -Math.atan(lateralGrade),
    forwardGrade,
    wheelOffsets: [
      frontLeft - predict(halfWheelbase, -halfTrack),
      frontRight - predict(halfWheelbase, halfTrack),
      rearLeft - predict(-halfWheelbase, -halfTrack),
      rearRight - predict(-halfWheelbase, halfTrack),
    ],
  }
}
