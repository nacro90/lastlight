/**
 * Fizigi suren bilesen. Hicbir sey render etmiyor; sadece sabit adimli
 * simulasyonu ilerletip paylasilan arac durumunu guncelliyor.
 *
 * Mod gecisi burada yonetiliyor: oyuncu bir tusa dokundugu an kontrol ona
 * geciyor, yirmi bes saniye dokunmazsa sinematik mod geri devraliyor.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { ROAD } from '@/core/config'
import { sampleContact, type SurfaceContact } from '@/core/contact'
import { FIXED_STEP, createStepper } from '@/core/loop'
import { createAutopilot } from '@/core/autopilot'
import { clamp, smoothstep } from '@/core/math'
import { ROAD_EDGE, sampleRoad, toRoadSpace } from '@/core/road'
import { VEHICLE, createVehicleState, stepVehicle, type VehicleState } from '@/core/vehicle'
import { createKeyboardSource } from '@/input/keyboard'
import { IDLE_RETURN_MS, SEED, car, runtime } from './state'

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

  const smoothedRoll = useRef(0)
  const smoothedPitch = useRef(0)
  const smoothedBodyRoll = useRef(0)
  const smoothedBodyPitch = useRef(0)
  const previousSpeed = useRef(0)

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
    const steps = stepper.advance(delta)

    // Egim artik yolun degil, aracin altindaki gercek yuzeyin egimi. Asfalt
    // uzerinde ikisi ayni cikiyor (arazi yol kenarinin icinde tam olarak yol
    // yuksekliginde), araziye cikildiginda ayrisiyor.
    const grade = contact.current?.forwardGrade ?? 0
    const surfaceScale = rollingScale.current

    for (let step = 0; step < steps; step++) {
      const input =
        runtime.mode === 'driving' ? keyboard.sample() : autopilot.sample(state, FIXED_STEP)
      state = stepVehicle(state, input, FIXED_STEP, { grade, rollingScale: surfaceScale })
    }

    vehicle.current = state

    const road = toRoadSpace(SEED, state.x, state.z)
    const sample = sampleRoad(SEED, road.s)

    const surface = sampleContact(
      SEED,
      state.x,
      state.z,
      state.heading,
      VEHICLE.wheelbase / 2,
      HALF_TRACK,
    )
    contact.current = surface
    rollingScale.current =
      1 +
      (OFFROAD_ROLLING_SCALE - 1) *
        smoothstep(ROAD.laneHalfWidth, ROAD_EDGE + 1.5, Math.abs(road.t))

    // Kasa araziye oturuyor: tekerler bu duzlemde kaliyor.
    const chassisBlend = 1 - Math.exp(-POSE_SMOOTHING * delta)
    smoothedPitch.current += (surface.pitch - smoothedPitch.current) * chassisBlend
    smoothedRoll.current += (surface.roll - smoothedRoll.current) * chassisBlend

    // Govde kasanin uzerinde birkac derece oynuyor: viraj yalpasi ve dalma.
    // Bunlar tekerleri etkilemiyor, o yuzden teker havada kalmiyor.
    const lateralAcceleration = state.yawRate * state.speed
    const longitudinalAcceleration = delta > 0 ? (state.speed - previousSpeed.current) / delta : 0
    previousSpeed.current = state.speed

    const targetBodyRoll = clamp(
      sample.banking - lateralAcceleration * BODY_LEAN,
      -MAX_BODY_ROLL,
      MAX_BODY_ROLL,
    )
    const targetBodyPitch = clamp(
      longitudinalAcceleration * BODY_DIVE,
      -MAX_BODY_PITCH,
      MAX_BODY_PITCH,
    )

    const bodyBlend = 1 - Math.exp(-BODY_SMOOTHING * delta)
    smoothedBodyRoll.current += (targetBodyRoll - smoothedBodyRoll.current) * bodyBlend
    smoothedBodyPitch.current += (targetBodyPitch - smoothedBodyPitch.current) * bodyBlend

    car.x = state.x
    car.z = state.z
    car.y = surface.height
    car.heading = state.heading
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
    car.speed = state.speed
    car.distance = state.distance
    car.s = road.s
    car.t = road.t
    car.yawRate = state.yawRate
  })

  return null
}
