import * as THREE from 'three'
import { OBSTACLES, WORLD } from '../config'
import { overviewPose } from '../camera'
import type { Building } from '../sim/game'
import { PARK, TRACK_HALF_WIDTH, WALKWAYS, ballparkAt, soccerAt, treeSpots } from '../render/campusGround'

// タイトル画面の背景。キャンパスの見どころ（中庭・完成した棟・棟のあいだ・グラウンド・全体）を
// 1 カットずつゆっくり動かして撮り、カットの変わり目は空の色に溶かしてつなぐ。
// カットごとに、カメラが建物・木・渡り廊下に入らないか、被写体が手前の棟に隠れないかを確かめてから使う。

type Fog = { near: number; far: number }
/** t は 0..1。pos から look を見る */
type Leg = { duration: number; fog: Fog; pose: (t: number, pos: THREE.Vector3, look: THREE.Vector3) => void }
type LegKind = 'courtyard' | 'showcase' | 'between' | 'overview' | 'grounds'

/** カットの頭と終わりに、空の色から出てくる／溶けていく秒数 */
const FADE = 1.1
/** カットの並び。作れないカット（完成した棟がまだ無いなど）は飛ばす */
const ORDER: LegKind[] = ['courtyard', 'showcase', 'between', 'overview', 'showcase', 'grounds', 'between']
/** 中に入れない小さな建物（OBSTACLES）は高さを持っていないので、この高さまであるものとして避ける */
const OBSTACLE_HEIGHT = 10

const q = new THREE.Vector3()
const pos = new THREE.Vector3()
const look = new THREE.Vector3()

function fogFor(distance: number): Fog {
  return { near: Math.max(80, distance * 1.4), far: Math.max(320, distance * 3.5) }
}

function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

const smooth = (t: number) => t * t * (3 - 2 * t)

export class CampusTour {
  /** 空の色をどれだけ重ねるか 0..1（タイトル画面がベールに反映する） */
  fade = 1
  private leg: Leg | null = null
  private time = 0
  private order = 0
  /** 最近撮った棟・棟の組み（続けて同じものを映さない） */
  private readonly recent: string[] = []
  private readonly trees = treeSpots()
  private readonly camera: THREE.PerspectiveCamera
  private readonly fog: THREE.Fog
  private readonly buildings: Building[]
  private readonly heightOf: (b: Building) => number

  /** heightOf：その建物がいま地上に出ている高さ（建設途中なら途中まで） */
  constructor(camera: THREE.PerspectiveCamera, fog: THREE.Fog, buildings: Building[], heightOf: (b: Building) => number) {
    this.camera = camera
    this.fog = fog
    this.buildings = buildings
    this.heightOf = heightOf
  }

  update(dt: number) {
    if (!this.leg || this.time >= this.leg.duration) {
      this.leg = this.nextLeg()
      this.time = 0
      this.fog.near = this.leg.fog.near
      this.fog.far = this.leg.fog.far
    }
    const leg = this.leg
    this.time = Math.min(this.time + dt, leg.duration)
    leg.pose(this.time / leg.duration, pos, look)
    this.camera.position.copy(pos)
    this.camera.lookAt(look)
    this.fade = Math.max(0, 1 - this.time / FADE, 1 - (leg.duration - this.time) / FADE)
  }

  private nextLeg(): Leg {
    for (let n = 0; n < ORDER.length; n++) {
      const kind = ORDER[this.order++ % ORDER.length]
      const leg =
        kind === 'courtyard' ? this.courtyard()
        : kind === 'showcase' ? this.showcase()
        : kind === 'between' ? this.between()
        : kind === 'grounds' ? this.grounds()
        : this.overview()
      if (leg) return leg
    }
    return this.overview()
  }

  private remember(key: string) {
    this.recent.push(key)
    if (this.recent.length > 4) this.recent.shift()
  }

  /** 中庭（中央緑地公園）の端の低いところから、向かいの棟を見ながら持ち上がっていく */
  private courtyard(): Leg | null {
    const cx = PARK.reduce((v, p) => v + p[0], 0) / PARK.length
    const cz = PARK.reduce((v, p) => v + p[1], 0) / PARK.length
    // 公園の長い辺（X）と短い辺（Z）で、端から中心までの長さが違う
    const options = shuffle([
      { ux: 1, uz: 0, half: 36 },
      { ux: -1, uz: 0, half: 36 },
      { ux: 0, uz: 1, half: 19 },
      { ux: 0, uz: -1, half: 19 },
    ])
    for (const { ux, uz, half } of options) {
      const leg: Leg = {
        duration: 14,
        fog: fogFor(half + 40),
        pose: (t, p, l) => {
          const d = -half + half * 1.25 * t
          p.set(cx + ux * d, 7 + 16 * smooth(t), cz + uz * d)
          l.set(cx + ux * (half + 45), 6, cz + uz * (half + 45))
        },
      }
      if (this.valid(leg, 2)) return leg
    }
    return null
  }

