// ゲームロジック本体。Three.js に依存しない純粋な TS にしておき、
// 将来はこのまま Colyseus の Room（サーバー権威）へ移植する想定。

import {
  BUILDINGS,
  ECONOMY,
  PLAYER,
  SNOW_MACHINE_SPOTS,
  UPGRADE_EFFECT,
  UPGRADES,
  WORLD,
  type BuildingDef,
  type UpgradeId,
} from '../config'
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

/** 自動除雪機。雪の多い場所へ移動して削り、一定量たまるたびに建物へ投げ込む */
export type Plow = {
  id: number
  x: number
  z: number
  facing: number
  load: number
  targetX: number
  targetZ: number
  /** 目標を選び直すまでの残り時間 */
  retarget: number
}

export type SnowMachine = { id: number; x: number; z: number }

export type Stats = { collectRadius: number; collectRate: number; capacity: number; throwChunk: number; throwInterval: number }

export type GameState = {
  field: SnowField
  player: Player
  buildings: Building[]
  /** ルーム共有の財布（オンライン化後もこの形のまま共有する想定） */
  gold: number
  upgrades: Record<UpgradeId, number>
  /** 完成した建物の数。アップグレードの上限を決める */
  tier: number
  plows: Plow[]
  machines: SnowMachine[]
}

/** ワールド座標系 (XZ) の移動入力。長さ 1 以下 */
export type MoveInput = { x: number; z: number }

/** 描画・演出側へ通知するイベント。オンライン化後はサーバーから配信する単位にもなる */
export type GameEvent =
  | { type: 'collect'; amount: number }
  /** from が無ければプレイヤーから、あれば除雪機から投げた */
  | { type: 'throw'; buildingId: string; amount: number; from?: { plowId: number } }
  | { type: 'gold'; amount: number }
  | { type: 'complete'; buildingId: string }
  | { type: 'upgrade'; id: UpgradeId; level: number }

export function createGame(): GameState {
  const field = new SnowField(WORLD.fieldRes, WORLD.size)
  const buildings = BUILDINGS.map((def) => ({ ...def, deposited: 0, completed: false }))
  for (const b of buildings) {
    // 建物の敷地と寄付ゾーンは雪をどけて、降雪機でも積もらないようにする
    field.blockRect(
      b.x - b.width / 2 - b.dropRange,
      b.z - b.depth / 2 - b.dropRange,
      b.x + b.width / 2 + b.dropRange,
      b.z + b.depth / 2 + b.dropRange,
    )
  }
  const s: GameState = {
    field,
    player: { x: 0, z: 6, facing: Math.PI, carried: 0, capacity: PLAYER.capacity, throwCooldown: 0 },
    buildings,
    gold: 0,
    upgrades: { shovel: 0, backpack: 0, throwing: 0, plow: 0, snowMachine: 0 },
    tier: 0,
    plows: [],
    machines: [],
  }
  refillField(s)
  return s
}

/** 雪原を初期状態の積雪に戻す */
export function refillField(s: GameState) {
  const half = WORLD.size / 2
  s.field.fill((x, z) => {
    // 吹きだまり風のうねり。外周は描画側の外側の雪面に合わせて 0.75 へ寄せる
    const drift = 0.65 + 0.2 * Math.sin(x * 0.3) * Math.cos(z * 0.25) + 0.15 * Math.sin(x * 0.11 + z * 0.17)
    const edge = Math.max(Math.abs(x), Math.abs(z)) / half
    const t = Math.min(1, Math.max(0, (edge - 0.85) / 0.15))
    return drift * (1 - t) + 0.75 * t
  })
}

/** アップグレード込みのプレイヤー性能。PLAYER（基礎値）は書き換えない */
export function stats(s: GameState): Stats {
  const { shovel, backpack, throwing } = s.upgrades
  return {
    collectRadius: PLAYER.collectRadius * (1 + UPGRADE_EFFECT.shovelRadiusPerLevel * shovel),
    collectRate: PLAYER.collectRate * (1 + UPGRADE_EFFECT.shovelRatePerLevel * shovel),
    capacity: Math.round(PLAYER.capacity * (1 + UPGRADE_EFFECT.backpackCapacityPerLevel * backpack)),
    throwChunk: PLAYER.throwChunk * (1 + UPGRADE_EFFECT.throwChunkPerLevel * throwing),
    throwInterval: PLAYER.throwInterval / (1 + UPGRADE_EFFECT.throwIntervalPerLevel * throwing),
  }
}

export function maxLevel(s: GameState, id: UpgradeId): number {
  const table = UPGRADES[id].maxLevel
  return table[Math.min(s.tier, table.length - 1)]
}

export function upgradeCost(s: GameState, id: UpgradeId): number {
  const def = UPGRADES[id]
  return Math.round(def.baseCost * def.growth ** s.upgrades[id])
}

export type PurchaseCheck = 'ok' | 'max' | 'gold'

export function canBuy(s: GameState, id: UpgradeId): PurchaseCheck {
  if (s.upgrades[id] >= maxLevel(s, id)) return 'max'
  if (s.gold < upgradeCost(s, id)) return 'gold'
  return 'ok'
}

/** 購入処理。オンライン化後はクライアントからの "buy" メッセージでサーバーが呼ぶ */
export function buyUpgrade(s: GameState, id: UpgradeId): GameEvent[] {
  if (canBuy(s, id) !== 'ok') return []
  s.gold -= upgradeCost(s, id)
  const level = ++s.upgrades[id]
  syncOwnedUnits(s)
  return [{ type: 'upgrade', id, level }]
}

