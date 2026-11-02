import * as THREE from 'three'
import { brooch, cureBody, gemMaterial, goldMaterial, hairCap, hairStrands, mat, mesh, onHead, WHITE, wingShape, type CureColors } from './cure'

// キュアアンサー（「名探偵プリキュア！」、issue #105）をデフォルメしたモデル。顔と服は cure.ts の共通部分。
// 参考：https://www.toei-anim.co.jp/tv/precure/character/answer.php （前・横・後ろの立ち絵は docs/cure-answer/）
// アンサーだけの特徴：薄紫の髪・エアインテークの前髪とアホ毛・頭の上の 2 つのお団子と羽の飾り・
// 毛先がピンクになってハート形に巻く長いツインテール。服は紫のケープと水色のスカート、背中に黄色いリボン。

const C = {
  hair: 0xd9a2f0,
  hairTip: 0xf28fb8,
  pink: 0xee5fa0,
  gem: 0xd6248a,
  wing: 0xa9e4f2,
  veil: 0xf6e48a,
} as const

const OUTFIT: CureColors = {
  coat: 0xb98ae6,
  skirt: 0xcfe0f4,
  frill: 0xf6e7a0,
  button: 0xf2d35c,
  tie: 0xd25cc0,
  collarBow: C.pink,
  trim: 0x8fd8d8,
  gem: C.gem,
  backBow: 0xf2d35c,
  boot: 0x9a63d6,
}

const strand = hairStrands(C.hair, C.hairTip)

/**
 * ツインテール 1 本。お団子の後ろから外へ広がって垂れ、毛先は 2 つに分かれて外側と内側へ巻き上がり、
 * 逆さのハートの形になる（docs/cure-answer/back.png）。side は +1 が左（+x）
 */
function twinTail(side: 1 | -1, material: THREE.Material): THREE.Group {
  const z = -0.19
  // ハートの真ん中の x。分かれ目から外側の山を描き、内側の山はこの x で折り返して作る
  const cx = 0.5
  const p = (x: number, y: number, zz = z) => new THREE.Vector3(x * side, y, zz)
  const main = [p(0.2, 1.36, -0.1), p(0.36, 1.12, -0.2), p(0.46, 0.8, -0.23), p(cx, 0.5, -0.21)]
  // 外側の山：下へふくらんで底を回り、ハートのくぼみへ巻き上がって、毛先を小さく丸める
  const lobe: [number, number][] = [[cx, 0.5], [cx + 0.12, 0.36], [cx + 0.2, 0.2], [cx + 0.16, 0.07], [cx + 0.06, 0.05], [cx + 0.01, 0.12], [cx + 0.02, 0.2], [cx + 0.07, 0.23], [cx + 0.11, 0.19], [cx + 0.09, 0.15]]
  const outer = lobe.map(([x, y]) => p(x, y))
  const inner = lobe.map(([x, y]) => p(2 * cx - x, y))
  const g = new THREE.Group()
  g.add(new THREE.Mesh(strand(main, 0.17, 0.12, 0, 0.6), material))
  for (const points of [outer, inner]) g.add(new THREE.Mesh(strand(points, 0.1, 0.03, 0.6, 1), material))
  return g
}

