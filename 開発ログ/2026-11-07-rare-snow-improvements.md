# 2026-11-07

- レア雪を 3 点改善した。
  - **リキャスト**：拾ったとき `recastSkills`（`sim/game.ts`）で、覚えているスキルの残りクールダウンを `RARE.recast`（通常スキル、1 ＝ 即リキャスト）・`RARE.recastUltimate`（必殺技、0.25）の割合だけ戻す。ブリザードまで全部戻すと 6 秒ごとに撃てて強すぎるので、必殺技だけ割合を分けた。`rarePickup` イベントに `recast`（戻ったスキルがあったか）を足し、トーストを「レア雪ゲット！ スキルリキャスト！」にする。スキルボタンは CD が 0 になった瞬間に元から光る（`ready-flash`）ので、そのまま使う。
  - **ドロップ率**：`spawnInterval` 12 → 6 秒、`maxOnField` 4 → 8。
  - **寿命**：`RareCrystal` に `life`（残り秒数）を足し、`stepWorld` の `expireRares` で減らして 0 で消す（`rareExpire` イベントで小さく光らせる）。残り `blinkTime` 秒から結晶（`rareView.ts`）とミニマップの点が点滅・縮小する。`life` は `WorldSync.rares` にそのまま乗る。`life` を送ってこない古いサーバーにつないでも消えないよう、`rareFading` は `life` が無ければ点滅しない扱いにした。
  - 調整画面（`?balance`・`?debug`）に `lifetime`・`recast`・`recastUltimate`（`?debug` は `maxOnField` も）を足した。
- `tsc`（端末・サーバー）と eslint は通った。ヘッドレス（`launchHeadless()`、AMD Radeon の radeonsi で GPU 描画）のソロで確かめた：
  - 湧き：ゲーム内時間で 6 秒ごとに 1 個ずつ湧き、8 個で止まる。
  - リキャスト：CD（ダッシュ 2・ブースト 20・遠投 25・ブリザード 100 秒）の状態で拾うと、通常スキルは 0、ブリザードは約 75 秒になり、トーストが「スキルリキャスト！」になる。CD が全部 0 なら普通の「レア雪ゲット！」。
  - 寿命：life 4 秒の結晶が約 4 秒で消え、その間に点滅して縮む（scale 0.79 → 0.6）。life が多い結晶は点滅しない。
  - 湧く間隔 6 秒 × 8 個 ＝ 48 秒に対して寿命が 45 秒なので、誰も拾わないと 8 個目が湧くころに最初の 1 個が消え、場には 7〜8 個が残り続ける。
  - マルチプレイ（サーバー経由で life が届くか）はヘッドレスでは見ていない。
- **GPU のある Linux**（Arch・AMD Radeon（renoir）・Mesa）で `launchHeadless()` の既定のまま radeonsi で描けたので、開発ノートの環境ごとの補足の「（未確認）」を外した。
