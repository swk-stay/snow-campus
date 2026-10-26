// マルチプレイで選べるプレイヤーのスキン（issue #87）。サーバーも ID の確認に読むので、Three.js と DOM に依存させない。
// いまは同じモデルの上着の色違いだけ。別のモデルを足すときは Skin に kind を増やし、PlayerView で kind ごとに組み立てる。

export type Skin = { id: string; label: string; kind: 'jacket'; color: number }

export const SKINS = [
  { id: 'red', label: '赤', kind: 'jacket', color: 0xd9443a },
  { id: 'orange', label: 'オレンジ', kind: 'jacket', color: 0xe8862a },
  { id: 'yellow', label: '黄色', kind: 'jacket', color: 0xe6c234 },
  { id: 'green', label: '緑', kind: 'jacket', color: 0x2fa65a },
  { id: 'blue', label: '青', kind: 'jacket', color: 0x2f5fd0 },
  { id: 'cyan', label: '水色', kind: 'jacket', color: 0x5cc4e8 },
  { id: 'purple', label: '紫', kind: 'jacket', color: 0x9b4fd1 },
  { id: 'white', label: '白', kind: 'jacket', color: 0xf2f2f0 },
  { id: 'black', label: '黒', kind: 'jacket', color: 0x2a2b30 },
] as const satisfies readonly Skin[]

export type SkinId = (typeof SKINS)[number]['id']

/** ソロと、スキンを送ってこない端末の見た目 */
export const DEFAULT_SKIN: SkinId = 'red'

export function isSkinId(id: unknown): id is SkinId {
  return SKINS.some((s) => s.id === id)
}

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]
}

export function randomSkinId(): SkinId {
  return SKINS[Math.floor(Math.random() * SKINS.length)].id
}
