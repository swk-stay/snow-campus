import { cw, deskIsland, pcRow, plant, type Kit } from './kit'
import { WOOD, type Pt } from './parts'

// K1号館の 1 階の間取り（ユーザーの手書きの間取りと、ソフトウェア工房の写真から作った）。
// 西（+Z）の外壁に沿って工房が並び、廊下をはさんで東にトイレ・エレベーターホール・階段、その東がテーブルの並ぶロビー。
// ロビーの北東と南東の角が風除室の入口で、その外（東）がピロティ。
// 座標は K1号館のローカル（+X 南・+Z 西）。トイレは K3号館の側（南）。

const WALL = 0xeeeeea
const CORE = 0xe2ded6
const CAP = 0x24272a

/** 工房の並びの東の壁（廊下に面する）と、廊下の東の端 */
const ROOM_Z = 9.5
const CORRIDOR_Z = 7.0
/** トイレ・エレベーター・北の部屋が並ぶ帯の東の端 */
const CORE_Z = -1.5

type Room = { name: string; x0: number; x1: number; doors: [number, number][]; furnish: (k: Kit, x0: number, x1: number, z0: number, z1: number, y: number, ceil: number) => void }

/**
 * 工房の並び（北から）。x0 が北、x1 が南の境目。広さは KAIT PIA > メディア工房 > ネットワーク工房 = ソフトウェア工房 = 北隣の部屋 > サーバールーム。
 * 扉は廊下側の壁に付ける。ソフトウェア工房は手書きの配置に合わせて真ん中寄り、ほかは北寄り
 */
const ROOMS: Room[] = [
  { name: 'KAIT PIA', x0: -17.75, x1: -8.65, doors: [[-16.4, 1.8], [-10.0, 1.8]], furnish: kaitPia },
  { name: 'サーバールーム', x0: -8.65, x1: -6.25, doors: [[-7.9, 0.9]], furnish: serverRoom },
  { name: '', x0: -6.25, x1: -0.45, doors: [[-5.0, 1.8]], furnish: meetingRoom },
  { name: 'ソフトウェア工房', x0: -0.45, x1: 5.35, doors: [[2.37, 1.8]], furnish: softwareStudio },
  { name: 'ネットワーク工房', x0: 5.35, x1: 11.15, doors: [[6.6, 1.8]], furnish: networkStudio },
  { name: 'メディア工房', x0: 11.15, x1: 17.75, doors: [[12.4, 1.8]], furnish: mediaStudio },
]

/**
 * 1 階の間取りと家具。X・Z は建物の半幅、pz はピロティの奥のガラスの壁、y は床、ceil は天井の高さ。
 * 壁は天井まで立てる
 */
