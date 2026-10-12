import { BUILDINGS, WORLD } from '../config'

// 雪の下の地面（神奈川工科大学の中庭まわり）。雪を削ると実際の芝生・園路・構内道路が見えてくる。
// 座標は config.ts の BUILDINGS と同じ（実寸 m、+X が南、+Z が西）。OpenStreetMap の
// 中央緑地公園・芝生・footway・service をそのまま変換したもの。描画は Canvas に一度だけ焼き、
// 雪原のシェーダー（地面の色）とミニマップの背景の両方で使う。

type Pt = readonly [number, number]

/** 大学の敷地の外周。外側は一般道と住宅地 */
const CAMPUS: Pt[] = [
  [-168.6, 102.5], [-30.1, 85.9], [69.9, 79.6], [88.4, 76.3], [104.2, 75.3], [121.5, 77.2],
  [130.3, -83.9], [150.3, -84.0], [171.3, -351.4], [-171.0, -276.5], [-172.4, -108.6], [-167.6, -95.5],
]

/** 中央緑地公園（全体は舗装の広場で、その中に芝生がある） */
const PARK: Pt[] = [[-49.8, 13.6], [-48.5, -41.6], [53.7, -39.3], [52.4, 15.9]]

export const LAWNS: Pt[][] = [
  [[-42.8, -30.8], [-11.8, -16.9], [-2.8, -17.2], [-2.6, -32.2], [-42.9, -33.7]],
  [[-43.2, -4.2], [-43.0, -26.8], [-11.4, -13.4], [-11.2, -4.2], [-36.7, 7.8]],
  [[-39.7, 11.9], [-3.6, 11.9], [-3.2, -4.4], [-6.4, -4.5]],
  [[10.3, 12.1], [42.1, 11.3], [10.6, -3.9]],
  [[11.5, -17.1], [11.8, -30.0], [41.9, -29.5], [14.6, -17.0]],
  [[11.6, -32.8], [42.1, -32.1], [42.2, -37.1], [11.7, -37.7]],
  [[-42.5, -35.8], [-2.3, -34.7], [-2.2, -37.2], [-42.5, -38.7]],
]

/** 歩行者用の園路（幅 3m 前後のタイル舗装） */
const FOOTWAYS: Pt[][] = [
  [[57.0, 14.4], [51.9, 14.1], [2.4, 14.4], [-44.6, 14.7], [-55.1, 14.7], [-55.3, -34.8], [-55.4, -45.1]],
  [[2.4, 14.4], [3.1, -13.2], [3.6, -33.4], [3.9, -45.0]],
  [[3.1, -13.2], [-8.1, -14.2], [-45.9, -30.0], [-55.3, -34.8]],
  [[-55.3, -34.8], [3.6, -33.4]],
  [[-44.6, 14.7], [-41.6, 10.6], [-5.4, -6.2], [3.1, -13.2]],
  [[51.9, 14.1], [3.1, -13.2]],
  [[3.1, -13.2], [17.9, -17.2], [56.8, -35.2]],
  [[-55.7, 23.3], [-55.1, 14.7]],
  [[-48.5, 78.6], [-49.2, 29.5], [-55.7, 23.3]],
  [[2.4, 14.4], [2.4, 76.6]],
  [[-5.7, -45.1], [-5.7, -99.3]],
  [[57.0, 8.0], [56.8, -35.2], [56.7, -44.4], [56.7, -55.4], [56.5, -96.2], [56.4, -110.1], [56.1, -151.5]],
  [[99.6, 6.5], [99.6, -55.2], [56.7, -55.4]],
  [[125.9, 68.6], [102.5, 65.8], [102.1, 6.4], [99.6, 6.5], [57.0, 8.0], [57.0, 14.4], [56.2, 74.3]],
  [[154.8, -96.3], [56.5, -96.2]],
  [[102.1, 6.4], [117.1, 6.6]],
]

