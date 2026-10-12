// ゲームの調整用パラメータ。将来 lil-gui から直接書き換える想定なので、ミュータブルなオブジェクトで持つ。

export const WORLD = {
  /** 雪原の一辺 (m)。原点中心 */
  size: 90,
  /** 雪原セルの分解能（一辺のセル数）。サーバー同期の単位にもなる想定 */
  fieldRes: 320,
  /** セル量 1.0 のときの雪の高さ (m) */
  snowMaxHeight: 0.6,
}

export const PLAYER = {
  speed: 6,
  bodyRadius: 0.45,
  /** 自動回収の半径 (m)。スコップ系アップグレードで伸びる想定 */
  collectRadius: 2.5,
  /** 自動回収の扇形の角度（度）。向いている方向を中心に、この角度の範囲だけ削る。180 = 前方の半円 */
  collectArc: 180,
  /** 中心での1秒あたりの削り量（セルの雪の量 0..1 に対する割合） */
  collectRate: 0.8,
  /** 背負える雪の上限 */
  capacity: 80,
  /** 寄付ゾーン内で雪玉を投げる間隔 (s) */
  throwInterval: 0.07,
  /** 雪玉1個あたりの雪の量 */
  throwChunk: 4,
}

export type BuildingDef = {
  id: string
  label: string
  x: number
  z: number
  width: number
  depth: number
  height: number
  /** 完成に必要な雪の量 */
  required: number
  /** 建物の外周からこの距離以内が寄付ゾーン */
  dropRange: number
  /** 実写真に差し替える場合のパス（public/ 配下）。未指定ならプレースホルダーを生成する */
  photos: { front?: string; side?: string }
}

const b = (id: string, label: string, x: number, z: number, width: number, depth: number, height: number, required: number): BuildingDef => ({
  id, label, x, z, width, depth, height, required, dropRange: 3, photos: {},
})

/** 建てる順番に並べる。前の建物が完成すると次が解放される */
export const BUILDINGS: BuildingDef[] = [
  b('main', '第一校舎', 0, -14, 14, 6, 9, 900),
  b('library', '図書館', 18, 10, 9, 7, 7, 1400),
  b('hall', '講堂', -20, 12, 11, 9, 8, 2000),
  b('lab', '研究棟', -24, -24, 8, 14, 12, 2800),
  b('gym', '体育館', 26, -24, 14, 10, 7, 3600),
  b('tower', '時計台', 0, 30, 6, 6, 18, 5000),
]

export const ECONOMY = {
  /** 雪1単位を寄付したときにもらえるゴールド */
  goldPerSnow: 1,
}

export type UpgradeId = 'shovel' | 'power' | 'backpack' | 'throwing' | 'plow' | 'snowMachine' | 'cooldown'

export type UpgradeDef = {
  label: string
  description: string
  baseCost: number
  /** 価格 = baseCost × growth^level */
  growth: number
  /** Tier（完成した建物の数）ごとの最大レベル。配列を超えた Tier は最後の値 */
  maxLevel: number[]
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  shovel: { label: 'スコップ', description: '回収半径 アップ', baseCost: 30, growth: 1.5, maxLevel: [3, 5, 7, 9, 11, 13, 15] },
  power: { label: '腕力', description: '雪を削る速さ アップ', baseCost: 30, growth: 1.5, maxLevel: [3, 5, 7, 9, 11, 13, 15] },
  backpack: { label: 'リュック', description: '持てる雪 +50%', baseCost: 25, growth: 1.45, maxLevel: [3, 5, 7, 9, 11, 13, 15] },
  throwing: { label: '雪玉投げ', description: '建物へ投げ込む速さ アップ', baseCost: 40, growth: 1.5, maxLevel: [3, 5, 7, 9, 11, 13, 15] },
  plow: { label: '自動除雪機', description: '雪を集めて勝手に寄付', baseCost: 120, growth: 1.8, maxLevel: [1, 2, 3, 4, 5, 6, 8] },
  snowMachine: { label: '降雪機', description: '周りに雪を降らせる', baseCost: 80, growth: 1.6, maxLevel: [2, 3, 4, 5, 6, 7, 8] },
  cooldown: { label: 'クールダウン短縮', description: 'スキルの待ち時間 ダウン', baseCost: 150, growth: 1.6, maxLevel: [1, 2, 3, 4, 5, 6, 8] },
}

