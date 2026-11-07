import './title.css'
import type * as THREE from 'three'
import { courtyardRecord } from '../config'
import type { Building } from '../sim/game'
import { bestTime, formatTime } from '../timeAttack'
import { SKINS, skinById, type SkinId } from '../skins'
import { GAME_VERSION } from '../version'
import { normalizeRoomName } from '../net/protocol'
import { lobby as defaultLobby, type Lobby, type RoomSummary } from './lobby'
import { loadPlayerName, loadPlayerSkin, loadServer, savePlayerName, savePlayerSkin, saveServer, serverFromQuery } from './prefs'
import { CampusTour } from './tour'

// タイトル画面。URL に mode が無いときに main が作る。
// 表示中は背景でカメラがキャンパスを巡り（tour.ts）、main は sim を止めてプレイヤーの入力を受け付けない。
// 通常プレイの「続きから」だけはページを読み直さずにタイトルを閉じ、ほかのモードは URL を変えて読み直す。
// 入室URL（?mode=multi&server=…&room=…）を直接開いたときも main がこの画面を作り、そのルームに入る前にプレイヤー名とスキンを選んでもらう。

export type TitleOptions = {
  camera: THREE.PerspectiveCamera
  fog: THREE.Fog
  buildings: Building[]
  /** その建物がいま地上に出ている高さ */
  heightOf: (b: Building) => number
  hasSave: boolean
  /** タイトルを閉じた直後に呼ぶ。ここから main の CameraRig と操作に戻る */
  onPlay: () => void
  /** セーブを消して最初から（確認はタイトル側で済ませてある） */
  onNewGame: () => void
  onTimeAttack: () => void
  /** 入室URL を直接開いた。URL のルームに入る画面から始める */
  invite?: boolean
  lobby?: Lobby
}

type JoinTarget = { room: string } | { create: string }

/** 空の色のベールを重ねきってから、カメラを切り替えるまでの時間 (ms) */
const VEIL_IN = 350

export class Title {
  active = true
  private leaving = false
  private readonly root: HTMLDivElement
  private readonly veil: HTMLDivElement
  private readonly tour: CampusTour
  private readonly options: TitleOptions
  private readonly lobby: Lobby
  private readonly keys = new AbortController()

  private readonly menu: HTMLElement
  private readonly multi: HTMLElement
  private readonly nameInput: HTMLInputElement
  private readonly skinLabel: HTMLElement
  private readonly serverInput: HTMLInputElement
  private readonly roomInput: HTMLInputElement
  private readonly findButton: HTMLButtonElement
  private readonly roomsEl: HTMLDivElement
  private readonly messageEl: HTMLParagraphElement
  private readonly panelTitle: HTMLElement
  private readonly browseEl: HTMLElement
  private readonly inviteEls: HTMLElement[]
  private readonly inviteName: HTMLElement
  private readonly inviteInfo: HTMLElement
  private readonly inviteJoin: HTMLButtonElement
  private readonly inviteOthers: HTMLButtonElement
  /** 入室URL で指定されたルーム。ルームに入る画面を出している間だけ入る */
  private invite: JoinTarget | null = null
  /** ルーム一覧の取得を数える（古い応答が後から届いても表示を上書きしない） */
  private request = 0

