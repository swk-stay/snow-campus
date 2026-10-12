// ゲームの調整用パラメータ。将来 lil-gui から直接書き換える想定なので、ミュータブルなオブジェクトで持つ。

export const WORLD = {
  /** 雪原の一辺 (m)。原点中心。神奈川工科大学の中庭まわりを実寸で収める */
  size: 224,
  /** 雪原セルの分解能（一辺のセル数）。サーバー同期の単位にもなる想定（1 セル約 0.47m） */
  fieldRes: 480,
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
  /** 敷地（外接矩形）の中心と寸法。当たり判定・寄付ゾーン・雪をどける範囲に使う */
  x: number
  z: number
  width: number
  depth: number
  height: number
  /** 完成に必要な雪の量 */
  required: number
  /** 建物の外周からこの距離以内が寄付ゾーン */
  dropRange: number
}

const b = (id: string, label: string, x: number, z: number, width: number, depth: number, height: number, required: number): BuildingDef => ({
  id, label, x, z, width, depth, height, required, dropRange: 3,
})

// ---- キャンパス（神奈川工科大学・中央緑地公園のまわり） ----
// 座標は実寸 (m)。OpenStreetMap の建物の外形を、棟の向きに合わせて 5.1° 回して軸にそろえたもの。
// 公式キャンパスマップと同じ向きにするため、+X が南、+Z が西（＝正門・バス停の側）。
// 見下ろし視点では画面の上が東（KAIT工房の側）、下が西（バス停の側）になる。
// 高さは OSM の height（PLATEAU 由来）。形と外観は render/buildings/ のモデルで作る。

/** 建てる順番に並べる。前の建物が完成すると次が解放される。中庭から始めて、最後は一番高い K1号館 */
export const BUILDINGS: BuildingDef[] = [
  b('d2', '先進技術研究所', 38.2, -12.2, 27.0, 31.0, 8.3, 900),
  b('d1', 'KAIT工房', -31.8, -72.0, 44.1, 46.6, 5.0, 1400),
  b('c1', '附属図書館', -83.8, -11.5, 34.4, 47.9, 17.4, 2000),
  b('d3', 'D3号館', -70.4, -73.8, 15.5, 41.1, 27.5, 2600),
  b('k2', 'K2号館', -25.2, 44.0, 34.8, 53.8, 19.2, 3200),
  b('c6', 'C6号館', -76.3, 52.7, 49.2, 44.1, 28.8, 3800),
  b('b5', 'B5号館', 38.3, -76.4, 26.0, 62.3, 18.9, 4400),
  b('k4', 'K4号館', 81.0, -20.8, 27.1, 46.7, 22.5, 5000),
  b('k3', 'K3号館', 82.3, 37.6, 36.9, 54.5, 32.3, 6000),
  b('k1', 'K1号館', 35.8, 35.0, 36.1, 35.7, 54.0, 8000),
]

/** プレイヤーの初期位置：K3号館の西側、構内バス停の前（東を向いて中庭のほうを見る） */
export const PLAYER_START = { x: 97, z: 70, facing: Math.PI }

export const ECONOMY = {
  /** 雪1単位を寄付したときにもらえるゴールド */
  goldPerSnow: 1,
  /** 価格の全体倍率（アップグレード・アイテム）。個別の価格はそのままで、まとめて上げ下げする */
  costScale: 1,
  /** 建物の完成に必要な雪の全体倍率（BUILDINGS[].required に掛ける） */
  requiredScale: 1,
}

export type UpgradeId = 'shovel' | 'power' | 'backpack' | 'throwing' | 'plow' | 'cooldown'

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

/** 演出パラメータ（sim には影響しない） */
export const FX = {
  /** 雪1単位あたりに湧かせる、すくい上げる雪の粒の数 */
  scoopPerSnow: 2.5,
  /** 完成時のカラー化にかかる秒数 */
  colorizeSeconds: 2.5,
}

/** タイムアタック（?mode=timeattack）。セーブとは別に、最初から始めて建物の完成までのタイムを競う */
export const TIME_ATTACK = {
  /** ゴールまでに完成させる建物の数（BUILDINGS の先頭から）。学園祭で回転を早くしたいときは減らす */
  goal: BUILDINGS.length,
  /** スタート前のカウントダウン（秒） */
  countdown: 3,
  /** 端末に残す記録の件数 */
  keepRuns: 5,
}
