import { cw, deskIsland, facade, interior, pcRow, plant, rectSides, rng, shelfRow, type CellKind, type Kit, type WindowSize } from './kit'
import { car, GLASS, h3, levels, OFFWHITE, ORANGE, roof, rooftop, WHITE, WOOD, type Model, type Pt } from './parts'

// 中庭の外側の 17 棟（C・E 系統、A 系統、KAIT TOWN、KAIT広場、KAIT ERIM、E7号館）。
// 寸法は OSM（PLATEAU 由来）の外形と高さ、外観は大学公式のキャンパスマップの写真を見て作った。
// KAIT ERIM は OSM に外形が無いので、写真と公式マップのイラストから大きさを推定している（E7号館は航空写真で測った）。
// 座標は建物ローカル（原点 = 敷地の外接矩形の中心、+X 南・+Z 西）。

type Cell = CellKind | ({ kind: 'window' } & WindowSize)

const len = (s: { a: Pt; b: Pt }) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])

/** 柱間の中心の位置（a→b の線上） */
function bayCenter(s: { a: Pt; b: Pt }, i: number, bays: number): Pt {
  const t = (i + 0.5) / bays
  return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]
}

/**
 * 凹凸のある外形の棟：多角形の各辺に外壁を立て、屋上のスラブとパラペットを載せる。
 * cell には辺の外向きの法線 (nx, nz) を渡すので、面の向き（西面だけガラス、など）で窓を変えられる
 */
function polyShell(
  k: Kit,
  pts: readonly Pt[],
  o: {
    levels: number[]
    bay: number
    cell: (f: number, i: number, bays: number, n: Pt, length: number) => Cell
    wall: number
    glass: number
    frame?: number
    win?: WindowSize
    parapet: number
  },
) {
  const poly = cw(pts)
  const top = o.levels[o.levels.length - 1]
  poly.forEach((a, idx) => {
    const b = poly[(idx + 1) % poly.length]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l < 0.2) return
    const n: Pt = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]
    const bays = Math.max(1, Math.round(l / o.bay))
    // 短い辺（角の丸みや小さな出っ張り）は壁だけ
    const cell = l < o.bay * 0.7 ? () => 'wall' as const : (f: number, i: number) => o.cell(f, i, bays, n, l)
    facade(k, { a, b, levels: o.levels, bays, cell, wall: o.wall, glass: o.glass, frame: o.frame, win: o.win })
    k.slabWall(a, b, top, top + o.parapet, 0.3, o.wall)
  })
  k.prism(poly, top - 0.3, top + 0.05, 0xc9c7c1, 'solid', false)
}

/** X 形のブレース（鉄骨の筋かい）。x 一定の鉛直面に、z0..z1 × y0..y1 の対角線 2 本 */
function xBraceX(k: Kit, x: number, z0: number, z1: number, y0: number, y1: number, color: number, w = 0.22) {
  const d = (w / 2) * Math.hypot(z1 - z0, y1 - y0) / Math.abs(z1 - z0)
  k.quad([x, y0, z0], [x, y0 + 0.001, z0], [x, y1 + d, z1], [x, y1 - d, z1], color)
  k.quad([x, y0 - d, z0], [x, y0 + d, z0], [x, y1, z1], [x, y1 - 0.001, z1], color)
  k.quad([x, y1 - d, z0], [x, y1 + d, z0], [x, y0, z1], [x, y0 + 0.001, z1], color)
}

/** X 形のブレースの z 一定版 */
function xBraceZ(k: Kit, z: number, x0: number, x1: number, y0: number, y1: number, color: number, w = 0.22) {
  const d = (w / 2) * Math.hypot(x1 - x0, y1 - y0) / Math.abs(x1 - x0)
  k.quad([x0, y0 - d, z], [x0, y0 + d, z], [x1, y1 + d, z], [x1, y1 - d, z], color)
  k.quad([x0, y1 - d, z], [x0, y1 + d, z], [x1, y0 + d, z], [x1, y0 - d, z], color)
}

/** z 一定の面に貼るアーチ窓（下が四角、上が半円のガラス） */
function archWindow(k: Kit, x: number, z: number, y0: number, w: number, h: number, color: number) {
  const r = w / 2
  const yc = y0 + h - r
  k.quad([x - r, y0, z], [x + r, y0, z], [x + r, yc, z], [x - r, yc, z], color, 'glass')
  const n = 8
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI
    const p0: [number, number, number] = [x + Math.cos(a0) * r, yc + Math.sin(a0) * r, z]
    const p1: [number, number, number] = [x + Math.cos(a1) * r, yc + Math.sin(a1) * r, z]
    k.quad([x, yc, z], p0, p1, p1, color, 'glass')
  }
}

/** 展示のロボット（人型）。研究棟の展示室に置く */
function robot(k: Kit, x: number, y: number, z: number, h: number, color: number, angle = 0) {
  const s = h / 1.6
  k.obox(x, y, z, 0.18 * s, 0.7 * s, 0.14 * s, angle, 0x3a3d42)
  k.obox(x, y + 0.7 * s, z, 0.42 * s, 0.5 * s, 0.26 * s, angle, color)
  k.obox(x, y + 1.22 * s, z, 0.26 * s, 0.24 * s, 0.24 * s, angle, 0xeeeeee)
  k.obox(x, y + 1.27 * s, z, 0.2 * s, 0.06 * s, 0.25 * s, angle, 0x6fd8ff, 'light')
}

/** フォーミュラカー（学生フォーミュラ）：低い車体に前後のウイング */
function formulaCar(k: Kit, x: number, y: number, z: number, angle: number, color: number) {
  const c = Math.cos(angle), s = Math.sin(angle)
  const at = (u: number, v: number): Pt => [x + u * c + v * s, z - u * s + v * c]
  k.obox(x, y + 0.2, z, 3.0, 0.35, 0.7, angle, color)
  k.obox(...withY(at(-0.2, 0), y + 0.55), 0.8, 0.3, 0.5, angle, 0x23262a)
  k.obox(...withY(at(1.7, 0), y + 0.12), 0.4, 0.06, 1.5, angle, 0x23262a)
  k.obox(...withY(at(-1.6, 0), y + 0.9), 0.35, 0.06, 1.1, angle, color)
  k.obox(...withY(at(-1.5, 0), y + 0.4), 0.1, 0.5, 0.1, angle, 0x23262a)
  for (const [u, v] of [[1.0, 0.7], [1.0, -0.7], [-1.0, 0.72], [-1.0, -0.72]]) {
    const [wx, wz] = at(u, v)
    k.cylinder(wx, wz, 0.28, y, y + 0.56, 0x1b1d20, 8)
  }

  function withY(p: Pt, py: number): [number, number, number] {
    return [p[0], py, p[1]]
  }
}

/** 太陽光パネル（南＝+X 側が低い向きに傾けた板）。x0..x1 × z0..z1 の範囲に、高さ y から */
function solarPanel(k: Kit, x0: number, z0: number, x1: number, z1: number, y: number) {
  const lift = (x1 - x0) * 0.45
  k.quad([x1, y + 0.3, z0], [x1, y + 0.3, z1], [x0, y + 0.3 + lift, z1], [x0, y + 0.3 + lift, z0], 0x1d3358)
  // 格子の線（セルの区切り）
  for (let z = z0 + 0.5; z < z1; z += 0.5) k.quad([x1, y + 0.31, z - 0.01], [x1, y + 0.31, z + 0.01], [x0, y + 0.31 + lift, z + 0.01], [x0, y + 0.31 + lift, z - 0.01], 0xb8c2cc)
  for (const z of [z0 + 0.2, z1 - 0.2]) k.box(x0 + 0.05, y, z - 0.05, x0 + 0.15, y + 0.3 + lift, z + 0.05, 0x9aa1a6)
}

