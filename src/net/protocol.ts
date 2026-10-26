// マルチプレイのサーバー（server/）と端末（src/net/session.ts）の両方が読む、メッセージの形と雪原の差分の詰め方。
// Three.js と DOM に依存させない（サーバーの Node でもそのまま読むため）。

import type { ItemId, SkillId, UpgradeId } from '../config'
import type { SnowField } from '../sim/field'
import type { SkinId } from '../skins'
import type { GameEvent, Plow, RareCrystal, World } from '../sim/game'

export const ROOM_NAME = 'campus'
export const DEFAULT_PORT = 2567
export const MAX_PLAYERS = 8
/** 神視点で観戦できる端末の数。プレイヤーの枠とは別に数える */
export const MAX_SPECTATORS = 4

/**
 * ルーム一覧に出す情報（Colyseus のルームの metadata）。players は観戦の端末を数えない。
 * joinOrCreate は JoinOptions.roomName と同じ名前のキーを metadata から探すので、名前は roomName に入れる
 */
export type RoomMeta = { roomName: string; players: number; completed: number; total: number }

/** GET /rooms の応答の 1 行 */
export type RoomSummary = { roomId: string; name: string; players: number; maxPlayers: number; completed: number; total: number }

/** spectator：神視点で観戦する。プレイヤーとしては加わらず、受け取るだけ。skin は SKINS の id（知らない id ならサーバーが選ぶ） */
export type JoinOptions = { name?: string; skin?: string; roomName?: string; spectator?: boolean }

/** ルーム名をサーバーに保存する形にそろえる。joinOrCreate は完全一致で探すので、端末も送る前にこれを通す */
export function normalizeRoomName(name: string): string {
  return name.trim().slice(0, 24)
}

// ---- 端末 → サーバー ----

/** 自分の位置。端末が動かした結果をそのまま送る（協力プレイなので、サーバーは建物からの押し出しだけ確かめる） */
export type PosMessage = { x: number; z: number; facing: number }
export type BuyMessage = { kind: 'upgrade'; id: UpgradeId } | { kind: 'item'; id: ItemId }
export type SkillMessage = { id: SkillId }

// ---- サーバー → 端末 ----

export type PlayerSync = {
  id: string
  name: string
  skin: SkinId
  x: number
  z: number
  facing: number
  carried: number
  capacity: number
  rare: number
  boostTime: number
  dashTime: number
  cooldowns: Record<SkillId, number>
}

/** 雪原以外の共有状態。毎ティック全部送る（建物 27 棟・プレイヤー 8 人でも数 KB に収まる） */
export type WorldSync = {
  gold: number
  upgrades: Record<UpgradeId, number>
  items: Record<ItemId, boolean>
  tier: number
  totalCollected: number
  /** BUILDINGS の順 */
  deposited: number[]
  completed: boolean[]
  players: PlayerSync[]
  plows: Plow[]
  machines: { id: number; x: number; z: number }[]
  rares: RareCrystal[]
}

/** 誰の出来事か（null は除雪機・降雪機・建物の完成など、プレイヤーによらないもの） */
export type TaggedEvent = [playerId: string | null, event: GameEvent]

export type TickMessage = { world: WorldSync; events: TaggedEvent[] }

/** 参加直後に 1 回だけ送る。field は量子化した雪原を deflate したもの。観戦の端末の you は world.players に入っていない */
export type WelcomeMessage = { you: string; roomName: string; world: WorldSync; field: Uint8Array }

export type NoticeMessage = { text: string }

export function worldSync(w: World): WorldSync {
  return {
    gold: w.gold,
    upgrades: { ...w.upgrades },
    items: { ...w.items },
    tier: w.tier,
    totalCollected: w.totalCollected,
    deposited: w.buildings.map((b) => b.deposited),
    completed: w.buildings.map((b) => b.completed),
    players: w.players.map((p) => ({
      id: p.id,
      name: p.name,
      skin: p.skin,
      x: p.x,
      z: p.z,
      facing: p.facing,
      carried: p.carried,
      capacity: p.capacity,
      rare: p.rare,
      boostTime: p.boostTime,
      dashTime: p.dashTime,
      cooldowns: { ...p.cooldowns },
    })),
    plows: w.plows.map((p) => ({ ...p })),
    machines: w.machines.map((m) => ({ ...m })),
    rares: w.rares.map((r) => ({ ...r })),
  }
}

// ---- 雪原の差分 ----
// 雪原は 880×880 セルあるので、TILE×TILE のタイルに区切り、8bit に量子化した値が変わったタイルだけ送る。
// 形式：[タイル番号 u16 LE][TILE×TILE バイト] の繰り返し（雪原の端のタイルも TILE×TILE で詰め、はみ出した分は読み飛ばす）

export const TILE = 16

export function tilesPerSide(field: SnowField): number {
  return Math.ceil(field.res / TILE)
}

export function quantize(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

/**
 * 量子化した値が sent から変わったタイルを詰めて返し、sent を更新する。変わったタイルが無ければ null。
 * 走査するのは field.dirtyRect の範囲だけで、走査したら dirty を下ろす（サーバーには描画が無く、ほかに dirty を使う処理が無いため）
 */
export function encodeFieldPatch(field: SnowField, sent: Uint8Array): Uint8Array | null {
  if (!field.dirty) return null
  const { res, data } = field
  const r = field.dirtyRect
  field.dirty = false
  const n = tilesPerSide(field)
  const chunks: Uint8Array[] = []
  for (let tj = Math.floor(r.j0 / TILE); tj <= Math.floor(r.j1 / TILE); tj++) {
    for (let ti = Math.floor(r.i0 / TILE); ti <= Math.floor(r.i1 / TILE); ti++) {
      let changed = false
      const out = new Uint8Array(2 + TILE * TILE)
      for (let y = 0; y < TILE; y++) {
        const j = tj * TILE + y
        if (j >= res) break
        for (let x = 0; x < TILE; x++) {
          const i = ti * TILE + x
          if (i >= res) break
          const k = j * res + i
          const q = quantize(data[k])
          out[2 + y * TILE + x] = q
          if (q !== sent[k]) {
            sent[k] = q
            changed = true
          }
        }
      }
      if (!changed) continue
      const index = tj * n + ti
      out[0] = index & 0xff
      out[1] = index >> 8
      chunks.push(out)
    }
  }
  if (chunks.length === 0) return null
  const all = new Uint8Array(chunks.length * (2 + TILE * TILE))
  chunks.forEach((c, k) => all.set(c, k * c.length))
  return all
}

export function applyFieldPatch(field: SnowField, patch: Uint8Array) {
  const { res, data } = field
  const n = tilesPerSide(field)
  const size = 2 + TILE * TILE
  for (let o = 0; o + size <= patch.length; o += size) {
    const index = patch[o] | (patch[o + 1] << 8)
    const ti = index % n
    const tj = Math.floor(index / n)
    for (let y = 0; y < TILE; y++) {
      const j = tj * TILE + y
      if (j >= res) break
      for (let x = 0; x < TILE; x++) {
        const i = ti * TILE + x
        if (i >= res) break
        data[j * res + i] = patch[o + 2 + y * TILE + x] / 255
      }
    }
    field.touch(ti * TILE, Math.min(res - 1, ti * TILE + TILE - 1), tj * TILE, Math.min(res - 1, tj * TILE + TILE - 1))
  }
}