export function k1Ground(k: Kit, X: number, Z: number, pz: number, y: number, ceil: number) {
  const xa = -X + 0.3, xb = X - 0.3

  // 工房の並び：廊下側の壁（扉の開口つき）と、部屋どうしの仕切り
  wallZ(k, ROOM_Z, xa, xb, y, ceil, ROOMS.flatMap((r) => r.doors))
  for (const r of ROOMS) {
    if (r.x0 > xa) k.box(r.x0 - 0.06, y, ROOM_Z, r.x0 + 0.06, ceil, Z, WALL)
    for (const [c, w] of r.doors) slidingDoor(k, c, ROOM_Z, y, w)
    if (r.name) k.sign(r.name, r.doors[0][0], y + 2.65, ROOM_Z - 0.08, 1.5, 0.3, Math.PI)
    k.inside(() => r.furnish(k, r.x0 + 0.06, r.x1 - 0.06, ROOM_Z + 0.06, Z, y, ceil))
  }

  // トイレ（南の端）：北の面に男女の入口
  k.box(11.6, y, CORE_Z, xb, ceil, CORRIDOR_Z, CORE)
  for (const [z, c] of [[1.2, 0x2f5fa8], [5.4, 0xc8322a]] as const) {
    k.box(11.57, y, z - 0.6, 11.6, y + 2.2, z + 0.6, 0x8d9296)
    k.box(11.56, y + 2.35, z - 0.15, 11.6, y + 2.65, z + 0.15, c)
  }
  // 北の端の部屋（用途は分からないので机を置いておく）：南の面に扉
  const nx1 = -12.2
  k.box(xa, y, CORE_Z, nx1, ceil, CORE_Z + 0.12, CORE)
  k.box(xa, y, CORRIDOR_Z - 0.12, nx1, ceil, CORRIDOR_Z, CORE)
  k.box(nx1 - 0.12, y, CORE_Z, nx1, ceil, 2.6, CORE)
  k.box(nx1 - 0.12, y, 3.8, nx1, ceil, CORRIDOR_Z, CORE)
  k.box(nx1 - 0.12, y + 2.2, 2.6, nx1, ceil, 3.8, CORE)
  k.box(nx1 - 0.02, y, 2.6, nx1, y + 2.2, 3.2, 0x9aa0a5)

  k.inside(() => {
    stairs(k, y, ceil + 0.35)
    for (const z of [0.6, 5.2]) deskIsland(k, -15.4, y, z, 2.4, 0.9, 0xe8e6e0, 0x4a5a6a)
    k.box(xa, y, 2.2, xa + 0.45, y + 1.8, 3.6, 0xe4e6e6)
    // ロビー：テーブルが 6 つ（3 つずつ 2 列）と植木
    for (const x of [-7, 0, 7]) for (const z of [-10.2, -7.4]) deskIsland(k, x, y, z, 1.8, 0.9, WOOD, 0x3a4a6a)
    for (const x of [-12, 12]) plant(k, x, y, -6.4, 2.0)
  })

  // 風除室（北東と南東の角）：ガラスの仕切りで囲い、ロビー側（西）に開口
  for (const s of [-1, 1]) {
    const vx = s * 13.6, vz = pz + 3.6
    const outer = s * (X - 0.3)
    const door0 = s * 16.5, door1 = s * 14.9
    glassPart(k, [outer, vz], [door0, vz], y, ceil)
    glassPart(k, [door1, vz], [vx, vz], y, ceil)
    k.box(door0, y + 2.6, vz - 0.05, door1, ceil, vz + 0.05, WALL)
    glassPart(k, [vx, vz], [vx, pz], y, ceil)
    k.box(outer, y, pz + 0.4, s * 14.0, y + 0.02, vz - 0.4, 0x50555a)
  }
}

/**
 * エレベーター（2 基ずつ 2 列が、真ん中のホールをはさんで向かい合う）。シャフトは屋上まで通す。
 * 扉は各階に付ける
 */
export function k1Core(k: Kit, lv: number[], top: number) {
  const banks = [
    { x0: 2.0, x1: 5.2, face: 2.0, out: -1 },
    { x0: -5.2, x1: -2.0, face: -2.0, out: 1 },
  ]
  for (const b of banks) k.box(b.x0, 0, -0.5, b.x1, top, 5.5, 0xdadad6)
  k.inside(() => {
    for (let f = 0; f < lv.length - 1; f++) {
      const y = f === 0 ? 0.12 : lv[f] + 0.05
      for (const b of banks) {
        for (const z of [1.0, 4.0]) {
          const x = b.face
          k.box(x, y, z - 0.7, x + b.out * 0.04, y + 2.45, z + 0.7, 0x8f979d)
          k.box(x + b.out * 0.04, y, z - 0.55, x + b.out * 0.05, y + 2.3, z + 0.55, 0xc3c9ce)
          k.box(x + b.out * 0.05, y, z - 0.01, x + b.out * 0.055, y + 2.3, z + 0.01, 0x6d757b)
          k.box(x + b.out * 0.04, y + 2.55, z - 0.2, x + b.out * 0.05, y + 2.65, z + 0.2, 0xffd27a, 'light')
        }
      }
    }
  })
}

// ---- 部品 ----

/** z 一定の間仕切り（厚み 0.12）。openings は扉の開口の [中心 x, 幅]。開口の上は壁 */
function wallZ(k: Kit, z: number, xa: number, xb: number, y: number, ceil: number, openings: [number, number][]) {
  let x = xa
  for (const [c, w] of [...openings].sort((a, b) => a[0] - b[0])) {
    k.box(x, y, z - 0.06, c - w / 2, ceil, z + 0.06, WALL)
    k.box(c - w / 2, y + 2.3, z - 0.06, c + w / 2, ceil, z + 0.06, WALL)
    x = c + w / 2
  }
  k.box(x, y, z - 0.06, xb, ceil, z + 0.06, WALL)
}

