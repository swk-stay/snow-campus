import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { treeSpots, type TreeSpot } from './campusGround'

// 建て直しの対象ではない景色：雪をかぶった並木、構内バス停と神奈中バス、正門の守衛所。
// 雪原の上に置くだけで、当たり判定や雪には関わらない。

const snowMat = new THREE.MeshStandardMaterial({ color: 0xf6f9ff, roughness: 0.9 })

export function createScenery(): THREE.Group {
  const group = new THREE.Group()
  group.add(trees(treeSpots()))
  group.add(bus(85, 69.5, 0))
  group.add(busStopSign(94.5, 72.4))
  group.add(guardHouse(43, 65.6))
  return group
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

/** 正門の守衛所：グレーの小屋に、緑のかまぼこ屋根の庇 */
function guardHouse(x: number, z: number): THREE.Group {
  const g = new THREE.Group()
  const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4.5), new THREE.MeshStandardMaterial({ color: 0x6c6f73, roughness: 0.8 }))
  hut.position.y = 1.5
  const win = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 4.55), new THREE.MeshStandardMaterial({ color: 0x3a4a56, roughness: 0.2 }))
  win.position.y = 1.9
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 8, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.55, 1),
    new THREE.MeshStandardMaterial({ color: 0x3e9e93, roughness: 0.5, side: THREE.DoubleSide }),
  )
  roof.position.set(0, 3.1, 0)
  const snow = new THREE.Mesh(
    new THREE.CylinderGeometry(2.62, 2.62, 7.8, 20, 1, false, Math.PI / 6, (Math.PI * 2) / 3).rotateZ(Math.PI / 2).scale(1, 0.56, 1),
    snowMat,
  )
  snow.position.set(0, 3.12, 0)
  g.add(hut, win, roof, snow)
  g.position.set(x, 0, z)
  return g
}
