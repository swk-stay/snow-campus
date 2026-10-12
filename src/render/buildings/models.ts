import { cw, deskIsland, facade, insetPoly, insidePoly, interior, pcRow, plant, rectSides, rng, shelfRow, type CellKind } from './kit'
import { OUTER_MODELS } from './outerModels'
import {
  car,
  ceilingLights,
  CLEAR,
  FRAME,
  GLASS,
  h3,
  levels,
  OFFWHITE,
  ORANGE,
  RED_CHAIR,
  ringWalls,
  roof,
  rooftop,
  WARM_LIGHT,
  WHITE,
  WOOD,
  type Model,
  type Pt,
} from './parts'

// 神奈川工科大学・中庭まわりの 10 棟。寸法は OSM（PLATEAU 由来）の外形と高さ、外観は大学公式の
// キャンパスマップの写真を見て作った。座標は建物ローカル（原点 = 敷地の外接矩形の中心、+X 南・+Z 西）。
// 見下ろしでは +Z（西）の面がカメラ側に来るので、そこは特に作り込んでいる。

// ---------------------------------------------------------------------------
// D2号館 先進技術研究所：2 階建て・六角形。1 階は奥まったガラスと細い柱、2 階は張り出した箱で、
// 一部が白い縦ルーバー、残りはガラス。中はオレンジの暖かい照明と、吹き抜けの彫刻的な階段。
const d2: Model = (k) => {
  const outer = cw([[13.5, -10.5], [5.9, -15.5], [-13.4, -7.2], [-13.5, 7.1], [5.9, 15.5], [13.5, 10.5]])
  const inner = insetPoly(outer, 1.8)
  const y1 = 4.2 // 2 階の床
  const yTop = 8.0

  // 1 階：床・ガラスの壁・マリオン
  k.prism(inner, 0, 0.12, 0xd9d3c8)
  ringWalls(k, inner, 0.12, y1, 1.6, CLEAR, WHITE)
  // 外周の細い柱（張り出しを支える）
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]
    const b = outer[(i + 1) % outer.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.round(len / 5.5))
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n
      const x = a[0] + (b[0] - a[0]) * t
      const z = a[1] + (b[1] - a[1]) * t
      const [ix, iz] = towards(x, z, 0.5)
      k.cylinder(ix, iz, 0.11, 0, y1, WHITE, 8)
    }
  }
  // 2 階の床スラブ（下面は白い軒天）と屋根
  k.prism(outer, y1, y1 + 0.45, WHITE)
  k.prism(outer, yTop, yTop + 0.3, WHITE)

  // 2 階の外壁：北東側の面は縦ルーバー、南西側はガラスのカーテンウォール
  const glassLine = insetPoly(outer, 0.25)
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]
    const b = outer[(i + 1) % outer.length]
    const louver = (a[1] + b[1]) / 2 < 2 && (a[0] + b[0]) / 2 < 10
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len
    const angle = Math.atan2(-uz, ux)
    k.wall(glassLine[i], glassLine[(i + 1) % outer.length], y1 + 0.45, yTop, louver ? 0x9fb0bb : CLEAR, 'glass')
    if (louver) {
      for (let u = 0.15; u < len; u += 0.32) k.obox(a[0] + ux * u, y1 + 0.45, a[1] + uz * u, 0.06, yTop - y1 - 0.45, 0.4, angle, WHITE)
    } else {
      for (let u = 0; u <= len + 0.01; u += 1.8) k.obox(a[0] + ux * u, y1 + 0.45, a[1] + uz * u, 0.08, yTop - y1 - 0.45, 0.12, angle, FRAME)
    }
  }

  // 室内：暖色の天井照明、展示の車、受付カウンター、2 階の机、吹き抜けの階段、楕円の天窓
  ceilingLights(k, inner, y1 - 0.05, 2.4, WARM_LIGHT)
  ceilingLights(k, insetPoly(outer, 0.6), yTop - 0.05, 2.4, WARM_LIGHT)
  k.inside(() => {
    car(k, -4, 0.12, 4, 0.4, 0xc62b25)
    car(k, 3, 0.12, 6, -0.3, 0xe8e2d5)
    k.box(-9, 0.12, -3, -7.6, 1.1, 3, ORANGE)
    for (const [x, z] of [[2, -5], [6, -2], [-1, -8]] as Pt[]) {
      k.box(x - 0.9, 0.12, z - 0.4, x + 0.9, 0.55, z + 0.4, ORANGE)
      k.box(x - 0.9, 0.55, z - 0.4, x + 0.9, 0.95, z - 0.2, ORANGE)
    }
    // 吹き抜けの階段（1 階から 2 階へ、踏み板が宙に浮いて見える）
    for (let i = 0; i < 18; i++) {
      const t = i / 17
      const x = 8 - t * 9
      const y = 0.12 + t * (y1 + 0.3)
      k.box(x - 0.18, y, -1.2, x + 0.18, y + 0.08, 0.6, WHITE)
    }
    k.box(-1.2, y1 + 0.45, -1.4, 8.2, y1 + 1.5, -1.3, 0xd8e4ea, 'glass')
    // 2 階：机とオレンジの椅子
    for (let x = -8; x <= 8; x += 4) deskIsland(k, x, y1 + 0.45, 8.5, 2.6, 1.0, 0xf3f0ea, ORANGE)
    for (let x = -6; x <= 6; x += 4) deskIsland(k, x, y1 + 0.45, -9, 2.6, 1.0, 0xf3f0ea, ORANGE)
  })
  // 楕円の天窓（屋根の上から光って見える）
  const sky: Pt[] = []
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2
    sky.push([1 + Math.cos(a) * 3.2, 1 + Math.sin(a) * 2])
  }
  k.prism(cw(sky), yTop + 0.3, yTop + 0.36, 0xdff2ff, 'light', false)

  function towards(x: number, z: number, d: number): Pt {
    const l = Math.hypot(x, z)
    return [x - (x / l) * d, z - (z / l) * d]
  }
}