/** 木の枠にすりガラスの引き戸（2 枚。写真の工房の扉） */
function slidingDoor(k: Kit, c: number, z: number, y: number, w: number) {
  const FR = 0xb5874f, h = 2.3
  for (const i of [0, 1]) {
    const xa = c - w / 2 + (i * w) / 2, xb = xa + w / 2
    const zz = z + (i ? 0.025 : -0.025)
    const bar = (x0: number, y0: number, x1: number, y1: number) => k.box(x0, y0, zz - 0.02, x1, y1, zz + 0.02, FR)
    bar(xa, y, xa + 0.06, y + h)
    bar(xb - 0.06, y, xb, y + h)
    bar((xa + xb) / 2 - 0.025, y, (xa + xb) / 2 + 0.025, y + h)
    for (const t of [0, 0.32, 0.64]) bar(xa, y + t * h, xb, y + t * h + 0.06)
    bar(xa, y + h - 0.06, xb, y + h)
    k.wall([xa, zz], [xb, zz], y, y + h, 0xd6e0e3, 'glass')
  }
}

/** ガラスの仕切り（高さ 2.6m、その上は天井まで壁） */
function glassPart(k: Kit, a: Pt, b: Pt, y: number, ceil: number) {
  k.wall(a, b, y, y + 2.6, 0xd4e4ea, 'glass')
  k.slabWall(a, b, y + 2.6, ceil, 0.1, WALL)
  for (const p of [a, b]) k.box(p[0] - 0.04, y, p[1] - 0.04, p[0] + 0.04, y + 2.6, p[1] + 0.04, 0x6f777c)
}

/** ロビーとエレベーターホールのあいだの階段：南から北へ上がって踊り場で折り返し、南へ 2 階まで */
function stairs(k: Kit, y: number, yTop: number) {
  const C = 0xd9dad6
  const mid = (y + yTop) / 2
  const run = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) => {
    const n = Math.max(2, Math.round((y1 - y0) / 0.17))
    for (let i = 0; i < n; i++) {
      const xs = x0 + ((x1 - x0) * i) / n, xe = x0 + ((x1 - x0) * (i + 1)) / n
      const yy = y0 + ((y1 - y0) * (i + 1)) / n
      k.box(xs, Math.max(y0, yy - 0.3), z0, xe, yy, z1, C)
    }
    // 手すり（外側）
    const zr = z0 < -4.05 ? z0 : z1
    k.quad([x0, y0 + 0.9, zr], [x1, y1 + 0.9, zr], [x1, y1 + 0.95, zr], [x0, y0 + 0.95, zr], 0x8a9399)
  }
  run(3.0, y, -2.6, mid, -4.0, -2.5)
  k.box(-5.0, mid - 0.25, -5.6, -2.6, mid, -2.5, C)
  run(-2.6, mid, 3.0, yTop, -5.6, -4.1)
  k.box(-2.6, y, -4.1, 3.0, yTop, -4.0, WALL)
}

/** 木と緑の仕切り（高さ 1.3m）。z 一定なら z0 = z1 - 0.06 のように薄い箱で渡す */
function partition(k: Kit, x0: number, z0: number, x1: number, z1: number, y: number) {
  k.box(x0, y, z0, x1, y + 1.0, z1, 0x6f9a8c)
  k.box(x0, y + 1.0, z0, x1, y + 1.27, z1, 0xc89c62)
  k.box(x0, y + 1.27, z0 - 0.01, x1, y + 1.3, z1 + 0.01, CAP)
}

type RowOpts = { lit?: number[]; laptop?: number; tower?: number[] }

/**
 * 仕切り（z = zp）に付けた机の列。机は仕切りから side（z の向き）の側に奥行き 0.55m、xs..xn に n 席。
 * 席ごとにアームのモニター・キーボード・椅子。lit は画面がついている席、tower は机の下にタワー型 PC がある席
 */
function deskRow(k: Kit, xs: number, xn: number, zp: number, side: number, y: number, n: number, o: RowOpts = {}) {
  const d = 0.55
  k.box(xs, y + 0.7, zp + side * 0.03, xn, y + 0.73, zp + side * d, 0xd9b47e)
  const sw = (xn - xs) / n
  for (let i = 0; i < n; i++) {
    const cx = xs + sw * (i + 0.5)
    const pz = zp + side * 0.07
    k.box(cx - 0.02, y + 0.73, pz - 0.02, cx + 0.02, y + 1.2, pz + 0.02, CAP)
    const mz = zp + side * 0.2
    k.box(cx - 0.28, y + 0.95, mz - 0.02, cx + 0.28, y + 1.29, mz + 0.02, 0x1b1e21)
    if (o.lit?.includes(i)) k.box(cx - 0.25, y + 0.98, mz + side * 0.02, cx + 0.25, y + 1.26, mz + side * 0.025, 0x8fc3f0, 'light')
    k.box(cx - 0.22, y + 0.73, zp + side * 0.38 - 0.07, cx + 0.22, y + 0.75, zp + side * 0.38 + 0.07, 0x2a2d30)
    if (o.laptop === i) {
      k.box(cx + 0.2, y + 0.73, zp + side * 0.42 - 0.11, cx + 0.5, y + 0.75, zp + side * 0.42 + 0.11, 0xe8e8e6)
      k.box(cx + 0.2, y + 0.75, zp + side * 0.31 - 0.01, cx + 0.5, y + 0.96, zp + side * 0.31 + 0.01, 0xe8e8e6)
      k.box(cx + 0.22, y + 0.77, zp + side * 0.32, cx + 0.48, y + 0.94, zp + side * 0.325, 0xb6d4f2, 'light')
    }
    if (o.tower?.includes(i)) k.box(cx - sw / 2 + 0.08, y, zp + side * 0.08, cx - sw / 2 + 0.28, y + 0.45, zp + side * 0.5, 0x2a2d31)
    chair(k, cx, y, zp + side * (d + 0.35), side)
  }
}

