import { Canvas } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

import { Atmosphere } from '@/scene/Atmosphere'
import { Car } from '@/scene/Car'
import { DebugBridge } from '@/scene/DebugBridge'
import { ChaseCamera } from '@/scene/ChaseCamera'
import { Effects } from '@/scene/Effects'
import { PerfProbe } from '@/scene/PerfProbe'
import { World } from '@/scene/World'
import { Simulation } from '@/sim/Simulation'
import { car, perf, runtime } from '@/sim/state'
import { Hud } from '@/ui/Hud'

/**
 * Piksel orani siniri. Yuksek yogunluklu ekranlarda devicePixelRatio 2 veya 3
 * olabiliyor, bu da dort dokuz kat piksel demek: en buyuk tek performans kolu
 * budur. Gorsel farki zar zor gorunur, kazanc ikiye katlanma seviyesinde.
 */
const MAX_DPR = 1.5

function Scene(): React.ReactElement {
  return (
    <>
      {/* Simulasyon ilk sirada: diger bilesenler ayni karede guncel duruşu
          okuyabilsin diye useFrame kayit sirasi onemli. */}
      <Simulation />
      <Atmosphere />
      <World />
      <Car />
      <ChaseCamera />
      <PerfProbe />
      <Effects />
      {import.meta.env.DEV ? <DebugBridge /> : null}
    </>
  )
}

export function App(): React.ReactElement {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    // Uctan uca testlerin gercek davranisi (piksel degil) dogrulamasi icin.
    Object.assign(window, { __lastlight: { car, perf, runtime } })
  }, [])

  return (
    <>
      <Canvas
        dpr={[1, MAX_DPR]}
        shadows="percentage"
        camera={{ fov: 52, near: 1, far: 2600, position: [-12, 5, 0] }}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          // Tone mapping zincirin sonunda uygulaniyor; burada da uygulanirsa
          // goruntu iki kez tone map edilip yikaniyor.
          toneMapping: THREE.NoToneMapping,
        }}
      >
        <Scene />
      </Canvas>
      <Hud />
    </>
  )
}
