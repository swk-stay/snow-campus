import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/snow-campus/' : '/',
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
