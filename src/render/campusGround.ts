import { BUILDINGS, OBSTACLES, WORLD } from '../config'

// 雪の下の地面（神奈川工科大学のキャンパス全体）。雪を削ると実際の芝生・園路・構内道路・グラウンドが見えてくる。
// 座標は config.ts の BUILDINGS と同じ（実寸 m、+X が南、+Z が西）。OpenStreetMap の
// 中央緑地公園・芝生・footway・service・野球場・トラック・テニスコートをそのまま変換したもの。
// 描画は Canvas に一度だけ焼き、雪原のシェーダー（地面の色）とミニマップの背景の両方で使う。

type Pt = readonly [number, number]

/** 大学の敷地の外周。外側は一般道と住宅地 */
const CAMPUS: Pt[] = [[-168.6, 102.5], [-30.1, 85.9], [69.9, 79.6], [88.4, 76.3], [104.2, 75.3], [121.5, 77.2], [130.3, -83.9], [150.3, -84.0], [171.3, -351.4], [163.5, -352.1], [126.8, -339.3], [76.8, -330.0], [-30.6, -315.9], [-171.0, -276.5], [-172.4, -108.6], [-167.6, -95.5]]

/** 中央緑地公園（全体は舗装の広場で、その中に芝生がある） */
const PARK: Pt[] = [[-49.8, 13.6], [-48.5, -41.6], [53.7, -39.3], [52.4, 15.9]]

/** 芝生 */
const LAWNS: Pt[][] = [
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
  [[125.9, 68.6], [102.5, 65.8], [102.1, 6.4], [99.6, 6.5], [57.0, 8.0], [57.0, 14.4], [56.2, 74.3]],
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
  [[-108.0, -137.7], [-135.9, -137.3]],
  [[-75.7, -148.6], [-108.0, -147.8]],
  [[-107.6, -188.0], [-104.6, -191.8], [-76.1, -192.5]],
  [[57.0, 8.0], [56.8, -35.2], [56.7, -44.4], [56.7, -55.4], [56.5, -96.2], [56.4, -110.1], [56.1, -151.5], [56.0, -183.2]],
  [[99.6, 6.5], [99.6, -55.2], [56.7, -55.4]],
  [[154.8, -96.3], [56.5, -96.2]],
  [[102.1, 6.4], [117.1, 6.6]],
  [[117.1, 6.6], [117.2, -0.3]],
  [[129.4, -0.0], [117.2, -0.3]],
  [[-171.7, 86.1], [-159.8, 85.6]],
]

/** 構内道路（車道、アスファルト） */
const ROADS: Pt[][] = [
  [[-159.8, 85.6], [-159.5, 2.5], [-156.4, 0.8], [-145.1, 0.5], [-145.1, -99.2]],
  [[55.5, 86.5], [56.1, 78.3], [56.2, 74.3], [58.9, 71.0], [98.2, 68.5], [103.2, 69.9], [104.3, 73.6], [107.1, 84.2]],
  [[56.1, 78.3], [104.3, 73.6]],
  [[56.2, 74.3], [2.4, 76.6], [-42.4, 78.5], [-48.5, 78.6], [-109.1, 79.6], [-115.8, 85.3], [-159.8, 85.6]],
  [[-109.1, 79.6], [-109.5, 23.5], [-109.7, 1.0], [-110.1, -45.2]],
  [[-109.7, 1.0], [-127.6, 0.8]],
  [[-110.1, -45.2], [-83.0, -45.1], [-55.4, -45.1], [-5.7, -45.1]],
  [[-109.5, 23.5], [-55.7, 23.3]],
  [[-110.5, -99.5], [-83.4, -99.6], [-75.2, -99.6], [-56.3, -99.5], [-15.7, -99.3], [-5.7, -99.3], [20.4, -99.3]],
  [[-55.4, -45.1], [-56.3, -99.5]],
  [[-83.0, -45.1], [-83.4, -99.6]],
  [[-136.2, -99.3], [-135.9, -137.3], [-135.6, -172.1], [-176.6, -173.1]],
  [[-110.5, -99.5], [-108.1, -106.1], [-108.0, -137.7], [-108.0, -147.8], [-107.9, -172.7], [-135.6, -172.1]],
  // OSM ではテニスコートと野球場のあいだを敷地の端（z -307）まで通っているが、そこには E7号館が建っていて
  // 道路は無い（Editor のリクエストと航空写真）。E7号館の西の端の手前で止める
  [[-75.2, -99.6], [-75.7, -148.6], [-76.1, -192.5], [-76.3, -217.5]],
  [[-107.9, -172.7], [-107.6, -188.0]],
  [[-145.1, -99.2], [-174.5, -99.0]],
  [[-110.1, -45.2], [-110.5, -99.5]],
  [[-5.7, -45.1], [3.9, -45.0], [56.7, -44.4]],
  [[-129.6, 0.7], [-145.1, 0.5]],
  [[-127.6, 0.8], [-129.6, 0.7]],
  [[-110.5, -99.5], [-136.2, -99.3], [-145.1, -99.2]],
]

