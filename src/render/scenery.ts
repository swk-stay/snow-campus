import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BUILDINGS } from '../config'
import { BALLPARK, BALLPARK_AXIS, ballparkAt, ballparkEdge, HOME_PLATE, SOCCER, soccerAt, TENNIS_AREA, TRACK_HALF_WIDTH, TENNIS_COURTS, treeSpots, type TreeSpot } from './campusGround'
import { createCampusProps } from './campusProps'

// 建て直しの対象ではない景色：雪をかぶった並木、構内バス停と神奈中バス、
// グラウンドの設備（野球場のバックネット・外野フェンス・照明塔、サッカーゴール、テニスコートのフェンス）、
// 構内の小物と小さな建物（campusProps.ts：渡り廊下・旧第三食堂・銅像・ベンチなど）。
// 雪原の上に置くだけ。当たり判定と雪に関わるのは、中に入れない小さな建物（config の OBSTACLES）だけ。

const snowMat = new THREE.MeshStandardMaterial({ color: 0xf6f9ff, roughness: 0.9 })

export function createScenery(): THREE.Group {
  const group = new THREE.Group()
  group.add(trees(treeSpots()))
  group.add(named(bus(85, 69.5, 0), 'バス'))
  group.add(named(busStopSign(94.5, 72.4), 'バス停の標識'))
  group.add(named(sportsFacilities(), 'グラウンドの設備'))
  group.add(createCampusProps())
  return group
}

/** Editor でクリックしたものの名前を出すための目印（userData.target） */
function named<T extends THREE.Object3D>(obj: T, target: string): T {
  obj.userData.target = target
  return obj
}

type Pt = readonly [number, number]

/**
 * グラウンドの設備。部品ごとに 1 つのジオメトリへまとめる（照明塔やフェンスの柱が多いので）。
 * ネットは半透明の板で表す
 */
