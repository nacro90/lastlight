/**
 * Ses karisiminin saf modeli.
 *
 * Web Audio grafi kirli katmanda (src/audio) kuruluyor; buradaki is sadece
 * "arac durumu verildiginde her katmanin kazanci ve frekansi ne olmali"
 * sorusunu cevaplamak. Bu ayrimin bedeli yok, karsiliginda karisim test
 * edilebilir hale geliyor: motor perdesinin vites gecisinde dustugunu veya
 * arazide lastik sesinin kalinlastigini kulakla degil olcumle dogruluyoruz.
 *
 * Dort katman var ve her birinin tek bir isi var:
 *   ruzgar  - hizi tasiyan genis bantli katman, kabinin dis sesi
 *   lastik  - zemini tasiyan katman, asfaltta ince, cakilda kalin
 *   motor   - araci tasiyan katman, gaz ve vitesle karakter veriyor
 *   ped     - sahnenin zemini, hizdan tamamen bagimsiz
 *
 * Ped kasitli olarak hiza tepki vermiyor. Verirse ikinci bir motor katmanina
 * donusuyor ve dururken sahne bosaliyor; oysa altin saatin surekliligini
 * tasiyan sey tam olarak o degismeyen zemin.
 */

import { clamp, clamp01, lerp, smoothstep } from './math'

export const AUDIO = {
  /** Toplam ses seviyesi. Sahne sakin; ust sinir kasitli olarak alcak. */
  master: 0.5,
  /** Kilit acildiktan sonra sesin yukseldigi sure (saniye). */
  unlockRamp: 2,

  wind: {
    /** Bu hizin altinda ruzgar yok; dururken sessizlik olmali. */
    startSpeed: 1.5,
    /** Bu hizda ruzgar tam kazanca ulasiyor. */
    fullSpeed: 34,
    /** Alcak hizda sadece ugultu, yuksek hizda tislama: filtre aciliyor. */
    minCutoff: 170,
    maxCutoff: 1600,
    maxGain: 0.34,
  },

  tire: {
    startSpeed: 0.5,
    fullSpeed: 26,
    /** Asfaltta lastik sesi ince ve kisik. */
    asphaltGain: 0.16,
    /** Cakil ve cimende daha gur; ust sinir da bu. */
    maxGain: 0.26,
    /** Bant geciren filtrenin merkez frekansi: asfalt ince, arazi kalin. */
    asphaltCenter: 1100,
    offroadCenter: 380,
  },

  engine: {
    /**
     * Rolanti temel frekansi (Hz). Daha alcak degerler dizustu hoparlorunun
     * kestigi bolgeye dusuyor ve motor sadece filtreden gecen harmoniklerle
     * duyuluyor; bu aralik temel sesin kendisini de tasiyor.
     */
    idleHz: 56,
    /**
     * Tepe perde. Rolantinin iki katinin biraz uzerinde, yani bir oktav arti
     * birkac ses. Genis aralik denendi ve yuksek devirde ciglik gibi
     * duyuluyor; sakin bir deneyimde yeri yok. Bu aralikta vites gecisi hala
     * duyuluyor ama tepe perde tiz degil.
     */
    peakHz: 120,
    /**
     * Tini kesimi perdenin bu kati. Ucgen dalga zaten yumusak; kesim ustteki
     * az sayida harmonigi de yuvarliyor.
     */
    toneMultiplier: 5,
    /**
     * Kesim ust siniri (Hz). Perdeyi sinirsiz takip ederse yuksek devirde
     * harmonikler acilip ses sertlesiyor; tavan sertligi kesiyor.
     */
    toneMaxHz: 460,
    /** Gaz kesikken bile motor duyulur, yoksa arac elektrikli gibi oluyor. */
    idleGain: 0.07,
    maxGain: 0.24,
    /**
     * Yuk karisimi: motor sesi hem hizla hem gazla yukseliyor. Gazin agirligi
     * daha yuksek, cunku kulak yuku gazdan okuyor.
     */
    speedWeight: 0.35,
    throttleWeight: 0.65,
    /** Frende motor geri cekiliyor. */
    brakeDucking: 0.25,
    /**
     * Uc sesin birbirine gore perde kaymasi. Tam ayni perdede uc osilator tek
     * bir osilatorden farksiz; hafif ayrik olduklarinda aralarindaki vurus
     * motora kalinlik veriyor.
     */
    detune: [0, 0.0075, -0.011],
  },

  pad: {
    /** Ortam pedi: duyulan degil hissedilen katman. */
    gain: 0.08,
    /** Kok frekans ve beslinin ustu: acik, karar vermeyen bir aralik. */
    rootHz: 110,
    intervals: [1, 1.5, 2.9925],
    /** Cok yavas dalgalanma (Hz). Nefes gibi degil, gel git gibi. */
    lfoHz: 0.043,
    lfoDepth: 0.35,
  },
} as const

