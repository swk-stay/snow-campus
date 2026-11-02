import * as THREE from 'three'
import { cureBody, gemMaterial, goldMaterial, hairCap, hairStrands, mat, mesh, onHead, WHITE, wingShape, type CureColors } from './cure'

// キュアミスティック（「名探偵プリキュア！」）をデフォルメしたモデル。顔と服は cure.ts の共通部分。
// 前・横・後ろの立ち絵は docs/cure-mistique/。
// ミスティックだけの特徴：ピンクの髪（ところどころ水色）・まっすぐそろった前髪と胸までの横髪・
// 頭の上のティアラ（赤いリボン・水色のハートの宝石・白い羽・真珠）・
// 丸くふくらんだ房が金の輪を通ってハート形の輪になり、赤いリボンで結ばれて長く垂れるツインテール。
// 服はキュアアンサーと同じ形で、ピンクと赤のケープ・ピンクのスカート、背中に水色のリボン。

const C = {
  hair: 0xf47fb4,
  hairTip: 0xd7a2f0,
  /** ハート形の輪の、淡いピンク */
  loop: 0xf9c8de,
  /** 髪のところどころの水色 */
  streak: 0xa8e2f0,
  red: 0xe0284a,
  gem: 0x5fd0d8,
} as const

const OUTFIT: CureColors = {
  coat: 0xf06a8e,
  skirt: 0xf9c4da,
  frill: 0xe8eefb,
  button: 0xe8507a,
  tie: 0xe8559c,
  collarBow: 0xea4f96,
  trim: 0xe8c25a,
  gem: C.gem,
  backBow: 0xbfeaf0,
  boot: 0xe0507e,
}

const strand = hairStrands(C.hair, C.hairTip)
const loopStrand = hairStrands(C.loop, C.streak)
const streakStrand = hairStrands(C.streak, C.streak)

/** ハートの板。原点が真ん中で、下の先が -y を向く。厚みは z に depth */
function heartGeometry(size: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -size)
  shape.bezierCurveTo(size * 1.2, -size * 0.3, size * 0.9, size * 0.8, 0, size * 0.35)
  shape.bezierCurveTo(-size * 0.9, size * 0.8, -size * 1.2, -size * 0.3, 0, -size)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

/** 金縁の水色のハートの宝石。+z を向く。ティアラと、襟元のリボンの結び目と、背中のリボンに使う */
function heartGem(size: number): THREE.Group {
  const g = new THREE.Group()
  g.add(mesh(heartGeometry(size, size * 0.5), gemMaterial(C.gem), 0, 0, size * 0.15))
  g.add(mesh(heartGeometry(size * 1.3, size * 0.4), goldMaterial(), 0, -size * 0.05, 0))
  return g
}

/**
 * 丸くふくらんだ房（球）。外側の上の縁だけを水色にする（頂点カラー）。side は +1 が左（+x）
 */
function puffGeometry(r: number, side: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(r, 20, 16)
  const normal = geometry.attributes.normal
  const colors = new Float32Array(normal.count * 3)
  const hair = new THREE.Color(C.hair)
  const streak = new THREE.Color(C.streak)
  const toward = new THREE.Vector3(side * 0.55, 0.8, -0.25).normalize()
  const n = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < normal.count; i++) {
    n.fromBufferAttribute(normal, i)
    c.lerpColors(hair, streak, THREE.MathUtils.smoothstep(n.dot(toward), 0.6, 0.8)).toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** 赤いリボン：左右の輪と結び目。+z を向く */
function redBow(size: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const loop = mesh(new THREE.SphereGeometry(size, 12, 8), material, sx * size * 1.05, 0, 0)
    loop.scale.set(1.15, 0.7, 0.45)
    loop.rotation.z = -sx * 0.25
    g.add(loop)
  }
  g.add(mesh(new THREE.SphereGeometry(size * 0.4, 10, 8), material, 0, 0, size * 0.15))
  return g
}

/**
 * ツインテール 1 本（docs/cure-mistique/back.png）。side は +1 が左（+x）。
 * 頭の後ろの横から、丸くふくらんだ房が 2 つ外へ下がって金の輪を通る。輪の下で髪が左右に分かれ、
 * 上へふくらんで回り込むハート形の輪になり、ハートの下の先を赤いリボンで結んで、まっすぐ長く垂れる。
 * ハートは真後ろより少し外を向けて、横からも見えるようにする
 */
