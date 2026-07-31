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
import { smoothstep } from '@/core/math'
import { ROAD_EDGE, sampleRoad, toRoadSpace } from '@/core/road'
import { VEHICLE, createVehicleState, stepVehicle, type VehicleState } from '@/core/vehicle'
import { createKeyboardSource } from '@/input/keyboard'
import { IDLE_RETURN_MS, SEED, car, runtime } from './state'

/** Yanal ivmeden gorsel yalpa katsayisi. */
const BODY_LEAN = 0.045
/** Yalpa ve egimin takip yumusatmasi (1/s). Sanal suspansiyon bu. */
const POSE_SMOOTHING = 9
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

    const targetPitch = surface.pitch
    const targetRoll = surface.roll + sample.banking - state.yawRate * state.speed * BODY_LEAN
    const blend = 1 - Math.exp(-POSE_SMOOTHING * delta)
    smoothedPitch.current += (targetPitch - smoothedPitch.current) * blend
    smoothedRoll.current += (targetRoll - smoothedRoll.current) * blend

    car.x = state.x
    car.z = state.z
    car.y = surface.height
    car.heading = state.heading
    car.pitch = smoothedPitch.current
    car.roll = smoothedRoll.current
    car.speed = state.speed
    car.distance = state.distance
    car.s = road.s
    car.t = road.t
    car.yawRate = state.yawRate
  })

  return null
}
