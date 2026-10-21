import { BUILDINGS, ECONOMY, ITEMS, PLAYER, RARE, SKILL_EFFECT, SKILLS, SNOW_MACHINE, UPGRADE_EFFECT, UPGRADES, type ItemId, type SkillId, type UpgradeId } from './config'

// バランス調整画面（?balance）で触れる値の一覧。config のオブジェクトを直接読み書きする。
// 初期値（config.ts に書いてある値）との差分を localStorage に保存し、config.ts へ書き戻すためのテキストにもする。

export type TuneValue = number | number[] | undefined

export type Tunable = {
  /** config.ts 上の場所。保存と差分のキー */
  path: string
  label: string
  group: string
  step: number
  get(): TuneValue
  set(v: TuneValue): void
}

const KEY = 'snow-campus-balance'

function prop<T extends object>(group: string, obj: T, path: string, key: keyof T & string, label: string, step: number): Tunable {
  const o = obj as Record<string, TuneValue>
  return {
    path: `${path}.${key}`,
    label,
    group,
    step,
    get: () => o[key],
    set: (v) => {
      // 省略できる項目（アイテムの解禁条件）は空欄で消す
      if (v === undefined) delete o[key]
      else o[key] = v
    },
  }
}

const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[]
const ITEM_IDS = Object.keys(ITEMS) as ItemId[]
const SKILL_IDS = Object.keys(SKILLS) as SkillId[]

export const TUNABLES: Tunable[] = [
  prop('プレイヤー', PLAYER, 'PLAYER', 'speed', '移動速度 (m/s)', 0.5),
  prop('プレイヤー', PLAYER, 'PLAYER', 'collectRadius', '回収半径 (m)', 0.1),
  prop('プレイヤー', PLAYER, 'PLAYER', 'collectArc', '回収の角度（度）', 10),
  prop('プレイヤー', PLAYER, 'PLAYER', 'collectRate', '削る速さ', 0.05),
  prop('プレイヤー', PLAYER, 'PLAYER', 'capacity', '所持上限', 10),
  prop('プレイヤー', PLAYER, 'PLAYER', 'throwInterval', '投げる間隔 (s)', 0.01),
  prop('プレイヤー', PLAYER, 'PLAYER', 'throwChunk', '雪玉1個の量', 0.5),

  prop('経済', ECONOMY, 'ECONOMY', 'goldPerSnow', '雪1あたりのG', 0.1),
  prop('経済', ECONOMY, 'ECONOMY', 'costScale', '価格の倍率', 0.05),
  prop('経済', ECONOMY, 'ECONOMY', 'requiredScale', '必要量の倍率', 0.05),

  ...BUILDINGS.map((b) => prop('建物', b, `BUILDINGS.${b.id}`, 'required', b.label, 50)),
  ...BUILDINGS.filter((b) => b.reward?.speed).map((b) => prop('建物', b.reward!, `BUILDINGS.${b.id}.reward`, 'speed', `${b.label}: 完成で移動速度 ×`, 0.05)),

  ...UPGRADE_IDS.flatMap((id) => [
    prop('アップグレード', UPGRADES[id], `UPGRADES.${id}`, 'baseCost', `${UPGRADES[id].label}: 基本価格`, 5),
    prop('アップグレード', UPGRADES[id], `UPGRADES.${id}`, 'growth', `${UPGRADES[id].label}: 価格の伸び`, 0.05),
    prop('アップグレード', UPGRADES[id], `UPGRADES.${id}`, 'maxLevel', `${UPGRADES[id].label}: Tierごとの上限`, 1),
  ]),

  prop('アップグレードの効果', UPGRADE_EFFECT, 'UPGRADE_EFFECT', 'shovelRadiusPerLevel', 'スコップ: 半径/Lv', 0.05),
  prop('アップグレードの効果', UPGRADE_EFFECT, 'UPGRADE_EFFECT', 'shovelRatePerLevel', 'スコップ: 速さ/Lv', 0.05),
  prop('アップグレードの効果', UPGRADE_EFFECT, 'UPGRADE_EFFECT', 'shovelRateMaxLevel', 'スコップ: 速さが伸びるLvまで', 1),
  prop('アップグレードの効果', UPGRADE_EFFECT, 'UPGRADE_EFFECT', 'backpackCapacityPerLevel', 'リュック: 容量/Lv', 0.1),
  prop('アップグレードの効果', UPGRADE_EFFECT, 'UPGRADE_EFFECT', 'throwChunkPerLevel', '雪玉投げ: 量/Lv', 0.05),
  prop('アップグレードの効果', UPGRADE_EFFECT, 'UPGRADE_EFFECT', 'throwIntervalPerLevel', '雪玉投げ: 間隔短縮/Lv', 0.05),
  prop('アップグレードの効果', UPGRADE_EFFECT, 'UPGRADE_EFFECT', 'cooldownPerLevel', 'CD短縮: /Lv', 0.02),
  prop('アップグレードの効果', UPGRADE_EFFECT.plow, 'UPGRADE_EFFECT.plow', 'speed', '除雪機: 移動速度', 0.1),
  prop('アップグレードの効果', UPGRADE_EFFECT.plow, 'UPGRADE_EFFECT.plow', 'radius', '除雪機: 半径', 0.1),
  prop('アップグレードの効果', UPGRADE_EFFECT.plow, 'UPGRADE_EFFECT.plow', 'rate', '除雪機: 削る速さ', 0.05),
  prop('アップグレードの効果', UPGRADE_EFFECT.plow, 'UPGRADE_EFFECT.plow', 'capacity', '除雪機: 積載量', 5),
  prop('アップグレードの効果', UPGRADE_EFFECT.plow, 'UPGRADE_EFFECT.plow', 'deliverChunk', '除雪機: 1回に投げる量', 1),
  prop('降雪機（建物の完成ごとに1台）', SNOW_MACHINE, 'SNOW_MACHINE', 'radius', '降雪機: 半径', 0.5),
  prop('降雪機（建物の完成ごとに1台）', SNOW_MACHINE, 'SNOW_MACHINE', 'rate', '降雪機: 降雪量', 0.01),

  ...ITEM_IDS.flatMap((id) => [
    prop('アイテム', ITEMS[id], `ITEMS.${id}`, 'cost', `${ITEMS[id].label}: 価格`, 10),
    prop('アイテム', ITEMS[id].unlock, `ITEMS.${id}.unlock`, 'tier', `${ITEMS[id].label}: 解禁Tier`, 1),
    prop('アイテム', ITEMS[id].unlock, `ITEMS.${id}.unlock`, 'collected', `${ITEMS[id].label}: 解禁の累計`, 50),
  ]),

  ...SKILL_IDS.map((id) => prop('スキル', SKILLS[id], `SKILLS.${id}`, 'cooldown', `${SKILLS[id].label}: CD (s)`, 0.5)),
  prop('スキル', SKILL_EFFECT, 'SKILL_EFFECT', 'dashSpeed', 'ダッシュ: 速度', 1),
  prop('スキル', SKILL_EFFECT, 'SKILL_EFFECT', 'dashTime', 'ダッシュ: 秒数', 0.02),
  prop('スキル', SKILL_EFFECT, 'SKILL_EFFECT', 'boostSpeedMult', 'ブースト: 倍率', 0.1),
  prop('スキル', SKILL_EFFECT, 'SKILL_EFFECT', 'boostTime', 'ブースト: 秒数', 0.5),
  prop('スキル', SKILL_EFFECT, 'SKILL_EFFECT', 'blizzardRadius', 'ブリザード: 半径', 1),

  prop('レア雪', RARE, 'RARE', 'value', '1個の価値', 5),
  prop('レア雪', RARE, 'RARE', 'spawnInterval', '湧く間隔 (s)', 1),
  prop('レア雪', RARE, 'RARE', 'maxOnField', '同時に湧く最大数', 1),
]

