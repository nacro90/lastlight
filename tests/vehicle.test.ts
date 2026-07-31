import { describe, it, expect } from 'vitest'
import { createVehicleState, stepVehicle, VEHICLE, type DriveInput } from '@/core/vehicle'

const IDLE: DriveInput = { throttle: 0, brake: 0, steer: 0 }
const FULL_THROTTLE: DriveInput = { throttle: 1, brake: 0, steer: 0 }

function run(
  state = createVehicleState(0, 0, 0),
  input: DriveInput = IDLE,
  seconds = 1,
  dt = 1 / 60,
  grade = 0,
) {
  let current = state
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) current = stepVehicle(current, input, dt, { grade })
  return current
}

describe('durma davranisi', () => {
  it('girdi yoksa yavaslayip duruyor', () => {
    const rolling = { ...createVehicleState(0, 0, 0), speed: 20 }
    const stopped = run(rolling, IDLE, 60)
    expect(stopped.speed).toBe(0)
  })

  it('durduktan sonra durmus kaliyor', () => {
    const rolling = { ...createVehicleState(0, 0, 0), speed: 20 }
    const stopped = run(rolling, IDLE, 60)
    const later = run(stopped, IDLE, 30)
    expect(later.speed).toBe(0)
    expect(later.x).toBe(stopped.x)
    expect(later.z).toBe(stopped.z)
  })

  it('fren geri vitese gecmiyor', () => {
    const rolling = { ...createVehicleState(0, 0, 0), speed: 5 }
    const braked = run(rolling, { throttle: 0, brake: 1, steer: 0 }, 20)
    expect(braked.speed).toBe(0)
  })
})

describe('determinizm', () => {
  it('ayni girdi ayni sonucu veriyor', () => {
    const a = run(createVehicleState(0, 0, 0), FULL_THROTTLE, 5)
    const b = run(createVehicleState(0, 0, 0), FULL_THROTTLE, 5)
    expect(a).toEqual(b)
  })

  it('durumu yerinde degistirmiyor', () => {
    const initial = createVehicleState(0, 0, 0)
    const snapshot = { ...initial }
    stepVehicle(initial, FULL_THROTTLE, 1 / 60, { grade: 0 })
    expect(initial).toEqual(snapshot)
  })
})

