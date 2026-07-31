/**
 * Prosedurel ses grafi. Tek byte ses dosyasi indirilmiyor: butun katmanlar
 * osilator ve gurultu tamponundan sentezleniyor.
 *
 * Karisim kararlari burada degil, saf cekirdekte (core/audio). Bu dosyanin isi
 * o karari Web Audio dugumlerine baglamak.
 *
 * Kilit acma: AudioContext tarayici politikasi geregi askida basliyor. Bir
 * kaplama veya "sesi ac" kapisi koymuyoruz, cunku sahne sessizken de tam
 * calisiyor; ilk tusa veya tiklamaya kadar sessiz duruyor, sonra iki saniyede
 * yumusakca yukseliyor. Ani baslayan ses sicratiyor.
 *
 * Parametreler kare basina deger yazmakla degil setTargetAtTime ile
 * guncelleniyor. Sebebi net: dogrudan atama ses ipliginde basamak uretiyor ve
 * yuksek frekansli bir tik olarak duyuluyor; setTargetAtTime yumusatmayi ses
 * ipliginin kendi ornekleme hizinda yapiyor.
 */

import { AUDIO, type AudioMix } from '@/core/audio'
import { mulberry32 } from '@/core/rng'

/** Gurultu tamponu uzunlugu (saniye). Kisa tampon dongu deseni duyuruyor. */
const NOISE_SECONDS = 3

/** Yumusatma zaman sabitleri (saniye). Kazanclar hizli, tini yavas oturuyor. */
const GAIN_TIME = 0.09
const FILTER_TIME = 0.16
const PITCH_TIME = 0.06
/** Sesi kapatma ve sekmeden ayrilma rampasi. */
const MUTE_TIME = 0.12

const NOISE_SEED = 0x4c_61_73_74

export interface SoundEngine {
  /** Ilk kullanici hareketinde cagriliyor; askidaki baglami acip sesi rampliyor. */
  unlock(): void
  setEnabled(enabled: boolean): void
  /** Sekme arkaya alindiginda sesi kesip baglami askiya aliyor. */
  setActive(active: boolean): void
  update(mix: AudioMix): void
  /**
   * Teshis icin: baglamin durumu, tercih, ve cikisin RMS seviyesi.
   *
   * Seviye olcumu sesin gercekten uretildigini dogrulamanin tek yolu. Baglamin
   * "running" olmasi yeterli kanit degil: butun kazanclar sifirda kalmis bir
   * graf da running gorunuyor. Olcum sadece gelistirme kipinde var.
   */
  info(): { state: AudioContextState; enabled: boolean; unlocked: boolean; level: number }
  dispose(): void
}

/**
 * Pembe gurultu tamponu. Beyaz gurultu ruzgar icin fazla parlak: kulak onu
 * hemen dijital duyuyor. Kellet yaklasimi ucuz ve oktav basina uc desibel
 * dususu yeterince iyi veriyor.
 */
function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * NOISE_SECONDS)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  const random = mulberry32(NOISE_SEED)

  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0

  for (let i = 0; i < length; i++) {
    const white = random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
    b6 = white * 0.115926
    data[i] = pink * 0.11
  }

  // Dongu dikisi: son yuz milisaniye basa carpraz geciyor, yoksa her dongude
  // duyulur bir tik oluyor.
  const fade = Math.floor(context.sampleRate * 0.1)
  for (let i = 0; i < fade; i++) {
    const amount = i / fade
    data[i] = data[i]! * amount + data[length - fade + i]! * (1 - amount)
  }

  return buffer
}

/** Tini kesimi: perdeyi takip ediyor ama tavana carpip duruyor. */
function engineToneFor(hz: number): number {
  return Math.min(hz * AUDIO.engine.toneMultiplier, AUDIO.engine.toneMaxHz)
}

function ramp(param: AudioParam, value: number, time: number, now: number): void {
  param.setTargetAtTime(value, now, time)
}

