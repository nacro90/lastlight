/**
 * Otopilot, klavyeyle ayni DriveInput sozlesmesini uretiyor. Fizik girdiyi
 * kimin urettigini bilmedigi icin bu tek modul uc isi birden yapiyor:
 * acilis sinematigini suruyor, dokunmatik cihazda tek surus modu oluyor,
 * ve ilk uc saniyedeki performans kiyaslama penceresini besliyor.
 *
 * Kontrol basit bir ileri bakis takibi: yolun ilerideki sapma acisina
 * kilitleniyor, uzerine merkez hattan sapmayi geri cekecek bir duzeltme
 * ekliyor.
 */

import { clamp } from './math'
import { sampleRoad, toRoadSpace } from './road'
import type { DriveInput, VehicleState } from './vehicle'

/** Hedef seyir hizi (m/s), yaklasik 79 km/h. */
const TARGET_SPEED = 22
const LOOKAHEAD_BASE = 12
const LOOKAHEAD_PER_SPEED = 0.55

const HEADING_GAIN = 1.6
/** Merkez hattan her metre sapma icin eklenen hedef aci (radyan). */
const OFFSET_GAIN = 0.09

const THROTTLE_GAIN = 0.35
const BRAKE_GAIN = 0.25
/** Bu kadar hiz fazlasi tolere ediliyor; yoksa gaz fren arasi titrer. */
const SPEED_TOLERANCE = 0.6

export interface Autopilot {
  sample(state: VehicleState, dt: number): DriveInput
}

function wrapAngle(angle: number): number {
  let wrapped = angle
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI
  while (wrapped < -Math.PI) wrapped += 2 * Math.PI
  return wrapped
}

export function createAutopilot(seed: number): Autopilot {
  return {
    sample(state: VehicleState): DriveInput {
      const { s, t } = toRoadSpace(seed, state.x, state.z)
      const lookahead = LOOKAHEAD_BASE + state.speed * LOOKAHEAD_PER_SPEED
      const ahead = sampleRoad(seed, s + lookahead)

      const desiredHeading = ahead.heading - t * OFFSET_GAIN
      const headingError = wrapAngle(desiredHeading - state.heading)
      const steer = clamp(headingError * HEADING_GAIN, -1, 1)

      const speedError = TARGET_SPEED - state.speed
      const throttle = speedError > 0 ? clamp(speedError * THROTTLE_GAIN, 0, 1) : 0
      const brake =
        speedError < -SPEED_TOLERANCE ? clamp(-speedError * BRAKE_GAIN, 0, 1) : 0

      return { throttle, brake, steer }
    },
  }
}
