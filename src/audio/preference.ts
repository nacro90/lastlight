/**
 * Ses tercihi. Arayuz (DOM) ile ses grafi (Canvas icindeki bilesen) birbirini
 * gormedigi icin tercih burada duruyor ve iki taraf da buna abone.
 *
 * Tercih localStorage'da: kapatan biri sayfayi yenilediginde sesin geri
 * gelmesi kaba bir davranis.
 */

const STORAGE_KEY = 'lastlight:sound'

type Listener = (enabled: boolean) => void

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    // Gizli sekmede ve depolama kapaliyken erisim atiyor; varsayilan acik.
    return true
  }
}

let enabled = read()
const listeners = new Set<Listener>()

export function soundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(next: boolean): void {
  if (next === enabled) return
  enabled = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // Depolama yoksa tercih sadece bu oturumda gecerli; sessizce devam.
  }
  for (const listener of listeners) listener(enabled)
}

export function subscribeSound(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
