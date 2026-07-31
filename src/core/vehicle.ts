/**
 * Arcade arac fizigi. Fizik motoru yok: kinematik arac, sahte yalpa, ve
 * yanal tutunma limiti. Saf fonksiyon; girdiyi kimin urettigini bilmiyor,
 * bu yuzden ayni fizik hem klavyeyi hem otopilotu hem de ileride gamepad'i
 * besliyor.
 *
 * Donme orani iki katmanli. Once bisiklet modelinden kinematik donme orani
 * cikiyor, sonra yanal ivme limitiyle yumusak doyuma sokuluyor. Sert kirpma
 * yerine tanh kullanmanin sebebi his: sert kirpmada direksiyonun ilk yuzde
 * onu her seyi yapar, gerisi olu hisseder.
 */

import { clamp, moveToward } from './math'

export const VEHICLE = {
  /** Ust hiz siniri (m/s). Gucten dolayi pratikte ~26 m/s'te dengeye geliyor. */
  maxSpeed: 42,
  /** Durma esigi altinda hiz tam sifira cekiliyor, yoksa asla durmuyor. */
  stopThreshold: 0.06,

  enginePower: 8.5,
  brakePower: 12,
  rollingResistance: 0.45,
  dragCoefficient: 0.0042,

  wheelbase: 2.7,
  /** Tam kilitte on teker acisi (radyan). */
  maxSteerAngle: (32 * Math.PI) / 180,
  /**
   * Hiz duyarliligi: direksiyon acisi hizin karesiyle daraliyor. Gercek
   * araclarda da otoyol hizinda teker acisi birkac dereceyi gecmiyor.
   */
  steerSpeedSensitivity: 0.023,
  /** Direksiyonun girdiyi takip etme hizi (1/s). */
  steerRate: 3.2,
  /** Yanal ivme limiti (m/s^2), lastik tutunmasi. */
  maxLateralAccel: 8,

  gravity: 9.81,
} as const

export interface DriveInput {
  /** 0..1 */
  throttle: number
  /** 0..1 */
  brake: number
  /** -1..1 */
  steer: number
}

export interface VehicleState {
  x: number
  z: number
  /** Yaw (radyan), +X eksenine gore. */
  heading: number
  /** Ileri hiz (m/s), asla negatif degil. */
  speed: number
  /** Yumusatilmis direksiyon konumu, -1..1. */
  steer: number
  /** Son karede uygulanan donme orani (rad/s). Gorsel yalpa bunu kullaniyor. */
  yawRate: number
  /** Kat edilen toplam mesafe (m). */
  distance: number
}

export interface VehicleContext {
  /** Aracin bulundugu noktada yolun egimi (dy/ds). */
  grade: number
}

export function createVehicleState(x: number, z: number, heading: number): VehicleState {
  return { x, z, heading, speed: 0, steer: 0, yawRate: 0, distance: 0 }
}

export function stepVehicle(
  state: VehicleState,
  input: DriveInput,
  dt: number,
  context: VehicleContext,
): VehicleState {
  const throttle = clamp(input.throttle, 0, 1)
  const brake = clamp(input.brake, 0, 1)
  const steerTarget = clamp(input.steer, -1, 1)

  const steer = moveToward(state.steer, steerTarget, VEHICLE.steerRate * dt)

  // Boylamsal ivme. Surukleme yari kapali cozuluyor, yoksa dt degistiginde
  // sonuc gorunur sekilde kayiyor.
  const thrust = throttle * VEHICLE.enginePower * (1 - state.speed / VEHICLE.maxSpeed)
  const resistance = VEHICLE.rollingResistance + brake * VEHICLE.brakePower
  const slope = VEHICLE.gravity * context.grade

  const drag = VEHICLE.dragCoefficient * state.speed
  let speed = (state.speed + (thrust - resistance - slope) * dt) / (1 + drag * dt)

  if (speed < 0) speed = 0
  if (speed > VEHICLE.maxSpeed) speed = VEHICLE.maxSpeed
  if (throttle === 0 && speed < VEHICLE.stopThreshold) speed = 0

  // Donme orani: bisiklet modeli, ustune yanal tutunma doyumu.
  // Adim ortasi hiz kullaniliyor; adim sonu hizi kullanmak sapma acisini dt'ye
  // birinci dereceden duyarli yapiyor ve hata yanal konumda birikiyor.
  const speedMid = 0.5 * (state.speed + speed)
  const steerAngle =
    (VEHICLE.maxSteerAngle * steer) / (1 + VEHICLE.steerSpeedSensitivity * speedMid * speedMid)
  const kinematicYaw = (speedMid * Math.tan(steerAngle)) / VEHICLE.wheelbase

  let yawRate = 0
  if (speedMid > 0) {
    const gripLimit = VEHICLE.maxLateralAccel / speedMid
    yawRate = gripLimit * Math.tanh(kinematicYaw / gripLimit)
  }

  const heading = state.heading + yawRate * dt
  const travelled = speed * dt

  // Adim icinde arac bir yay ciziyor. Kiris yaklasimi dt ile birinci
  // dereceden hata biriktiriyor ve hata yanal eksende topluyor; sabit hiz ve
  // sabit donme orani varsayimiyla yayin integrali kapali formda var, onu
  // kullaniyoruz. Kalan dt duyarliligi ikinci derece.
  let deltaX: number
  let deltaZ: number
  if (Math.abs(yawRate) > 1e-6) {
    const radius = speed / yawRate
    deltaX = radius * (Math.sin(heading) - Math.sin(state.heading))
    deltaZ = -radius * (Math.cos(heading) - Math.cos(state.heading))
  } else {
    deltaX = Math.cos(heading) * travelled
    deltaZ = Math.sin(heading) * travelled
  }

  return {
    x: state.x + deltaX,
    z: state.z + deltaZ,
    heading,
    speed,
    steer,
    yawRate,
    distance: state.distance + travelled,
  }
}
