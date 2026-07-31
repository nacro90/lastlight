/**
 * Prosedurel arac. Doku yok, indirilen model yok: bir avuc kutu ve kama.
 *
 * Gerekce sanat yonetimi. Ters isikta ucuncu sahis kamerada araca baktiginda
 * gordugun sey koyu bir siluet artı camdaki turuncu yansima; model detayinin
 * gorsel getirisi neredeyse sifir. Ileride GLB takmak istersek bu bilesenin
 * icini degistirmek yetiyor.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { car } from '@/sim/state'

const WHEEL_RADIUS = 0.34
const WHEEL_WIDTH = 0.22
const TRACK = 0.82
const AXLE_FRONT = 1.24
const AXLE_REAR = -1.3

const BODY_COLOR = '#2b2f3a'
const CABIN_COLOR = '#151821'
const GLASS_COLOR = '#f2a65a'
const WHEEL_COLOR = '#0f1014'

export function Car(): React.ReactElement {
  const group = useRef<THREE.Group>(null)
  const wheels = useRef<Array<THREE.Mesh | null>>([])
  const spin = useRef(0)

  useFrame((_, delta) => {
    const body = group.current
    if (!body) return

    body.position.set(car.x, car.y + WHEEL_RADIUS, car.z)
    // Yaw, sonra pitch, sonra roll: sirasi onemli, yoksa yalpa yatay eksende kayiyor.
    body.rotation.order = 'YZX'
    body.rotation.y = -car.heading
    body.rotation.z = car.pitch
    body.rotation.x = car.roll

    // Yuvarlanma donusu tekerlegin kendi ekseni (silindirin Y'si) etrafinda.
    spin.current += (car.speed / WHEEL_RADIUS) * delta
    for (const wheel of wheels.current) {
      if (wheel) wheel.rotation.y = spin.current
    }
  })

  const wheelPositions: Array<[number, number, number]> = [
    [AXLE_FRONT, 0, TRACK],
    [AXLE_FRONT, 0, -TRACK],
    [AXLE_REAR, 0, TRACK],
    [AXLE_REAR, 0, -TRACK],
  ]

  return (
    <group ref={group} castShadow>
      {/* Govde */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[4.1, 0.52, 1.78]} />
        <meshStandardMaterial color={BODY_COLOR} roughness={0.42} metalness={0.35} flatShading />
      </mesh>

      {/* Kabin */}
      <mesh position={[-0.24, 0.86, 0]} castShadow>
        <boxGeometry args={[2.05, 0.5, 1.58]} />
        <meshStandardMaterial color={CABIN_COLOR} roughness={0.5} metalness={0.2} flatShading />
      </mesh>

      {/* On cam: gunes bunun uzerinde yansiyor, aracin okunmasini o saglıyor. */}
      <mesh position={[0.74, 0.82, 0]} rotation={[0, 0, -0.62]} castShadow={false}>
        <boxGeometry args={[0.62, 0.06, 1.5]} />
        <meshStandardMaterial
          color={GLASS_COLOR}
          roughness={0.12}
          metalness={0.1}
          emissive={GLASS_COLOR}
          emissiveIntensity={0.35}
        />
      </mesh>

      {/* Alt govde: aracin yere oturmasini bu koyu kutle satiyor. */}
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[3.7, 0.22, 1.62]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.9} flatShading />
      </mesh>

      {/* Aks yonlendirmesi ebeveyn grupta, yuvarlanma donusu cocukta: ikisi
          ayni nesnede olursa Euler sirasi yuzunden birbirine karisiyor. */}
      {wheelPositions.map((position, index) => (
        <group key={index} position={position} rotation={[Math.PI / 2, 0, 0]}>
          <mesh
            ref={(mesh) => {
              wheels.current[index] = mesh
            }}
            castShadow
          >
            <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 12]} />
            <meshStandardMaterial color={WHEEL_COLOR} roughness={0.85} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}