function sportsFacilities(): THREE.Group {
  const g = new THREE.Group()
  const steel: THREE.BufferGeometry[] = []
  const white: THREE.BufferGeometry[] = []
  const blue: THREE.BufferGeometry[] = []
  const nets: THREE.BufferGeometry[] = []
  const lamps: THREE.BufferGeometry[] = []
  const snow: THREE.BufferGeometry[] = []

  const post = (list: THREE.BufferGeometry[], x: number, z: number, h: number, r = 0.08) =>
    list.push(new THREE.CylinderGeometry(r, r, h, 6).translate(x, h / 2, z))
  /** a→b に沿った高さ h の板（ネットや外野フェンス） */
  const panel = (list: THREE.BufferGeometry[], a: Pt, b: Pt, y0: number, h: number, t = 0.04) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    const geo = new THREE.BoxGeometry(l, h, t)
    geo.rotateY(Math.atan2(-(b[1] - a[1]), b[0] - a[0]))
    geo.translate((a[0] + b[0]) / 2, y0 + h / 2, (a[1] + b[1]) / 2)
    list.push(geo)
  }
  /** 折れ線に沿ったフェンス（柱を step ごとに、間にネット） */
  const fence = (pts: readonly Pt[], h: number, step: number, closed: boolean) => {
    const n = closed ? pts.length : pts.length - 1
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      panel(nets, a, b, 0, h)
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      for (let u = 0; u < l; u += step) post(steel, a[0] + ((b[0] - a[0]) * u) / l, a[1] + ((b[1] - a[1]) * u) / l, h)
    }
  }
  /** 照明塔：細い鉄柱の上に、ライトの並んだ板（雪が積もっている） */
  const lightTower = (x: number, z: number, h: number, faceX: number, faceZ: number) => {
    post(steel, x, z, h, 0.25)
    const ang = Math.atan2(faceX, faceZ)
    const head = new THREE.BoxGeometry(3.2, 2.2, 0.3).rotateY(ang).translate(x, h + 0.8, z)
    steel.push(head)
    const glow = new THREE.BoxGeometry(2.9, 1.9, 0.05).rotateY(ang).translate(x + Math.sin(ang) * 0.18, h + 0.8, z + Math.cos(ang) * 0.18)
    lamps.push(glow)
    snow.push(new THREE.BoxGeometry(3.2, 0.15, 0.6).rotateY(ang).translate(x, h + 1.97, z))
  }

  // ---- 野球場：バックネット、外野フェンス（青）、ベンチ、照明塔 ----
  const [hx, hz] = HOME_PLATE
  const at = ballparkAt
  const backstop: Pt[] = []
  for (let i = 0; i <= 8; i++) backstop.push(at(-14, -Math.PI / 4 + (i / 8) * (Math.PI / 2)))
  fence(backstop, 12, 4, false)
  // 外野フェンス：BALLPARK の弧の部分（ホームから 60m より遠い辺）
  for (let i = 0; i < BALLPARK.length; i++) {
    const a = BALLPARK[i], b = BALLPARK[(i + 1) % BALLPARK.length]
    if (Math.hypot(a[0] - hx, a[1] - hz) < 60 || Math.hypot(b[0] - hx, b[1] - hz) < 60) continue
    panel(blue, a, b, 0, 2.6, 0.3)
    panel(nets, a, b, 2.6, 6)
  }
  for (const s of [-1, 1]) {
    const [bx, bz] = at(22, s * (Math.PI / 4 + 0.35))
    blue.push(new THREE.BoxGeometry(2.4, 2.2, 9).rotateY(-s * Math.PI / 4 - BALLPARK_AXIS).translate(bx, 1.1, bz))
  }
  // 照明塔：ホームの後ろに 2 本、外野フェンスのすぐ外に 4 本。内野の中心のほうへ向ける
  const [cx, cz] = at(40, 0)
  const towers: [number, number][] = [[-12, -1.25], [-12, 1.25]]
  for (const a of [-0.55, -0.15, 0.15, 0.55]) towers.push([ballparkEdge(a) + 5, a])
  for (const [d, a] of towers) {
    const [x, z] = at(d, a)
    // 建物の敷地にかかる塔は立てない（三塁側の外野の外は E7号館）
    if (BUILDINGS.some((b) => Math.abs(x - b.x) < b.width / 2 + 1 && Math.abs(z - b.z) < b.depth / 2 + 1)) continue
    lightTower(x, z, 26, cx - x, cz - z)
  }

  // ---- サッカー場：ゴール 2 つ、照明塔 4 本（トラックの外側に立てる） ----
  for (const dir of [-1, 1]) {
    const v = dir * SOCCER.halfL
    for (const u of [-3.66, 3.66]) post(white, ...soccerAt(u, v), 2.44, 0.07)
    panel(white, soccerAt(-3.73, v), soccerAt(3.73, v), 2.37, 0.14, 0.14)
    panel(nets, soccerAt(-3.66, v + dir * 1.8), soccerAt(3.66, v + dir * 1.8), 0, 2.2)
  }
  for (const u of [-1, 1]) {
    for (const v of [-1, 1]) {
      const [x, z] = soccerAt(u * (TRACK_HALF_WIDTH + 4), v * (SOCCER.halfL - 20))
      lightTower(x, z, 22, SOCCER.cx - x, SOCCER.cz - z)
    }
  }

  // ---- テニスコート：囲いのフェンスと、各コートのネット ----
  fence(TENNIS_AREA, 4, 3, true)
  for (const c of TENNIS_COURTS) {
    const cx = c.reduce((v, p) => v + p[0], 0) / c.length
    const zs = c.map((p) => p[1])
    panel(white, [cx, Math.min(...zs) - 0.5], [cx, Math.max(...zs) + 0.5], 0, 0.95, 0.05)
  }

  const add = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (list.length) g.add(new THREE.Mesh(mergeGeometries(list.map((x) => x.toNonIndexed())), mat))
  }
  add(steel, new THREE.MeshStandardMaterial({ color: 0x8a9399, roughness: 0.6, metalness: 0.3 }))
  add(white, new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.7 }))
  add(blue, new THREE.MeshStandardMaterial({ color: 0x2f5fa8, roughness: 0.8 }))
  add(nets, new THREE.MeshBasicMaterial({ color: 0x2c3438, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }))
  add(lamps, new THREE.MeshBasicMaterial({ color: 0xfff6d8 }))
  add(snow, snowMat)
  return g
}

