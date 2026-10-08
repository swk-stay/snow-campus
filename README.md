# snow-campus_poc

消えた大学の校舎を、積もった雪で建て直すブラウザゲームのPoC。

- Stack: TypeScript + Vite + Three.js (+ lil-gui)
- 対応: PC / スマホ縦持ち
- 将来: Colyseus によるルーム制オンライン協力、glTF 3Dモデルへの差し替え

設計・進捗・引き継ぎ情報は [開発ノート.md](./開発ノート.md) を参照。

## 開発

```sh
npm install
npm run dev        # http://localhost:5173
                   # ?view=god で展示用の神視点
```

## 操作

- PC: WASD / 矢印キーで移動
- スマホ: 画面のどこでもドラッグで仮想スティック
- 近くの雪は自動で回収、建物まわりの枠に入ると自動で投げ込む
