/**
 * HUD. Cok minimal olmasi kasitli: surerken ekranda sadece hiz var.
 *
 * Kare basina degeri React state'ine yazmiyoruz. Hiz saniyede sekiz kez
 * ornekleniyor; her karede yazmak her karede reconciliation demek olurdu.
 *
 * Kontrol kumesi (ses, ayarlar) isaretleyici niyetiyle geliyor: fare
 * kimildandiginda veya ekrana dokunuldugunda gorunuyor, birkac saniye sonra
 * cekiliyor. Klavye kume gostermiyor, cunku klavye surus demek ve surerken
 * ekranda sadece hiz olmasi gerekiyor; tusa basmak kumeyi getirse yon degistiren
 * herkes kalici bir arayuz tasiyordu.
 *
 * Kumenin hic gorunmemesi de olmuyor: dokunmatik cihazda deneyim hep sinematik
 * modda kaliyor ve kume gorunmezse o cihazda sesi kapatmak imkansiz oluyor.
 * Isaretleyici niyetiyle gelen bir kume, dikkat cekmek icin nabiz atan bir oge
 * ile ayni sey degil.
 *
 * Klavye kontrol ipucu surus baslarken bir kez gosterilip cekiliyor; kalici
 * durursa ekranda hizdan baska bir sey olmus oluyor.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { setSoundEnabled, soundEnabled, subscribeSound } from '@/audio/preference'
import { QUALITY_TIERS, type QualityTier } from '@/core/quality'
import {
  measuredTier,
  setQualityChoice,
  touchOnly,
  useQualityChoice,
  type QualityChoice,
} from '@/sim/quality'
import { SEED_NAME, car, perf, runtime } from '@/sim/state'

const SAMPLE_INTERVAL_MS = 125
const TITLE_DURATION_MS = 5200
const FRAME_BUDGET_MS = 16.6
/** Kontrol kumesi son isaretleyici hareketinden bu kadar sonra cekiliyor. */
const CONTROL_LINGER_MS = 3500
/** Klavye ipucu surus baslangicindan bu kadar sonra cekiliyor. */
const HINT_DURATION_MS = 7000

const TIER_LABELS: Record<QualityTier, string> = {
  low: 'düşük',
  medium: 'orta',
  high: 'yüksek',
}

function useSampled<T>(read: () => T, intervalMs = SAMPLE_INTERVAL_MS): T {
  const [value, setValue] = useState(read)

  useEffect(() => {
    const timer = window.setInterval(() => setValue(read()), intervalMs)
    return () => window.clearInterval(timer)
  }, [read, intervalMs])

  return value
}

/**
 * Son isaretleyici hareketinden beri gecen sure esigin altinda mi.
 *
 * Klavye burada yok ve bu kasitli: klavye surus demek, ve surerken ekranda
 * sadece hiz olmasi gerekiyor.
 */
function useRecentPointer(): boolean {
  const [active, setActive] = useState(true)

  useEffect(() => {
    let timer = 0

    const wake = (): void => {
      setActive(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setActive(false), CONTROL_LINGER_MS)
    }

    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('pointerdown', wake)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
    }
  }, [])

  return active
}

/**
 * Surus modu basladiktan sonra kisa bir sure dogru kaliyor, sonra bir daha
 * donmuyor.
 *
 * Zamanlayici gorunurluge bagli ayri bir effect'te: ayni effect icinde olsa
 * `driving` her degistiginde temizleme zamanlayiciyi iptal ediyor ama "bir kez
 * gosterildi" bayragi yuzunden yeniden kurulmuyordu. Bugun kaza ile calisiyordu
 * cunku bosta kalma donusu (25 sn) ipucu suresinden (7 sn) uzun; iki ayri
 * modulde duran bu bagi kimse yazili gormemis olurdu.
 */
function useDrivingHint(driving: boolean): boolean {
  const [visible, setVisible] = useState(false)
  const shown = useRef(false)

  useEffect(() => {
    if (!driving || shown.current) return
    shown.current = true
    setVisible(true)
  }, [driving])

  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => setVisible(false), HINT_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [visible])

  return visible
}

function readSnapshot() {
  return {
    speedKmh: Math.round(car.speed * 3.6),
    mode: runtime.mode,
    fps: Math.round(perf.fps),
    frameMs: perf.frameMs,
    drawCalls: perf.drawCalls,
    triangles: perf.triangles,
    distanceKm: car.distance / 1000,
  }
}

/**
 * Ses dugmesi. Sabit duruyor; nabiz atan veya parlayan hicbir sey yok. M tusu
 * da ayni tercihi degistiriyor: klavyeyle surerken fareye gitmek akisi bozuyor.
 */
function SoundToggle(): React.ReactElement {
  const [enabled, setEnabled] = useState(soundEnabled)

  useEffect(() => subscribeSound(setEnabled), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'KeyM' && !event.repeat) setSoundEnabled(!soundEnabled())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggle = useCallback(() => setSoundEnabled(!soundEnabled()), [])

  return (
    <button
      type="button"
      className="toggle"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Sesi kapat' : 'Sesi aç'}
      data-off={!enabled}
    >
      ses
    </button>
  )
}

