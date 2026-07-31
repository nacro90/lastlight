/**
 * Fizigi suren bilesen. Hicbir sey render etmiyor; sadece sabit adimli
 * simulasyonu ilerletip paylasilan arac durumunu guncelliyor.
 *
 * Mod gecisi burada yonetiliyor: oyuncu bir tusa dokundugu an kontrol ona
 * geciyor, yirmi bes saniye dokunmazsa sinematik mod geri devraliyor.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { sampleContact, type SurfaceContact } from '@/core/contact'
import { FIXED_STEP, createStepper } from '@/core/loop'
import { createAutopilot } from '@/core/autopilot'
import { approach, clamp } from '@/core/math'
import { offroadAmount, sampleRoad, toRoadSpace } from '@/core/road'
import {
  VEHICLE,
  createVehicleState,
  interpolateVehicle,
  stepVehicle,
  type VehicleState,
} from '@/core/vehicle'
import { createKeyboardSource } from '@/input/keyboard'
import { IDLE_RETURN_MS, SEED, car, control, runtime } from './state'

/**
 * Yanal ivmeden govde yalpasi. Katsayi kucuk gorunuyor ama carptigi sey
 * yanal ivme ve o deger tutunma limiti olan 8 m/s^2'ye kadar cikiyor; bu
 * yuzden ust sinir da var. Sinirsiz birakildiginda arac yirmi derece
 * yatiyordu ve absurt duruyordu.
 */
const BODY_LEAN = 0.009
const MAX_BODY_ROLL = (4.5 * Math.PI) / 180

/** Boylamsal ivmeden govde egimi: gazda cokme, frende dalma. */
const BODY_DIVE = 0.006
const MAX_BODY_PITCH = (2.2 * Math.PI) / 180

/** Kasa durusunun takip yumusatmasi (1/s). */
const POSE_SMOOTHING = 9
/** Govde hareketi daha yayli: yalpa ve dalma kasadan yavas oturuyor. */
const BODY_SMOOTHING = 5.5
/** Suspansiyonun yutabildigi dusey hareket (metre). */
const SUSPENSION_TRAVEL = 0.16
/** Aracin iz genisliginin yarisi. */
const HALF_TRACK = 0.82
/** Cimen ve toprakta yuvarlanma direnci bu katla artiyor. */
const OFFROAD_ROLLING_SCALE = 3.4

