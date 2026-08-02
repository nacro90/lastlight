/**
 * Makine kiyaslamasi. Hicbir sey render etmiyor.
 *
 * Olcum sinematik pencerede yapiliyor: o pencerede kullanici zaten seyrediyor
 * ve kimse kontrol kaybetmiyor. Karar bir kez veriliyor, kilitleniyor ve
 * saklaniyor; kare suresi dalgalandikca kademe degisirse gorunum surekli
 * atliyor ve o titreme dusuk cozunurlukten kotu.
 *
 * Karar surus sirasinda uygulanmiyor, cunku kademe dususu gorunur bir pop:
 * serpistirme yogunlugu bir karede iniyor ve yol kenarindaki agaclarin bir
 * kismi siliniyor. Oyuncu ilk saniyelerde tusa basmissa karar bekliyor ve mod
 * sinematige dondugunde uygulaniyor.
 *
 * Tek istisna panik karari: ust uste agir kareler gormus bir makinede beklemek,
 * kotu deneyimi uzatmaktan baska bir sey yapmiyor. Orada pop, uc kare hizindan
 * iyidir.
 *
 * Isinma kareleri atiliyor ve ortanca kullaniliyor, cunku ilk kareler shader
 * derlemesi yuzunden her makinede yavas ve tek bir cop toplama duraklamasi
 * ortalamayi bozuyor.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { createBenchmark } from '@/core/quality'
import { needsBenchmark, setMeasuredTier } from '@/sim/quality'
import { runtime } from '@/sim/state'

export function QualityProbe(): null {
  const benchmark = useMemo(() => createBenchmark(), [])
  const finished = useRef(false)

  useFrame((_, delta) => {
    if (finished.current) return
    if (!needsBenchmark()) {
      finished.current = true
      return
    }

    benchmark.add(delta * 1000)

    const tier = benchmark.tier()
    if (tier === null) return

    // Karar hazir ama uygulama sinematik pencereyi bekliyor; panik karari
    // beklemiyor.
    if (runtime.mode !== 'cinematic' && !benchmark.urgent) return

    finished.current = true
    setMeasuredTier(tier)
  })

  return null
}