// ---------------------------------------------------------------------------
// D1号館 KAIT工房（石上純也、2008）：高さ 5m のガラスの箱。305 本の細い白い鉄骨の柱が、
// 向きも太さもばらばらに林のように立ち、その間に作業台・白いテーブル・植物が置かれている。
const d1: Model = (k) => {
  const poly = cw([[22.0, -20.6], [-22.0, -23.3], [-21.5, 21.2], [21.0, 23.3]])
  const H = 5.0
  const r = rng(305)
  k.prism(poly, 0, 0.1, 0xd4d3cf)
  // 薄い屋根スラブ（小口が細く見えるのが特徴）と、天井のトップライトの帯
  k.prism(poly, H - 0.22, H, WHITE)
  ceilingLights(k, insetPoly(poly, 0.8), H - 0.24, 2.6, 0xf4f8ff, 0.7)
  // ガラスの外壁（框なしの大きなガラス。継ぎ目だけ細く白い）
  ringWalls(k, poly, 0.1, H - 0.22, 2.6, 0xd5e4ea, 0xe8ecee)

  // 305 本の柱：場所によって密度を変え（林の中の空き地のように）、向きと断面をばらつかせる
  const inner = insetPoly(poly, 0.7)
  const cols: Pt[] = []
  const density = (x: number, z: number) => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.4))
  for (let tries = 0; cols.length < 305 && tries < 20000; tries++) {
    const x = -22 + r() * 44
    const z = -23 + r() * 46
    if (!insidePoly(inner, x, z) || r() > density(x, z)) continue
    if (cols.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 1.15)) continue
    cols.push([x, z])
  }
  for (const [x, z] of cols) {
    const wide = 0.1 + r() * 0.14
    const thin = 0.025 + r() * 0.035
    k.obox(x, 0.1, z, wide, H - 0.32, thin, r() * Math.PI, WHITE)
  }

  k.inside(() => {
    // 家具：柱を避けて置く。白いテーブルと椅子、木の作業台、植物、工作機械、ソーラーカー
    const free = (x: number, z: number, rad: number) => insidePoly(inner, x, z) && !cols.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < rad)
    let placed = 0
    for (let tries = 0; placed < 46 && tries < 3000; tries++) {
      const x = -20 + r() * 40
      const z = -21 + r() * 42
      const kind = r()
      if (kind < 0.35) {
        if (!free(x, z, 1.1)) continue
        k.box(x - 0.6, 0.8, z - 0.6, x + 0.6, 0.85, z + 0.6, WHITE)
        k.box(x - 0.03, 0.1, z - 0.03, x + 0.03, 0.8, z + 0.03, WHITE)
        for (const [dx, dz] of [[0.9, 0], [-0.9, 0]]) {
          k.box(x + dx - 0.22, 0.5, z + dz - 0.22, x + dx + 0.22, 0.55, z + dz + 0.22, WHITE)
          k.box(x + dx + Math.sign(dx) * 0.18, 0.55, z - 0.22, x + dx + Math.sign(dx) * 0.22, 1.0, z + 0.22, WHITE)
        }
      } else if (kind < 0.6) {
        if (!free(x, z, 1.4)) continue
        k.box(x - 1.2, 0.85, z - 0.45, x + 1.2, 0.95, z + 0.45, WOOD)
        k.box(x - 1.1, 0.1, z - 0.4, x + 1.1, 0.85, z + 0.4, 0x6f6a62)
        // 工具や材料
        k.box(x - 0.6, 0.95, z - 0.2, x - 0.1, 1.15, z + 0.25, 0x3f6fae)
        k.box(x + 0.3, 0.95, z - 0.3, x + 0.9, 1.0, z + 0.1, 0xe6d3b0)
      } else if (kind < 0.85) {
        if (!free(x, z, 0.6)) continue
        plant(k, x, 0.1, z, 1.6 + r() * 1.8)
      } else {
        if (!free(x, z, 1.3)) continue
        // 工作機械（ボール盤・旋盤のような箱）
        k.box(x - 0.7, 0.1, z - 0.5, x + 0.7, 1.3, z + 0.5, 0x5f7f8f)
        k.box(x - 0.5, 1.3, z - 0.3, x + 0.1, 1.9, z + 0.3, 0x4a6676)
      }
      placed++
    }
    // ソーラーカー（学生プロジェクト）：平たい涙形
    const sx = 8, sz = 10
    if (free(sx, sz, 0.1)) {
      k.obox(sx, 0.35, sz, 4.6, 0.25, 1.6, 0.2, WHITE)
      k.obox(sx + 0.2, 0.6, sz, 3.6, 0.04, 1.4, 0.2, 0x1e2f5a, 'light')
      k.obox(sx - 0.6, 0.6, sz - 0.1, 0.9, 0.35, 0.6, 0.2, 0x2a3138)
    }
  })
}