/**
 * Vites ust hizlari (m/s). Son vites aracin ust hizini kapsiyor, yoksa en
 * hizli halde vites araligi disina cikiliyor.
 */
export const GEAR_TOP_SPEEDS: readonly number[] = [7.5, 14, 21.5, 30, 42]

/** Yukari viteste perde bu orana dusuyor; gecis burada duyuluyor. */
const SHIFT_DROP = 0.45

export interface AudioInput {
  /** Ileri hiz (m/s). */
  speed: number
  /** 0..1 */
  throttle: number
  /** 0..1 */
  brake: number
  /** Zemin: 0 asfalt, 1 tam arazi. */
  offroad: number
}

export interface AudioMix {
  windGain: number
  windCutoff: number
  tireGain: number
  tireCenter: number
  engineGain: number
  engineHz: number
  padGain: number
}

/**
 * Hizdan motor perdesi. Sahte bir vites kutusu: perde vites icinde yukseliyor,
 * gecise gelince duserek yeniden tirmaniyor.
 *
 * Surekli (vitessiz) bir perde egrisi denendi ve elektrikli arac gibi
 * duyuluyor; kulak hizi vites gecisinden okuyor.
 */
export function engineHzFor(speed: number): number {
  const value = Math.max(0, speed)
  const { idleHz, peakHz } = AUDIO.engine

  let gear = GEAR_TOP_SPEEDS.length - 1
  for (let i = 0; i < GEAR_TOP_SPEEDS.length; i++) {
    if (value <= GEAR_TOP_SPEEDS[i]!) {
      gear = i
      break
    }
  }

  const bottom = gear === 0 ? 0 : GEAR_TOP_SPEEDS[gear - 1]!
  const top = GEAR_TOP_SPEEDS[gear]!
  const fraction = clamp01((value - bottom) / (top - bottom))

  // Birinci viteste rolantiden basliyoruz; ustlerde gecis dususunden.
  const low = gear === 0 ? idleHz : lerp(idleHz, peakHz, SHIFT_DROP)
  return lerp(low, peakHz, fraction)
}

export function mixFor(input: AudioInput): AudioMix {
  const speed = Math.max(0, input.speed)
  const throttle = clamp01(input.throttle)
  const brake = clamp01(input.brake)
  const offroad = clamp01(input.offroad)

  const windCurve = smoothstep(AUDIO.wind.startSpeed, AUDIO.wind.fullSpeed, speed)
  const tireCurve = smoothstep(AUDIO.tire.startSpeed, AUDIO.tire.fullSpeed, speed)

  const engine = AUDIO.engine
  const speedFraction = clamp01(speed / GEAR_TOP_SPEEDS.at(-1)!)
  const load = clamp01(engine.speedWeight * speedFraction + engine.throttleWeight * throttle)
  const engineGain =
    lerp(engine.idleGain, engine.maxGain, load) * (1 - engine.brakeDucking * brake)

  return {
    windGain: AUDIO.wind.maxGain * windCurve,
    windCutoff: lerp(AUDIO.wind.minCutoff, AUDIO.wind.maxCutoff, windCurve),
    tireGain: lerp(AUDIO.tire.asphaltGain, AUDIO.tire.maxGain, offroad) * tireCurve,
    tireCenter: lerp(AUDIO.tire.asphaltCenter, AUDIO.tire.offroadCenter, offroad),
    engineGain: clamp(engineGain, 0, engine.maxGain),
    engineHz: engineHzFor(speed),
    padGain: AUDIO.pad.gain,
  }
}
