/**
 * HUD. Cok minimal olmasi kasitli: surerken ekranda sadece hiz var.
 * Sinematik moddayken hicbir sey yok, cunku bos ekran varsayilan hal;
 * arayuz oyuncu dokununca geliyor.
 *
 * Kare basina degeri React state'ine yazmiyoruz. Hiz saniyede sekiz kez
 * ornekleniyor; her karede yazmak her karede reconciliation demek olurdu.
 */

import { useCallback, useEffect, useState } from 'react'

import { setSoundEnabled, soundEnabled, subscribeSound } from '@/audio/preference'
import { car, perf, runtime } from '@/sim/state'

const SAMPLE_INTERVAL_MS = 125
const TITLE_DURATION_MS = 5200
const FRAME_BUDGET_MS = 16.6

function useSampled<T>(read: () => T, intervalMs = SAMPLE_INTERVAL_MS): T {
  const [value, setValue] = useState(read)

  useEffect(() => {
    const timer = window.setInterval(() => setValue(read()), intervalMs)
    return () => window.clearInterval(timer)
  }, [read, intervalMs])

  return value
}

/**
 * Ses dugmesi. Alt bandin sag ucunda, sabit; nabız atan veya parlayan hicbir
 * sey yok. Fark edilmesi gereken sey yerlesimle cozuluyor.
 *
 * M tusu da ayni tercihi degistiriyor: klavyeyle surerken fareye gitmek
 * akisi bozuyor.
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
      aria-label={enabled ? 'Sesi kapat' : 'Sesi ac'}
      data-off={!enabled}
    >
      ses
    </button>
  )
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

export function Hud(): React.ReactElement {
  const snapshot = useSampled(readSnapshot)
  const [titleVisible, setTitleVisible] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setTitleVisible(false), TITLE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const driving = snapshot.mode === 'driving'

  return (
    <>
      <div className="titlecard" data-hidden={!titleVisible || driving} aria-hidden="true">
        <h1 className="titlecard__name">Lastlight</h1>
        <p className="titlecard__tagline">an endless evening drive</p>
      </div>

      <div className="hud" data-hidden={!driving}>
        <div className="speed">
          <span className="speed__value">{snapshot.speedKmh}</span>
          <span className="speed__unit">km/h</span>
        </div>
        <div className="controls">
          <span className="hint">W A S D</span>
          <SoundToggle />
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