// ---------------------------------------------------------------------------
// C1号館 附属図書館：3 階建て。1 階は白い列柱の奥にガラス（ピロティ）、2・3 階は白い枠の中に
// 細い縦長の窓が並ぶ。中は本棚の列と閲覧席、1 階には半円形の木の書架とアーチ（HUG）。
const c1: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = [0, 5.6, 10.4, 15.2]
  const top = 17.4
  // 1 階：奥まったガラス壁と列柱
  const gi = 2.4
  for (const s of rectSides(-X + gi, -Z + gi, X - gi, Z - gi)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    facade(k, { a: s.a, b: s.b, levels: [0, lv[1]], bays: Math.round(len / 1.8), cell: () => 'curtain', wall: WHITE, glass: CLEAR, frame: 0xd5d8d8, depth: 0.15 })
  }
  for (let x = -X + 0.4; x <= X - 0.4 + 0.01; x += (2 * X - 0.8) / 6) {
    for (const z of [-Z + 0.4, Z - 0.4]) k.box(x - 0.4, 0, z - 0.4, x + 0.4, lv[1], z + 0.4, WHITE)
  }
  for (let z = -Z + 0.4; z <= Z - 0.4 + 0.01; z += (2 * Z - 0.8) / 8) {
    for (const x of [-X + 0.4, X - 0.4]) k.box(x - 0.4, 0, z - 0.4, x + 0.4, lv[1], z + 0.4, WHITE)
  }
  // 2 階の床の張り出し（白い帯）
  k.box(-X, lv[1], -Z, X, lv[1] + 0.9, Z, WHITE)
  // 2・3 階：端の 2 スパンは白い壁、中央は細い縦長窓＋白い縦フィン
  for (const s of rectSides(-X, -Z, X, Z)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    const bays = Math.round(len / 1.5)
    facade(k, {
      a: s.a, b: s.b, levels: [lv[1] + 0.9, lv[2], lv[3]], bays,
      cell: (_f, i) => (i < 2 || i >= bays - 2 ? 'wall' : { kind: 'window', w: 0.62, h: 0.82, sill: 0.08 }),
      wall: WHITE, glass: GLASS, frame: 0x7d868c,
    })
  }
  // 最上部の厚い白い帯（パラペット）
  k.box(-X, lv[3], -Z, X, top - 0.6, Z, WHITE)
  roof(k, -X, -Z, X, Z, top - 0.6, 0.6, WHITE)
  rooftop(k, -X + 3, -Z + 3, X - 3, Z - 3, top - 0.6, rng(11))

  // 室内
  const r = rng(101)
  interior(k, {
    x0: -X + gi, z0: -Z + gi, x1: X - gi, z1: Z - gi, levels: [0, lv[1]], seed: 3,
    furnish: (kk, _f, y) => {
      // HUG：半円形の木の書架とアーチ、緑のカーペット、赤い椅子
      k.box(-6, y, -2, 6, y + 0.02, 10, 0x7aa35a)
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.1 + (i / 8) * 0.8)
        const x = Math.cos(a) * 7
        const z = 4 - Math.sin(a) * 7
        kk.obox(x, y, z, 1.6, 2.2, 0.4, -a + Math.PI / 2, WOOD)
        // アーチの頭
        kk.obox(x, y + 2.2, z, 1.2, 0.4, 0.4, -a + Math.PI / 2, 0xd9b07a)
      }
      for (const [x, z] of [[-2, 6], [1.5, 7], [-0.5, 3]] as Pt[]) {
        kk.cylinder(x, z, 0.5, y + 0.7, y + 0.75, WHITE, 10)
        kk.box(x + 0.7, y + 0.4, z - 0.25, x + 1.2, y + 0.85, z + 0.25, RED_CHAIR)
      }
      // 展示ケース
      for (let z = -16; z <= -6; z += 5) kk.box(-10, y, z - 0.6, -8.8, y + 1.4, z + 0.6, 0xdde8ec, 'glass')
    },
  })
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: [lv[1] + 0.9, lv[2], lv[3]], seed: 4,
    furnish: (_kk, _f, y, h) => {
      // 窓際は閲覧席、内側は本棚の列
      for (let z = -Z + 4; z < Z - 3; z += 2.4) shelfRow(k, -X + 7, X - 7, y, z, Math.min(2.2, h - 1.2), 0xe7ddcc, r)
      for (let z = -Z + 3; z < Z - 3; z += 3.2) {
        for (const x of [-X + 3, X - 3]) {
          k.box(x - 0.8, y + 0.72, z - 0.6, x + 0.8, y + 0.76, z + 0.6, WOOD)
          k.box(x - 0.25, y + 0.4, z - 1.0, x + 0.25, y + 0.85, z - 0.75, ORANGE)
        }
      }
    },
  })
}

