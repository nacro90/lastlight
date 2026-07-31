/**
 * Prosedurel arac. Doku yok, indirilen model yok: bir avuc kutu ve kama.
 *
 * Gerekce sanat yonetimi. Ters isikta ucuncu sahis kamerada araca baktiginda
 * gordugun sey koyu bir siluet artı camdaki turuncu yansima; model detayinin
 * gorsel getirisi neredeyse sifir. Ileride GLB takmak istersek bu bilesenin
 * icini degistirmek yetiyor.
 *
 * Hiyerarsi uc katmanli ve bu onemli:
 *
 *   kasa    araziye fit edilen duzleme oturuyor (arazi egimi ve yatmasi)
 *   tekerler kasa duzleminden kendi temas noktalarina suspansiyonla iniyor
 *   govde   kasanin uzerinde birkac derece oynuyor (viraj yalpasi, dalma)
 *
 * Tek bir gruba hepsini birden uygulamak tekerleri yerden kaldiriyor ve arac
 * kirik gorunuyor. Yalpayi govdeye ayirmak bunu cozuyor.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { VEHICLE } from '@/core/vehicle'
import { car } from '@/sim/state'

const WHEEL_RADIUS = 0.34
const WHEEL_WIDTH = 0.22

/** Aks noktalari fizigin ornekleme noktalariyla birebir ayni. */
const HALF_WHEELBASE = VEHICLE.wheelbase / 2
const HALF_TRACK = 0.82

const BODY_COLOR = '#2b2f3a'
const CABIN_COLOR = '#151821'
const GLASS_COLOR = '#f2a65a'
const WHEEL_COLOR = '#0f1014'
const UNDERBODY_COLOR = '#0b0c10'

/** Sira zemin temasiyla ayni: on sol, on sag, arka sol, arka sag. */
const WHEEL_POSITIONS: Array<[number, number, number]> = [
  [HALF_WHEELBASE, 0, -HALF_TRACK],
  [HALF_WHEELBASE, 0, HALF_TRACK],
  [-HALF_WHEELBASE, 0, -HALF_TRACK],
  [-HALF_WHEELBASE, 0, HALF_TRACK],
]

export function Car(): React.ReactElement {
  const chassis = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const wheelMounts = useRef<Array<THREE.Group | null>>([])
  const wheelMeshes = useRef<Array<THREE.Mesh | null>>([])
  const spin = useRef(0)

  useFrame((_, delta) => {
    const root = chassis.current
    if (!root) return

    root.position.set(car.x, car.y + WHEEL_RADIUS, car.z)
    // Yaw, sonra pitch, sonra roll: sirasi onemli, yoksa yalpa yatay eksende kayiyor.
    root.rotation.order = 'YZX'
    root.rotation.y = -car.heading
    root.rotation.z = car.pitch
    root.rotation.x = car.roll

    const shell = body.current
    if (shell) {
      shell.rotation.order = 'YZX'
      shell.rotation.z = car.bodyPitch
      shell.rotation.x = car.bodyRoll
    }

    for (let wheel = 0; wheel < WHEEL_POSITIONS.length; wheel++) {
      const mount = wheelMounts.current[wheel]
      if (mount) mount.position.y = car.wheelOffsets[wheel] ?? 0
    }

    // Yuvarlanma donusu tekerlegin kendi ekseni (silindirin Y'si) etrafinda.
    spin.current += (car.speed / WHEEL_RADIUS) * delta
    for (const mesh of wheelMeshes.current) {
      if (mesh) mesh.rotation.y = spin.current
    }
  })

  return (
    <group ref={chassis}>
      <group ref={body}>
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
        <mesh position={[0.74, 0.82, 0]} rotation={[0, 0, -0.62]}>
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
          <meshStandardMaterial color={UNDERBODY_COLOR} roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* Aks yonlendirmesi mount grubunda, yuvarlanma donusu cocukta: ikisi
          ayni nesnede olursa Euler sirasi yuzunden birbirine karisiyor.
          Mount'un Y konumu suspansiyon hareketini tasiyor. */}
      {WHEEL_POSITIONS.map((position, index) => (
        <group
          key={index}
          ref={(mount) => {
            wheelMounts.current[index] = mount
          }}
          position={position}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <mesh
            ref={(mesh) => {
              wheelMeshes.current[index] = mesh
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
