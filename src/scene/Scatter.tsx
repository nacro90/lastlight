/**
 * Agac, cali ve tas ornekleri.
 *
 * Uc instanced mesh, toplam yediyuz altmis sekiz ornek, uc cizim cagrisi.
 * Yuva indeksi (dilimYuvasi * adet + i) formuluyle hesaplaniyor, yani hicbir
 * defter tutulmuyor; gorunmeyecek nesneler sifir olcekle saklaniyor.
 *
 * Kendi dilim yoneticisini calistiriyor, World ile paylasmiyor. Yonetici
 * deterministik oldugu icin ikisi ayni kareyi ayni car.s ile gordugunde
 * birebir ayni atamalari uretiyor: sifir bag, sifir siralama bagimliligi.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { SCATTER, SLICE } from '@/core/config'
import { createSliceManager } from '@/core/sliceManager'
import { SCATTER_STRIDE, createSliceScatter, writeSliceScatter } from '@/core/scatter'
import { SEED, car } from '@/sim/state'

const TRUNK_COLOR = '#2a2018'
const FOLIAGE_COLOR = '#24301c'
const BUSH_COLOR = '#2b3220'
const ROCK_COLOR = '#3a3430'

/**
 * Verilen renkte vertex rengi atar. Govde ve yaprak tek instanced mesh'te
 * birlesince malzeme de tek olmak zorunda; ayrimi vertex rengi tasiyor.
 */
function paint(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const color = new THREE.Color(hex)
  const count = geometry.attributes.position!.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function buildTree(): THREE.BufferGeometry {
  const trunk = paint(new THREE.CylinderGeometry(0.16, 0.26, 2.3, 6), TRUNK_COLOR)
  trunk.translate(0, 1.15, 0)

  const lower = paint(new THREE.ConeGeometry(1.55, 3.3, 7), FOLIAGE_COLOR)
  lower.translate(0, 3.45, 0)

  const upper = paint(new THREE.ConeGeometry(1.05, 2.6, 7), FOLIAGE_COLOR)
  upper.translate(0, 5.35, 0)

  const merged = mergeGeometries([trunk, lower, upper])
  if (!merged) throw new Error('agac geometrisi birlestirilemedi')
  return merged
}

function buildBush(): THREE.BufferGeometry {
  const geometry = paint(new THREE.IcosahedronGeometry(1.05, 0), BUSH_COLOR)
  geometry.scale(1, 0.66, 1)
  geometry.translate(0, 0.6, 0)
  return geometry
}

function buildRock(): THREE.BufferGeometry {
  const geometry = paint(new THREE.DodecahedronGeometry(0.9, 0), ROCK_COLOR)
  geometry.scale(1.15, 0.72, 1)
  geometry.translate(0, 0.3, 0)
  return geometry
}

type Kind = 'trees' | 'bushes' | 'rocks'

const KIND_COUNTS: Record<Kind, number> = {
  trees: SCATTER.trees,
  bushes: SCATTER.bushes,
  rocks: SCATTER.rocks,
}

export function Scatter(): React.ReactElement {
  const geometries = useMemo(
    () => ({ trees: buildTree(), bushes: buildBush(), rocks: buildRock() }),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.88,
        metalness: 0,
      }),
    [],
  )

  const manager = useMemo(() => createSliceManager(), [])
  const scatter = useMemo(() => createSliceScatter(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const meshes = useRef<Partial<Record<Kind, THREE.InstancedMesh | null>>>({})
  const warmed = useRef(false)

  /**
   * Atanmamis yuvalar sifir olcekle baslatiliyor; yoksa hepsi merkezde birim
   * olcekte durup bir yigin halinde gorunuyor.
   *
   * Bu isin useEffect icinde yapilmamasi kritik: effect ilk render karesinden
   * sonra calisiyor, yani ilk karede dolan butun havuzu siliyor ve nesneler
   * ancak kare basina bir dilim hiziyla geri geliyor. Sifirlama, doldurmayla
   * ayni karede ve ondan once olmak zorunda.
   */
  const clearInstances = (): void => {
    dummy.scale.setScalar(0)
    dummy.updateMatrix()

    for (const kind of Object.keys(KIND_COUNTS) as Kind[]) {
      const mesh = meshes.current[kind]
      if (!mesh) continue
      for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, dummy.matrix)
    }
  }

  useFrame(() => {
    const firstFrame = !warmed.current
    if (firstFrame) clearInstances()

    const budget = firstFrame ? SLICE.poolSize : 1
    warmed.current = true

    const assignments = manager.update(car.s, budget)
    if (assignments.length === 0) return

    for (const { slot, sliceIndex } of assignments) {
      writeSliceScatter(SEED, sliceIndex, scatter)

      for (const kind of Object.keys(KIND_COUNTS) as Kind[]) {
        const mesh = meshes.current[kind]
        if (!mesh) continue

        const count = KIND_COUNTS[kind]
        const buffer = scatter[kind]
        const base = slot * count

        for (let i = 0; i < count; i++) {
          const offset = i * SCATTER_STRIDE
          dummy.position.set(buffer[offset]!, buffer[offset + 1]!, buffer[offset + 2]!)
          dummy.rotation.set(0, buffer[offset + 4]!, 0)
          dummy.scale.setScalar(buffer[offset + 3]!)
          dummy.updateMatrix()
          mesh.setMatrixAt(base + i, dummy.matrix)
        }
      }
    }

    for (const kind of Object.keys(KIND_COUNTS) as Kind[]) {
      const mesh = meshes.current[kind]
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {(Object.keys(KIND_COUNTS) as Kind[]).map((kind) => (
        <instancedMesh
          key={kind}
          ref={(mesh) => {
            meshes.current[kind] = mesh
          }}
          args={[geometries[kind], material, SLICE.poolSize * KIND_COUNTS[kind]]}
          // Ornekler butun koridora yayildigi icin kutle kirpma kazanc
          // saglamiyor, ama yanlis hesaplanmis bir sinir kuresi nesneleri
          // kaybettirebiliyor.
          frustumCulled={false}
          castShadow
          receiveShadow
        />
      ))}
    </>
  )
}
