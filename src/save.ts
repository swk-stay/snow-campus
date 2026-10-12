import { ITEMS, UPGRADES, type ItemId, type UpgradeId } from './config'
import { syncOwnedUnits, type GameState } from './sim/game'

// セーブ／ロード。いまは localStorage（端末ごと）。
// オンライン化後はルームの状態をサーバーが持つので、ここはソロプレイ用として残す想定。

// v2：マップを神奈川工科大学の実寸に作り替えた（建物 id・雪原の大きさが変わった）ので、旧セーブは読まない
const KEY = 'snow-campus-save-v2'

type SaveData = {
  v: 1
  savedAt: number
  gold: number
  upgrades: Partial<Record<UpgradeId, number>>
  /** 以下は後から追加した項目なので、古いセーブには無い */
  items?: Partial<Record<ItemId, boolean>>
  totalCollected?: number
  player: { x: number; z: number; carried: number; rare?: number }
  buildings: Record<string, { deposited: number; completed: boolean }>
  /** 雪原を 8bit に量子化して base64 にしたもの（480×480 で約 300KB） */
  field: { res: number; data: string }
}

function encodeField(data: Float32Array): string {
  const bytes = new Uint8Array(data.length)
  for (let k = 0; k < data.length; k++) bytes[k] = Math.round(Math.min(1, Math.max(0, data[k])) * 255)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function decodeField(b64: string, out: Float32Array): boolean {
  const bin = atob(b64)
  if (bin.length !== out.length) return false
  for (let k = 0; k < out.length; k++) out[k] = bin.charCodeAt(k) / 255
  return true
}

export function serialize(s: GameState): SaveData {
  return {
    v: 1,
    savedAt: Date.now(),
    gold: s.gold,
    upgrades: { ...s.upgrades },
    items: { ...s.items },
    totalCollected: s.totalCollected,
    player: { x: s.player.x, z: s.player.z, carried: s.player.carried, rare: s.player.rare },
    buildings: Object.fromEntries(s.buildings.map((b) => [b.id, { deposited: b.deposited, completed: b.completed }])),
    field: { res: s.field.res, data: encodeField(s.field.data) },
  }
}

/** セーブデータを state に適用する。建物や設定が変わっていても、読める部分だけ読む */
export function apply(s: GameState, d: SaveData) {
  s.gold = d.gold
  for (const id of Object.keys(UPGRADES) as UpgradeId[]) s.upgrades[id] = d.upgrades[id] ?? 0
  s.player.x = d.player.x
  s.player.z = d.player.z
  s.player.carried = d.player.carried
  s.player.rare = d.player.rare ?? 0
  for (const id of Object.keys(ITEMS) as ItemId[]) s.items[id] = d.items?.[id] ?? false
  s.totalCollected = d.totalCollected ?? 0
  for (const b of s.buildings) {
    const saved = d.buildings[b.id]
    if (!saved) continue
    b.deposited = Math.min(saved.deposited, b.required)
    b.completed = saved.completed || b.deposited >= b.required
  }
  s.tier = s.buildings.filter((b) => b.completed).length
  if (d.field.res === s.field.res && decodeField(d.field.data, s.field.data)) {
    // 建物まわりは積もらない設定なので、念のため 0 に戻す
    for (let k = 0; k < s.field.data.length; k++) if (s.field.blocked[k]) s.field.data[k] = 0
    s.field.dirty = true
  }
  syncOwnedUnits(s)
}

// localStorage はプライベートモードなどで例外を投げることがあるので、全部 try/catch で包む

export function saveToStorage(s: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(serialize(s)))
    return true
  } catch {
    return false
  }
}

export function loadFromStorage(s: GameState): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const d = JSON.parse(raw) as SaveData
    if (d.v !== 1) return false
    apply(s, d)
    return true
  } catch {
    return false
  }
}

export function clearStorage() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 消せなくても致命的ではない
  }
}