describe('hiz sinirlari', () => {
  it('ust hiz sinirini asmiyor', () => {
    const fast = run(createVehicleState(0, 0, 0), FULL_THROTTLE, 300)
    expect(fast.speed).toBeLessThanOrEqual(VEHICLE.maxSpeed)
  })

  it('gaz verildiginde gercekten hizlaniyor', () => {
    const moving = run(createVehicleState(0, 0, 0), FULL_THROTTLE, 5)
    expect(moving.speed).toBeGreaterThan(8)
  })

  it('hiz asla negatif olmuyor', () => {
    let state = { ...createVehicleState(0, 0, 0), speed: 1 }
    for (let i = 0; i < 2000; i++) {
      state = stepVehicle(state, { throttle: 0, brake: 1, steer: 1 }, 1 / 60, { grade: 0 })
      expect(state.speed).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('direksiyon', () => {
  it('duruyorken direksiyon araci dondurmuyor', () => {
    // Yerinde donen arac, arcade fizigin en sik ve en sirit eden hatasi.
    const stopped = createVehicleState(0, 0, 0)
    const turned = run(stopped, { throttle: 0, brake: 0, steer: 1 }, 3)
    expect(turned.heading).toBeCloseTo(0, 6)
  })

  it('hareket halinde direksiyon donduruyor', () => {
    const rolling = { ...createVehicleState(0, 0, 0), speed: 15 }
    const turned = run(rolling, { throttle: 0.4, brake: 0, steer: 1 }, 2)
    expect(Math.abs(turned.heading)).toBeGreaterThan(0.1)
  })

  it('direksiyon isareti tutarli', () => {
    const rolling = { ...createVehicleState(0, 0, 0), speed: 15 }
    const right = run(rolling, { throttle: 0.4, brake: 0, steer: 1 }, 2)
    const left = run(rolling, { throttle: 0.4, brake: 0, steer: -1 }, 2)
    expect(Math.sign(right.heading)).toBe(-Math.sign(left.heading))
  })

  it('direksiyon ani degil, yumusatilarak uygulaniyor', () => {
    const rolling = { ...createVehicleState(0, 0, 0), speed: 20 }
    const oneFrame = stepVehicle(rolling, { throttle: 0, brake: 0, steer: 1 }, 1 / 60, { grade: 0 })
    expect(oneFrame.steer).toBeGreaterThan(0)
    expect(oneFrame.steer).toBeLessThan(1)
  })

  it('yuksek hizda direksiyon daha az agresif', () => {
    // Hiz duyarli olmazsa 150 km/h'te direksiyon araci takla attiriyor gibi olur.
    const slow = { ...createVehicleState(0, 0, 0), speed: 8, steer: 1 }
    const fast = { ...createVehicleState(0, 0, 0), speed: 40, steer: 1 }
    const slowTurn = stepVehicle(slow, { throttle: 0, brake: 0, steer: 1 }, 1 / 60, { grade: 0 })
    const fastTurn = stepVehicle(fast, { throttle: 0, brake: 0, steer: 1 }, 1 / 60, { grade: 0 })
    const slowRadius = slow.speed / Math.abs(slowTurn.yawRate)
    const fastRadius = fast.speed / Math.abs(fastTurn.yawRate)
    expect(fastRadius).toBeGreaterThan(slowRadius)
  })
})

describe('dt bagimsizligi', () => {
  const initial = { ...createVehicleState(0, 0, 0), speed: 18 }
  const input: DriveInput = { throttle: 0.7, brake: 0, steer: 0.5 }

  it('hiz ve sapma acisi dt ile degismiyor', () => {
    // "Hizli bilgisayarda arac daha hizli gidiyor" sinifini olduren asil olcut.
    const single = run(initial, input, 4, 1 / 60)
    const double = run(initial, input, 4, 1 / 120)
    expect(double.speed).toBeCloseTo(single.speed, 2)
    expect(double.heading).toBeCloseTo(single.heading, 2)
    expect(double.distance).toBeCloseTo(single.distance, 1)
  })

  it('yorunge farki kat edilen mesafenin binde ikisinin altinda', () => {
    // Mutlak esik yerine goreli olcut kullaniyoruz cunku kalan fark yorungenin
    // buyuklugu ile olceklenen tek seferlik bir kaymadir.
    const single = run(initial, input, 4, 1 / 60)
    const double = run(initial, input, 4, 1 / 120)
    const drift = Math.hypot(double.x - single.x, double.z - single.z)
    expect(drift / single.distance).toBeLessThan(0.002)
  })

  it('yorunge farki birikmiyor: goreli fark sure ile buyumuyor', () => {
    // Asil korktugumuz sey sistematik ayrisma. Kalan fark direksiyon
    // rampasinin ayriklastirilmasindan gelen tek seferlik bir kaymadir, ve
    // uretimde sabit adimla (core/loop) tamamen ortadan kalkiyor.
    const relativeDrift = (seconds: number) => {
      const a = run(initial, input, seconds, 1 / 60)
      const b = run(initial, input, seconds, 1 / 120)
      return Math.hypot(b.x - a.x, b.z - a.z) / a.distance
    }
    expect(relativeDrift(8)).toBeLessThan(relativeDrift(4) * 1.5)
  })
})

describe('egim', () => {
  it('yukari egimde yavaslama daha hizli', () => {
    const rolling = { ...createVehicleState(0, 0, 0), speed: 25 }
    const flat = run(rolling, IDLE, 3, 1 / 60, 0)
    const uphill = run(rolling, IDLE, 3, 1 / 60, 0.08)
    expect(uphill.speed).toBeLessThan(flat.speed)
  })

  it('asagi egimde gaz olmadan hizlanabiliyor', () => {
    const rolling = { ...createVehicleState(0, 0, 0), speed: 5 }
    const downhill = run(rolling, IDLE, 3, 1 / 60, -0.08)
    expect(downhill.speed).toBeGreaterThan(5)
  })
})

describe('konum integrasyonu', () => {
  it('ileri yon sapma acisini takip ediyor', () => {
    const heading = Math.PI / 6
    const rolling = { ...createVehicleState(0, 0, heading), speed: 10 }
    const moved = stepVehicle(rolling, IDLE, 1, { grade: 0 })
    expect(moved.x - rolling.x).toBeCloseTo(Math.cos(heading) * moved.speed, 1)
    expect(moved.z - rolling.z).toBeCloseTo(Math.sin(heading) * moved.speed, 1)
  })

  it('kat edilen mesafe artiyor ve geri gitmiyor', () => {
    let state = createVehicleState(0, 0, 0)
    let previous = state.distance
    for (let i = 0; i < 600; i++) {
      state = stepVehicle(state, FULL_THROTTLE, 1 / 60, { grade: 0 })
      expect(state.distance).toBeGreaterThanOrEqual(previous)
      previous = state.distance
    }
    expect(state.distance).toBeGreaterThan(0)
  })
})
