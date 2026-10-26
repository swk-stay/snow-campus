import { Client, type Room } from '@colyseus/sdk'
import { SKILL_EFFECT, type ItemId, type SkillId, type UpgradeId } from '../config'
import { loadPlayerName } from '../title/prefs'
import { createPlayer, syncOwnedUnits, type GameState, type Player, type Plow } from '../sim/game'
import {
  ROOM_NAME,
  normalizeRoomName,
  type BuyMessage,
  type JoinOptions,
  type NoticeMessage,
  type PlayerSync,
  type RoomSummary,
  type TaggedEvent,
  type TickMessage,
  type WelcomeMessage,
  type WorldSync,
  applyFieldPatch,
} from './protocol'

// マルチプレイの端末側。サーバーから届いた共有状態を手元の GameState に写し、自分の位置と操作をサーバーへ送る。
// 自分の位置だけは手元で動かした値を正にする（サーバーの値で上書きすると、遅延のぶん引き戻されるため）。

/** 自分の位置を送る間隔 (s) */
const POS_INTERVAL = 1 / 20

/** ws://host:port を、ルーム一覧を取る http://host:port に直す */
export function httpBase(server: string): string {
  const url = new URL(server)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  return url.origin
}

export async function listRooms(server: string): Promise<RoomSummary[]> {
  const res = await fetch(`${httpBase(server)}/rooms`)
  if (!res.ok) throw new Error(`ルーム一覧を取得できませんでした（${res.status}）`)
  return (await res.json()) as RoomSummary[]
}

export type JoinTarget = { roomId: string } | { create: string }

/**
 * タイトル画面からの遷移（?mode=multi&server=…&room=… または create=…）でルームに入る。
 * spectator（?view=god）なら観戦として入る。観戦はルームを作れないので room が要る
 */
export function joinFromParams(params: URLSearchParams, state: GameState, spectator: boolean): Promise<MultiSession> {
  const server = params.get('server')
  const roomId = params.get('room')
  const create = params.get('create')
  if (!server || (!roomId && (spectator || create === null))) return Promise.reject(new Error('サーバーアドレスかルームの指定がありません'))
  // 名前が空ならサーバーが付ける
  return MultiSession.join(server, roomId ? { roomId } : { create: create! }, loadPlayerName(), state, spectator, params.has('debug'))
}

/** 補間の目標。サーバーからは 15Hz でしか届かないので、ほかのプレイヤーと除雪機は毎フレームここへ寄せる */
type Target = { x: number; z: number; facing: number }

export class MultiSession {
  /** サーバーから届いたが、まだ main が処理していない出来事 */
  private events: TaggedEvent[] = []
  private readonly targets = new Map<string | number, Target>()
  private posTimer = 0
  private disconnected = false
  /** 届いたメッセージを届いた順に処理するための鎖（welcome の展開を待つ間に届いた差分を、展開のあとに当てるため） */
  private chain: Promise<void> = Promise.resolve()
  roomName = ''
  onNotice: (text: string) => void = () => {}
  onDisconnect: () => void = () => {}

  /** 神視点で観戦している（ルームのプレイヤーではない） */
  readonly spectator: boolean
  private readonly room: Room
  private readonly state: GameState
  private readonly name: string
  private readonly ready: Promise<void>
  private welcomed!: (error?: Error) => void

  private constructor(room: Room, state: GameState, name: string, spectator: boolean) {
    this.spectator = spectator
    this.room = room
    this.state = state
    this.name = name
    this.ready = new Promise((resolve, reject) => (this.welcomed = (e) => (e ? reject(e) : resolve())))
    const inOrder = <M>(fn: (m: M) => void | Promise<void>) => (m: M) => {
      this.chain = this.chain
        .then(() => fn(m))
        .catch((e: unknown) => {
          console.error(e)
          this.welcomed(e instanceof Error ? e : new Error(String(e)))
        })
    }
    room.onMessage('welcome', inOrder((m: WelcomeMessage) => this.applyWelcome(m)))
    room.onMessage('tick', inOrder((m: TickMessage) => this.applyTick(m)))
    room.onMessage('field', inOrder((m: Uint8Array) => applyFieldPatch(state.field, m)))
    room.onMessage('notice', (m: NoticeMessage) => this.onNotice(m.text))
    room.onDrop(() => this.onNotice('通信が切れました。再接続しています…'))
    room.onReconnect(() => this.onNotice('再接続しました'))
    room.onLeave(() => {
      if (this.disconnected) return
      this.disconnected = true
      this.onDisconnect()
    })
  }

  /** ルームに入り、最初の状態（welcome）を state に写してから返す */
  static async join(server: string, target: JoinTarget, name: string, state: GameState, spectator = false, debug = false): Promise<MultiSession> {
    const client = new Client(server)
    const options: JoinOptions = { name, spectator, debug }
    const room = 'roomId' in target ? await client.joinById(target.roomId, options) : await client.joinOrCreate(ROOM_NAME, { ...options, roomName: normalizeRoomName(target.create) })
    const session = new MultiSession(room, state, name, spectator)
    try {
      await session.ready
    } catch (e) {
      session.leave()
      throw e
    }
    return session
  }