/** KAITスタジアム（野球場）の外周。直線の側（中庭寄り）にホーム、弧の側が外野のフェンス */
export const BALLPARK: Pt[] = [[-58.0, -211.2], [-14.1, -209.0], [3.5, -188.7], [25.9, -186.4], [31.0, -186.1], [35.7, -186.9], [54.7, -203.6], [56.9, -206.5], [57.3, -209.9], [59.6, -238.4], [42.1, -258.1], [45.8, -301.1], [36.6, -308.2], [26.2, -313.0], [14.4, -316.4], [2.5, -318.0], [-10.2, -316.3], [-22.4, -312.8], [-33.8, -307.7], [-43.9, -300.7], [-53.0, -291.1], [-59.8, -280.6], [-64.6, -269.1], [-67.1, -257.0], [-67.9, -245.3], [-65.8, -233.7], [-63.0, -222.2]]

/** KAITフットボール・トラック場（陸上トラックの外周。中は人工芝のサッカー場） */
export const TRACK: Pt[] = [[71.5, -191.4], [72.1, -188.4], [73.2, -184.0], [76.2, -177.6], [80.5, -171.9], [85.5, -167.3], [92.5, -163.1], [96.8, -161.3], [102.4, -160.2], [107.9, -160.1], [113.4, -160.5], [117.1, -161.7], [121.4, -163.5], [125.2, -165.6], [129.4, -169.3], [133.6, -174.1], [137.0, -179.8], [138.3, -183.5], [138.9, -186.6], [146.2, -286.1], [145.9, -289.8], [144.3, -294.2], [142.4, -298.2], [139.8, -302.2], [136.1, -306.6], [133.0, -309.8], [127.9, -313.1], [123.6, -315.0], [117.7, -317.0], [111.2, -317.8], [105.8, -317.3], [100.1, -316.0], [94.6, -313.5], [90.4, -310.5], [86.3, -306.6], [83.0, -302.0], [80.1, -296.3], [79.2, -292.6], [71.4, -194.7]]

/** 全天候型テニスコート（フェンスで囲った範囲と、4 面のコート） */
export const TENNIS_AREA: Pt[] = [[-123.4, -221.0], [-86.7, -220.9], [-86.6, -288.4], [-123.2, -288.4]]
export const TENNIS_COURTS: Pt[][] = [[[-115.7, -225.3], [-91.9, -225.5], [-91.9, -236.0], [-115.8, -235.8]], [[-115.6, -241.8], [-91.8, -242.0], [-91.9, -252.5], [-115.7, -252.3]], [[-115.3, -258.1], [-91.4, -258.3], [-91.5, -268.8], [-115.3, -268.6]], [[-115.5, -274.3], [-91.7, -274.5], [-91.8, -285.0], [-115.6, -284.8]]]

/**
 * 野球場のホームベースと、センター方向の向き（-Z＝東からの回転、rad。負なら北へ振れる）。一塁線・三塁線はここから ±45°。
 * OSM のスタジアムの外形は、ホームの後ろの 2 本の直線の辺（北西へ向かう辺と東へ向かう辺）がほぼ直角で、
 * これがファウルゾーンの縁（一塁線・三塁線と平行）。2 本の辺の交点から 6m 内側をホームにしている。
 * 以前はホームを (19, -203)、センターを真東にしていたため、一塁線がスタジアムの外へ出ていた（Editor のリクエスト）
 */
