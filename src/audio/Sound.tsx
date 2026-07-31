/**
 * Ses grafini yasama baglayan bilesen. Hicbir sey render etmiyor.
 *
 * Canvas'in icinde duruyor cunku karisimi kare basina arac durumundan
 * turetiyor ve useFrame o dongunun icinde. Sesin acik olup olmadigi ise DOM
 * tarafindaki dugmeden geliyor; iki taraf audio/preference uzerinden
 * konusuyor.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { mixFor, type AudioInput } from '@/core/audio'
import { offroadAmount } from '@/core/road'
import { car, control } from '@/sim/state'
import { createSoundEngine, type SoundEngine } from './engine'
import { soundEnabled, subscribeSound } from './preference'

/**
 * Yasayan graf. Modul seviyesinde tutuluyor cunku uctan uca testin baglamin
 * askidan cikip cikmadigini gormesi gerekiyor, ve bunu React agacinin
 * disindan sormak zorunda.
 */
let instance: SoundEngine | null = null

export function audioInfo(): ReturnType<SoundEngine['info']> | null {
  return instance?.info() ?? null
}

export function Sound(): null {
  const engine = useRef<SoundEngine | null>(null)

  /**
   * Girdi nesnesi yeniden kullaniliyor. Kare basina bir kucuk nesne dert
   * degil ama kare dongusunde ayirma yapmama aliskanligi bu projede her yerde
   * gecerli, ve bedava.
   */
  const input = useMemo<AudioInput>(() => ({ speed: 0, throttle: 0, brake: 0, offroad: 0 }), [])

  useEffect(() => {
    let created: SoundEngine
    try {
      created = createSoundEngine()
    } catch {
      // Web Audio yoksa deneyim sessiz devam ediyor; hicbir sey kirilmiyor.
      return
    }
    engine.current = created
    instance = created
    created.setEnabled(soundEnabled())

    // Tarayici politikasi: baglam ilk kullanici hareketine kadar askida.
    // Kaplama veya "sesi ac" kapisi koymuyoruz, ilk dokunusta kendi aciliyor.
    const unlock = (): void => created.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    const unsubscribe = subscribeSound((enabled) => created.setEnabled(enabled))

    // Sekme arkaya alinirken ses kesiliyor: arkada calan bir sekme kaba.
    const onVisibility = (): void => created.setActive(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
      created.dispose()
      engine.current = null
      instance = null
    }
  }, [])

  useFrame(() => {
    const current = engine.current
    if (!current) return

    input.speed = car.speed
    input.throttle = control.throttle
    input.brake = control.brake
    input.offroad = offroadAmount(car.t)

    current.update(mixFor(input))
  })

  return null
}
