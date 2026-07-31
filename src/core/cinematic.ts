/**
 * Sinematik cekim programi.
 *
 * Sayfa acildiginda calisan mod bu, ve portfolyo linkinde ilk uc saniyeyi
 * tasiyan sey. Kamera dort cerceveleme arasinda sekiz on iki saniyede bir
 * kesme yapiyor. Kesme, cerceveleme parametrelerinin bir buçuk saniyede
 * karismasi olarak uygulaniyor: sert kesme sicrama gibi hissediyor ve sakin
 * bir deneyimde yeri yok.
 *
 * prefers-reduced-motion acikken kesme suresi uzatiliyor ve kesme yumusak bir
 * kaydirmaya iniyor; kamera hareketi tamamen kaybolmuyor cunku o zaman deneyim
 * duruyor.
 */

import { rngFrom } from './rng'
import { clamp01, lerp, smoothstep } from './math'

export interface Framing {
  /** Aracin arkasindaki mesafe. Negatif deger kamerayi one aliyor. */
  back: number
  /** Zeminden yukseklik. */
  height: number
  /** Yanal kayma; pozitif sag. */
  side: number
  /** Bakis noktasinin aracin onundeki mesafesi. Negatif deger geriye bakiyor. */
  lookAhead: number
  fov: number
  /** Cekim icinde yavas surunme genlikleri; donuk cekim olu duruyor. */
  driftBack: number
  driftHeight: number
  driftSide: number
}

export const FRAMINGS: readonly Framing[] = [
  // Arkadan alcak ve genis: yolun akisini en iyi anlatan cekim.
  { back: 8.2, height: 1.75, side: 0.4, lookAhead: 22, fov: 62, driftBack: 1.6, driftHeight: 0.3, driftSide: 1.1 },
  // Yol seviyesinden yandan: hiz hissi en yuksek cekim.
  // Yukseklik kamera zemin payinin uzerinde tutuluyor; altinda kalirsa kamera
  // her karede zemine kilitleniyor ve gorunur bir titreme uretiyor.
  { back: 3.4, height: 1.55, side: 7.8, lookAhead: 13, fov: 48, driftBack: 2.4, driftHeight: 0.2, driftSide: 0.9 },
  // Tepeden vince: manzarayi ve vadiyi gosteren cekim.
  { back: 17, height: 11.5, side: -6.5, lookAhead: 34, fov: 44, driftBack: 3.2, driftHeight: 1.4, driftSide: 2.2 },
  // Onden geri giderek takip: araci ve arkasindaki gunesi birlikte veriyor.
  { back: -13.5, height: 2.4, side: 1.8, lookAhead: -3, fov: 52, driftBack: 2.0, driftHeight: 0.5, driftSide: 1.4 },
]

export const SHOT_MIN_DURATION = 8
export const SHOT_MAX_DURATION = 12
/**
 * Kesme suresi. Bir buçuk saniye: hizli kesme savurma degil sicrama gibi
 * hissediyor ve sakin bir deneyimde yeri yok.
 */
export const CUT_DURATION = 1.5
/** Azaltilmis hareket tercihinde kesme bu sureye yayilip kaydirmaya iniyor. */
export const REDUCED_MOTION_CUT_DURATION = 5

const DURATION_SALT = 0x77c1

export interface CinematicShot {
  framing: Framing
  framingIndex: number
  previousIndex: number
  /** Mevcut cekimin icinde gecen sure. */
  shotTime: number
  /** Onceki cerceveleme ile yenisi arasindaki karisim, 0 ile 1. */
  blend: number
  cutting: boolean
}

export interface Cinematic {
  advance(delta: number): CinematicShot
}

function pickFraming(seed: number, shot: number, avoid: number): number {
  const random = rngFrom(seed, shot)
  const candidates = FRAMINGS.length
  if (avoid < 0) return Math.floor(random() * candidates) % candidates

  // Mevcut cerceveleme dislaniyor: ust uste ayni cekim, kesmeyi hicbir sey
  // degistirmemis gibi gosteriyor.
  const offset = 1 + Math.floor(random() * (candidates - 1))
  return (avoid + offset) % candidates
}

function pickDuration(seed: number, shot: number): number {
  const random = rngFrom(seed, shot, DURATION_SALT)
  return SHOT_MIN_DURATION + random() * (SHOT_MAX_DURATION - SHOT_MIN_DURATION)
}

function blendFramings(from: Framing, to: Framing, amount: number): Framing {
  return {
    back: lerp(from.back, to.back, amount),
    height: lerp(from.height, to.height, amount),
    side: lerp(from.side, to.side, amount),
    lookAhead: lerp(from.lookAhead, to.lookAhead, amount),
    fov: lerp(from.fov, to.fov, amount),
    driftBack: lerp(from.driftBack, to.driftBack, amount),
    driftHeight: lerp(from.driftHeight, to.driftHeight, amount),
    driftSide: lerp(from.driftSide, to.driftSide, amount),
  }
}

export function createCinematic(seed: number, cutDuration: number = CUT_DURATION): Cinematic {
  let shot = 0
  let framingIndex = pickFraming(seed, 0, -1)
  let previousIndex = framingIndex
  let shotTime = 0
  let duration = pickDuration(seed, 0)

  return {
    advance(delta: number): CinematicShot {
      shotTime += delta

      if (shotTime >= duration) {
        shotTime -= duration
        shot += 1
        previousIndex = framingIndex
        framingIndex = pickFraming(seed, shot, framingIndex)
        duration = pickDuration(seed, shot)
      }

      const blend = cutDuration > 0 ? clamp01(shotTime / cutDuration) : 1
      const eased = smoothstep(0, 1, blend)

      return {
        framing: blendFramings(FRAMINGS[previousIndex]!, FRAMINGS[framingIndex]!, eased),
        framingIndex,
        previousIndex,
        shotTime,
        blend,
        cutting: blend < 1,
      }
    },
  }
}
