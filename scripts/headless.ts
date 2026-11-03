// 動作確認用のヘッドレス Chromium を、できるだけ GPU で描くように起動する。
// Playwright の既定のままだと SwiftShader（CPU）で描き、全体を映すと 1fps 前後しか出ない。
//
// 検証スクリプトから使う：
//   import { launchHeadless, rendererOf } from '../scripts/headless.ts'
//   const browser = await launchHeadless()
// 1 枚撮るだけなら（Vite を立てた状態で）：
//   npx tsx scripts/headless.ts [URL] [保存先.png] [--mobile]
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { chromium, type Browser, type LaunchOptions, type Page } from 'playwright-core'

const PLAYWRIGHT_CACHE = `${homedir()}/.cache/ms-playwright`

/** CPU で描いているときの WebGL の renderer 名に含まれる語 */
const SOFTWARE_RENDERERS = ['SwiftShader', 'llvmpipe']

function findHeadlessShell(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  if (!existsSync(PLAYWRIGHT_CACHE)) return undefined
  const dirs = readdirSync(PLAYWRIGHT_CACHE).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  for (const dir of dirs) {
    for (const sub of readdirSync(`${PLAYWRIGHT_CACHE}/${dir}`)) {
      for (const name of ['chrome-headless-shell', 'chrome-headless-shell.exe']) {
        const path = `${PLAYWRIGHT_CACHE}/${dir}/${sub}/${name}`
        if (existsSync(path)) return path
      }
    }
  }
  return undefined
}

function rendererArgs(): { args: string[]; env: Record<string, string> } {
  const angle = process.env.HEADLESS_ANGLE
  if (angle === 'swiftshader') return { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], env: {} }
  if (angle) return { args: ['--use-gl=angle', `--use-angle=${angle}`], env: {} }
  if (process.platform !== 'linux') return { args: [], env: {} }
  // Linux では EGL 経由で Mesa などの GL ドライバに描かせる。GPU が無くても llvmpipe になり、SwiftShader より速い。
  // llvmpipe は Chromium のブロックリストに載っていて、外さないと WebGL を作れない。
  // WSL（/dev/dxg がある）では、指定しないと Mesa が llvmpipe を選ぶので、Windows の GPU につながる d3d12 を選ばせる
  return {
    args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'],
    env: existsSync('/dev/dxg') ? { GALLIUM_DRIVER: 'd3d12' } : {},
  }
}

export function launchHeadless(options: LaunchOptions = {}): Promise<Browser> {
  const { args, env } = rendererArgs()
  // フル版の chrome（chromium-*/chrome-linux64）は WSL の d3d12 だとシェーダーのリンクに失敗するので、headless shell を優先する
  return chromium.launch({
    executablePath: findHeadlessShell(),
    ...options,
    env: { ...env, ...process.env, ...options.env },
    args: [...args, ...(options.args ?? [])],
  })
}

/** ページの WebGL がどの GPU で描いているか。SwiftShader や llvmpipe なら CPU 描画 */
export function rendererOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return 'WebGL2 なし'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
  })
}

export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE_RENDERERS.some((name) => renderer.includes(name))
}

/** requestAnimationFrame が 1 秒に何回呼ばれるか */
export function measureFps(page: Page, ms = 2000): Promise<number> {
  // tsx は関数の中で名前を付けた関数に __name() を差し込むが、ブラウザ側には __name が無い。文字列で渡して避ける
  return page.evaluate(`new Promise((resolve) => {
    let frames = 0
    const start = performance.now()
    const tick = () => {
      frames++
      const elapsed = performance.now() - start
      if (elapsed < ${ms}) requestAnimationFrame(tick)
      else resolve((frames * 1000) / elapsed)
    }
    requestAnimationFrame(tick)
  })`)
}

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const mobile = process.argv.includes('--mobile')
  const url = positional[0] ?? 'http://localhost:5173/?view=god'
  const out = positional[1] ?? 'headless.png'

  const browser = await launchHeadless()
  try {
    const page = await browser.newPage(
      mobile
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 720 } },
    )
    page.on('console', (m) => {
      if (m.type() === 'error') console.log(`[console.error] ${m.text()}`)
    })
    page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))
    await page.goto(url)
    await page.waitForSelector('canvas')
    await page.waitForTimeout(2000)
    const renderer = await rendererOf(page)
    const fps = await measureFps(page)
    await page.screenshot({ path: out })
    console.log(`renderer: ${renderer}`)
    console.log(`fps: ${fps.toFixed(1)}`)
    console.log(`screenshot: ${out}`)
    if (isSoftwareRenderer(renderer)) console.log('警告: CPU で描いている。開発ノートの「ヘッドレスでの動作確認」を見る')
  } finally {
    await browser.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
