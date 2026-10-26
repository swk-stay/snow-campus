// ゲームの調整用パラメータ。将来 lil-gui から直接書き換える想定なので、ミュータブルなオブジェクトで持つ。

export const WORLD = {
  /** 雪原の一辺 (m)。神奈川工科大学のキャンパス全体（南北約 340m・東西約 450m）を実寸で収める */
  size: 460,
  /** 雪原の中心。原点（中庭の南西寄り）からキャンパスの中心へずらしている */
  centerX: 0,
  centerZ: -120,
  /** 雪原セルの分解能（一辺のセル数）。サーバー同期の単位にもなる想定（1 セル約 0.52m） */
  fieldRes: 880,
  /** セル量 1.0 のときの雪の高さ (m) */
  snowMaxHeight: 0.6,
  /** 最初に積もっている雪の量の平均（セル量 0..1）。吹きだまりのうねりで ±0.35 ほど増減し、1 を超えたぶんは切り捨てる */
  snowDepth: 0.65,
}

export const PLAYER = {
  speed: 7,
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
  /** 完成したときのごほうび（降雪機はどの建物でも 1 台ずつ届く） */
  reward?: BuildingReward
}

export type BuildingReward = {
  /** 移動速度の倍率（複数あれば掛け合わせる） */
  speed?: number
  /** レア雪が雪原に現れるようになる */
  rare?: boolean
}

const b = (id: string, label: string, x: number, z: number, width: number, depth: number, height: number, required: number, reward?: BuildingReward): BuildingDef => ({
  id, label, x, z, width, depth, height, required, dropRange: 3, reward,
})

// ---- キャンパス（神奈川工科大学の全体） ----
// 座標は実寸 (m)。OpenStreetMap の建物の外形を、棟の向きに合わせて 5.1° 回して軸にそろえたもの。
// 公式キャンパスマップと同じ向きにするため、+X が南、+Z が西（＝正門・バス停の側）。
// 見下ろし視点では画面の上が東（グラウンドの側）、下が西（バス停の側）になる。原点は中央緑地公園（中庭）の南西寄り。
// 高さは OSM の height（PLATEAU 由来）。形と外観は render/buildings/ のモデルで作る。
// KAIT ERIM は OSM に無いので、公式キャンパスマップの位置関係から置き場所を推定した。
// E7号館はテニスコートの南に平行な細長い棟。Google マップの航空写真（ユーザー提供）で、テニスコート（OSM の外形）を
// 物差しにして測った：長さ約 57m・奥行き約 14m、西の端はコートの西の端の 4m ほど東、南の縁は野球場の外野の手前。

// HEMS認証支援センターは OSM の外形だと西の構内道路に 1m ほどはみ出すので、1.3m 西へずらしている。

/**
 * 建てる順番に並べる。前の建物が完成すると次が解放される。
 * 最初はスタート地点に近い正門の守衛所（小さいのでチュートリアル代わり。完成すると移動速度が上がる）。
 * 次に中庭から始めて、西（C 系統）→ 北東（E 系統・グラウンド側）→ 南（A 系統）と広げ、最後は中庭に戻って K 系統。
 * 一番高い K1号館が締めくくり。小さい棟（C7・E7 など）は途中の息抜きとして必要量を少なめにしている
 */
