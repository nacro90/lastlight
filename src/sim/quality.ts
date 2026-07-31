/**
 * Kalite tercihi ve olculen kademe.
 *
 * Karar mantigi saf cekirdekte (core/quality); burada duran sey tercihin
 * saklanmasi ve degisikligin iki tarafa (Canvas ve DOM) bildirilmesi.
 *
 * Olculen kademe de saklaniyor: ayni makinede her ziyarette bastan olcmek
 * gereksiz, ve ilk saniyelerde kademe atlamasi gorunuyor.
 *
 * Olcum en yuksek kademede yapiliyor, sonra gerekirse asagi iniliyor. Ters
 * yonde yapilsa olcum yalan olurdu: orta kademede on iki milisaniye veren bir
 * makine yuksek kademede on sekiz verebiliyor, ve esikler tam sahne icin
 * yazildi.
 */

import { useSyncExternalStore } from 'react'

import { QUALITY, type QualitySettings, type QualityTier } from '@/core/quality'

/** Kullanici tercihi: otomatik olcum veya elle secim. */
export type QualityChoice = 'auto' | QualityTier

const CHOICE_KEY = 'lastlight:quality'
const MEASURED_KEY = 'lastlight:tier'

type Listener = () => void

function isTier(value: string | null): value is QualityTier {
  return value === 'low' || value === 'medium' || value === 'high'
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Depolama yoksa tercih sadece bu oturumda gecerli.
  }
}

/**
 * Dokunmatik ve fare olmayan cihaz. Telefonda ve tablette sinematik mod
 * disina cikilmiyor ve kademe en dusukte kalıyor: entegre mobil GPU'da tam
 * kalite kare suresini ucuruyor, ve olcume harcanacak ilk saniyeler de zaten
 * en kotu saniyeler oluyor.
 */
function detectTouchOnly(): boolean {
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches
  } catch {
    return false
  }
}

export const touchOnly = detectTouchOnly()

let choice: QualityChoice = (() => {
  const stored = readStored(CHOICE_KEY)
  return stored === 'auto' || isTier(stored) ? stored : 'auto'
})()

let measured: QualityTier | null = (() => {
  const stored = readStored(MEASURED_KEY)
  return isTier(stored) ? stored : null
})()

const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function qualityChoice(): QualityChoice {
  return choice
}

export function measuredTier(): QualityTier | null {
  return measured
}

/** Olcum gerekiyor mu: sadece otomatik tercihte ve daha olculmemisse. */
export function needsBenchmark(): boolean {
  return choice === 'auto' && measured === null && !touchOnly
}

export function activeTier(): QualityTier {
  if (choice !== 'auto') return choice
  if (touchOnly) return 'low'
  // Olcum bitene kadar en yuksek kademede kosuyoruz: olcum tam sahnede
  // yapilmak zorunda, yoksa karar iyimser cikiyor.
  return measured ?? 'high'
}

export function activeQuality(): QualitySettings {
  return QUALITY[activeTier()]
}

export function setQualityChoice(next: QualityChoice): void {
  if (next === choice) return
  choice = next
  writeStored(CHOICE_KEY, next)
  notify()
}

export function setMeasuredTier(tier: QualityTier): void {
  if (measured === tier) return
  measured = tier
  writeStored(MEASURED_KEY, tier)
  if (choice === 'auto') notify()
}

export function subscribeQuality(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Aktif ayarlari React'e baglayan kanca. Anlik goruntu QUALITY tablosundan
 * geldigi icin referans kararli; yeni nesne dondurulse her render dongu
 * uretirdi.
 */
export function useQuality(): QualitySettings {
  return useSyncExternalStore(subscribeQuality, activeQuality, activeQuality)
}

export function useQualityTier(): QualityTier {
  return useSyncExternalStore(subscribeQuality, activeTier, activeTier)
}

export function useQualityChoice(): QualityChoice {
  return useSyncExternalStore(subscribeQuality, qualityChoice, qualityChoice)
}
