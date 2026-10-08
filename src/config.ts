// ゲームの調整用パラメータ。将来 lil-gui から直接書き換える想定なので、ミュータブルなオブジェクトで持つ。

export const WORLD = {
  /** 雪原の一辺 (m)。原点中心 */
  size: 60,
  /** 雪原セルの分解能（一辺のセル数）。サーバー同期の単位にもなる想定 */
  fieldRes: 256,
  /** セル量 1.0 のときの雪の高さ (m) */
  snowMaxHeight: 0.6,
}

export const PLAYER = {
  speed: 6,
  bodyRadius: 0.45,
  /** 自動回収の半径 (m)。スコップ系アップグレードで伸びる想定 */
  collectRadius: 2.5,
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

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'main',
    label: '第一校舎',
    x: 0,
    z: -12,
    width: 14,
    depth: 6,
    height: 9,
    required: 900,
    dropRange: 3,
    photos: {},
  },
  {
    id: 'library',
    label: '図書館',
    x: 15,
    z: 13,
    width: 9,
    depth: 7,
    height: 7,
    required: 1400,
    dropRange: 3,
    photos: {},
  },
]

export const ECONOMY = {
  /** 雪1単位を寄付したときにもらえるゴールド */
  goldPerSnow: 1,
}

export type UpgradeId = 'shovel' | 'backpack' | 'plow' | 'snowMachine'

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
  shovel: { label: 'スコップ', description: '回収半径と速さ アップ', baseCost: 30, growth: 1.5, maxLevel: [3, 6, 10] },
  backpack: { label: 'リュック', description: '持てる雪 +50%', baseCost: 25, growth: 1.45, maxLevel: [3, 6, 10] },
  plow: { label: '自動除雪機', description: '雪を集めて勝手に寄付', baseCost: 120, growth: 1.8, maxLevel: [1, 3, 5] },
  snowMachine: { label: '降雪機', description: '周りに雪を降らせる', baseCost: 80, growth: 1.6, maxLevel: [2, 4, 6] },
}

/** アップグレードの効果量。lil-gui から調整できるようにまとめて持つ */
export const UPGRADE_EFFECT = {
  shovelRadiusPerLevel: 0.2,
  shovelRatePerLevel: 0.25,
  backpackCapacityPerLevel: 0.5,
  plow: { speed: 3.2, radius: 1.6, rate: 0.9, capacity: 30, deliverChunk: 10 },
  snowMachine: { radius: 5, rate: 0.12 },
}

/** 降雪機の設置場所（購入順） */
export const SNOW_MACHINE_SPOTS = [
  { x: -18, z: 8 },
  { x: 18, z: -6 },
  { x: -20, z: -18 },
  { x: -4, z: 20 },
  { x: 22, z: 24 },
  { x: -22, z: 22 },
]

/** 演出パラメータ（sim には影響しない） */
export const FX = {
  /** 雪1単位あたりに湧かせる吸い込みの粒の数 */
  suctionPerSnow: 2.5,
  /** 完成時のカラー化にかかる秒数 */
  colorizeSeconds: 2.5,
}