/** 黒いメッシュの事務椅子。back は背もたれのある側（z の向き） */
function chair(k: Kit, x: number, y: number, z: number, back: number) {
  const LEG = 0x4a4e52, SEAT = 0x2c3034
  k.box(x - 0.3, y, z - 0.03, x + 0.3, y + 0.05, z + 0.03, LEG)
  k.box(x - 0.03, y, z - 0.3, x + 0.03, y + 0.05, z + 0.3, LEG)
  k.box(x - 0.03, y + 0.05, z - 0.03, x + 0.03, y + 0.42, z + 0.03, LEG)
  k.box(x - 0.24, y + 0.42, z - 0.24, x + 0.24, y + 0.48, z + 0.24, SEAT)
  k.box(x - 0.23, y + 0.5, z + back * 0.2, x + 0.23, y + 1.0, z + back * 0.25, SEAT)
}

/** LAN ケーブル（青）。天井の下を折れ線で通す。pts は [x, z]、y は高さ */
function cable(k: Kit, pts: Pt[], y: number) {
  const C = 0x4f86d6
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    k.box(Math.min(ax, bx) - 0.015, y - 0.015, Math.min(az, bz) - 0.015, Math.max(ax, bx) + 0.015, y + 0.015, Math.max(az, bz) + 0.015, C)
  }
}
function drop(k: Kit, x: number, z: number, y0: number, y1: number) {
  k.box(x - 0.015, y0, z - 0.015, x + 0.015, y1, z + 0.015, 0x4f86d6)
}

// ---- 部屋ごとの家具（x0 北・x1 南・z0 東（廊下側）・z1 西（外壁）） ----

/**
 * ソフトウェア工房（ユーザーの手書きの配置と、北の壁ぎわから南を向いて撮ったパノラマの写真）。
 * 西半分は、北の壁から南へ伸びる机の島が 3 つ：窓側は棚（バインダー・電気ポット・炊飯器など）と机 1 列が背中合わせ、
 * 真ん中は机 2 列が背中合わせ、東は机 1 列で、その東の仕切りが入口側との区切り。机の列はモニター 3 台で、ところどころに PC。
 * 南の壁に壁張りのホワイトボード・ほっともっとのメニューの掲示・空気清浄機・簡易靴箱、南西の角にサーバーラック
 * （倉庫用のスチールラックにデスクトップ PC。LAN ケーブルは天井を通って各島のハブへ下りる）。
 * 東半分（入口側）は机が 1 台、北の壁に本棚、北東の角に展示用のモニター、南東の角にペッパーくん、移動式のホワイトボード
 */
