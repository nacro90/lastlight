import { defineConfig } from '@playwright/test'

const PORT = 5173
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  // Teshis araci depoda duruyor ama normal kosuya girmiyor. Elle cagirmak icin:
  //   pnpm inspect
  testIgnore: process.env.INSPECT ? [] : ['**/inspect.spec.ts'],
  outputDir: './test-results',

  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      // Headless chromium'da WebGL yazilim rasterizer ile calisiyor. Yavas
      // ama dogru: cizim cagrisi ve ucgen sayisi gibi donanimdan bagimsiz
      // butceleri burada olcebiliyoruz.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },

  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],

  webServer: {
    // --host acikca veriliyor: vite varsayilan olarak localhost'a baglaniyor ve
    // bu bazi sistemlerde sadece IPv6 cozuyor, 127.0.0.1 kontrolu basarisiz oluyor.
    command: `pnpm dev --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
