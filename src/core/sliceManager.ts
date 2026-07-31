/**
 * Dilim havuzunun defteri. Uc.js'i tanimiyor, sadece "hangi yuvada hangi
 * dilim olmali" sorusunu cevapliyor.
 *
 * Yuva atamasi sliceIndex mod poolSize. Bunun guzel tarafi su: gorunur aralik
 * tam olarak poolSize uzunlugunda oldugu icin her yuva araliktaki tek bir
 * dilime karsilik geliyor, yani catisma matematiksel olarak mumkun degil.
 * Arac bir dilim ilerlediginde bayatlayan yuva, tam olarak yeni dilimin
 * ihtiyaç duydugu yuva oluyor.
 */

import { SLICE } from './config'

/** Int32 tabani; "bu yuvada henuz bir sey yok" anlamina geliyor. */
export const EMPTY_SLOT = -2_147_483_648

export interface SliceAssignment {
  slot: number
  sliceIndex: number
}

export interface SliceManager {
  /** Yuva basina yuklu dilim indeksi. */
  readonly slots: Int32Array
  /** Su anda yuklu olmasi gereken dilim araligi. */
  range(s: number): { first: number; last: number }
  /**
   * Bayat yuvalari gunceller ve yapilan atamalari dondurur. En fazla
   * maxPerUpdate tane; amortisman bu sinirla saglaniyor.
   */
  update(s: number, maxPerUpdate: number): SliceAssignment[]
}

function slotFor(sliceIndex: number): number {
  const remainder = sliceIndex % SLICE.poolSize
  return remainder < 0 ? remainder + SLICE.poolSize : remainder
}

export function createSliceManager(): SliceManager {
  const slots = new Int32Array(SLICE.poolSize).fill(EMPTY_SLOT)

  function centerIndex(s: number): number {
    return Math.floor(s / SLICE.length)
  }

  function range(s: number): { first: number; last: number } {
    const first = centerIndex(s) - SLICE.behind
    return { first, last: first + SLICE.poolSize - 1 }
  }

  function update(s: number, maxPerUpdate: number): SliceAssignment[] {
    const center = centerIndex(s)
    const { first, last } = range(s)
    const assignments: SliceAssignment[] = []

    const claim = (sliceIndex: number): void => {
      const slot = slotFor(sliceIndex)
      if (slots[slot] === sliceIndex) return
      slots[slot] = sliceIndex
      assignments.push({ slot, sliceIndex })
    }

    // Once ileri: onde acilan bosluk gorunur, arkada acilan gorunmez.
    for (let index = center; index <= last && assignments.length < maxPerUpdate; index++) {
      claim(index)
    }
    for (let index = center - 1; index >= first && assignments.length < maxPerUpdate; index--) {
      claim(index)
    }

    return assignments
  }

  return { slots, range, update }
}
