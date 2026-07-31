/**
 * Gokyuzu gradyaninin tek kaynagi.
 *
 * Hem gokyuzu kubbesinin shader'i hem sis rengi buradan besleniyor. Iki yerde
 * ayri tutulursa zamanla birbirinden kayarlar ve arazi gokyuzune yanlis renkte
 * karisir; sisin tek sabit turuncu olmasinin sorunu tam olarak buydu.
 *
 * Gradyan iki eksenli: yukseklik ufuktan zenite, azimut ise gunesten uzaga.
 * Azimut ekseni olmadan arkaya bakinca gokyuzu ayni turuncu kaliyor ve yon
 * duyarli sisin butun anlami kayboluyor.
 *
 * Gunes uc katmanli: disk, ayla ve genis hale. Uculu de us degil eksponansiyel
 * dususle yaziliyor; pow(x, 60000) hem GLSL'de hassasiyet kaybediyor hem de
 * fiziksel yariciapi ayarlamayi sezgisel olmaktan cikariyor. Dusus katsayisi
 * 1.386 / (yari parlaklik acisi)^2 formuluyle secildi, yani gunes diski gercek
 * gunes gibi yarim dereceden az.
 *
 * Degerler dogrusal uzayda. Ufuk 1'in hemen ustunde: hafifce parliyor ama
 * bloom esigini tek basina asmiyor. Bloom'a giren tek sey gunes diski.
 */

export const SKY = {
  /** Gunese donuk taraftaki ufuk rengi. */
  horizon: [1.15, 0.42, 0.17] as readonly [number, number, number],
  /** Gunesin ters tarafindaki ufuk rengi: aksam morlugu. */
  horizonAway: [0.3, 0.2, 0.34] as readonly [number, number, number],
  zenith: [0.085, 0.062, 0.19] as readonly [number, number, number],
  below: [0.16, 0.075, 0.07] as readonly [number, number, number],
  sun: [1.0, 0.72, 0.42] as readonly [number, number, number],

  /** Kucuk us degeri sicak bandi ufka yakin tutuyor. */
  horizonExponent: 0.42,
  belowExponent: 0.38,
  /** Azimut gecisinin sertligi: buyuk deger sicak bandi gunese daha yakin tutar. */
  azimuthExponent: 1.6,

  /** Disk: yarim dereceden kucuk, cok yogun. Bloom'u besleyen tek kaynak. */
  sunIntensity: 90,
  diskFalloff: 60_000,
  /** Ayla: diskin hemen etrafindaki parlak bolge, yaklasik bes derece. */
  aureoleStrength: 1.7,
  aureoleFalloff: 170,
  /** Genis hale: gokyuzune yayilan sicaklik. */
  haloStrength: 0.42,
  haloFalloff: 5.5,
} as const

export type Rgb = [number, number, number]
export type Vec3 = readonly [number, number, number]

function normalize(vector: Vec3): Rgb {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * Verilen bakis yonundeki gokyuzu rengi. SkyDome'un fragment shader'iyla ayni
 * matematik; ikisi ayni sabitleri kullaniyor.
 */
export function skyColorAt(direction: Vec3, sunDirection: Vec3): Rgb {
  const view = normalize(direction)
  const sun = normalize(sunDirection)

  const alignment = view[0] * sun[0] + view[1] * sun[1] + view[2] * sun[2]

  // Azimut: gunese donuk tarafta sicak ufuk, ters tarafta mor ufuk.
  const warmSide = Math.pow(clamp01((alignment + 1) * 0.5), SKY.azimuthExponent)

  const height = view[1]
  const upward = Math.pow(clamp01(height), SKY.horizonExponent)
  const downward = Math.pow(clamp01(-height), SKY.belowExponent)

  const towardSun = Math.max(0, alignment)
  const angular = 1 - towardSun
  const glow =
    SKY.sunIntensity * Math.exp(-SKY.diskFalloff * angular) +
    SKY.aureoleStrength * Math.exp(-SKY.aureoleFalloff * angular) +
    SKY.haloStrength * Math.exp(-SKY.haloFalloff * angular)

  const color: Rgb = [0, 0, 0]
  for (let channel = 0; channel < 3; channel++) {
    const horizonColor =
      SKY.horizonAway[channel]! + (SKY.horizon[channel]! - SKY.horizonAway[channel]!) * warmSide
    const gradient = horizonColor + (SKY.zenith[channel]! - horizonColor) * upward
    color[channel] = gradient + (SKY.below[channel]! - gradient) * downward + SKY.sun[channel]! * glow
  }

  return color
}
