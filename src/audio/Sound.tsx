/**
 * Ses grafini yasama baglayan bilesen. Hicbir sey render etmiyor.
 *
 * Canvas'in icinde duruyor cunku karisimi kare basina arac durumundan
 * turetiyor ve useFrame o dongunun icinde. Sesin acik olup olmadigi ise DOM
 * tarafindaki dugmeden geliyor; iki taraf audio/preference uzerinden
 * konusuyor.
 *
 * Graf ilk kullanici hareketine kadar hic kurulmuyor. Once acilista askida bir
 * AudioContext kuruluyordu ve olculdu: Chrome her seferinde "AudioContext was
 * not allowed to start" uyarisi basiyordu, ustelik uc saniyelik pembe gurultu
 * tamponu (48 kHz tek kanal float32, yani 576 KB) hicbir sese dokunmayacak
 * ziyaretciler icin de uretiliyordu. Portfolyo linkinde ziyaretcilerin cogu
 * sadece seyrediyor, yani bu maliyet cogunlugun uzerine biniyordu.
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
    /**
     * Graf ilk kullanici hareketinde kuruluyor, acilista degil. Kaplama veya
     * "sesi ac" kapisi yok: sahne sessizken de tam calisiyor, ilk dokunusta ses
     * iki saniyede suzuluyor.
     */
    const start = (): void => {
      if (engine.current) return
      try {
        const created = createSoundEngine()
        engine.current = created
        instance = created
        created.setEnabled(soundEnabled())
        created.unlock()
      } catch {
        // Web Audio yoksa deneyim sessiz devam ediyor; hicbir sey kirilmiyor.
      }
    }

    window.addEventListener('pointerdown', start, { once: true })
    window.addEventListener('keydown', start, { once: true })

    const unsubscribe = subscribeSound((next) => engine.current?.setEnabled(next))

    // Sekme arkaya alinirken ses kesiliyor: arkada calan bir sekme kaba.
    const onVisibility = (): void => engine.current?.setActive(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
      engine.current?.dispose()
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
