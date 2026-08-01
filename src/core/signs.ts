/**
 * Yol tabelalari ve kenar urunleri.
 *
 * Isi hiz duyusu ve yolun kendi dili. Kesikli cizgi yolun ortasinda yatay bir
 * ritim veriyor; tabelalar kenarda seyrek ama dusey bir olay veriyor, yani
 * "burada bir yol var, birileri isaretlemis" bilgisini tasiyor. Reflektorlu
 * dikmeler denendi ve her yirmi bes metrede tekrar eden bir nesne fazla
 * duzenli, fazla teknik duruyordu; seyrek tabela ayni referansi daha az
 * gurultuyle veriyor.
 *
 * Yerlesim blok basina bir tane: her SIGN_BLOCK dilimde tam bir tabela var ve
 * hangi dilime dustugu tohumdan turetiliyor. Sadece "bu dilimde tabela var mi"
 * diye rastgele sorulsa iki tabela yan yana dusebiliyor ve kumelenme ritmi
 * bozuyor; blok yaklasimi hem asgari bosluk hem azami bosluk veriyor.
 *
 * Levha yuzu trafige donuk, yani gunesin ters tarafina. Ters isikta levha
 * siluet olarak okunuyor ve detay gormek gerekmiyor: bu proje boyunca gecerli
 * olan sey burada da gecerli, form gorunur detay gorunmez.
 */

import { SLICE } from './config'
import { ROAD_EDGE, roadHeading, toWorld } from './road'
import { rngFrom } from './rng'
import { terrainHeight } from './terrain'

/** Tabela cesitleri. Sira onemli: kind alani bu diziye indeks. */
export const SIGN_KINDS = ['warning', 'speed', 'stone'] as const

export type SignKind = (typeof SIGN_KINDS)[number]

export const SIGN = {
  /** Merkez hattan yanal mesafe (metre); banket disinda, agac bolgesinden once. */
  lateral: ROAD_EDGE + 0.85,
  /** Direk tepesindeki levhanin merkez yuksekligi (metre). */
  plateHeight: 1.95,
  /** Levha yari olcusu (metre). */
  plateRadius: 0.36,
  /** Direk kalinligi (metre). */
  postThickness: 0.075,
  /** Kilometre tasi olculeri (metre): genislik, yukseklik, derinlik. */
  stoneWidth: 0.26,
  stoneHeight: 0.62,
  stoneDepth: 0.16,
} as const

/**
 * Blok uzunlugu (dilim). Her blokta tam bir tabela var, yani ortalama aralik
 * blok uzunlugu kadar: yaklasik yuz elli metre.
 */
export const SIGN_BLOCK = 6

/** Tabela basina alan sayisi: x, y (taban), z, yon, cesit. */
export const SIGN_STRIDE = 5

const SALT = 0x5167

/**
 * Blok icinde tabelanin dustugu dilim. Uclar disariliyor: iki komsu blokta
 * tabelalar sinira yigilirsa yan yana geliyorlar.
 */
function slotInBlock(seed: number, block: number): number {
  const random = rngFrom(seed, SALT, block)
  const inner = SIGN_BLOCK - 2
  return 1 + Math.floor(random() * inner)
}

export function createSliceSigns(): Float32Array {
  return new Float32Array(SIGN_STRIDE)
}

/**
 * Dilimin tabelasini yazar. Dilimde tabela yoksa cesit alani negatif kaliyor;
 * gorsel katman o durumda ornegi sifir olcekle sakliyor.
 */
export function writeSliceSigns(seed: number, sliceIndex: number, out: Float32Array): void {
  // Negatif dilim indekslerinde de dogru calisan blok bolmesi.
  const block = Math.floor(sliceIndex / SIGN_BLOCK)
  const offsetInBlock = sliceIndex - block * SIGN_BLOCK

  out[4] = -1

  if (offsetInBlock !== slotInBlock(seed, block)) return

  const random = rngFrom(seed, SALT, block, 0x21)
  const side = random() < 0.5 ? -1 : 1
  const kind = Math.floor(random() * SIGN_KINDS.length) % SIGN_KINDS.length

  // Dilim icinde kucuk bir kayma: tabelalar tam olcum noktalarina hizalanmis
  // gorunmesin.
  const s = (sliceIndex + 0.25 + random() * 0.5) * SLICE.length
  const t = side * SIGN.lateral
  const world = toWorld(seed, s, t)

  out[0] = world.x
  out[1] = terrainHeight(seed, s, t)
  out[2] = world.z
  out[3] = roadHeading(seed, s)
  out[4] = kind
}
