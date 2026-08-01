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

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { VEHICLE } from '@/core/vehicle'
import { approach } from '@/core/math'
import { car, control } from '@/sim/state'

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
/**
 * Arka lamba. Doygunluk kasitli olarak yuksek: AgX tone mapping parlak degerleri
 * beyaza dogru cekiyor ve olculdu, daha soluk bir kirmizi frende somon pembesi
 * olarak cikiyordu.
 */
const TAIL_COLOR = '#ff2a10'
/** On lamba. Soguk beyaz degil, sarimsi: aksam isigina karsi beyaz mor duruyor. */
const HEAD_COLOR = '#ffe3b0'

/**
 * Arka lamba parlakligi. Serbest surerken deger bloom esiginin (1.05) altinda,
 * yani lamba yaniyor ama parlamiyor; frende esigin ustune cikiyor ve tek
 * parlayan sey o oluyor.
 *
 * Kamera aracin arkasinda oldugu icin bu, girdinin gorunur tek geri bildirimi.
 * Dikkat cekmek icin degil, fren yaptigini gormek icin var.
 */
const TAIL_IDLE = 0.4
/**
 * Fren parlakligi olcumle secildi. Iki bucuk denendi ve lamba somon pembesine
 * dondu: AgX bir buçugun ustunde doygunlugu hizla kesiyor, yani "daha parlak"
 * yapmak lambayi kirmizidan uzaklastiriyor. Bu deger dizin (knee) hemen
 * altinda: kirmizi kirmizi kaliyor, bloom'a sadece kenardan giriyor.
 */
const TAIL_BRAKING = 1.25
/** Lambanin frene yetismesi (1/s). Ampul de aniden yanmiyor. */
const TAIL_RESPONSE = 14

/** Sira zemin temasiyla ayni: on sol, on sag, arka sol, arka sag. */
const WHEEL_POSITIONS: Array<[number, number, number]> = [
  [HALF_WHEELBASE, 0, -HALF_TRACK],
  [HALF_WHEELBASE, 0, HALF_TRACK],
  [-HALF_WHEELBASE, 0, -HALF_TRACK],
  [-HALF_WHEELBASE, 0, HALF_TRACK],
]

/** Simetrik kucuk parcalari tek geometride birlestirir. */
function pair(
  size: [number, number, number],
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const left = new THREE.BoxGeometry(...size)
  left.translate(x, y, -z)
  const right = new THREE.BoxGeometry(...size)
  right.translate(x, y, z)

  const merged = mergeGeometries([left, right])
  if (!merged) throw new Error('simetrik parca birlestirilemedi')
  return merged
}

export function Car(): React.ReactElement {
  const geometries = useMemo(
    () => ({
      mirrors: pair([0.15, 0.1, 0.17], 0.66, 0.79, 0.95),
      tailLights: pair([0.08, 0.16, 0.34], -2.03, 0.5, 0.66),
      headLights: pair([0.08, 0.14, 0.4], 2.03, 0.48, 0.62),
    }),
    [],
  )

  const chassis = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const wheelMounts = useRef<Array<THREE.Group | null>>([])
  const wheelMeshes = useRef<Array<THREE.Mesh | null>>([])
  const tailMaterial = useRef<THREE.MeshStandardMaterial>(null)
  const spin = useRef(0)
  const tailGlow = useRef(TAIL_IDLE)

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

    const target = TAIL_IDLE + (TAIL_BRAKING - TAIL_IDLE) * control.brake
    tailGlow.current = approach(tailGlow.current, target, TAIL_RESPONSE, delta)
    if (tailMaterial.current) tailMaterial.current.emissiveIntensity = tailGlow.current
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

        {/* Arka cam: gunesin ters tarafinda, o yuzden koyu. Egimi silueti
            station wagon'a benzetiyor ve arac profilden okunur hale geliyor. */}
        <mesh position={[-1.22, 0.83, 0]} rotation={[0, 0, 0.72]}>
          <boxGeometry args={[0.5, 0.06, 1.46]} />
          <meshStandardMaterial color={CABIN_COLOR} roughness={0.3} metalness={0.25} flatShading />
        </mesh>

        {/* Tavan seridi: kabinden bir tik dar, yani tepede ince bir kenar
            isigi olusuyor ve kabin tek blok gorunmuyor. Golge dusurmuyor;
            kabinin golgesinin icinde kaliyor ve gecise cagri ekliyor. */}
        <mesh position={[-0.24, 1.13, 0]}>
          <boxGeometry args={[1.86, 0.06, 1.42]} />
          <meshStandardMaterial color={BODY_COLOR} roughness={0.38} metalness={0.4} flatShading />
        </mesh>

        {/* Aynalar tek mesh: iki ayri mesh iki cizim cagrisi demek ve bu kadar
            kucuk bir parca icin bunu odemek anlamsiz. Golge de dusurmuyorlar;
            bu olcekte golgesi gorunmuyor, ama golge gecisinde cagri yiyor. */}
        <mesh geometry={geometries.mirrors}>
          <meshStandardMaterial color={CABIN_COLOR} roughness={0.6} flatShading />
        </mesh>

        {/* Arka lambalar. Kamera arkada oldugu icin surekli gorunur olan detay
            bu; frende esigi asip parliyorlar. Ikisi tek mesh, tek malzeme: ayni
            anda ve ayni parlaklikta yanmalari zaten dogru davranis. */}
        <mesh geometry={geometries.tailLights}>
          <meshStandardMaterial
            ref={tailMaterial}
            color={TAIL_COLOR}
            emissive={TAIL_COLOR}
            emissiveIntensity={TAIL_IDLE}
            roughness={0.4}
          />
        </mesh>

        {/* On lambalar. Arkadan bakan kamerada gorunmuyorlar, ama onden takip
            eden sinematik cekimde aracin yuzunu onlar veriyor. Isik kaynagi
            degil: gercek far bir spotlight ve golge haritasi demek, ve alcak
            gunes altinda gorsel getirisi sifir. */}
        <mesh geometry={geometries.headLights}>
          <meshStandardMaterial
            color={HEAD_COLOR}
            emissive={HEAD_COLOR}
            emissiveIntensity={0.85}
            roughness={0.3}
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
            <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 20]} />
            <meshStandardMaterial color={WHEEL_COLOR} roughness={0.85} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}
