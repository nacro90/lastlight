import { Canvas } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

import { Sound, audioInfo } from '@/audio/Sound'
import { Atmosphere } from '@/scene/Atmosphere'
import { Car } from '@/scene/Car'
import { ContactShadow } from '@/scene/ContactShadow'
import { Dust } from '@/scene/Dust'
import { DebugBridge } from '@/scene/DebugBridge'
import { ChaseCamera } from '@/scene/ChaseCamera'
import { Effects } from '@/scene/Effects'
import { PerfProbe } from '@/scene/PerfProbe'
import { QualityProbe } from '@/scene/QualityProbe'
import { Markings } from '@/scene/Markings'
import { Signs } from '@/scene/Signs'
import { Scatter } from '@/scene/Scatter'
import { World } from '@/scene/World'
import { terrainHeightAtWorld } from '@/core/terrain'
import { Simulation } from '@/sim/Simulation'
import { activeQuality, activeTier, measuredTier, qualityChoice, useQuality } from '@/sim/quality'
import { SEED, car, perf, runtime } from '@/sim/state'
import { Hud } from '@/ui/Hud'

function Scene(): React.ReactElement {
  return (
    <>
      {/* Simulasyon ilk sirada: diger bilesenler ayni karede guncel duruşu
          okuyabilsin diye useFrame kayit sirasi onemli. */}
      <Simulation />
      <Atmosphere />
      <World />
      <Markings />
      <Signs />
      <Scatter />
      <Car />
      <ContactShadow />
      <Dust />
      <ChaseCamera />
      <Sound />
      <PerfProbe />
      <QualityProbe />
      <Effects />
      {import.meta.env.DEV ? <DebugBridge /> : null}
    </>
  )
}

export function App(): React.ReactElement {
  /**
   * Piksel orani siniri kademeden geliyor. Yuksek yogunluklu ekranlarda
   * devicePixelRatio 2 veya 3 olabiliyor, bu da dort dokuz kat piksel demek:
   * en buyuk tek performans kolu budur. Gorsel farki zar zor gorunur, kazanc
   * ikiye katlanma seviyesinde.
   */
  const quality = useQuality()

  useEffect(() => {
    if (!import.meta.env.DEV) return
    // Uctan uca testlerin gercek davranisi (piksel degil) dogrulamasi icin.
    Object.assign(window, {
      __lastlight: {
        car,
        perf,
        runtime,
        /** Ses baglaminin durumu: askida mi, acik mi, tercih ne. */
        audioInfo,
        /** Kalite tercihi, olculen kademe ve yururlukteki ayarlar. */
        quality: () => ({
          choice: qualityChoice(),
          measured: measuredTier(),
          tier: activeTier(),
          settings: activeQuality(),
        }),
        /** Hata ayiklama icin dunya koordinatinda zemin yuksekligi. */
        groundAt: (x: number, z: number) => terrainHeightAtWorld(SEED, x, z),
      },
    })
  }, [])

  return (
    <>
      <Canvas
        dpr={[1, quality.maxPixelRatio]}
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