function softwareStudio(k: Kit, x0: number, x1: number, z0: number, z1: number, y: number, ceil: number) {
  k.box(x0, y, z0, x1, y + 0.01, z1, 0x7f858a)

  // 机の島（南の端 xs から北の壁まで）
  const xn = x0 + 0.05
  // 窓側の島：西に棚、東に机
  const p1 = 17.2
  partition(k, xn, p1 - 0.03, 3.25, p1 + 0.03, y)
  shelfCounter(k, xn, 3.25, p1, z1 - 0.2, y)
  deskRow(k, 3.25, xn, p1, -1, y, 3, { lit: [1], tower: [0, 2] })
  // 真ん中の島：背中合わせ
  const p2 = 14.7
  partition(k, xn, p2 - 0.03, 3.2, p2 + 0.03, y)
  deskRow(k, 3.2, xn, p2, 1, y, 3, { tower: [1] })
  deskRow(k, 3.2, xn, p2, -1, y, 3, { lit: [0, 2], laptop: 0, tower: [2] })
  // 東の島：机は西向き、東の仕切りが入口側との区切り
  const p3 = 12.2
  partition(k, xn, p3 - 0.03, 3.0, p3 + 0.03, y)
  deskRow(k, 3.0, xn, p3, 1, y, 3, { lit: [1], tower: [0] })
  // 島の南の端の袖の仕切り（机と棚の奥行きの分）
  for (const [xa, za, zb] of [[3.25, p1 - 0.58, z1 - 0.2], [3.2, p2 - 0.58, p2 + 0.58], [3.0, p3 - 0.03, p3 + 0.58]] as const) {
    partition(k, xa - 0.03, za, xa + 0.03, zb, y)
  }

  // 南の壁：ほっともっとのメニューの掲示、壁張りのホワイトボード 2 枚と時計、簡易靴箱、空気清浄機
  k.box(x1 - 0.03, y + 1.2, 15.75, x1, y + 1.95, 16.35, 0xb08a5a)
  for (const [za, ya, c] of [[15.8, 1.55, 0xf5f0e6], [16.05, 1.25, 0xe85a3a], [16.0, 1.6, 0xffffff]] as const) {
    k.box(x1 - 0.035, y + ya, za, x1 - 0.03, y + ya + 0.3, za + 0.22, c)
  }
  for (const [za, zb] of [[13.65, 14.55], [14.6, 15.5]]) {
    k.box(x1 - 0.04, y + 0.85, za, x1, y + 2.15, zb, 0xb0b4b8)
    k.box(x1 - 0.05, y + 0.88, za + 0.03, x1 - 0.04, y + 2.12, zb - 0.03, 0xfbfbfa)
    k.box(x1 - 0.12, y + 0.85, za, x1 - 0.04, y + 0.88, zb, 0xb0b4b8)
  }
  k.box(x1 - 0.03, y + 2.7, 14.4, x1, y + 3.04, 14.74, 0x3a3e42)
  k.box(x1 - 0.04, y + 2.72, 14.42, x1 - 0.03, y + 3.02, 14.72, 0xf7f7f5)
  shoeRack(k, x1 - 0.35, x1 - 0.05, 12.8, 13.4, y)
  k.box(x1 - 0.45, y, 13.85, x1 - 0.1, y + 0.6, 14.2, 0xf0f0ee)
  // ジョイントマット（東の島の南隣）
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) k.box(3.35 + i * 0.37, y + 0.01, 12.75 + j * 0.35, 3.72 + i * 0.37, y + 0.025, 13.1 + j * 0.35, (i + j) % 2 ? 0xe7dcc6 : 0x6b4a36)
  }
  // 天井のプロジェクター（南の壁のホワイトボードに向ける）
  k.box(2.4, ceil - 0.25, 14.55, 2.44, ceil, 14.59, 0x9aa0a5)
  k.box(2.2, ceil - 0.42, 14.35, 2.65, ceil - 0.25, 14.8, 0xf2f2f0)

  // 西の外壁の窓（K1号館の 1 階の西面の窓のうち、この部屋に入るもの）に濃いグレーのブラインド
  const bx = 2.71, bw = 0.77
  k.box(bx - bw, y + 0.95, z1 - 0.24, bx + bw, y + 3.38, z1 - 0.21, 0x3b4542)
  for (let yy = y + 1.05; yy < y + 3.35; yy += 0.12) k.box(bx - bw, yy, z1 - 0.25, bx + bw, yy + 0.02, z1 - 0.24, 0x55605c)

  // 南西の角のサーバーラック：倉庫用のスチールラックの棚 4 段にタワー型の PC、天板に青いコンテナとモニター。北側は仕切りで囲う
  const rx0 = 4.1, rx1 = 5.2, rz0 = z1 - 0.8, rz1 = z1 - 0.2
  partition(k, 3.92, 16.75, 3.98, z1 - 0.05, y)
  const RACK = 0xd3d7d9
  for (const x of [rx0, rx1 - 0.04]) for (const z of [rz0, rz1 - 0.04]) k.box(x, y, z, x + 0.04, y + 1.9, z + 0.04, RACK)
  const shelves = [0.1, 0.6, 1.1, 1.6]
  for (const sy of shelves) k.box(rx0, y + sy, rz0, rx1, y + sy + 0.03, rz1, RACK)
  for (const sy of shelves.slice(0, 3)) {
    for (let x = rx0 + 0.06, i = 0; x < rx1 - 0.24; x += 0.25, i++) {
      k.box(x, y + sy + 0.03, rz0 + 0.08, x + 0.2, y + sy + 0.45, rz1 - 0.05, i % 3 === 1 ? 0xb8bcc0 : 0x2a2d31)
      k.box(x + 0.08, y + sy + 0.35, rz0 + 0.075, x + 0.12, y + sy + 0.38, rz0 + 0.08, i % 2 ? 0x7cf28f : 0x6fb6ff, 'light')
    }
  }
  for (let x = rx0 + 0.05; x < rx1 - 0.35; x += 0.4) k.box(x, y + 1.63, rz0 + 0.05, x + 0.36, y + 1.85, rz1 - 0.05, 0x2f7fd8)
  k.box(rx1 - 0.4, y + 1.63, rz0 + 0.2, rx1 - 0.05, y + 2.0, rz0 + 0.24, 0x1b1e21)

  // LAN ケーブル：ラックの上から天井へ、天井の下を通って各島の仕切りの上のハブへ
  const cy = ceil - 0.05
  const rackTop: Pt = [4.65, (rz0 + rz1) / 2]
  drop(k, rackTop[0], rackTop[1], y + 1.85, cy)
  for (const [hx, hz] of [[1.6, p1], [1.6, p2], [1.5, p3]] as Pt[]) {
    for (const o of [0, 0.05]) {
      cable(k, [[rackTop[0] + o, rackTop[1]], [rackTop[0] + o, hz + o], [hx, hz + o]], cy - o)
      drop(k, hx, hz + o, y + 1.3, cy - o)
    }
    k.box(hx - 0.12, y + 1.3, hz - 0.06, hx + 0.12, y + 1.35, hz + 0.08, 0xf2f2f0)
  }

  // 入口側：机 1 台（椅子は南側）、北の壁の本棚、北東の角の展示用モニター、南東の角のペッパーくん、移動式のホワイトボード
  k.box(0.65, y + 0.7, 10.5, 1.55, y + 0.74, 12.0, 0xd9b47e)
  for (const [lx, lz] of [[0.7, 10.55], [1.5, 10.55], [0.7, 11.95], [1.5, 11.95]] as const) k.box(lx - 0.025, y, lz - 0.025, lx + 0.025, y + 0.7, lz + 0.025, 0x9a9a9a)
  for (const z of [10.9, 11.6]) chair(k, 1.95, y, z, 0)
  bookshelf(k, x0, x0 + 0.4, 9.7, 12.0, y)
  k.box(0.45, y, 9.7, 1.25, y + 0.9, 9.9, 0x2a2d30)
  k.box(0.2, y + 0.9, 9.72, 1.5, y + 1.65, 9.78, 0x1b1e21)
  k.box(0.24, y + 0.94, 9.78, 1.46, y + 1.61, 9.785, 0x7fb6e6, 'light')
  pepper(k, 4.6, 10.2, y)
  movableBoard(k, 4.9, 10.9, 12.0, y)

  // 天井の空調（カセット形）
  for (const [ax, az] of [[1.4, 15.9], [1.4, 11.2]] as Pt[]) {
    k.box(ax - 0.45, ceil - 0.06, az - 0.45, ax + 0.45, ceil, az + 0.45, 0xf2f2f0)
    k.box(ax - 0.3, ceil - 0.065, az - 0.3, ax + 0.3, ceil - 0.06, az + 0.3, 0x8a8f94)
  }
}

