import * as THREE from 'three'
import type { Slot } from './material'

// 建物モデルを組み立てるための道具。箱・板・押し出しなどを slot（solid / glass / light）ごとに
// 1 つのジオメトリへ詰めていき、最後に slot ごとに 1 メッシュにまとめる（ドローコールを 3 本に抑える）。
// 室内（interior() の中で作るもの）は別のメッシュにして、遠くの建物では隠せるようにする（LOD）。
// 座標は建物ローカル（原点 = 敷地の中心の地面、+X が南、+Z が西）。

type Vec = readonly [number, number, number]
type Pt = readonly [number, number]

class Buffer {
  readonly pos: number[] = []
  readonly nor: number[] = []
  readonly col: number[] = []
  readonly idx: number[] = []
}

const tmpColor = new THREE.Color()

/** 決定的な乱数（同じ seed なら毎回同じ配置になる） */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

/** 壁のサイン（文字）。頂点カラーでは文字を描けないので、Canvas のテクスチャを貼った板を別に作る */
type Sign = { text: string; x: number; y: number; z: number; w: number; h: number; angle: number; color: string; logo: boolean }

type Layer = 'shell' | 'interior'

export class Kit {
  private readonly buffers: Record<Layer, Record<Slot, Buffer>> = {
    shell: { solid: new Buffer(), glass: new Buffer(), light: new Buffer() },
    interior: { solid: new Buffer(), glass: new Buffer(), light: new Buffer() },
  }
  private readonly signs: Sign[] = []
  /** いま作っているのが外側（shell）か室内（interior）か。interior() の中だけ 'interior' になる */
  layer: Layer = 'shell'

  /** fn の中で作るものを室内（遠くでは描かない）にする。interior() を使わずに家具を置くとき用 */
  inside(fn: () => void) {
    const prev = this.layer
    this.layer = 'interior'
    fn()
    this.layer = prev
  }