// ---------------------------------------------------------------------------
// KAIT TOWN（地域連携・eスポーツの拠点）：白い 2 階建て。1 階はガラス張り、2 階は横長の窓が連続する。
// 1 階と 2 階のあいだを白い庇が一周し、屋上の縁に赤い「KAIT TOWN」の切り文字。中は市民・eスポーツホール。
const town: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = [0, 4.4, 8.3]
  for (const s of rectSides(-X, -Z, X, Z)) {
    const bays = Math.max(2, Math.round(len(s) / 2.4))
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => (f === 0 ? (i % 4 === 0 ? 'wall' : 'curtain') : { kind: 'window', w: 0.92, h: 0.5, sill: 0.28 }),
      wall: WHITE, glass: 0x4f6878, frame: 0x3a3f44,
    })
  }
  k.box(-X - 0.9, 4.05, -Z - 0.9, X + 0.9, 4.4, Z + 0.9, WHITE)
  roof(k, -X, -Z, X, Z, lv[2], 0.6, WHITE)
  rooftop(k, -X + 1, -Z + 1, X - 1, Z - 1, lv[2], rng(81))
  k.sign('KAIT TOWN', 0, lv[2] + 1.0, Z + 0.4, 11, 1.4, 0, '#c8282e')
  k.sign('KAIT TOWN', -X - 0.4, lv[2] + 1.0, -Z / 3, 11, 1.4, -Math.PI / 2, '#c8282e')
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: lv, seed: 21,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // 市民・eスポーツホール：正面の大型スクリーンと、並んだ椅子
        kk.box(-X + 1.5, y + 0.9, Z - 1.4, X - 1.5, y + 3.6, Z - 1.2, 0x1b2a4a)
        kk.quad([-X + 1.7, y + 1.0, Z - 1.45], [X - 1.7, y + 1.0, Z - 1.45], [X - 1.7, y + 3.5, Z - 1.45], [-X + 1.7, y + 3.5, Z - 1.45], 0x5fb8ff, 'light')
        for (let z = Z - 5; z > -Z + 3; z -= 1.6) {
          for (let x = -X + 2; x < X - 1.5; x += 1.0) kk.box(x - 0.22, y + 0.42, z - 0.22, x + 0.22, y + 0.48, z + 0.22, 0x2b3f6b)
        }
      } else {
        // eスポーツのトレーニングルーム：ゲーミング PC の列
        for (let z = -Z + 3; z < Z - 2; z += 3.4) pcRow(kk, -X + 2, X - 2, y, z, 1)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// C7号館 HEMS認証支援センター：白い小さな 2 階建て。屋上に太陽光パネル、脇に電気自動車と案内板。
const c7: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = [0, 3.4, 6.3]
  for (const s of rectSides(-X, -Z, X, Z)) {
    const bays = Math.max(2, Math.round(len(s) / 1.8))
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => (f === 0 ? (s.side === 'w' && i === 1 ? 'curtain' : 'window') : i % 2 ? { kind: 'window', w: 0.8, h: 0.28, sill: 0.45 } : 'wall'),
      wall: 0xf2f3f3, glass: GLASS, win: { w: 0.6, h: 0.5, sill: 0.3 },
    })
  }
  roof(k, -X, -Z, X, Z, lv[2], 0.5, 0xf2f3f3)
  for (let z = -Z + 0.8; z < Z - 2; z += 2.6) solarPanel(k, -X + 1, z, -X + 4, z + 2.3, lv[2])
  for (let z = -Z + 0.8; z < Z - 2; z += 2.6) solarPanel(k, 0.5, z, 3.5, z + 2.3, lv[2])
  // 西の脇：電気自動車（白）と案内板
  car(k, 0, 0.05, Z + 1.9, 0, 0xf2f2f0)
  k.box(X - 1.2, 0, Z + 0.6, X - 1.1, 1.0, Z + 0.7, 0x9aa1a6)
  k.box(X - 1.9, 1.0, Z + 0.6, X - 0.4, 2.0, Z + 0.7, 0xf6f7f8)
  k.sign('HEMS', X - 1.15, 1.7, Z + 0.72, 1.3, 0.5, 0, '#2a4c9a')
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: lv, seed: 22,
    furnish: (kk, f, y) => {
      // 家庭用蓄電池と制御盤（灰色の箱に緑のランプ）、作業机
      for (let z = -Z + 1.2; z < Z - 1; z += 1.4) {
        kk.box(-X + 0.6, y, z - 0.5, -X + 1.3, y + 1.4, z + 0.5, 0xd9dcdf)
        kk.quad([-X + 1.31, y + 1.1, z - 0.1], [-X + 1.31, y + 1.1, z + 0.1], [-X + 1.31, y + 1.2, z + 0.1], [-X + 1.31, y + 1.2, z - 0.1], 0x5df07a, 'light')
      }
      deskIsland(kk, 1.5, y, f ? 0 : -1.5, 2.4, 1.0, 0xf0eee8, 0x3b4a5c)
    },
  })
}

// ---------------------------------------------------------------------------
// C5号館 自動車システム開発研究棟：4 階建て。全面が濃い鏡のようなガラスで、各階に銀色の水平の帯。
// 1 階のロビーにはフォーミュラカーとソーラーカーが展示されている。
const c5: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = [0, 4.2, 7.4, 10.6, 13.3]
  const MIRROR = 0x2f3b47
  const SILVER = 0xb9c0c6
  for (const s of rectSides(-X, -Z, X, Z)) {
    facade(k, { a: s.a, b: s.b, levels: lv, bays: Math.round(len(s) / 2.8), cell: () => 'curtain', wall: SILVER, glass: MIRROR, frame: SILVER, depth: 0.25 })
  }
  // 各階の銀色の水平の帯（外へ張り出す）と、最上階の水平ルーバー
  for (const y of lv.slice(1, 4)) k.box(-X - 0.6, y - 0.1, -Z - 0.6, X + 0.6, y + 0.35, Z + 0.6, SILVER)
  for (let y = lv[3] + 0.6; y < lv[4] - 0.3; y += 0.45) {
    k.box(-X - 0.45, y, -Z - 0.45, -X - 0.3, y + 0.08, Z + 0.45, 0xd5dade)
    k.box(X + 0.3, y, -Z - 0.45, X + 0.45, y + 0.08, Z + 0.45, 0xd5dade)
  }
  roof(k, -X, -Z, X, Z, lv[4], 0.5, SILVER)
  // 中庭（光庭）2 つ：屋上に開いた吹き抜けの縁
  for (const z of [-12, 12]) k.box(-5.6, lv[4], z - 2.5, 5.6, lv[4] + 0.6, z + 2.5, 0x8fa3b3, 'glass')
  rooftop(k, -X + 2, -Z + 2, X - 2, Z - 2, lv[4], rng(91))
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: lv, seed: 23,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // ロビーの展示：フォーミュラカー（赤）とソーラーカー（白）
        formulaCar(kk, -6, y, Z - 6, 0.3, 0xd02a2a)
        formulaCar(kk, 6, y, Z - 7, -0.2, 0x1f4fa0)
        kk.obox(0, y + 0.35, Z - 14, 4.6, 0.25, 1.6, 0.1, WHITE)
        kk.obox(0.2, y + 0.6, Z - 14, 3.6, 0.04, 1.4, 0.1, 0x1e2f5a, 'light')
        for (const z of [-Z + 6, 0]) plant(kk, X - 3, y, z, 2.0)
      } else {
        // 研究室：机の島と、エンジンの試験台のような箱
        for (let z = -Z + 4; z < Z - 3; z += 6) {
          deskIsland(kk, -X + 5, y, z, 3.2, 1.2, 0xe8e6e0, 0x4a5a6a)
          kk.box(X - 7, y, z - 1, X - 4, y + 1.2, z + 1, 0x5d6870)
        }
      }
    },
  })
}

