/**
 * Altin saatte havada asili toz.
 *
 * Sonsuz toz icin sonsuz parcacik gerekmiyor: sabit sayida zerre, aracin
 * etrafinda hareket eden bir kutunun icinde sarmalaniyor. Kutudan cikan zerre
 * karsi taraftan giriyor, yani dunya sonsuz gorunurken parcacik sayisi sabit
 * kaliyor.
 *
 * Sarmalama vertex shader'da yapiliyor, yani CPU'da kare basina hicbir is yok;
 * sadece merkez ve suruklenme uniform'lari guncelleniyor. Buradaki
 * wrapCoordinate o matematigin test edilebilir referansi, shader onu birebir
 * ayniliyor.
 *
 * Tozun iki isi var: atmosfer katmak, ve hizi gozle okutmak. Yanindan gecen
 * zerreler yol kenarindaki agaclarla ayni referansi veriyor, ama araca cok
 * daha yakin oldugu icin dusuk hizda bile calisiyor.
 */

import { rngFrom } from './rng'

export const DUST = {
  count: 700,
  /**
   * Kutu olculeri: ileri, yukari, yan. Kutu kucuk tutuluyor cunku onemli olan
   * toplam zerre sayisi degil yogunluk; genis kutuda ayni sayi seyrelip
   * gorunmez oluyor.
   */
  boxLength: 70,
  boxHeight: 16,
  boxWidth: 46,
  /**
   * Zerre boyutlari. Ust sinir kasitli olarak kucuk: buyuk zerreler kar gibi
   * okunuyor ve geometrinin kose sayisi gorunur hale geliyor. Gercek toz
   * yakinda bile birkac piksel.
   */
  minSize: 0.025,
  maxSize: 0.09,
  /** Kutu merkezi aracin bu kadar onunde: sarma siniri kameranin arkasinda kalsin. */
  forwardOffset: 14,
  /** Kutu merkezi aracin bu kadar ustunde. */
  heightOffset: 3.5,
} as const

/** Zerne basina alan sayisi: x, y, z, boyut. */
export const DUST_STRIDE = 4

const SALT = 0x0d51

/**
 * Degeri merkez etrafinda extent genisligindeki araliga sarmalar. Sonuc her
 * zaman [center - extent/2, center + extent/2] icinde.
 */
export function wrapCoordinate(value: number, center: number, extent: number): number {
  const half = extent * 0.5
  const shifted = value - center + half
  // Negatif degerler icin de dogru calisan modulo.
  const wrapped = ((shifted % extent) + extent) % extent
  return center + wrapped - half
}

/** Kutu koordinatlarinda determinist zerre alani. */
export function createDustField(seed: number): Float32Array {
  const field = new Float32Array(DUST.count * DUST_STRIDE)

  for (let i = 0; i < DUST.count; i++) {
    const random = rngFrom(seed, SALT, i)
    const offset = i * DUST_STRIDE

    field[offset] = (random() - 0.5) * DUST.boxLength
    field[offset + 1] = (random() - 0.5) * DUST.boxHeight
    field[offset + 2] = (random() - 0.5) * DUST.boxWidth

    // Boyut dagilimi kareli: kucuk zerreler cok, buyukler az.
    const roll = random()
    field[offset + 3] = DUST.minSize + (DUST.maxSize - DUST.minSize) * roll * roll
  }

  return field
}
