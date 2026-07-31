/**
 * Dunya olculeri. Hem yol hem arazi hem serpistirme buradan okuyor, cunku
 * bu sayilar birbirine bagli: koridor genisligi minimum viraj yaricapindan
 * kucuk olmak zorunda, yoksa serit kendisiyle cakisiyor.
 */

/** Ileri eksen. Arac +X yonune gidiyor, gunes de o tarafta batiyor. */
export const FORWARD_AXIS = 'x' as const

export const ROAD = {
  /** Asfaltin merkez hattindan yari genisligi. */
  laneHalfWidth: 4.6,
  /** Asfalt kenarindan banketin bittigi yere kadar. */
  shoulderWidth: 2.2,
  /**
   * Arazi seridinin yari genisligi. Minimum viraj yaricapindan kucuk olmali.
   * Sis bu mesafeden once kapandigi icin kenari kimse gormuyor.
   */
  corridorHalfWidth: 200,
  /** Asfalt kenarindan sonra arazinin gurultuye karistigi mesafe. */
  blendDistance: 46,
} as const

export const SLICE = {
  /** Bir dilimin yol boyunca uzunlugu. Kucuk dilim = amortisman. */
  length: 25,
  /** Dilim icindeki enine satir sayisi (satir araligi length/rows). */
  rows: 10,
  /**
   * Bir satirdaki vertex sayisi. Tek sayi olmak zorunda: merkez hattin
   * uzerinde bir vertex bulunmali. Yola yakin yogun, uzaga seyrek dagilir.
   */
  columns: 49,
  /** Havuzdaki dilim sayisi. length * count = gorunur koridor uzunlugu. */
  poolSize: 48,
  /** Aracin arkasinda tutulan dilim sayisi (geriye bakan kamera icin). */
  behind: 6,
} as const

/**
 * Dilim basina serpistirilen nesne sayilari. Sabit: her dilim her tur icin
 * ayni sayida yuva ayiriyor, gorunmeyen nesneler sifir olcekle saklaniyor.
 * Boylece instanced mesh yuva atamasi defter tutmadan hesaplanabiliyor.
 */
export const SCATTER = {
  trees: 7,
  bushes: 5,
  rocks: 4,
  /** Yol kenarindan sonra nesnelerin baslayabildigi mesafe. */
  clearance: 2.6,
  /** Koridorun en dis yuzdesi bos birakiliyor; kenar sise gomulu kalsin. */
  outerMargin: 0.92,
} as const

/**
 * Yol geometrisinin sinirlari. Genlikler bu sinirlardan turetiliyor, yani
 * asilmasi mumkun degil; testler bunu dogruluyor.
 */
export const LIMITS = {
  /**
   * Maksimum egim. Bu bir ust sinir, hedef degil: fBm turev sinirina nadiren
   * yaklastigi icin gercekte olculen egim bunun yarisi civarinda kaliyor.
   */
  maxGrade: 0.1,
  /** Maksimum sapma acisi (radyan). Gunesin onde kalmasini garanti ediyor. */
  maxHeading: (28 * Math.PI) / 180,
} as const
