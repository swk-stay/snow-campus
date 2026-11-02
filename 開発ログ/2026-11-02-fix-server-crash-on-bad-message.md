# 2026-11-02

- サーバーが落ちる実装を洗い出して直した（`server/campusRoom.ts`）。
  - `room.send('pos')` のようにペイロード無し・`null` で送ると、ハンドラが `m.x` などを読んで TypeError になり、プロセスごと止まっていた。`buy` に `id: 'constructor'` を送った場合も、`m.id in UPGRADES` がプロトタイプのキーで true になり、`maxLevel` で止まっていた。`skill` に `id: 'toString'` を送ると止まりはしないが、`cooldowns.toString = NaN` が全員に配信されていた。
  - ハンドラはペイロードが無ければ何もしないようにし、id は `Object.hasOwn` で調べる。
  - `onUncaughtException` を定義した。Colyseus 0.18 はこれが無いと、メッセージのハンドラと `setSimulationInterval`・`clock.setInterval` のコールバックを try で包まずに登録するので、例外が ws の `message` リスナーや素の `setInterval` から投げられてプロセスが終わる。定義すると、例外はログに出るだけになる。
  - 落ちないと分かったところ：参加時の `options` の例外は `onCreate` / `onAuth` / `onJoin` のどれでも Colyseus がその参加のエラーとして返す。`pos` の極端な座標は `field.clamp` で雪原に戻され、雪原の走査範囲も配列の中に切られている。
  - 検証：`npx tsc -p server --noEmit`、`npx eslint server` を通した。サーバーを立てて SDK から上の 5 通りを送り、修正前は 4 通りで止まること、修正後はどれも止まらず、ふつうの `pos` と `buy` が反映されることを確かめた。わざと例外を投げるメッセージを足したルームで、`onUncaughtException` がログに出してサーバーが動き続けることも確かめた。
- 次にやること：人数の上限は `onAuth` で数え、プレイヤーは `onJoin` で増えるので、同時に参加されると 8 人を少し超えることがある（落ちはしない）。
