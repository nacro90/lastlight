/**
 * Kamera.
 *
 * Bu tur oyunlarda kalite algisinin buyuk kismi kamerada: yol, isik, ses ne
 * kadar iyi olursa olsun kamera araca sertce kenetlenmisse deneyim ucuz
 * hissettiriyor. O yuzden yay ve sonumleme var, sert kenetlenme yok.
 *
 * Iki mod var. Surus modunda tek bir takip kamerasi; ileri bakis kaymasi
 * sayesinde viraja girerken kamera virajin icini gormeye basliyor ve hiz
 * arttikca gorus acisi birkac derece aciliyor. Sinematik modda cekim programi
 * devrede (bkz. core/cinematic): dort cerceveleme arasinda kesme yapiliyor.
 *
 * Kamera zemin payi hedef konuma uygulaniyor, yay sonrasina degil. Yay
 * sonrasina uygulanirsa alcak cekimlerde kamera her karede zemine kilitlenip
 * gorunur bir titreme uretiyor.
 *
 * Yonelim ve gorus acisi da yumusatiliyor, ve bunun sebebi devir teslim. Konum
 * zaten yayla geliyordu ama bakis yonu ve gorus acisi mod degisiminde tek
 * karede siciriyordu: onden geri giden cekim etkinken tusa basildiginda bakis
 * yonu bir karede yaklasik yuz altmis derece donuyor, tepeden vinc cekiminde
 * ise gorus acisi kirk dortten elli bese atliyor.
 *
 * Yumusatma yonelimin kendisine uygulaniyor, bakis mesafesine degil. Once
 * mesafe (skaler) yumusatildi ve olculdu: onden geri giden cekimde bakis
 * noktasi aracin uc metre arkasindan yirmi dort metre onune gidiyor, yani
 * aradaki butun degerleri sirayla aldigi icin kameranin kendi konumunun
 * icinden geciyor. Sonuc pop'un kalkmasi degil bes kareye yayilmasi oldu: tepe
 * degeri kare basina yetmis bir derece ve kamera bir an yanindaki zemine
 * bakiyordu. Quaternion uzerinde slerp en kisa yayi izliyor, yani bu geometrik
 * olarak imkansiz hale geliyor.
 *
 * Kamera sarsintisi yok, sarsinti bu projenin duygusuna aykiri.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import {
  CUT_DURATION,
  REDUCED_MOTION_CUT_DURATION,
  createCinematic,
} from '@/core/cinematic'
import { approach } from '@/core/math'
import { terrainHeightAtWorld } from '@/core/terrain'
import { SEED, car, runtime } from '@/sim/state'

const CHASE_DISTANCE = 9.5
const CHASE_HEIGHT = 3.4
const CHASE_STIFFNESS = 4.2
const CINEMATIC_STIFFNESS = 3.4

const LOOK_AHEAD_BASE = 14
const LOOK_AHEAD_PER_SPEED = 0.5
const LOOK_HEIGHT = 1.5

const DRIVING_FOV = 52
const FOV_PER_SPEED = 0.14

/**
 * Yonelimin ve gorus acisinin hedefe yetisme hizi (1/s). Bes, yaklasik alti yuz
 * milisaniyede oturmak demek: kilitlenen karar da devir teslim icin bunu
 * soyluyor. Normal surus ve sinematik kesme sirasinda hedefler zaten yavas
 * degistigi icin gorunen tek etkisi virajda birkac derecelik hos bir gecikme;
 * asil isi mod degisiminde yapiyor.
 */
const HANDOVER_RATE = 5

/** Cekim icindeki surunme frekanslari; ucu farkli ki hareket dongu gibi durmasin. */
const DRIFT_RATE_BACK = 0.55
const DRIFT_RATE_HEIGHT = 0.37
const DRIFT_RATE_SIDE = 0.29

