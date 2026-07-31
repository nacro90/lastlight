/**
 * Gelistirme kopruusu. Sahneyi, kamerayi ve renderer'i pencereye acar; boylece
 * uctan uca testler ve hata ayiklama piksele bakmak yerine sahne grafigine
 * bakabiliyor. Sadece gelistirme yapisinda mount ediliyor.
 */

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

export function DebugBridge(): null {
  const { scene, camera, gl } = useThree()

  useEffect(() => {
    Object.assign(window, { __three: { scene, camera, gl } })
    return () => {
      delete (window as unknown as Record<string, unknown>).__three
    }
  }, [scene, camera, gl])

  return null
}
