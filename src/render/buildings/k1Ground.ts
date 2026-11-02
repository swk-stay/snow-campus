import { deskIsland, pcRow, plant, type Kit } from './kit'
import { ORANGE, WOOD, type Pt } from './parts'

// K1号館の 1 階の間取り（ユーザーの手書きの間取りと、ソフトウェア工房の写真から作った）。
// 西（+Z）の外壁に沿って工房が並び、廊下をはさんで東にトイレ・エレベーターホール・階段、その東がテーブルの並ぶロビー。
// ロビーの北東と南東の角が風除室の入口で、その外（東）がピロティ。
// 座標は K1号館のローカル（+X 南・+Z 西）。間取りの南北の向き（トイレが南）は手書きの図の左を南として読んだもの。

const WALL = 0xeeeeea
const CORE = 0xe2ded6
const CAP = 0x24272a

/** 工房の並びの東の壁（廊下に面する）と、廊下の東の端 */
const ROOM_Z = 10.5
const CORRIDOR_Z = 8.0
/** トイレ・エレベーター・北の部屋が並ぶ帯の東の端 */
const CORE_Z = -1.5

type Room = { name: string; x0: number; x1: number; doors: [number, number][]; furnish: (k: Kit, x0: number, x1: number, z0: number, z1: number, y: number, ceil: number) => void }

/**
 * 工房の並び（北から）。x0 が北、x1 が南の境目。広さは KAIT PIA > メディア工房 > ネットワーク工房 = ソフトウェア工房 = 北隣の部屋 > サーバールーム。
 * 扉は廊下側の壁の北寄り（ソフトウェア工房の写真で、扉が北の端にあるのに合わせた）
 */