  /** 4 頂点の面（反時計回りが表）。法線は面から計算する */
  quad(a: Vec, b: Vec, c: Vec, d: Vec, color: number, slot: Slot = 'solid') {
    const buf = this.buffers[this.layer][slot]
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    tmpColor.setHex(color)
    const base = buf.pos.length / 3
    for (const p of [a, b, c, d]) {
      buf.pos.push(p[0], p[1], p[2])
      buf.nor.push(nx, ny, nz)
      buf.col.push(tmpColor.r, tmpColor.g, tmpColor.b)
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  /** 軸にそろった箱（min/max 指定）。bottom=false で底面を省く（地面に接する物はほぼ見えないので） */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, slot: Slot = 'solid', bottom = false) {
    if (x0 > x1) [x0, x1] = [x1, x0]
    if (z0 > z1) [z0, z1] = [z1, z0]
    // +X, -X, +Z, -Z, +Y, -Y
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, slot)
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, slot)
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, slot)
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, slot)
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color, slot)
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, slot)
  }

  /** 中心・幅・高さ・奥行き・Y 軸回りの回転で指定する箱（斜めの柱やルーバー用） */
  obox(cx: number, y0: number, cz: number, w: number, h: number, d: number, angle: number, color: number, slot: Slot = 'solid') {
    const c = Math.cos(angle), s = Math.sin(angle)
    const p = (u: number, y: number, v: number): Vec => [cx + u * c + v * s, y, cz - u * s + v * c]
    const hw = w / 2, hd = d / 2, y1 = y0 + h
    this.quad(p(hw, y0, hd), p(hw, y0, -hd), p(hw, y1, -hd), p(hw, y1, hd), color, slot)
    this.quad(p(-hw, y0, -hd), p(-hw, y0, hd), p(-hw, y1, hd), p(-hw, y1, -hd), color, slot)
    this.quad(p(-hw, y0, hd), p(hw, y0, hd), p(hw, y1, hd), p(-hw, y1, hd), color, slot)
    this.quad(p(hw, y0, -hd), p(-hw, y0, -hd), p(-hw, y1, -hd), p(hw, y1, -hd), color, slot)
    this.quad(p(-hw, y1, hd), p(hw, y1, hd), p(hw, y1, -hd), p(-hw, y1, -hd), color, slot)
  }

  /** 2 点を結ぶ鉛直の板（壁やガラス面）。厚みなし */
  wall(a: Pt, b: Pt, y0: number, y1: number, color: number, slot: Slot = 'solid') {
    this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], color, slot)
  }

  /** 2 点を結ぶ、厚みのある壁（線分の中心線で厚み t） */
  slabWall(a: Pt, b: Pt, y0: number, y1: number, t: number, color: number, slot: Slot = 'solid') {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const angle = Math.atan2(-(b[1] - a[1]), b[0] - a[0])
    this.obox((a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2, len, y1 - y0, t, angle, color, slot)
  }

  /** 多角形を押し出した立体（屋根スラブや床、六角形の建物など）。pts は XZ 平面。holes で穴（天窓など）を開けられる */
  prism(pts: readonly Pt[], y0: number, y1: number, color: number, slot: Slot = 'solid', sides = true, holes: readonly (readonly Pt[])[] = []) {
    const toVec = (p: readonly Pt[]) => p.map(([x, z]) => new THREE.Vector2(x, z))
    const tris = THREE.ShapeUtils.triangulateShape(toVec(pts), holes.map(toVec))
    // 三角形の頂点番号は、外周 → 穴の順につなげた並びを指す
    const all = [...pts, ...holes.flat()]
    const buf = this.buffers[this.layer][slot]
    tmpColor.setHex(color)
    // 三角形の巻き順を、上面は上から・底面は下から見て表になるようにそろえる（DoubleSide の陰影が裏返らないように）
    const [i0, j0, k0] = tris[0]
    const upward = (all[j0][0] - all[i0][0]) * (all[k0][1] - all[i0][1]) - (all[j0][1] - all[i0][1]) * (all[k0][0] - all[i0][0]) < 0
    for (const [y, ny] of [[y1, 1], [y0, -1]] as const) {
      const base = buf.pos.length / 3
      for (const [x, z] of all) {
        buf.pos.push(x, y, z)
        buf.nor.push(0, ny, 0)
        buf.col.push(tmpColor.r, tmpColor.g, tmpColor.b)
      }
      const flip = upward !== (ny > 0)
      for (const [i, j, k] of tris) buf.idx.push(base + i, base + (flip ? k : j), base + (flip ? j : k))
    }
    if (!sides) return
    for (const ring of [pts, ...holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], color, slot)
      }
    }
  }

  /** 円柱（鉛直） */
  cylinder(cx: number, cz: number, r: number, y0: number, y1: number, color: number, segments = 10, slot: Slot = 'solid') {
    const pts: Pt[] = []
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
    }
    this.prism(pts, y0, y1, color, slot)
  }

  /**
   * 壁のサイン。中心 (x, y, z)、幅 w・高さ h の板を、angle だけ Y 軸回りに回した向き（0 で +Z を向く）に置く。
   * logo=true なら左端に大学の青い「K」マークを付ける
   */
  sign(text: string, x: number, y: number, z: number, w: number, h: number, angle: number, color = '#1d2a44', logo = false) {
    this.signs.push({ text, x, y, z, w, h, angle, color, logo })
  }

  /** サインのメッシュ。マテリアルの opacity で完成時にフェードインさせる */
  buildSigns(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] {
    return this.signs.map((s) => {
      const ch = 128
      const cwid = Math.round((ch * s.w) / s.h)
      const canvas = document.createElement('canvas')
      canvas.width = cwid
      canvas.height = ch
      const g = canvas.getContext('2d')!
      let left = 0
      if (s.logo) {
        g.fillStyle = '#1f4fa0'
        g.fillRect(0, 8, ch - 16, ch - 16)
        g.fillStyle = '#fff'
        g.font = `bold ${ch * 0.7}px sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('K', (ch - 16) / 2, ch / 2 + 4)
        left = ch
      }
      g.fillStyle = s.color
      g.textAlign = 'left'
      g.textBaseline = 'middle'
      let size = ch * 0.78
      g.font = `bold ${size}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`
      const room = cwid - left - 8
      const tw = g.measureText(s.text).width
      if (tw > room) {
        size *= room / tw
        g.font = `bold ${size}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`
      }
      g.fillText(s.text, left + 4, ch / 2 + 4)
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(s.w, s.h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }),
      )
      mesh.position.set(s.x, s.y, s.z)
      mesh.rotation.y = s.angle
      mesh.renderOrder = 2
      return mesh
    })
  }

  /** slot ごとに 1 メッシュへまとめる。室内のメッシュは userData.interior = true */
  build(materials: Record<Slot, THREE.Material>): THREE.Group {
    const group = new THREE.Group()
    for (const layer of ['shell', 'interior'] as Layer[]) {
      for (const slot of ['solid', 'light', 'glass'] as Slot[]) {
        const buf = this.buffers[layer][slot]
        if (!buf.idx.length) continue
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3))
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3))
        geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3))
        geo.setIndex(buf.idx)
        geo.computeBoundingSphere()
        const mesh = new THREE.Mesh(geo, materials[slot])
        // ガラスは中身（solid）より後に描く
        mesh.renderOrder = slot === 'glass' ? 1 : 0
        mesh.userData.interior = layer === 'interior'
        group.add(mesh)
      }
    }
    return group
  }

  get vertexCount(): number {
    return Object.values(this.buffers).reduce((n, l) => n + Object.values(l).reduce((m, b) => m + b.pos.length / 3, 0), 0)
  }
}

// ---- ファサード（外壁）の部品 ----

/**
 * 外壁の 1 面。a→b の線上に、階ごと・柱間ごとのセルを並べる。
 * 外周を見下ろしの画面で時計回り（rectSides の順）にたどったときに外側を向くように作る。
 * cell が返す種類で、セルの中身を作る：
 *   wall    : 壁で埋める
 *   window  : 腰壁と垂れ壁のある窓（ポツ窓）。窓の大きさは win で決める
 *   curtain : 床から天井までのガラス（細いマリオン付き）
 *   open    : 何も作らない（ピロティや別に作る部分）
 */
export type CellKind = 'wall' | 'window' | 'curtain' | 'open'
/** ポツ窓の大きさ（セルに対する割合）と腰壁の高さ（割合）。left は窓の左端の位置（省略で中央） */
export type WindowSize = { w: number; h: number; sill: number; left?: number }

export type FacadeSpec = {
  a: Pt
  b: Pt
  /** 各階の床の高さ（最後の要素は屋上の高さ） */
  levels: number[]
  /** 柱間の数 */
  bays: number
  /** セルの種類。窓の大きさをセルごとに変えたいときは { kind: 'window', ...WindowSize } を返す */
  cell: (floor: number, bay: number) => CellKind | ({ kind: 'window' } & WindowSize)
  wall: number
  glass: number
  frame?: number
  win?: WindowSize
  /** 壁の厚み（外側へのふくらみ）。ガラスはこの分だけ奥に入る */
  depth?: number
}

export function facade(k: Kit, f: FacadeSpec) {
  const [ax, az] = f.a
  const [bx, bz] = f.b
  const len = Math.hypot(bx - ax, bz - az)
  const ux = (bx - ax) / len, uz = (bz - az) / len
  // 外向き（画面で時計回りにたどるとき、進行方向の左側）
  const nx = uz, nz = -ux
  const depth = f.depth ?? 0.35
  const frame = f.frame ?? 0x8a9097
  const defaultWin = f.win ?? { w: 0.55, h: 0.6, sill: 0.25 }
  const at = (u: number, out: number): Pt => [ax + ux * u + nx * out, az + uz * u + nz * out]
  // u0..u1 × y0..y1 の範囲を、外壁面から奥行き depth の箱で埋める
  const block = (u0: number, u1: number, y0: number, y1: number, color: number, out = depth, inn = 0) => {
    if (u1 - u0 < 1e-3 || y1 - y0 < 1e-3) return
    const p = at((u0 + u1) / 2, (out + inn) / 2)
    k.obox(p[0], y0, p[1], u1 - u0, y1 - y0, out - inn, Math.atan2(-uz, ux), color)
  }
  const pane = (u0: number, u1: number, y0: number, y1: number, inset: number) => {
    const p0 = at(u0, -inset)
    const p1 = at(u1, -inset)
    k.wall(p0, p1, y0, y1, f.glass, 'glass')
  }
  const bw = len / f.bays
  for (let fl = 0; fl < f.levels.length - 1; fl++) {
    const y0 = f.levels[fl]
    const y1 = f.levels[fl + 1]
    const h = y1 - y0
    for (let i = 0; i < f.bays; i++) {
      const u0 = i * bw
      const u1 = u0 + bw
      const c = f.cell(fl, i)
      const kind = typeof c === 'string' ? c : c.kind
      const win = typeof c === 'string' ? defaultWin : c
      if (kind === 'open') continue
      if (kind === 'wall') {
        block(u0, u1, y0, y1, f.wall)
      } else if (kind === 'curtain') {
        // 床の線（スラブの小口）と細いマリオン
        block(u0, u1, y0, y0 + 0.35, f.wall)
        block(u0, u0 + 0.08, y0, y1, frame, 0.12)
        block(u1 - 0.08, u1, y0, y1, frame, 0.12)
        pane(u0, u1, y0 + 0.35, y1, 0.02)
      } else {
        const ww = bw * win.w
        const wu0 = win.left === undefined ? (u0 + u1) / 2 - ww / 2 : u0 + bw * win.left
        const wu1 = wu0 + ww
        const wy0 = y0 + h * win.sill
        const wy1 = Math.min(y1 - 0.05, wy0 + h * win.h)
        block(u0, u1, y0, wy0, f.wall)
        block(u0, u1, wy1, y1, f.wall)
        block(u0, wu0, wy0, wy1, f.wall)
        block(wu1, u1, wy0, wy1, f.wall)
        // サッシ（窓枠）
        block(wu0, wu1, wy0, wy0 + 0.06, frame, 0.05, -0.15)
        block((wu0 + wu1) / 2 - 0.03, (wu0 + wu1) / 2 + 0.03, wy0, wy1, frame, 0.0, -0.15)
        pane(wu0, wu1, wy0, wy1, 0.15)
      }
    }
  }
}

/** 長方形の建物の 4 面。ローカル座標の範囲 [x0,x1]×[z0,z1] を時計回りにたどる */
export function rectSides(x0: number, z0: number, x1: number, z1: number): { a: Pt; b: Pt; side: 'n' | 's' | 'e' | 'w' }[] {
  // 見下ろしの画面（X 右・Z 下）で時計回り：(-x,-z) → (+x,-z) → (+x,+z) → (-x,+z)
  // +X=南、-Z=東、+Z=西、-X=北
  return [
    { a: [x0, z0], b: [x1, z0], side: 'e' },
    { a: [x1, z0], b: [x1, z1], side: 's' },
    { a: [x1, z1], b: [x0, z1], side: 'w' },
    { a: [x0, z1], b: [x0, z0], side: 'n' },
  ]
}

// ---- 多角形 ----

/** 見下ろしの画面（X 右・Z 下）で時計回りの順に並べ替える（facade の外向きの向きをそろえるため） */
export function cw(pts: readonly Pt[]): Pt[] {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  return area >= 0 ? [...pts] : [...pts].reverse()
}

/** 凸多角形を d だけ内側へ縮める（各辺を平行移動して隣の辺と交差させる）。pts は cw() の順 */
export function insetPoly(pts: readonly Pt[], d: number): Pt[] {
  const n = pts.length
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len
    // 内向き（時計回りの進行方向の右側）
    const nx = -uz, nz = ux
    return { p: [a[0] + nx * d, a[1] + nz * d] as Pt, u: [ux, uz] as Pt }
  })
  return lines.map((l1, i) => {
    const l0 = lines[(i + n - 1) % n]
    // l0.p + t*l0.u = l1.p + s*l1.u
    const det = l0.u[0] * -l1.u[1] - l0.u[1] * -l1.u[0]
    const dx = l1.p[0] - l0.p[0], dz = l1.p[1] - l0.p[1]
    const t = Math.abs(det) < 1e-9 ? 0 : (dx * -l1.u[1] - dz * -l1.u[0]) / det
    return [l0.p[0] + l0.u[0] * t, l0.p[1] + l0.u[1] * t] as Pt
  })
}

export function insidePoly(pts: readonly Pt[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** 多角形を z 一定の線で切ったときの x の範囲（凸多角形向け）。交わらなければ null */
export function spanAtZ(pts: readonly Pt[], z: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if ((a[1] - z) * (b[1] - z) > 0 || a[1] === b[1]) continue
    const x = a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0])
    lo = Math.min(lo, x)
    hi = Math.max(hi, x)
  }
  return lo < hi ? [lo, hi] : null
}

// ---- 室内の部品 ----

export type InteriorSpec = {
  x0: number
  z0: number
  x1: number
  z1: number
  /** 各階の床の高さ（最後は屋上） */
  levels: number[]
  /** 床スラブの色・天井照明の色 */
  slab?: number
  ceilingLight?: number
  /** 外壁からの後退（スラブはガラスのすぐ内側まで） */
  inset?: number
  /** 階ごとの家具。null なら床と照明だけ */
  furnish?: (k: Kit, floor: number, y: number, h: number, r: () => number) => void
  seed?: number
}

/** 各階の床スラブ・天井の照明パネル・内部の柱と、指定があれば家具を作る */
export function interior(k: Kit, s: InteriorSpec) {
  const prev = k.layer
  const inset = s.inset ?? 0.4
  const slab = s.slab ?? 0xd8d6d0
  const light = s.ceilingLight ?? 0xfff3d6
  const x0 = s.x0 + inset, x1 = s.x1 - inset, z0 = s.z0 + inset, z1 = s.z1 - inset
  const r = rng(s.seed ?? 7)
  for (let fl = 0; fl < s.levels.length - 1; fl++) {
    const y = s.levels[fl]
    const h = s.levels[fl + 1] - y
    // 床と天井は外側（shell）に入れる：遠くから見ても、ガラスの奥に床の層が見えるように
    k.layer = prev
    // 床（地面に置く階は少し上げて、地面とのちらつきを防ぐ）
    const onGround = y < 0.5
    const top = onGround ? Math.max(y + 0.05, 0.12) : y + 0.05
    k.box(x0, onGround ? 0 : y - 0.3, z0, x1, top, z1, slab)
    // 天井（上の階の床の裏）
    const cy = y + h - 0.35
    k.quad([x0, cy, z1], [x1, cy, z1], [x1, cy, z0], [x0, cy, z0], 0xd5d8da)
    // 照明パネル・柱・家具は室内（近くでだけ描く）
    k.layer = 'interior'
    const step = 3.6
    for (let x = x0 + 1.5; x < x1 - 1; x += step) {
      for (let z = z0 + 1.5; z < z1 - 1; z += step) {
        k.quad([x, cy - 0.02, z], [x + 1.2, cy - 0.02, z], [x + 1.2, cy - 0.02, z + 0.6], [x, cy - 0.02, z + 0.6], light, 'light')
      }
    }
    // 内部の柱（7.2m グリッド）
    for (let x = x0 + 7.2; x < x1 - 3; x += 7.2) {
      for (let z = z0 + 7.2; z < z1 - 3; z += 7.2) k.box(x - 0.35, y, z - 0.35, x + 0.35, y + h - 0.35, z + 0.35, 0xe6e4de)
    }
    s.furnish?.(k, fl, top, h, r)
  }
  k.layer = prev
}

// ---- 家具（室内をガラス越しに見せるための小物） ----

/** 机と椅子の島。color は天板、chair は椅子 */
export function deskIsland(k: Kit, cx: number, y: number, cz: number, w: number, d: number, top: number, chair: number) {
  k.box(cx - w / 2, y + 0.7, cz - d / 2, cx + w / 2, y + 0.75, cz + d / 2, top)
  k.box(cx - w / 2 + 0.05, y, cz - 0.05, cx + w / 2 - 0.05, y + 0.7, cz + 0.05, 0x9a9a9a)
  for (let x = cx - w / 2 + 0.5; x < cx + w / 2; x += 1.1) {
    for (const sz of [-1, 1]) {
      const z = cz + sz * (d / 2 + 0.35)
      k.box(x - 0.22, y + 0.42, z - 0.22, x + 0.22, y + 0.48, z + 0.22, chair)
      k.box(x - 0.22, y + 0.48, z + sz * 0.18, x + 0.22, y + 0.95, z + sz * 0.22, chair)
    }
  }
}

/** PC の列（情報系の演習室）。モニターは青白く光る */
export function pcRow(k: Kit, x0: number, x1: number, y: number, z: number, facing: 1 | -1) {
  k.box(x0, y + 0.7, z - 0.4, x1, y + 0.75, z + 0.4, 0xe9e6df)
  for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.0) {
    const mz = z - facing * 0.2
    k.box(x - 0.28, y + 0.8, mz - 0.03, x + 0.28, y + 1.15, mz + 0.03, 0x222428)
    k.quad([x - 0.25, y + 0.83, mz + facing * 0.035], [x + 0.25, y + 0.83, mz + facing * 0.035], [x + 0.25, y + 1.12, mz + facing * 0.035], [x - 0.25, y + 1.12, mz + facing * 0.035], 0x9fd0ff, 'light')
    const cz = z + facing * 0.75
    k.box(x - 0.22, y + 0.42, cz - 0.22, x + 0.22, y + 0.48, cz + 0.22, 0x3a4a6a)
  }
}

/** 本棚の列（図書館） */
export function shelfRow(k: Kit, x0: number, x1: number, y: number, z: number, height: number, wood: number, r: () => number) {
  k.box(x0, y, z - 0.3, x1, y + height, z + 0.3, wood)
  // 本の背表紙（棚ごとに色を変えた帯）
  const colors = [0x7a3b2e, 0x2e4f7a, 0x3c6b45, 0xb08a3e, 0x6b4a7a, 0xd9d2c0]
  for (let sy = y + 0.25; sy < y + height - 0.3; sy += 0.4) {
    for (const side of [-1, 1]) {
      for (let x = x0 + 0.05; x < x1 - 0.3; x += 0.9) {
        const c = colors[Math.floor(r() * colors.length)]
        const zz = z + side * 0.301
        k.quad(side > 0 ? [x, sy, zz] : [x + 0.85, sy, zz], side > 0 ? [x + 0.85, sy, zz] : [x, sy, zz], side > 0 ? [x + 0.85, sy + 0.32, zz] : [x, sy + 0.32, zz], side > 0 ? [x, sy + 0.32, zz] : [x + 0.85, sy + 0.32, zz], c)
      }
    }
  }
}

/** 観葉植物（鉢＋丸い葉） */
export function plant(k: Kit, x: number, y: number, z: number, h: number, leaf = 0x4f8a3c) {
  k.cylinder(x, z, 0.25, y, y + 0.45, 0xf2f2f0, 8)
  k.box(x - 0.03, y + 0.45, z - 0.03, x + 0.03, y + h * 0.6, z + 0.03, 0x6b5136)
  const r = h * 0.28
  k.obox(x, y + h * 0.45, z, r * 2, r * 2, r * 2, 0.6, leaf)
  k.obox(x + r * 0.4, y + h * 0.6, z - r * 0.3, r * 1.4, r * 1.3, r * 1.4, 1.2, leaf)
}
