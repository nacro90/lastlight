/**
 * Kendi gokyuzu kubbesi.
 *
 * Fiziksel gokyuzu modeli (Preetham) yerine kontrollu bir gradyan kullaniyoruz.
 * Sebebi pozlama: fiziksel model gunesin cevresinde 1'in cok uzerinde degerler
 * uretiyor, kamera da tanim geregi gunese bakiyor, ve bloom butun ekrani
 * sutbeyaz bir haleyle kapliyor. Parlakligi kendimiz belirledigimizde bloom'a
 * sadece gunes diski giriyor.
 *
 * Ikinci kazanc sanat yonetimi: paletin dort rengi birebir burada, tesadufe
 * bagli degil. Ucuncu kazanc bir bagimliligin eksilmesi.
 */

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vDirection;

  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uBelow;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uSunIntensity;
  uniform float uHaloStrength;

  void main() {
    vec3 direction = normalize(vDirection);
    float height = direction.y;

    // Ufuktan zenite: kucuk us degeri sicak bandi ufka yakin tutuyor.
    vec3 color = mix(uHorizon, uZenith, pow(clamp(height, 0.0, 1.0), 0.42));
    color = mix(color, uBelow, pow(clamp(-height, 0.0, 1.0), 0.38));

    float towardSun = max(dot(direction, normalize(uSunDirection)), 0.0);

    // Genis hale: gunesin etrafindaki sicak yayilma.
    color += uSunColor * pow(towardSun, 7.0) * uHaloStrength;
    // Disk: bloom esiginin ustune cikan tek sey bu.
    color += uSunColor * pow(towardSun, 900.0) * uSunIntensity;

    gl_FragColor = vec4(color, 1.0);
  }
`

/** Kubbe yaricapi. Kamera far duzleminin icinde kalmasi gerekiyor. */
const DOME_RADIUS = 1400

interface SkyDomeProps {
  sunDirection: THREE.Vector3
}

export function SkyDome({ sunDirection }: SkyDomeProps): React.ReactElement {
  const mesh = useRef<THREE.Mesh>(null)
  const { camera } = useThree()

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          // Degerler dogrusal uzayda. Ufuk 1'in hemen ustunde: hafifce
          // parliyor ama bloom esigini tek basina asmiyor.
          uHorizon: { value: new THREE.Vector3(1.15, 0.42, 0.17) },
          uZenith: { value: new THREE.Vector3(0.085, 0.062, 0.19) },
          uBelow: { value: new THREE.Vector3(0.16, 0.075, 0.07) },
          uSunColor: { value: new THREE.Vector3(1.0, 0.72, 0.42) },
          uSunDirection: { value: sunDirection.clone() },
          uSunIntensity: { value: 22 },
          uHaloStrength: { value: 0.38 },
        },
      }),
    [sunDirection],
  )

  useFrame(() => {
    // Kubbe kamerayi takip ediyor: sonsuz uzaklik izlenimi, sifir kirpilma.
    if (mesh.current) mesh.current.position.copy(camera.position)
  })

  return (
    <mesh ref={mesh} material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[DOME_RADIUS, 32, 20]} />
    </mesh>
  )
}
