import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { OBSTACLES, WORLD } from '../config'
import type { Building } from '../sim/game'

// タイムアタックで入れない場所の目印（issue #65）。清掃中の看板のような、黄色い A 型の立て看板を置く。
// - コースの縁（雪原の端）：外にも並木や地面が続いているので、押し戻される理由が見えない
// - まだ建て始めていない建物の敷地：低い土の台があるだけで、入れるように見える

/** コースの縁に置く間隔 (m) */
const EDGE_STEP = 12
/** 敷地の 1 辺に置く間隔の目安 (m)。短い辺でも真ん中に 1 つは置く */
const LOT_STEP = 18
/** 看板の板の幅・高さ (m)。雪（最大 0.6m）に埋もれても上半分が見える高さ */
const BOARD_W = 0.7
const BOARD_H = 1.3
/** 板の傾き（A 型の開き具合） */
const LEAN = THREE.MathUtils.degToRad(13)

type Spot = { x: number; z: number; angle: number }

export class KeepOutSigns {
  readonly group = new THREE.Group()
  private readonly lots = new Map<string, THREE.InstancedMesh>()

  constructor(buildings: readonly Building[]) {
    const geometry = signGeometry()
    const material = new THREE.MeshLambertMaterial({ map: signTexture(), side: THREE.DoubleSide })
    const occupied = (x: number, z: number, self?: Building) =>
      buildings.some((b) => b !== self && Math.abs(x - b.x) < b.width / 2 + 1 && Math.abs(z - b.z) < b.depth / 2 + 1) ||
      OBSTACLES.some((o) => x > o.x0 - 1 && x < o.x1 + 1 && z > o.z0 - 1 && z < o.z1 + 1)

    // 押し戻される線（雪原の端から 1m 内側）のすぐ外
    const half = WORLD.size / 2 - 0.4
    const edge: Spot[] = []
    for (let t = -half + EDGE_STEP / 2; t < half; t += EDGE_STEP) {
      edge.push(
        { x: WORLD.centerX + t, z: WORLD.centerZ - half, angle: 0 },
        { x: WORLD.centerX + t, z: WORLD.centerZ + half, angle: 0 },
        { x: WORLD.centerX - half, z: WORLD.centerZ + t, angle: Math.PI / 2 },
        { x: WORLD.centerX + half, z: WORLD.centerZ + t, angle: Math.PI / 2 },
      )
    }
    this.group.add(instances(geometry, material, edge.filter((s) => !occupied(s.x, s.z))))

    for (const b of buildings) {
      // 敷地の縁のすぐ外に、辺ごとに並べる
      const hw = b.width / 2 + 0.3
      const hd = b.depth / 2 + 0.3
      const spots: Spot[] = []
      const along = (length: number, at: (u: number) => Spot) => {
        const n = Math.max(1, Math.round(length / LOT_STEP))
        for (let i = 0; i < n; i++) spots.push(at(((i + 0.5) / n - 0.5) * length))
      }
      along(b.width, (u) => ({ x: b.x + u, z: b.z - hd, angle: 0 }))
      along(b.width, (u) => ({ x: b.x + u, z: b.z + hd, angle: 0 }))
      along(b.depth, (u) => ({ x: b.x - hw, z: b.z + u, angle: Math.PI / 2 }))
      along(b.depth, (u) => ({ x: b.x + hw, z: b.z + u, angle: Math.PI / 2 }))
      const mesh = instances(geometry, material, spots.filter((s) => !occupied(s.x, s.z, b)))
      this.lots.set(b.id, mesh)
      this.group.add(mesh)
    }
  }

  /** 敷地の看板を出すか。建て始めた（光の柱が立った）建物は、ゴーストの枠が敷地を示すので片付ける */
  setLot(id: string, visible: boolean) {
    const mesh = this.lots.get(id)
    if (mesh) mesh.visible = visible
  }
}

function instances(geometry: THREE.BufferGeometry, material: THREE.Material, spots: Spot[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length)
  const m = new THREE.Matrix4()
  spots.forEach((s, i) => mesh.setMatrixAt(i, m.makeRotationY(s.angle).setPosition(s.x, 0, s.z)))
  mesh.computeBoundingSphere()
  return mesh
}

/** A 型の立て看板：上端でつながった 2 枚の板。どちらの面にも絵が外向きに貼られる */
function signGeometry(): THREE.BufferGeometry {
  const top = BOARD_H * Math.cos(LEAN)
  const front = new THREE.PlaneGeometry(BOARD_W, BOARD_H).translate(0, -BOARD_H / 2, 0).rotateX(-LEAN).translate(0, top, 0)
  const back = front.clone().rotateY(Math.PI)
  return mergeGeometries([front, back])
}

function signTexture(): THREE.Texture {
  const w = 256
  const h = Math.round((w * BOARD_H) / BOARD_W)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  const font = (size: number) => `bold ${size}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`
  g.fillStyle = '#f5c400'
  g.fillRect(0, 0, w, h)
  // 上の黒帯に「注意」、下に黄と黒の縞
  g.fillStyle = '#1a1a1a'
  g.fillRect(0, 0, w, h * 0.17)
  const stripe = h * 0.8
  g.save()
  g.beginPath()
  g.rect(0, stripe, w, h - stripe)
  g.clip()
  for (let x = -h; x < w + h; x += 48) {
    g.beginPath()
    g.moveTo(x, h)
    g.lineTo(x + 24, h)
    g.lineTo(x + 24 + (h - stripe), stripe)
    g.lineTo(x + (h - stripe), stripe)
    g.fill()
  }
  g.restore()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#f5c400'
  g.font = font(h * 0.11)
  g.fillText('注意', w / 2, h * 0.09)
  g.fillStyle = '#1a1a1a'
  g.font = font(h * 0.2)
  g.fillText('立入', w / 2, h * 0.36)
  g.fillText('禁止', w / 2, h * 0.6)
  // 縁取り
  g.lineWidth = 10
  g.strokeRect(5, 5, w - 10, h - 10)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
