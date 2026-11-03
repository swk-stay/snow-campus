# 2026-11-03

- issue #111：ヘッドレスでの動作確認が遅い（fps が出ない）のを直した。`scripts/headless.ts` の `launchHeadless()` で、Linux なら EGL 経由で GL ドライバに描かせ、WSL ならさらに Mesa の d3d12 ドライバで Windows の GPU を使う。手順と環境ごとの注意点は開発ノートのセクション4に書いた。
  - WSL2（RTX 3080）の 1280×720、神視点（`?view=god`）で測った値：

    | 起動のしかた | renderer | fps | スクリーンショット 1 枚 |
    |---|---|---|---|
    | 従来（`--use-angle=swiftshader`） | SwiftShader | 0.9 | 11.6 秒 |
    | `--use-angle=gl-egl --ignore-gpu-blocklist` | llvmpipe | 3.9〜4.4 | 2.9 秒 |
    | 上に `GALLIUM_DRIVER=d3d12` を足す | D3D12 (RTX 3080) | 60（上限を外すと 150） | 0.12 秒 |

  - llvmpipe は `--ignore-gpu-blocklist` が無いと WebGL を作れない（`--enable-gpu` では足りない）。d3d12 には付けても影響が無かったので、Linux では常に付ける。
  - `DISPLAY` / `WAYLAND_DISPLAY` が無くても GPU で描けた。`--disable-gpu-sandbox` や `LD_LIBRARY_PATH=/usr/lib/wsl/lib` は要らなかった。`--use-angle=vulkan` は d3d12 を指定しても llvmpipe になった。
  - `playwright-core` を devDependencies に足した。ブラウザ本体は入らないので、`~/.cache/ms-playwright` にある headless shell を使う。
  - 確認：WSL で `npx tsx scripts/headless.ts` を動かし、神視点（PC 幅）と通常プレイ（スマホ縦）がどちらも D3D12 で 60fps 出て、スクリーンショットが従来の SwiftShader と同じ見た目になること。`GALLIUM_DRIVER=llvmpipe`（GPU の無い Linux と同じ選ばれ方）で llvmpipe になって警告が出ること、`HEADLESS_ANGLE=swiftshader` で SwiftShader に戻ること。`npx eslint scripts` が通ること。GPU のある Linux と Mac では未確認。
