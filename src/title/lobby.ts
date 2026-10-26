// マルチプレイのルーム一覧。タイトル画面はこの Lobby を通してだけサーバーに問い合わせる。

export type RoomSummary = { roomId: string; name: string; players: number; maxPlayers: number; completed: number; total: number }
export type Lobby = { listRooms(server: string): Promise<RoomSummary[]> }

// サーバーにつなぐ実装ができるまでの仮置き。タイトル画面には投げた例外のメッセージがそのまま出る
export const lobby: Lobby = {
  async listRooms() {
    throw new Error('マルチプレイのサーバーにまだ接続できません')
  },
}
