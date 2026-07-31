/**
 * Gokyuzu, sis ve gunes.
 *
 * Buradaki en onemli karar golgenin sisle saklanmasi. Alcak acili gunes uzun
 * golgeler demek, uzun golge de golge haritasinin kapsamasi gereken alanin
 * patlamasi demek. Cascaded shadow map yazmak yerine tek ve dar bir frustum
 * kullaniyoruz, ve sis mesafesini frustumun kenarindan daha yakin tutuyoruz:
 * golge biterken her sey coktan sicak sise gomulmus oluyor, kesme cizgisini
 * kimse gormuyor.
 *
 * Gunes 6.8 derecede. Daha alcaga indirmek golgeleri boyunun on katindan
 * daha uzun yapip frustumdan tasiriyor; daha yukari cikarmak aksam hissini
 * bozuyor.
 */

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { skyColorAt } from '@/core/sky'
import { useQuality } from '@/sim/quality'
import { car } from '@/sim/state'
import { SkyDome } from './SkyDome'

const SUN_ELEVATION = (6.8 * Math.PI) / 180
/** Gunes ileri eksende, hafif yana kacik: tam onde olsa golgeler arac altinda kalir. */
const SUN_AZIMUTH_OFFSET = 0.16

export const SUN_DIRECTION = new THREE.Vector3(
  Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
  SUN_AZIMUTH_OFFSET,
).normalize()

/**
 * Sis rengi her karede bakis yonundeki gokyuzu renginden hesaplaniyor.
 * Sabit tek renk yanlisti: kamera arkaya dondugunde gokyuzu mor ama sis
 * turuncu kaliyor, yani arazi gokyuzune yanlis renkte karisiyordu.
 */
export const FOG_NEAR = 45
export const FOG_FAR = 330

/** Baslangic degeri; ilk kareden itibaren gokyuzunden hesaplanan renk geciyor. */
const FOG_INITIAL_COLOR = '#8f3f18'

/** Sis gokyuzunden biraz koyu: arazi bir isik kaynagi degil. */
const FOG_DIMMING = 0.8
/** Sisin bloom esigini asmasi engelleniyor; sis parlamamali. */
const FOG_MAX_CHANNEL = 1.25

const SUN_COLOR = '#ffb066'
const SKY_TINT = '#7a5c9a'
const GROUND_TINT = '#221436'

/** Isik aracin kac metre onunde konumlaniyor. Golge frustumu bunu takip ediyor. */
const LIGHT_DISTANCE = 200
const SHADOW_EXTENT = 105

export function Atmosphere(): React.ReactElement {
  const quality = useQuality()
  const light = useRef<THREE.DirectionalLight>(null)
  const { scene, camera } = useThree()
  const viewDirection = useRef(new THREE.Vector3())

  useFrame(() => {
    // Sis rengi bakis azimutundaki ufuk rengi. Dusey bileseni neredeyse
    // sifirlaniyor: sis arazi uzerinde, yani ufuk hizasinda yasiyor.
    camera.getWorldDirection(viewDirection.current)
    viewDirection.current.y = 0.02
    viewDirection.current.normalize()

    const fog = scene.fog
    if (fog) {
      const color = skyColorAt(
        [viewDirection.current.x, viewDirection.current.y, viewDirection.current.z],
        [SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z],
      )
      fog.color.setRGB(
        Math.min(color[0] * FOG_DIMMING, FOG_MAX_CHANNEL),
        Math.min(color[1] * FOG_DIMMING, FOG_MAX_CHANNEL),
        Math.min(color[2] * FOG_DIMMING, FOG_MAX_CHANNEL),
      )
    }

    const sun = light.current
    if (!sun) return

    sun.position.set(
      car.x + SUN_DIRECTION.x * LIGHT_DISTANCE,
      car.y + SUN_DIRECTION.y * LIGHT_DISTANCE,
      car.z + SUN_DIRECTION.z * LIGHT_DISTANCE,
    )
    sun.target.position.set(car.x, car.y, car.z)
    sun.target.updateMatrixWorld()
  })

  return (
    <>
      <SkyDome sunDirection={SUN_DIRECTION} />
      <fog attach="fog" args={[FOG_INITIAL_COLOR, FOG_NEAR, FOG_FAR]} />

      {/* Alcak gunes yere yalnizca sin(6.8 derece) kadar, yani yuzde on iki
          isik veriyor. Zemini okunur kilan sey bu yuzden yarim kure isigidir;
          altin saatin koyu, siluetlesmis zemini de tam olarak bu demek. */}
      <hemisphereLight args={[SKY_TINT, GROUND_TINT, 0.42]} />
      <directionalLight
        ref={light}
        color={SUN_COLOR}
        intensity={2.8}
        castShadow
        // Kademe degisince isik yeniden monte ediliyor: shadow.mapSize sonradan
        // degistirilince mevcut golge haritasi yeniden olusturulmuyor.
        key={quality.shadowMapSize}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={520}
        /* Derinlik bias'i sifir. Sebebi olculdu: -0.0004 normalize derinlik,
           1 ile 520 metre araliginda isik yonunde 0.21 metre oteleme demek, ve
           gunes 6.8 derecede oldugu icin bu yatayda 1.75 metreye donusuyor.
           Yani golge tekerlerden iki metre uzakta basliyordu ve arac havada
           gorunuyordu. Siyirtan isikta akne icin dogru arac normalBias, ve o
           da mumkun oldugunca kucuk. */
        shadow-bias={0}
        shadow-normalBias={0.012}
      />
    </>
  )
}