  /** 完成した棟（まだ無ければ、これから建てる棟）のまわりを、少し寄りながら回り込む */
  private showcase(): Leg | null {
    const done = this.buildings.filter((b) => b.completed)
    const pool = done.length ? done : this.buildings.filter((b) => !b.completed).slice(0, 1)
    const fresh = pool.filter((b) => !this.recent.includes(b.id))
    for (const b of [...shuffle(fresh.length ? fresh : pool)].slice(0, 6)) {
      const leg = this.orbit(b)
      if (leg) {
        this.remember(b.id)
        return leg
      }
    }
    return null
  }

  private orbit(b: Building): Leg | null {
    const h = Math.max(this.heightOf(b), 4)
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    // 縦持ちは横の画角が狭い。そのまま収めると遠くなりすぎるので、横は少しはみ出してもよいことにする（main の framing と同じ）
    const tanH = tanV * Math.max(this.camera.aspect, 0.75)
    const wide = Math.max(b.width, b.depth) / 2
    const fit = Math.max(wide / tanH, (h * 0.6) / tanV, 18) * 1.15
    // 平たい棟ほど上から見下ろす（目の高さからだと屋根が線にしか見えない）
    const flat = THREE.MathUtils.clamp(1 - h / wide, 0, 1)
    const elevation = THREE.MathUtils.degToRad(15 + 15 * flat)
    const center = new THREE.Vector3(b.x, h * 0.42, b.z)
    const dir = Math.random() < 0.5 ? 1 : -1
    const first = Math.floor(Math.random() * 8)
    for (const lift of [0, 10, 24]) {
      for (let i = 0; i < 8; i++) {
        const a0 = (((first + i) % 8) * Math.PI) / 4
        const leg: Leg = {
          duration: 14,
          fog: fogFor(fit),
          pose: (t, p, l) => {
            const a = a0 + dir * 0.6 * (t - 0.5)
            const r = fit * Math.cos(elevation) * (1.12 - 0.16 * t) + wide * 0.4
            p.set(b.x + Math.sin(a) * r, center.y + fit * Math.sin(elevation) + lift, b.z + Math.cos(a) * r)
            l.copy(center)
          },
        }
        if (this.valid(leg, 3, b)) return leg
      }
    }
    return null
  }

  /** 向かい合った 2 棟のあいだを、棟の半分くらいの高さで抜ける */
  private between(): Leg | null {
    const tall = this.buildings.filter((b) => this.heightOf(b) >= 9)
    const found: { key: string; leg: Leg }[] = []
    for (let i = 0; i < tall.length; i++) {
      for (let j = i + 1; j < tall.length; j++) {
        for (const swap of [false, true]) {
          const leg = this.gap(tall[i], tall[j], swap)
          if (leg) found.push({ key: `${tall[i].id}-${tall[j].id}`, leg })
        }
      }
    }
    const fresh = found.filter((f) => !this.recent.includes(f.key))
    const pool = fresh.length ? fresh : found
    if (!pool.length) return null
    const pick = pool[Math.floor(Math.random() * pool.length)]
    this.remember(pick.key)
    return pick.leg
  }

  /**
   * a と b のあいだのすき間を抜けるカット。swap が false なら X 方向に並んだ 2 棟のあいだを Z 方向へ、true なら逆。
   * u がすき間をまたぐ軸、v が進む軸
   */
  private gap(a: Building, b: Building, swap: boolean): Leg | null {
    const rect = (o: Building) =>
      swap ? { u: o.z, v: o.x, hu: o.depth / 2, hv: o.width / 2 } : { u: o.x, v: o.z, hu: o.width / 2, hv: o.depth / 2 }
    const [lo, hi] = [rect(a), rect(b)].sort((m, n) => m.u - n.u)
    const width = hi.u - hi.hu - (lo.u + lo.hu)
    const v0 = Math.max(lo.v - lo.hv, hi.v - hi.hv)
    const v1 = Math.min(lo.v + lo.hv, hi.v + hi.hv)
    if (width < 9 || width > 50 || v1 - v0 < 8) return null
    const mid = (hi.u - hi.hu + lo.u + lo.hu) / 2
    const y = THREE.MathUtils.clamp(Math.min(this.heightOf(a), this.heightOf(b)) * 0.45, 7, 20)
    const sign = Math.random() < 0.5 ? 1 : -1
    const sway = (Math.random() < 0.5 ? 1 : -1) * Math.min(6, width * 0.25)
    const world = (u: number, h: number, v: number, out: THREE.Vector3) => (swap ? out.set(v, h, u) : out.set(u, h, v))
    // 抜けた先に別の棟があることもあるので、助走と抜けた後の長さを縮めながら探す
    for (const run of [30, 18, 8]) {
      const from = sign > 0 ? v0 - run : v1 + run
      const length = v1 - v0 + run * 2
      const leg: Leg = {
        duration: THREE.MathUtils.clamp(length / 6.5, 9, 15),
        fog: fogFor(40),
        pose: (t, p, l) => {
          const v = from + sign * length * t
          world(mid, y, v, p)
          world(mid + sway * Math.sin(t * Math.PI), y - 2.5, v + sign * 30, l)
        },
      }
      if (this.valid(leg, Math.min(3, width / 2 - 1.5))) return leg
    }
    return null
  }

