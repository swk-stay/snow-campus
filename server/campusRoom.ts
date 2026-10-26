import { deflateSync } from 'node:zlib'
import { Room, matchMaker, type Client } from '@colyseus/core'
import { ITEMS, SKILLS, UPGRADES } from '../src/config'
import { isSkinId, randomSkinId } from '../src/skins'
import { buyItem, buyUpgrade, createPlayer, createWorld, setRequiredMult, stepPlayer, stepWorld, useSkill, type GameEvent, type World } from '../src/sim/game'
import {
  MAX_PLAYERS,
  MAX_SPECTATORS,
  ROOM_NAME,
  encodeFieldPatch,
  normalizeRoomName,
  quantize,
  worldSync,
  type BuyMessage,
  type JoinOptions,
  type PosMessage,
  type RoomMeta,
  type SkillMessage,
  type TaggedEvent,
  type TickMessage,
  type WelcomeMessage,
} from '../src/net/protocol'

/** sim を進める間隔 (ms) */
const SIM_INTERVAL = 1000 / 30
/** 共有状態とイベントを送る間隔 (ms) */
const TICK_INTERVAL = 1000 / 15
/** 雪原の差分を送る間隔 (ms) */
const FIELD_INTERVAL = 100
/** 通信が切れてから、同じプレイヤーとして戻ってこられる秒数（スマホの回線の瞬断やスリープ向け） */
const RECONNECT_SECONDS = 30

/** キャンパス 1 つぶんのルーム。sim/ をそのまま回し、雪の回収・投げ込み・ゴールド・建物の進捗はここで決める */
export class CampusRoom extends Room<{ metadata: RoomMeta }> {
  // プレイヤーと観戦の枠は onAuth で別々に数える
  maxClients = MAX_PLAYERS + MAX_SPECTATORS
  // 進行はメモリにしか無いので、全員が抜けてもルームを残す（サーバーを止めると消える）
  autoDispose = false

  private world!: World
  /** 端末に送った雪原（量子化済み）。差分はこれと比べて作る */
  private sentField!: Uint8Array
  private events: TaggedEvent[] = []
  /** プレイヤーがいる間だけ進めるルームの経過時間（秒）。マルチプレイの一区切り（K1号館の完成）までのタイムに使う */
  private playTime = 0
  /** 神視点で観戦している端末の sessionId */
  private readonly spectators = new Set<string>()
  /** ?debug で遊んでいるプレイヤーの id。建物の必要量を決める人数に数えない */
  private readonly debugPlayers = new Set<string>()

  messages = {
    pos: (client: Client, m: PosMessage) => {
      const p = this.player(client)
      if (!p || ![m.x, m.z, m.facing].every(Number.isFinite)) return
      p.x = m.x
      p.z = m.z
      p.facing = m.facing
    },
    buy: (client: Client, m: BuyMessage) => {
      if (!this.player(client)) return
      if (m.kind === 'upgrade' && m.id in UPGRADES) this.tag(client.sessionId, buyUpgrade(this.world, m.id))
      else if (m.kind === 'item' && m.id in ITEMS) this.tag(client.sessionId, buyItem(this.world, m.id))
    },
    skill: (client: Client, m: SkillMessage) => {
      const p = this.player(client)
      if (p && m.id in SKILLS) this.tag(p.id, useSkill(this.world, p, m.id))
    },
  }

  async onCreate(options: JoinOptions) {
    const roomName = normalizeRoomName(options.roomName ?? '') || `ルーム ${this.roomId}`
    // 同名のルームがあれば joinOrCreate はそこへ入るので、ここに来るのは同名のルームが観戦も含めて満員のときだけ
    if ((await matchMaker.query({ name: ROOM_NAME, roomName })).length > 0) throw new Error('同じ名前のルームが満員です')
    this.world = createWorld()
    const { field } = this.world
    this.sentField = new Uint8Array(field.data.length)
    for (let k = 0; k < field.data.length; k++) this.sentField[k] = quantize(field.data[k])
    field.dirty = false
    this.setMetadata({ roomName, players: 0, completed: 0, total: this.world.buildings.length })

    this.setSimulationInterval((ms) => this.step(ms / 1000), SIM_INTERVAL)
    this.clock.setInterval(() => this.sendTick(), TICK_INTERVAL)
    this.clock.setInterval(() => this.sendField(), FIELD_INTERVAL)
  }