const CHOICES: QualityChoice[] = ['auto', ...QUALITY_TIERS]

function choiceLabel(choice: QualityChoice): string {
  return choice === 'auto' ? 'otomatik' : TIER_LABELS[choice]
}

/**
 * Ayarlar. Modal degil: dunya arkada akmaya devam ederken alt bantta bir liste
 * aciliyor. Hem daha ucuz hem daha az kesintili, deneyim hic durmuyor.
 */
function Settings({
  distanceKm,
  onClose,
}: {
  distanceKm: number
  onClose: () => void
}): React.ReactElement {
  const choice = useQualityChoice()
  const measured = measuredTier()
  const first = useRef<HTMLButtonElement>(null)

  // Acilirken odak icine giriyor, yoksa klavyeyle gezen biri paneli hic
  // bulamiyor.
  useEffect(() => first.current?.focus(), [])

  return (
    <div className="settings" role="group" aria-label="Ayarlar">
      <div className="settings__row">
        <span className="settings__label">Kalite</span>
        <span className="settings__value">
          {CHOICES.map((option, index) => (
            <button
              key={option}
              ref={index === 0 ? first : undefined}
              type="button"
              className="chip"
              aria-pressed={choice === option}
              onClick={() => setQualityChoice(option)}
            >
              {choiceLabel(option)}
            </button>
          ))}
        </span>
      </div>

      {choice === 'auto' ? (
        <div className="settings__row">
          <span className="settings__label">Ölçülen</span>
          <span className="settings__value settings__value--plain">
            {measured ? TIER_LABELS[measured] : touchOnly ? 'dokunmatik, düşük' : 'ölçülüyor'}
          </span>
        </div>
      ) : null}

      <div className="settings__row">
        <span className="settings__label">Mesafe</span>
        <span className="settings__value settings__value--plain settings__value--num">
          {distanceKm.toFixed(1)} km
        </span>
      </div>

      <div className="settings__row">
        <span className="settings__label">Tohum</span>
        <span className="settings__value settings__value--plain">{SEED_NAME}</span>
      </div>

      <div className="settings__row">
        <span className="settings__label">Kapat</span>
        <span className="settings__value">
          <button type="button" className="chip" onClick={onClose}>
            esc
          </button>
        </span>
      </div>
    </div>
  )
}

export function Hud(): React.ReactElement {
  const snapshot = useSampled(readSnapshot)
  const [titleVisible, setTitleVisible] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const pointerActive = useRecentPointer()

  useEffect(() => {
    const timer = window.setTimeout(() => setTitleVisible(false), TITLE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const close = useCallback(() => {
    setSettingsOpen(false)
    // Odak geldigi yere donuyor, yoksa sekme sirasi sayfa basina atliyor.
    settingsButton.current?.focus()
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, close])

  const driving = snapshot.mode === 'driving'
  const hintVisible = useDrivingHint(driving)
  const controlsVisible = pointerActive || settingsOpen

  return (
    <>
      <div className="titlecard" data-hidden={!titleVisible || driving} aria-hidden="true">
        <h1 className="titlecard__name" lang="en">
          Lastlight
        </h1>
        <p className="titlecard__tagline" lang="en">
          an endless evening drive
        </p>
      </div>

      <div className="hud" data-hidden={!driving}>
        <div className="speed">
          <span className="speed__value">{snapshot.speedKmh}</span>
          <span className="speed__unit">km/h</span>
        </div>
        {/* Ipucu surus baslarken bir kez geliyor ve cekiliyor. Sonduktan sonra
            ekran okuyucudan da cikiyor: opacity: 0 ogeyi erisilebilirlik
            agacindan cikarmiyor, yani gorunmeyen bir ipucu okunmaya devam
            ediyordu. */}
        <span className="hint hint--drive" data-hidden={!hintVisible} aria-hidden={!hintVisible}>
          W A S D
        </span>
      </div>

      <div className="cluster" data-hidden={!controlsVisible}>
        {settingsOpen ? <Settings distanceKm={snapshot.distanceKm} onClose={close} /> : null}

        <div className="controls">
          {/* Dokunmatik cihazda surus yok; kume acildiginda soylenmesi gereken
              tek sey bu. Klavyeli cihazda ipucu alt bantta zaten gosterildi. */}
          {touchOnly ? <span className="hint">klavyeli bir cihazda sürebilirsin</span> : null}
          <SoundToggle />
          <button
            ref={settingsButton}
            type="button"
            className="toggle"
            aria-expanded={settingsOpen}
            onClick={() => (settingsOpen ? close() : setSettingsOpen(true))}
          >
            ayarlar
          </button>
        </div>
      </div>

      {import.meta.env.DEV ? (
        <div className="devpanel" data-over-budget={snapshot.frameMs > FRAME_BUDGET_MS}>
          {`${snapshot.fps} fps   ${snapshot.frameMs.toFixed(1)} ms\n` +
            `${snapshot.drawCalls} draw   ${(snapshot.triangles / 1000).toFixed(0)}k tri\n` +
            `${snapshot.distanceKm.toFixed(2)} km   ${snapshot.mode}`}
        </div>
      ) : null}
    </>
  )
}
