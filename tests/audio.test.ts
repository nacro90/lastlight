import { describe, it, expect } from 'vitest'
import { AUDIO, GEAR_TOP_SPEEDS, engineHzFor, mixFor, type AudioInput } from '@/core/audio'
import { VEHICLE } from '@/core/vehicle'

const AT_REST: AudioInput = { speed: 0, throttle: 0, brake: 0, offroad: 0 }

function at(overrides: Partial<AudioInput>): AudioInput {
  return { ...AT_REST, ...overrides }
}

/** Hiz taramasi: fiziksel ust sinira kadar ince adimlarla. */
function speeds(step = 0.05): number[] {
  const values: number[] = []
  for (let speed = 0; speed <= VEHICLE.maxSpeed; speed += step) values.push(speed)
  return values
}

describe('ses sabitleri', () => {
  it('butun kazanclar makul aralikta', () => {
    // Toplami 1'i asarsa toplama noktasinda kirpiliyor ve ses cizilıyor.
    const total =
      AUDIO.wind.maxGain + AUDIO.tire.maxGain + AUDIO.engine.maxGain + AUDIO.pad.gain
    expect(total).toBeLessThanOrEqual(1)
    expect(AUDIO.master).toBeGreaterThan(0)
    expect(AUDIO.master).toBeLessThanOrEqual(1)
  })

  it('kilit acma rampasi duyulur bir sure', () => {
    // Ani baslayan ses sicratiyor; rampa en az bir saniye olmali.
    expect(AUDIO.unlockRamp).toBeGreaterThanOrEqual(1)
  })

  it('vitesler artan sirada ve son vites ust hizi kapsiyor', () => {
    for (let i = 1; i < GEAR_TOP_SPEEDS.length; i++) {
      expect(GEAR_TOP_SPEEDS[i]!).toBeGreaterThan(GEAR_TOP_SPEEDS[i - 1]!)
    }
    expect(GEAR_TOP_SPEEDS.at(-1)!).toBeGreaterThanOrEqual(VEHICLE.maxSpeed)
  })
})

describe('motor perdesi', () => {
  it('perde araligi dar tutuluyor', () => {
    // Genis aralik motoru yuksek devirde ciglik gibi duyuruyor ve sakin bir
    // deneyimde yeri yok. Bir oktavin biraz ustu yeterli: vites gecisi
    // duyuluyor ama tepe perde tiz degil.
    const span = AUDIO.engine.peakHz / AUDIO.engine.idleHz
    expect(span).toBeLessThanOrEqual(2.5)
    // Cok darsa da vites gecisi kaybolur ve motor tek notaya duser.
    expect(span).toBeGreaterThanOrEqual(1.6)
  })

  it('tepe perdede tini parlakligi sinirli', () => {
    // Tini kesimi perdeyi takip ediyor; ust sinir olmazsa yuksek devirde
    // ustteki harmonikler acılıp ses sertlesiyor.
    const engine = AUDIO.engine
    expect(engine.peakHz * engine.toneMultiplier).toBeGreaterThan(engine.toneMaxHz)
    expect(engine.toneMaxHz).toBeLessThanOrEqual(700)
  })

  it('rolantide taban frekans', () => {
    expect(engineHzFor(0)).toBeCloseTo(AUDIO.engine.idleHz, 6)
  })

  it('her hizda tanimli aralikta kaliyor', () => {
    for (const speed of speeds()) {
      const hz = engineHzFor(speed)
      expect(hz).toBeGreaterThanOrEqual(AUDIO.engine.idleHz - 1e-9)
      expect(hz).toBeLessThanOrEqual(AUDIO.engine.peakHz + 1e-9)
    }
  })

  it('vites icinde perde yukseliyor', () => {
    // Vites araliginin ortasindan sonuna kadar tek yonlu artis.
    for (let gear = 0; gear < GEAR_TOP_SPEEDS.length; gear++) {
      const bottom = gear === 0 ? 0 : GEAR_TOP_SPEEDS[gear - 1]!
      const top = GEAR_TOP_SPEEDS[gear]!
      let previous = -Infinity
      for (let speed = bottom + 0.01; speed < top; speed += (top - bottom) / 40) {
        const hz = engineHzFor(speed)
        expect(hz).toBeGreaterThan(previous)
        previous = hz
      }
    }
  })

  it('vites gecisinde perde dusuyor, ustune cikmiyor', () => {
    // Yukari vites perdeyi indirmek zorunda; yukselirse kulak vites degil
    // bozukluk duyuyor.
    for (let gear = 0; gear < GEAR_TOP_SPEEDS.length - 1; gear++) {
      const top = GEAR_TOP_SPEEDS[gear]!
      const before = engineHzFor(top - 1e-4)
      const after = engineHzFor(top + 1e-4)
      expect(after).toBeLessThan(before)
      expect(after).toBeGreaterThan(AUDIO.engine.idleHz)
    }
  })

  it('en az uc vites gecisi duyuluyor', () => {
    let drops = 0
    let previous = engineHzFor(0)
    for (const speed of speeds(0.01)) {
      const hz = engineHzFor(speed)
      if (hz < previous - 1e-9) drops++
      previous = hz
    }
    expect(drops).toBeGreaterThanOrEqual(3)
  })

  it('negatif hiz rolantiye kelepceleniyor', () => {
    expect(engineHzFor(-5)).toBeCloseTo(AUDIO.engine.idleHz, 6)
  })
})