export const BUILDINGS: BuildingDef[] = [
  // 守衛所の寸法は、かまぼこ屋根の庇（長さ 8m・幅 5.2m）を含めたもの
  b('guard', '守衛所', 43, 65.6, 8.0, 5.2, 4.6, 300, { speed: 1.3 }),
  b('d2', '先進技術研究所', 38.2, -12.2, 27.0, 31.0, 8.3, 900, { rare: true }),
  b('d1', 'KAIT工房', -31.8, -72.0, 44.1, 46.6, 5.0, 1400),
  b('c1', '附属図書館', -83.8, -11.5, 34.4, 47.9, 17.4, 2000),
  b('town', 'KAIT TOWN', -95.8, -73.2, 16.7, 37.1, 8.9, 2200),
  b('d3', 'D3号館', -70.4, -73.8, 15.5, 41.1, 27.5, 2600),
  b('k2', 'K2号館', -25.2, 44.0, 34.8, 53.8, 19.2, 3200),
  b('c7', 'HEMS認証支援センター', -93.7, 87.2, 11.2, 8.4, 6.8, 2400),
  b('c6', 'C6号館', -76.3, 52.7, 49.2, 44.1, 28.8, 3800),
  b('c5', 'C5号館', -136.1, 41.1, 34.6, 67.1, 13.8, 4200),
  b('c2', 'C2号館', -133.1, -47.8, 20.8, 89.2, 26.8, 4800),
  b('plaza', 'KAIT広場', -10.8, -143.8, 88.9, 55.5, 3.0, 5000),
  b('e6', 'E6号館', -153.0, -136.8, 24.4, 61.8, 7.6, 4400),
  b('e3', 'E3号館', -121.4, -119.1, 18.3, 27.6, 13.7, 5000),
  b('e4', 'E4号館', -121.3, -156.2, 18.3, 28.1, 19.1, 5600),
  b('e1', 'E1号館', -92.6, -125.6, 17.3, 37.7, 25.0, 6200),
  b('e2', 'E2号館', -92.2, -167.0, 17.3, 37.8, 25.0, 6800),
  b('erim', 'KAIT ERIM', -152.0, -250.0, 30.0, 50.0, 11.0, 6000),
  b('e7', 'E7号館', -75.0, -253.5, 13.3, 57.0, 8.0, 5600),
  b('b5', 'B5号館', 38.3, -76.4, 26.0, 62.3, 18.9, 7400),
  b('a2', '第1体育館', 80.5, -72.3, 32.6, 32.5, 10.7, 7000),
  b('a3', 'クラブハウス', 123.6, -89.0, 47.5, 21.9, 8.0, 6800),
  b('a5', '幾徳会館', 112.6, -37.2, 27.8, 61.8, 10.4, 7800),
  b('a6', 'KAIT HALL', 112.2, 42.0, 18.0, 37.2, 12.5, 8400),
  b('a1', 'KAITアリーナ', 104.2, -129.2, 87.9, 39.1, 18.0, 10000),
  b('k4', 'K4号館', 81.0, -20.8, 27.1, 46.7, 22.5, 10000),
  b('k3', 'K3号館', 82.3, 37.6, 36.9, 54.5, 32.3, 12000),
  b('k1', 'K1号館', 35.8, 35.0, 36.1, 35.7, 54.0, 15000),
]

/**
 * 建て直しの対象ではないが、中に入れない建物（景色として置く小さな棟や屋根付きの機械置き場）。
 * 当たり判定と、雪を積もらせない範囲に使う。見た目は render/scenery.ts
 */
export type Obstacle = { label: string; x0: number; z0: number; x1: number; z1: number }

export const OBSTACLES: Obstacle[] = [
  // 旧第三食堂（OSM の外形の外接矩形）
  { label: '旧第三食堂', x0: 1.2, z0: -93.0, x1: 11.6, z1: -77.6 },
  // クラブハウスの東の、屋根付きの洗濯機と自販機の置き場（OSM の小さな 2 棟）
  { label: '自販機', x0: 119.4, z0: -99.0, x1: 120.8, z1: -94.2 },
  { label: '洗濯機', x0: 122.0, z0: -98.8, x1: 123.4, z1: -94.2 },
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

export type UpgradeId = 'shovel' | 'backpack' | 'throwing' | 'plow' | 'cooldown'

export type UpgradeDef = {
  label: string
  description: string
  baseCost: number
  /** 価格 = baseCost × growth^level */
  growth: number
  /** Tier（完成した建物の数）ごとの最大レベル。配列を超えた Tier は最後の値 */
  maxLevel: number[]
}

/**
 * Tier ごとの最大レベルの表。head のあとは every 棟ごとに +1 して、最後の建物（全 27 棟）まで伸ばす。
 * キャンパス全体にして建物が増えたので、後半の大きい棟に向けてアップグレードを続けられるようにしている
 */
function maxLevels(head: number[], every: number): number[] {
  return Array.from({ length: BUILDINGS.length + 1 }, (_, t) =>
    t < head.length ? head[t] : head[head.length - 1] + Math.floor((t - head.length + 1) / every),
  )
}

// 先頭の Tier 0 と 1 は同じ上限（守衛所はチュートリアル代わりで、ごほうびは移動速度なので上限は上げない）
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  shovel: { label: 'スコップ', description: '回収半径・削る速さ アップ', baseCost: 45, growth: 1.5, maxLevel: maxLevels([3, 3, 5, 7, 9, 11, 13, 15], 2) },
  backpack: { label: 'リュック', description: '持てる雪 +50%', baseCost: 25, growth: 1.45, maxLevel: maxLevels([3, 3, 5, 7, 9, 11, 13, 15], 2) },
  throwing: { label: '雪玉投げ', description: '建物へ投げ込む速さ アップ', baseCost: 40, growth: 1.5, maxLevel: maxLevels([3, 3, 5, 7, 9, 11, 13, 15], 2) },
  plow: { label: '自動除雪機', description: '雪を集めて勝手に寄付', baseCost: 120, growth: 1.8, maxLevel: maxLevels([1, 1, 2, 3, 4, 5, 6, 8], 3) },
  cooldown: { label: 'クールダウン短縮', description: 'スキルの待ち時間 ダウン', baseCost: 150, growth: 1.6, maxLevel: maxLevels([1, 1, 2, 3, 4, 5, 6, 8], 3) },
}