function trees(spots: TreeSpot[]): THREE.Group {
  const g = new THREE.Group()
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 })
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3d5a39, roughness: 1, flatShading: true })
  const pine = new THREE.MeshStandardMaterial({ color: 0x2f4a35, roughness: 1, flatShading: true })

  // 部品ごとのジオメトリ（木の原点は根元）
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6).translate(0, 1.3, 0)
  const crown = new THREE.IcosahedronGeometry(2.3, 1).translate(0, 4.1, 0)
  const crownSnow = new THREE.IcosahedronGeometry(2.25, 1).scale(1.03, 0.5, 1.03).translate(0, 5.0, 0)
  const cone = new THREE.ConeGeometry(1.9, 5.5, 7).translate(0, 4.4, 0)
  const coneSnow = new THREE.ConeGeometry(1.25, 2.4, 7).translate(0, 6.3, 0)
  // 桜：冬なので葉のない枝。幹から 5 本の枝を斜めに出す
  const branches: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.14, 0.26, 2.4, 6).translate(0, 1.2, 0)]
  const branchSnow: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4
    const len = 2.6 + (i % 2) * 0.8
    const m = new THREE.Matrix4()
      .makeTranslation(0, 2.2, 0)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeRotationZ(-0.85 - (i % 3) * 0.12))
    branches.push(new THREE.CylinderGeometry(0.05, 0.11, len, 5).translate(0, len / 2, 0).applyMatrix4(m))
    branchSnow.push(new THREE.CylinderGeometry(0.06, 0.06, len * 0.7, 5).translate(0.06, len * 0.55, 0).applyMatrix4(m))
  }
  const sakura = mergeGeometries(branches)
  const sakuraSnow = mergeGeometries(branchSnow)

  const parts: [THREE.BufferGeometry, THREE.Material, TreeSpot['kind']][] = [
    [trunk, bark, 'round'],
    [crown, leaf, 'round'],
    [crownSnow, snowMat, 'round'],
    [trunk, bark, 'conifer'],
    [cone, pine, 'conifer'],
    [coneSnow, snowMat, 'conifer'],
    [sakura, bark, 'sakura'],
    [sakuraSnow, snowMat, 'sakura'],
  ]
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  for (const [geo, mat, kind] of parts) {
    const list = spots.filter((s) => s.kind === kind)
    if (!list.length) continue
    const mesh = new THREE.InstancedMesh(geo, mat, list.length)
    named(mesh, kind === 'sakura' ? '並木（桜）' : kind === 'conifer' ? '並木（針葉樹）' : '並木（広葉樹）')
    list.forEach((s, i) => {
      q.setFromAxisAngle(up, (s.x * 7.1 + s.z * 3.3) % (Math.PI * 2))
      m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(s.scale, s.scale, s.scale))
      mesh.setMatrixAt(i, m)
    })
    g.add(mesh)
  }
  return g
}

/** 神奈中の路線バス（急行・厚木バスセンター行き）。アイボリーの車体に赤い帯 */
function bus(x: number, z: number, angle: number): THREE.Group {
  const g = new THREE.Group()
  const box = (w: number, h: number, d: number, color: number, px: number, py: number, pz: number, mat?: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat ?? new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
    mesh.position.set(px, py, pz)
    g.add(mesh)
  }
  box(10.5, 2.4, 2.5, 0xefe5c6, 0, 1.75, 0)
  box(10.52, 0.35, 2.52, 0xc8322a, 0, 0.75, 0)
  box(10.52, 0.12, 2.52, 0xe0a63a, 0, 1.05, 0)
  // 窓（濃いガラスの帯）と行き先表示
  box(9.6, 0.95, 2.54, 0x26323c, -0.2, 2.2, 0)
  box(0.1, 1.2, 2.2, 0x26323c, 5.25, 2.0, 0)
  box(0.12, 0.3, 1.6, 0xffa64a, 5.27, 2.75, 0, new THREE.MeshBasicMaterial({ color: 0xffa64a }))
  // 屋根の雪
  box(10.3, 0.25, 2.4, 0, 0, 3.05, 0, snowMat)
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12).rotateX(Math.PI / 2)
  const tire = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.9 })
  for (const wx of [-3.3, 3.6]) {
    for (const wz of [-1.15, 1.15]) {
      const w = new THREE.Mesh(wheel, tire)
      w.position.set(wx, 0.5, wz)
      g.add(w)
    }
  }
  g.position.set(x, 0.1, z)
  g.rotation.y = angle
  return g
}

/** バス停の標識（丸い板とポール） */
function busStopSign(x: number, z: number): THREE.Group {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0xc0c4c8 }))
  pole.position.y = 1.3
  const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }))
  sign.position.y = 2.5
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 6, 24), new THREE.MeshStandardMaterial({ color: 0xc8322a }))
  ring.position.y = 2.5
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a8d90 }))
  base.position.y = 0.6
  g.add(pole, sign, ring, base)
  g.position.set(x, 0, z)
  return g
}

