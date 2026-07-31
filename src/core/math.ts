/** Cekirdegin paylastigi kucuk matematik yardimcilari. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Kubik smoothstep. Uc noktalarda turev sifir oldugu icin arazi yoldan
 * ayrisirken gorunur bir kirilma olusmuyor.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Ustel yumusatma: hedefe kare suresinden bagimsiz bir hizla yaklasir.
 *
 * Dogrusal karisim (`current += (target - current) * rate * dt`) kare suresine
 * bagli; 60 Hz'te ve 144 Hz'te farkli hizda oturuyor ve buyuk dt'de hedefi
 * asiyor. Ustel form bolunebilir oldugu icin iki yarim adim bir tam adima
 * esit, yani kare hizi degisince duyulan veya gorulen bir fark olmuyor.
 */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

/** Hedefe dogru en fazla maxDelta kadar ilerler, hedefi asmaz. */
export function moveToward(current: number, target: number, maxDelta: number): number {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}
