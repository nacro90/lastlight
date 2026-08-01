/**
 * Kesikli orta cizgi. Tek instanced mesh, tek cizim cagrisi.
 *
 * Kanitlanmis yol kullaniliyor: InstancedMesh, duz malzeme, ornek basina
 * matris (bkz. scene/Scatter, scene/Dust). Kendi dilim yoneticisini
 * calistiriyor; yonetici deterministik oldugu icin World ile ayni kareyi ayni
 * car.s ile gordugunde birebir ayni atamalari uretiyor.
 *
 * Cizgiler golge dusurmuyor: asfaltin bir bucuk santim ustundeki bir yamugun
 * golgesi alcak gunes altinda kendisinden metrelerce uzaga dusuyor ve yolda
 * aciklanamaz koyu cizgiler olusuyor. Golge almasi ise gerekiyor, yoksa agac
 * golgesinin icinde cizgi parlak kaliyor.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { SLICE } from '@/core/config'
import { MARKING, MARKING_STRIDE, createSliceMarkings, writeSliceMarkings } from '@/core/markings'
import { createSliceManager } from '@/core/sliceManager'
import { SEED, car } from '@/sim/state'

/** Kenar cizgilerinden bir tik parlak: orta cizgi okunmak zorunda. */
const COLOR = '#9a8f7d'

export function Markings(): React.ReactElement {
  const geometry = useMemo(() => {
    // Yamuk dogrudan XZ duzleminde uretiliyor; boylece ornek donusumu sadece
    // yon ve egim tasiyor.
    const plane = new THREE.PlaneGeometry(MARKING.dashLength, MARKING.halfWidth * 2)
    plane.rotateX(-Math.PI / 2)
    return plane
  }, [])

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(COLOR),
        roughness: 0.94,
        metalness: 0,
      }),
    [],
  )

  const manager = useMemo(() => createSliceManager(), [])
  const buffer = useMemo(() => createSliceMarkings(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const warmed = useRef(false)

  /**
   * Atanmamis yuvalar sifir olcekle baslatiliyor. Sifirlama doldurmayla ayni
   * karede ve ondan once olmak zorunda: useEffect ilk render karesinden sonra
   * calisiyor ve ilk karede dolan havuzu siliyor.
   */
  const clearInstances = (instances: THREE.InstancedMesh): void => {
    dummy.scale.setScalar(0)
    dummy.updateMatrix()
    for (let index = 0; index < instances.count; index++) {
      instances.setMatrixAt(index, dummy.matrix)
    }
    dummy.scale.setScalar(1)
  }

  useFrame(() => {
    const instances = mesh.current
    if (!instances) return

    const firstFrame = !warmed.current
    if (firstFrame) clearInstances(instances)

    const budget = firstFrame ? SLICE.poolSize : 1
    warmed.current = true

    const assignments = manager.update(car.s, budget)
    if (assignments.length === 0) return

    for (const { slot, sliceIndex } of assignments) {
      writeSliceMarkings(SEED, sliceIndex, buffer)
      const base = slot * MARKING.perSlice

      for (let i = 0; i < MARKING.perSlice; i++) {
        const offset = i * MARKING_STRIDE
        dummy.position.set(buffer[offset]!, buffer[offset + 1]!, buffer[offset + 2]!)
        // Araba ile ayni siralama: yaw, sonra egim. Ters sirada egim yatay
        // eksende kayiyor ve cizgi yoldan cikiyor.
        dummy.rotation.order = 'YZX'
        dummy.rotation.y = -buffer[offset + 3]!
        dummy.rotation.z = buffer[offset + 4]!
        dummy.updateMatrix()
        instances.setMatrixAt(base + i, dummy.matrix)
      }
    }

    instances.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, SLICE.poolSize * MARKING.perSlice]}
      receiveShadow
      // Ornekler butun koridora yayildigi icin kutle kirpma kazanc saglamiyor,
      // ama yanlis hesaplanmis bir sinir kuresi cizgileri kaybettirebiliyor.
      frustumCulled={false}
    />
  )
}
