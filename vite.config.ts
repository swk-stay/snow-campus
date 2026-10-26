import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/snow-campus/' : '/',
  // ゲームのバージョン（package.json の version）。タイムアタックの記録に残す。手で上げず、パッチノート.md の書き方に従って断片を足す
  define: { __GAME_VERSION__: JSON.stringify(pkg.version) },
  build: {
    // ゲーム本編と、リクエストを置く Editor（editor.html）の 2 ページ
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        editor: fileURLToPath(new URL('editor.html', import.meta.url)),
      },
    },
  },
}))