export function cureAnswerModel(): THREE.Group {
  const gem = gemMaterial(C.gem)
  const gold = goldMaterial()
  // 襟元のリボンの結び目は、お団子の飾りと同じブローチ
  const knot = brooch(gem, gold, 1)
  knot.scale.setScalar(0.8)
  const g = cureBody(OUTFIT, knot)

  const hair = mat(C.hair)
  g.add(hairCap(hair))
  const hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  for (const s of [-1, 1]) {
    // 前髪（エアインテーク）：分け目から、おでこから浮いたアーチになって外へ曲がり、顔の横をあごまで垂れる
    const intake = [onHead(0.04 * s, 0.5, 0.33), onHead(0.2 * s, 0.6, 0.41), onHead(0.48 * s, 0.8, 0.42), onHead(0.74 * s, 1.12, 0.36), onHead(0.84 * s, 1.5, 0.33), onHead(0.78 * s, 1.85, 0.32), onHead(0.66 * s, 2.12, 0.3)]
    g.add(new THREE.Mesh(strand(intake, 0.08, 0.02, 0, 0, 'head'), hairMat))
    // おでこにかかる細い毛：前髪のアーチの内側から外へ流れ、眉の上で止める
    const wisp = [onHead(0.3 * s, 0.86, 0.36), onHead(0.25 * s, 0.98, 0.318), onHead(0.3 * s, 1.05, 0.307), onHead(0.4 * s, 1.07, 0.305)]
    g.add(new THREE.Mesh(strand(wisp, 0.016, 0.004, 0, 0, 'head'), hairMat))
    // 前髪の後ろで、顔のまわりを肩まで垂れる横髪
    const side = [onHead(0.95 * s, 0.9, 0.33), onHead(1.1 * s, 1.4, 0.35), onHead(1.05 * s, 1.9, 0.34), onHead(0.98 * s, 2.35, 0.31)]
    g.add(new THREE.Mesh(strand(side, 0.09, 0.03, 0, 0, 'head'), hairMat))
  }
  // アホ毛：頭のてっぺんから立って、大きく 1 回巻く
  const ahoge = [[0, 1.5, 0.03], [0, 1.62, 0.04], [0.03, 1.72, 0.03], [0.1, 1.74, 0.01], [0.14, 1.67, 0], [0.1, 1.61, 0], [0.06, 1.64, 0.01]].map(([x, y, z]) => new THREE.Vector3(x, y, z))
  g.add(new THREE.Mesh(strand(ahoge, 0.03, 0.012), hairMat))

  // お団子と飾り：金縁のピンクの宝石を真ん中に、上へ水色の羽・下へ白い羽。その下にピンクの花びらの飾りと黄色の透けたベール
  const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  const swirlMat = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.6 })
  const petal = new THREE.MeshStandardMaterial({ color: C.pink, roughness: 0.7, side: THREE.DoubleSide })
  const veil = new THREE.MeshStandardMaterial({ color: C.veil, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false })
  const wingGeometry = wingShape(WHITE, C.wing)
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.09, 14, 10), hair, s * 0.2, 1.42, -0.04))
    // 飾りはお団子の外側の前に付け、斜め前を向ける
    const badge = new THREE.Group()
    badge.position.set(s * 0.27, 1.41, 0.03)
    badge.rotation.y = s * 0.65
    g.add(badge)
    const gemBadge = brooch(gem, gold, s)
    gemBadge.position.z = 0.01
    badge.add(gemBadge)
    // 上の羽はお団子の上へまっすぐ立て、下の羽は横へ張り出す（羽根の丸みはどちらも外側・下側）
    const up = new THREE.Mesh(wingGeometry, wingMat)
    up.position.set(-s * 0.01, 0.03, -0.012)
    up.rotation.z = -s * 0.12
    up.scale.set(s * 1.15, 1.15, 1)
    badge.add(up)
    const down = new THREE.Mesh(wingGeometry, wingMat)
    down.position.set(s * 0.025, -0.012, -0.008)
    down.rotation.z = -s * (Math.PI / 2 + 0.3)
    down.scale.set(s * 0.9, 0.9, 1)
    badge.add(down)
    // 宝石の下の白い渦巻き
    const swirl = mesh(new THREE.TorusGeometry(0.016, 0.005, 6, 16, Math.PI * 1.5), swirlMat, -s * 0.012, -0.04, 0.006)
    swirl.rotation.z = s > 0 ? Math.PI : 0
    badge.add(swirl)
    // 花びらの飾りとベール：お団子の外側の下に、外へ少し傾けて垂らす
    const skirt = new THREE.Group()
    skirt.position.set(s * 0.33, 1.28, -0.1)
    skirt.rotation.z = s * 0.5
    g.add(skirt)
    skirt.add(mesh(new THREE.ConeGeometry(0.1, 0.16, 8, 1, true), petal))
    const rim = mesh(new THREE.TorusGeometry(0.1, 0.009, 6, 16), gold, 0, -0.08, 0)
    rim.rotation.x = Math.PI / 2
    skirt.add(rim)
    skirt.add(mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.12, 12, 1, true), veil, 0, -0.14, 0))
  }

  g.add(twinTail(1, hairMat), twinTail(-1, hairMat))

  return g
}
