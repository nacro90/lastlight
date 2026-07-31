/**
 * Fizigi suren bilesen. Hicbir sey render etmiyor; sadece sabit adimli
 * simulasyonu ilerletip paylasilan arac durumunu guncelliyor.
 *
 * Mod gecisi burada yonetiliyor: oyuncu bir tusa dokundugu an kontrol ona
 * geciyor, yirmi bes saniye dokunmazsa sinematik mod geri devraliyor.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { FIXED_STEP, createStepper } from '@/core/loop'
import { createAutopilot } from '@/core/autopilot'
import { sampleRoad, toRoadSpace } from '@/core/road'
import { terrainHeight } from '@/core/terrain'
import { createVehicleState, stepVehicle, type VehicleState } from '@/core/vehicle'
import { createKeyboardSource } from '@/input/keyboard'
import { IDLE_RETURN_MS, SEED, car, runtime } from './state'

/** Yanal ivmeden gorsel yalpa katsayisi. */
const BODY_LEAN = 0.045
/** Yalpa ve egimin takip yumusatmasi (1/s). */
const POSE_SMOOTHING = 9

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

    for (let step = 0; step < steps; step++) {
      const road = toRoadSpace(SEED, state.x, state.z)
      const sample = sampleRoad(SEED, road.s)
      const input =
        runtime.mode === 'driving' ? keyboard.sample() : autopilot.sample(state, FIXED_STEP)
      state = stepVehicle(state, input, FIXED_STEP, { grade: sample.grade })
    }

    vehicle.current = state

    const road = toRoadSpace(SEED, state.x, state.z)
    const sample = sampleRoad(SEED, road.s)

    const targetPitch = Math.atan(sample.grade)
    const targetRoll = sample.banking - state.yawRate * state.speed * BODY_LEAN
    const blend = 1 - Math.exp(-POSE_SMOOTHING * delta)
    smoothedPitch.current += (targetPitch - smoothedPitch.current) * blend
    smoothedRoll.current += (targetRoll - smoothedRoll.current) * blend

    car.x = state.x
    car.z = state.z
    car.y = terrainHeight(SEED, road.s, road.t)
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