// ---------------------------------------------------------------------------
// C2号館 機械・電気電子研究棟：白い 7 階建ての細長い研究棟。横長の窓が並び、両端と中央（南面）の
// 階段室は白い X 形のブレースで囲われている。2 階にフライトシミュレータの実習室。
const c2: Model = (k, b) => {
  const X = b.width / 2
  const z0 = -41.6, z1 = 42.0
  const lv = levels(4.0, 3.7, 7)
  const top = lv[lv.length - 1]
  const notch = [-4.7, 5.5]
  for (const s of rectSides(-X, z0, X, z1)) {
    const bays = Math.max(2, Math.round(len(s) / 3.3))
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => {
        const [, cz] = bayCenter(s, i, bays)
        // 南面の中央は奥まった階段室（あとで作る）
        if (s.side === 's' && cz > notch[0] && cz < notch[1]) return 'open'
        if (f === 0 && s.side === 'w') return 'curtain'
        return { kind: 'window', w: 0.82, h: 0.5, sill: 0.3 }
      },
      wall: WHITE, glass: 0x7d9cb2,
    })
  }
  roof(k, -X, z0, X, z1, top, 0.8, WHITE)
  rooftop(k, -X + 2, z0 + 3, X - 2, z1 - 3, top, rng(92))
  // 中央の階段室：奥の壁と、各階の踊り場、外側の X ブレース
  k.box(6.6, 0, notch[0], 7.0, top + 0.8, notch[1], OFFWHITE)
  for (const z of notch) k.box(7.0, 0, z - 0.2, X, top + 0.8, z + 0.2, WHITE)
  for (let i = 1; i < lv.length; i++) {
    k.box(7.0, lv[i] - 0.25, notch[0], X, lv[i], notch[1], WHITE)
    xBraceX(k, X - 0.1, notch[0] + 0.2, notch[1] - 0.2, lv[i - 1], lv[i] - 0.25, WHITE)
  }
  // 両端の階段室（外へ出っ張る、白いフレームと X ブレース）
  for (const [zIn, zOut] of [[z1, z1 + 2.6], [z0, z0 - 2.6]]) {
    for (const x of [-2.8, 3.2]) k.box(x - 0.2, 0, Math.min(zIn, zOut), x + 0.2, top + 1.2, Math.max(zIn, zOut), WHITE)
    for (let i = 1; i < lv.length; i++) {
      k.box(-2.8, lv[i] - 0.25, Math.min(zIn, zOut), 3.2, lv[i], Math.max(zIn, zOut), WHITE)
      xBraceZ(k, zOut, -2.6, 3.0, lv[i - 1], lv[i] - 0.25, WHITE)
      // 中の階段（斜めの板）
      k.obox(0.2, lv[i - 1] + 1.5, (zIn + zOut) / 2, 5.2, 0.2, 1.0, 0, 0xd8d8d4)
    }
    k.box(-2.8, top + 1.0, Math.min(zIn, zOut), 3.2, top + 1.2, Math.max(zIn, zOut), WHITE)
  }
  interior(k, {
    x0: -X, z0, x1: X, z1, levels: lv, seed: 24,
    furnish: (kk, f, y) => {
      if (f === 1) {
        // フライトシミュレータ：操縦席と、前に並んだ光る計器・外の景色のモニター
        for (const z of [-20, -8, 8, 20]) {
          kk.box(-3, y, z - 1.2, 3, y + 2.4, z - 1.0, 0x1b1d22)
          kk.quad([-2.8, y + 0.9, z - 0.95], [2.8, y + 0.9, z - 0.95], [2.8, y + 2.2, z - 0.95], [-2.8, y + 2.2, z - 0.95], 0x8cc8ff, 'light')
          kk.box(-1.2, y, z - 0.6, 1.2, y + 0.9, z, 0x30343a)
          for (const x of [-0.6, 0.6]) kk.box(x - 0.3, y + 0.4, z + 0.3, x + 0.3, y + 1.1, z + 0.7, 0x3a4a6a)
        }
      } else {
        // 研究室：窓際の机と、工作機械
        for (let z = z0 + 4; z < z1 - 3; z += 5) {
          deskIsland(kk, -X + 4, y, z, 3.0, 1.1, 0xe8e6e0, 0x4a5a6a)
          if (f === 0) kk.box(X - 6, y, z - 1, X - 3, y + 1.5, z + 1, 0x5f7f8f)
          else deskIsland(kk, X - 4, y, z, 3.0, 1.1, 0xe8e6e0, 0x4a5a6a)
        }
      }
    },
  })
}

// ---------------------------------------------------------------------------
// KAIT広場（石上純也、2020）：柱の無い 1 枚の薄い鉄板の屋根が、広場全体を覆う。
// 屋根には大小の四角い開口が散らばり、床（実際はすり鉢状に下がっている）に光の四角が落ちる。
// 地面より下は作れないので、床は平らにして、屋根の縁の白い帯（実物は斜面に沿って地面に近づく）で表している。
const PLAZA: Pt[] = [[44.4, -21.2], [2.3, -23.7], [-33.8, -27.7], [-37.8, -2.1], [-44.5, 27.7], [42.2, 24.9]]
const plaza: Model = (k) => {
  const outline = cw(PLAZA)
  const top = 3.0
  const r = rng(2020)
  // 開口：重ならないように、外周から 4m 以上内側に置く
  const holes: Pt[][] = []
  const placed: [number, number, number, number][] = []
  const inside = (x: number, z: number) => {
    let c = false
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, zi] = outline[i]
      const [xj, zj] = outline[j]
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c
    }
    return c
  }
  for (let tries = 0; holes.length < 58 && tries < 4000; tries++) {
    const w = 1.2 + r() * r() * 4.2
    const d = w * (0.7 + r() * 0.6)
    const x = -40 + r() * 80
    const z = -24 + r() * 48
    if (![[x - w / 2 - 4, z - d / 2 - 4], [x + w / 2 + 4, z - d / 2 - 4], [x + w / 2 + 4, z + d / 2 + 4], [x - w / 2 - 4, z + d / 2 + 4]].every(([px, pz]) => inside(px, pz))) continue
    if (placed.some(([px, pz, pw, pd]) => Math.abs(px - x) < (pw + w) / 2 + 1.6 && Math.abs(pz - z) < (pd + d) / 2 + 1.6)) continue
    placed.push([x, z, w, d])
    // 穴は外周と逆回り
    holes.push([[x - w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x + w / 2, z - d / 2]])
  }
  k.prism(outline, top - 0.18, top, WHITE, 'solid', true, holes)
  // 屋根の縁の白い帯（小さな四角い窓が点々と並ぶ）
  outline.forEach((a, i) => {
    const b2 = outline[(i + 1) % outline.length]
    k.slabWall(a, b2, 1.4, top, 0.25, WHITE)
    const l = Math.hypot(b2[0] - a[0], b2[1] - a[1])
    for (let u = 6; u < l - 3; u += 9 + (i % 3) * 2) {
      const t = u / l
      const px = a[0] + (b2[0] - a[0]) * t, pz = a[1] + (b2[1] - a[1]) * t
      k.obox(px, 2.0, pz, 0.7, 0.55, 0.3, Math.atan2(-(b2[1] - a[1]), b2[0] - a[0]), 0x6c8296, 'glass')
    }
  })
  // 床：空を映して青みがかった土間。開口の下に日なたの四角（太陽の向きにずらす）
  k.prism(outline, 0, 0.06, 0x8fa3b8, 'solid', false)
  for (const [x, z, w, d] of placed) {
    const sx = x - 1.7, sz = z - 1.3
    k.quad([sx - w / 2, 0.08, sz + d / 2], [sx + w / 2, 0.08, sz + d / 2], [sx + w / 2, 0.08, sz - d / 2], [sx - w / 2, 0.08, sz - d / 2], 0xf4f2ea, 'light')
  }
  // 学生が持ち込んだ机と椅子が、ところどころに
  k.inside(() => {
    for (let i = 0; i < 9; i++) {
      const x = -25 + r() * 50, z = -15 + r() * 30
      if (!inside(x, z)) continue
      k.box(x - 0.6, 0.7, z - 0.6, x + 0.6, 0.75, z + 0.6, WHITE)
      k.box(x - 0.03, 0.06, z - 0.03, x + 0.03, 0.7, z + 0.03, WHITE)
      for (const dz of [-0.9, 0.9]) k.box(x - 0.2, 0.45, z + dz - 0.2, x + 0.2, 0.5, z + dz + 0.2, ORANGE)
    }
  })
}