describe('karisim', () => {
  it('dururken ruzgar ve lastik sessiz, motor rolantide', () => {
    const mix = mixFor(AT_REST)
    expect(mix.windGain).toBeCloseTo(0, 6)
    expect(mix.tireGain).toBeCloseTo(0, 6)
    expect(mix.engineGain).toBeGreaterThan(0)
    expect(mix.engineHz).toBeCloseTo(AUDIO.engine.idleHz, 6)
  })

  it('ruzgar hizla artiyor ve acilıyor', () => {
    let previousGain = -Infinity
    let previousCutoff = -Infinity
    for (const speed of speeds(0.25)) {
      const mix = mixFor(at({ speed }))
      expect(mix.windGain).toBeGreaterThanOrEqual(previousGain - 1e-12)
      expect(mix.windCutoff).toBeGreaterThanOrEqual(previousCutoff - 1e-12)
      previousGain = mix.windGain
      previousCutoff = mix.windCutoff
    }
    expect(previousGain).toBeCloseTo(AUDIO.wind.maxGain, 6)
  })

  it('lastik sesi hizla artiyor', () => {
    const slow = mixFor(at({ speed: 4 }))
    const fast = mixFor(at({ speed: 26 }))
    expect(fast.tireGain).toBeGreaterThan(slow.tireGain)
    expect(slow.tireGain).toBeGreaterThan(0)
  })

  it('arazide lastik sesi daha gur ve daha kalin', () => {
    // Cakil ve cimen dusuk frekansli; asfalt ince bir tislama.
    const asphalt = mixFor(at({ speed: 20, offroad: 0 }))
    const dirt = mixFor(at({ speed: 20, offroad: 1 }))
    expect(dirt.tireGain).toBeGreaterThan(asphalt.tireGain)
    expect(dirt.tireCenter).toBeLessThan(asphalt.tireCenter)
  })

  it('gaz motor sesini yukseltiyor, fren yukseltmiyor', () => {
    const coasting = mixFor(at({ speed: 18 }))
    const pulling = mixFor(at({ speed: 18, throttle: 1 }))
    const braking = mixFor(at({ speed: 18, brake: 1 }))
    expect(pulling.engineGain).toBeGreaterThan(coasting.engineGain)
    expect(braking.engineGain).toBeLessThanOrEqual(coasting.engineGain)
  })

  it('ortam pedi hizdan bagimsiz', () => {
    // Ped zeminin kendisi. Hiza tepki verirse ikinci bir motor katmani oluyor.
    for (const speed of [0, 9, 21, 40]) {
      expect(mixFor(at({ speed })).padGain).toBeCloseTo(AUDIO.pad.gain, 9)
    }
  })

  it('butun cikislar sonlu ve kazanclar [0,1] araliginda', () => {
    for (const speed of speeds(0.5)) {
      for (const offroad of [0, 0.5, 1]) {
        for (const throttle of [0, 1]) {
          const mix = mixFor(at({ speed, offroad, throttle }))
          for (const value of Object.values(mix)) {
            expect(Number.isFinite(value)).toBe(true)
          }
          for (const gain of [mix.windGain, mix.tireGain, mix.engineGain, mix.padGain]) {
            expect(gain).toBeGreaterThanOrEqual(0)
            expect(gain).toBeLessThanOrEqual(1)
          }
          expect(mix.windCutoff).toBeGreaterThan(0)
          expect(mix.tireCenter).toBeGreaterThan(0)
        }
      }
    }
  })

  it('aralik disi girdiler kelepceleniyor', () => {
    const wild = mixFor({ speed: 1e6, throttle: 12, brake: -3, offroad: 9 })
    expect(wild.windGain).toBeCloseTo(AUDIO.wind.maxGain, 6)
    expect(wild.engineGain).toBeLessThanOrEqual(AUDIO.engine.maxGain + 1e-9)
    expect(wild.engineHz).toBeLessThanOrEqual(AUDIO.engine.peakHz + 1e-9)
    expect(mixFor({ speed: -20, throttle: -1, brake: 5, offroad: -4 }).tireGain).toBeCloseTo(0, 6)
  })

  it('saf: ayni girdi ayni cikis', () => {
    const input = at({ speed: 17.3, throttle: 0.4, offroad: 0.2 })
    expect(mixFor(input)).toEqual(mixFor(input))
  })
})
