/**
 * Sabit adimli fizik biriktiricisi.
 *
 * Fizik kare suresiyle adim atarsa simulasyon donanima bagli hale geliyor:
 * 144 Hz'lik ekranda arac 60 Hz'lik ekrandan farkli davraniyor. Cozum, render
 * karesini fizik adimindan ayirmak. Render kac Hz olursa olsun fizik her zaman
 * tam olarak FIXED_STEP kadar ilerliyor, artan zaman bir sonraki kareye
 * devrediliyor.
 *
 * Ikinci isi olum sarmalini engellemek: sekme arka plana alinip geri
 * geldiginde kare suresi saniyelere ciktigi icin, korunmazsa yuzlerce fizik
 * adimi ayni karede atilir, arac isinlanir ve sayfa kilitlenir.
 */

/** Fizik adimi (saniye). 120 Hz, gorsel kare hizindan bagimsiz. */
export const FIXED_STEP = 1 / 120

/** Bir karede kabul edilen en uzun sure. Ustu goz ardi ediliyor. */
export const MAX_FRAME_TIME = 0.1

export interface Stepper {
  /** Bu karede atilmasi gereken sabit adim sayisini dondurur. */
  advance(frameTime: number): number
  /** Henuz adima donusmemis birikmis zaman (saniye). */
  readonly pending: number
}

export function createStepper(fixedStep: number = FIXED_STEP): Stepper {
  const maxSteps = Math.ceil(MAX_FRAME_TIME / fixedStep)
  let accumulator = 0

  return {
    advance(frameTime: number): number {
      if (!(frameTime > 0)) return 0

      accumulator += Math.min(frameTime, MAX_FRAME_TIME)

      let steps = 0
      while (accumulator >= fixedStep && steps < maxSteps) {
        accumulator -= fixedStep
        steps += 1
      }

      // Sinira dayandiysak borcu tasimiyoruz: gecikmeyi kovalamak yerine
      // birkac milisaniyelik simulasyon zamanini feda etmek dogru takas.
      if (steps === maxSteps) accumulator = 0

      return steps
    },
    get pending() {
      return accumulator
    },
  }
}
