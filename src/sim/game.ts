// ゲームロジック本体。Three.js に依存しない純粋な TS にしておき、
// 将来はこのまま Colyseus の Room（サーバー権威）へ移植する想定。

import { BUILDINGS, PLAYER, WORLD, type BuildingDef } from '../config'
import { SnowField } from './field'

export type Building = BuildingDef & {
  deposited: number
  completed: boolean
}

export type Player = {
  x: number
  z: number
  /** 向き（ラジアン、+Z 方向が 0） */
  facing: number
  carried: number
  capacity: number
  throwCooldown: number
}

export type GameState = {
  field: SnowField
  player: Player
  buildings: Building[]
}

/** ワールド座標系 (XZ) の移動入力。長さ 1 以下 */
export type MoveInput = { x: number; z: number }

/** 描画・演出側へ通知するイベント。オンライン化後はサーバーから配信する単位にもなる */
export type GameEvent =
  | { type: 'collect'; amount: number }
  | { type: 'throw'; buildingId: string; amount: number }
  | { type: 'complete'; buildingId: string }

export function createGame(): GameState {
  const field = new SnowField(WORLD.fieldRes, WORLD.size)
  const half = WORLD.size / 2
  field.fill((x, z) => {
    // 吹きだまり風のうねり。外周は描画側の外側の雪面に合わせて 0.75 へ寄せる
    const drift = 0.65 + 0.2 * Math.sin(x * 0.3) * Math.cos(z * 0.25) + 0.15 * Math.sin(x * 0.11 + z * 0.17)
    const edge = Math.max(Math.abs(x), Math.abs(z)) / half
    const t = Math.min(1, Math.max(0, (edge - 0.85) / 0.15))
    return drift * (1 - t) + 0.75 * t
  })

  const buildings = BUILDINGS.map((def) => ({ ...def, deposited: 0, completed: false }))
  for (const b of buildings) {
    // 建物の敷地と寄付ゾーンは雪をどけておく
    field.clearRect(
      b.x - b.width / 2 - b.dropRange,
      b.z - b.depth / 2 - b.dropRange,
      b.x + b.width / 2 + b.dropRange,
      b.z + b.depth / 2 + b.dropRange,
    )
  }

  return {
    field,
    player: { x: 0, z: 6, facing: Math.PI, carried: 0, capacity: PLAYER.capacity, throwCooldown: 0 },
    buildings,
  }
}

/** 建物の外周（矩形）からの距離 */
export function distanceToBuilding(b: Building, x: number, z: number): number {
  const dx = Math.max(Math.abs(x - b.x) - b.width / 2, 0)
  const dz = Math.max(Math.abs(z - b.z) - b.depth / 2, 0)
  return Math.hypot(dx, dz)
}

export function stepGame(s: GameState, input: MoveInput, dt: number): GameEvent[] {
  const events: GameEvent[] = []
  const p = s.player

  movePlayer(s, input, dt)

  const collected = s.field.collect(p.x, p.z, PLAYER.collectRadius, PLAYER.collectRate, dt, p.capacity - p.carried)
  if (collected > 0) {
    p.carried += collected
    events.push({ type: 'collect', amount: collected })
  }

  p.throwCooldown = Math.max(0, p.throwCooldown - dt)
  for (const b of s.buildings) {
    if (b.completed || distanceToBuilding(b, p.x, p.z) > b.dropRange) continue
    while (p.carried > 0.01 && p.throwCooldown <= 0 && !b.completed) {
      const amount = Math.min(PLAYER.throwChunk, p.carried, b.required - b.deposited)
      p.carried -= amount
      if (p.carried < 0.01) p.carried = 0
      b.deposited += amount
      p.throwCooldown += PLAYER.throwInterval
      events.push({ type: 'throw', buildingId: b.id, amount })
      if (b.deposited >= b.required - 1e-6) {
        b.completed = true
        events.push({ type: 'complete', buildingId: b.id })
      }
    }
  }

  return events
}

function movePlayer(s: GameState, input: MoveInput, dt: number) {
  const p = s.player
  const len = Math.hypot(input.x, input.z)
  if (len > 0.01) {
    const k = Math.min(len, 1) / len
    p.x += input.x * k * PLAYER.speed * dt
    p.z += input.z * k * PLAYER.speed * dt
    p.facing = Math.atan2(input.x, input.z)
  }

  const limit = s.field.size / 2 - 1
  p.x = Math.min(limit, Math.max(-limit, p.x))
  p.z = Math.min(limit, Math.max(-limit, p.z))

  // 建物（未完成でも敷地）との当たり判定：めり込みの浅い軸へ押し出す
  for (const b of s.buildings) {
    const hw = b.width / 2 + PLAYER.bodyRadius
    const hd = b.depth / 2 + PLAYER.bodyRadius
    const dx = p.x - b.x
    const dz = p.z - b.z
    if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue
    if (hw - Math.abs(dx) < hd - Math.abs(dz)) p.x = b.x + Math.sign(dx || 1) * hw
    else p.z = b.z + Math.sign(dz || 1) * hd
  }
}