export const HOME_PLATE: Pt = [32.1, -212.7]
export const BALLPARK_AXIS = -0.717

/** ホームから距離 d・センター方向から角度 a（rad、+ で一塁側＝南）の点 */
export function ballparkAt(d: number, a: number): Pt {
  const t = a + BALLPARK_AXIS
  return [HOME_PLATE[0] + Math.sin(t) * d, HOME_PLATE[1] - Math.cos(t) * d]
}

/** ホームから角度 a の向きに進んで、スタジアムの外形にぶつかるまでの距離 */
export function ballparkEdge(a: number): number {
  const [hx, hz] = HOME_PLATE
  const t = a + BALLPARK_AXIS
  const dx = Math.sin(t), dz = -Math.cos(t)
  let best = Infinity
  for (let i = 0; i < BALLPARK.length; i++) {
    const [ax, az] = BALLPARK[i]
    const [bx, bz] = BALLPARK[(i + 1) % BALLPARK.length]
    const ex = bx - ax, ez = bz - az
    const det = dx * -ez - dz * -ex
    if (Math.abs(det) < 1e-9) continue
    const px = ax - hx, pz = az - hz
    const d = (px * -ez - pz * -ex) / det
    const u = (dx * pz - dz * px) / det
    if (d > 0 && u >= 0 && u <= 1) best = Math.min(best, d)
  }
  return best
}

/**
 * トラックの内側のサッカー場。トラックの外形の 2 本の直線（OSM）は Z 軸から約 4.4° 傾いているので、
 * フィールドも同じ向きにする（以前は軸にそろえた長方形で、ラインがトラックに対して斜めに見えていた）。
 * cx/cz は 2 本の直線の中点の中間、halfW はタッチラインまで（トラックの内側の縁から 1m 内側）、halfL はゴールラインまで
 */
export const SOCCER = { cx: 108.9, cz: -240.0, angle: 0.0764, halfW: 23, halfL: 48 }
/** トラックの外側の縁の、中心線からの距離（直線部分） */
export const TRACK_HALF_WIDTH = 33.8

/** サッカー場のローカル座標（u：タッチライン方向に +＝南、v：長手方向に +＝東）からワールド座標へ */
export function soccerAt(u: number, v: number): Pt {
  const c = Math.cos(SOCCER.angle), s = Math.sin(SOCCER.angle)
  return [SOCCER.cx + u * c + v * s, SOCCER.cz + u * s - v * c]
}

/**
 * 渡り廊下（ガラスの屋根を細い柱で支えただけの、壁のない通路）。屋根は建物から少し離れている。
 * K2→K1 は OSM の外形、K1→K3 は Editor のリクエストの位置。屋根の高さは 2 階の床（4.8〜5.5m）より少し上
 * （ユーザーの指摘。OSM の高さ 8.3m は高すぎた）
 */
export type Walkway = { x0: number; z0: number; x1: number; z1: number; height: number }
export const WALKWAYS: Walkway[] = [
  { x0: -6.4, z0: 22.4, x1: 16.8, z1: 25.9, height: 6.3 },
  { x0: 54.9, z0: 15.6, x1: 62.9, z1: 19.1, height: 6.3 },
]

/** 学生専用駐車場（トラックの南、敷地の南端に沿った細長い区画） */
const PARKING: Pt[] = [[149, -175], [157.6, -175], [170.5, -343], [151.5, -335]]

/** トラックの東の端の練習場 */
const PRACTICE_PITCH: Pt[] = [[137.7, -331.0], [136.6, -340.8], [132.7, -340.6], [126.1, -338.7], [99.9, -333.9], [101.5, -322.9], [132.3, -326.5]]

/** 敷地の外の一般道（正門の前、バス停「神奈川工科大学前」がある通り） */
const PUBLIC_ROAD: Pt[] = [[-170, 96], [-30, 92], [70, 86], [104, 83], [180, 80]]

