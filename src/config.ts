// ゲームの調整用パラメータ。将来 lil-gui から直接書き換える想定なので、ミュータブルなオブジェクトで持つ。

export const WORLD = {
  /** 雪原の一辺 (m)。原点中心 */
  size: 60,
  /** 雪原セルの分解能（一辺のセル数）。サーバー同期の単位にもなる想定 */
  fieldRes: 256,
  /** セル量 1.0 のときの雪の高さ (m) */
  snowMaxHeight: 0.6,
}

export const PLAYER = {
  speed: 6,
  bodyRadius: 0.45,
  /** 自動回収の半径 (m)。スコップ系アップグレードで伸びる想定 */
  collectRadius: 2.5,
  /** 中心での1秒あたりの削り量（セルの雪の量 0..1 に対する割合） */
  collectRate: 0.8,
  /** 背負える雪の上限 */
  capacity: 80,
  /** 寄付ゾーン内で雪玉を投げる間隔 (s) */
  throwInterval: 0.07,
  /** 雪玉1個あたりの雪の量 */
  throwChunk: 4,
}

export type BuildingDef = {
  id: string
  label: string
  x: number
  z: number
  width: number
  depth: number
  height: number
  /** 完成に必要な雪の量 */
  required: number
  /** 建物の外周からこの距離以内が寄付ゾーン */
  dropRange: number
  /** 実写真に差し替える場合のパス（public/ 配下）。未指定ならプレースホルダーを生成する */
  photos: { front?: string; side?: string }
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'main',
    label: '第一校舎',
    x: 0,
    z: -12,
    width: 14,
    depth: 6,
    height: 9,
    required: 900,
    dropRange: 3,
    photos: {},
  },
]
