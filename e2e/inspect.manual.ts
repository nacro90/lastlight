import { test } from '@playwright/test'

/** Gecici teshis. Sahne grafigine bakip neyin cizildigini olcuyor. */
test('inspect', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(
    () =>
      !!(window as unknown as { __lastlight?: { car: { distance: number } } }).__lastlight &&
      (window as unknown as { __lastlight: { car: { distance: number } } }).__lastlight.car
        .distance > 5,
    undefined,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(2500)

  const report = await page.evaluate(() => {
    const three = (window as unknown as { __three?: Record<string, unknown> }).__three
    const light = (window as unknown as { __lastlight?: Record<string, unknown> }).__lastlight
    if (!three || !light) return 'kopru yok'

    const scene = three.scene as {
      traverse(cb: (object: Record<string, unknown>) => void): void
    }
    const camera = three.camera as {
      position: { x: number; y: number; z: number }
      fov: number
      far: number
    }
    const car = (light.car as Record<string, number>)
    const perf = (light.perf as Record<string, number>)

    let meshCount = 0
    let visibleMeshes = 0
    const lines: string[] = []

    scene.traverse((object) => {
      if (object.type !== 'Mesh') return
      meshCount += 1
      if (object.visible) visibleMeshes += 1

      const geometry = object.geometry as {
        attributes?: { position?: { count: number; array: ArrayLike<number> } }
        boundingSphere?: { radius: number; center: { x: number; y: number; z: number } } | null
      }
      const position = object.position as { x: number; y: number; z: number }
      const count = geometry.attributes?.position?.count ?? 0

      if (count === 451 && lines.length < 2) {
        const array = geometry.attributes!.position!.array
        const sphere = geometry.boundingSphere
        lines.push(
          `slice vtx=${count} visible=${object.visible} meshX=${position.x.toFixed(1)} ` +
            `v0=(${array[0]!.toFixed(1)},${array[1]!.toFixed(1)},${array[2]!.toFixed(1)}) ` +
            `mid=(${array[60]!.toFixed(1)},${array[61]!.toFixed(1)},${array[62]!.toFixed(1)}) ` +
            `bsR=${sphere ? sphere.radius.toFixed(0) : 'yok'}`,
        )
      }
    })

    return [
      `mesh toplam=${meshCount} gorunur=${visibleMeshes}`,
      `kamera=(${camera.position.x.toFixed(1)},${camera.position.y.toFixed(1)},${camera.position.z.toFixed(1)}) fov=${camera.fov.toFixed(1)} far=${camera.far}`,
      `arac=(${car.x!.toFixed(1)},${car.y!.toFixed(1)},${car.z!.toFixed(1)}) s=${car.s!.toFixed(1)} t=${car.t!.toFixed(2)} hiz=${car.speed!.toFixed(1)}`,
      `perf draw=${perf.drawCalls} tri=${perf.triangles} fps=${perf.fps!.toFixed(1)}`,
      ...lines,
    ].join('\n')
  })

  console.log('\n===== TESHIS =====\n' + report + '\n==================\n')
})