let unitSeq = 0

/** アップグレードのレベルと、除雪機・降雪機の台数を一致させる（GUI からレベルを直接いじった場合にも使う） */
export function syncOwnedUnits(s: GameState) {
  while (s.plows.length < s.upgrades.plow) {
    const p = s.player
    s.plows.push({ id: unitSeq++, x: p.x + 1, z: p.z + 1, facing: 0, load: 0, targetX: p.x, targetZ: p.z, retarget: 0 })
  }
  s.plows.length = Math.min(s.plows.length, s.upgrades.plow)
  const spots = Math.min(s.upgrades.snowMachine, SNOW_MACHINE_SPOTS.length)
  while (s.machines.length < spots) {
    const spot = SNOW_MACHINE_SPOTS[s.machines.length]
    s.machines.push({ id: unitSeq++, x: spot.x, z: spot.z })
  }
  s.machines.length = spots
}

/** いま建てている建物（BUILDINGS の順で最初の未完成）。全部完成していれば null */
export function currentBuilding(s: GameState): Building | null {
  return s.buildings.find((b) => !b.completed) ?? null
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
  const st = stats(s)
  p.capacity = st.capacity

  movePlayer(s, input, dt)

  const collected = s.field.collect(p.x, p.z, st.collectRadius, st.collectRate, dt, p.capacity - p.carried)
  if (collected > 0) {
    p.carried += collected
    events.push({ type: 'collect', amount: collected })
  }

  p.throwCooldown = Math.max(0, p.throwCooldown - dt)
  // 寄付できるのは解放済み（＝いま建てている）建物だけ
  const b = currentBuilding(s)
  if (b && distanceToBuilding(b, p.x, p.z) <= b.dropRange) {
    while (p.carried > 0.01 && p.throwCooldown <= 0 && !b.completed) {
      const amount = Math.min(st.throwChunk, p.carried, b.required - b.deposited)
      p.carried -= amount
      if (p.carried < 0.01) p.carried = 0
      p.throwCooldown += st.throwInterval
      deposit(s, b, amount, events)
    }
  }

  for (const plow of s.plows) stepPlow(s, plow, dt, events)
  for (const m of s.machines) s.field.add(m.x, m.z, UPGRADE_EFFECT.snowMachine.radius, UPGRADE_EFFECT.snowMachine.rate, dt)

  return events
}

function deposit(s: GameState, b: Building, amount: number, events: GameEvent[], from?: { plowId: number }) {
  b.deposited += amount
  const gold = amount * ECONOMY.goldPerSnow
  s.gold += gold
  events.push({ type: 'throw', buildingId: b.id, amount, from }, { type: 'gold', amount: gold })
  if (b.deposited >= b.required - 1e-6) {
    b.completed = true
    s.tier = s.buildings.filter((x) => x.completed).length
    events.push({ type: 'complete', buildingId: b.id })
  }
}

function stepPlow(s: GameState, plow: Plow, dt: number, events: GameEvent[]) {
  const fx = UPGRADE_EFFECT.plow
  const target = currentBuilding(s)
  // 全部完成していたら仕事がないので止まる
  if (!target) return

  // 雪の多い場所をいくつかランダムに見比べて目標にする
  plow.retarget -= dt
  const reached = Math.hypot(plow.targetX - plow.x, plow.targetZ - plow.z) < 0.5
  if (plow.retarget <= 0 || reached || s.field.amountAt(plow.targetX, plow.targetZ) < 0.05) {
    const limit = s.field.size / 2 - 2
    let best = -1
    for (let n = 0; n < 16; n++) {
      const x = (Math.random() * 2 - 1) * limit
      const z = (Math.random() * 2 - 1) * limit
      const score = s.field.amountAt(x, z) - Math.hypot(x - plow.x, z - plow.z) * 0.01
      if (score > best) {
        best = score
        plow.targetX = x
        plow.targetZ = z
      }
    }
    plow.retarget = 4
  }

  const dx = plow.targetX - plow.x
  const dz = plow.targetZ - plow.z
  const len = Math.hypot(dx, dz)
  if (len > 0.01) {
    const step = Math.min(len, fx.speed * dt)
    plow.x += (dx / len) * step
    plow.z += (dz / len) * step
    plow.facing = Math.atan2(dx, dz)
  }
  pushOutOfBuildings(s, plow, 0.8)

  plow.load += s.field.collect(plow.x, plow.z, fx.radius, fx.rate, dt, fx.capacity - plow.load)
  if (plow.load >= fx.deliverChunk) {
    const amount = Math.min(fx.deliverChunk, target.required - target.deposited)
    plow.load -= amount
    deposit(s, target, amount, events, { plowId: plow.id })
  }
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
  pushOutOfBuildings(s, p, PLAYER.bodyRadius)
}

/** 雪原の外と建物（未完成でも敷地）から押し出す。建物はめり込みの浅い軸へ */
function pushOutOfBuildings(s: GameState, o: { x: number; z: number }, radius: number) {
  const limit = s.field.size / 2 - 1
  o.x = Math.min(limit, Math.max(-limit, o.x))
  o.z = Math.min(limit, Math.max(-limit, o.z))
  for (const b of s.buildings) {
    const hw = b.width / 2 + radius
    const hd = b.depth / 2 + radius
    const dx = o.x - b.x
    const dz = o.z - b.z
    if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue
    if (hw - Math.abs(dx) < hd - Math.abs(dz)) o.x = b.x + Math.sign(dx || 1) * hw
    else o.z = b.z + Math.sign(dz || 1) * hd
  }
}
