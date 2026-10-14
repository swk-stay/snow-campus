import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { OBSTACLES } from '../config'
import { WALKWAYS } from './campusGround'

// 構内の小物と、建て直しの対象ではない小さな建物（Editor のリクエストで置いたもの）。
// 位置は Editor の座標と OSM の外形。部品は材質ごとに 1 つのジオメトリへまとめる（ドローコールを抑える）。
// 景色（scenery.ts）と同じく雪原の上に置くだけ。中に入れない建物は config の OBSTACLES で当たり判定を持つ。

type Lists = Record<'concrete' | 'oldWall' | 'steel' | 'wood' | 'bronze' | 'stone' | 'white' | 'dark' | 'glass' | 'snow' | 'lamp' | 'red' | 'blue' | 'bark', THREE.BufferGeometry[]>

const MATERIALS: Record<keyof Lists, THREE.Material> = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.95 }),
  oldWall: new THREE.MeshStandardMaterial({ color: 0xd3cdbf, roughness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8a9399, roughness: 0.5, metalness: 0.4 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9c7348, roughness: 0.85 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x5e5236, roughness: 0.45, metalness: 0.6 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8f8c86, roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf2f3f2, roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b3136, roughness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xb8d4e2, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
  snow: new THREE.MeshStandardMaterial({ color: 0xf6f9ff, roughness: 0.9 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff3d0 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.5 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2f5fa8, roughness: 0.5 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }),
}

/** 名前（Editor でクリックしたときに出る）ごとに部品を集めて、材質ごとに 1 メッシュにする */
class Props {
  readonly group = new THREE.Group()
  private lists: Lists = Props.empty()

  private static empty(): Lists {
    return Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, []])) as unknown as Lists
  }

  /** 軸にそろった箱（min/max） */
  box(mat: keyof Lists, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const geo = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))
    this.lists[mat].push(geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
  }

  /** 中心・寸法・Y 軸回りの回転で指定する箱（angle=0 で w が X、d が Z） */
  obox(mat: keyof Lists, cx: number, y0: number, cz: number, w: number, h: number, d: number, angle: number) {
    this.lists[mat].push(new THREE.BoxGeometry(w, h, d).rotateY(angle).translate(cx, y0 + h / 2, cz))
  }

  add(mat: keyof Lists, geo: THREE.BufferGeometry) {
    this.lists[mat].push(geo)
  }

  /** ここまでの部品を、Editor で target という名前で選べる 1 グループにまとめる */
  flush(target: string) {
    const g = new THREE.Group()
    g.userData.target = target
    for (const [k, list] of Object.entries(this.lists) as [keyof Lists, THREE.BufferGeometry[]][]) {
      if (!list.length) continue
      const mesh = new THREE.Mesh(mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x))), MATERIALS[k])
      if (k === 'glass') mesh.renderOrder = 1
      g.add(mesh)
    }
    this.group.add(g)
    this.lists = Props.empty()
  }
}

