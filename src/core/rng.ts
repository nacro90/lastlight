/**
 * Determinist rastgelelik. Cekirdegin tamami durumsuz olmak zorunda:
 * herhangi bir arazi dilimi, oncesi hic uretilmemisken tek basina
 * uretilebilmeli. O yuzden sirali bir akis yerine konuma bagli hash
 * kullaniyoruz.
 */

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const GOLDEN = 0x9e3779b9

/** Murmur3 finalizer: tek bitlik degisimi butun bitlere yayar. */
function avalanche(value: number): number {
  let h = value | 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Dizgeden isaretsiz 32 bit tohum. URL'deki ?seed=... bunu kullaniyor. */
export function hashString(input: string): number {
  let h = FNV_OFFSET
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, FNV_PRIME)
  }
  return h >>> 0
}

/**
 * Tamsayi koordinatlarindan isaretsiz 32 bit hash. Argument sirasina duyarli,
 * ve komsu girdileri birbirinden uzaga dagitir; dagitmazsa serpistirilen
 * nesneler gorunur bir izgara deseni olusturur.
 */
export function hashInts(...values: number[]): number {
  let h = GOLDEN
  for (let i = 0; i < values.length; i++) {
    h ^= ((values[i] as number) | 0) + GOLDEN + (h << 6) + (h >>> 2)
    h = avalanche(h)
  }
  return h >>> 0
}

/** Mulberry32: kucuk, hizli, iyi dagilan tohumlu uretec. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Koordinatlardan uretec kurar. Ayni koordinat her zaman ayni akisi verir,
 * yani bir dilim geri donusup tekrar uretildiginde icindeki agaclar ayni
 * yerde duruyor.
 */
export function rngFrom(...values: number[]): () => number {
  return mulberry32(hashInts(...values))
}