/** アップグレードの効果量。lil-gui から調整できるようにまとめて持つ */
export const UPGRADE_EFFECT = {
  /** スコップ：回収半径 ×(1 + radius×Lv)、削る速さ ×(1 + rate×min(Lv, rateMaxLevel)) */
  shovelRadiusPerLevel: 0.2,
  shovelRatePerLevel: 0.25,
  /**
   * 削る速さが伸びるのはこのレベルまで。それ以上削る速さを上げても、移動速度に対して雪を削り切ってしまうので意味が薄い
   * （以前の「腕力」がそうなっていた）。3〜4 棟目あたりで届く
   */
  shovelRateMaxLevel: 8,
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
  boostSpeedMult: 1.5,
  boostTime: 6,
  /** 遠投・ブリザードで飛ばす雪玉の最大個数（演出用に分割する数） */
  volleyCount: 12,
  blizzardRadius: 14,
}

/**
 * 降雪機（issue #22）。買うものではなく、建物が完成するたびにその建物の前（中庭側、入口から少し離れた所）に 1 台ずつ置かれる。
 * 置き場所は sim/game.ts の machineSpot で建物の外形から決める
 */
export const SNOW_MACHINE = {
  radius: 5,
  rate: 0.12,
  /** 建物の外壁から降雪機の中心までの距離 (m)。寄付ゾーン（dropRange）＋降らせる半径より外に置く */
  offset: 10,
  /** 中庭（中央緑地公園）の中心。建物のどちら側に置くかの目安 */
  towardX: 2,
  towardZ: -13,
}

// ---- レア雪 ----
// 先進技術研究所（reward.rare の建物）が完成すると雪原に現れる。普通の雪とは別枠で持てて（所持上限なし）、建物への貢献が大きい。

export const RARE = {
  /** 1個あたりの建物への貢献（普通の雪の量に換算） */
  value: 60,
  spawnInterval: 12,
  maxOnField: 4,
}

// ---- アイテム ----
// 一度買えばずっと有効な解禁型。建物の完成数（Tier）や累計で集めた雪の量で、ショップに並ぶ。

export type ItemId = SkillId

export type ItemDef = {
  label: string
  description: string
  cost: number
  unlock: { tier?: number; collected?: number }
}

export const ITEMS: Record<ItemId, ItemDef> = {
  dash: { label: 'ダッシュの書', description: 'スキル「ダッシュ」を覚える', cost: 80, unlock: { collected: 300 } },
  boost: { label: 'ブーストの書', description: 'スキル「ブースト」を覚える', cost: 200, unlock: { tier: 2, collected: 1500 } },
  longThrow: { label: '遠投の書', description: 'スキル「遠投」を覚える', cost: 600, unlock: { tier: 3 } },
  blizzard: { label: 'ブリザードの書', description: '必殺技「ブリザード」を覚える', cost: 1500, unlock: { tier: 4 } },
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
  /** コースの名前。記録の保存先を分けるのに使う */
  course: 'campus',
  /** スタート前のカウントダウン（秒） */
  countdown: 3,
  /** 端末に残す記録の件数 */
  keepRuns: 5,
}

