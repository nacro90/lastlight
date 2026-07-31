/**
 * Klavye girdi kaynagi. Fizik girdiyi kimin urettigini bilmiyor, o yuzden bu
 * modul otopilotla ayni sozlesmeyi (DriveInput) uretiyor ve birbirlerinin
 * yerine gecebiliyorlar.
 *
 * Tuslar `code` ile okunuyor, `key` ile degil: boylece Turkce F klavyede de
 * ayni fiziksel tuslar calisiyor.
 */

import type { DriveInput } from '@/core/vehicle'

const THROTTLE = new Set(['ArrowUp', 'KeyW'])
const BRAKE = new Set(['ArrowDown', 'KeyS', 'Space'])
const LEFT = new Set(['ArrowLeft', 'KeyA'])
const RIGHT = new Set(['ArrowRight', 'KeyD'])

const WATCHED = new Set([...THROTTLE, ...BRAKE, ...LEFT, ...RIGHT])

export interface InputSource {
  sample(): DriveInput
  /** Bu karede oyuncu gercekten bir seye basiyor mu. */
  readonly active: boolean
  dispose(): void
}

/**
 * Bosluk tusu hem freni hem odaklanmis bir dugmeyi tetikliyor. Odak arayuzdeyse
 * dugme kazaniyor: preventDefault cagirmak dugme aktivasyonunu iptal ediyor ve
 * klavyeyle gezen biri hicbir ayari acamiyor.
 *
 * Sadece Bosluk icin geciyoruz, butun tuslar icin degil: fareyle bir dugmeye
 * tikladiktan sonra odak dugmede kaliyor, ve o durumda WASD ile surmenin
 * kesilmesi kabul edilemez.
 */
function belongsToInterface(event: KeyboardEvent): boolean {
  if (event.code !== 'Space') return false
  const target = event.target
  return target instanceof HTMLElement && target !== document.body
}

export function createKeyboardSource(): InputSource {
  const pressed = new Set<string>()

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!WATCHED.has(event.code)) return
    if (belongsToInterface(event)) return
    // Ok tuslari sayfayi kaydirmasin.
    event.preventDefault()
    pressed.add(event.code)
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code)
  }

  /** Sekme arka plana alinirken basili kalan tuslar takik kalmasin. */
  const onBlur = (): void => {
    pressed.clear()
  }

  window.addEventListener('keydown', onKeyDown, { passive: false })
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  const any = (codes: Set<string>): boolean => {
    for (const code of codes) if (pressed.has(code)) return true
    return false
  }

  return {
    sample(): DriveInput {
      const steer = (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0)
      return {
        throttle: any(THROTTLE) ? 1 : 0,
        brake: any(BRAKE) ? 1 : 0,
        steer,
      }
    },
    get active(): boolean {
      return pressed.size > 0
    },
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      pressed.clear()
    },
  }
}