/** 並木の列（始点・終点・間隔）。写真で木が並んでいる場所を、園路の脇に沿って置いている */
const TREE_ROWS: { from: Pt; to: Pt; step: number; sakura?: boolean }[] = [
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
  { from: [-58, -50], to: [-58, -96], step: 8, sakura: true },
  { from: [-3, -52], to: [-3, -94], step: 9, sakura: true },
  // K3号館の北面の前（入口の写真：ピロティの西に、ベンチと並んで若い木が植わっている）
  { from: [60.2, 21], to: [60.2, 38], step: 5.5 },
  // 東側（B5号館・K4号館の脇の園路）
  { from: [60, -100], to: [60, -50], step: 8 },
  { from: [97, -50], to: [97, 2], step: 8 },
  // E 系統の研究棟のあいだの桜並木（E1号館の写真）
  { from: [-106, -100], to: [-106, -188], step: 8, sakura: true },
  // KAIT広場とスタジアムのあいだ、トラックの西の縁
  { from: [-50, -178], to: [40, -178], step: 9 },
  { from: [64, -150], to: [64, -190], step: 9 },
]

/** 敷地の外周に沿った並木の、外周からの距離 (m) と間隔。公式キャンパスマップのイラストでは敷地をぐるっと木が囲んでいる */
const PERIMETER_INSET = 3.5
const PERIMETER_STEP = 9

export type TreeSpot = { x: number; z: number; kind: 'round' | 'sakura' | 'conifer'; scale: number }

/**
 * 並木の位置。建物の敷地・構内道路・グラウンドにかかるものは除く。
 * 見た目のばらつきは位置から決める（毎回同じになる）
 */
export function treeSpots(): TreeSpot[] {
  const out: TreeSpot[] = []
  const put = (x: number, z: number, sakura: boolean) => {
    if (BUILDINGS.some((b) => Math.abs(x - b.x) < b.width / 2 + 1.5 && Math.abs(z - b.z) < b.depth / 2 + 1.5)) return
    if (OBSTACLES.some((o) => x > o.x0 - 2 && x < o.x1 + 2 && z > o.z0 - 2 && z < o.z1 + 2)) return
    if (WALKWAYS.some((w) => x > w.x0 - 2.5 && x < w.x1 + 2.5 && z > w.z0 - 2.5 && z < w.z1 + 2.5)) return
    if (Math.abs(x - WORLD.centerX) > WORLD.size / 2 - 1 || Math.abs(z - WORLD.centerZ) > WORLD.size / 2 - 1) return
    // 道路・グラウンド・駐車場には植えない。縁からも離す（樹冠がフェンスや白線、駐車区画に被らないように）
    if (ROADS.some((r) => distToLine(r, x, z) < 5.5)) return
    if ([BALLPARK, TRACK, TENNIS_AREA, PARKING, PRACTICE_PITCH].some((a) => insidePoly(a, x, z) || distToLine([...a, a[0]], x, z) < 4)) return
    const h = hash(x * 0.37 + z * 1.13)
    out.push({ x, z, kind: sakura ? 'sakura' : h < 0.2 ? 'conifer' : 'round', scale: 0.8 + 0.45 * hash(x * 1.7 - z * 0.3) })
  }
  const row = (from: Pt, to: Pt, step: number, sakura: boolean) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1])
    const n = Math.max(1, Math.round(len / step))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      put(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, sakura)
    }
  }
  for (const r of TREE_ROWS) row(r.from, r.to, r.step, r.sakura ?? false)
  // 外周：各辺を内側へ PERIMETER_INSET だけずらした線に沿って植える
  const cx = CAMPUS.reduce((v, p) => v + p[0], 0) / CAMPUS.length
  const cz = CAMPUS.reduce((v, p) => v + p[1], 0) / CAMPUS.length
  CAMPUS.forEach((a, i) => {
    const b = CAMPUS[(i + 1) % CAMPUS.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < PERIMETER_STEP) return
    let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len
    // 内向き（多角形の重心の側）にそろえる
    if (nx * (cx - a[0]) + nz * (cz - a[1]) < 0) [nx, nz] = [-nx, -nz]
    const d = PERIMETER_INSET
    row([a[0] + nx * d, a[1] + nz * d], [b[0] + nx * d, b[1] + nz * d], PERIMETER_STEP, false)
  })
  return out
}