  /** 参加したときと、再接続したとき（切れていた間の差分を取りこぼしているので全体を受け取り直す）に届く */
  private async applyWelcome(m: WelcomeMessage) {
    const s = this.state
    const field = await inflate(m.field)
    if (field.length !== s.field.data.length) throw new Error('サーバーとゲームのバージョンが違うため参加できません')
    for (let k = 0; k < field.length; k++) s.field.data[k] = field[k] / 255
    s.field.markAllDirty()
    s.player.id = m.you
    s.player.name = this.name
    this.roomName = m.roomName
    this.applyWorld(m.world, true)
    this.welcomed()
  }

  get connected(): boolean {
    return !this.disconnected
  }

  buy(m: BuyMessage) {
    this.room.send('buy', m)
  }

  buyUpgrade(id: UpgradeId) {
    this.buy({ kind: 'upgrade', id })
  }

  buyItem(id: ItemId) {
    this.buy({ kind: 'item', id })
  }

  skill(id: SkillId) {
    this.room.send('skill', { id })
  }

  leave() {
    this.disconnected = true
    void this.room.leave()
  }

  /** 毎フレーム呼ぶ。自分の位置を送り（観戦なら送らない）、ほかのプレイヤーと除雪機を補間して、届いた出来事を返す */
  update(dt: number): TaggedEvent[] {
    const p = this.state.player
    this.posTimer -= dt
    if (this.posTimer <= 0 && !this.disconnected && !this.spectator) {
      this.posTimer = POS_INTERVAL
      this.room.send('pos', { x: p.x, z: p.z, facing: p.facing })
    }
    const k = Math.min(1, dt * 10)
    const follow = (o: { x: number; z: number; facing: number }, t: Target | undefined) => {
      if (!t) return
      o.x += (t.x - o.x) * k
      o.z += (t.z - o.z) * k
      o.facing = t.facing
    }
    for (const o of this.state.players) if (o !== p) follow(o, this.targets.get(o.id))
    for (const o of this.state.plows) follow(o, this.targets.get(o.id))
    return this.events.splice(0)
  }

  /** ほかのプレイヤーと除雪機を、補間せずに最新の位置へ置く（タブに戻ったとき、離れていた間の移動を滑らせて見せないため） */
  snap() {
    for (const o of [...this.state.players, ...this.state.plows]) {
      const t = this.targets.get(o.id)
      if (t && o !== this.state.player) Object.assign(o, t)
    }
  }

  private applyTick(m: TickMessage) {
    this.applyWorld(m.world, false)
    for (const [pid, e] of m.events) {
      // ダッシュとブーストは自分の移動に効くので、サーバーが受け付けたら手元でも始める
      if (pid === this.state.player.id && e.type === 'skill') {
        if (e.id === 'dash') this.state.player.dashTime = SKILL_EFFECT.dashTime
        if (e.id === 'boost') this.state.player.boostTime = SKILL_EFFECT.boostTime
      }
    }
    this.events.push(...m.events)
  }

  /** snap：補間せずにその場へ置く（参加した直後） */
  private applyWorld(w: WorldSync, snap: boolean) {
    const s = this.state
    s.gold = w.gold
    Object.assign(s.upgrades, w.upgrades)
    Object.assign(s.items, w.items)
    s.tier = w.tier
    s.totalCollected = w.totalCollected
    s.buildings.forEach((b, i) => {
      b.required = w.required[i] ?? b.required
      b.deposited = w.deposited[i] ?? b.deposited
      b.completed = w.completed[i] ?? b.completed
    })
    s.rares = w.rares
    s.plows = this.mergeById(s.plows, w.plows, snap, (sync, prev) => (prev ? Object.assign(prev, { load: sync.load }) : { ...sync }))
    // 降雪機は完成した建物から決まるので、手元で置き直す（id は表示の突き合わせにしか使わない）。
    // 除雪機はサーバーの台数に揃えたあとなので、ここでは増えない
    syncOwnedUnits(s)

    const me = w.players.find((p) => p.id === s.player.id)
    if (me) {
      s.player.carried = me.carried
      s.player.capacity = me.capacity
      s.player.rare = me.rare
      Object.assign(s.player.cooldowns, me.cooldowns)
    }
    const others = this.mergeById(
      s.players.filter((p) => p !== s.player),
      w.players.filter((p) => p.id !== s.player.id),
      snap,
      (sync, prev) => Object.assign(prev ?? createPlayer(sync.id, sync.name), remoteFields(sync)),
    )
    // 観戦の端末はルームのプレイヤーではないので、players に入れない
    s.players = this.spectator ? others : [s.player, ...others]
  }

  /** サーバーの並びに合わせて増減させ、位置は補間の目標として覚える */
  private mergeById<S extends { id: string | number; x: number; z: number; facing: number }, T extends Player | Plow>(
    current: T[],
    incoming: S[],
    snap: boolean,
    make: (sync: S, prev: T | undefined) => T,
  ): T[] {
    const byId = new Map(current.map((o) => [o.id, o]))
    for (const o of current) if (!incoming.some((i) => i.id === o.id)) this.targets.delete(o.id)
    return incoming.map((sync) => {
      const prev = byId.get(sync.id)
      const o = make(sync, prev)
      this.targets.set(sync.id, { x: sync.x, z: sync.z, facing: sync.facing })
      if (!prev || snap) {
        o.x = sync.x
        o.z = sync.z
        o.facing = sync.facing
      }
      return o
    })
  }
}

/** ほかのプレイヤーについて、位置以外にサーバーから写すもの（位置は補間で寄せる） */
function remoteFields(p: PlayerSync): Partial<Player> {
  return { name: p.name, carried: p.carried, capacity: p.capacity, rare: p.rare, boostTime: p.boostTime, dashTime: p.dashTime }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