/** 構内道路（車道、アスファルト） */
const ROADS: Pt[][] = [
  [[55.5, 86.5], [56.1, 78.3], [56.2, 74.3], [58.9, 71.0], [98.2, 68.5], [103.2, 69.9], [104.3, 73.6], [107.1, 84.2]],
  [[56.1, 78.3], [104.3, 73.6]],
  [[56.2, 74.3], [2.4, 76.6], [-42.4, 78.5], [-48.5, 78.6], [-109.1, 79.6], [-115.8, 85.3], [-159.8, 85.6]],
  [[-109.1, 79.6], [-109.5, 23.5], [-109.7, 1.0], [-110.1, -45.2]],
  [[-109.5, 23.5], [-55.7, 23.3]],
  [[-110.1, -45.2], [-83.0, -45.1], [-55.4, -45.1], [-5.7, -45.1], [3.9, -45.0], [56.7, -44.4]],
  [[-110.5, -99.5], [-75.2, -99.6], [-56.3, -99.5], [-5.7, -99.3], [20.4, -99.3]],
  [[-55.4, -45.1], [-56.3, -99.5]],
  [[-83.0, -45.1], [-83.4, -99.6]],
  [[-110.1, -45.2], [-110.5, -99.5]],
]

/** 敷地の外の一般道（正門の前、バス停「神奈川工科大学前」がある通り） */
const PUBLIC_ROAD: Pt[] = [[-170, 96], [-30, 92], [70, 86], [104, 83], [180, 80]]

/** 並木の列（始点・終点・間隔）。写真で木が並んでいる場所を、園路の脇に沿って置いている */
const TREE_ROWS: { from: Pt; to: Pt; step: number }[] = [
  // 中庭の北の縁（KAIT工房側の構内道路沿い）と南の縁（K1・K2 側）
  { from: [-46, -41], to: [52, -38.5], step: 7 },
  { from: [-47, 18], to: [-8, 18], step: 7 },
  { from: [8, 18], to: [14, 18], step: 7 },
  // 図書館の前（中庭の西の縁）と、中庭の東の縁
  { from: [-51, -36], to: [-51, 10], step: 7.5 },
  { from: [54.5, -30], to: [54.5, 10], step: 8 },
  // 西の構内道路沿い（敷地の外周）
  { from: [-105, 72], to: [-45, 73], step: 8 },
  { from: [8, 72], to: [52, 70], step: 8 },
  // KAIT工房のまわりの桜
  { from: [-58, -50], to: [-58, -96], step: 8 },
  { from: [-3, -52], to: [-3, -94], step: 9 },
  // 東側（B5号館・K4号館の脇の園路）
  { from: [60, -100], to: [60, -50], step: 8 },
  { from: [97, -50], to: [97, 2], step: 8 },
]

export type TreeSpot = { x: number; z: number; kind: 'round' | 'sakura' | 'conifer'; scale: number }

/** 並木の位置。建物の敷地にかかるものは除く。見た目のばらつきは位置から決める（毎回同じになる） */
export function treeSpots(): TreeSpot[] {
  const out: TreeSpot[] = []
  for (const row of TREE_ROWS) {
    const len = Math.hypot(row.to[0] - row.from[0], row.to[1] - row.from[1])
    const n = Math.max(1, Math.round(len / row.step))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = row.from[0] + (row.to[0] - row.from[0]) * t
      const z = row.from[1] + (row.to[1] - row.from[1]) * t
      if (BUILDINGS.some((b) => Math.abs(x - b.x) < b.width / 2 + 1.5 && Math.abs(z - b.z) < b.depth / 2 + 1.5)) continue
      if (Math.abs(x) > WORLD.size / 2 - 1 || Math.abs(z) > WORLD.size / 2 - 1) continue
      const h = hash(x * 0.37 + z * 1.13)
      const sakura = row.from[0] === -58 || row.from[0] === -3
      out.push({ x, z, kind: sakura ? 'sakura' : h < 0.2 ? 'conifer' : 'round', scale: 0.8 + 0.45 * hash(x * 1.7 - z * 0.3) })
    }
  }
  return out
}

