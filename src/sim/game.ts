// ゲームロジック本体。Three.js に依存しない純粋な TS にしておき、
// 将来はこのまま Colyseus の Room（サーバー権威）へ移植する想定。

import {
  BUILDINGS,
  ECONOMY,
  ITEMS,
  OBSTACLES,
  PLAYER,
  PLAYER_START,
  RARE,
  SKILL_EFFECT,
  SKILLS,
  SNOW_MACHINE,
  UPGRADE_EFFECT,
  UPGRADES,
  WORLD,
  type BuildingDef,
  type ItemId,
  type SkillId,
  type UpgradeId,
} from '../config'
import { SnowField } from './field'
import { DEFAULT_SKIN, type SkinId } from '../skins'

export type Building = BuildingDef & {
  deposited: number
  completed: boolean
  /** 完成したら降雪機が置かれる場所 */
  machine: { x: number; z: number }
}

export type Player = {
  /** ソロでは 'local'、マルチプレイではサーバーの sessionId */
  id: string
  name: string
  /** 見た目（タイトル画面でプレイヤーが選ぶ。選ぶ前は DEFAULT_SKIN） */
  skin: SkinId
  x: number
  z: number
  /** 向き（ラジアン、+Z 方向が 0） */
  facing: number
  carried: number
  capacity: number
  throwCooldown: number
  /** 持っているレア雪の個数（所持上限なし） */
  rare: number
  /** ブーストの残り時間 */
  boostTime: number
  /** ダッシュの残り時間（この間は向いている方向へ高速移動） */
  dashTime: number
  /** スキルごとの残りクールダウン（秒） */
  cooldowns: Record<SkillId, number>
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

/** life：消えるまでの残り秒数 */
export type RareCrystal = { id: number; x: number; z: number; life: number }

/** ブリザードの竜巻。構えた向きへまっすぐ進み、通った跡の雪を削っては建物へ投げ込む */
export type Tornado = {
  id: number
  /** 放ったプレイヤーの id */
  owner: string
  x0: number
  z0: number
  dirX: number
  dirZ: number
  /** 進む距離（建物や雪原の端の手前で止まる） */
  length: number
  traveled: number
  /** 次に削る地点（スタートからの距離） */
  nextScrape: number
  /** 削ったが、まだ投げていない量 */
  load: number
  throwTimer: number
  /** 建物へ送った量の合計 */
  sent: number
}

/** ブリザードの吹雪。放った人のまわりに雪を積もらせる（人が見つからなければ放った場所に） */
export type Snowfall = { owner: string; x: number; z: number; time: number }

/** 竜巻の通り道。スキルのイベントで端末にも配り、端末はこれをもとに竜巻を描く */
export type TornadoPath = { x: number; z: number; dirX: number; dirZ: number; length: number }

export type Stats = {
  /** 移動速度（完成した建物のごほうび込み。ブーストは含まない） */
  moveSpeed: number
  collectRadius: number
  collectRate: number
  capacity: number
  throwChunk: number
  throwInterval: number
  /** スキルのクールダウン倍率（1 未満で短くなる） */
  cooldownMult: number
}

/** ルームで共有する状態。サーバーはこれを持ち、プレイヤーごとの状態は players に入る */
export type World = {
  field: SnowField
  players: Player[]
  buildings: Building[]
  /** ルーム共有の財布（オンライン化後もこの形のまま共有する想定） */
  gold: number
  upgrades: Record<UpgradeId, number>
  /** 購入済みのアイテム（解禁型なので所持しているかどうかだけ） */
  items: Record<ItemId, boolean>
  /** 完成した建物の数。アップグレードの上限を決める */
  tier: number
  /** 建物の必要量の倍率。マルチプレイでは遊んでいる人数（ソロは 1） */
  requiredMult: number
  /** プレイヤーが累計で集めた雪の量（アイテムの解禁条件） */
  totalCollected: number
  plows: Plow[]
  machines: SnowMachine[]
  rares: RareCrystal[]
  rareTimer: number
  /** 進んでいるブリザードの竜巻（保存も同期もしない。端末はスキルのイベントから描く） */
  tornadoes: Tornado[]
  /** ブリザードの吹雪（保存も同期もしない。積もった雪は雪原の差分で届く） */
  snowfalls: Snowfall[]
}

/** 端末側の状態。player は自分（players にも入っている） */
export type GameState = World & { player: Player }

/** ワールド座標系 (XZ) の移動入力。長さ 1 以下 */
export type MoveInput = { x: number; z: number }

/** 描画・演出側へ通知するイベント。オンライン化後はサーバーから配信する単位にもなる */
export type GameEvent =
  | { type: 'collect'; amount: number }
  /** from が無ければプレイヤーから、plowId なら除雪機から、tornado ならブリザードの竜巻（x, z はその時の位置）から投げた。rare はレア雪 */
  | { type: 'throw'; buildingId: string; amount: number; from?: ThrowSource; rare?: boolean }
  | { type: 'gold'; amount: number }
  | { type: 'complete'; buildingId: string }
  | { type: 'upgrade'; id: UpgradeId; level: number }
  | { type: 'item'; id: ItemId }
  /** tornado：ブリザードの竜巻の通り道 */
  | { type: 'skill'; id: SkillId; amount?: number; tornado?: TornadoPath }
  /** ブリザードの竜巻が止まった。amount は建物へ送った量の合計 */
  | { type: 'blizzardEnd'; owner: string; amount: number }
  | { type: 'skillFail'; id: SkillId; reason: string }
  | { type: 'rareSpawn'; id: number }
  /** recast：クールダウンが戻ったスキルがあったか */
  | { type: 'rarePickup'; id: number; x: number; z: number; recast: boolean }
  | { type: 'rareExpire'; id: number; x: number; z: number }

export type ThrowSource = { plowId: number } | { tornado: number; x: number; z: number }

const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[]
const ITEM_IDS = Object.keys(ITEMS) as ItemId[]
const SKILL_IDS = Object.keys(SKILLS) as SkillId[]

export function createPlayer(id: string, name: string, skin: SkinId = DEFAULT_SKIN): Player {
  return {
    id,
    name,
    skin,
    x: PLAYER_START.x,
    z: PLAYER_START.z,
    facing: PLAYER_START.facing,
    carried: 0,
    capacity: PLAYER.capacity,
    throwCooldown: 0,
    rare: 0,
    boostTime: 0,
    dashTime: 0,
    cooldowns: Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>,
  }
}

export function createGame(): GameState {
  const player = createPlayer('local', '')
  return { ...createWorld(), players: [player], player }
}

export function createWorld(): World {
  const field = new SnowField(WORLD.fieldRes, WORLD.size, WORLD.centerX, WORLD.centerZ)
  const buildings = BUILDINGS.map((def) => ({ ...def, required: requiredOf(def), deposited: 0, completed: false, machine: machineSpot(def, field) }))
  for (const b of buildings) {
    // 建物の敷地と寄付ゾーンは雪をどけて、降雪機でも積もらないようにする
    field.blockRect(
      b.x - b.width / 2 - b.dropRange,
      b.z - b.depth / 2 - b.dropRange,
      b.x + b.width / 2 + b.dropRange,
      b.z + b.depth / 2 + b.dropRange,
    )
  }
  // 景色の建物（旧第三食堂など）の中にも雪は積もらない
  for (const o of OBSTACLES) field.blockRect(o.x0, o.z0, o.x1, o.z1)
  const s: World = {
    field,
    players: [],
    buildings,
    gold: 0,
    upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Record<UpgradeId, number>,
    items: Object.fromEntries(ITEM_IDS.map((id) => [id, false])) as Record<ItemId, boolean>,
    tier: 0,
    requiredMult: 1,
    totalCollected: 0,
    plows: [],
    machines: [],
    rares: [],
    rareTimer: 2,
    tornadoes: [],
    snowfalls: [],
  }
  refillField(s)
  return s
}

/**
 * 降雪機の置き場所：建物の外壁のうち中庭を向いた面の前（入口から少し離れた所のつもり）。面に沿った位置も中庭の方へ寄せる。
 * ほかの建物の寄付ゾーン・景色の建物・雪原の外にかかる面は避けて、次に中庭を向いている面にする
 */
function machineSpot(b: BuildingDef, field: SnowField): { x: number; z: number } {
  const { offset, radius, towardX, towardZ } = SNOW_MACHINE
  const tx = towardX - b.x
  const tz = towardZ - b.z
  const hw = b.width / 2
  const hd = b.depth / 2
  const along = (t: number, h: number) => Math.max(-h / 2, Math.min(h / 2, t))
  const sides = [
    { n: tx, x: b.x + hw + offset, z: b.z + along(tz, hd) },
    { n: -tx, x: b.x - hw - offset, z: b.z + along(tz, hd) },
    { n: tz, x: b.x + along(tx, hw), z: b.z + hd + offset },
    { n: -tz, x: b.x + along(tx, hw), z: b.z - hd - offset },
  ].sort((p, q) => q.n - p.n)
  const free = ({ x, z }: { x: number; z: number }) => {
    const q = { x, z }
    field.clamp(q, radius)
    if (q.x !== x || q.z !== z) return false
    const rect = (cx: number, cz: number, w: number, d: number) => Math.hypot(Math.max(Math.abs(x - cx) - w / 2, 0), Math.max(Math.abs(z - cz) - d / 2, 0))
    // 降らせる範囲がほかの建物の敷地に少しかかるのはよい（そこには積もらないだけ）。本体が寄付ゾーンに入らなければ
    if (BUILDINGS.some((o) => o !== b && rect(o.x, o.z, o.width, o.depth) < o.dropRange + 1.5)) return false
    return OBSTACLES.every((o) => rect((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2, o.x1 - o.x0, o.z1 - o.z0) > 2)
  }
  return sides.find(free) ?? sides[0]
}

/** 建物の完成に必要な量（全体倍率と人数の倍率込み） */
export function requiredOf(def: BuildingDef, mult = 1): number {
  return Math.max(1, Math.round(def.required * ECONOMY.requiredScale * mult))
}

/**
 * 必要量の倍率を変える（マルチプレイで人が出入りしたとき）。
 * 建てている途中の建物は、寄付済みの割合が変わらないように寄付済みの量も同じ比で増減させる
 */
export function setRequiredMult(s: World, mult: number) {
  if (mult === s.requiredMult) return
  s.requiredMult = mult
  s.buildings.forEach((b, i) => {
    const prev = b.required
    b.required = requiredOf(BUILDINGS[i], mult)
    b.deposited = b.completed ? b.required : (b.deposited * b.required) / prev
  })
}

/**
 * 必要量を config に合わせる（調整画面から毎フレームいじれるようにするため）。
 * 完成済みの建物は満タンのまま、いま建てている建物は必要量を下回ったらその場で完成させる。
 */
function syncRequired(s: World, events: GameEvent[]) {
  s.buildings.forEach((b, i) => {
    b.required = requiredOf(BUILDINGS[i], s.requiredMult)
    if (b.completed) b.deposited = b.required
  })
  const b = currentBuilding(s)
  if (b && b.deposited >= b.required - 1e-6) {
    b.deposited = b.required
    complete(s, b, events)
  }
}

/** 雪原を初期状態の積雪に戻す */
export function refillField(s: World) {
  const half = WORLD.size / 2
  s.field.fill((x, z) => {
    // 吹きだまり風のうねり。外周は描画側の外側の雪面に合わせて 0.75 へ寄せる
    const drift = WORLD.snowDepth + 0.2 * Math.sin(x * 0.3) * Math.cos(z * 0.25) + 0.15 * Math.sin(x * 0.11 + z * 0.17)
    const edge = Math.max(Math.abs(x - WORLD.centerX), Math.abs(z - WORLD.centerZ)) / half
    const t = Math.min(1, Math.max(0, (edge - 0.85) / 0.15))
    return drift * (1 - t) + 0.75 * t
  })
}

/** アップグレード（と完成した建物のごほうび）込みのプレイヤー性能。PLAYER（基礎値）は書き換えない */
export function stats(s: World): Stats {
  const { shovel, backpack, throwing, cooldown } = s.upgrades
  const speed = s.buildings.reduce((m, b) => (b.completed ? m * (b.reward?.speed ?? 1) : m), 1)
  return {
    moveSpeed: PLAYER.speed * speed,
    collectRadius: PLAYER.collectRadius * (1 + UPGRADE_EFFECT.shovelRadiusPerLevel * shovel),
    collectRate: PLAYER.collectRate * (1 + UPGRADE_EFFECT.shovelRatePerLevel * Math.min(shovel, UPGRADE_EFFECT.shovelRateMaxLevel)),
    capacity: Math.round(PLAYER.capacity * (1 + UPGRADE_EFFECT.backpackCapacityPerLevel * backpack)),
    throwChunk: PLAYER.throwChunk * (1 + UPGRADE_EFFECT.throwChunkPerLevel * throwing),
    throwInterval: PLAYER.throwInterval / (1 + UPGRADE_EFFECT.throwIntervalPerLevel * throwing),
    cooldownMult: 1 / (1 + UPGRADE_EFFECT.cooldownPerLevel * cooldown),
  }
}

export function maxLevel(s: World, id: UpgradeId): number {
  const table = UPGRADES[id].maxLevel
  return table[Math.min(s.tier, table.length - 1)]
}

export function upgradeCost(s: World, id: UpgradeId): number {
  const def = UPGRADES[id]
  return Math.round(def.baseCost * def.growth ** s.upgrades[id] * ECONOMY.costScale)
}

export function itemCost(id: ItemId): number {
  return Math.round(ITEMS[id].cost * ECONOMY.costScale)
}

export type PurchaseCheck = 'ok' | 'max' | 'gold'

export function canBuy(s: World, id: UpgradeId): PurchaseCheck {
  if (s.upgrades[id] >= maxLevel(s, id)) return 'max'
  if (s.gold < upgradeCost(s, id)) return 'gold'
  return 'ok'
}

/** 購入処理。オンライン化後はクライアントからの "buy" メッセージでサーバーが呼ぶ */
export function buyUpgrade(s: World, id: UpgradeId): GameEvent[] {
  if (canBuy(s, id) !== 'ok') return []
  s.gold -= upgradeCost(s, id)
  const level = ++s.upgrades[id]
  syncOwnedUnits(s)
  return [{ type: 'upgrade', id, level }]
}

// ---- アイテム ----

/** アイテムがショップに並ぶ条件を満たしているか */
export function itemUnlocked(s: World, id: ItemId): boolean {
  const { tier, collected } = ITEMS[id].unlock
  return (tier === undefined || s.tier >= tier) && (collected === undefined || s.totalCollected >= collected)
}

export type ItemCheck = 'ok' | 'owned' | 'locked' | 'gold'

export function canBuyItem(s: World, id: ItemId): ItemCheck {
  if (s.items[id]) return 'owned'
  if (!itemUnlocked(s, id)) return 'locked'
  if (s.gold < itemCost(id)) return 'gold'
  return 'ok'
}

export function buyItem(s: World, id: ItemId): GameEvent[] {
  if (canBuyItem(s, id) !== 'ok') return []
  s.gold -= itemCost(id)
  s.items[id] = true
  return [{ type: 'item', id }]
}

// ---- スキル ----

export function skillOwned(s: World, id: SkillId): boolean {
  return s.items[id]
}

/** ブリザードの竜巻がこれより手前で止まるなら、放てない（向きを変えてもらう） */
export const BLIZZARD_MIN_LENGTH = 4

/**
 * スキルを使う。使えなかった場合は skillFail イベントを返す（クールダウンは消費しない）。
 * aim：ブリザードを放つ向き（ラジアン）。無ければプレイヤーの向き
 */
export function useSkill(s: World, p: Player, id: SkillId, aim?: number): GameEvent[] {
  if (!skillOwned(s, id) || p.cooldowns[id] > 0) return []
  const events: GameEvent[] = []
  const b = currentBuilding(s)

  if (id === 'dash') {
    p.dashTime = SKILL_EFFECT.dashTime
  } else if (id === 'boost') {
    p.boostTime = SKILL_EFFECT.boostTime
  } else if (id === 'longThrow') {
    if (!b) return [{ type: 'skillFail', id, reason: '建てる建物がない' }]
    if (p.carried < 1 && p.rare === 0) return [{ type: 'skillFail', id, reason: '雪を持っていない' }]
    const carried = p.carried
    p.carried = volley(s, b, carried, events)
    events.unshift({ type: 'skill', id, amount: carried - p.carried })
    throwRares(s, p, b, events)
  } else if (id === 'blizzard') {
    if (!b) return [{ type: 'skillFail', id, reason: '建てる建物がない' }]
    // 竜巻を放つ。削るのと投げ込むのは stepWorld で竜巻が進みながら行う
    const path = blizzardPath(s, p.x, p.z, aim !== undefined && Number.isFinite(aim) ? aim : p.facing)
    if (path.length < BLIZZARD_MIN_LENGTH) return [{ type: 'skillFail', id, reason: '前がふさがっている。向きを変えて' }]
    s.tornadoes.push({ id: unitSeq++, owner: p.id, x0: path.x, z0: path.z, dirX: path.dirX, dirZ: path.dirZ, length: path.length, traveled: 0, nextScrape: 0, load: 0, throwTimer: SKILL_EFFECT.blizzardThrowInterval, sent: 0 })
    s.snowfalls.push({ owner: p.id, x: p.x, z: p.z, time: path.length / SKILL_EFFECT.blizzardSpeed + SKILL_EFFECT.blizzardSnowLinger })
    events.unshift({ type: 'skill', id, tornado: path })
  }

  if (!events.some((e) => e.type === 'skill')) events.unshift({ type: 'skill', id })
  p.cooldowns[id] = SKILLS[id].cooldown * stats(s).cooldownMult
  return events
}

/** まとまった量の雪を、演出用に数個の雪玉に分けて建物へ投げ込む。入りきらなかった量を返す */
function volley(s: World, b: Building, amount: number, events: GameEvent[]): number {
  const send = Math.min(amount, b.required - b.deposited)
  if (send <= 0) return amount
  const n = Math.max(1, Math.min(SKILL_EFFECT.volleyCount, Math.ceil(send / 10)))
  for (let i = 0; i < n; i++) deposit(s, b, send / n, events)
  return amount - send
}

/**
 * (x, z) から facing の向きへ竜巻を放ったときの通り道。建物（未完成でも敷地）・景色の建物・雪原の端の手前で止まる。
 * 構えている間の通り道の表示にも使う
 */
export function blizzardPath(s: World, x: number, z: number, facing: number): TornadoPath {
  const dirX = Math.sin(facing)
  const dirZ = Math.cos(facing)
  const margin = PLAYER.bodyRadius
  const inside = (px: number, pz: number, x0: number, z0: number, x1: number, z1: number) =>
    px > x0 - margin && px < x1 + margin && pz > z0 - margin && pz < z1 + margin
  let length = 0
  for (let d = 0.5; d <= SKILL_EFFECT.blizzardLength; d += 0.5) {
    const q = { x: x + dirX * d, z: z + dirZ * d }
    const { x: px, z: pz } = q
    s.field.clamp(q, 1)
    if (q.x !== px || q.z !== pz) break
    if (s.buildings.some((b) => inside(px, pz, b.x - b.width / 2, b.z - b.depth / 2, b.x + b.width / 2, b.z + b.depth / 2))) break
    if (OBSTACLES.some((o) => inside(px, pz, o.x0, o.z0, o.x1, o.z1))) break
    length = d
  }
  return { x, z, dirX, dirZ, length }
}

/** 竜巻を進める。通った跡の雪をほぼ全部削り、一定間隔で建物へ投げる。止まったら残りを投げ切って消える */
function stepTornado(s: World, t: Tornado, dt: number, events: GameEvent[]): boolean {
  const { blizzardHalfWidth: r, blizzardSpeed, blizzardThrowInterval } = SKILL_EFFECT
  t.traveled = Math.min(t.length, t.traveled + blizzardSpeed * dt)
  const done = t.traveled >= t.length
  // 1m ごとに円で削る（半幅より十分細かいので、帯状に削れる）。止まった所でもう 1 回
  const scrape = (d: number) => {
    const got = s.field.collect(t.x0 + t.dirX * d, t.z0 + t.dirZ * d, r, 50, 1, Infinity)
    t.load += got
    s.totalCollected += got
  }
  while (t.nextScrape <= t.traveled) {
    scrape(t.nextScrape)
    t.nextScrape += 1
  }
  if (done) scrape(t.length)

  t.throwTimer -= dt
  if (t.load >= 1 && (t.throwTimer <= 0 || done)) {
    t.throwTimer = blizzardThrowInterval
    tornadoThrow(s, t, events)
  }
  if (!done) return true
  // 投げている間に建物が完成したら、次の建物へ投げ切る
  for (let n = 0; n < 4 && t.load >= 1e-6 && currentBuilding(s); n++) tornadoThrow(s, t, events)
  // 全部完成していて投げる先が無ければ、持てるだけ持つ
  const owner = s.players.find((p) => p.id === t.owner)
  if (owner && t.load > 0) owner.carried = Math.min(owner.capacity, owner.carried + t.load)
  events.push({ type: 'blizzardEnd', owner: t.owner, amount: t.sent })
  return false
}

/** 吹雪で雪を積もらせる。放った人について動く（抜けたら最後にいた場所に降らせ続ける） */
function stepSnowfall(s: World, f: Snowfall, dt: number): boolean {
  const owner = s.players.find((p) => p.id === f.owner)
  if (owner) {
    f.x = owner.x
    f.z = owner.z
  }
  const step = Math.min(dt, f.time)
  s.field.add(f.x, f.z, SKILL_EFFECT.blizzardSnowRadius, SKILL_EFFECT.blizzardSnowRate, step)
  f.time -= dt
  return f.time > 0
}

function tornadoThrow(s: World, t: Tornado, events: GameEvent[]) {
  const b = currentBuilding(s)
  if (!b) return
  const send = Math.min(t.load, b.required - b.deposited)
  if (send <= 0) return
  t.load -= send
  t.sent += send
  deposit(s, b, send, events, { tornado: t.id, x: t.x0 + t.dirX * t.traveled, z: t.z0 + t.dirZ * t.traveled })
}

function throwRares(s: World, p: Player, b: Building, events: GameEvent[]) {
  while (p.rare > 0 && !b.completed) {
    p.rare--
    deposit(s, b, Math.min(RARE.value, b.required - b.deposited), events, undefined, true)
  }
}

// ---- 共通 ----

let unitSeq = 0

/** レア雪が湧くか（ごほうびが rare の建物が完成しているか） */
export function rareUnlocked(s: World): boolean {
  return s.buildings.some((b) => b.completed && b.reward?.rare)
}

/**
 * 除雪機の台数をアップグレードのレベルに、降雪機を完成した建物に一致させる
 * （GUI からレベルを直接いじった場合や、ロードしたときにも使う）
 */
export function syncOwnedUnits(s: World) {
  while (s.plows.length < s.upgrades.plow) {
    const p = s.players[0] ?? PLAYER_START
    s.plows.push({ id: unitSeq++, x: p.x + 1, z: p.z + 1, facing: 0, load: 0, targetX: p.x, targetZ: p.z, retarget: 0 })
  }
  s.plows.length = Math.min(s.plows.length, s.upgrades.plow)
  // 建物は順番に完成するので、完成した建物の並びと降雪機の並びは一致する
  const spots = s.buildings.filter((b) => b.completed).map((b) => b.machine)
  while (s.machines.length < spots.length) {
    const spot = spots[s.machines.length]
    s.machines.push({ id: unitSeq++, x: spot.x, z: spot.z })
  }
  s.machines.length = spots.length
}

/** いま建てている建物（BUILDINGS の順で最初の未完成）。全部完成していれば null */
export function currentBuilding(s: World): Building | null {
  return s.buildings.find((b) => !b.completed) ?? null
}

/** 建物の外周（矩形）からの距離 */
export function distanceToBuilding(b: Building, x: number, z: number): number {
  const dx = Math.max(Math.abs(x - b.x) - b.width / 2, 0)
  const dz = Math.max(Math.abs(z - b.z) - b.depth / 2, 0)
  return Math.hypot(dx, dz)
}

export function stepGame(s: GameState, input: MoveInput, dt: number): GameEvent[] {
  const events = stepPlayer(s, s.player, input, dt)
  events.push(...stepWorld(s, dt))
  return events
}

/**
 * プレイヤー 1 人ぶんの回収・レア雪・投げ込み。
 * input が null なら移動はしない（マルチプレイでは位置を端末が決めて送ってくるので、サーバーは押し出すだけ）
 */
export function stepPlayer(s: World, p: Player, input: MoveInput | null, dt: number): GameEvent[] {
  const events: GameEvent[] = []
  const st = stats(s)
  p.capacity = st.capacity

  for (const id of SKILL_IDS) p.cooldowns[id] = Math.max(0, p.cooldowns[id] - dt)
  p.boostTime = Math.max(0, p.boostTime - dt)
  if (input) {
    movePlayer(s, p, input, dt)
  } else {
    p.dashTime = Math.max(0, p.dashTime - dt)
    pushOutOfBuildings(s, p, PLAYER.bodyRadius)
  }

  // 掘っている感じを出すため、向いている方向の扇形（既定は前方の半円）だけを削る
  const collected = s.field.collect(p.x, p.z, st.collectRadius, st.collectRate, dt, p.capacity - p.carried, {
    facing: p.facing,
    angle: (PLAYER.collectArc * Math.PI) / 180,
  })
  if (collected > 0) {
    p.carried += collected
    s.totalCollected += collected
    events.push({ type: 'collect', amount: collected })
  }

  pickRares(s, p, st, events)

  p.throwCooldown = Math.max(0, p.throwCooldown - dt)
  // 寄付できるのは解放済み（＝いま建てている）建物だけ。レア雪から先に投げる
  const b = currentBuilding(s)
  if (b && distanceToBuilding(b, p.x, p.z) <= b.dropRange) {
    while ((p.carried > 0.01 || p.rare > 0) && p.throwCooldown <= 0 && !b.completed) {
      p.throwCooldown += st.throwInterval
      if (p.rare > 0) {
        p.rare--
        deposit(s, b, Math.min(RARE.value, b.required - b.deposited), events, undefined, true)
        continue
      }
      const amount = Math.min(st.throwChunk, p.carried, b.required - b.deposited)
      p.carried -= amount
      if (p.carried < 0.01) p.carried = 0
      deposit(s, b, amount, events)
    }
  }
  return events
}

/** プレイヤー以外（必要量の追従・レア雪の湧き・除雪機・降雪機）。プレイヤーを全員進めてから呼ぶ */
export function stepWorld(s: World, dt: number): GameEvent[] {
  const events: GameEvent[] = []
  syncRequired(s, events)
  spawnRares(s, dt, events)
  for (const plow of s.plows) stepPlow(s, plow, dt, events)
  s.tornadoes = s.tornadoes.filter((t) => stepTornado(s, t, dt, events))
  s.snowfalls = s.snowfalls.filter((f) => stepSnowfall(s, f, dt))
  for (const m of s.machines) s.field.add(m.x, m.z, SNOW_MACHINE.radius, SNOW_MACHINE.rate, dt)
  return events
}

/** レア雪：解禁後（先進技術研究所の完成後）は一定間隔で雪の多い場所に湧き、回収半径に入ると拾う（スキルのリキャストつき）。拾われないまま時間がたつと消える */
function pickRares(s: World, p: Player, st: Stats, events: GameEvent[]) {
  for (let i = s.rares.length - 1; i >= 0; i--) {
    const r = s.rares[i]
    if (Math.hypot(r.x - p.x, r.z - p.z) > st.collectRadius + 0.5) continue
    s.rares.splice(i, 1)
    p.rare++
    events.push({ type: 'rarePickup', id: r.id, x: r.x, z: r.z, recast: recastSkills(s, p) })
  }
}

/** レア雪を拾ったときのリキャスト：覚えているスキルの残りクールダウンを RARE.recast（必殺技は recastUltimate）の割合だけ戻す */
function recastSkills(s: World, p: Player): boolean {
  let any = false
  for (const id of SKILL_IDS) {
    if (!skillOwned(s, id) || p.cooldowns[id] <= 0) continue
    p.cooldowns[id] *= 1 - Math.min(1, Math.max(0, SKILLS[id].ultimate ? RARE.recastUltimate : RARE.recast))
    if (p.cooldowns[id] < 0.05) p.cooldowns[id] = 0
    any = true
  }
  return any
}

/** 湧いてから RARE.lifetime 秒たったレア雪は溶けて消える */
function expireRares(s: World, dt: number, events: GameEvent[]) {
  for (let i = s.rares.length - 1; i >= 0; i--) {
    const r = s.rares[i]
    r.life -= dt
    if (r.life > 0) continue
    s.rares.splice(i, 1)
    events.push({ type: 'rareExpire', id: r.id, x: r.x, z: r.z })
  }
}

function spawnRares(s: World, dt: number, events: GameEvent[]) {
  expireRares(s, dt, events)
  if (!rareUnlocked(s)) return
  s.rareTimer -= dt
  if (s.rareTimer > 0 || s.rares.length >= RARE.maxOnField) return
  s.rareTimer = RARE.spawnInterval
  for (let n = 0; n < 30; n++) {
    const { x, z } = s.field.randomPoint(3)
    // 雪がしっかり積もっていて、プレイヤーから少し離れた場所
    if (s.field.amountAt(x, z) < 0.4 || s.players.some((p) => Math.hypot(x - p.x, z - p.z) < 8)) continue
    const id = unitSeq++
    s.rares.push({ id, x, z, life: RARE.lifetime })
    events.push({ type: 'rareSpawn', id })
    return
  }
}

function deposit(s: World, b: Building, amount: number, events: GameEvent[], from?: ThrowSource, rare?: boolean) {
  b.deposited += amount
  const gold = amount * ECONOMY.goldPerSnow
  s.gold += gold
  events.push({ type: 'throw', buildingId: b.id, amount, from, rare }, { type: 'gold', amount: gold })
  if (b.deposited >= b.required - 1e-6) complete(s, b, events)
}

function complete(s: World, b: Building, events: GameEvent[]) {
  b.completed = true
  s.tier = s.buildings.filter((x) => x.completed).length
  // ごほうびの降雪機を建物の前に置く
  syncOwnedUnits(s)
  events.push({ type: 'complete', buildingId: b.id })
}

function stepPlow(s: World, plow: Plow, dt: number, events: GameEvent[]) {
  const fx = UPGRADE_EFFECT.plow
  const target = currentBuilding(s)
  // 全部完成していたら仕事がないので止まる
  if (!target) return

  // 雪の多い場所をいくつかランダムに見比べて目標にする
  plow.retarget -= dt
  const reached = Math.hypot(plow.targetX - plow.x, plow.targetZ - plow.z) < 0.5
  if (plow.retarget <= 0 || reached || s.field.amountAt(plow.targetX, plow.targetZ) < 0.05) {
    // キャンパス全体は広いので、近く（±60m）から探す
    let best = -1
    for (let n = 0; n < 16; n++) {
      const q = { x: plow.x + (Math.random() * 2 - 1) * 60, z: plow.z + (Math.random() * 2 - 1) * 60 }
      s.field.clamp(q, 2)
      const { x, z } = q
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

/** 入力でプレイヤーを動かす。マルチプレイでは端末が自分の分だけ呼ぶ */
export function movePlayer(s: World, p: Player, input: MoveInput, dt: number) {
  const st = stats(s)
  if (p.dashTime > 0) {
    // ダッシュ中は入力を無視して向いている方向へ
    const step = Math.min(p.dashTime, dt)
    p.dashTime -= step
    p.x += Math.sin(p.facing) * SKILL_EFFECT.dashSpeed * step
    p.z += Math.cos(p.facing) * SKILL_EFFECT.dashSpeed * step
  } else {
    const len = Math.hypot(input.x, input.z)
    if (len > 0.01) {
      const speed = st.moveSpeed * (p.boostTime > 0 ? SKILL_EFFECT.boostSpeedMult : 1)
      const k = Math.min(len, 1) / len
      p.x += input.x * k * speed * dt
      p.z += input.z * k * speed * dt
      p.facing = Math.atan2(input.x, input.z)
    }
  }
  pushOutOfBuildings(s, p, PLAYER.bodyRadius)
}

/** 雪原の外と建物（未完成でも敷地）・景色の建物から押し出す。めり込みの浅い軸へ */
function pushOutOfBuildings(s: World, o: { x: number; z: number }, radius: number) {
  s.field.clamp(o, 1)
  const push = (cx: number, cz: number, hw: number, hd: number) => {
    const dx = o.x - cx
    const dz = o.z - cz
    if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) return
    if (hw - Math.abs(dx) < hd - Math.abs(dz)) o.x = cx + Math.sign(dx || 1) * hw
    else o.z = cz + Math.sign(dz || 1) * hd
  }
  for (const b of s.buildings) push(b.x, b.z, b.width / 2 + radius, b.depth / 2 + radius)
  for (const r of OBSTACLES) push((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2 + radius, (r.z1 - r.z0) / 2 + radius)
}