// ---------------------------------------------------------------------------
// E6号館 自動車工学棟：平屋の工場のような建物。明るい灰色の金属パネルに、屋根の縁の青い帯。
// 南の入口は青い門型のフレームとガラス、北面は大きなシャッター。中は車とドライビングシミュレータ。
const e6: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const H = 6.2
  const PANEL = 0xd9dde0
  const BLUE = 0x2456a8
  for (const s of rectSides(-X, -Z, X, Z)) {
    const bays = Math.max(2, Math.round(len(s) / 3.0))
    facade(k, {
      a: s.a, b: s.b, levels: [0, H], bays,
      cell: (_f, i) => {
        if (s.side === 's' && i >= bays - 4 && i <= bays - 3) return 'curtain'
        return i % 3 === 1 ? { kind: 'window', w: 0.6, h: 0.16, sill: 0.62 } : 'wall'
      },
      wall: PANEL, glass: 0x3e5566, frame: 0x6d7880,
    })
  }
  // 北面のシャッター（横の筋の入った灰色の板）
  for (let z = -Z + 4; z < Z - 4; z += 9) {
    k.box(-X - 0.42, 0, z - 2, -X - 0.36, 4.2, z + 2, 0xaeb3b7)
    for (let y = 0.3; y < 4.2; y += 0.3) k.box(-X - 0.45, y, z - 2, -X - 0.42, y + 0.05, z + 2, 0x8e9498)
  }
  // 屋根の縁の青い帯と屋根、東の端の背の高い部分
  k.box(-X - 0.4, H - 0.75, -Z - 0.4, X + 0.4, H, Z + 0.4, BLUE)
  k.box(-X - 0.3, H, -Z - 0.3, X + 0.3, H + 0.08, Z + 0.3, 0xb9bdc0)
  k.box(-X + 1, H, -Z + 1, X - 1, b.height, -Z + 15, PANEL)
  k.box(-X + 0.9, b.height - 0.4, -Z + 0.9, X - 0.9, b.height, -Z + 15.1, BLUE)
  k.box(-X + 1.1, b.height, -Z + 1.1, X - 1.1, b.height + 0.06, -Z + 14.9, 0xb9bdc0)
  // 南の入口：青い門型のフレーム
  const ez = bayCenter(rectSides(-X, -Z, X, Z)[1], Math.max(2, Math.round((2 * Z) / 3.0)) - 4, Math.max(2, Math.round((2 * Z) / 3.0)))[1]
  for (const dz of [-3.6, 3.6]) k.box(X, 0, ez + dz - 0.25, X + 2.4, 3.6, ez + dz + 0.25, BLUE)
  k.box(X, 3.3, ez - 3.85, X + 2.6, 3.8, ez + 3.85, BLUE)
  k.box(X + 1.6, 3.8, ez - 3.85, X + 2.6, 4.1, ez + 3.85, BLUE)
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: [0, H], seed: 25,
    furnish: (kk, _f, y) => {
      car(kk, -4, y, -14, 0, 0xc8ccd0)
      car(kk, 4, y, -4, Math.PI / 2, 0x2a5aa8)
      car(kk, -4, y, 8, 0.1, 0xd23a2a)
      // ドライビングシミュレータ：車の運転席の前に、弧を描く大きなスクリーン
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + (i / 6) * 1.8
        kk.obox(2 + Math.cos(a) * 4, y + 0.3, 20 + Math.sin(a) * 4, 0.1, 2.4, 1.2, -a, 0x9fd6a0, 'light')
      }
      kk.obox(-0.5, y + 0.3, 20, 2.2, 0.9, 1.6, 0, 0x8a9096)
    },
  })
}