function insidePoly(pts: readonly Pt[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** 折れ線までの距離 */
function distToLine(pts: readonly Pt[], x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax, dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t))
  }
  return best
}

function hash(v: number): number {
  const s = Math.sin(v * 127.1) * 43758.5453
  return s - Math.floor(s)
}

/**
 * 地面を Canvas に描く。px は一辺のピクセル数。範囲は雪原と同じ（中心 WORLD.centerX/Z、一辺 WORLD.size）。
 * Canvas の上が -Z、左が -X（テクスチャの v は z、u は x に対応する）。
 */
export function paintGround(px: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = px
  const g = canvas.getContext('2d')!
  const size = WORLD.size
  const k = px / size
  const ox = px / 2 - WORLD.centerX * k
  const oz = px / 2 - WORLD.centerZ * k
  g.setTransform(k, 0, 0, k, ox, oz)

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
  g.fillRect(WORLD.centerX - size, WORLD.centerZ - size, size * 2, size * 2)
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

  paintSports(g, poly, line)

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
    const wz = (j - oz) / k
    const jz = ((wz % 1.2) + 1.2) % 1.2 < 0.06
    for (let i = 0; i < px; i++) {
      const o = (j * px + i) * 4
      const wx = (i - ox) / k
      // 1.2m 角の目地（舗装だけ。芝やトラックのように緑・青が強い所には引かない）
      const joint = (jz || ((wx % 1.2) + 1.2) % 1.2 < 0.06) && d[o + 1] < d[o] + 20 && d[o + 2] < d[o] + 20 ? 0.86 : 1
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

type PolyFn = (pts: readonly Pt[]) => void
type LineFn = (pts: readonly Pt[], width: number) => void

/** グラウンド：野球場・陸上トラックとサッカー場・テニスコート・練習場・駐車場 */
function paintSports(g: CanvasRenderingContext2D, poly: PolyFn, line: LineFn) {
  // ---- KAITスタジアム：人工芝の外野（縞の刈り込み）、赤土の内野、白いファウルライン ----
  const [hx, hz] = HOME_PLATE
  const at = ballparkAt
  g.save()
  poly(BALLPARK)
  g.clip()
  g.fillStyle = '#4f8f3c'
  g.fill()
  g.fillStyle = '#5a9a45'
  for (let z = -330; z < -180; z += 12) g.fillRect(-80, z, 150, 6)
  // 外野フェンスの手前の赤土の帯（ウォーニングトラック）
  g.strokeStyle = '#b5643a'
  g.lineWidth = 7
  poly(BALLPARK)
  g.stroke()
  g.restore()
  // ホームから ±45° の扇形が内野の赤土。中に芝の四角（ダイヤモンド）
  g.fillStyle = '#b5643a'
  g.beginPath()
  g.moveTo(hx, hz)
  for (let a = -Math.PI / 4; a <= Math.PI / 4 + 1e-6; a += Math.PI / 40) g.lineTo(...at(40, a))
  g.closePath()
  g.fill()
  // 芝の四角：ホームの少し先（センター方向に 4m）から、一塁線・三塁線に平行な一辺 24m の正方形
  const [sx, sz] = at(4, 0)
  const side = (d: number, a: number): Pt => {
    const [px, pz] = at(d, a)
    return [px - hx + sx, pz - hz + sz]
  }
  g.fillStyle = '#4f8f3c'
  poly([[sx, sz], side(24, Math.PI / 4), side(24 * Math.SQRT2, 0), side(24, -Math.PI / 4)])
  g.fill()
  // マウンドとホームまわり
  g.fillStyle = '#b5643a'
  g.beginPath()
  g.arc(...at(18.4, 0), 2.7, 0, Math.PI * 2)
  g.arc(hx, hz, 4, 0, Math.PI * 2)
  g.fill()
  // ファウルラインと塁間
  g.strokeStyle = '#f2efe6'
  // ファウルラインはポール（スタジアムの外形）の少し手前まで
  line([at(ballparkEdge(-Math.PI / 4) - 3, -Math.PI / 4), [hx, hz], at(ballparkEdge(Math.PI / 4) - 3, Math.PI / 4)], 0.25)
  line([at(27.4, Math.PI / 4), at(27.4 * Math.SQRT2, 0), at(27.4, -Math.PI / 4)], 0.15)
  // ホームの後ろの「KAIT」ロゴ（写真のとおり芝に白抜き）
  g.save()
  g.translate(...at(-7.5, 0))
  g.rotate(BALLPARK_AXIS)
  g.fillStyle = '#f2efe6'
  g.font = 'italic bold 4px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('KAIT', 0, 0)
  g.restore()

  // ---- フットボール・トラック場：青い全天候型トラック（8 レーン）と人工芝のサッカー場 ----
  g.save()
  poly(TRACK)
  g.clip()
  g.fillStyle = '#4c8a38'
  g.fill()
  // 芝の刈り込みの縞（フィールドの向きにそろえる）
  g.save()
  g.translate(SOCCER.cx, SOCCER.cz)
  g.rotate(SOCCER.angle)
  g.fillStyle = '#56953f'
  for (let z = -SOCCER.halfL; z < SOCCER.halfL; z += 10) g.fillRect(-SOCCER.halfW - 10, z, 2 * SOCCER.halfW + 20, 5)
  g.restore()
  // 外周から内側へ 1.22m ごとのレーン。広い線から順に、白→青で塗り重ねて白線だけ残す
  for (let lane = 8; lane >= 1; lane--) {
    g.strokeStyle = '#f0f2f4'
    poly(TRACK)
    g.lineWidth = 2 * 1.22 * lane + 0.12
    g.stroke()
    g.strokeStyle = '#3d6fb0'
    g.lineWidth = 2 * 1.22 * lane - 0.12
    g.stroke()
  }
  g.restore()
  // サッカー場のライン（タッチライン・ハーフウェーライン・センターサークル・ペナルティエリア）。
  // フィールドの中心へ移して回し、ローカル座標（x：タッチライン方向、z：長手方向）で描く
  g.save()
  g.translate(SOCCER.cx, SOCCER.cz)
  g.rotate(SOCCER.angle)
  const w = SOCCER.halfW, l = SOCCER.halfL
  g.strokeStyle = '#f0f2f4'
  g.lineWidth = 0.15
  g.strokeRect(-w, -l, 2 * w, 2 * l)
  line([[-w, 0], [w, 0]], 0.15)
  g.beginPath()
  g.arc(0, 0, 9.15, 0, Math.PI * 2)
  g.stroke()
  for (const [z, dir] of [[-l, 1], [l, -1]] as const) {
    g.strokeRect(-15, Math.min(z, z + dir * 14), 30, 14)
    g.strokeRect(-7, Math.min(z, z + dir * 5), 14, 5)
  }
  g.restore()

  // ---- テニスコート：赤茶の舗装に緑のコート 4 面 ----
  g.fillStyle = '#9c5a43'
  poly(TENNIS_AREA)
  g.fill()
  for (const c of TENNIS_COURTS) {
    g.fillStyle = '#3f7e5a'
    poly(c)
    g.fill()
    // 外枠と、ネット（長辺の中央を横切る線）
    g.strokeStyle = '#eef0ee'
    g.lineWidth = 0.12
    poly(c)
    g.stroke()
    const cx = c.reduce((v, p) => v + p[0], 0) / c.length
    const zs = c.map((p) => p[1])
    line([[cx, Math.min(...zs)], [cx, Math.max(...zs)]], 0.12)
  }

  // ---- 練習場（人工芝） ----
  g.fillStyle = '#4c8a38'
  poly(PRACTICE_PITCH)
  g.fill()

  // ---- 学生専用駐車場：アスファルトに白い区画線 ----
  g.fillStyle = '#4a4c50'
  poly(PARKING)
  g.fill()
  g.save()
  poly(PARKING)
  g.clip()
  g.strokeStyle = '#e8e8e0'
  g.lineWidth = 0.12
  for (let z = -345; z < -170; z += 2.5) {
    line([[148, z], [156, z]], 0.12)
    line([[163, z], [172, z]], 0.12)
  }
  g.restore()
}
