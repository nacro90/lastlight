import { expect, test } from '@playwright/test'

/**
 * Profilleme araci. Normal kosuya girmiyor, elle cagriliyor:
 *
 *   pnpm perf
 *
 * CPU dort kat yavaslatiliyor. Olculen sey kare hizi degil (yazilim
 * rasterizer'da o sayi anlamsiz), kalite kararinin ne kadar surede geldigi ve
 * konsolun temiz kalip kalmadigi.
 *
 * Yukleme suresi burada olculmez: gelistirme sunucusu paketlenmemis modulleri
 * tek tek veriyor ve dort kat yavas CPU'da bu kirk saniyeye cikiyor. Uretim
 * yapisinda ayni kosulda yuz yetmis milisaniye; profilleme icin `pnpm build`
 * ve `pnpm preview` kullanilir.
 */
test('CPU dort kat yavaslatilmis profil', async ({ page }) => {
  const client = await page.context().newCDPSession(page)
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')

  // Sayac ilk kareden basliyor; gelistirme sunucusunun modul yuklemesi olculen
  // seye dahil olmuyor.
  await page.waitForFunction(
    () => {
      const debug = (window as unknown as { __lastlight?: { car: { distance: number } } })
        .__lastlight
      return !!debug && debug.car.distance > 0
    },
    undefined,
    { timeout: 90_000 },
  )

  const started = Date.now()
  await page.waitForFunction(
    () => {
      const debug = (window as unknown as {
        __lastlight: { quality: () => { measured: string | null } }
      }).__lastlight
      return debug.quality().measured !== null
    },
    undefined,
    { timeout: 60_000 },
  )
  const decidedAfterMs = Date.now() - started

  const snapshot = await page.evaluate(() => {
    const debug = (window as unknown as {
      __lastlight: {
        quality: () => unknown
        perf: Record<string, number>
        car: { distance: number }
      }
    }).__lastlight
    return {
      quality: debug.quality(),
      perf: { ...debug.perf },
      distance: Math.round(debug.car.distance),
    }
  })

  console.log('PROFIL', JSON.stringify({ decidedAfterMs, ...snapshot }, null, 1))
  console.log('HATALAR', JSON.stringify(errors))

  expect(errors).toEqual([])
  // Kademe karari yavas makinede de makul surede gelmek zorunda: normal yol
  // ornek bekliyor, panik yolu ust uste dort agir kareden sonra devraliyor.
  expect(decidedAfterMs).toBeLessThan(20_000)
})