function hash(v: number): number {
  const s = Math.sin(v * 127.1) * 43758.5453
  return s - Math.floor(s)
}

/**
 * 地面を Canvas に描く。px は一辺のピクセル数。範囲は雪原と同じ（原点中心、一辺 WORLD.size）。
 * Canvas の上が -Z、左が -X（テクスチャの v は z、u は x に対応する）。
 */
export function paintGround(px: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = px
  const g = canvas.getContext('2d')!
  const size = WORLD.size
  const k = px / size
  g.setTransform(k, 0, 0, k, px / 2, px / 2)

  const poly = (pts: readonly Pt[]) => {
    g.beginPath()
    pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)))
    g.closePath()
  }
  const line = (pts: readonly Pt[], width: number) => {
    g.lineWidth = width
    g.beginPath()
    pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)))
    g.stroke()
  }
  g.lineCap = 'round'
  g.lineJoin = 'round'

  // 敷地の外：住宅地まわりの土と草
  g.fillStyle = '#6f7356'
  g.fillRect(-size, -size, size * 2, size * 2)
  g.strokeStyle = '#3d4044'
  line(PUBLIC_ROAD, 11)
  g.strokeStyle = '#9a9a92'
  g.setLineDash([3, 3])
  line(PUBLIC_ROAD, 0.15)
  g.setLineDash([])

  // 敷地の中：コンクリート平板の舗装
  g.fillStyle = '#a9a69d'
  poly(CAMPUS)
  g.fill()
  g.strokeStyle = '#d8d4c8'
  g.lineWidth = 0.6
  g.stroke()

  // 構内道路（アスファルト＋白線）
  g.strokeStyle = '#4a4c50'
  for (const r of ROADS) line(r, 7)
  g.strokeStyle = '#e8e8e0'
  g.setLineDash([3, 4])
  for (const r of ROADS) line(r, 0.15)
  g.setLineDash([])

  // 中央緑地公園：明るい御影石風の舗装、その上に芝生と園路
  g.fillStyle = '#c4beb2'
  poly(PARK)
  g.fill()
  g.fillStyle = '#6f9a4a'
  for (const l of LAWNS) {
    poly(l)
    g.fill()
  }
  // 芝生の縁石
  g.strokeStyle = '#d9d4c6'
  g.lineWidth = 0.35
  for (const l of LAWNS) {
    poly(l)
    g.stroke()
  }
  g.strokeStyle = '#cdb79a'
  for (const f of FOOTWAYS) line(f, 3.2)

  // 建物の足元は少し濃いコンクリート（雪が積もらない敷地の範囲）
  g.fillStyle = 'rgba(70, 70, 66, 0.35)'
  for (const b of BUILDINGS) g.fillRect(b.x - b.width / 2 - 1.2, b.z - b.depth / 2 - 1.2, b.width + 2.4, b.depth + 2.4)

  // 細かい凹凸（舗装の目地や芝のムラ）をノイズで足す
  g.setTransform(1, 0, 0, 1, 0, 0)
  const img = g.getImageData(0, 0, px, px)
  const d = img.data
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const o = (j * px + i) * 4
      const wx = i / k
      const wz = j / k
      // 1.2m 角の目地
      const joint = (wx % 1.2 < 0.06 || wz % 1.2 < 0.06) && d[o + 1] < d[o] + 20 ? 0.86 : 1
      const n = 0.93 + 0.14 * hash(i * 0.731 + j * 1.917)
      const f = joint * n
      d[o] *= f
      d[o + 1] *= f
      d[o + 2] *= f
    }
  }
  g.putImageData(img, 0, 0)
  return canvas
}
