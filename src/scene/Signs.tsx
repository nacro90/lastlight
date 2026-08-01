/**
 * Yol tabelalari. Cesit basina bir instanced mesh, uc cizim cagrisi.
 *
 * Cesitler ayri mesh olmak zorunda cunku instancing ayni geometriyi tekrarliyor.
 * Malzeme tek: ayrimi vertex renkleri tasiyor (bkz. scene/Scatter). Bir dilimde
 * tabela yoksa o dilimin yuvasi butun cesitlerde sifir olcekle saklaniyor;
 * temizlenmezse onceki dilimin tabelasi oldugu yerde kaliyor.
 *
 * Levhaya kucuk bir kendiliginden isik veriliyor. Fizik degil okunurluk: levha
 * yuzu trafige, yani gunesin ters tarafina bakiyor ve tamamen siyaha
 * cokuyor; gercek levhalar da geri yansitici oldugu icin bir miktar aydinlik
 * gorunuyor. Deger bloom esiginin (1.05) altinda, yani parlamiyor.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { SLICE } from '@/core/config'
import { SIGN, SIGN_KINDS, SIGN_STRIDE, createSliceSigns, writeSliceSigns } from '@/core/signs'
import { createSliceManager } from '@/core/sliceManager'
import { SEED, car } from '@/sim/state'
import type { SignKind } from '@/core/signs'

/** Direk ve levha kenari: ters isikta siluet, soluk ve serin. */
const DARK = '#2a251f'
/** Levha yuzu: soluk beton grisi, sicak degil. */
const PLATE = '#a8a49b'
/** Kilometre tasi: biraz daha kirli. */
const STONE = '#938d84'

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

function buildPost(height: number): THREE.BufferGeometry {
  const post = paint(
    new THREE.BoxGeometry(SIGN.postThickness, height, SIGN.postThickness),
    DARK,
  )
  post.translate(0, height / 2, 0)
  return post
}

/**
 * Levha: onde soluk yuz, arkasinda biraz daha buyuk koyu bir plaka. Kenar
 * boylece cerceve gibi okunuyor ve arkadan bakildiginda levha koyu kaliyor.
 * Iki duz yuzey, dokuya ve ek malzemeye gerek yok.
 */
function buildPlate(shape: (radius: number) => THREE.BufferGeometry): THREE.BufferGeometry {
  const face = paint(shape(SIGN.plateRadius), PLATE)
  const rim = paint(shape(SIGN.plateRadius * 1.12), DARK)
  rim.translate(0, 0, -0.012)

  const merged = mergeGeometries([face, rim])
  if (!merged) throw new Error('levha geometrisi birlestirilemedi')

  merged.translate(0, SIGN.plateHeight, 0)
  // Levha yuzu trafige donuyor: yol +X yonunde gidiyor, gelen trafik -X'ten.
  merged.rotateY(-Math.PI / 2)
  return merged
}

function buildWarning(): THREE.BufferGeometry {
  // Ucgen levha; tepe yukari donuk.
  const plate = buildPlate((radius) => {
    const triangle = new THREE.CircleGeometry(radius * 1.15, 3)
    triangle.rotateZ(Math.PI / 2)
    return triangle
  })
  const merged = mergeGeometries([buildPost(SIGN.plateHeight), plate])
  if (!merged) throw new Error('uyari tabelasi birlestirilemedi')
  return merged
}

function buildSpeed(): THREE.BufferGeometry {
  const plate = buildPlate((radius) => new THREE.CircleGeometry(radius, 16))
  const merged = mergeGeometries([buildPost(SIGN.plateHeight), plate])
  if (!merged) throw new Error('hiz tabelasi birlestirilemedi')
  return merged
}

function buildStone(): THREE.BufferGeometry {
  // Kilometre tasi: direksiz, alcak, yolun kenarinda oturan bir blok.
  const stone = paint(
    new THREE.BoxGeometry(SIGN.stoneDepth, SIGN.stoneHeight, SIGN.stoneWidth),
    STONE,
  )
  stone.translate(0, SIGN.stoneHeight / 2, 0)

  const cap = paint(
    new THREE.BoxGeometry(SIGN.stoneDepth * 1.05, SIGN.stoneHeight * 0.18, SIGN.stoneWidth * 1.05),
    DARK,
  )
  cap.translate(0, SIGN.stoneHeight * 0.92, 0)

  const merged = mergeGeometries([stone, cap])
  if (!merged) throw new Error('kilometre tasi birlestirilemedi')
  return merged
}

const BUILDERS: Record<SignKind, () => THREE.BufferGeometry> = {
  warning: buildWarning,
  speed: buildSpeed,
  stone: buildStone,
}

export function Signs(): React.ReactElement {
  const geometries = useMemo(() => SIGN_KINDS.map((kind) => BUILDERS[kind]()), [])

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.85,
        metalness: 0,
        // Okunurluk icin kucuk bir taban aydinlik; bloom esiginin altinda.
        emissive: new THREE.Color(0.05, 0.05, 0.055),
      }),
    [],
  )

  const manager = useMemo(() => createSliceManager(), [])
  const buffer = useMemo(() => createSliceSigns(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const meshes = useRef<Array<THREE.InstancedMesh | null>>([])
  const warmed = useRef(false)

  /**
   * Sifirlama doldurmayla ayni karede ve ondan once olmak zorunda: useEffect
   * ilk render karesinden sonra calisip ilk karede dolan havuzu siliyor.
   */
  const hideAll = (): void => {
    dummy.position.set(0, 0, 0)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.setScalar(0)
    dummy.updateMatrix()

    for (const mesh of meshes.current) {
      if (!mesh) continue
      for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, dummy.matrix)
      mesh.instanceMatrix.needsUpdate = true
    }
    dummy.scale.setScalar(1)
  }

  useFrame(() => {
    if (meshes.current.length !== SIGN_KINDS.length) return

    const firstFrame = !warmed.current
    if (firstFrame) hideAll()

    const budget = firstFrame ? SLICE.poolSize : 1
    warmed.current = true

    const assignments = manager.update(car.s, budget)
    if (assignments.length === 0) return

    for (const { slot, sliceIndex } of assignments) {
      writeSliceSigns(SEED, sliceIndex, buffer)
      const kind = buffer[SIGN_STRIDE - 1]!

      dummy.position.set(buffer[0]!, buffer[1]!, buffer[2]!)
      dummy.rotation.set(0, -buffer[3]!, 0)

      for (let index = 0; index < SIGN_KINDS.length; index++) {
        const mesh = meshes.current[index]
        if (!mesh) continue
        // Bu dilim bu cesidi kullanmiyorsa yuva saklaniyor; yoksa onceki
        // dilimin tabelasi oldugu yerde kaliyor.
        dummy.scale.setScalar(index === kind ? 1 : 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(slot, dummy.matrix)
      }
    }

    for (const mesh of meshes.current) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {SIGN_KINDS.map((kind, index) => (
        <instancedMesh
          key={kind}
          ref={(mesh) => {
            meshes.current[index] = mesh
          }}
          args={[geometries[index]!, material, SLICE.poolSize]}
          castShadow
          receiveShadow
          // Ornekler butun koridora yayildigi icin kutle kirpma kazanc
          // saglamiyor, ama yanlis bir sinir kuresi tabelalari kaybettiriyor.
          frustumCulled={false}
        />
      ))}
    </>
  )
}