  /** 野球場をホームの後ろからセンターへ／陸上トラックを外側から横に流す */
  private grounds(): Leg | null {
    const [hx, hz] = ballparkAt(0, 0)
    const [cx, cz] = ballparkAt(1, 0)
    const ux = cx - hx, uz = cz - hz
    // バックネット（ホームの 14m 後ろ、高さ 12m）の上を越えるので、高めから始める
    const ballpark: Leg = {
      duration: 14,
      fog: fogFor(90),
      pose: (t, p, l) => {
        const d = -26 + 50 * t
        p.set(hx + ux * d, 16 + 20 * smooth(t), hz + uz * d)
        l.set(hx + ux * 95, 0, hz + uz * 95)
      },
    }
    const side = Math.random() < 0.5 ? 1 : -1
    const along = Math.random() < 0.5 ? 1 : -1
    const track: Leg = {
      duration: 14,
      fog: fogFor(80),
      pose: (t, p, l) => {
        const v = along * (-35 + 70 * t)
        const [px, pz] = soccerAt(side * (TRACK_HALF_WIDTH + 30), v)
        const [lx, lz] = soccerAt(0, v * 0.6)
        p.set(px, 26, pz)
        l.set(lx, 0, lz)
      },
    }
    for (const leg of shuffle([ballpark, track])) if (this.valid(leg, 3)) return leg
    return null
  }

  /** キャンパス全体（全体マップより少し寄せて、ゆっくり回る） */
  private overview(): Leg {
    const base = new THREE.Vector3()
    const center = new THREE.Vector3()
    const fog = overviewPose(this.camera, WORLD.size, { x: WORLD.centerX, z: WORLD.centerZ }, base, center)
    // 縦持ちの overviewPose は横幅を収めるぶん遠く、キャンパスが小さな点になるので、もっと寄せる（端ははみ出してよい）
    const scale = this.camera.aspect < 1 ? 0.45 : 0.75
    const offset = base.sub(center).multiplyScalar(scale)
    const a0 = Math.random() * Math.PI * 2
    return {
      duration: 16,
      fog: { near: fog.near * scale, far: fog.far * scale },
      pose: (t, p, l) => {
        p.copy(offset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a0 + 0.35 * t).add(center)
        l.copy(center)
      },
    }
  }

  /** カット全体で、カメラがどこにもめり込まず、注視点までの視線が他の棟にさえぎられないか */
  private valid(leg: Leg, margin: number, subject?: Building): boolean {
    for (let i = 0; i <= 20; i++) {
      leg.pose(i / 20, pos, look)
      if (!this.free(pos, margin, null, true)) return false
      for (let k = 1; k < 10; k++) {
        q.lerpVectors(pos, look, k / 10)
        // 視線の途中にある木は、建物ほど大きく隠さないので見ない
        if (!this.free(q, 0.3, subject ?? null, false)) return false
      }
    }
    return true
  }

  private free(p: THREE.Vector3, margin: number, except: Building | null, trees: boolean): boolean {
    if (p.y < 0.5) return false
    for (const b of this.buildings) {
      if (b === except) continue
      if (Math.abs(p.x - b.x) < b.width / 2 + margin && Math.abs(p.z - b.z) < b.depth / 2 + margin && p.y < this.heightOf(b) + margin) return false
    }
    for (const o of OBSTACLES) {
      if (p.x > o.x0 - margin && p.x < o.x1 + margin && p.z > o.z0 - margin && p.z < o.z1 + margin && p.y < OBSTACLE_HEIGHT + margin) return false
    }
    for (const w of WALKWAYS) {
      const [x0, x1] = [Math.min(w.x0, w.x1), Math.max(w.x0, w.x1)]
      const [z0, z1] = [Math.min(w.z0, w.z1), Math.max(w.z0, w.z1)]
      if (p.x > x0 - margin && p.x < x1 + margin && p.z > z0 - margin && p.z < z1 + margin && p.y < w.height + margin) return false
    }
    if (trees) {
      // 樹冠は根元から半径 2.3m・高さ 8m くらい（scenery.ts の木の形に scale を掛けたもの）
      for (const s of this.trees) {
        if (p.y < 8 * s.scale + margin && Math.hypot(p.x - s.x, p.z - s.z) < 2.3 * s.scale + margin) return false
      }
    }
    return true
  }
}