/** Kamera zeminin en az bu kadar ustunde kaliyor. */
const GROUND_CLEARANCE = 1.2

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function ChaseCamera(): null {
  const { camera } = useThree()
  const lookTarget = useRef(new THREE.Vector3())
  const smoothedFov = useRef(DRIVING_FOV)

  /**
   * Kare dongusunde ayirma yapmamak icin calisma nesneleri. Yonelim hedefi her
   * karede bunlarin uzerinde kuruluyor.
   */
  const scratch = useMemo(
    () => ({ matrix: new THREE.Matrix4(), quaternion: new THREE.Quaternion() }),
    [],
  )

  /**
   * Ilk kare hedefe kenetleniyor. Yoksa yumusatilan degerler surus
   * varsayilanindan basliyor ve uygulama sinematik acildigi icin acilis
   * kartinin uzerinde istenmeyen bir kaydirma ve zoom oluyor.
   */
  const seeded = useRef(false)

  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setReducedMotion(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const cinematic = useMemo(
    () => createCinematic(SEED, reducedMotion ? REDUCED_MOTION_CUT_DURATION : CUT_DURATION),
    [reducedMotion],
  )

  useFrame((_, delta) => {
    const forwardX = Math.cos(car.heading)
    const forwardZ = Math.sin(car.heading)
    // Sag vektor: ileri yonun yatayda 90 derece dondurulmusu.
    const rightX = -forwardZ
    const rightZ = forwardX

    let back = CHASE_DISTANCE
    let height = CHASE_HEIGHT
    let side = 0
    let lookAhead = LOOK_AHEAD_BASE + car.speed * LOOK_AHEAD_PER_SPEED
    let fov = DRIVING_FOV + car.speed * FOV_PER_SPEED
    let stiffness = CHASE_STIFFNESS

    if (runtime.mode === 'cinematic') {
      const { framing, shotTime } = cinematic.advance(delta)

      // Surunme: donuk bir cekim olu duruyor, kamera cekim icinde yavasca kayiyor.
      back = framing.back + framing.driftBack * Math.sin(shotTime * DRIFT_RATE_BACK)
      height = framing.height + framing.driftHeight * Math.sin(shotTime * DRIFT_RATE_HEIGHT + 1.1)
      side = framing.side + framing.driftSide * Math.sin(shotTime * DRIFT_RATE_SIDE + 2.3)
      lookAhead = framing.lookAhead
      fov = framing.fov
      stiffness = CINEMATIC_STIFFNESS
    }

    const desiredX = car.x - forwardX * back + rightX * side
    const desiredZ = car.z - forwardZ * back + rightZ * side

    // Zemin payi hedefe uygulaniyor, yay sonrasina degil: boylece yay onu da
    // yumusatiyor ve kamera zemine kilitlenmiyor.
    const ground = terrainHeightAtWorld(SEED, desiredX, desiredZ)
    const desiredY = Math.max(car.y + height, ground + GROUND_CLEARANCE)

    const blend = 1 - Math.exp(-stiffness * delta)
    camera.position.x += (desiredX - camera.position.x) * blend
    camera.position.y += (desiredY - camera.position.y) * blend
    camera.position.z += (desiredZ - camera.position.z) * blend

    lookTarget.current.set(
      car.x + forwardX * lookAhead,
      car.y + LOOK_HEIGHT,
      car.z + forwardZ * lookAhead,
    )

    // Hedef yonelim: kameranin konumundan bakis noktasina bakan donus.
    scratch.matrix.lookAt(camera.position, lookTarget.current, camera.up)
    scratch.quaternion.setFromRotationMatrix(scratch.matrix)

    if (!seeded.current) {
      seeded.current = true
      camera.quaternion.copy(scratch.quaternion)
      smoothedFov.current = fov
    } else {
      camera.quaternion.slerp(scratch.quaternion, 1 - Math.exp(-HANDOVER_RATE * delta))
      smoothedFov.current = approach(smoothedFov.current, fov, HANDOVER_RATE, delta)
    }

    if (
      camera instanceof THREE.PerspectiveCamera &&
      Math.abs(camera.fov - smoothedFov.current) > 0.02
    ) {
      camera.fov = smoothedFov.current
      camera.updateProjectionMatrix()
    }
  })

  return null
}