  // 投げたメッセージは端末に届く。onJoin で投げると、参加していない端末に onDrop が呼ばれて allowReconnection が失敗するので、ここで断る
  onAuth(_client: Client, options: JoinOptions) {
    if (options.spectator) {
      if (this.spectators.size >= MAX_SPECTATORS) throw new Error('観戦の枠がいっぱいです')
    } else if (this.world.players.length >= MAX_PLAYERS) {
      throw new Error('ルームが満員です')
    }
    return true
  }

  onJoin(client: Client, options: JoinOptions) {
    if (options.spectator) {
      this.spectators.add(client.sessionId)
      this.sendWelcome(client)
      return
    }
    const name = options.name?.trim().slice(0, 16) || `プレイヤー${this.world.players.length + 1}`
    const skin = isSkinId(options.skin) ? options.skin : randomSkinId()
    this.world.players.push(createPlayer(client.sessionId, name, skin))
    if (options.debug) this.debugPlayers.add(client.sessionId)
    this.syncRequiredMult()
    this.setMetadata({ ...this.metadata, players: this.world.players.length })
    this.sendWelcome(client)
    this.broadcast('notice', { text: `${name} が参加しました（建物に必要な雪 ×${this.world.requiredMult}）` }, { except: client })
  }

  onDrop(client: Client) {
    // 参加の途中（JOIN_ROOM の確認が届く前）で切れると reject が返る。放っておくと未処理の reject になり、サーバーごと止まる。
    // 再接続できなかったときは Colyseus がこのあと onLeave を呼ぶので、ここでは何もしない
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {})
  }

  /** 切れていた間の雪原の差分を受け取れていないので、最初と同じく全体を送り直す */
  onReconnect(client: Client) {
    this.sendWelcome(client)
  }

  onLeave(client: Client) {
    if (this.spectators.delete(client.sessionId)) return
    const i = this.world.players.findIndex((p) => p.id === client.sessionId)
    if (i < 0) return
    const [p] = this.world.players.splice(i, 1)
    this.debugPlayers.delete(p.id)
    this.syncRequiredMult()
    this.setMetadata({ ...this.metadata, players: this.world.players.length })
    this.broadcast('notice', { text: `${p.name} が抜けました（建物に必要な雪 ×${this.world.requiredMult}）` })
  }

  /** 建物の必要量を遊んでいる人数ぶんにする（観戦と ?debug の人は数えない。誰もいなければ 1 人ぶん） */
  private syncRequiredMult() {
    const n = this.world.players.filter((p) => !this.debugPlayers.has(p.id)).length
    setRequiredMult(this.world, Math.max(1, n))
  }

  private sendWelcome(client: Client) {
    // 差分は sentField に対して作っているので、参加者にも sentField を渡す（いまの data を渡すと、まだ送っていない変化が抜ける）
    const welcome: WelcomeMessage = {
      you: client.sessionId,
      roomName: this.metadata.roomName,
      world: worldSync(this.world),
      field: deflateSync(this.sentField),
      buildingIds: this.world.buildings.map((b) => b.id),
    }
    client.send('welcome', welcome)
  }

  private player(client: Client) {
    return this.world.players.find((p) => p.id === client.sessionId)
  }

  private tag(playerId: string | null, events: GameEvent[]) {
    for (const e of events) this.events.push([playerId, e])
  }

  private step(dt: number) {
    // 止まっていたあとの最初の 1 回などで dt が大きくなると、除雪機や回収の挙動が変わるので抑える
    const t = Math.min(dt, 0.1)
    if (this.world.players.length > 0) this.playTime += t
    for (const p of this.world.players) this.tag(p.id, stepPlayer(this.world, p, null, t))
    this.tag(null, stepWorld(this.world, t))
    if (this.events.some(([, e]) => e.type === 'complete')) {
      this.setMetadata({ ...this.metadata, completed: this.world.tier })
    }
  }

  private sendTick() {
    const tick: TickMessage = { world: worldSync(this.world), events: this.events.splice(0), playTime: this.playTime }
    this.broadcast('tick', tick)
  }

  private sendField() {
    const patch = encodeFieldPatch(this.world.field, this.sentField)
    if (patch) this.broadcast('field', patch)
  }
}
