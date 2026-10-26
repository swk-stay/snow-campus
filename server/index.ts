import { networkInterfaces } from 'node:os'
import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { DEFAULT_PORT, ROOM_NAME, type RoomMeta, type RoomSummary } from '../src/net/protocol'
import { CampusRoom } from './campusRoom'

// マルチプレイのサーバー。`npm run server` で起動し、端末のタイトル画面で ws://<このマシンのアドレス>:<PORT> を入れて参加する。
// PORT（既定 2567）と HOST（既定 0.0.0.0。LAN の別の端末から入れるように全インターフェースで待つ）は環境変数で変えられる。

const port = Number(process.env.PORT ?? DEFAULT_PORT)
const host = process.env.HOST ?? '0.0.0.0'

// SDK にはルーム一覧を取る関数が無いので、タイトル画面のルーム選択用に HTTP で返す
const listRooms = createEndpoint('/rooms', { method: 'GET' }, async () => {
  const rooms = await matchMaker.query({ name: ROOM_NAME })
  const list: RoomSummary[] = rooms.map((r) => {
    const meta = r.metadata as RoomMeta | undefined
    return {
      roomId: r.roomId,
      name: meta?.name ?? r.roomId,
      players: r.clients,
      maxPlayers: r.maxClients,
      completed: meta?.completed ?? 0,
      total: meta?.total ?? 0,
    }
  })
  return Response.json(list)
})

const server = defineServer({
  // 参加した直後は端末がキャンパスの組み立てで数秒止まり、その間は死活確認の ping に応答できない。
  // 既定（3 秒 × 2 回）では遅い端末が参加直後に切られるので、20 秒まで待つ
  transport: new WebSocketTransport({ pingInterval: 5000, pingMaxRetries: 4 }),
  rooms: { [ROOM_NAME]: defineRoom(CampusRoom) },
  routes: createRouter({ listRooms }),
  greet: false,
})

await server.listen(port, host)

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => `ws://${a!.address}:${port}`)
console.log(`snow-campus サーバーを起動しました（ポート ${port}）`)
console.log('タイトル画面の「マルチプレイ」で、次のどれかを入れてください:')
for (const a of [`ws://localhost:${port}`, ...addresses]) console.log(`  ${a}`)
