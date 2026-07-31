import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * Uctan uca duman testleri. Tek ve cok degerli bir isi var: siyah ekran
 * deploy etmemek. Sader-lar ve estetik burada test edilmiyor; onlar gozle
 * dogrulaniyor. Burada test edilen sey butun katmanlarin gercek bir tarayicida
 * birlikte calistigi.
 *
 * Cizim cagrisi ve ucgen butceleri de burada olculuyor, cunku bunlar donanimdan
 * bagimsiz: yazilim rasterizer'da bile ayni sayilari veriyorlar.
 */

const DRAW_CALL_BUDGET = 150
const TRIANGLE_BUDGET = 400_000
const LANE_HALF_WIDTH = 4.6
/** Govde yalpasi ust siniri (radyan), src/sim/Simulation.tsx ile ayni. */
const MAX_BODY_ROLL = (4.5 * Math.PI) / 180
/** Suspansiyon hareketi ust siniri (metre). */
const MAX_SUSPENSION_TRAVEL = 0.16

interface Telemetry {
  distance: number
  speed: number
  t: number
  s: number
  z: number
  mode: string
  drawCalls: number
  triangles: number
  bodyRoll: number
  maxWheelOffset: number
}

function collectProblems(page: Page): { errors: string[] } {
  const errors: string[] = []

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`)
  })

  return { errors }
}

async function readTelemetry(page: Page): Promise<Telemetry> {
  return page.evaluate(() => {
    const debug = (window as unknown as { __lastlight?: Record<string, never> }).__lastlight
    if (!debug) throw new Error('__lastlight yok')
    const { car, perf, runtime } = debug as unknown as {
      car: Record<string, number> & { wheelOffsets: number[] }
      perf: Record<string, number>
      runtime: { mode: string }
    }
    return {
      distance: car.distance!,
      speed: car.speed!,
      t: car.t!,
      s: car.s!,
      z: car.z!,
      mode: runtime.mode,
      drawCalls: perf.drawCalls!,
      triangles: perf.triangles!,
      bodyRoll: car.bodyRoll!,
      maxWheelOffset: Math.max(...car.wheelOffsets.map((value) => Math.abs(value))),
    }
  })
}

/** Simulasyonun gercekten calismaya basladigi ani bekliyoruz. */
async function waitUntilRunning(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const debug = (window as unknown as { __lastlight?: { car: { distance: number } } })
        .__lastlight
      return !!debug && debug.car.distance > 5
    },
    undefined,
    { timeout: 30_000 },
  )
}

test.describe('acilis', () => {
  test('sayfa yukleniyor ve WebGL baglami kuruluyor', async ({ page }) => {
    const { errors } = collectProblems(page)
    await page.goto('/')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()

    const context = await page.evaluate(() => {
      const element = document.querySelector('canvas')
      if (!element) return null
      const gl = element.getContext('webgl2') ?? element.getContext('webgl')
      return gl ? 'ok' : null
    })
    expect(context).toBe('ok')

    await waitUntilRunning(page)
    expect(errors).toEqual([])
  })

  test('acilis kartinda isim ve alt satir var', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, includeHidden: true })).toHaveText(
      'Lastlight',
    )
    await expect(page.locator('.titlecard__tagline')).toHaveText('an endless evening drive')
  })

  test('sinematik modda arac kendi kendine suruyor', async ({ page }) => {
    // Imza fikri: sayfa acilir, hicbir sey sormadan sinematik akmaya baslar.
    await page.goto('/')
    await waitUntilRunning(page)

    const first = await readTelemetry(page)
    expect(first.mode).toBe('cinematic')

    // Sabit sure beklemek yazilim rasterizer'da kirilgan: uc saniyeye kac kare
    // sigdigi garanti degil. Olcut sure degil, mesafenin kendiliginden buyumesi.
    await page.waitForFunction(
      (from: number) => {
        const debug = (window as unknown as { __lastlight: { car: { distance: number } } })
          .__lastlight
        return debug.car.distance > from + 25
      },
      first.distance,
      { timeout: 45_000 },
    )

    const second = await readTelemetry(page)
    expect(second.speed).toBeGreaterThan(5)
    expect(second.mode).toBe('cinematic')
  })

  test('sinematik modda HUD gorunmuyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await expect(page.locator('.hud')).toHaveAttribute('data-hidden', 'true')
  })
})

test.describe('surus', () => {
  test('otopilot seritte kaliyor', async ({ page }) => {
    // Yol uretimi, ters donusum, fizik ve otopilotun gercek tarayicida
    // birlikte calistiginin kaniti.
    await page.goto('/')
    await waitUntilRunning(page)

    for (let sample = 0; sample < 6; sample++) {
      await page.waitForTimeout(1000)
      const telemetry = await readTelemetry(page)
      expect(Math.abs(telemetry.t)).toBeLessThan(LANE_HALF_WIDTH)
    }
  })

  test('arac absurt yatmiyor ve tekerler yerde kaliyor', async ({ page }) => {
    // Govde yalpasi yanal ivmeyle olceklendigi icin sinirsiz birakildiginda
    // yirmi dereceye ciikip absurt duruyordu. Kasa araziye oturuyor, tekerler
    // kendi temas noktasinda kaliyor, govde sadece birkac derece oynuyor.
    await page.goto('/')
    await waitUntilRunning(page)

    for (let sample = 0; sample < 8; sample++) {
      await page.waitForTimeout(700)
      const telemetry = await readTelemetry(page)
      expect(Math.abs(telemetry.bodyRoll)).toBeLessThanOrEqual(MAX_BODY_ROLL + 1e-6)
      expect(telemetry.maxWheelOffset).toBeLessThanOrEqual(MAX_SUSPENSION_TRAVEL + 1e-6)
    }
  })

  test('klavye girdisi surus moduna geciriyor ve HUD geliyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)

    await page.keyboard.down('ArrowUp')
    await expect(page.locator('.hud')).toHaveAttribute('data-hidden', 'false')

    const telemetry = await readTelemetry(page)
    expect(telemetry.mode).toBe('driving')

    await expect(page.locator('.speed__value')).not.toHaveText('')
    await expect(page.locator('.speed__unit')).toHaveText('km/h')

    await page.keyboard.up('ArrowUp')
  })

  test('ok tuslari sayfayi kaydirmiyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await page.keyboard.press('ArrowDown')
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled).toBe(0)
  })
})

test.describe('performans butceleri', () => {
  test('cizim cagrisi ve ucgen sayisi butce icinde', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await page.waitForTimeout(1500)

    const telemetry = await readTelemetry(page)
    expect(telemetry.drawCalls).toBeGreaterThan(0)
    expect(telemetry.drawCalls).toBeLessThan(DRAW_CALL_BUDGET)
    expect(telemetry.triangles).toBeGreaterThan(0)
    expect(telemetry.triangles).toBeLessThan(TRIANGLE_BUDGET)
  })
})

test.describe('dunya tohumu', () => {
  test('farkli tohum farkli dunya uretiyor', async ({ page }) => {
    await page.goto('/?seed=alpha')
    await waitUntilRunning(page)
    const alpha = await readTelemetry(page)

    await page.goto('/?seed=beta')
    await waitUntilRunning(page)
    const beta = await readTelemetry(page)

    expect(Math.abs(alpha.z - beta.z)).toBeGreaterThan(1)
  })
})

test.describe('erisilebilirlik', () => {
  test('azaltilmis hareket tercihiyle de calisiyor', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const { errors } = collectProblems(page)
    await page.goto('/')
    await waitUntilRunning(page)
    expect(errors).toEqual([])
  })

  test('acilis karti ekran okuyucudan sakli', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.titlecard')).toHaveAttribute('aria-hidden', 'true')
  })
})

interface AudioInfo {
  state: string
  enabled: boolean
  unlocked: boolean
  level: number
}

/**
 * Surus moduna gecis. Tusa kisa basmak yetmiyor: mod gecisi kare dongusunde
 * degerlendiriliyor ve yazilim rasterizer'da kare araligi bir tus vurusundan
 * uzun olabiliyor, yani basma tamamen iki kare arasina dusuyor. Tus, mod
 * gerceklesene kadar basili tutuluyor.
 */
async function enterDriving(page: Page): Promise<void> {
  await page.keyboard.down('ArrowUp')
  await expect(page.locator('.hud')).toHaveAttribute('data-hidden', 'false')
  await page.keyboard.up('ArrowUp')
}

/** Cikis seviyesi esigin ustune cikana (veya altina inene) kadar bekliyor. */
async function waitForLevel(page: Page, threshold: number, above: boolean): Promise<void> {
  await page.waitForFunction(
    ({ limit, wantAbove }: { limit: number; wantAbove: boolean }) => {
      const debug = (window as unknown as { __lastlight: { audioInfo: () => AudioInfo | null } })
        .__lastlight
      const level = debug.audioInfo()?.level
      if (level === undefined) return false
      return wantAbove ? level > limit : level < limit
    },
    { limit: threshold, wantAbove: above },
    { timeout: 20_000 },
  )
}

async function readAudio(page: Page): Promise<AudioInfo | null> {
  return page.evaluate(() => {
    const debug = (window as unknown as { __lastlight?: { audioInfo: () => AudioInfo | null } })
      .__lastlight
    if (!debug) throw new Error('__lastlight yok')
    return debug.audioInfo()
  })
}

test.describe('ses', () => {
  test('ses baglami dokunulmadan askida, ilk tusla acılıyor', async ({ page }) => {
    // Otomatik oynatma politikasi geregi askida basliyor, ve bunu bir kaplama
    // ile degil ilk gercek dokunusla asiyoruz: sayfa sessiz ama tam calisir.
    await page.goto('/')
    await waitUntilRunning(page)

    const before = await readAudio(page)
    expect(before?.state).toBe('suspended')
    expect(before?.unlocked).toBe(false)

    await page.keyboard.press('KeyW')
    await page.waitForFunction(
      () => {
        const debug = (window as unknown as { __lastlight: { audioInfo: () => AudioInfo | null } })
          .__lastlight
        return debug.audioInfo()?.state === 'running'
      },
      undefined,
      { timeout: 15_000 },
    )

    const after = await readAudio(page)
    expect(after?.unlocked).toBe(true)
    expect(after?.enabled).toBe(true)
  })

  test('ses dugmesi tercihi degistiriyor ve hatirliyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await enterDriving(page)

    const toggle = page.getByRole('button', { name: 'Sesi kapat' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await toggle.click()
    await expect(page.getByRole('button', { name: 'Sesi ac' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect((await readAudio(page))?.enabled).toBe(false)

    // Tercih kaliciysa yenilemeden sonra da kapali geliyor.
    await page.reload()
    await waitUntilRunning(page)
    await enterDriving(page)
    expect((await readAudio(page))?.enabled).toBe(false)
  })

  test('M tusu sesi kapatip aciyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await page.keyboard.press('KeyW')

    await page.keyboard.press('KeyM')
    expect((await readAudio(page))?.enabled).toBe(false)
    await page.keyboard.press('KeyM')
    expect((await readAudio(page))?.enabled).toBe(true)
  })

  test('ses gercekten uretiliyor ve kapatinca susuyor', async ({ page }) => {
    // Baglamin "running" olmasi kanit degil: kazanclari sifirda kalmis bir graf
    // da running gorunuyor. Olcut cikisin RMS seviyesi.
    await page.goto('/')
    await waitUntilRunning(page)
    await enterDriving(page)

    await waitForLevel(page, 0.002, true)

    await page.keyboard.press('KeyM')
    await waitForLevel(page, 0.0005, false)

    await page.keyboard.press('KeyM')
    await waitForLevel(page, 0.002, true)
  })
})

test.describe('gorsel kayit', () => {
  test('ekran goruntusu aliniyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: 'screenshots/lastlight.png', fullPage: false })
  })
})