export function createCampusProps(): THREE.Group {
  const p = new Props()

  for (const w of WALKWAYS) walkway(p, w.x0, w.z0, w.x1, w.z1, w.height)
  p.flush('渡り廊下')

  const cafe = OBSTACLES.find((o) => o.label === '旧第三食堂')!
  oldCafeteria(p, cafe.x0, cafe.z0, cafe.x1, cafe.z1)
  p.flush('旧第三食堂')

  // 旧第三食堂の西のコンクリートの塀。向きと長さは分からないので、食堂の西面に平行に、食堂の幅ほどにした
  p.box('concrete', 3.3, 0, -67.35, 13.3, 2.2, -67.05)
  p.box('snow', 3.3, 2.2, -67.4, 13.3, 2.32, -67.0)
  p.flush('コンクリートの壁')

  statue(p, -37.0, -1.3)
  p.flush('銅像')

  appleTree(p, -20.9, -31.4)
  p.flush('ニュートンのりんごの木')

  // 附属図書館の南の壁ぎわのベンチとテーブル
  picnicTable(p, -63.4, -4.2, 0)
  picnicTable(p, -63.4, 1.8, 0)
  p.flush('ベンチとテーブル')

  // 中庭の東の芝生の北の縁（芝生のほうを向く）
  bench(p, 9.8, 5.8, Math.PI / 2)
  // K3号館の入口の前（写真：ピロティの西、北面の柱の前に 3 つ並ぶ）
  for (const z of [22.5, 25.5, 28.5]) bench(p, 60.4, z, -Math.PI / 2)
  p.flush('ベンチ')

  const laundry = OBSTACLES.find((o) => o.label === '洗濯機')!
  const vending = OBSTACLES.find((o) => o.label === '自販機')!
  // 2 つの小屋のあいだの通路に向かって、機械が並ぶ
  machineShed(p, laundry.x0, laundry.z0, laundry.x1, laundry.z1, 1, 'laundry')
  machineShed(p, vending.x0, vending.z0, vending.x1, vending.z1, -1, 'vending')
  p.flush('洗濯機と自販機')

  bbq(p, 111.3, -69.9)
  p.flush('BBQ場')

  return p.group
}

/**
 * 渡り廊下：細い鉄骨の柱と梁で、高いところにガラスの屋根を載せただけ（壁はない）。
 * 長辺は X（南北）。屋根は建物の外形の 1m ほど手前で終わる
 */
function walkway(p: Props, x0: number, z0: number, x1: number, z1: number, h: number) {
  const n = Math.max(2, Math.round((x1 - x0) / 4.5))
  for (let i = 0; i <= n; i++) {
    const x = x0 + 0.3 + ((x1 - x0 - 0.6) * i) / n
    for (const z of [z0 + 0.25, z1 - 0.25]) p.box('steel', x - 0.1, 0, z - 0.1, x + 0.1, h - 0.25, z + 0.1)
    // 梁（短辺方向）
    p.box('steel', x - 0.08, h - 0.45, z0 + 0.1, x + 0.08, h - 0.25, z1 - 0.1)
  }
  for (const z of [z0 + 0.25, z1 - 0.25]) p.box('steel', x0, h - 0.45, z - 0.08, x1, h - 0.25, z + 0.08)
  p.box('glass', x0, h - 0.25, z0, x1, h - 0.17, z1)
  // 屋根の縁に残った雪（ガラスの上は融けて、枠にだけ残る）
  for (const z of [z0, z1 - 0.3]) p.box('snow', x0, h - 0.17, z, x1, h - 0.09, z + 0.3)
}

/**
 * 旧第三食堂：古い平屋（1 層だが天井の高い食堂）。灰色がかったベージュの壁に横長の窓。
 * 高さは OSM の 14.4m が平屋にしては高すぎるので 6m にした。入口は分からないので、
 * 中庭からの園路（北）に面した側にガラスの扉を付けている
 */
function oldCafeteria(p: Props, x0: number, z0: number, x1: number, z1: number) {
  const H = 6
  p.box('oldWall', x0, 0, z0, x1, H, z1)
  // 横長の窓（長辺＝東西の面）と、北面の扉
  for (const z of [z0 - 0.02, z1 + 0.02]) {
    for (let x = x0 + 1; x < x1 - 1.5; x += 2.2) p.box('dark', x, 2.0, z - 0.03, x + 1.6, 4.3, z + 0.03)
  }
  for (let z = z0 + 1.2; z < z1 - 1.5; z += 2.2) p.box('dark', x1 - 0.03, 2.0, z, x1 + 0.03, 4.3, z + 1.6)
  const zc = (z0 + z1) / 2
  p.box('glass', x0 - 0.04, 0, zc - 1.6, x0 + 0.02, 2.5, zc + 1.6)
  p.box('steel', x0 - 0.06, 2.5, zc - 1.7, x0, 2.6, zc + 1.7)
  p.box('oldWall', x0 - 1.8, 2.7, zc - 2.4, x0, 2.9, zc + 2.4)
  p.box('snow', x0 - 1.8, 2.9, zc - 2.4, x0, 3.0, zc + 2.4)
  // パラペットと屋上の雪
  p.box('oldWall', x0 - 0.1, H, z0 - 0.1, x1 + 0.1, H + 0.5, z0 + 0.2)
  p.box('oldWall', x0 - 0.1, H, z1 - 0.2, x1 + 0.1, H + 0.5, z1 + 0.1)
  p.box('oldWall', x0 - 0.1, H, z0, x0 + 0.2, H + 0.5, z1)
  p.box('oldWall', x1 - 0.2, H, z0, x1 + 0.1, H + 0.5, z1)
  p.box('snow', x0 + 0.2, H, z0 + 0.2, x1 - 0.2, H + 0.3, z1 - 0.2)
}