  constructor(options: TitleOptions) {
    this.options = options
    this.lobby = options.lobby ?? defaultLobby
    this.tour = new CampusTour(options.camera, options.fog, options.buildings, options.heightOf)

    const total = options.buildings.length
    const done = options.buildings.filter((b) => b.completed).length
    const record = courtyardRecord()
    const best = bestTime(record.course, record.goalIds)

    this.veil = document.createElement('div')
    this.veil.id = 'title-veil'
    this.root = document.createElement('div')
    this.root.id = 'title'
    this.root.innerHTML = `
      <div class="title-main">
        <h1 class="title-logo">スノー<wbr>キャンパス</h1>
        <p class="title-tagline">消えた校舎を、雪で建て直そう</p>
        <div class="title-menu" data-menu>
          <button class="title-button primary" data-play>
            ${options.hasSave ? '続きから' : 'はじめから'}<small>${options.hasSave ? `完成 ${done} / ${total} 棟` : `キャンパス全体・${total} 棟`}</small>
          </button>
          <button class="title-button" data-time-attack>
            タイムアタック<small>${best === null ? '中庭まわりの棟を建てるタイムを競う' : `自己ベスト ${formatTime(best)}`}</small>
          </button>
          <button class="title-button" data-multi>マルチプレイ<small>ルームに入って、みんなで建て直す</small></button>
          ${options.hasSave ? '<button class="title-link" data-new>セーブを消してはじめから</button>' : ''}
        </div>
        <div class="title-panel" data-multi-panel hidden>
          <div class="tp-head"><button class="tp-back" data-back>‹ もどる</button><h2 data-panel-title>マルチプレイ</h2></div>
          <div class="tp-invite-room" data-invite hidden>
            <span class="tp-invite-label">参加するルーム</span>
            <b class="tp-invite-name" data-invite-name></b>
            <small data-invite-info></small>
          </div>
          <label class="tp-field"><span>プレイヤー名</span><input data-name maxlength="12" placeholder="なまえ（12文字まで）" autocomplete="nickname"></label>
          <fieldset class="tp-field tp-skin-field"><legend>スキン <b data-skin-label></b></legend><div class="tp-skins" data-skins></div></fieldset>
          <div class="tp-browse" data-browse>
            <label class="tp-field"><span>サーバー</span><input data-server placeholder="ws://192.168.0.10:2567" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
            <div class="tp-rooms-head"><span>ルーム</span><button class="tp-small" data-find>ルームを探す</button></div>
            <div class="tp-rooms" data-rooms><p class="tp-note">「ルームを探す」で、サーバーにあるルームを表示します</p></div>
            <div class="tp-create">
              <input data-room-name maxlength="20" placeholder="新しいルームの名前">
              <button class="tp-small primary" data-create>作って入る</button>
            </div>
          </div>
          <div class="tp-invite-actions" data-invite hidden>
            <button class="title-button primary" data-invite-join>参加する</button>
            <button class="tp-small" data-invite-others hidden>ほかのルームを探す</button>
          </div>
          <p class="tp-message" data-message hidden></p>
        </div>
      </div>
      <div class="title-version">${GAME_VERSION}</div>`
    document.body.append(this.veil, this.root)
    document.body.classList.add('title-screen')

    const $ = <T extends Element>(selector: string) => this.root.querySelector<T>(selector)!
    this.menu = $('[data-menu]')
    this.multi = $('[data-multi-panel]')
    this.nameInput = $('[data-name]')
    this.skinLabel = $('[data-skin-label]')
    this.serverInput = $('[data-server]')
    this.roomInput = $('[data-room-name]')
    this.findButton = $('[data-find]')
    this.roomsEl = $('[data-rooms]')
    this.messageEl = $('[data-message]')
    this.panelTitle = $('[data-panel-title]')
    this.browseEl = $('[data-browse]')
    this.inviteEls = [...this.root.querySelectorAll<HTMLElement>('[data-invite]')]
    this.inviteName = $('[data-invite-name]')
    this.inviteInfo = $('[data-invite-info]')
    this.inviteJoin = $('[data-invite-join]')
    this.inviteOthers = $('[data-invite-others]')

    $('[data-play]').addEventListener('click', () => this.play())
    $('[data-time-attack]').addEventListener('click', () => options.onTimeAttack())
    $('[data-multi]').addEventListener('click', () => this.showMulti(true))
    this.root.querySelector('[data-new]')?.addEventListener('click', () => {
      if (confirm('セーブデータを消して最初からやり直しますか？')) options.onNewGame()
    })
    $('[data-back]').addEventListener('click', () => {
      this.leaveInvite()
      this.setMessage('')
      this.showMulti(false)
    })
    this.inviteJoin.addEventListener('click', () => this.invite && this.join(this.invite))
    this.nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && this.invite && !this.inviteJoin.disabled && this.join(this.invite))
    this.inviteOthers.addEventListener('click', () => {
      this.leaveInvite()
      this.findRooms()
    })
    this.findButton.addEventListener('click', () => this.findRooms())
    $('[data-create]').addEventListener('click', () => this.join({ create: this.roomInput.value.trim() }))
    this.roomInput.addEventListener('keydown', (e) => e.key === 'Enter' && this.join({ create: this.roomInput.value.trim() }))

