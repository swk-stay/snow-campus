# 2026-11-02

- issue #103：サーバーを Docker で立てる `compose.yml` と `Dockerfile`、`.dockerignore` を足した。
  - 実行側は `gcr.io/distroless/nodejs24-debian13:nonroot`。依存は `node:24-trixie-slim` で `npm ci` してから node_modules だけ持ってくる（tsx の使う esbuild のバイナリが同じ Debian 13 の glibc で動くように）。
  - サーバーは `src/` を拡張子なしの import で読むので、`npm run server` と同じく tsx で動かす（`node --import tsx server/index.ts`）。tsx は devDependencies なので `--omit=dev` にはせず、vite や three も入る（イメージは 325MB ほど）。小さくするなら、サーバーを 1 ファイルにバンドルする手がある。
  - イメージには git も .git も無いので、`server/version.ts` はコミットが取れないとき環境変数 `SERVER_COMMIT` を使うようにした。compose の `GIT_COMMIT` からビルド引数で渡す。未コミットの変更（`-dirty`）はコンテナでは分からない。
  - `restart: unless-stopped`。ホストのポートは `PORT`（既定 2567）で変えられ、コンテナの中は 2567 のまま。
  - 検証：`docker compose up -d --build` で立て、`GET /rooms` と `@colyseus/sdk` からの joinOrCreate（welcome・tick・field が届く）を確かめた。起動時の表示は `snow-campus-server/0.3.2 (e260e06; node v24.22.2)`。ホストからプロセスを `kill -9` すると立ち上がり直し（RestartCount 1）、`docker compose stop` は 1 秒かからず止まる。ブラウザからの参加は未確認。