/** 窓側の島の、仕切り（z = zp）の西の棚。上にバインダー・電気ポット・炊飯器・カップと箸立て */
function shelfCounter(k: Kit, x0: number, x1: number, zp: number, zw: number, y: number) {
  const top = y + 0.85
  k.box(x0, y, zp + 0.03, x1, top, zw, 0xe3ddd2)
  k.box(x0, y + 0.42, zp + 0.03, x1, y + 0.44, zw + 0.005, 0xc9c2b6)
  const colors = [0x2f5fa8, 0xc8322a, 0x3c9a5a, 0x222428, 0xe0b030]
  for (let i = 0; i < 12; i++) {
    const x = x0 + 0.15 + i * 0.09
    k.box(x, top, zp + 0.12, x + 0.07, top + 0.3, zp + 0.38, colors[i % colors.length])
  }
  k.cylinder(1.7, zp + 0.22, 0.1, top, top + 0.3, 0xf2f2f0, 10)
  k.box(2.05, top, zp + 0.08, 2.4, top + 0.25, zp + 0.38, 0xf4f4f2)
  k.box(2.08, top + 0.25, zp + 0.11, 2.37, top + 0.27, zp + 0.35, 0x8a8f94)
  for (let i = 0; i < 4; i++) k.cylinder(2.65, zp + 0.22, 0.045, top + i * 0.04, top + i * 0.04 + 0.1, 0xf6f3ea, 8)
  k.cylinder(2.9, zp + 0.22, 0.04, top, top + 0.15, 0x6b5136, 8)
}

