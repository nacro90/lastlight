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
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

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

/** Sis rengi ufuk rengiyle ayni aileden: arazi gokyuzune eriyerek karisiyor. */
export const FOG_COLOR = '#8f3f18'
export const FOG_NEAR = 45
export const FOG_FAR = 330

const SUN_COLOR = '#ffb066'
const SKY_TINT = '#7a5c9a'
const GROUND_TINT = '#221436'

/** Isik aracin kac metre onunde konumlaniyor. Golge frustumu bunu takip ediyor. */
const LIGHT_DISTANCE = 200
const SHADOW_EXTENT = 105

export function Atmosphere(): React.ReactElement {
  const light = useRef<THREE.DirectionalLight>(null)

  useFrame(() => {
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
      <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />

      {/* Alcak gunes yere yalnizca sin(6.8 derece) kadar, yani yuzde on iki
          isik veriyor. Zemini okunur kilan sey bu yuzden yarim kure isigidir;
          altin saatin koyu, siluetlesmis zemini de tam olarak bu demek. */}
      <hemisphereLight args={[SKY_TINT, GROUND_TINT, 0.42]} />
      <directionalLight
        ref={light}
        color={SUN_COLOR}
        intensity={2.8}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={520}
        // Siyirtan isikta golge akneleri kaciniilmaz; normalBias dogru arac.
        shadow-bias={-0.0004}
        shadow-normalBias={0.024}
      />
    </>
  )
}