const ROOMS: Room[] = [
  { name: 'KAIT PIA', x0: -17.75, x1: -8.65, doors: [[-16.4, 1.8], [-10.0, 1.8]], furnish: kaitPia },
  { name: 'サーバールーム', x0: -8.65, x1: -6.25, doors: [[-7.9, 0.9]], furnish: serverRoom },
  { name: '', x0: -6.25, x1: -0.45, doors: [[-5.0, 1.8]], furnish: meetingRoom },
  { name: 'ソフトウェア工房', x0: -0.45, x1: 5.35, doors: [[0.85, 1.8]], furnish: softwareStudio },
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
  // 北の端の部屋（用途は聞いていない）：南の面に扉
  k.box(xa, y, CORE_Z, -12.2, ceil, CORRIDOR_Z, CORE)
  k.box(-12.2, y, 2.6, -12.17, y + 2.2, 3.8, 0x9aa0a5)

  k.inside(() => {
    stairs(k, y, ceil + 0.35)
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

/** 背中合わせの机の島。真ん中の仕切り（z = zc）の両側に、x0..x1 を n 席ずつ。lit は画面がついている席（0 から、東側が先） */
function cubicleIsland(k: Kit, x0: number, x1: number, zc: number, y: number, n: number, lit: number[], laptop = -1) {
  const GREEN = 0x6f9a8c, PANEL = 0xc89c62, DESK = 0xd9b47e
  const d = 0.65
  const partition = (bx0: number, bz0: number, bx1: number, bz1: number) => {
    k.box(bx0, y, bz0, bx1, y + 1.0, bz1, GREEN)
    k.box(bx0, y + 1.0, bz0, bx1, y + 1.27, bz1, PANEL)
    k.box(bx0, y + 1.27, bz0 - 0.01, bx1, y + 1.3, bz1 + 0.01, CAP)
  }
  partition(x0, zc - 0.03, x1, zc + 0.03)
  for (const x of [x0, x1]) partition(x - 0.03, zc - d, x + 0.03, zc + d)
  const sw = (x1 - x0) / n
  let seat = 0
  for (const side of [-1, 1]) {
    k.box(x0 + 0.03, y + 0.7, zc + side * 0.03, x1 - 0.03, y + 0.73, zc + side * d, DESK)
    for (let i = 0; i < n; i++, seat++) {
      const cx = x0 + sw * (i + 0.5)
      // モニターはアームで仕切りから浮かせる
      const pz = zc + side * 0.07
      k.box(cx - 0.02, y + 0.73, pz - 0.02, cx + 0.02, y + 1.2, pz + 0.02, CAP)
      const mz = zc + side * 0.22
      k.box(cx - 0.28, y + 0.95, mz - 0.02, cx + 0.28, y + 1.29, mz + 0.02, 0x1b1e21)
      if (lit.includes(seat)) k.box(cx - 0.25, y + 0.98, mz + side * 0.02, cx + 0.25, y + 1.26, mz + side * 0.025, 0x8fc3f0, 'light')
      k.box(cx - 0.22, y + 0.73, zc + side * 0.42 - 0.07, cx + 0.22, y + 0.75, zc + side * 0.42 + 0.07, 0x2a2d30)
      if (seat === laptop) {
        k.box(cx + 0.2, y + 0.73, zc + side * 0.5 - 0.12, cx + 0.52, y + 0.75, zc + side * 0.5 + 0.12, 0xe8e8e6)
        k.box(cx + 0.2, y + 0.75, zc + side * 0.38 - 0.01, cx + 0.52, y + 0.97, zc + side * 0.38 + 0.01, 0xe8e8e6)
        k.box(cx + 0.22, y + 0.77, zc + side * 0.39, cx + 0.5, y + 0.95, zc + side * 0.395, 0xb6d4f2, 'light')
      }
      chair(k, cx, y, zc + side * (d + 0.35), side)
    }
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
 * ソフトウェア工房（写真：北の壁ぎわから南を向いて撮ったパノラマ。左＝東が廊下とエレベーターホール、右＝西が外壁の窓）。
 * 背中合わせの机の島が 2 つ（木と緑の仕切り、アームのモニター、黒いメッシュの椅子）、南の壁いっぱいのホワイトボードと
 * 天井のプロジェクター、南西の角に倉庫用のスチールラックに並べたサーバー用途のデスクトップ PC。
 * LAN ケーブルはラックから天井へ上がり、天井の下を通って各島の仕切りの上のハブへ下りる
 */
function softwareStudio(k: Kit, x0: number, x1: number, z0: number, z1: number, y: number, ceil: number) {
  // 床はグレーのタイルカーペット、ホワイトボードの前にジョイントマット
  k.box(x0, y, z0, x1, y + 0.01, z1, 0x7f858a)
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) k.box(x1 - 0.8 + i * 0.4, y + 0.01, 13.4 + j * 0.6, x1 - 0.4 + i * 0.4, y + 0.025, 14.0 + j * 0.6, (i + j) % 2 ? 0xe7dcc6 : 0x6b4a36)
  }

  cubicleIsland(k, 0.5, 4.4, 12.6, y, 3, [1, 4], 4)
  cubicleIsland(k, 0.0, 3.3, 15.9, y, 3, [2])

  // 南の壁：ホワイトボード 2 枚と時計、天井のプロジェクター
  for (const [za, zb] of [[11.3, 13.1], [13.2, 15.0]]) {
    k.box(x1 - 0.04, y + 0.85, za, x1, y + 2.15, zb, 0xb0b4b8)
    k.box(x1 - 0.05, y + 0.88, za + 0.03, x1 - 0.04, y + 2.12, zb - 0.03, 0xfbfbfa)
    k.box(x1 - 0.12, y + 0.85, za, x1 - 0.04, y + 0.88, zb, 0xb0b4b8)
  }
  k.box(x1 - 0.03, y + 2.7, 12.98, x1, y + 3.04, 13.32, 0x3a3e42)
  k.box(x1 - 0.04, y + 2.72, 13.0, x1 - 0.03, y + 3.02, 13.3, 0xf7f7f5)
  k.box(2.3, ceil - 0.25, 12.95, 2.34, ceil, 12.99, 0x9aa0a5)
  k.box(2.1, ceil - 0.42, 12.75, 2.55, ceil - 0.25, 13.2, 0xf2f2f0)
  // 空気清浄機
  k.box(x1 - 0.45, y, 14.75, x1 - 0.1, y + 0.6, 15.1, 0xf0f0ee)

  // 北の壁ぎわの白いスチール棚
  k.box(x0, y, 12.2, x0 + 0.4, y + 2.0, 13.4, 0xe4e6e6)

  // 西の外壁の窓（K1号館の 1 階の西面の窓のうち、この部屋に入るもの）に濃いグレーのブラインド
  const bx = 2.71, bw = 0.77
  k.box(bx - bw, y + 0.88, z1 - 0.24, bx + bw, y + 3.38, z1 - 0.21, 0x3b4542)
  for (let yy = y + 1.0; yy < y + 3.35; yy += 0.12) k.box(bx - bw, yy, z1 - 0.25, bx + bw, yy + 0.02, z1 - 0.24, 0x55605c)

  // 南西の角のスチールラック：棚 4 段にタワー型の PC が並び、天板に青いコンテナとモニター
  const rx0 = 3.5, rx1 = 5.2, rz0 = z1 - 0.65, rz1 = z1 - 0.05
  const RACK = 0xd3d7d9
  for (const x of [rx0, rx1 - 0.04]) for (const z of [rz0, rz1 - 0.04]) k.box(x, y, z, x + 0.04, y + 1.9, z + 0.04, RACK)
  const shelves = [0.1, 0.6, 1.1, 1.6]
  for (const sy of shelves) k.box(rx0, y + sy, rz0, rx1, y + sy + 0.03, rz1, RACK)
  for (const sy of shelves.slice(0, 3)) {
    for (let x = rx0 + 0.08, i = 0; x < rx1 - 0.25; x += 0.27, i++) {
      k.box(x, y + sy + 0.03, rz0 + 0.08, x + 0.2, y + sy + 0.45, rz1 - 0.05, i % 3 === 1 ? 0xb8bcc0 : 0x2a2d31)
      k.box(x + 0.08, y + sy + 0.35, rz0 + 0.075, x + 0.12, y + sy + 0.38, rz0 + 0.08, i % 2 ? 0x7cf28f : 0x6fb6ff, 'light')
    }
  }
  for (let x = rx0 + 0.05; x < rx1 - 0.35; x += 0.4) k.box(x, y + 1.63, rz0 + 0.05, x + 0.36, y + 1.85, rz1 - 0.05, 0x2f7fd8)
  k.box(rx1 - 0.4, y + 1.63, rz0 + 0.2, rx1 - 0.05, y + 2.0, rz0 + 0.24, 0x1b1e21)

  // LAN ケーブル：ラックの上から天井へ、天井の下を通って各島の仕切りの上のハブへ
  const cy = ceil - 0.05
  const rackTop: Pt = [4.35, z1 - 0.35]
  drop(k, rackTop[0], rackTop[1], y + 1.85, cy)
  for (const [hx, hz] of [[2.45, 12.6], [1.65, 15.9]] as Pt[]) {
    for (const o of [0, 0.05]) {
      cable(k, [[rackTop[0] + o, rackTop[1]], [rackTop[0] + o, hz + o], [hx, hz + o]], cy - o)
      drop(k, hx, hz + o, y + 1.3, cy - o)
    }
    k.box(hx - 0.12, y + 1.3, hz - 0.06, hx + 0.12, y + 1.35, hz + 0.08, 0xf2f2f0)
  }

  // 天井の空調（カセット形）
  for (const [ax, az] of [[1.2, 12.0], [3.6, 16.2]] as Pt[]) {
    k.box(ax - 0.45, ceil - 0.06, az - 0.45, ax + 0.45, ceil, az + 0.45, 0xf2f2f0)
    k.box(ax - 0.3, ceil - 0.065, az - 0.3, ax + 0.3, ceil - 0.06, az + 0.3, 0x8a8f94)
  }
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

function meetingRoom(k: Kit, x0: number, x1: number, _z0: number, _z1: number, y: number) {
  deskIsland(k, (x0 + x1) / 2, y, 14.2, 3.2, 1.2, 0xe8e6e0, 0x4a5a6a)
}

function serverRoom(k: Kit, x0: number, _x1: number, _z0: number, _z1: number, y: number) {
  for (const z of [11.6, 13.4, 15.2]) {
    k.box(x0 + 0.2, y, z, x0 + 1.2, y + 2.0, z + 1.2, 0x22262a)
    for (let yy = y + 0.2; yy < y + 1.9; yy += 0.15) k.box(x0 + 1.2, yy, z + 0.2, x0 + 1.21, yy + 0.02, z + 0.5, 0x6fb6ff, 'light')
  }
}

function kaitPia(k: Kit, x0: number, x1: number, _z0: number, _z1: number, y: number) {
  for (let x = x0 + 2; x < x1 - 1.5; x += 3.2) for (const z of [12.6, 15.6]) deskIsland(k, x, y, z, 1.8, 1.0, WOOD, ORANGE)
  plant(k, x1 - 0.6, y, 17.2, 1.8)
}