export function Simulation(): null {
  const keyboard = useMemo(() => createKeyboardSource(), [])
  const autopilot = useMemo(() => createAutopilot(SEED), [])
  const stepper = useMemo(() => createStepper(), [])

  useEffect(() => () => keyboard.dispose(), [keyboard])

  const vehicle = useRef<VehicleState>(null)
  if (vehicle.current === null) {
    const start = sampleRoad(SEED, 0)
    vehicle.current = { ...createVehicleState(start.x, start.z, start.heading), speed: 20 }
  }

  /**
   * Bir onceki fizik durumu. Render zamani iki durum arasinda konumlaniyor,
   * cunku ekran kare hizi ile fizik adimi ortusmuyor: 144 Hz ekranda kare
   * deseni 1,1,1,0 oluyor ve o sifir karelerde arac duruyor, kamera ise devam
   * ediyor. Gorunur mikro titremenin sebebi buydu.
   */
  const priorState = useRef<VehicleState | null>(null)

  const smoothedRoll = useRef(0)
  const smoothedPitch = useRef(0)
  const smoothedBodyRoll = useRef(0)
  const smoothedBodyPitch = useRef(0)
  /**
   * Boylamsal ivme fizik adimindan turetiliyor, kare suresinden degil. Kare
   * suresi degisken oldugu icin turev gurultulu cikiyor ve govde egiminde
   * titreme uretiyor.
   */
  const acceleration = useRef(0)

  // Zemin temasi kare basina bir kez orneklenip fizige bir sonraki karede
  // veriliyor. Adim basina ornekleme dogru olurdu ama egim iki metrede
  // olcusebilir olcude degismiyor; bu takas dort yukseklik sorgusunu
  // karede bir kez yapmayi sagliyor.
  const contact = useRef<SurfaceContact | null>(null)
  const rollingScale = useRef(1)

  useFrame((_, delta) => {
    // Mod gecisi kare basina bir kez degerlendiriliyor, adim basina degil.
    const now = performance.now()
    if (keyboard.active) {
      runtime.mode = 'driving'
      runtime.lastInputAt = now
    } else if (runtime.mode === 'driving' && now - runtime.lastInputAt > IDLE_RETURN_MS) {
      runtime.mode = 'cinematic'
    }

    let state = vehicle.current as VehicleState
    let prior = priorState.current ?? state
    const steps = stepper.advance(delta)

    // Egim artik yolun degil, aracin altindaki gercek yuzeyin egimi. Asfalt
    // uzerinde ikisi ayni cikiyor (arazi yol kenarinin icinde tam olarak yol
    // yuksekliginde), araziye cikildiginda ayrisiyor.
    const grade = contact.current?.forwardGrade ?? 0
    const surfaceScale = rollingScale.current

    for (let step = 0; step < steps; step++) {
      const input =
        runtime.mode === 'driving' ? keyboard.sample() : autopilot.sample(state, FIXED_STEP)
      prior = state
      state = stepVehicle(state, input, FIXED_STEP, { grade, rollingScale: surfaceScale })
      acceleration.current = (state.speed - prior.speed) / FIXED_STEP

      control.throttle = input.throttle
      control.brake = input.brake
      control.steer = input.steer
    }

    vehicle.current = state
    priorState.current = prior

    // Render zamani son iki fizik durumu arasinda. alpha, adima donusmemis
    // birikmis zamanin sabit adima orani.
    const rendered = interpolateVehicle(prior, state, stepper.pending / FIXED_STEP)

    const road = toRoadSpace(SEED, rendered.x, rendered.z)
    const sample = sampleRoad(SEED, road.s)

    const surface = sampleContact(
      SEED,
      rendered.x,
      rendered.z,
      rendered.heading,
      VEHICLE.wheelbase / 2,
      HALF_TRACK,
    )
    contact.current = surface
    rollingScale.current = 1 + (OFFROAD_ROLLING_SCALE - 1) * offroadAmount(road.t)

    // Kasa araziye oturuyor: tekerler bu duzlemde kaliyor.
    smoothedPitch.current = approach(smoothedPitch.current, surface.pitch, POSE_SMOOTHING, delta)
    smoothedRoll.current = approach(smoothedRoll.current, surface.roll, POSE_SMOOTHING, delta)

    // Govde kasanin uzerinde birkac derece oynuyor: viraj yalpasi ve dalma.
    // Bunlar tekerleri etkilemiyor, o yuzden teker havada kalmiyor.
    const lateralAcceleration = rendered.yawRate * rendered.speed

    const targetBodyRoll = clamp(
      sample.banking - lateralAcceleration * BODY_LEAN,
      -MAX_BODY_ROLL,
      MAX_BODY_ROLL,
    )
    const targetBodyPitch = clamp(
      acceleration.current * BODY_DIVE,
      -MAX_BODY_PITCH,
      MAX_BODY_PITCH,
    )

    smoothedBodyRoll.current = approach(
      smoothedBodyRoll.current,
      targetBodyRoll,
      BODY_SMOOTHING,
      delta,
    )
    smoothedBodyPitch.current = approach(
      smoothedBodyPitch.current,
      targetBodyPitch,
      BODY_SMOOTHING,
      delta,
    )

    car.x = rendered.x
    car.z = rendered.z
    car.y = surface.height
    car.heading = rendered.heading
    car.pitch = smoothedPitch.current
    car.roll = smoothedRoll.current
    car.bodyRoll = smoothedBodyRoll.current
    car.bodyPitch = smoothedBodyPitch.current

    for (let wheel = 0; wheel < 4; wheel++) {
      car.wheelOffsets[wheel] = clamp(
        surface.wheelOffsets[wheel]!,
        -SUSPENSION_TRAVEL,
        SUSPENSION_TRAVEL,
      )
    }
    car.speed = rendered.speed
    car.distance = rendered.distance
    car.s = road.s
    car.t = road.t
    car.yawRate = rendered.yawRate
  })

  return null
}
