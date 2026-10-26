// マルチプレイのルーム一覧。タイトル画面はこの Lobby を通してだけサーバーに問い合わせる。

import { listRooms } from '../net/session'
import type { RoomSummary } from '../net/protocol'

export type { RoomSummary }
export type Lobby = { listRooms(server: string): Promise<RoomSummary[]> }

export const lobby: Lobby = { listRooms }
