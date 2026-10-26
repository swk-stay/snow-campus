import './title.css'
import type * as THREE from 'three'
import { courtyardRecord } from '../config'
import type { Building } from '../sim/game'
import { bestTime, formatTime } from '../timeAttack'
import { GAME_VERSION } from '../version'
import { lobby as defaultLobby, type Lobby, type RoomSummary } from './lobby'
import { loadPlayerName, loadServer, savePlayerName, saveServer } from './prefs'
import { CampusTour } from './tour'

// タイトル画面。URL に mode が無いときに main が作る。
// 表示中は背景でカメラがキャンパスを巡り（tour.ts）、main は sim を止めてプレイヤーの入力を受け付けない。
// 通常プレイの「続きから」だけはページを読み直さずにタイトルを閉じ、ほかのモードは URL を変えて読み直す。

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
  lobby?: Lobby
}

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
  private readonly serverInput: HTMLInputElement
  private readonly roomInput: HTMLInputElement
  private readonly findButton: HTMLButtonElement
  private readonly roomsEl: HTMLDivElement
  private readonly messageEl: HTMLParagraphElement
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
          <div class="tp-head"><button class="tp-back" data-back>‹ もどる</button><h2>マルチプレイ</h2></div>
          <label class="tp-field"><span>プレイヤー名</span><input data-name maxlength="12" placeholder="なまえ（12文字まで）" autocomplete="nickname"></label>
          <label class="tp-field"><span>サーバー</span><input data-server placeholder="ws://192.168.0.10:2567" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
          <div class="tp-rooms-head"><span>ルーム</span><button class="tp-small" data-find>ルームを探す</button></div>
          <div class="tp-rooms" data-rooms><p class="tp-note">「ルームを探す」で、サーバーにあるルームを表示します</p></div>
          <div class="tp-create">
            <input data-room-name maxlength="20" placeholder="新しいルームの名前">
            <button class="tp-small primary" data-create>作って入る</button>
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
    this.serverInput = $('[data-server]')
    this.roomInput = $('[data-room-name]')
    this.findButton = $('[data-find]')
    this.roomsEl = $('[data-rooms]')
    this.messageEl = $('[data-message]')

    $('[data-play]').addEventListener('click', () => this.play())
    $('[data-time-attack]').addEventListener('click', () => options.onTimeAttack())
    $('[data-multi]').addEventListener('click', () => this.showMulti(true))
    this.root.querySelector('[data-new]')?.addEventListener('click', () => {
      if (confirm('セーブデータを消して最初からやり直しますか？')) options.onNewGame()
    })
    $('[data-back]').addEventListener('click', () => this.showMulti(false))
    this.findButton.addEventListener('click', () => this.findRooms())
    $('[data-create]').addEventListener('click', () => this.join({ create: this.roomInput.value.trim() }))
    this.roomInput.addEventListener('keydown', (e) => e.key === 'Enter' && this.join({ create: this.roomInput.value.trim() }))

    this.nameInput.value = loadPlayerName()
    this.serverInput.value = loadServer()
    this.nameInput.addEventListener('change', () => savePlayerName(this.nameInput.value.trim()))
    this.serverInput.addEventListener('change', () => saveServer(this.serverInput.value.trim()))

    // ゲームのキー操作（移動・スキル・ショップの E・視点の V など）は window で受けているので、タイトル中は手前で止める。
    // 入力欄に打った文字は止めない（root を通り過ぎたところで止める）
    const signal = this.keys.signal
    addEventListener('keydown', (e) => !this.root.contains(e.target as Node) && e.stopImmediatePropagation(), { capture: true, signal })
    this.root.addEventListener('keydown', (e) => e.stopPropagation(), { signal })

    $<HTMLButtonElement>('[data-play]').focus({ preventScroll: true })
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
    if (open) (this.nameInput.value ? this.findButton : this.nameInput).focus({ preventScroll: true })
  }

  private setMessage(text: string) {
    this.messageEl.textContent = text
    this.messageEl.hidden = !text
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
        return row
      }),
    )
  }

  /** ルームに入る（作る）。ゲーム側は ?mode=multi で読み直したあと、プレイヤー名を loadPlayerName で読む */
  private join(target: { room: string } | { create: string }) {
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
    if ('room' in target) url.searchParams.set('room', target.room)
    else url.searchParams.set('create', target.create)
    location.href = url.href
  }
}

function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p')
  p.className = 'tp-note'
  p.textContent = text
  return p
}
