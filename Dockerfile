# マルチプレイのサーバー（server/）を distroless の Node 24 で動かすイメージ（issue #103）。compose.yml から建てる。
# サーバーは src/sim などを拡張子なしの import のまま読むので、npm run server と同じく tsx で起動する

# esbuild（tsx が使う）のバイナリが実行側と同じ glibc で動くよう、distroless と同じ Debian 13 で入れる
FROM node:24-trixie-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# tsx は devDependencies にあるので、--omit=dev にはしない
RUN npm ci

FROM gcr.io/distroless/nodejs24-debian13:nonroot
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY src ./src

# イメージには .git が無いので、バージョン表示のコミットはビルド時に渡す（compose.yml の GIT_COMMIT）
ARG GIT_COMMIT
ENV SERVER_COMMIT=${GIT_COMMIT}
ENV PORT=2567
EXPOSE 2567

# ENTRYPOINT は node
CMD ["--import", "tsx", "server/index.ts"]