/**
 * タイムアタックの「中庭」コース（issue #56）。キャンパス全体に広げる前（11d692e より前）と同じ範囲で遊ぶ。
 * 一周が短く、建物の順番と必要量も固定なので、バランス調整の基準のタイムとして使う。
 * 建物は id → 必要量。並びが建てる順番。D3・C6・K4号館は外し、そのぶんの必要量をほかの棟に配っている（issue #68）
 */
const COURTYARD = {
  course: 'courtyard',
  world: { size: 224, centerX: 0, centerZ: 0, fieldRes: 480, snowDepth: 0.8 },
  buildings: { guard: 300, d2: 1300, d1: 2000, c1: 2900, k2: 4600, b5: 6300, k3: 8600, k1: 11500 } as Record<string, number>,
  /** Tier ごとの最大レベル（守衛所＋7 棟ぶん。配列を超えた Tier は最後の値） */
  maxLevel: {
    shovel: [3, 3, 5, 7, 9, 11, 13, 15],
    backpack: [3, 3, 5, 7, 9, 11, 13, 15],
    throwing: [3, 3, 5, 7, 9, 11, 13, 15],
    plow: [1, 1, 2, 3, 4, 5, 6, 8],
    cooldown: [1, 1, 2, 3, 4, 5, 6, 8],
  } as Record<UpgradeId, number[]>,
}

/**
 * config を「中庭」コースに書き換える。ほかのモジュールは config をその場で読むので、createGame や描画を作るより前に呼ぶ
 * （loadTuning と同じ）。範囲外の建物は建て直しの対象から外れ、景色にも出ない
 */
export function useCourtyardCourse() {
  Object.assign(WORLD, COURTYARD.world)
  const kept = Object.entries(COURTYARD.buildings).map(([id, required]) => ({ ...BUILDINGS.find((b) => b.id === id)!, required }))
  BUILDINGS.splice(0, BUILDINGS.length, ...kept)
  for (const id of Object.keys(UPGRADES) as UpgradeId[]) UPGRADES[id].maxLevel = COURTYARD.maxLevel[id]
  // 減らしてあればそのまま（学園祭で回転を早くする設定を消さない）
  TIME_ATTACK.goal = Math.min(TIME_ATTACK.goal, BUILDINGS.length)
  TIME_ATTACK.course = COURTYARD.course
}

/**
 * マルチプレイで、何番目に建てるかによらず必要量を決める棟。K1号館までの追い込みなので、
 * タイムアタックの B5 → K3 → K1号館と同じくらいの比（約 ×1.35）で盛る。K1号館の次の棟は少し下がる
 */
const MULTI_REQUIRED: Record<string, number> = { k3: 3600, k1: 4800 }

/**
 * マルチプレイの建てる順番（issue #92）。中庭コースの 8 棟をタイムアタックと同じ順で先に建て、残りの棟はそのあと通常の順で建てる。
 * 必要量は通常モードで同じ番目に建てる棟の値にする（MULTI_REQUIRED の棟を除く）。雪原は通常モードのまま。
 * サーバーと端末で並びがそろっていないといけないので、両方で createWorld より前に呼ぶ
 */
export function useMultiOrder() {
  const ids = Object.keys(COURTYARD.buildings)
  const rank = (id: string) => (ids.includes(id) ? ids.indexOf(id) : ids.length)
  const required = BUILDINGS.map((b) => b.required)
  BUILDINGS.sort((a, b) => rank(a.id) - rank(b.id))
  BUILDINGS.forEach((b, i) => (b.required = MULTI_REQUIRED[b.id] ?? required[i]))
}

/** マルチプレイで一区切りにする建物（中庭コースの最後の K1号館） */
export const MULTI_MILESTONE = Object.keys(COURTYARD.buildings).at(-1)!

/** 中庭コースの記録の保存先（コース名とゴールの建物 id）。useCourtyardCourse を呼ぶ前でも、呼んだ後の TIME_ATTACK と同じ値を返す */
export function courtyardRecord(): { course: string; goalIds: string[] } {
  const ids = Object.keys(COURTYARD.buildings)
  return { course: COURTYARD.course, goalIds: ids.slice(0, Math.min(TIME_ATTACK.goal, ids.length)) }
}