export const TUNABLE = new Map(TUNABLES.map((t) => [t.path, t]))

function encode(v: TuneValue): string {
  return v === undefined ? 'null' : JSON.stringify(v)
}

function decode(text: string): TuneValue {
  return (JSON.parse(text) as TuneValue | null) ?? undefined
}

/** config.ts に書いてある値。モジュールの読み込み時点（上書き前）に記録する */
const DEFAULTS = new Map(TUNABLES.map((t) => [t.path, encode(t.get())]))

export function isChanged(t: Tunable): boolean {
  return encode(t.get()) !== DEFAULTS.get(t.path)
}

export function resetTunable(t: Tunable) {
  t.set(decode(DEFAULTS.get(t.path)!))
}

/** 保存してある調整値を config に反映する。createGame より前に呼ぶ（建物の必要量に効くため） */
export function loadTuning() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, TuneValue | null>
    for (const [path, v] of Object.entries(saved)) TUNABLE.get(path)?.set(v ?? undefined)
  } catch {
    // 壊れていたら初期値のまま
  }
}

/** 初期値から変わっている値だけを保存する。保存した内容が前回と同じなら何もしない */
let lastSaved = ''
export function saveTuning() {
  const changed = Object.fromEntries(TUNABLES.filter(isChanged).map((t) => [t.path, t.get() ?? null]))
  const text = JSON.stringify(changed)
  if (text === lastSaved) return
  lastSaved = text
  try {
    if (Object.keys(changed).length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, text)
  } catch {
    // 保存できなくても調整はできる
  }
}

export function resetTuning() {
  for (const t of TUNABLES) resetTunable(t)
  saveTuning()
}

/** config.ts へ書き戻すための差分テキスト */
export function diffText(): string {
  const lines = TUNABLES.filter(isChanged).map(
    (t) => `${t.path}: ${DEFAULTS.get(t.path)!.replaceAll(',', ', ')} → ${encode(t.get()).replaceAll(',', ', ')}  // ${t.label}`,
  )
  return lines.length ? lines.join('\n') : ''
}