// ---------------------------------------------------------------------------
// E3号館 ロボット・プロジェクト棟：白い 3 階建て。屋上の縁に赤い帯、入口の上に赤い庇。
// 1 階はロボットの展示室（赤い床に人型ロボットが並ぶ）。
const e3: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = levels(4.4, 4.2, 3)
  const top = lv[lv.length - 1]
  const RED = 0xd1262b
  for (const s of rectSides(-X, -Z, X, Z)) {
    const bays = Math.max(2, Math.round(len(s) / 2.6))
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => (f === 0 && s.side === 'w' && i > 0 && i < bays - 1 ? 'curtain' : i % 3 === 2 ? 'wall' : { kind: 'window', w: 0.7, h: 0.42, sill: 0.34 }),
      wall: 0xeef0f0, glass: 0x7f97a8,
    })
  }
  roof(k, -X, -Z, X, Z, top, 0.9, RED)
  k.box(-X - 0.05, top - 0.5, -Z - 0.05, X + 0.05, top, Z + 0.05, RED)
  rooftop(k, -X + 1, -Z + 1, X - 1, Z - 1, top, rng(93))
  // 入口の赤い庇
  k.box(-X + 2, 3.5, Z, X - 2, 3.85, Z + 2.2, RED)
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: lv, seed: 26,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // 展示室：赤い床、人型ロボット、展示台
        kk.box(-X + 0.6, y, -Z + 0.6, X - 0.6, y + 0.02, Z - 0.6, 0xd75a52)
        const colors = [0xe8e8e8, 0x2f7de0, 0xf0c030, 0x333a44]
        for (let i = 0; i < 10; i++) robot(kk, -X + 2 + (i % 5) * 3.4, y, -4 + Math.floor(i / 5) * 7, 1.2 + (i % 3) * 0.4, colors[i % 4], i * 0.6)
        kk.cylinder(0, 4, 1.4, y, y + 0.75, 0xd23a2a, 12)
      } else {
        for (let z = -Z + 3; z < Z - 2; z += 4.5) deskIsland(kk, -X + 4, y, z, 3.0, 1.2, 0xe8e6e0, 0x4a5a6a)
        for (let z = -Z + 4; z < Z - 3; z += 6) robot(kk, X - 3, y, z, 1.4, 0x9aa4ad)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// E4号館 電気・化学実験棟：白い 4 階建て。小さめの窓が規則正しく並び、屋上の縁は薄い緑の帯。
// 中は回路デザイン教育センター（緑の机と黄緑の椅子）。
const e4: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = levels(4.6, 4.5, 4)
  const top = lv[lv.length - 1]
  for (const s of rectSides(-X, -Z, X, Z)) {
    const bays = Math.max(2, Math.round(len(s) / 2.6))
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => (f === 0 && s.side === 's' && i === 1 ? 'curtain' : { kind: 'window', w: 0.46, h: 0.5, sill: 0.3 }),
      wall: 0xf1f2f1, glass: 0x6f8ea6,
    })
  }
  roof(k, -X, -Z, X, Z, top, 1.0, 0xbcd6c6)
  rooftop(k, -X + 1, -Z + 1, X - 1, Z - 1, top, rng(94))
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: lv, seed: 27,
    furnish: (kk, _f, y) => {
      for (let z = -Z + 3; z < Z - 2; z += 3.2) {
        deskIsland(kk, -X + 4, y, z, 3.0, 1.1, 0x3f9a6e, 0xb7d35a)
        deskIsland(kk, X - 4, y, z, 3.0, 1.1, 0x3f9a6e, 0xb7d35a)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// E1号館 ロボット・メカトロニクス研究棟：白い 6 階建て。水色のガラスの窓が縦にそろって並び、
// 東の端に階段室が出っ張る。中は研究室とロボットアーム。
// E2号館 応用化学研究棟：同じ形の 6 階建て。入口まわりに臙脂色の壁、屋上にドラフトの排気筒が並ぶ。
function eTower(k: Kit, b: { width: number; height: number }, kind: 'e1' | 'e2') {
  const X = b.width / 2
  const z0 = -16.5, z1 = 18.9
  const lv = levels(4.4, 3.8, 6)
  const top = lv[lv.length - 1]
  const MAROON = 0x7f2a2c
  for (const s of rectSides(-X, z0, X, z1)) {
    const bays = Math.max(2, Math.round(len(s) / 3.2))
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => {
        if (f === 0 && s.side === 'w' && i > 0 && i < bays - 1) return 'curtain'
        if (kind === 'e1' && s.side === 'w' && i === 1) return 'curtain'
        return kind === 'e1' ? { kind: 'window', w: 0.66, h: 0.56, sill: 0.28 } : { kind: 'window', w: 0.88, h: 0.42, sill: 0.34 }
      },
      wall: kind === 'e1' ? 0xf3f4f4 : 0xeceae6, glass: kind === 'e1' ? 0x8fb4cc : 0x6d8799,
    })
  }
  roof(k, -X, z0, X, z1, top, 0.8, WHITE)
  // 東の階段室
  k.box(0.2, 0, z0 - 2.3, 6.2, top + 1.6, z0, OFFWHITE)
  for (let y = 2; y < top; y += 3.8) k.box(2.6, y, z0 - 2.36, 3.8, y + 1.6, z0 - 2.3, GLASS, 'glass')
  // 塔屋
  k.box(-4, top, -2, 3, top + 2.6, 6, OFFWHITE)
  if (kind === 'e2') {
    // 入口まわりの臙脂色の壁と庇
    k.box(-X - 0.6, 4.0, z1, X + 0.6, 4.6, z1 + 2.4, MAROON)
    for (const x of [-X + 1.2, X - 1.2]) k.box(x - 0.9, 0, z1 + 0.36, x + 0.9, 4.0, z1 + 0.5, MAROON)
    // 屋上の排気筒（実験室のドラフトチャンバー）
    for (let z = z0 + 2; z < z1 - 2; z += 3.4) {
      k.cylinder(X - 2, z, 0.35, top, top + 3.2, 0xb6bcc0, 8)
      k.cylinder(-X + 2, z + 1.2, 0.3, top, top + 2.6, 0xb6bcc0, 8)
    }
    k.box(-X + 1.5, top + 0.4, z0 + 1.5, -X + 2.5, top + 1.2, z1 - 1.5, 0xa9adb0)
  } else {
    rooftop(k, -X + 1, z0 + 1, X - 1, z1 - 1, top, rng(95))
  }
  interior(k, {
    x0: -X, z0, x1: X, z1, levels: lv, seed: kind === 'e1' ? 28 : 29,
    furnish: (kk, f, y) => {
      for (let z = z0 + 3; z < z1 - 2; z += 4.2) {
        if (kind === 'e1') {
          deskIsland(kk, -X + 4, y, z, 3.0, 1.1, 0xe8e6e0, 0x4a5a6a)
          // ロボットアーム（台座・腕・オレンジの関節）
          kk.cylinder(X - 3.5, z, 0.35, y, y + 0.8, 0x5d6870, 10)
          kk.obox(X - 3.5, y + 0.8, z, 0.2, 1.0, 0.2, 0.4, ORANGE)
          kk.obox(X - 3.1, y + 1.7, z + 0.2, 0.9, 0.18, 0.18, 0.4, 0xe8e8e8)
        } else {
          // 実験台（白い天板）と壁際のドラフトチャンバー
          deskIsland(kk, -X + 4.5, y, z, 1.4, 3.0, 0xf4f4f2, 0x3d4d5d)
          if (f > 0) kk.box(X - 1.6, y, z - 0.8, X - 0.6, y + 2.2, z + 0.8, 0xd6dadc)
        }
      }
    },
  })
}
const e1: Model = (k, b) => eTower(k, b, 'e1')
const e2: Model = (k, b) => eTower(k, b, 'e2')

// ---------------------------------------------------------------------------
// KAIT ERIM（女子学生のシェアハウス）：グレージュの塗り壁の 3 階建てが 2 棟、低い棟でつながる。
// 妻面にはアーチ窓、長い面には縦長の窓。1 階は食堂と団らんのスペース。
const erim: Model = (k) => {
  const lv = levels(3.6, 3.3, 3)
  const top = lv[lv.length - 1]
  const STUCCO = 0xa99b8a
  const DARK = 0x3d4650
  for (const [x0, x1] of [[-15, -4], [4, 15]]) {
    const Z = 25
    for (const s of rectSides(x0, -Z, x1, Z)) {
      const bays = Math.max(2, Math.round(len(s) / 2.8))
      const gable = s.side === 'e' || s.side === 'w'
      facade(k, {
        a: s.a, b: s.b, levels: lv, bays,
        cell: (f, i) => (gable ? 'wall' : (i + f) % 4 === 3 ? 'wall' : { kind: 'window', w: 0.34, h: 0.66, sill: 0.16 }),
        wall: STUCCO, glass: DARK, frame: 0x6a6258,
      })
      if (gable) {
        // 妻面のアーチ窓（2 列 × 各階）
        const zf = s.side === 'w' ? Z + 0.37 : -Z - 0.37
        for (const f of [0, 1, 2]) for (const t of [0.3, 0.7]) archWindow(k, x0 + (x1 - x0) * t, zf, lv[f] + 0.5, 1.1, 2.3, DARK)
      }
    }
    roof(k, x0, -Z, x1, Z, top, 0.8, STUCCO)
  }
  // 2 棟をつなぐ低い棟（エントランス）
  for (const s of rectSides(-4, -6, 4, 6)) {
    if (s.side === 'n' || s.side === 's') continue
    facade(k, { a: s.a, b: s.b, levels: [0, 3.6], bays: 3, cell: (_f, i) => (i === 1 ? 'curtain' : 'wall'), wall: STUCCO, glass: DARK })
  }
  roof(k, -4, -6, 4, 6, 3.6, 0.5, STUCCO)
  interior(k, {
    x0: -15, z0: -25, x1: -4, z1: 25, levels: lv, seed: 30,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // 食堂：木の長テーブル
        for (let z = -20; z < 20; z += 6) deskIsland(kk, -9.5, y, z, 4.0, 1.0, WOOD, 0xe8dcc8)
      } else {
        // 個室：ベッドと机（窓際）
        for (let z = -22; z < 22; z += 4.2) {
          kk.box(-14.2, y, z, -12.2, y + 0.5, z + 1.0, 0xf3efe6)
          kk.box(-6.0, y + 0.72, z, -4.8, y + 0.76, z + 1.2, WOOD)
        }
      }
    },
  })
  interior(k, {
    x0: 4, z0: -25, x1: 15, z1: 25, levels: lv, seed: 31,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // 学習と団らんのスペース：ソファと本棚
        for (let z = -18; z < 18; z += 7) {
          kk.box(6, y, z - 1.2, 7, y + 0.8, z + 1.2, 0x9c6b4a)
          kk.box(9, y + 0.4, z - 0.6, 10.4, y + 0.45, z + 0.6, WOOD)
        }
        shelfRow(kk, 5, 14, y, 22, 2.0, WOOD, rng(32))
      } else {
        for (let z = -22; z < 22; z += 4.2) {
          kk.box(12.2, y, z, 14.2, y + 0.5, z + 1.0, 0xf3efe6)
          kk.box(4.8, y + 0.72, z, 6.0, y + 0.76, z + 1.2, WOOD)
        }
      }
    },
  })
}