/** アップグレードの効果量。lil-gui から調整できるようにまとめて持つ */
export const UPGRADE_EFFECT = {
  shovelRadiusPerLevel: 0.2,
  powerRatePerLevel: 0.25,
  backpackCapacityPerLevel: 0.5,
  /** 雪玉投げ：1個あたりの量 ×(1 + chunk×Lv)、投げる間隔 ÷(1 + interval×Lv) */
  throwChunkPerLevel: 0.5,
  throwIntervalPerLevel: 0.15,
  plow: { speed: 3.2, radius: 1.6, rate: 0.9, capacity: 30, deliverChunk: 10 },
  snowMachine: { radius: 5, rate: 0.12 },
  /** クールダウン短縮：待ち時間 ÷(1 + cooldownPerLevel×Lv) */
  cooldownPerLevel: 0.12,
}

// ---- スキル ----
// 通常スキル3つ＋必殺技1つ。アイテム（スキルの書）を買うと使えるようになる。
// それぞれ独立したクールダウンを持ち、アップグレード「クールダウン短縮」で短くなる。

export type SkillId = 'dash' | 'boost' | 'longThrow' | 'blizzard'

export type SkillDef = {
  label: string
  description: string
  /** KeyboardEvent.code */
  key: string
  keyLabel: string
  /** クールダウン（秒） */
  cooldown: number
  ultimate: boolean
}

export const SKILLS: Record<SkillId, SkillDef> = {
  dash: { label: 'ダッシュ', description: '向いている方向へ素早く飛び出す', key: 'Space', keyLabel: 'Space', cooldown: 3, ultimate: false },
  boost: { label: 'ブースト', description: 'しばらく移動速度アップ', key: 'KeyQ', keyLabel: 'Q', cooldown: 25, ultimate: false },
  longThrow: { label: '遠投', description: '持っている雪をどこからでも建物へ投げ込む', key: 'KeyR', keyLabel: 'R', cooldown: 30, ultimate: false },
  blizzard: { label: 'ブリザード', description: '周囲の雪を根こそぎ建物へ送り込む', key: 'KeyF', keyLabel: 'F', cooldown: 120, ultimate: true },
}

export const SKILL_EFFECT = {
  dashSpeed: 26,
  dashTime: 0.22,
  boostSpeedMult: 1.7,
  boostTime: 6,
  /** 遠投・ブリザードで飛ばす雪玉の最大個数（演出用に分割する数） */
  volleyCount: 12,
  blizzardRadius: 14,
}

// ---- レア雪 ----
// アイテム「レア雪レーダー」を買うと雪原に現れる。普通の雪とは別枠で持てて（所持上限なし）、建物への貢献が大きい。

export const RARE = {
  /** 1個あたりの建物への貢献（普通の雪の量に換算） */
  value: 60,
  spawnInterval: 12,
  maxOnField: 4,
}

// ---- アイテム ----
// 一度買えばずっと有効な解禁型。建物の完成数（Tier）や累計で集めた雪の量で、ショップに並ぶ。

export type ItemId = 'rareRadar' | SkillId

export type ItemDef = {
  label: string
  description: string
  cost: number
  unlock: { tier?: number; collected?: number }
}

export const ITEMS: Record<ItemId, ItemDef> = {
  dash: { label: 'ダッシュの書', description: 'スキル「ダッシュ」を覚える', cost: 80, unlock: { collected: 300 } },
  rareRadar: { label: 'レア雪レーダー', description: '光るレア雪が雪原に現れる（1個で雪60ぶん）', cost: 250, unlock: { tier: 1 } },
  boost: { label: 'ブーストの書', description: 'スキル「ブースト」を覚える', cost: 200, unlock: { tier: 1, collected: 1500 } },
  longThrow: { label: '遠投の書', description: 'スキル「遠投」を覚える', cost: 600, unlock: { tier: 2 } },
  blizzard: { label: 'ブリザードの書', description: '必殺技「ブリザード」を覚える', cost: 1500, unlock: { tier: 3 } },
}

/** 降雪機の設置場所（購入順） */
export const SNOW_MACHINE_SPOTS = [
  { x: -10, z: -2 },
  { x: 10, z: -4 },
  { x: 0, z: 18 },
  { x: -36, z: 0 },
  { x: 36, z: 4 },
  { x: -16, z: 36 },
  { x: 16, z: 36 },
  { x: -6, z: -36 },
]

/** 演出パラメータ（sim には影響しない） */
export const FX = {
  /** 雪1単位あたりに湧かせる、すくい上げる雪の粒の数 */
  scoopPerSnow: 2.5,
  /** 完成時のカラー化にかかる秒数 */
  colorizeSeconds: 2.5,
}