// ---------------------------------------------------------------------------
// D3号館 工学教育研究棟：白い 5 階建ての研究棟。横長の窓が規則正しく並び、屋上に塔屋とアンテナ。
const d3: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2 - 2.2
  const lv = levels(4.6, 4.2, 5)
  const top = lv[lv.length - 1]
  for (const s of rectSides(-X, -Z, X, Z)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    const bays = Math.max(2, Math.round(len / 3.4))
    const entrance = s.side === 's'
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => (f === 0 && entrance && i > 0 && i < bays - 1 ? 'curtain' : 'window'),
      wall: WHITE, glass: GLASS, win: { w: 0.78, h: 0.48, sill: 0.32 },
    })
  }
  // 両端の階段室（外形の出っ張り）
  for (const sz of [-1, 1]) {
    const z0 = sz * Z
    const z1 = sz * (Z + 2.2)
    k.box(-2.8, 0, z0, 2.0, top + 1.2, z1, OFFWHITE)
    for (let y = 2; y < top; y += 4.2) k.box(-0.8, y, z1 - sz * 0.05, 0.6, y + 1.6, z1 + sz * 0.02, GLASS, 'glass')
  }
  roof(k, -X, -Z, X, Z, top, 0.9, WHITE)
  k.box(-4, top, -6, 4, top + 3.2, 6, OFFWHITE)
  k.box(-0.15, top + 3.2, -0.15, 0.15, b.height, 0.15, 0x9a9fa3)
  k.box(-1.2, b.height - 1.5, -0.05, 1.2, b.height - 1.4, 0.05, 0x9a9fa3)
  rooftop(k, -X + 1, -Z + 1, X - 1, Z - 1, top, rng(23))
  const r = rng(5)
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: lv, seed: 5,
    furnish: (kk, _f, y) => {
      for (let z = -Z + 3; z < Z - 2; z += 4.5) {
        if (r() < 0.3) continue
        deskIsland(kk, -X + 4, y, z, 3.2, 1.2, 0x2b2d30, 0x4a5a6a)
        deskIsland(kk, X - 4, y, z, 3.2, 1.2, 0xe8e6e0, 0x4a5a6a)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// K2号館 学生サービス棟：4 階建て。白いパネルの壁に縦長の窓、北西の角は全面ガラスの階段室。
// 1 階は窓口カウンターのあるガラス張り。
const k2: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = levels(4.8, 4.5, 4)
  const top = lv[lv.length - 1]
  for (const s of rectSides(-X, -Z, X, Z)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    const bays = Math.round(len / 3.0)
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i) => {
        // 角のガラスの階段室（北西：side n の最初、side w の最後）
        if ((s.side === 'w' && i >= bays - 2) || (s.side === 'n' && i < 2)) return 'curtain'
        if (f === 0) return 'curtain'
        return i % 4 === 1 ? 'curtain' : { kind: 'window', w: 0.36, h: 0.72, sill: 0.14 }
      },
      wall: 0xeceeee, glass: 0x7da3c4,
    })
  }
  // 1 階の入口の庇と、白い柱型
  k.box(-6, 3.6, Z, 6, 3.85, Z + 3.2, WHITE)
  for (const x of [-5.6, 5.6]) k.box(x - 0.1, 0, Z + 2.9, x + 0.1, 3.6, Z + 3.1, 0xa7adb2)
  roof(k, -X, -Z, X, Z, top, 0.8, 0xeceeee)
  rooftop(k, -X + 2, -Z + 2, X - 2, Z - 2, top, rng(31))
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: lv, seed: 6,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // 窓口の白いカウンター（曲面を短い箱で近似）
        for (let i = 0; i < 12; i++) {
          const a = (i / 11) * Math.PI
          kk.obox(Math.cos(a) * 9, y, 6 + Math.sin(a) * 4, 2.6, 1.05, 0.6, -a + Math.PI / 2, i % 2 ? WHITE : WOOD)
        }
        for (let x = -12; x <= 12; x += 6) deskIsland(kk, x, y, -12, 2.4, 1.0, WOOD, 0x4a6a8a)
      } else {
        for (let z = -Z + 4; z < Z - 3; z += 4) deskIsland(kk, -X + 5, y, z, 3.4, 1.2, 0xeceae4, 0x3b4a5c)
        for (let z = -Z + 4; z < Z - 3; z += 4) deskIsland(kk, X - 5, y, z, 3.4, 1.2, 0xeceae4, 0x3b4a5c)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// C6号館 応用バイオ科学研究棟：薄いピンクがかったベージュの 6 階建て。横に連続する窓、
// 最上階は小さな正方形の窓。1 階はガラス張り。東側に 1 スパン細い別棟（階段・設備）。
const c6: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = levels(5.0, 4.4, 6)
  const top = lv[lv.length - 1]
  const BEIGE = 0xd8c7bf
  // 本体（西側 34m）
  const mx0 = -X, mx1 = 9.6
  for (const s of rectSides(mx0, -18.6, mx1, 18.8)) {
    if (s.side === 's') continue
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays: Math.round(len / 3.6),
      cell: (f) => (f === 0 ? 'curtain' : f === 5 ? { kind: 'window', w: 0.28, h: 0.36, sill: 0.3 } : { kind: 'window', w: 0.94, h: 0.5, sill: 0.3 }),
      wall: BEIGE, glass: 0x6f93ad,
    })
  }
  // 東の細い棟
  for (const s of rectSides(mx1, -Z, X, Z)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays: Math.max(1, Math.round(len / 3.6)),
      cell: (f, i) => (f === 0 ? 'curtain' : s.side === 'w' && i === 1 ? 'curtain' : { kind: 'window', w: 0.25, h: 0.7, sill: 0.15 }),
      wall: 0xcbb8b0, glass: 0x6f93ad,
    })
  }
  roof(k, mx0, -18.6, mx1, 18.8, top, 1.0, BEIGE)
  roof(k, mx1, -Z, X, Z, top, 1.0, 0xcbb8b0)
  k.box(-14, top, -8, -2, b.height, 4, 0xb8aaa4)
  rooftop(k, mx0 + 2, -16, mx1 - 2, 16, top, rng(41))
  // 西の入口：低いガラスのホールと階段状のアプローチ（写真の赤茶のステップ）
  k.box(-20, 0, 18.8, -2, 4.4, 21.6, 0xd9e6ec, 'glass')
  k.box(-20.2, 4.4, 18.6, -1.8, 4.75, 22.0, WHITE)
  for (let i = 0; i < 4; i++) k.box(-18 + i * 0.2, 0, 21.6 + i * 0.0, -4 - i * 0.2, 0.18 * (4 - i), 21.9, 0x9b5a45)
  interior(k, {
    x0: mx0, z0: -18.6, x1: mx1, z1: 18.8, levels: lv, seed: 8,
    furnish: (kk, f, y) => {
      for (let x = mx0 + 4; x < mx1 - 3; x += 4.2) {
        // 実験台（白い天板）と、窓際のドラフトチャンバー
        deskIsland(kk, x, y, -12, 1.4, 3.2, 0xf4f4f2, 0x3d4d5d)
        deskIsland(kk, x, y, 12, 1.4, 3.2, 0xf4f4f2, 0x3d4d5d)
        if (f > 0) kk.box(x - 0.8, y, 16.8, x + 0.8, y + 2.2, 17.6, 0xd6dadc)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// B5号館 講義棟：白い 4 階建ての古い校舎。ポツ窓が並び、北の端に外階段（白い格子）、南に入口。
const b5: Model = (k, b) => {
  const X = b.width / 2
  const z0 = -28.6, z1 = 25.2
  const lv = levels(4.2, 4.2, 4)
  const top = lv[lv.length - 1]
  for (const s of rectSides(-X, z0, X, z1)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays: Math.max(2, Math.round(len / 3.6)),
      cell: (f, i) => (f === 0 && s.side === 'e' && i % 3 === 1 ? 'curtain' : 'window'),
      wall: 0xeeeeea, glass: 0x5f7f96, win: { w: 0.62, h: 0.52, sill: 0.32 },
    })
  }
  roof(k, -X, z0, X, z1, top, 0.9, 0xeeeeea)
  rooftop(k, -X + 1, z0 + 1, X - 1, z1 - 1, top, rng(51))
  k.box(-0.1, top, 18, 0.1, b.height, 18.2, 0x9a9fa3)
  // 外階段：各階の踊り場と白い格子の手すり
  const sz0 = z1, sz1 = b.depth / 2
  for (const x of [-1.5, 1.5]) for (const z of [sz0 + 0.1, sz1 - 0.1]) k.box(x - 0.12, 0, z - 0.12, x + 0.12, top + 1, z + 0.12, WHITE)
  for (let i = 1; i < lv.length; i++) {
    const y = lv[i]
    k.box(-1.5, y - 0.2, sz0, 1.5, y, sz1, WHITE)
    k.box(-1.5, y, sz1 - 0.08, 1.5, y + 1.1, sz1, 0xe4e6e6)
    for (const x of [-1.5, 1.5]) k.box(x - 0.04, y, sz0, x + 0.04, y + 1.1, sz1, 0xe4e6e6)
    // 段（斜めの板）
    k.obox(0, y - 2.6, (sz0 + sz1) / 2, 2.6, 0.2, 2.2, 0, 0xd5d5d0)
  }
  // 南の入口の庇
  k.box(-6.1, 3.3, -b.depth / 2, 6.1, 3.6, z0, WHITE)
  const r = rng(52)
  interior(k, {
    x0: -X, z0, x1: X, z1, levels: lv, seed: 9,
    furnish: (kk, _f, y) => {
      // 教室：黒板の方を向いた机の列
      for (let z = z0 + 2.5; z < z1 - 2; z += 9) {
        kk.box(-X + 1, y + 1.0, z - 0.05, X - 1, y + 2.4, z + 0.05, 0x2f4a3a)
        for (let zz = z + 2; zz < z + 8; zz += 1.4) {
          if (r() < 0.1) continue
          kk.box(-X + 2, y + 0.7, zz - 0.3, X - 2, y + 0.75, zz + 0.3, 0xd6c3a0)
        }
      }
    },
  })
}

// ---------------------------------------------------------------------------
// K4号館 看護医療棟：石張り風のオフホワイトの 4 階建て。深く彫り込んだ縦長の窓が規則正しく並び、
// 1 階は太い柱の奥にガラス。屋上には金属ルーバーの目隠し。中は看護実習のベッドが並ぶ。
const k4: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = [0, 6.0, 10.5, 15.0, 19.5]
  const STONE = 0xe5e0d5
  // 1 階：奥まったガラス
  const gi = 1.6
  for (const s of rectSides(-X + gi, -Z + gi, X - gi, Z - gi)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    facade(k, { a: s.a, b: s.b, levels: [0, lv[1]], bays: Math.round(len / 2.2), cell: () => 'curtain', wall: STONE, glass: CLEAR, frame: 0x7a8288, depth: 0.15 })
  }
  const cols = 5
  for (let i = 0; i <= cols; i++) {
    const x = -X + 0.6 + ((2 * X - 1.2) * i) / cols
    for (const z of [-Z + 0.6, Z - 0.6]) k.box(x - 0.6, 0, z - 0.6, x + 0.6, lv[1], z + 0.6, STONE)
  }
  for (let i = 1; i < 8; i++) {
    const z = -Z + 0.6 + ((2 * Z - 1.2) * i) / 8
    for (const x of [-X + 0.6, X - 0.6]) k.box(x - 0.6, 0, z - 0.6, x + 0.6, lv[1], z + 0.6, STONE)
  }
  for (const s of rectSides(-X, -Z, X, Z)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    facade(k, {
      a: s.a, b: s.b, levels: lv.slice(1), bays: Math.round(len / 2.7),
      cell: () => 'window', wall: STONE, glass: 0x7c98aa, depth: 0.5, win: { w: 0.42, h: 0.58, sill: 0.22 },
    })
  }
  roof(k, -X, -Z, X, Z, lv[4], 1.0, STONE)
  // 屋上の金属ルーバー（設備の目隠し）
  for (let z = -Z + 6; z <= -2; z += 0.35) k.box(-X + 3, lv[4], z, X - 3, b.height, z + 0.05, 0xb6bcc0)
  interior(k, {
    x0: -X + gi, z0: -Z + gi, x1: X - gi, z1: Z - gi, levels: [0, lv[1]], seed: 10,
    furnish: (kk, _f, y) => {
      for (let z = -Z + 5; z < Z - 4; z += 3) for (const x of [-7, 0, 7]) deskIsland(kk, x, y, z, 2.0, 1.0, 0xf2efe8, 0x5a7d9a)
    },
  })
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: lv.slice(1), seed: 11,
    furnish: (kk, f, y) => {
      if (f === 0) {
        // 実習室のベッド（白いフレームに水色のシーツ）
        for (let z = -Z + 3; z < Z - 3; z += 3.2) {
          for (const x of [-X + 3, X - 3]) {
            kk.box(x - 1.0, y, z - 0.5, x + 1.0, y + 0.55, z + 0.5, WHITE)
            kk.box(x - 0.95, y + 0.55, z - 0.45, x + 0.95, y + 0.65, z + 0.45, 0x9ccbe0)
            kk.box(x + 0.55, y + 0.65, z - 0.35, x + 0.9, y + 0.78, z + 0.35, WHITE)
          }
        }
      } else {
        for (let z = -Z + 3; z < Z - 3; z += 2.5) kk.box(-X + 2, y + 0.7, z - 0.3, X - 2, y + 0.75, z + 0.3, 0xd9c9a8)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// K3号館 講義棟：7 階建て。1 階は柱の奥にガラス（中は学生食堂の赤い椅子）、2 階から上は
// 白い縦フィンで区切った柱間に、窓が左上・右下と互い違いに並ぶ。西の妻面は白い大壁に
// 「神奈川工科大学」のサイン、ガラスの階段室のスリット。西側の大きな庇の下が構内バス停。
const k3: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = levels(5.5, 4.3, 7)
  const top = lv[lv.length - 1]
  const gi = 1.8
  // 1 階：奥まったガラスと柱
  for (const s of rectSides(-X + gi, -Z + gi, X - gi, Z - gi)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    facade(k, { a: s.a, b: s.b, levels: [0, lv[1]], bays: Math.round(len / 2.4), cell: () => 'curtain', wall: WHITE, glass: CLEAR, frame: 0x6f777c, depth: 0.15 })
  }
  for (let z = -Z + 0.5; z <= Z - 0.5 + 0.01; z += (2 * Z - 1) / 12) {
    for (const x of [-X + 0.5, X - 0.5]) k.box(x - 0.5, 0, z - 0.5, x + 0.5, lv[1], z + 0.5, 0xd7d9d9)
  }
  for (const x of [-X / 3, X / 3]) for (const z of [-Z + 0.5, Z - 0.5]) k.box(x - 0.5, 0, z - 0.5, x + 0.5, lv[1], z + 0.5, 0xd7d9d9)
  k.box(-X, lv[1] - 0.4, -Z, X, lv[1], Z, WHITE)

  // 2 階から上：長辺（南北面）は互い違いの窓
  const upper = lv.slice(1)
  for (const s of rectSides(-X, -Z, X, Z)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    if (s.side === 'n' || s.side === 's') {
      const bays = 13
      facade(k, {
        a: s.a, b: s.b, levels: upper, bays: bays * 2,
        cell: (f, i) => {
          const upperLeft = (f + Math.floor(i / 2)) % 2 === 0
          const left = i % 2 === 0
          return left === upperLeft
            ? { kind: 'window', w: 0.62, h: 0.42, sill: 0.5, left: left ? 0.3 : 0.08 }
            : { kind: 'window', w: 0.62, h: 0.42, sill: 0.14, left: left ? 0.3 : 0.08 }
        },
        wall: 0xe9ebeb, glass: 0x6a8aa2, depth: 0.25,
      })
      // 縦フィン
      const ux = (s.b[0] - s.a[0]) / len, uz = (s.b[1] - s.a[1]) / len
      const nx = uz, nz = -ux
      for (let i = 0; i <= bays; i++) {
        const u = (i / bays) * len
        k.obox(s.a[0] + ux * u + nx * 0.45, lv[1], s.a[1] + uz * u + nz * 0.45, 0.35, top - lv[1] + 0.6, 0.9, Math.atan2(-uz, ux), WHITE)
      }
    } else {
      // 妻面：白い大壁に小窓が 1 列、ガラスの階段室のスリット
      const bays = 9
      facade(k, {
        a: s.a, b: s.b, levels: upper, bays,
        cell: (_f, i) => (i === 6 ? 'curtain' : i === 2 ? { kind: 'window', w: 0.18, h: 0.28, sill: 0.4 } : 'wall'),
        wall: 0xf3f4f3, glass: 0x8fb3c9, depth: 0.3,
      })
    }
  }
  // サイン「神奈川工科大学」：青い K のマークと濃紺の文字（西の妻面）
  k.sign('神奈川工科大学', -5.5, lv[1] + 2.0, Z + 0.33, 8.4, 1.2, 0, '#1d2a44', true)
  roof(k, -X, -Z, X, Z, top, 1.0, WHITE)
  rooftop(k, -X + 2, -Z + 2, X - 2, Z - 2, top, rng(61))

  // 西側の庇（構内バス停の屋根）。下面に照明
  k.box(-2, 5.2, Z, 16, 5.7, Z + 7.5, 0xd9dcdc)
  for (let x = 0; x < 15; x += 3) k.quad([x, 5.18, Z + 6.5], [x + 1.6, 5.18, Z + 6.5], [x + 1.6, 5.18, Z + 1], [x, 5.18, Z + 1], WARM_LIGHT, 'light')
  for (const x of [-1.5, 15.5]) k.box(x - 0.15, 0, Z + 7.0, x + 0.15, 5.2, Z + 7.3, 0x9aa1a6)

  // 室内：1 階は学生食堂、上は講義室
  const r = rng(62)
  interior(k, {
    x0: -X + gi, z0: -Z + gi, x1: X - gi, z1: Z - gi, levels: [0, lv[1]], seed: 12,
    furnish: (kk, _f, y) => {
      for (let x = -X + 5; x < X - 4; x += 3.4) {
        for (let z = -Z + 5; z < Z - 4; z += 4.2) {
          if (r() < 0.12) continue
          deskIsland(kk, x, y, z, 2.6, 0.9, 0xf3f2ee, r() < 0.75 ? RED_CHAIR : ORANGE)
        }
      }
    },
  })
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: upper, seed: 13,
    furnish: (kk, _f, y, h) => {
      // 講義室：段々になった机の列（窓際から見えるように外周寄りに）
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const x = side * (X - 2.5 - i * 1.3)
          const yy = y + i * 0.15
          kk.box(x - 0.3, yy, -Z + 3, x + 0.3, yy + 0.75, Z - 3, 0xcbb38e)
        }
        kk.box(side * 4 - 0.05, y + 1.0, -Z + 4, side * 4 + 0.05, y + Math.min(2.6, h - 1), Z - 4, 0xf4f4f2)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// K1号館 情報学部棟：13 階建て・高さ 54m のタワー。白いグリッドに窓と白いパネルが市松のように
// ばらばらに並ぶ。12 階は全面ガラスのカフェテリア（オレンジの椅子）。各階に PC が並ぶ。
const k1: Model = (k, b) => {
  const X = b.width / 2, Z = b.depth / 2
  const lv = levels(5.0, 4.0, 13)
  const top = lv[lv.length - 1]
  const cafe = 11 // 12 階
  for (const s of rectSides(-X, -Z, X, Z)) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    const bays = 20
    const sideNo = ['e', 's', 'w', 'n'].indexOf(s.side)
    facade(k, {
      a: s.a, b: s.b, levels: lv, bays,
      cell: (f, i): CellKind | ({ kind: 'window' } & { w: number; h: number; sill: number }) => {
        if (f === 0) return i === 0 || i === bays - 1 ? 'wall' : 'curtain'
        if (f === cafe) return 'curtain'
        if (f === 12) return i % 3 === 1 ? { kind: 'window', w: 0.7, h: 0.35, sill: 0.45 } : 'wall'
        // 縦に 2 つ続きやすい市松：上の階と同じ列は少し窓になりやすくする
        const v = h3(f, i, sideNo) * 0.7 + h3(f + 1, i, sideNo) * 0.3
        return v < 0.5 ? { kind: 'window', w: 0.84, h: 0.86, sill: 0.06 } : 'wall'
      },
      wall: 0xf4f5f4, glass: 0x7c9db6, depth: 0.2, frame: 0xc9cfd3,
    })
    // グリッドの細い目地（白いパネルの縦の線）
    const ux = (s.b[0] - s.a[0]) / len, uz = (s.b[1] - s.a[1]) / len
    for (let i = 1; i < bays; i++) {
      const u = (i / bays) * len
      k.obox(s.a[0] + ux * u + uz * 0.22, lv[1], s.a[1] + uz * u - ux * 0.22, 0.05, top - lv[1], 0.05, Math.atan2(-uz, ux), 0xd3d8dc)
    }
  }
  // 屋上：サインの帯と設備
  roof(k, -X, -Z, X, Z, top, 1.0, 0xf4f5f4)
  k.sign('神奈川工科大学', 0, top - 1.6, Z + 0.25, 12, 1.6, 0, '#1d2a44', true)
  rooftop(k, -X + 2, -Z + 2, X - 2, Z - 2, top, rng(71))
  // 1 階の入口の庇（西）
  k.box(-8, 3.8, Z, 8, 4.1, Z + 3, WHITE)
  interior(k, {
    x0: -X, z0: -Z, x1: X, z1: Z, levels: lv, seed: 14, inset: 0.3,
    furnish: (kk, f, y) => {
      if (f === 0) {
        for (const [x, z] of [[-8, 8], [8, 8], [-8, -8], [8, -8]] as Pt[]) plant(kk, x, y, z, 2.2)
        deskIsland(kk, 0, y, Z - 6, 6, 1.0, WOOD, 0x3a4a6a)
      } else if (f === cafe) {
        for (let x = -X + 3; x < X - 2; x += 3.2) {
          for (const z of [-Z + 2.5, -Z + 6, Z - 6, Z - 2.5]) deskIsland(kk, x, y, z, 1.4, 1.0, 0xf6f3ee, ORANGE)
        }
      } else if (f < 12) {
        // 外周に沿って PC の列（ガラス越しにモニターの光が見える）
        pcRow(kk, -X + 3, X - 3, y, -Z + 3, 1)
        pcRow(kk, -X + 3, X - 3, y, Z - 3, -1)
        pcRow(kk, -X + 3, X - 3, y, -Z + 7, -1)
        pcRow(kk, -X + 3, X - 3, y, Z - 7, 1)
      }
    },
  })
  // 中央のコア（エレベーター・階段）
  k.box(-6, 0, -5, 6, top, 5, 0xdadad6)
}

export const MODELS: Record<string, Model> = { d1, d2, c1, d3, k2, c6, b5, k4, k3, k1, ...OUTER_MODELS }
