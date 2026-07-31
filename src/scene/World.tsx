/**
 * Arazi dilimi havuzu.
 *
 * Yeni dilim geldiginde yeni geometri yaratmiyoruz: en arkadaki dilimin mevcut
 * vertex tamponunu yerinde guncelleyip one tasiyoruz. Butun dilimler ayni
 * vertex sayisinda oldugu icin bu sorunsuz calisiyor, ve kazanci buyuk: sifir
 * tahsis, sifir cop toplama duraklamasi. Sonsuz dunyalarda takilmanin asil
 * sebebi genelde uretim degil, cop toplayicidir.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { SLICE } from '@/core/config'
import {
  createSliceBuffers,
  sliceIndices,
  sliceOriginX,
  writeSlice,
  type SliceBuffers,
} from '@/core/terrain'
import { createSliceManager } from '@/core/sliceManager'
import { SEED, car, perf } from '@/sim/state'

interface PoolEntry {
  buffers: SliceBuffers
  geometry: THREE.BufferGeometry
}

export function World(): React.ReactElement {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.96,
        metalness: 0,
      }),
    [],
  )

  const pool = useMemo<PoolEntry[]>(() => {
    // Index tamponu her dilim icin ayni; tek ornek butun geometriler arasinda
    // paylasiliyor.
    const shared = new THREE.BufferAttribute(sliceIndices(), 1)

    return Array.from({ length: SLICE.poolSize }, () => {
      const buffers = createSliceBuffers()
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3))
      geometry.setIndex(shared)
      return { buffers, geometry }
    })
  }, [])

  const manager = useMemo(() => createSliceManager(), [])
  const meshes = useRef<Array<THREE.Mesh | null>>([])
  const warmed = useRef(false)

  useFrame(() => {
    // Ilk karede havuzun tamami doluyor (yukleme ani). Sonrasinda kare basina
    // bir dilim: amortisman bu sinirla saglaniyor.
    const budget = warmed.current ? 1 : SLICE.poolSize
    warmed.current = true

    const assignments = manager.update(car.s, budget)

    for (const { slot, sliceIndex } of assignments) {
      const entry = pool[slot] as PoolEntry
      writeSlice(SEED, sliceIndex, entry.buffers)

      entry.geometry.attributes.position!.needsUpdate = true
      entry.geometry.attributes.normal!.needsUpdate = true
      entry.geometry.attributes.color!.needsUpdate = true
      entry.geometry.computeBoundingSphere()

      const mesh = meshes.current[slot]
      if (mesh) {
        mesh.position.x = sliceOriginX(sliceIndex)
        mesh.visible = true
      }
    }

    perf.slices = SLICE.poolSize
  })

  return (
    <group>
      {pool.map((entry, slot) => (
        <mesh
          key={slot}
          ref={(mesh) => {
            meshes.current[slot] = mesh
          }}
          geometry={entry.geometry}
          material={material}
          visible={false}
          receiveShadow
          castShadow
        />
      ))}
    </group>
  )
}