    this.nameInput.value = loadPlayerName()
    this.buildSkins($('[data-skins]'), loadPlayerSkin())
    // ?server=… 付きのリンクで開いたら、そのサーバーを入れてマルチプレイの画面を開く（覚えておく値も置き換える）
    const linked = serverFromQuery(location.search)
    if (linked) saveServer(linked)
    this.serverInput.value = linked ?? loadServer()
    this.nameInput.addEventListener('change', () => savePlayerName(this.nameInput.value.trim()))
    this.serverInput.addEventListener('change', () => saveServer(this.serverInput.value.trim()))

    // ゲームのキー操作（移動・スキル・ショップの E・視点の V など）は window で受けているので、タイトル中は手前で止める。
    // 入力欄に打った文字は止めない（root を通り過ぎたところで止める）
    const signal = this.keys.signal
    addEventListener('keydown', (e) => !this.root.contains(e.target as Node) && e.stopImmediatePropagation(), { capture: true, signal })
    this.root.addEventListener('keydown', (e) => e.stopPropagation(), { signal })

    const invite = options.invite ? inviteFromQuery(location.search) : null
    if (invite) this.showInvite(invite)
    else if (linked) this.showMulti(true)
    else $<HTMLButtonElement>('[data-play]').focus({ preventScroll: true })
  }

  /** タイトル表示中だけ main が毎フレーム呼ぶ（カメラとフォグを動かす） */
  update(dt: number) {
    this.tour.update(dt)
    if (!this.leaving) this.veil.style.opacity = String(this.tour.fade)
  }

  /** タイトルを閉じて、いまのシーンのまま遊び始める。カメラの切り替えは空の色のベールの下で行う */
  private play() {
    if (this.leaving) return
    this.leaving = true
    this.veil.classList.add('leaving')
    this.veil.style.opacity = '1'
    this.root.classList.add('leaving')
    setTimeout(() => {
      this.active = false
      this.keys.abort()
      this.root.remove()
      document.body.classList.remove('title-screen')
      this.options.onPlay()
      this.veil.style.opacity = '0'
      this.veil.addEventListener('transitionend', () => this.veil.remove(), { once: true })
    }, VEIL_IN)
  }

  private showMulti(open: boolean) {
    this.menu.hidden = open
    this.multi.hidden = !open
    if (open) (this.nameInput.value ? (this.invite ? this.inviteJoin : this.findButton) : this.nameInput).focus({ preventScroll: true })
  }

  /** 入室URL のルームに入る画面。サーバーの入力欄とルームの一覧は隠し、プレイヤー名とスキンだけ選んでもらう */
  private showInvite(target: JoinTarget) {
    this.invite = target
    for (const el of this.inviteEls) el.hidden = false
    this.browseEl.hidden = true
    this.panelTitle.textContent = 'ルームに参加'
    this.inviteName.textContent = 'create' in target ? normalizeRoomName(target.create) : '…'
    this.showMulti(true)
    void this.checkInvite(target)
  }

  /**
   * ふつうのマルチプレイの画面に戻す。URL の mode と room / create も消す
   * （残したままだと「続きから」で遊んだあとの読み直しや「セーブを消してはじめから」で、またこの画面が開く）
   */
  private leaveInvite() {
    if (!this.invite) return
    this.invite = null
    for (const el of this.inviteEls) el.hidden = true
    this.browseEl.hidden = false
    this.panelTitle.textContent = 'マルチプレイ'
    const url = new URL(location.href)
    for (const key of ['mode', 'room', 'create']) url.searchParams.delete(key)
    history.replaceState(history.state, '', url)
  }

  /** 入室URL のルームの名前と人数を出す。閉じたルーム・満員のルームなら参加のボタンを押せなくする */
  private async checkInvite(target: JoinTarget) {
    const server = this.server()
    if (!server) {
      // サーバーの指定が壊れている。入力欄を出して直してもらう（メッセージは server() が出している）
      this.leaveInvite()
      this.serverInput.focus()
      return
    }
    this.inviteInfo.textContent = 'ルームの様子を確かめています…'
    let rooms: RoomSummary[]
    try {
      rooms = await this.lobby.listRooms(server)
    } catch (e) {
      if (this.invite !== target) return
      this.inviteInfo.textContent = 'ルームの様子を確かめられませんでした'
      this.setMessage(e instanceof Error && e.message ? e.message : 'サーバーに接続できませんでした')
      return
    }
    if (this.invite !== target) return
    const room = 'room' in target ? rooms.find((r) => r.roomId === target.room) : rooms.find((r) => r.name === normalizeRoomName(target.create))
    if (room) {
      const full = room.players >= room.maxPlayers
      this.inviteName.textContent = room.name
      this.inviteInfo.textContent = `${room.players} / ${room.maxPlayers} 人・完成 ${room.completed} / ${room.total} 棟${full ? '・満員です' : ''}`
      this.setInviteJoinable(!full)
    } else if ('room' in target) {
      this.inviteName.textContent = '見つかりません'
      this.inviteInfo.textContent = 'ルームはもう閉じたのかもしれません'
      this.setInviteJoinable(false)
    } else {
      this.inviteInfo.textContent = 'まだ無いルームです。参加すると、この名前で作ります'
    }
  }

  private setInviteJoinable(joinable: boolean) {
    this.inviteJoin.disabled = !joinable
    this.inviteOthers.hidden = joinable
  }

  private setMessage(text: string) {
    this.messageEl.textContent = text
    this.messageEl.hidden = !text
  }

  /** スキンの選択肢。上着の色違いは色の見本、キャラクターは skin.swatch の見本 */
  private buildSkins(el: HTMLElement, selected: SkinId) {
    for (const skin of SKINS) {
      const option = document.createElement('label')
      option.className = 'tp-skin'
      option.title = skin.label
      const radio = document.createElement('input')
      radio.type = 'radio'
      radio.name = 'skin'
      radio.value = skin.id
      radio.checked = skin.id === selected
      radio.setAttribute('aria-label', skin.label)
      radio.addEventListener('change', () => this.selectSkin(skin.id))
      const swatch = document.createElement('span')
      swatch.className = 'tp-skin-swatch'
      swatch.style.background = 'swatch' in skin ? skin.swatch : `#${skin.color.toString(16).padStart(6, '0')}`
      option.append(radio, swatch)
      el.append(option)
    }
    this.skinLabel.textContent = skinById(selected).label
  }

  private selectSkin(id: SkinId) {
    savePlayerSkin(id)
    this.skinLabel.textContent = skinById(id).label
  }

  /** ws:// か wss:// で始まるアドレス。違っていればメッセージを出して null */
  private server(): string | null {
    const server = this.serverInput.value.trim()
    if (!/^wss?:\/\/[^/\s]+/.test(server)) {
      this.setMessage('サーバーのアドレスは ws:// か wss:// で始めてください（例 ws://192.168.0.10:2567）')
      this.serverInput.focus()
      return null
    }
    saveServer(server)
    return server
  }

  private async findRooms() {
    const server = this.server()
    if (!server) return
    this.setMessage('')
    const id = ++this.request
    this.findButton.disabled = true
    this.roomsEl.replaceChildren(note('ルームを探しています…'))
    try {
      const rooms = await this.lobby.listRooms(server)
      if (id !== this.request) return
      this.showRooms(rooms)
    } catch (e) {
      if (id !== this.request) return
      this.roomsEl.replaceChildren(note('ルームの一覧を取れませんでした'))
      this.setMessage(e instanceof Error && e.message ? e.message : 'サーバーに接続できませんでした。アドレスを確かめてください')
    } finally {
      if (id === this.request) {
        this.findButton.disabled = false
        this.findButton.textContent = '更新'
      }
    }
  }

  private showRooms(rooms: RoomSummary[]) {
    if (!rooms.length) {
      this.roomsEl.replaceChildren(note('まだルームがありません。下で名前を付けて作れます'))
      return
    }
    this.roomsEl.replaceChildren(
      ...rooms.map((r) => {
        const full = r.players >= r.maxPlayers
        const row = document.createElement('button')
        row.className = 'tp-room'
        row.disabled = full
        const name = document.createElement('span')
        name.className = 'tp-room-name'
        // ルーム名は他の人が付けたものなので、HTML として解釈させない
        name.textContent = r.name
        const info = document.createElement('small')
        info.textContent = `${r.players} / ${r.maxPlayers} 人・完成 ${r.completed} / ${r.total} 棟`
        const action = document.createElement('span')
        action.className = 'tp-room-action'
        action.textContent = full ? '満員' : '参加'
        row.append(name, info, action)
        row.addEventListener('click', () => this.join({ room: r.roomId }))
        // 会場のモニターに映す用。プレイヤー名は要らず、満員でも観られる
        const watch = document.createElement('button')
        watch.className = 'tp-small'
        watch.textContent = '観戦'
        watch.addEventListener('click', () => this.watch(r.roomId))
        const line = document.createElement('div')
        line.className = 'tp-room-line'
        line.append(row, watch)
        return line
      }),
    )
  }

  /** ルームに入る（作る）。ゲーム側は ?mode=multi で読み直したあと、プレイヤー名とスキンを loadPlayerName / loadPlayerSkin で読む */
  private join(target: JoinTarget) {
    const name = this.nameInput.value.trim()
    if (!name) {
      this.setMessage('プレイヤー名を入れてください')
      this.nameInput.focus()
      return
    }
    if ('create' in target && !target.create) {
      this.setMessage('新しいルームの名前を入れてください')
      this.roomInput.focus()
      return
    }
    const server = this.server()
    if (!server) return
    savePlayerName(name)
    const url = new URL(location.href)
    url.searchParams.delete('room')
    url.searchParams.delete('create')
    url.searchParams.set('mode', 'multi')
    url.searchParams.set('server', server)
    url.searchParams.set('from', 'title')
    if ('room' in target) url.searchParams.set('room', target.room)
    else url.searchParams.set('create', target.create)
    location.href = url.href
  }

  /** 神視点でルームを観戦する（?view=god&mode=multi） */
  private watch(roomId: string) {
    const server = this.server()
    if (!server) return
    const url = new URL(location.href)
    url.searchParams.delete('create')
    url.searchParams.set('view', 'god')
    url.searchParams.set('mode', 'multi')
    url.searchParams.set('server', server)
    url.searchParams.set('room', roomId)
    location.href = url.href
  }
}

/** 入室URL の room か create。どちらも無ければ null（サーバーだけのリンクと同じ扱いにする） */
function inviteFromQuery(search: string): JoinTarget | null {
  const params = new URLSearchParams(search)
  const room = params.get('room')
  if (room) return { room }
  const create = params.get('create')?.trim()
  return create ? { create } : null
}

function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p')
  p.className = 'tp-note'
  p.textContent = text
  return p
}
