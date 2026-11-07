// マルチプレイで選べるプレイヤーのスキン（issue #87）。サーバーも ID の確認に読むので、Three.js と DOM に依存させない。
// kind がモデルの種類。'jacket' は同じモデルの上着の色違い、それ以外はキャラクターごとのモデル（PlayerView で kind ごとに組み立てる）。

/**
 * color：ミニマップの点やプレイヤー一覧に出す代表色（jacket では上着の色）
 * swatch：タイトル画面の見本の CSS の background（省略すると color の単色）
 */
export type Skin = { id: string; label: string; kind: 'jacket' | 'cureAnswer' | 'cureMistique' | 'shinozawaHiro'; color: number; swatch?: string }

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
  // 「名探偵プリキュア！」のキュアアンサー（issue #105）。見本は髪の色（薄紫から毛先のピンク）
  { id: 'cure-answer', label: 'キュアアンサー', kind: 'cureAnswer', color: 0xc58be8, swatch: 'linear-gradient(160deg, #dba6f2 45%, #f28fb8)' },
  // 同じくキュアミスティック。見本は髪の色（ピンクから毛先の薄紫）
  { id: 'cure-mistique', label: 'キュアミスティック', kind: 'cureMistique', color: 0xf47fb4, swatch: 'linear-gradient(160deg, #f47fb4 45%, #d7a2f0)' },
  // 「学園アイドルマスター」の篠澤広。見本は髪の色（灰色がかったベージュから暗い毛先）
  { id: 'shinozawa-hiro', label: '篠澤広', kind: 'shinozawaHiro', color: 0xcfc0a6, swatch: 'linear-gradient(160deg, #ddd2bf 45%, #8a7e76)' },
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