/** 銅像：石の台座に、立っている人の像 */
function statue(p: Props, x: number, z: number) {
  p.box('stone', x - 0.9, 0, z - 0.9, x + 0.9, 0.3, z + 0.9)
  p.box('stone', x - 0.6, 0.3, z - 0.6, x + 0.6, 1.6, z + 0.6)
  p.add('bronze', new THREE.CylinderGeometry(0.2, 0.26, 1.0, 8).translate(x, 2.1, z))
  p.add('bronze', new THREE.CylinderGeometry(0.26, 0.24, 0.6, 8).translate(x, 2.9, z))
  p.add('bronze', new THREE.SphereGeometry(0.15, 10, 8).translate(x, 3.38, z))
  p.add('snow', new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.5).translate(x, 3.4, z))
  p.box('snow', x - 0.62, 1.6, z - 0.62, x + 0.62, 1.68, z + 0.62)
}

/** ニュートンのりんごの木：葉の落ちた低い木を、低い柵と説明板で囲む */
function appleTree(p: Props, x: number, z: number) {
  p.add('bark', new THREE.CylinderGeometry(0.1, 0.16, 1.4, 6).translate(x, 0.7, z))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    const len = 1.5 + (i % 2) * 0.5
    const m = new THREE.Matrix4()
      .makeTranslation(x, 1.3, z)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeRotationZ(-1.0 - (i % 3) * 0.12))
    p.add('bark', new THREE.CylinderGeometry(0.035, 0.07, len, 5).translate(0, len / 2, 0).applyMatrix4(m))
    p.add('snow', new THREE.CylinderGeometry(0.04, 0.04, len * 0.6, 5).translate(0.04, len * 0.55, 0).applyMatrix4(m))
  }
  // 柵（半径 1.8m の八角形）
  const r = 1.8
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2
    const ax = x + Math.cos(a0) * r, az = z + Math.sin(a0) * r
    const bx = x + Math.cos(a1) * r, bz = z + Math.sin(a1) * r
    p.box('wood', ax - 0.05, 0, az - 0.05, ax + 0.05, 0.6, az + 0.05)
    const l = Math.hypot(bx - ax, bz - az)
    p.obox('wood', (ax + bx) / 2, 0.45, (az + bz) / 2, l, 0.06, 0.04, Math.atan2(-(bz - az), bx - ax))
  }
  // 説明板（中庭の園路の側）
  p.box('steel', x - 2.6, 0, z + 0.4, x - 2.55, 0.9, z + 0.45)
  p.obox('white', x - 2.58, 0.8, z + 0.42, 0.04, 0.45, 0.65, 0)
}

/** ベンチ（木の座面と背もたれ、鉄の脚）。angle=0 で長手が X、背もたれが -Z 側 */
function bench(p: Props, x: number, z: number, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle)
  const at = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c]
  for (const u of [-0.75, 0.75]) {
    const [px, pz] = at(u, 0)
    p.obox('steel', px, 0, pz, 0.06, 0.42, 0.45, angle)
  }
  const [sx, sz] = at(0, 0)
  p.obox('wood', sx, 0.42, sz, 1.8, 0.05, 0.45, angle)
  p.obox('snow', sx, 0.47, sz, 1.75, 0.05, 0.4, angle)
  const [bx, bz] = at(0, -0.22)
  p.obox('wood', bx, 0.55, bz, 1.8, 0.35, 0.05, angle)
}

