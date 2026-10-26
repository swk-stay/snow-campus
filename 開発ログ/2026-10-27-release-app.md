# 2026-10-27

- main を PR 必須にしたいが、`deploy.yml` の `release` ジョブはパッチノートをまとめたコミットを main に直接 push する。Ruleset の Bypass には特定のワークフローを指定できないので、リリース用の GitHub App を作り、その App だけを Bypass に入れる方針にした。
  - Deploy key も Bypass にできるが、期限のない書き込み鍵が Secrets に置かれ続けるので、1 時間で切れるトークンを都度発行できる App にした。
- `release` ジョブは `actions/create-github-app-token` で App のトークンを発行し、checkout と push に使う。コミットの作者は `<App の slug>[bot]`。
- App の秘密鍵（`RELEASE_APP_ID` / `RELEASE_APP_PRIVATE_KEY`）は、リポジトリの Secrets ではなく Environment `push-to-main` に置いた。main 以外のブランチでワークフローを書き換えても鍵を取り出せないようにするため。main は PR を通らないと入れないので、PR 必須がそのまま鍵を守る。
- `GITHUB_TOKEN` と違い、App のトークンでの push はワークフローを起動する。そのため、リリースのコミットを push した実行ではビルドとデプロイを飛ばし、push で起動した次の実行に任せる（次の実行には断片が残っていないので、何も push せずにデプロイする）。
- 次にやること：この変更が main に入ったら、Ruleset `main` に「PR 必須」を足し、Bypass にこの App だけを入れる。Environment `push-to-main` のデプロイできるブランチを「Protected branches only」から「Selected branches → main」に変える（Ruleset を足したブランチから鍵を使えないように）。
- 検証：YAML の構文チェックだけ。Actions 上での実行は、マージ後に未確認。
