/**
 * Kendi gokyuzu kubbesi.
 *
 * Fiziksel gokyuzu modeli (Preetham) yerine kontrollu bir gradyan kullaniyoruz.
 * Sebebi pozlama: fiziksel model gunesin cevresinde 1'in cok uzerinde degerler
 * uretiyor, kamera da tanim geregi gunese bakiyor, ve bloom butun ekrani
 * sutbeyaz bir haleyle kapliyor. Parlakligi kendimiz belirledigimizde bloom'a
 * sadece gunes diski giriyor.
 *
 * Matematik ve butun sabitler core/sky icinde. Shader ile sis rengi ayni
 * kaynaktan besleniyor; iki yerde ayri tutulursa birbirinden kayarlar.
 */

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { CLOUD, SKY } from '@/core/sky'

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** core/sky.ts icindeki skyColorAt ile birebir ayni matematik. */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vDirection;

  uniform vec3 uHorizon;
  uniform vec3 uHorizonAway;
  uniform vec3 uZenith;
  uniform vec3 uBelow;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;

  uniform float uHorizonExponent;
  uniform float uBelowExponent;
  uniform float uAzimuthExponent;

  uniform float uSunIntensity;
  uniform float uDiskFalloff;
  uniform float uAureoleStrength;
  uniform float uAureoleFalloff;
  uniform float uHaloStrength;
  uniform float uHaloFalloff;

  uniform vec3 uCloudBody;
  uniform vec3 uCloudRim;
  uniform vec3 uCloudElevationFreq;
  uniform vec3 uCloudAzimuthFreq;
  uniform vec3 uCloudPhase;
  uniform vec3 uCloudWeight;
  uniform float uCloudBottom;
  uniform float uCloudTop;
  uniform float uCloudEdge;
  uniform float uCloudThreshold;
  uniform float uCloudSoftness;
  uniform float uCloudOpacity;
  uniform float uCloudRimFalloff;

  /** core/sky.ts icindeki cloudCoverage ile birebir ayni matematik. */
  float cloudCoverage(vec3 view) {
    float elevation = view.y;
    float band =
      smoothstep(uCloudBottom, uCloudBottom + uCloudEdge, elevation) *
      (1.0 - smoothstep(uCloudTop - uCloudEdge, uCloudTop, elevation));
    if (band <= 0.0) return 0.0;

    float azimuth = atan(view.z, view.x);
    vec3 pattern = uCloudWeight * sin(
      elevation * uCloudElevationFreq + azimuth * uCloudAzimuthFreq + uCloudPhase
    );
    float sum = pattern.x + pattern.y + pattern.z;

    return clamp(smoothstep(uCloudThreshold, uCloudThreshold + uCloudSoftness, sum) * band, 0.0, 1.0);
  }

  void main() {
    vec3 view = normalize(vDirection);
    vec3 sun = normalize(uSunDirection);

    float alignment = dot(view, sun);

    // Azimut: gunese donuk tarafta sicak ufuk, ters tarafta mor ufuk.
    float warmSide = pow(clamp((alignment + 1.0) * 0.5, 0.0, 1.0), uAzimuthExponent);
    vec3 horizonColor = mix(uHorizonAway, uHorizon, warmSide);

    float upward = pow(clamp(view.y, 0.0, 1.0), uHorizonExponent);
    float downward = pow(clamp(-view.y, 0.0, 1.0), uBelowExponent);

    vec3 color = mix(horizonColor, uZenith, upward);
    color = mix(color, uBelow, downward);

    // Us yerine eksponansiyel dusus: pow(x, 60000) hassasiyet kaybediyor.
    float angular = 1.0 - max(alignment, 0.0);
    float glow =
      uSunIntensity * exp(-uDiskFalloff * angular) +
      uAureoleStrength * exp(-uAureoleFalloff * angular) +
      uHaloStrength * exp(-uHaloFalloff * angular);

    // Bulut bandi gradyanin uzerine biniyor. Ters isikta govde koyu, sadece
    // gunese donuk kenar isik aliyor; bu yuzden kenar rengi hizalanmayla
    // geliyor ve bloom esiginin altinda kaliyor.
    float coverage = cloudCoverage(view);
    if (coverage > 0.0) {
      float rim = exp(-uCloudRimFalloff * (1.0 - max(alignment, 0.0)));
      vec3 cloud = mix(uCloudBody, uCloudRim, rim);
      color = mix(color, cloud, coverage * uCloudOpacity);
    }

    gl_FragColor = vec4(color + uSunColor * glow, 1.0);
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
          uHorizon: { value: new THREE.Vector3(...SKY.horizon) },
          uHorizonAway: { value: new THREE.Vector3(...SKY.horizonAway) },
          uZenith: { value: new THREE.Vector3(...SKY.zenith) },
          uBelow: { value: new THREE.Vector3(...SKY.below) },
          uSunColor: { value: new THREE.Vector3(...SKY.sun) },
          uSunDirection: { value: sunDirection.clone() },

          uHorizonExponent: { value: SKY.horizonExponent },
          uBelowExponent: { value: SKY.belowExponent },
          uAzimuthExponent: { value: SKY.azimuthExponent },

          uSunIntensity: { value: SKY.sunIntensity },
          uDiskFalloff: { value: SKY.diskFalloff },
          uAureoleStrength: { value: SKY.aureoleStrength },
          uAureoleFalloff: { value: SKY.aureoleFalloff },
          uHaloStrength: { value: SKY.haloStrength },
          uHaloFalloff: { value: SKY.haloFalloff },

          uCloudBody: { value: new THREE.Vector3(...CLOUD.body) },
          uCloudRim: { value: new THREE.Vector3(...CLOUD.rim) },
          uCloudElevationFreq: { value: new THREE.Vector3(...CLOUD.elevationFrequencies) },
          uCloudAzimuthFreq: { value: new THREE.Vector3(...CLOUD.azimuthFrequencies) },
          uCloudPhase: { value: new THREE.Vector3(...CLOUD.phases) },
          uCloudWeight: { value: new THREE.Vector3(...CLOUD.weights) },
          uCloudBottom: { value: CLOUD.bottomElevation },
          uCloudTop: { value: CLOUD.topElevation },
          uCloudEdge: { value: CLOUD.edgeSoftness },
          uCloudThreshold: { value: CLOUD.threshold },
          uCloudSoftness: { value: CLOUD.softness },
          uCloudOpacity: { value: CLOUD.opacity },
          uCloudRimFalloff: { value: CLOUD.rimFalloff },
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
