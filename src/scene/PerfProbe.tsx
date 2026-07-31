/**
 * Performans olcumu. Butceyi astigimiz an gormek icin var; sonradan arkeoloji
 * yapmak yerine anlik olarak gostermek cok daha ucuz.
 *
 * Gelistirme makinesindeki guclu GPU yaniltici oldugu icin cizim cagrisi ve
 * ucgen sayisi da olculuyor: bunlar donanimdan bagimsiz butcelerdir.
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import { perf } from '@/sim/state'

const SAMPLE_WINDOW = 0.25

export function PerfProbe(): null {
  const { gl } = useThree()
  const frames = useRef(0)
  const elapsed = useRef(0)

  useEffect(() => {
    // Otomatik sifirlama kapatiliyor. Acik kalirsa her render gecisi sayaci
    // sifirliyor ve post-processing zincirinin sonundaki tam ekran gecisinden
    // baska bir sey olcmemis oluyoruz: tek cizim cagrisi, iki ucgen.
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
    }
  }, [gl])

  useFrame((_, delta) => {
    frames.current += 1
    elapsed.current += delta

    // useFrame render'dan once calisiyor, yani buradaki sayac bir onceki
    // karenin butun gecislerinin toplami. Okuyup sifirliyoruz.
    perf.drawCalls = gl.info.render.calls
    perf.triangles = gl.info.render.triangles
    gl.info.reset()

    if (elapsed.current >= SAMPLE_WINDOW) {
      perf.fps = frames.current / elapsed.current
      perf.frameMs = (elapsed.current / frames.current) * 1000
      frames.current = 0
      elapsed.current = 0
    }
  })

  return null
}
