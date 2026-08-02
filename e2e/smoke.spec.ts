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

/**
 * Bizim olmayan ve elimizde olmayan konsol mesajlari. Liste kasitli olarak cok
 * dar: her madde neden gorulduguyle birlikte yaziliyor, yoksa liste zamanla
 * butun uyarilari yutan bir cop kutusuna donuyor.
 */
const IGNORED_CONSOLE = [
  // R3F kendi store'unda new THREE.Clock() kuruyor (node_modules/@react-three/
  // fiber/dist/events-*.js). Bizim kodumuzda Clock kullanimi yok; three surumu
  // bunu kullanimdan kaldirdi ve duzeltmesi R3F'te.
  'THREE.Clock: This module has been deprecated',
]

function collectProblems(page: Page): { errors: string[] } {
  const errors: string[] = []

  page.on('console', (message: ConsoleMessage) => {
    // Kabul kriteri hem hatayi hem uyariyi kapsiyor: three.js sorunlarini
    // tipik olarak uyari seviyesinden soyluyor.
    const type = message.type()
    if (type !== 'error' && type !== 'warning') return
    const text = message.text()
    if (IGNORED_CONSOLE.some((pattern) => text.includes(pattern))) return
    errors.push(`console ${type}: ${text}`)
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

  test('kontrol metni en kotu zeminde bile 4.5:1 tutuyor', async ({ page }) => {
    // Sartnamede pazarlik konusu olmayan bir madde, o yuzden iddia edilmiyor
    // olculuyor. Uc olcum denendi ve ucu de yanlis sonuc verdi:
    //
    // 1. Sahnenin kendi zeminine bakmak kararsizdi: ayni kod bir kosuda 8.9,
    //    digerinde 3.3 verdi, cunku sonuc sinematik programin o anki
    //    cercevesine bagliydi.
    // 2. Metin kutularindaki en parlak pikseli aramak arayuz suslerini zemin
    //    sandi: secili sekmenin alt cizgisi ve odak halkasi metinden parlak.
    // 3. Kapsayicilari visibility ile gizlemek panelin kendi zeminini de
    //    gizledi, yani metnin gercekte oturdugu zemin olculmedi.
    //
    // Bu kurulum ucunu de cozuyor: en kotu zemini test koyuyor (beyaz katman,
    // sahnenin uretebileceginden acik), murekkep ve susler seffaflasiyor, ve
    // metin renkleri gercek ogelerden okunuyor.
    await page.goto('/')
    await waitUntilRunning(page)
    await revealControls(page)

    // Ayarlar acik: panel metni bandin epey uzerine ve soluna yayiliyor, yani
    // kotu durum burasi.
    await page.getByRole('button', { name: 'ayarlar' }).click()
    await expect(page.getByRole('group', { name: 'Ayarlar' })).toBeVisible()

    const setup = await page.evaluate(() => {
      const rectOf = (selector: string): DOMRect => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`bulunamadi: ${selector}`)
        return element.getBoundingClientRect()
      }

      /**
       * Olculecek seritler metnin olamayacagi yerlerden seciliyor: panelin ust
       * dolgusu ve kontrol satirinin altindaki bant. Murekkebi CSS ile
       * seffaflastirmak denendi ve kirilgan cikti (secili sekmenin alt cizgisi
       * ve odak halkasi inatci), ustelik olcumun dogrulugu enjekte edilen bir
       * stile bagli kaliyordu. Metnin hic olmadigi bir serit bu sorunu
       * tamamen ortadan kaldiriyor, ve koyulastirma o seritte metnin altindaki
       * ile ayni.
       */
      const settings = rectOf('.settings')
      const controls = rectOf('.controls')
      const regions = [
        // Panelin ust dolgusu (0.9rem): yatayda kose yaricapinin otesine
        // ceviriliyor.
        { x: settings.x + 14, y: settings.y + 2, width: settings.width - 28, height: 9 },
        // Kontrol satirinin altindaki alt bant dolgusu.
        { x: controls.x, y: controls.bottom + 2, width: controls.width, height: 9 },
      ]

      // Metin renkleri token'dan degil gercek ogeden okunuyor: token adi veya
      // renk sozdizimi degisirse (ornek: rgb(... / 30%)) ayristirma sessizce
      // iyimser tarafa dusmesin.
      const colorOf = (selector: string): string => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`bulunamadi: ${selector}`)
        return getComputedStyle(element).color
      }

      return {
        regions,
        colors: {
          label: colorOf('.settings__label'),
          value: colorOf('.settings__value--plain'),
          toggle: colorOf('.cluster .toggle'),
        },
      }
    })
    expect(setup.regions).toHaveLength(2)

    /** rgb(a) dizisini sayilara cevirir; ayristiramazsa testi patlatir. */
    const parseColor = (value: string): { rgb: number[]; alpha: number } => {
      const numbers = value.match(/[\d.]+/g)
      if (!numbers || numbers.length < 3) throw new Error(`renk ayristirilamadi: ${value}`)
      const rgb = numbers.slice(0, 3).map(Number)
      const alpha = numbers.length > 3 ? Number(numbers[3]) : 1
      if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
        throw new Error(`opaklik araligin disinda: ${value}`)
      }
      return { rgb, alpha }
    }

    const colors = Object.fromEntries(
      Object.entries(setup.colors).map(([name, value]) => [name, parseColor(value)]),
    )
    // Metnin gercekten yariginan degil parlak oldugunu da dogruluyoruz.
    for (const color of Object.values(colors)) expect(color.alpha).toBeGreaterThan(0.5)

    await page.evaluate(() => {
      const root = document.getElementById('root')
      const hud = document.querySelector('.hud')
      if (!root || !hud) throw new Error('arayuz bulunamadi')

      const worst = document.createElement('div')
      worst.style.cssText =
        'position:fixed;inset:auto 0 0 0;height:320px;background:#ffffff;pointer-events:none'
      // Canvas ile arayuz arasina giriyor: opak canvas'in ustunde ama kumenin
      // altinda. Body'nin basina eklemek ise yaramiyor, canvas onu kapatiyor.
      root.insertBefore(worst, hud)
    })

    // Kume tam opak olmadan olcmek yaridan saydam bir koyulastirma olcmek olur.
    await page.waitForFunction(() => {
      const cluster = document.querySelector('.cluster')
      return !!cluster && getComputedStyle(cluster).opacity === '1'
    })

    const shot = (await page.screenshot({ type: 'png' })).toString('base64')

    const probe = await page.evaluate(
      async ({
        base64,
        areas,
      }: {
        base64: string
        areas: Array<{ x: number; y: number; width: number; height: number }>
      }) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()

        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('2d baglami yok')
        context.drawImage(image, 0, 0)

        // Ekran goruntusu cihaz piksellerinde, kutular CSS piksellerinde.
        const scale = image.width / window.innerWidth
        let brightest = [0, 0, 0]
        let brightestSum = -1
        let where = ''

        for (const area of areas) {
          const data = context.getImageData(
            Math.max(0, Math.floor(area.x * scale)),
            Math.max(0, Math.floor(area.y * scale)),
            Math.max(1, Math.floor(area.width * scale)),
            Math.max(1, Math.floor(area.height * scale)),
          ).data
          const rowWidth = Math.max(1, Math.floor(area.width * scale))
          for (let i = 0; i < data.length; i += 4) {
            const sum = data[i]! + data[i + 1]! + data[i + 2]!
            if (sum > brightestSum) {
              brightestSum = sum
              brightest = [data[i]!, data[i + 1]!, data[i + 2]!]
              const pixel = i / 4
              const px = Math.round(area.x + (pixel % rowWidth) / scale)
              const py = Math.round(area.y + Math.floor(pixel / rowWidth) / scale)
              where = `${Math.round(area.width)}x${Math.round(area.height)} @ ${px},${py}`
            }
          }
        }
        return { brightest, where }
      },
      { base64: shot, areas: setup.regions },
    )
    const background = probe.brightest

    const channel = (value: number): number => {
      const s = value / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    const luminance = (pixel: number[]): number =>
      0.2126 * channel(pixel[0]!) + 0.7152 * channel(pixel[1]!) + 0.0722 * channel(pixel[2]!)

    const contrastFor = ({ rgb, alpha }: { rgb: number[]; alpha: number }): number => {
      const mixed = rgb.map((component, i) => alpha * component + (1 - alpha) * background[i]!)
      const a = luminance(mixed)
      const b = luminance(background)
      const [high, low] = a > b ? [a, b] : [b, a]
      return (high + 0.05) / (low + 0.05)
    }

    // Koyulastirma beyazi gercekten kirmis olmali; kirmadiysa olcum anlamsiz.
    expect(Math.max(...background)).toBeLessThan(160)
    for (const [name, color] of Object.entries(colors)) {
      expect(contrastFor(color), `${name} kontrasti`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('hiz gostergesi de en acik zeminde 4.5:1 tutuyor', async ({ page }) => {
    // Hiz gostergesinin arkasinda koyulastirma yok ve olmasina gerek de yok:
    // takip kamerasinin geometrisi geregi alt bandin sol tarafi her zaman aracin
    // hemen arkasindaki asfalt. Garanti bu yapisal argumana dayaniyor, ama
    // argumanin dogru kalmasini test korumuyordu; bu test onu koruyor.
    await page.goto('/')
    await waitUntilRunning(page)
    await page.keyboard.down('ArrowUp')
    await expect(page.locator('.hud')).toHaveAttribute('data-hidden', 'false')

    const setup = await page.evaluate(() => {
      const speed = document.querySelector('.speed')
      const value = document.querySelector('.speed__value')
      const unit = document.querySelector('.speed__unit')
      if (!speed || !value || !unit) throw new Error('hiz gostergesi bulunamadi')
      const rect = speed.getBoundingClientRect()
      return {
        // Rakamin hemen altindaki serit: alt bant dolgusunun icinde ve metin
        // yok, yani olculen sey zemin.
        region: { x: rect.x, y: rect.bottom + 3, width: rect.width, height: 9 },
        colors: [getComputedStyle(value).color, getComputedStyle(unit).color],
      }
    })

    const channel = (v: number): number => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    const luminance = (pixel: number[]): number =>
      0.2126 * channel(pixel[0]!) + 0.7152 * channel(pixel[1]!) + 0.0722 * channel(pixel[2]!)

    // Birkac kare: arazi degisiyor, en acik hali ariyoruz.
    let brightest = [0, 0, 0]
    for (let frame = 0; frame < 4; frame++) {
      const shot = (await page.screenshot({ type: 'png' })).toString('base64')
      const found = await page.evaluate(
        async ({ base64, region }: { base64: string; region: typeof setup.region }) => {
          const image = new Image()
          image.src = `data:image/png;base64,${base64}`
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = image.width
          canvas.height = image.height
          const context = canvas.getContext('2d')
          if (!context) throw new Error('2d baglami yok')
          context.drawImage(image, 0, 0)

          const scale = image.width / window.innerWidth
          const data = context.getImageData(
            Math.max(0, Math.floor(region.x * scale)),
            Math.max(0, Math.floor(region.y * scale)),
            Math.max(1, Math.floor(region.width * scale)),
            Math.max(1, Math.floor(region.height * scale)),
          ).data

          let best = [0, 0, 0]
          let bestSum = -1
          for (let i = 0; i < data.length; i += 4) {
            const sum = data[i]! + data[i + 1]! + data[i + 2]!
            if (sum > bestSum) {
              bestSum = sum
              best = [data[i]!, data[i + 1]!, data[i + 2]!]
            }
          }
          return best
        },
        { base64: shot, region: setup.region },
      )
      if (luminance(found) > luminance(brightest)) brightest = found
      await page.waitForTimeout(1800)
    }
    await page.keyboard.up('ArrowUp')

    for (const color of setup.colors) {
      const numbers = color.match(/[\d.]+/g)
      if (!numbers || numbers.length < 3) throw new Error(`renk ayristirilamadi: ${color}`)
      const rgb = numbers.slice(0, 3).map(Number)
      const alpha = numbers.length > 3 ? Number(numbers[3]) : 1
      if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
        throw new Error(`opaklik araligin disinda: ${color}`)
      }

      const mixed = rgb.map((component, i) => alpha * component + (1 - alpha) * brightest[i]!)
      const a = luminance(mixed)
      const b = luminance(brightest)
      const [high, low] = a > b ? [a, b] : [b, a]
      expect((high + 0.05) / (low + 0.05), `${color} kontrasti`).toBeGreaterThanOrEqual(4.5)
    }
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
  test('ses grafi dokunulmadan kurulmuyor, ilk tusla aciliyor', async ({ page }) => {
    // Otomatik oynatma politikasi geregi ses ilk gercek dokunusla basliyor, ve
    // bunu bir kaplama ile degil o dokunusla asiyoruz: sayfa sessiz ama tam
    // calisir.
    await page.goto('/')
    await waitUntilRunning(page)

    // Dokunulmadan once graf hic kurulmuyor: ne AudioContext var ne gurultu
    // tamponu. Onceki uygulamada askida bir baglam kuruluyordu ve Chrome her
    // seferinde uyari basiyordu.
    expect(await readAudio(page)).toBeNull()

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
    await expect(page.getByRole('button', { name: 'Sesi aç' })).toHaveAttribute(
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

interface QualityInfo {
  choice: string
  measured: string | null
  tier: string
  settings: { maxPixelRatio: number; shadowMapSize: number; dustScale: number }
}

async function readQuality(page: Page): Promise<QualityInfo> {
  return page.evaluate(() => {
    const debug = (window as unknown as { __lastlight?: { quality: () => QualityInfo } })
      .__lastlight
    if (!debug) throw new Error('__lastlight yok')
    return debug.quality()
  })
}

/** Kontrol kumesi isaretleyici niyetiyle geliyor; fareyi kimildatmak yeterli. */
async function revealControls(page: Page): Promise<void> {
  await page.mouse.move(400, 300)
  await expect(page.locator('.cluster')).toHaveAttribute('data-hidden', 'false')
}

test.describe('ayarlar', () => {
  test('sinematik modda bile kontrollere ulasilabiliyor', async ({ page }) => {
    // Dokunmatik cihazda deneyim hep sinematik modda kaliyor; kume hic
    // gorunmezse o cihazda sesi kapatmak imkansiz olurdu.
    await page.goto('/')
    await waitUntilRunning(page)
    await revealControls(page)
    // toBeVisible burada tek basina yetmiyor: kume gorunurlugu opacity ile
    // tasiniyor ve Playwright'in gorunurluk tanimi opacity'ye bakmiyor. Gercek
    // koruma revealControls icindeki data-hidden iddiasi.
    await expect(page.locator('.cluster')).toHaveAttribute('data-hidden', 'false')
    await expect(page.getByRole('button', { name: 'ayarlar' })).toBeVisible()
  })

  test('ayarlar aciliyor, Esc kapatiyor ve odak dugmeye donuyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await revealControls(page)

    const button = page.getByRole('button', { name: 'ayarlar' })
    await button.click()

    const panel = page.getByRole('group', { name: 'Ayarlar' })
    await expect(panel).toBeVisible()
    // Acilinca odak panelin icine giriyor.
    await expect(panel.getByRole('button').first()).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(button).toBeFocused()
  })

  test('ayarlar sadece klavyeyle gezilebiliyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await revealControls(page)

    // Dugmeye odaklanip bosluk ile aciyoruz: fare hic kullanilmiyor.
    await page.getByRole('button', { name: 'ayarlar' }).focus()
    await page.keyboard.press('Space')

    const panel = page.getByRole('group', { name: 'Ayarlar' })
    await expect(panel).toBeVisible()

    // Sekme paneldeki secenekler arasinda ilerliyor.
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('button').nth(1)).toBeFocused()
    await page.keyboard.press('Enter')
    expect((await readQuality(page)).choice).toBe('low')
  })

  test('kalite secimi hatirlaniyor ve sahneye uyguluyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)
    await revealControls(page)
    await page.getByRole('button', { name: 'ayarlar' }).click()

    const panel = page.getByRole('group', { name: 'Ayarlar' })
    await panel.getByRole('button', { name: 'yüksek' }).click()
    const high = await readQuality(page)
    expect(high.tier).toBe('high')

    await panel.getByRole('button', { name: 'düşük' }).click()
    const low = await readQuality(page)
    expect(low.tier).toBe('low')
    expect(low.settings.maxPixelRatio).toBeLessThan(high.settings.maxPixelRatio)
    expect(low.settings.shadowMapSize).toBeLessThan(high.settings.shadowMapSize)

    // Tercih kalici: yenilemeden sonra da dusuk geliyor.
    await page.reload()
    await waitUntilRunning(page)
    expect((await readQuality(page)).tier).toBe('low')
  })

  test('dusuk kademe ucgen sayisini gercekten dusuruyor', async ({ page }) => {
    // Ayar sadece bir etiket degil: toz yogunlugu kademeyle birlikte iniyor.
    await page.goto('/')
    await waitUntilRunning(page)
    await revealControls(page)
    await page.getByRole('button', { name: 'ayarlar' }).click()

    const panel = page.getByRole('group', { name: 'Ayarlar' })
    await panel.getByRole('button', { name: 'yüksek' }).click()

    // Sabit sure beklemek burada yanlis olcum veriyor: yazilim rasterizer'da
    // yarim saniye bazen tek kareye yetmiyor ve sayac bir kare geriden geliyor,
    // yani iki okuma da degisiklikten onceki kareyi gosteriyor. Olcut sure
    // degil, sayinin gercekten dusmesi.
    await page.waitForFunction(
      () => {
        const debug = (window as unknown as { __lastlight: { quality: () => QualityInfo } })
          .__lastlight
        return debug.quality().tier === 'high'
      },
      undefined,
      { timeout: 15_000 },
    )
    const before = (await readTelemetry(page)).triangles

    await panel.getByRole('button', { name: 'düşük' }).click()
    await page.waitForFunction(
      (limit: number) => {
        const debug = (window as unknown as { __lastlight: { perf: { triangles: number } } })
          .__lastlight
        return debug.perf.triangles < limit
      },
      before,
      { timeout: 30_000 },
    )
  })

  test('otomatik kademe olculuyor ve kilitleniyor', async ({ page }) => {
    await page.goto('/')
    await waitUntilRunning(page)

    // Yazilim rasterizer'da olcum dusuk kademe veriyor; onemli olan bir karara
    // varilmasi ve o kararin saklanmasi.
    await page.waitForFunction(
      () => {
        const debug = (window as unknown as { __lastlight: { quality: () => QualityInfo } })
          .__lastlight
        return debug.quality().measured !== null
      },
      undefined,
      { timeout: 45_000 },
    )

    const info = await readQuality(page)
    expect(info.choice).toBe('auto')
    expect(['low', 'medium', 'high']).toContain(info.measured)
    expect(info.tier).toBe(info.measured)
  })
})

test.describe('surus arayuzu', () => {
  test('surerken ekranda sadece hiz kaliyor', async ({ page }) => {
    // Kilitlenen karar: surerken ekranda sadece hiz var. Klavye kumeyi
    // getirmiyor, ve klavye ipucu bir kez gosterilip cekiliyor.
    await page.goto('/')
    await waitUntilRunning(page)

    await page.keyboard.down('ArrowUp')
    await expect(page.locator('.hud')).toHaveAttribute('data-hidden', 'false')
    await expect(page.locator('.hint--drive')).toHaveAttribute('data-hidden', 'false')

    // Ipucu suresi ve kume gecikmesi gecsin. Bu sureler gercek zamanda
    // isliyor, kare hizina bagli degil.
    await page.waitForTimeout(9000)
    await page.keyboard.up('ArrowUp')

    await expect(page.locator('.cluster')).toHaveAttribute('data-hidden', 'true')
    await expect(page.locator('.hint--drive')).toHaveAttribute('data-hidden', 'true')
    // Hiz duruyor.
    await expect(page.locator('.hud')).toHaveAttribute('data-hidden', 'false')
    await expect(page.locator('.speed__unit')).toHaveText('km/h')
  })

  test('gizli kumeye klavyeyle ulasilabiliyor', async ({ page }) => {
    // Kume gizliyken de sekme sirasinda: odak gelince gorunur oluyor. Onceki
    // uygulamada visibility: hidden vardi ve gorunmez ogeye odak gitmedigi
    // icin klavyeyle gezen biri ayarlara hic ulasamiyordu.
    await page.goto('/')
    await waitUntilRunning(page)
    await page.waitForTimeout(4500)
    await expect(page.locator('.cluster')).toHaveAttribute('data-hidden', 'true')

    const settings = page.getByRole('button', { name: 'ayarlar' })

    // Gizliyken isaretleyiciye kapali: gorunmez bir dugmenin tiklanabilir
    // kalmasi, telefonda sag alt koseye dokunan biri icin gorunurde hicbir seye
    // dokunmadan ayarlarin acilmasi demek. Deneme tiklamasi eylem yapmiyor,
    // sadece hedefin ulasilabilir olup olmadigini kontrol ediyor.
    await expect(settings.click({ trial: true, timeout: 2500 })).rejects.toThrow()

    await settings.focus()
    await expect(settings).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('group', { name: 'Ayarlar' })).toBeVisible()
  })
})

test.describe('dokunmatik cihaz', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('sinematik modda kaliyor, surus kontrolu yok, kademe dusuk', async ({ page }) => {
    const { errors } = collectProblems(page)
    await page.goto('/')
    await waitUntilRunning(page)

    // Dokunmatik cihazda kademe olcum beklemeden dusuge sabitleniyor.
    expect((await readQuality(page)).tier).toBe('low')

    // Kume dokunusla geliyor ve surus yerine klavye ipucu soyluyor.
    await page.tap('body')
    // data-hidden gercek koruma; toBeVisible opacity'ye bakmadigi icin kume
    // tamamen saydam olsa da gecerdi.
    await expect(page.locator('.cluster')).toHaveAttribute('data-hidden', 'false')
    await expect(page.getByText('klavyeli bir cihazda sürebilirsin')).toBeVisible()

    // Sinematik mod devam ediyor, hiz gostergesi yok.
    expect((await readTelemetry(page)).mode).toBe('cinematic')
    await expect(page.locator('.hud')).toHaveAttribute('data-hidden', 'true')
    expect(errors).toEqual([])
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
