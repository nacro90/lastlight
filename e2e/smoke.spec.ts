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

interface Telemetry {
  distance: number
  speed: number
  t: number
  s: number
  z: number
  mode: string
  drawCalls: number
  triangles: number
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
      car: Record<string, number>
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

test.describe('gorsel kayit', () => {
  test('ekran goruntusu aliniyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: 'test-results/lastlight.png', fullPage: false })
  })
})