/** 本棚（x0..x1 が奥行き、z0..z1 が幅）。背表紙は +X（部屋の中）を向く */
function bookshelf(k: Kit, x0: number, x1: number, z0: number, z1: number, y: number) {
  k.box(x0, y, z0, x1, y + 1.8, z1, 0xd8cdb8)
  const colors = [0x7a3b2e, 0x2e4f7a, 0x3c6b45, 0xb08a3e, 0x6b4a7a, 0xd9d2c0]
  let c = 0
  for (let sy = y + 0.15; sy < y + 1.7; sy += 0.4) {
    for (let z = z0 + 0.05; z < z1 - 0.25; z += 0.28) k.box(x1, sy, z, x1 + 0.005, sy + 0.3, z + 0.24, colors[c++ % colors.length])
  }
}

/** 簡易靴箱（黒い鉄の枠に棒が 3 段、靴がいくつか） */
function shoeRack(k: Kit, x0: number, x1: number, z0: number, z1: number, y: number) {
  for (const z of [z0, z1 - 0.04]) k.box(x0, y, z, x1, y + 0.85, z + 0.04, 0x1e2124)
  for (const sy of [0.15, 0.45, 0.75]) for (const x of [x0 + 0.05, x1 - 0.05]) k.box(x - 0.01, y + sy, z0, x + 0.01, y + sy + 0.02, z1, 0x1e2124)
  for (const [sy, z, c] of [[0.17, z0 + 0.1, 0x2a2d31], [0.47, z0 + 0.3, 0xe8e8e6], [0.17, z0 + 0.35, 0x8a4a2a]] as const) k.box(x0 + 0.03, y + sy, z, x1 - 0.03, y + sy + 0.1, z + 0.12, c)
}

/** 移動式のホワイトボード（脚にキャスター。板は x 一定の面で z0..z1） */
function movableBoard(k: Kit, x: number, z0: number, z1: number, y: number) {
  for (const z of [z0, z1]) {
    k.box(x - 0.02, y, z - 0.02, x + 0.02, y + 1.9, z + 0.02, 0x9aa0a5)
    k.box(x - 0.25, y, z - 0.02, x + 0.25, y + 0.05, z + 0.02, 0x9aa0a5)
  }
  k.box(x - 0.025, y + 0.8, z0 + 0.02, x + 0.025, y + 1.85, z1 - 0.02, 0xfbfbfa)
}

/** ペッパーくん（白い人型ロボット、高さ 1.2m。胸にタブレット）。正面は -X（部屋の北）を向く */
function pepper(k: Kit, x: number, z: number, y: number) {
  const W = 0xf4f4f2
  k.cylinder(x, z, 0.24, y, y + 0.1, W, 12)
  k.cylinder(x, z, 0.16, y + 0.1, y + 0.55, W, 12)
  k.box(x - 0.15, y + 0.55, z - 0.17, x + 0.13, y + 0.92, z + 0.17, W)
  k.box(x - 0.16, y + 0.66, z - 0.1, x - 0.15, y + 0.82, z + 0.1, 0x6fa8dc, 'light')
  for (const s of [-1, 1]) k.box(x - 0.05, y + 0.5, z + s * 0.17, x + 0.05, y + 0.9, z + s * 0.24, W)
  k.box(x - 0.03, y + 0.92, z - 0.03, x + 0.03, y + 0.98, z + 0.03, 0x2a2d31)
  k.box(x - 0.12, y + 0.98, z - 0.12, x + 0.12, y + 1.22, z + 0.12, W)
  for (const s of [-1, 1]) k.box(x - 0.125, y + 1.1, z + s * 0.055 - 0.025, x - 0.12, y + 1.14, z + s * 0.055 + 0.025, 0x5fd0ff, 'light')
}

