/**
 * Kare basina degisen degerler React state'inde tutulmuyor. Sebebi net: hiz
 * her karede degisiyor, ve React state'ine yazmak her karede reconciliation
 * demek. Bunun yerine degistirilebilir tek bir nesne var; sahne bilesenleri
 * bunu useFrame icinde okuyor, arayuz ise saniyede sekiz kez orneklıyor.
 */

import { hashString } from '@/core/rng'

export type DriveMode = 'cinematic' | 'driving'

export interface CarPose {
  x: number
  y: number
  z: number
  heading: number
  /** Kasa egimi; tekerler bu duzleme oturuyor. */
  pitch: number
  /** Kasa yatmasi; tekerler bu duzleme oturuyor. */
  roll: number
  /** Govdenin kasaya gore ek yatmasi (viraj). Tekerleri etkilemiyor. */
  bodyRoll: number
  /** Govdenin kasaya gore ek egimi (gaz cokmesi, fren dalmasi). */
  bodyPitch: number
  /** Her tekerin kasa duzleminden dusey sapmasi: on sol, on sag, arka sol, arka sag. */
  wheelOffsets: [number, number, number, number]
  speed: number
  distance: number
  /** Yol boyunca mesafe. */
  s: number
  /** Merkez hattan yanal sapma. */
  t: number
  yawRate: number
}

export const car: CarPose = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  roll: 0,
  bodyRoll: 0,
  bodyPitch: 0,
  wheelOffsets: [0, 0, 0, 0],
  speed: 0,
  distance: 0,
  s: 0,
  t: 0,
  yawRate: 0,
}

/**
 * Son karede uygulanan surus girdisi. Ses karisimi bunu okuyor: gaz kesikken
 * motorun geri cekilmesi hizdan degil gazdan okunuyor, ve girdiyi klavyenin mi
 * otopilotun mu urettigi ses tarafinda farksiz.
 */
export const control = {
  throttle: 0,
  brake: 0,
  steer: 0,
}

export const perf = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  slices: 0,
}

export const runtime = {
  mode: 'cinematic' as DriveMode,
  lastInputAt: 0,
}

/** Oyuncu bu kadar sure dokunmazsa sinematik mod geri devraliyor. */
export const IDLE_RETURN_MS = 25_000

function readSeed(): number {
  const requested = new URLSearchParams(window.location.search).get('seed')
  return hashString(requested && requested.length > 0 ? requested : 'lastlight')
}

/** URL'e ?seed=... yazinca ayni dunya tekrar cikiyor. */
export const SEED = readSeed()
