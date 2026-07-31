/**
 * Makine kiyaslamasi. Hicbir sey render etmiyor.
 *
 * Olcum sinematik pencerede yapiliyor: o pencerede kullanici zaten seyrediyor
 * ve kimse kontrol kaybetmiyor. Karar bir kez veriliyor, kilitleniyor ve
 * saklaniyor; kare suresi dalgalandikca kademe degisirse gorunum surekli
 * atliyor ve o titreme dusuk cozunurlukten kotu.
 *
 * Isinma kareleri atiliyor ve ortanca kullaniliyor, cunku ilk kareler shader
 * derlemesi yuzunden her makinede yavas ve tek bir cop toplama duraklamasi
 * ortalamayi bozuyor.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { createBenchmark } from '@/core/quality'
import { needsBenchmark, setMeasuredTier } from '@/sim/quality'

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
    if (tier !== null) {
      finished.current = true
      setMeasuredTier(tier)
    }
  })

  return null
}