function networkStudio(k: Kit, x0: number, x1: number, _z0: number, z1: number, y: number) {
  pcRow(k, x0 + 0.8, x1 - 0.8, y, 12.4, -1)
  pcRow(k, x0 + 0.8, x1 - 1.6, y, 15.2, 1)
  // 19 インチラック
  k.box(x1 - 1.1, y, z1 - 1.0, x1 - 0.2, y + 1.9, z1 - 0.1, 0x22262a)
  for (let yy = y + 0.3; yy < y + 1.8; yy += 0.18) k.box(x1 - 1.12, yy, z1 - 0.9, x1 - 1.1, yy + 0.03, z1 - 0.7, 0x7cf28f, 'light')
}

function mediaStudio(k: Kit, x0: number, x1: number, _z0: number, _z1: number, y: number) {
  pcRow(k, x0 + 0.8, x1 - 1.2, y, 12.4, -1)
  pcRow(k, x0 + 0.8, x1 - 1.2, y, 15.0, 1)
  // 撮影用のグリーンバック
  k.box(x1 - 0.6, y, 13.4, x1 - 0.55, y + 2.4, 16.8, 0x3aa35a)
}

/** 名前の無い部屋（用途は分からないので、机を 2 列と棚を置いておく） */
function meetingRoom(k: Kit, x0: number, x1: number, _z0: number, z1: number, y: number) {
  const cx = (x0 + x1) / 2
  for (const z of [12.6, 15.4]) deskIsland(k, cx, y, z, 3.4, 0.9, 0xe8e6e0, 0x4a5a6a)
  k.box(x0 + 0.8, y, z1 - 0.45, x1 - 0.8, y + 1.8, z1 - 0.05, 0xe4e6e6)
}

function serverRoom(k: Kit, x0: number, _x1: number, _z0: number, _z1: number, y: number) {
  for (const z of [11.6, 13.4, 15.2]) {
    k.box(x0 + 0.2, y, z, x0 + 1.2, y + 2.0, z + 1.2, 0x22262a)
    for (let yy = y + 0.2; yy < y + 1.9; yy += 0.15) k.box(x0 + 1.2, yy, z + 0.2, x0 + 1.21, yy + 0.02, z + 0.5, 0x6fb6ff, 'light')
  }
}

/**
 * KAIT PIA：北半分はロビーと同じ机と椅子の並び、南半分はソファーと角の丸いテーブルの組
 */
function kaitPia(k: Kit, x0: number, x1: number, _z0: number, _z1: number, y: number) {
  for (const x of [x0 + 1.6, x0 + 4.0]) for (const z of [12.4, 15.6]) deskIsland(k, x, y, z, 1.8, 0.9, WOOD, 0x3a4a6a)
  for (const z of [12.4, 15.6]) {
    const cx = x1 - 2.3
    k.prism(roundRect(cx, z, 1.5, 0.8, 0.3), y + 0.42, y + 0.46, WOOD)
    k.box(cx - 0.04, y, z - 0.04, cx + 0.04, y + 0.42, z + 0.04, 0x9a9a9a)
    for (const back of [-1, 1]) sofa(k, cx, y, z + back * 1.0, 1.7, back)
  }
  plant(k, x1 - 0.6, y, 17.2, 1.8)
  plant(k, x1 - 0.6, y, 11.0, 1.6)
}

/** ソファー（長手が x）。back は背もたれのある側（z の向き） */
function sofa(k: Kit, cx: number, y: number, cz: number, len: number, back: number) {
  const C = 0x4f6f7d
  k.box(cx - len / 2, y, cz - 0.4, cx + len / 2, y + 0.42, cz + 0.4, C)
  k.box(cx - len / 2, y + 0.42, cz + back * 0.22, cx + len / 2, y + 0.85, cz + back * 0.4, C)
  for (const s of [-1, 1]) {
    const ax = cx + s * (len / 2 - 0.06)
    k.box(ax - 0.06, y + 0.42, cz - 0.4, ax + 0.06, y + 0.62, cz + 0.4, C)
  }
}

/** 角の丸い長方形（中心・幅 w（x）・奥行き d（z）・角の半径 r）。prism に渡す時計回りの点列 */
function roundRect(cx: number, cz: number, w: number, d: number, r: number): Pt[] {
  const pts: Pt[] = []
  const corners: [number, number, number][] = [[w / 2 - r, d / 2 - r, 0], [-(w / 2 - r), d / 2 - r, 1], [-(w / 2 - r), -(d / 2 - r), 2], [w / 2 - r, -(d / 2 - r), 3]]
  for (const [ox, oz, q] of corners) {
    for (let i = 0; i <= 4; i++) {
      const a = ((q + i / 4) * Math.PI) / 2
      pts.push([cx + ox + Math.cos(a) * r, cz + oz + Math.sin(a) * r])
    }
  }
  return cw(pts)
}
