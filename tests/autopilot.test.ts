import { describe, it, expect } from 'vitest'
import { createAutopilot } from '@/core/autopilot'
import { createVehicleState, stepVehicle, VEHICLE } from '@/core/vehicle'
import { sampleRoad, toRoadSpace } from '@/core/road'
import { ROAD } from '@/core/config'
import { hashString } from '@/core/rng'

const SEED = hashString('lastlight')

/**
 * Otopilot uc isi birden yapiyor: acilis sinematigini suruyor, mobilde tek
 * surus modu oluyor, ve performans kiyaslama penceresini besliyor. O yuzden
 * bu test aslinda uc ozelligin ayni anda testi.
 */
function drive(seconds: number, dt = 1 / 60) {
  const autopilot = createAutopilot(SEED)
  const start = sampleRoad(SEED, 0)
  let state = { ...createVehicleState(start.x, start.z, start.heading), speed: 18 }

  let maxOffset = 0
  let minSpeed = Infinity
  let maxSpeed = 0

  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) {
    const input = autopilot.sample(state, dt)
    const road = toRoadSpace(SEED, state.x, state.z)
    state = stepVehicle(state, input, dt, { grade: sampleRoad(SEED, road.s).grade })

    if (i > 120) {
      maxOffset = Math.max(maxOffset, Math.abs(toRoadSpace(SEED, state.x, state.z).t))
      minSpeed = Math.min(minSpeed, state.speed)
      maxSpeed = Math.max(maxSpeed, state.speed)
    }
  }

  return { state, maxOffset, minSpeed, maxSpeed }
}

describe('otopilot seritte kaliyor', () => {
  it('iki dakika boyunca yoldan cikmiyor', () => {
    const { maxOffset } = drive(120)
    expect(maxOffset).toBeLessThan(ROAD.laneHalfWidth)
  })

  it('kendi seridinde makul olcude merkezde duruyor', () => {
    const { maxOffset } = drive(60)
    expect(maxOffset).toBeLessThan(2)
  })
})

describe('otopilot hiz tutuyor', () => {
  it('hedef hiz bandinda kaliyor', () => {
    const { minSpeed, maxSpeed } = drive(90)
    expect(minSpeed).toBeGreaterThan(8)
    expect(maxSpeed).toBeLessThanOrEqual(VEHICLE.maxSpeed)
  })

  it('duraklamiyor', () => {
    const { state } = drive(90)
    expect(state.speed).toBeGreaterThan(5)
  })

  it('gercekten ilerliyor', () => {
    const { state } = drive(60)
    expect(state.distance).toBeGreaterThan(500)
  })
})

describe('otopilot girdi sozlesmesine uyuyor', () => {
  it('butun degerler gecerli araliklarda', () => {
    const autopilot = createAutopilot(SEED)
    let state = { ...createVehicleState(0, 0, 0), speed: 20 }
    for (let i = 0; i < 600; i++) {
      const input = autopilot.sample(state, 1 / 60)
      expect(input.throttle).toBeGreaterThanOrEqual(0)
      expect(input.throttle).toBeLessThanOrEqual(1)
      expect(input.brake).toBeGreaterThanOrEqual(0)
      expect(input.brake).toBeLessThanOrEqual(1)
      expect(input.steer).toBeGreaterThanOrEqual(-1)
      expect(input.steer).toBeLessThanOrEqual(1)
      state = stepVehicle(state, input, 1 / 60, { grade: 0 })
    }
  })

  it('gaz ve fren ayni anda basili degil', () => {
    const autopilot = createAutopilot(SEED)
    let state = { ...createVehicleState(0, 0, 0), speed: 20 }
    for (let i = 0; i < 300; i++) {
      const input = autopilot.sample(state, 1 / 60)
      expect(Math.min(input.throttle, input.brake)).toBe(0)
      state = stepVehicle(state, input, 1 / 60, { grade: 0 })
    }
  })
})

describe('otopilot determinist', () => {
  it('ayni kosullar ayni surusu veriyor', () => {
    const a = drive(20)
    const b = drive(20)
    expect(a.state).toEqual(b.state)
  })
})
