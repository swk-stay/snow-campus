# 2026-11-03

- main で `npx tsc --noEmit`（`npm run build`）が通らなかったのを直した。
  - 空の時計（`main.ts` の `updateSky`）がマルチプレイで `session.playTime` を読んでいたが、#112 で `MultiSession` の `playTime` は `session.race.playTime`（`RaceSync`）に移っていた。#98 の空のブランチと #112 が別々に main に入り、マージでぶつかった。意味（ルームにプレイヤーがいた時間の合計）は同じなので、読む場所だけ変えた。
  - CI の Lint は eslint だけで型を見ないので、マージ時には気づけなかった。デプロイの `npm run build` で落ちるはずだったが、#113 のマージでは release ジョブが v0.4.0 を push しただけで build・deploy は skip され、リリースのコミット（`[skip ci]`）でも走っていないので、壊れたものは公開されていない。
