/**
 * Havada asili toz.
 *
 * Uygulama tercihi olcume dayaniyor. Once THREE.Points ile gl_PointSize
 * denendi: zerreler hicbir boyutta ekrana cikmadi. Sonra ham ShaderMaterial ve
 * InstancedBufferGeometry ile billboard dortgen denendi: mesh sahnede,
 * gorunur, shader derleniyor, ama opak kirmizi uc metrelik dortgenler bile
 * rasterize edilmedi. Iki yol da terk edildi.
 *
 * Bunun yerine bu kod tabaninda calistigi kanitlanmis mekanizma kullaniliyor:
 * InstancedMesh, duz malzeme, ornek basina matris (bkz. scene/Scatter). Bedeli
 * kare basina yediyuz matris guncellemesi, yani yaklasik onda bir milisaniye.
 * Ders: calisan bir referans uygulaman varken bilinmeyen bir yolu ayiklamaya
 * devam etmek yerine referansi kullan.
 *
 * Sarmalama CPU'da, core/dust icindeki wrapCoordinate ile: kutudan cikan zerre
 * karsi taraftan giriyor, boylece dunya sonsuz gorunurken zerre sayisi sabit
 * kaliyor. Kutu kenarina yakin zerreler ornek renginden soluyor, cunku
 * sarmalama bir zerreyi karsi yuze isinlıyor ve sicrama gorunmemeli.
 *
 * Toplamsal harmanlama: ters isikta toz sadece parlatir, karartmaz.
 */

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { DUST, DUST_STRIDE, createDustField, wrapCoordinate } from '@/core/dust'
import { clamp01, smoothstep } from '@/core/math'
import { SKY } from '@/core/sky'
import { SEED, car } from '@/sim/state'

/** Ruzgar hizi (m/s). Cok yavas: toz suruklenir, ucusmaz. */
const WIND = { x: -0.4, y: 0.07, z: 0.14 }

/**
 * Zerrelerin parlakligi. Toplamsal harmanlama parlak gokyuzune karsi calisiyor
 * oldugu icin dusuk degerler hicbir sey eklemiyor; toz asil olarak koyu zemine
 * ve siluetlere karsi okunuyor.
 */
const BRIGHTNESS = 0.55

/** Kutu kenarinin bu oranindan sonra zerreler solmaya basliyor. */
const FADE_START = 0.7

export function Dust(): React.ReactElement {
  const { camera } = useThree()
  const elapsed = useRef(0)
  const mesh = useRef<THREE.InstancedMesh>(null)

  const field = useMemo(() => createDustField(SEED), [])

  /** Sekiz kenarli disk: bu boyutta yuvarlak okunuyor, doku gerekmiyor. */
  const geometry = useMemo(() => new THREE.CircleGeometry(0.5, 8), [])

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 1, 1),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  )

  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      color: new THREE.Color(),
    }),
    [],
  )

  useFrame((_, delta) => {
    const instances = mesh.current
    if (!instances) return

    elapsed.current += delta

    const forwardX = Math.cos(car.heading)
    const forwardZ = Math.sin(car.heading)

    const centerX = car.x + forwardX * DUST.forwardOffset
    const centerY = car.y + DUST.heightOffset
    const centerZ = car.z + forwardZ * DUST.forwardOffset

    const driftX = WIND.x * elapsed.current
    const driftY = WIND.y * elapsed.current
    const driftZ = WIND.z * elapsed.current

    const halfLength = DUST.boxLength * 0.5
    const halfHeight = DUST.boxHeight * 0.5
    const halfWidth = DUST.boxWidth * 0.5

    for (let i = 0; i < DUST.count; i++) {
      const source = i * DUST_STRIDE

      const x = wrapCoordinate(field[source]! + driftX, centerX, DUST.boxLength)
      const y = wrapCoordinate(field[source + 1]! + driftY, centerY, DUST.boxHeight)
      const z = wrapCoordinate(field[source + 2]! + driftZ, centerZ, DUST.boxWidth)

      const edge = Math.max(
        Math.abs(x - centerX) / halfLength,
        Math.abs(y - centerY) / halfHeight,
        Math.abs(z - centerZ) / halfWidth,
      )
      const fade = 1 - smoothstep(FADE_START, 1, edge)

      scratch.position.set(x, y, z)
      scratch.scale.setScalar(field[source + 3]!)
      // Billboard: her zerre kameranin donusunu aliyor.
      scratch.matrix.compose(scratch.position, camera.quaternion, scratch.scale)
      instances.setMatrixAt(i, scratch.matrix)

      const brightness = clamp01(fade) * BRIGHTNESS
      scratch.color.setRGB(
        SKY.sun[0] * brightness,
        SKY.sun[1] * brightness,
        SKY.sun[2] * brightness,
      )
      instances.setColorAt(i, scratch.color)
    }

    instances.instanceMatrix.needsUpdate = true
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, DUST.count]}
      frustumCulled={false}
      renderOrder={2}
    />
  )
}
