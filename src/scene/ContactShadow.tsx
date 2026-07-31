/**
 * Temas golgesi: aracin altinda, zemine oturan yumusak koyu leke.
 *
 * Neden gerekli: alcak gunes golgeyi metrelerce yana atiyor, dolayisiyla
 * aracin tam altinda hicbir koyuluk kalmiyor. Geometri dogru olsa da (tekerler
 * zemine sifir farkla oturuyor) goz araci havada okuyor, cunku gunluk hayatta
 * bir nesnenin yere degdigini temas noktasindaki koyulastirmadan anliyoruz.
 * Oyunlarin neredeyse tamami bu yuzden ayri bir temas golgesi cizer.
 *
 * Doku yok: yumusak gecis kabuk fonksiyonuyla hesaplaniyor, projenin geri
 * kalaniyla ayni sozlesme.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { car } from '@/sim/state'

/** Aracin ayak izinden biraz genis; golge kenari araca degmemeli. */
const LENGTH = 5.2
const WIDTH = 2.5
/** Zeminin hemen ustunde: z-fighting olmasin. */
const LIFT = 0.02
const STRENGTH = 0.5

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vLocal;
  uniform float uStrength;

  void main() {
    // Eliptik kabuk: merkezde doygun, kenarda sifir.
    float distance = length(vLocal);
    float falloff = 1.0 - smoothstep(0.2, 1.0, distance);
    gl_FragColor = vec4(0.0, 0.0, 0.0, falloff * falloff * uStrength);
  }
`

export function ContactShadow(): React.ReactElement {
  const mesh = useRef<THREE.Mesh>(null)

  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(LENGTH, WIDTH)
    // Duzlemi yatay hale getiriyoruz; sonrasinda kasayla ayni donusler uygulaniyor.
    plane.rotateX(-Math.PI / 2)
    return plane
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: { uStrength: { value: STRENGTH } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  )

  useFrame(() => {
    const plane = mesh.current
    if (!plane) return

    plane.position.set(car.x, car.y + LIFT, car.z)
    // Kasayla ayni yonlendirme: golge arazi egimine yatiyor.
    plane.rotation.order = 'YZX'
    plane.rotation.y = -car.heading
    plane.rotation.z = car.pitch
    plane.rotation.x = car.roll
  })

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={1} />
}