// ---------------------------------------------------------------------------
// E7号館 新実験実習棟：白とチャコールの 2 階建て。張り出した薄い屋根、2 階の南側にデッキの通路。
// 1 階はシャッター、中には青い大きな風洞実験装置。
const e7: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const cx1 = X - 2.2 // 本体の南端（その外はデッキ）
  const lv = [0, 3.8, 7.3]
  for (const s of rectSides(-X, -Z, cx1, Z)) {
    const bays = Math.max(2, Math.round(len(s) / 2.4))
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => (f === 0 ? (i % 2 ? 'wall' : 'curtain') : s.side === 's' ? (i % 3 === 0 ? 'wall' : 'curtain') : i % 2 ? 'wall' : { kind: 'window', w: 0.5, h: 0.6, sill: 0.2 }),
      wall: 0xeeeeec, glass: 0x4a5a66, frame: 0x3a3e42,
    })
  }
  // 1 階のシャッター（北面）
  for (let z = -Z + 3; z < Z - 2; z += 6) k.box(-X - 0.42, 0, z - 2, -X - 0.36, 3.3, z + 2, 0x9aa0a5)
  // 張り出した屋根と、2 階のデッキ（床・手すり）
  k.box(-X - 1, lv[2], -Z - 1, X + 0.6, lv[2] + 0.3, Z + 1, 0xcfd2d4)
  k.box(cx1, lv[1] - 0.25, -Z, X, lv[1], Z, 0xbfc3c6)
  for (let z = -Z; z <= Z; z += 1.5) k.box(X - 0.06, lv[1], z - 0.03, X, lv[1] + 1.1, z + 0.03, 0x6a6f74)
  k.box(X - 0.08, lv[1] + 1.05, -Z, X, lv[1] + 1.12, Z, 0x6a6f74)
  // デッキへの外階段
  k.obox(X - 1, 1.6, Z - 3, 1.0, 0.2, 5.0, 0, 0xbfc3c6)
  k.sign('E7', 0, lv[1] + 1.8, Z + 0.4, 2.2, 1.6, 0, '#2e3236')
  interior(k, {
    x0: -X, z0: -Z, x1: cx1, z1: Z, levels: lv, seed: 33,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // 風洞：青い大きなダクト（ラッパ状の吹き出し口と、それを支える鉄骨）
        // 長さは棟の長さによらず 18m（西の端の寄り）
        const t0 = Z - 24, t1 = Z - 6
        kk.box(-3.4, y + 0.6, t0, -0.4, y + 3.2, t1, 0x2a7bd6)
        kk.box(-3.9, y + 0.3, t1, 0.1, y + 3.4, t1 + 2, 0x2a7bd6)
        for (let z = t0 + 0.5; z < t1; z += 3) for (const x of [-3.5, -0.3]) kk.box(x - 0.08, y, z - 0.08, x + 0.08, y + 0.6, z + 0.08, 0x1f5fb0)
        kk.box(0.3, y, Z - 3.5, 1.4, y + 0.75, Z - 1.5, 0xe9e6df)
      } else {
        for (let z = -Z + 3; z < Z - 2; z += 4) deskIsland(kk, -0.8, y, z, 3.0, 1.0, 0xe8e6e0, 0x4a5a6a)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// A2号館 第1体育館：クリーム色の古い体育館。1 階は小窓、上は高窓の帯、屋根はゆるいヴォールトで縁が青緑。
const a2: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const H = 9.0
  const CREAM = 0xe9e0c8
  const TEAL = 0x5f9e94
  for (const s of rectSides(-X, -Z, X, Z)) {
    const bays = Math.max(2, Math.round(len(s) / 3.0))
    facade(k, {
      a: s.a, b: s.b, levels: [0, 3.6, H], bays,
      cell: (f, i) => (f === 0 ? (i % 3 === 0 && s.side === 'w' ? 'curtain' : { kind: 'window', w: 0.4, h: 0.4, sill: 0.4 }) : { kind: 'window', w: 0.86, h: 0.52, sill: 0.3 }),
      wall: CREAM, glass: 0x4f6474, frame: 0x4a5560,
    })
  }
  // 高窓の下の庇
  k.box(-X - 0.8, 3.5, -Z - 0.8, X + 0.8, 3.75, Z + 0.8, CREAM)
  // ゆるいヴォールトの屋根（棟は Z 方向）と、妻面のふさぎ
  const rise = b.height - H
  const n = 12
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n
    const xa = -X - 0.4 + (2 * X + 0.8) * t0, xb = -X - 0.4 + (2 * X + 0.8) * t1
    const ya = H + rise * Math.sin(Math.PI * t0), yb = H + rise * Math.sin(Math.PI * t1)
    k.quad([xa, ya, Z + 0.4], [xb, yb, Z + 0.4], [xb, yb, -Z - 0.4], [xa, ya, -Z - 0.4], TEAL)
    for (const z of [Z, -Z]) {
      const xa2 = -X + 2 * X * t0, xb2 = -X + 2 * X * t1
      const ya2 = H + rise * Math.sin(Math.PI * t0), yb2 = H + rise * Math.sin(Math.PI * t1)
      k.quad([xa2, H, z], [xb2, H, z], [xb2, yb2, z], [xa2, ya2, z], CREAM)
    }
  }
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: [0, H], seed: 34,
    slab: 0xd2a56c,
    furnish: (kk, _f, y) => {
      // 体育館の床のライン（バスケットボール）とゴール
      for (const [x0, z0, x1, z1] of [[-12, -14, 12, -13.9], [-12, 13.9, 12, 14], [-12, -14, -11.9, 14], [11.9, -14, 12, 14], [-12, -0.05, 12, 0.05]]) {
        kk.box(x0, y, z0, x1, y + 0.01, z1, 0xf4f4f0)
      }
      for (const sz of [-1, 1]) {
        const z = sz * 14.5
        kk.box(-0.1, y, z - 0.1, 0.1, y + 3.05, z + 0.1, 0x8a8f94)
        kk.box(-0.9, y + 2.9, z - sz * 0.15, 0.9, y + 3.95, z - sz * 0.2, 0xf6f6f6)
        kk.cylinder(0, z - sz * 0.6, 0.23, y + 3.05, y + 3.1, ORANGE, 10)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// A3・A4号館 クラブハウス：淡い黄色の 2 階建てが L 字に並ぶ。屋根の縁は水色。
// 部室の扉が並ぶ外廊下（2 階は手すり付き）と外階段。妻面に「KAIT CLUB HOUSE」のサイン。
const a3: Model = (k) => {
  const lv = [0, 3.4, 6.8]
  const YELLOW = 0xf1e6a8
  const SKY = 0x7fc4e0
  // 2 つの棟：[x0, z0, x1, z1]、廊下の側（z0 側か z1 側か）
  const wings: { r: [number, number, number, number]; corridor: 'e' | 'w' }[] = [
    { r: [-23.8, -1.3, 0.1, 10.9], corridor: 'e' },
    { r: [0.1, -11.0, 23.7, 4.3], corridor: 'w' },
  ]
  for (const { r: [x0, z0, x1, z1], corridor } of wings) {
    for (const s of rectSides(x0, z0, x1, z1)) {
      const bays = Math.max(2, Math.round(len(s) / 3.0))
      facade(k, {
        a: s.a, b: s.b, levels: lv, bays,
        cell: (_f, i) => (s.side === corridor ? (i % 2 ? { kind: 'window', w: 0.3, h: 0.78, sill: 0 } : { kind: 'window', w: 0.5, h: 0.35, sill: 0.4 }) : i % 2 ? 'wall' : { kind: 'window', w: 0.55, h: 0.42, sill: 0.35 }),
        wall: YELLOW, glass: 0x5d7486, frame: 0xd8d8d8,
      })
    }
    roof(k, x0, z0, x1, z1, lv[2], 0.6, SKY)
    // 外廊下：2 階の床・手すりと、屋根の庇（水色の縁）
    const zc = corridor === 'e' ? z0 - 2 : z1 + 2
    const [za, zb] = corridor === 'e' ? [zc, z0] : [z1, zc]
    const xa = Math.max(x0, corridor === 'e' ? x0 : 4.5)
    k.box(xa, lv[1] - 0.25, za, x1 - (corridor === 'e' ? 0.2 : 0), lv[1], zb, 0xd9d6cc)
    const zr = corridor === 'e' ? za : zb
    k.box(xa, lv[1] + 1.0, zr - 0.06, x1, lv[1] + 1.1, zr + 0.06, 0xf6f6f2)
    for (let x = xa; x <= x1; x += 1.2) k.box(x - 0.04, lv[1], zr - 0.04, x + 0.04, lv[1] + 1.0, zr + 0.04, 0xf6f6f2)
    for (let x = xa; x <= x1; x += 4.8) k.box(x - 0.12, 0, zr - 0.12, x + 0.12, lv[1], zr + 0.12, 0xe4e1d6)
    k.box(xa, lv[2] - 0.1, za, x1, lv[2] + 0.15, zb, SKY)
    // 外階段（廊下の端）
    k.obox(xa + 2.5, lv[1] / 2 - 0.1, zc + (corridor === 'e' ? -0.6 : 0.6), 5.0, 0.2, 1.1, 0, 0xd9d6cc)
  }
  k.sign('KAIT CLUB HOUSE', -23.8 - 0.4, 5.2, 4.8, 6.0, 0.9, -Math.PI / 2, '#d0282e')
  interior(k, {
    x0: -23.8, z0: -1.3, x1: 0.1, z1: 10.9, levels: lv, seed: 35,
    furnish: (kk, _f, y) => {
      // 部室：ロッカーと机、ボール
      for (let x = -22; x < -1; x += 4.8) {
        kk.box(x, y, 9.6, x + 3.4, y + 1.8, 10.3, 0x8a9aa8)
        deskIsland(kk, x + 1.7, y, 4.5, 1.8, 0.9, WOOD, 0x4a6a8a)
        kk.cylinder(x + 0.5, 1.5, 0.12, y, y + 0.24, 0xf0f0f0, 8)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// A5号館 幾徳会館（学生会館）：2 階建て。白い大きな門型のフレームが入口の前に立ち、
// 2 階は濃いガラスの箱、1 階はガラスブロックの灰色の壁。中は書店・売店・PC ステーション、2 階は国際センター。
const A5: Pt[] = [
  [-11.2, -22.0], [-11.5, -30.6], [-12.6, -30.9], [-13.5, -30.5], [-13.9, -29.8], [-13.6, -11.2], [-10.8, -11.0], [-10.9, -5.0], [-6.8, -5.2],
  [-7.0, 16.2], [-13.1, 16.1], [-13.2, 30.9], [1.6, 30.9], [1.4, 23.7], [4.7, 23.7], [4.6, 27.5], [11.0, 27.5], [12.3, -1.8], [5.7, -1.9],
  [5.7, -5.0], [11.9, -5.0], [13.2, -5.9], [13.7, -7.0], [13.9, -8.6], [13.5, -9.5], [12.9, -10.1], [12.1, -10.6], [10.9, -10.9], [10.8, -13.5],
  [11.2, -13.5], [11.1, -22.4],
]
const a5: Model = (k) => {
  const lv = [0, 5.0, 9.8]
  const GREY = 0xc9c9c4
  polyShell(k, A5, {
    levels: lv, bay: 3.0, wall: GREY, glass: 0x34404a, frame: 0x8c9296, parapet: 0.6,
    cell: (f, i, bays, n) => {
      if (f === 1) return n[1] > 0.5 || n[0] > 0.5 ? 'curtain' : { kind: 'window', w: 0.7, h: 0.5, sill: 0.3 }
      if (n[1] > 0.5) return i > 0 && i < bays - 1 ? 'curtain' : 'wall'
      return i % 2 ? 'wall' : { kind: 'window', w: 0.5, h: 0.35, sill: 0.35 }
    },
  })
  // 入口の白い門型フレーム（西面の前）
  const fx = -5.8, fz = 30.9
  for (const dx of [-4.2, 4.2]) k.box(fx + dx - 0.45, 0, fz + 0.4, fx + dx + 0.45, 9.0, fz + 3.4, WHITE)
  k.box(fx - 4.65, 8.2, fz + 0.4, fx + 4.65, 9.0, fz + 3.4, WHITE)
  rooftop(k, -9, -20, 9, 22, lv[2], rng(96))
  interior(k, {
    x0: -6.6, z0: -20, x1: 10.6, z1: 15.5, levels: lv, seed: 36,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // 書店（本棚の列）と売店（色とりどりの商品棚）
        const r = rng(37)
        for (let z = -17; z < -4; z += 2.4) shelfRow(kk, -5, 4, y, z, 1.8, 0xe7ddcc, r)
        const goods = [0xd23a2a, 0x2f7de0, 0xf0c030, 0x3c9a5a, 0xf2f2f2]
        for (let z = 0; z < 13; z += 2.6) {
          kk.box(-5, y, z - 0.35, 4, y + 1.5, z + 0.35, 0xdcdcdc)
          for (let x = -4.6; x < 3.8; x += 0.8) kk.box(x, y + 1.0, z - 0.37, x + 0.6, y + 1.35, z + 0.37, goods[Math.floor(r() * goods.length)])
        }
        kk.box(7, y, -6, 9.5, y + 1.05, 6, 0xf2efe8)
      } else {
        // 国際センター・ラウンジ（Crossroad Cafe）
        for (let z = -16; z < 14; z += 4) for (const x of [-3, 4]) deskIsland(kk, x, y, z, 2.2, 1.0, WOOD, ORANGE)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// A6号館 KAIT HALL：グレージュ（灰色がかった藤色）の 3 階建て。小さな四角い窓が点々と並び、
// 南東の角に金属の円筒の階段室。1 階は吹き抜けのベーカリー「きのぱん」、上は学習支援センター。
const A6: Pt[] = [
  [9.0, 11.4], [5.2, 11.3], [6.5, -18.1], [-0.7, -18.6], [-1.0, -16.0], [-2.8, -16.2], [-2.7, -17.7], [-3.3, -18.3], [-4.6, -18.6],
  [-5.6, -18.3], [-6.2, -17.6], [-6.4, -14.9], [-8.5, -15.0], [-9.0, -2.1], [-8.5, 3.0], [-7.8, 6.7], [-5.9, 11.4], [-4.2, 14.1],
  [-4.4, 18.1], [4.9, 18.6], [5.1, 13.3], [9.0, 13.4],
]
const a6: Model = (k) => {
  const lv = [0, 4.6, 8.4, 12.2]
  const GREIGE = 0x9d918f
  polyShell(k, A6, {
    levels: lv, bay: 2.8, wall: GREIGE, glass: 0x3f4d58, frame: 0x7a7270, parapet: 0.3,
    cell: (f, i, _bays, n) => {
      if (f === 0) return n[1] > 0.5 || i % 2 ? 'curtain' : 'wall'
      return (i + f) % 2 ? 'wall' : { kind: 'window', w: 0.32, h: 0.36, sill: 0.4 }
    },
  })
  // 金属の円筒の階段室と、縦のガラスのスリット
  k.cylinder(-4.5, -16.4, 2.2, 0, 13.4, 0xb9b3ae, 20)
  k.box(-4.8, 1, -18.7, -4.2, 12.4, -18.55, 0x8fa9bb, 'glass')
  rooftop(k, -5, -12, 3, 9, lv[3], rng(97))
  interior(k, {
    x0: -6.5, z0: -14, x1: 4.6, z1: 10.6, levels: lv, seed: 38,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // ベーカリー：ショーケース（パンの色の箱）とテーブル
        kk.box(-5, y, 6, 3, y + 1.0, 7, 0xf2efe8)
        for (let x = -4.6; x < 2.6; x += 0.6) kk.box(x, y + 1.0, 6.2, x + 0.45, y + 1.18, 6.8, 0xd99a4e)
        for (let z = -10; z < 3; z += 3.2) deskIsland(kk, -1, y, z, 1.6, 0.9, WOOD, 0x6a4a3a)
      } else {
        // 学習支援センター：丸テーブルとオレンジの椅子（写真のとおり）
        for (let z = -10; z < 9; z += 3.6) {
          for (const x of [-3.5, 1.5]) {
            kk.cylinder(x, z, 0.7, y + 0.7, y + 0.75, 0xf2efe8, 12)
            for (const a of [0, 2.1, 4.2]) kk.box(x + Math.cos(a) * 1.0 - 0.22, y + 0.42, z + Math.sin(a) * 1.0 - 0.22, x + Math.cos(a) * 1.0 + 0.22, y + 0.5, z + Math.sin(a) * 1.0 + 0.22, ORANGE)
          }
        }
      }
    },
  })
}

// ---------------------------------------------------------------------------
// A1号館 KAITアリーナ（体育館）：白い巨大な箱。壁はひし形の模様のパネルで、細いスリット窓が散らばる。
// 西面に背の高いガラスの入口。屋上にはフットサルコート（緑の人工芝とフェンス）。
const a1: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = [0, 4.5, 9.0, 13.5, 18.0]
  const WALL = 0xeef0f1
  for (const s of rectSides(-X, -Z, X, Z)) {
    const bays = Math.max(2, Math.round(len(s) / 2.6))
    const sideNo = ['e', 's', 'w', 'n'].indexOf(s.side)
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => {
        const [cx] = bayCenter(s, i, bays)
        // 西面の入口：背の高いガラスのボリューム
        if (s.side === 'w' && cx > -16 && cx < -6) return 'curtain'
        return h3(f, i, sideNo) < 0.16 ? { kind: 'window', w: 0.12, h: 0.7, sill: 0.15 } : 'wall'
      },
      wall: WALL, glass: 0x2e3a44, frame: 0x50585e, depth: 0.3,
    })
    // ひし形の模様（壁のパネルの目地を斜めの細い線で）
    if (s.side === 'w' || s.side === 'n') {
      const l = len(s)
      const ux = (s.b[0] - s.a[0]) / l, uz = (s.b[1] - s.a[1]) / l
      const nx = uz, nz = -ux
      for (let u = 4; u < l - 4; u += 6) {
        for (const dir of [-1, 1]) {
          const p0: Pt = [s.a[0] + ux * u + nx * 0.31, s.a[1] + uz * u + nz * 0.31]
          const p1: Pt = [p0[0] + ux * dir * 3, p0[1] + uz * dir * 3]
          for (let y = 1; y < 17; y += 6) k.quad([p0[0], y, p0[1]], [p0[0], y + 0.06, p0[1]], [p1[0], y + 3.06, p1[1]], [p1[0], y + 3, p1[1]], 0xd8dcdf)
        }
      }
    }
  }
  roof(k, -X, -Z, X, Z, lv[4], 1.0, WALL)
  // 屋上のフットサルコート（OSM の位置：ローカル X 2.5..24.5）
  const fx0 = 2.5, fx1 = 24.5, fz = Z - 1.2
  k.box(fx0, lv[4], -fz, fx1, lv[4] + 0.08, fz, 0x4c8a38)
  for (const [x0, z0, x1, z1] of [[fx0 + 1, -fz + 1, fx1 - 1, -fz + 1.1], [fx0 + 1, fz - 1.1, fx1 - 1, fz - 1], [fx0 + 1, -fz + 1, fx0 + 1.1, fz - 1], [fx1 - 1.1, -fz + 1, fx1 - 1, fz - 1], [fx0 + 1, -0.05, fx1 - 1, 0.05]]) {
    k.box(x0, lv[4] + 0.08, z0, x1, lv[4] + 0.1, z1, 0xf4f4f0)
  }
  for (const sz of [-1, 1]) k.box((fx0 + fx1) / 2 - 1.5, lv[4] + 0.08, sz * (fz - 1) - 0.5, (fx0 + fx1) / 2 + 1.5, lv[4] + 2.1, sz * (fz - 1) + 0.5, 0xf4f4f0, 'glass')
  // フェンス（細い柱と、半透明のネット）
  for (const [a, c] of [[[fx0, -fz], [fx1, -fz]], [[fx1, -fz], [fx1, fz]], [[fx1, fz], [fx0, fz]], [[fx0, fz], [fx0, -fz]]] as [Pt, Pt][]) {
    k.wall(a, c, lv[4], lv[4] + 4, 0x8a949c, 'glass')
    const l = Math.hypot(c[0] - a[0], c[1] - a[1])
    for (let u = 0; u <= l; u += 3) {
      const t = u / l
      const x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t
      k.box(x - 0.05, lv[4], z - 0.05, x + 0.05, lv[4] + 4, z + 0.05, 0x5d666d)
    }
  }
  rooftop(k, -X + 3, -Z + 3, -2, Z - 3, lv[4], rng(98))
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: [0, 9.0, 18.0], seed: 39, slab: 0xd2a56c,
    furnish: (kk, _f, y) => {
      // コートのラインとバスケットゴール（入口のガラス越しに見える）
      for (let x = -38; x < 38; x += 26) {
        kk.box(x, y, -14, x + 22, y + 0.01, -13.9, 0xf4f4f0)
        kk.box(x, y, 13.9, x + 22, y + 0.01, 14, 0xf4f4f0)
        kk.box(x + 10.95, y, -14, x + 11.05, y + 0.01, 14, 0xf4f4f0)
        for (const sx of [0.4, 21.6]) kk.box(x + sx - 0.1, y + 2.9, -0.9, x + sx + 0.1, y + 3.95, 0.9, 0xf6f6f6)
      }
    },
  })
}

export const OUTER_MODELS: Record<string, Model> = { town, c7, c5, c2, plaza, e6, e3, e4, e1, e2, erim, e7, a2, a3, a5, a6, a1 }
