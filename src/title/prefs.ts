import { DEFAULT_PORT } from '../net/protocol'

// マルチプレイの入力欄（サーバーのアドレス・プレイヤー名）を端末に覚えておく。
// プレイヤー名は ?mode=multi で読み直したあと、ゲーム側が loadPlayerName で読む。

const SERVER_KEY = 'snow-campus-server'
const PLAYER_NAME_KEY = 'snow-campus-player-name'

/** ゲームのサーバーは同じ PC で立てる想定なので、ページを開いたホストの 2567 番を既定にする */
export function defaultServer(): string {
  return `ws://${location.hostname || 'localhost'}:${DEFAULT_PORT}`
}

// localStorage はプライベートモードなどで例外を投げることがあるので、全部 try/catch で包む

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 覚えられなくても、次に開いたとき入れ直すだけで済む
  }
}

export function loadServer(): string {
  return read(SERVER_KEY) || defaultServer()
}

export function saveServer(server: string) {
  write(SERVER_KEY, server)
}

export function loadPlayerName(): string {
  return read(PLAYER_NAME_KEY) ?? ''
}

export function savePlayerName(name: string) {
  write(PLAYER_NAME_KEY, name)
}