/** テーブルとベンチの組（長手が angle の向き） */
function picnicTable(p: Props, x: number, z: number, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle)
  const at = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c]
  p.obox('wood', x, 0.7, z, 1.8, 0.05, 0.8, angle)
  p.obox('snow', x, 0.75, z, 1.75, 0.06, 0.75, angle)
  for (const u of [-0.7, 0.7]) {
    const [px, pz] = at(u, 0)
    p.obox('steel', px, 0, pz, 0.06, 0.7, 0.6, angle)
  }
  for (const v of [-0.75, 0.75]) {
    const [bx, bz] = at(0, v)
    p.obox('wood', bx, 0.42, bz, 1.8, 0.05, 0.3, angle)
    for (const u of [-0.7, 0.7]) {
      const [lx, lz] = at(u, v)
      p.obox('steel', lx, 0, lz, 0.06, 0.42, 0.25, angle)
    }
  }
}

/**
 * 屋根付きの機械置き場（OSM の 1.4m × 4.8m・高さ 3m の小屋）。facing は機械の前面の向き（+1 で +X）。
 * 洗濯機は乾燥機を上に重ねた白い箱、自販機は赤・青・白の箱に光る見本の窓
 */
function machineShed(p: Props, x0: number, z0: number, x1: number, z1: number, facing: 1 | -1, kind: 'laundry' | 'vending') {
  const back = facing > 0 ? x0 : x1
  const front = facing > 0 ? x1 : x0
  p.box('concrete', back - 0.08 * facing, 0, z0, back, 2.8, z1)
  p.box('concrete', x0, 0, z0, x1, 2.8, z0 + 0.1)
  p.box('concrete', x0, 0, z1 - 0.1, x1, 2.8, z1)
  // 屋根は前へ少し張り出す
  p.box('white', Math.min(back, front + 0.4 * facing), 2.8, z0 - 0.1, Math.max(back, front + 0.4 * facing), 2.95, z1 + 0.1)
  p.box('snow', Math.min(back, front + 0.4 * facing), 2.95, z0 - 0.05, Math.max(back, front + 0.4 * facing), 3.1, z1 + 0.05)
  const face = front - 0.1 * facing
  if (kind === 'laundry') {
    for (let z = z0 + 0.2; z + 0.7 <= z1 - 0.1; z += 0.74) {
      const zc = z + 0.35
      p.box('white', back + 0.1 * facing, 0, z, face, 1.9, z + 0.7)
      for (const y of [0.55, 1.45]) {
        p.add('dark', new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14).rotateZ(Math.PI / 2).translate(face + 0.02 * facing, y, zc))
      }
    }
  } else {
    const colors: (keyof Lists)[] = ['red', 'white', 'blue', 'red']
    colors.forEach((c, i) => {
      const z = z0 + 0.2 + i * 1.1
      if (z + 1.0 > z1 - 0.1) return
      p.box(c, back + 0.1 * facing, 0, z, face, 1.83, z + 1.0)
      p.box('lamp', face, 1.0, z + 0.1, face + 0.02 * facing, 1.65, z + 0.9)
    })
  }
}

/** BBQ 場：コンクリートの炉（上に黒い網）と、テーブル・ベンチ */
function bbq(p: Props, x: number, z: number) {
  for (const dx of [-4, 0, 4]) {
    const cx = x + dx
    p.box('concrete', cx - 0.9, 0, z - 0.45, cx + 0.9, 0.8, z + 0.45)
    p.box('dark', cx - 0.75, 0.8, z - 0.35, cx + 0.75, 0.84, z + 0.35)
  }
  for (const dx of [-2, 2]) picnicTable(p, x + dx, z - 2.6, 0)
}