export function createSoundEngine(): SoundEngine {
  const context = new AudioContext()

  const master = context.createGain()
  master.gain.value = 0
  master.connect(context.destination)

  // Tek gurultu kaynagi iki filtre zincirini birden besliyor: iki ayri kaynak
  // iki kat bellek ve ayni sonuc demek.
  const noise = context.createBufferSource()
  noise.buffer = createNoiseBuffer(context)
  noise.loop = true

  // Ruzgar: alcak geciren, kesim frekansi hizla aciliyor. Alt taraftaki
  // gurultu temizleniyor, yoksa hoparlorde ise yaramayan bir gumburtu kaliyor.
  const windHighpass = context.createBiquadFilter()
  windHighpass.type = 'highpass'
  windHighpass.frequency.value = 70

  const windFilter = context.createBiquadFilter()
  windFilter.type = 'lowpass'
  windFilter.Q.value = 0.6
  windFilter.frequency.value = AUDIO.wind.minCutoff

  const windGain = context.createGain()
  windGain.gain.value = 0

  noise.connect(windHighpass).connect(windFilter).connect(windGain).connect(master)

  // Lastik: bant geciren. Merkez frekans zemine gore kayiyor, asfaltta ince
  // bir tislama, cakilda kalin bir hirilti.
  const tireFilter = context.createBiquadFilter()
  tireFilter.type = 'bandpass'
  tireFilter.Q.value = 1.3
  tireFilter.frequency.value = AUDIO.tire.asphaltCenter

  const tireGain = context.createGain()
  tireGain.gain.value = 0

  noise.connect(tireFilter).connect(tireGain).connect(master)

  // Motor: uc ucgen dalga hafif ayrik perdede. Testere disi denendi ve sert
  // duyuluyor: harmonikleri 1/n ile azaliyor, yani ust taraf dolu. Ucgen
  // dalganin harmonikleri 1/n^2 ile azaliyor ve sadece tek harmonikleri var;
  // ayni perde, cok daha yumusak ton. Aralarindaki vurus kalinligi veriyor;
  // tek osilator sinyal ureteci gibi duyuluyor.
  const engineGain = context.createGain()
  engineGain.gain.value = 0

  const engineTone = context.createBiquadFilter()
  engineTone.type = 'lowpass'
  engineTone.Q.value = 0.7
  engineTone.frequency.value = engineToneFor(AUDIO.engine.idleHz)
  engineTone.connect(engineGain).connect(master)

  const engineVoices = AUDIO.engine.detune.map((detune) => {
    const oscillator = context.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = AUDIO.engine.idleHz * (1 + detune)

    const voiceGain = context.createGain()
    voiceGain.gain.value = 1 / AUDIO.engine.detune.length
    oscillator.connect(voiceGain).connect(engineTone)

    return { oscillator, detune }
  })

  // Ortam pedi: kok ve ustundeki besli. Cok yavas bir dalgalanma var, ama
  // nefes gibi degil; gel git gibi, farkina varilmayacak kadar yavas.
  const padGain = context.createGain()
  padGain.gain.value = 0
  padGain.connect(master)

  const padVoices = AUDIO.pad.intervals.map((interval) => {
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = AUDIO.pad.rootHz * interval

    const voiceGain = context.createGain()
    voiceGain.gain.value = 1 / AUDIO.pad.intervals.length
    oscillator.connect(voiceGain).connect(padGain)

    return oscillator
  })

  const lfo = context.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = AUDIO.pad.lfoHz

  const lfoDepth = context.createGain()
  lfoDepth.gain.value = AUDIO.pad.gain * AUDIO.pad.lfoDepth
  lfo.connect(lfoDepth).connect(padGain.gain)

  // Cikis olcum noktasi. Uretimde graf temiz kaliyor, olcum sadece
  // gelistirmede ve uctan uca testte var.
  const analyser = import.meta.env.DEV ? context.createAnalyser() : null
  const samples = analyser ? new Float32Array(analyser.fftSize) : null
  if (analyser) master.connect(analyser)

  noise.start()
  for (const voice of engineVoices) voice.oscillator.start()
  for (const oscillator of padVoices) oscillator.start()
  lfo.start()

  let enabled = true
  let unlocked = false
  let active = true
  let disposed = false

  function targetMaster(): number {
    return enabled && unlocked && active ? AUDIO.master : 0
  }

  function applyMaster(rampSeconds: number): void {
    const now = context.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(targetMaster(), now + rampSeconds)
  }

  return {
    unlock(): void {
      if (disposed || unlocked) return
      unlocked = true
      void context.resume()
      applyMaster(AUDIO.unlockRamp)
    },

    setEnabled(next: boolean): void {
      if (disposed) return
      enabled = next
      applyMaster(enabled ? AUDIO.unlockRamp * 0.5 : MUTE_TIME)
    },

    setActive(next: boolean): void {
      if (disposed) return
      active = next
      applyMaster(MUTE_TIME)
      if (!active) {
        // Rampa bitene kadar bekleyip askiya aliyoruz, yoksa ses ortasindan
        // kesiliyor ve tik olarak duyuluyor.
        window.setTimeout(() => {
          if (!active && !disposed) void context.suspend()
        }, MUTE_TIME * 3000)
      } else if (unlocked) {
        void context.resume()
      }
    },

    update(mix: AudioMix): void {
      if (disposed || context.state !== 'running') return
      const now = context.currentTime

      ramp(windGain.gain, mix.windGain, GAIN_TIME, now)
      ramp(windFilter.frequency, mix.windCutoff, FILTER_TIME, now)

      ramp(tireGain.gain, mix.tireGain, GAIN_TIME, now)
      ramp(tireFilter.frequency, mix.tireCenter, FILTER_TIME, now)

      ramp(engineGain.gain, mix.engineGain, GAIN_TIME, now)
      for (const voice of engineVoices) {
        ramp(voice.oscillator.frequency, mix.engineHz * (1 + voice.detune), PITCH_TIME, now)
      }
      // Tini perdeyi takip ediyor: sabit kesimde yuksek devir bogulup
      // rolanti tizlesiyor. Tavan yuksek devirde sertlesmeyi kesiyor.
      ramp(engineTone.frequency, engineToneFor(mix.engineHz), FILTER_TIME, now)

      ramp(padGain.gain, mix.padGain, FILTER_TIME, now)
    },

    info() {
      let level = 0
      if (analyser && samples) {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += sample * sample
        level = Math.sqrt(sum / samples.length)
      }
      return { state: context.state, enabled, unlocked, level }
    },

    dispose(): void {
      if (disposed) return
      disposed = true
      noise.stop()
      for (const voice of engineVoices) voice.oscillator.stop()
      for (const oscillator of padVoices) oscillator.stop()
      lfo.stop()
      void context.close()
    },
  }
}
