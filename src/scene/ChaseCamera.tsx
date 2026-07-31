/**
 * Takip kamerasi.
 *
 * Bu tur oyunlarda kalite algisinin buyuk kismi kamerada: yol, isik, ses ne
 * kadar iyi olursa olsun kamera araca sertce kenetlenmisse deneyim ucuz
 * hissettiriyor. O yuzden yay ve sonumleme var, sert kenetlenme yok.
 *
 * Ileri bakis kaymasi sayesinde viraja girerken kamera virajin icini gormeye
 * basliyor. Hiz arttikca gorus acisi birkac derece aciliyor; hiz hissini
 * bedavaya guclendiren en ucuz numara bu. Kamera sarsintisi yok, sarsinti bu
 * projenin duygusuna aykiri.
 */

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { car, runtime } from '@/sim/state'

const CHASE_DISTANCE = 9.5
const CHASE_HEIGHT = 3.4
const CHASE_STIFFNESS = 4.2

const LOOK_AHEAD_BASE = 14
const LOOK_AHEAD_PER_SPEED = 0.5
const LOOK_HEIGHT = 1.5

const FOV_BASE = 52
const FOV_PER_SPEED = 0.14

/** Sinematik moddaki yavas yanal salinim. Gun 2'de bunun yerine kesmeler gelecek. */
const CINEMATIC_SWAY = 3.6
const CINEMATIC_PERIOD = 11
const CINEMATIC_LIFT = 1.2

export function ChaseCamera(): null {
  const { camera } = useThree()
  const lookTarget = useRef(new THREE.Vector3())
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    elapsed.current += delta

    const forwardX = Math.cos(car.heading)
    const forwardZ = Math.sin(car.heading)
    // Sag vektor: ileri yonun yatayda 90 derece dondurulmusu.
    const rightX = -forwardZ
    const rightZ = forwardX

    let sway = 0
    let lift = 0
    if (runtime.mode === 'cinematic') {
      const phase = (elapsed.current / CINEMATIC_PERIOD) * Math.PI * 2
      sway = Math.sin(phase) * CINEMATIC_SWAY
      lift = Math.sin(phase * 0.5) * CINEMATIC_LIFT
    }

    const desiredX = car.x - forwardX * CHASE_DISTANCE + rightX * sway
    const desiredZ = car.z - forwardZ * CHASE_DISTANCE + rightZ * sway
    const desiredY = car.y + CHASE_HEIGHT + lift

    const blend = 1 - Math.exp(-CHASE_STIFFNESS * delta)
    camera.position.x += (desiredX - camera.position.x) * blend
    camera.position.y += (desiredY - camera.position.y) * blend
    camera.position.z += (desiredZ - camera.position.z) * blend

    const lookAhead = LOOK_AHEAD_BASE + car.speed * LOOK_AHEAD_PER_SPEED
    lookTarget.current.set(
      car.x + forwardX * lookAhead,
      car.y + LOOK_HEIGHT,
      car.z + forwardZ * lookAhead,
    )
    camera.lookAt(lookTarget.current)

    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = FOV_BASE + car.speed * FOV_PER_SPEED
      if (Math.abs(camera.fov - fov) > 0.02) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    }
  })

  return null
}