function twinTail(side: 1 | -1, hairMat: THREE.Material, red: THREE.Material, gold: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  // 丸くふくらんだ房（外側の上の縁が水色）
  for (const [x, y, z, r] of [[0.31, 1.34, -0.18, 0.13], [0.42, 1.17, -0.2, 0.11]]) {
    const puff = mesh(puffGeometry(r, side), hairMat, x * side, y, z)
    puff.scale.set(1, 0.85, 0.95)
    g.add(puff)
  }
  // 金の輪
  const ringY = 1.05
  const cx = 0.47
  const ring = mesh(new THREE.TorusGeometry(0.035, 0.014, 8, 18), gold, cx * side, ringY, -0.2)
  ring.rotation.x = Math.PI / 2
  g.add(ring)

  // ハート形の輪：輪の下から左右に分かれ、上へふくらんで外を回り、下の先で合わさる
  const facing = 0.5 // 真後ろから外へ向ける角度
  const u = new THREE.Vector3(Math.cos(facing), 0, Math.sin(facing) * side)
  const origin = new THREE.Vector3(cx * side, ringY - 0.02, -0.21)
  const at = (du: number, dv: number) => origin.clone().addScaledVector(u, du * side).add(new THREE.Vector3(0, dv, 0))
  const lobe: [number, number][] = [[0, 0], [0.05, 0.04], [0.11, 0.03], [0.14, -0.03], [0.12, -0.11], [0.06, -0.18], [0, -0.22]]
  for (const sx of [-1, 1]) g.add(new THREE.Mesh(loopStrand(lobe.map(([du, dv]) => at(du * sx, dv)), 0.03, 0.025, 0, 0.6), hairMat))

  // 下の先の赤いリボンと、垂れる 2 本の赤いリボン
  const tip = at(0, -0.22)
  const bow = redBow(0.048, red)
  bow.position.copy(tip)
  bow.position.z -= 0.03
  bow.rotation.y = side > 0 ? Math.PI - facing : Math.PI + facing
  g.add(bow)
  // 垂れるリボンは髪の外側（外と後ろ）に出す
  for (const [dx, len] of [[0.075, 0.34], [-0.06, 0.28]]) {
    const tail = mesh(new THREE.BoxGeometry(0.032, len, 0.008), red, tip.x + dx * side, tip.y - len / 2 - 0.02, tip.z - 0.07)
    tail.rotation.z = dx * side * 0.8
    g.add(tail)
  }

  // まっすぐ長く垂れる髪：少し外へ広がり、毛先は薄紫
  for (const [dx, dz, r] of [[0, 0, 0.06], [0.05, 0.03, 0.045], [-0.04, -0.02, 0.045]]) {
    const points = [tip.clone(), new THREE.Vector3((tip.x + dx * side) * 1.04, 0.6, tip.z + dz), new THREE.Vector3((tip.x + dx * side) * 1.1, 0.25, tip.z + dz)]
    g.add(new THREE.Mesh(strand(points, r, r * 0.7, 0.3, 1), hairMat))
  }
  // 水色の毛を 1 本混ぜる
  const streak = [tip.clone(), new THREE.Vector3((tip.x + 0.02 * side) * 1.06, 0.55, tip.z + 0.035), new THREE.Vector3((tip.x + 0.02 * side) * 1.1, 0.3, tip.z + 0.035)]
  g.add(new THREE.Mesh(streakStrand(streak, 0.02, 0.012), hairMat))
  return g
}

export function cureMistiqueModel(): THREE.Group {
  // 襟元のリボンの結び目は、水色のハートの宝石
  const knot = heartGem(0.026)
  const g = cureBody(OUTFIT, knot)
  const gold = goldMaterial()
  const red = mat(C.red)

  // 背中のリボンの真ん中にも、水色のハートの宝石
  const backGem = heartGem(0.035)
  backGem.position.set(0, 0.7, -0.22)
  backGem.rotation.y = Math.PI
  g.add(backGem)

  const hair = mat(C.hair)
  g.add(hairCap(hair))
  const hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })

  // 前髪：まっすぐそろえて眉の上で切り、真ん中で軽く分ける
  for (const phi of [-0.62, -0.44, -0.26, -0.09, 0.09, 0.26, 0.44, 0.62]) {
    const end = 1.12 + Math.abs(phi) * 0.06
    const points = [onHead(phi * 0.6, 0.35, 0.325), onHead(phi * 0.9, 0.75, 0.325), onHead(phi, end, 0.31)]
    g.add(new THREE.Mesh(strand(points, 0.065, 0.05, 0, 0, 'head'), hairMat))
  }
  for (const s of [-1, 1]) {
    // 胸まで垂れる横髪と、その前に混ざる水色の毛
    const side = [onHead(0.8 * s, 0.85, 0.33), onHead(0.92 * s, 1.4, 0.34), onHead(0.88 * s, 1.9, 0.34), new THREE.Vector3(0.24 * s, 0.86, 0.12)]
    g.add(new THREE.Mesh(strand(side, 0.075, 0.035, 0, 0, 'head'), hairMat))
    const streak = [onHead(0.74 * s, 0.95, 0.345), onHead(0.84 * s, 1.45, 0.355), onHead(0.8 * s, 1.85, 0.35)]
    g.add(new THREE.Mesh(streakStrand(streak, 0.02, 0.012, 0, 0, 'head'), hairMat))
  }

  // ティアラ：頭の上の前寄りに、髪の表面から少し浮かせて頭に沿わせる。
  // 後ろに赤いリボン、左右に白い羽、真ん中に水色のハートの宝石、下に真珠の列
  const tiara = new THREE.Group()
  const normal = onHead(0, 0.4, 1).sub(onHead(0, 0, 0)).normalize()
  tiara.position.copy(onHead(0, 0.4, 0.37))
  tiara.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  g.add(tiara)
  const bow = redBow(0.07, red)
  bow.position.set(0, 0.05, -0.01)
  tiara.add(bow)
  const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  const wingGeometry = wingShape(WHITE, C.streak)
  for (const s of [-1, 1]) {
    // 羽は横へ寝かせて外へ張り出す（羽根の丸みは下側）
    const wing = new THREE.Mesh(wingGeometry, wingMat)
    wing.position.set(s * 0.035, 0, 0.01)
    wing.rotation.z = -s * (Math.PI / 2 - 0.35)
    wing.scale.set(s * 1.1, 1.1, 1)
    tiara.add(wing)
  }
  const tiaraGem = heartGem(0.042)
  tiaraGem.position.set(0, 0, 0.025)
  tiara.add(tiaraGem)
  const pearl = mat(WHITE)
  for (let i = -3; i <= 3; i++) tiara.add(mesh(new THREE.SphereGeometry(0.013, 8, 6), pearl, i * 0.026, -0.05 + Math.abs(i) * 0.008, 0.012))

  g.add(twinTail(1, hairMat, red, gold), twinTail(-1, hairMat, red, gold))

  return g
}
