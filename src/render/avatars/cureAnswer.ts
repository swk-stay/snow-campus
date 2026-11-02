import * as THREE from 'three'

// キュアアンサー（「名探偵プリキュア！」、issue #105）をデフォルメしたモデル。
// 参考：https://www.toei-anim.co.jp/tv/precure/character/answer.php （前・横・後ろの立ち絵は docs/cure-answer/）
// 2 頭身にして、遠目でも分かる特徴だけを残す：薄紫の髪・頭の上の 2 つのお団子と羽の飾り・
// 毛先がピンクになってハート形に巻く長いツインテール・水色の瞳・紫の上着と水色のスカートに黄色のフリル・
// 背中の大きな黄色いリボン・胸のピンクのリボン・白いニーハイに紫のブーツ。
// 顔は +z を向く（PlayerView の向きに合わせる）。背中の雪玉（-z）とツインテールが重ならないよう、髪は横に広げて垂らす。

const C = {
  hair: 0xd9a2f0,
  hairTip: 0xf28fb8,
  skin: 0xffe2cf,
  coat: 0xb98ae6,
  skirt: 0xcfe0f4,
  frill: 0xf6e7a0,
  ribbon: 0xf2d35c,
  pink: 0xee5fa0,
  tie: 0xd25cc0,
  trim: 0x8fd8d8,
  gem: 0xd6248a,
  wing: 0xa9e4f2,
  gold: 0xe8c25a,
  veil: 0xf6e48a,
  white: 0xfbf8ff,
  boot: 0x9a63d6,
} as const

function mat(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  return m
}

/** 頭（肌の球、半径 0.3）の中心 */
const HEAD = new THREE.Vector3(0, 1.12, 0)
/** 頭を覆う髪の球（半径 0.32、横に 1.1 倍）の中心。前髪が上がっておでこが広いので、上と後ろへずらす */
const CAP_CENTER = new THREE.Vector3(0, 1.22, -0.09)

// 顔の絵を貼る範囲。頭の球の前面を、水平は正面から ±FACE_PHI、縦は天頂からの角度で FACE_THETA0..FACE_THETA1
const FACE_PHI = 0.9
const FACE_THETA0 = 1.0
const FACE_THETA1 = 2.2
// 絵は 1 ラジアン 256 単位の座標で描き、Canvas は FACE_SCALE 倍の解像度にする（近くで見ても線がにじまないように）
const FACE_UNIT = 256
const FACE_SCALE = 2

/**
 * 顔。Canvas に 2D で描いた眉・目・頬・鼻・口を、頭よりわずかに大きい球の前面に貼る。
 * デフォルメのイラスト（docs/cure-answer/img.png）に合わせて、線と塗りだけの単純な描き方にする。
 * 立ち絵に寄せて目を細かく描き込むと、2 頭身の体には生々しすぎて不気味に見えたため。
 */
function face(): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(FACE_PHI * 2 * FACE_UNIT * FACE_SCALE)
  canvas.height = Math.round((FACE_THETA1 - FACE_THETA0) * FACE_UNIT * FACE_SCALE)
  const ctx = canvas.getContext('2d')!
  ctx.scale(FACE_SCALE, FACE_SCALE)
  // 頭の球の上の点（中心からの横の角度 phi、天頂からの角度 theta）を Canvas の座標へ
  const px = (phi: number) => (phi + FACE_PHI) * FACE_UNIT
  const py = (theta: number) => (theta - FACE_THETA0) * FACE_UNIT
  const ellipse = (x: number, y: number, rx: number, ry: number, rot = 0) => {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  }
  const ink = '#4b2e2a' // 線と目の焦げ茶
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 頬：目の外寄りの下に、ピンクのぼかし
  for (const sx of [-1, 1]) {
    const x = px(sx * 0.62)
    const y = py(1.9)
    const blush = ctx.createRadialGradient(x, y, 0, x, y, 34)
    blush.addColorStop(0, 'rgba(250, 140, 160, 0.7)')
    blush.addColorStop(1, 'rgba(250, 140, 160, 0)')
    ctx.fillStyle = blush
    ellipse(x, y, 40, 26)
    ctx.fill()
  }

  // 眉：細い線のゆるい弧。目から離して高めに置き、目頭側を上げて目尻側へ下げる困り眉にする
  ctx.strokeStyle = ink
  ctx.lineWidth = 4
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(px(sx * 0.32), py(1.19))
    ctx.quadraticCurveTo(px(sx * 0.46), py(1.17), px(sx * 0.62), py(1.31))
    ctx.stroke()
  }

  // 目：焦げ茶で塗りつぶした縦長の楕円。左右はかなり離し、目尻の上にまつげを 1 本はねる
  for (const sx of [-1, 1]) {
    const x = px(sx * 0.5)
    const y = py(1.66)
    const rx = 30
    const ry = 50
    ctx.fillStyle = ink
    ellipse(x, y, rx, ry)
    ctx.fill()
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x + sx * rx * 0.6, y - ry * 0.8)
    ctx.quadraticCurveTo(x + sx * rx * 1.0, y - ry * 0.95, x + sx * rx * 1.25, y - ry * 1.15)
    ctx.stroke()
  }

  // 鼻：小さなピンクの点
  ctx.fillStyle = 'rgba(235, 150, 160, 0.9)'
  ellipse(px(0), py(1.82), 6, 5)
  ctx.fill()

  // 口：大きく開けて笑う。上の縁はゆるい曲線、下は丸く、焦げ茶の縁取りの中はピンクで下側（舌）が明るい
  const mx = px(0)
  const my = py(1.93)
  const mw = 64
  const mouth = () => {
    ctx.beginPath()
    ctx.moveTo(mx - mw, my)
    ctx.quadraticCurveTo(mx, my - 14, mx + mw, my)
    ctx.bezierCurveTo(mx + mw * 0.9, my + 80, mx - mw * 0.9, my + 80, mx - mw, my)
  }
  ctx.save()
  mouth()
  ctx.fillStyle = '#e46f7e'
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = '#f59aa6'
  ellipse(mx, my + 60, mw * 0.7, 24)
  ctx.fill()
  ctx.restore()
  mouth()
  ctx.strokeStyle = ink
  ctx.lineWidth = 5
  ctx.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  // SphereGeometry は phi が増えると -x から +z を回って +x へ進むので、正面（+z）は phi = π/2
  const geometry = new THREE.SphereGeometry(0.302, 24, 16, Math.PI / 2 - FACE_PHI, FACE_PHI * 2, FACE_THETA0, FACE_THETA1 - FACE_THETA0)
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
  m.position.copy(HEAD)
  return m
}

/**
 * 髪の束 1 本（points を通る管）。太さは r0 から r1 へ細くし、平たくして幅のある毛束にする。
 * flat：どの向きに平たくするか。'z' は前後（垂れる髪）、'head' は頭の中心から外向き（頭に沿う前髪）
 * 色は髪全体での位置 g0..g1（0 が根元、1 が毛先）で決め、途中から毛先のピンクへ変える（頂点カラー）
 */
function hairStrand(points: THREE.Vector3[], r0: number, r1: number, g0 = 0, g1 = 0, flat: 'z' | 'head' = 'z'): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points)
  const tubular = 56
  const radial = 10
  const geometry = new THREE.TubeGeometry(curve, tubular, 1, radial, false)
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const hair = new THREE.Color(C.hair)
  const tip = new THREE.Color(C.hairTip)
  const c = new THREE.Color()
  const center = new THREE.Vector3()
  const v = new THREE.Vector3()
  const axis = new THREE.Vector3(0, 0, 1)
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    curve.getPointAt(t, center)
    const r = r0 + (r1 - r0) * t
    c.lerpColors(hair, tip, THREE.MathUtils.smoothstep(g0 + (g1 - g0) * t, 0.48, 0.78))
    if (flat === 'head') axis.subVectors(center, HEAD).normalize()
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j
      // 半径 1 の管を縮め、axis の向きの厚みを半分にする
      v.fromBufferAttribute(pos, k).sub(center).multiplyScalar(r)
      v.addScaledVector(axis, -0.5 * v.dot(axis))
      v.add(center)
      pos.setXYZ(k, v.x, v.y, v.z)
      c.toArray(colors, k * 3)
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * ツインテール 1 本。お団子の後ろから外へ広がって垂れ、毛先は 2 つに分かれて外側と内側へ巻き上がり、
 * 逆さのハートの形になる（docs/cure-answer/back.png）。side は +1 が左（+x）
 */
function twinTail(side: 1 | -1): THREE.Group {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
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
  g.add(new THREE.Mesh(hairStrand(main, 0.17, 0.12, 0, 0.6), material))
  for (const points of [outer, inner]) g.add(new THREE.Mesh(hairStrand(points, 0.1, 0.03, 0.6, 1), material))
  return g
}

/**
 * ブローチ：金縁のピンクの宝石と、右上（side が -1 なら左上）の金の星。
 * お団子の飾りと、ネクタイの結び目に同じ形を使う。原点が宝石の中心で、+z を向く
 */
function brooch(gem: THREE.Material, gold: THREE.Material, side: number): THREE.Group {
  const b = new THREE.Group()
  b.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), gem))
  b.add(mesh(new THREE.TorusGeometry(0.033, 0.008, 6, 16), gold))
  b.add(mesh(new THREE.OctahedronGeometry(0.014), gold, side * 0.04, 0.03, 0))
  return b
}

/** ネクタイの形：上が細く、下へ広がって V 字にとがる。原点が上の真ん中で、-y へ垂れる */
function tieShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(-0.015, 0)
  shape.lineTo(0.015, 0)
  shape.lineTo(0.03, -0.075)
  shape.lineTo(0, -0.1)
  shape.lineTo(-0.03, -0.075)
  shape.closePath()
  return shape
}

/**
 * 天使の羽（片方）。根元が原点で +y へ伸び、+x 側に羽根の丸みが 3 つ並ぶ。薄く押し出し、
 * 根元の白から先の水色へ変える（頂点カラー）
 */
function wingShape(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(-0.03, 0.05, -0.035, 0.12, -0.01, 0.16)
  shape.quadraticCurveTo(0.03, 0.15, 0.035, 0.115)
  shape.quadraticCurveTo(0.065, 0.105, 0.06, 0.07)
  shape.quadraticCurveTo(0.08, 0.04, 0.05, 0.02)
  shape.quadraticCurveTo(0.03, 0, 0, 0)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false })
  geometry.translate(0, 0, -0.006)
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const base = new THREE.Color(C.white)
  const tip = new THREE.Color(C.wing)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    c.lerpColors(base, tip, THREE.MathUtils.smoothstep(pos.getY(i) + pos.getX(i) * 0.5, 0.02, 0.12)).toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

export function cureAnswerModel(): THREE.Group {
  const g = new THREE.Group()
  const hair = mat(C.hair)
  // 肌は陰で灰色にくすまないよう、少し自発光させる
  const skin = new THREE.MeshStandardMaterial({ color: C.skin, roughness: 0.9, emissive: 0x6e5040 })
  const white = mat(C.white)
  const pink = mat(C.pink)
  const gem = new THREE.MeshStandardMaterial({ color: C.gem, roughness: 0.25, metalness: 0.3 })
  const gold = new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.35, metalness: 0.6 })

  // 脚：白いニーハイと紫のブーツ（つま先を前に）
  for (const sx of [-0.09, 0.09]) {
    g.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 10), white, sx, 0.27, 0))
    const boot = mesh(new THREE.SphereGeometry(0.075, 12, 8), mat(C.boot), sx, 0.07, 0.025)
    boot.scale.set(1, 0.85, 1.35)
    g.add(boot)
  }

  // スカート：下から黄色のフリル、水色のスカート、紫の上着の裾（ペプラム）
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.1, 20), mat(C.frill), 0, 0.44, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.33, 0.2, 20), mat(C.skirt), 0, 0.53, 0))
  const coat = mat(C.coat)
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.29, 0.14, 8), coat, 0, 0.6, 0))
  // 裾の宝石
  g.add(mesh(new THREE.OctahedronGeometry(0.035), gem, 0, 0.6, 0.23))
  // 胴：白い前身ごろに、黄色いボタンを 2 列 × 2 段
  g.add(mesh(new THREE.CapsuleGeometry(0.15, 0.14, 4, 12), white, 0, 0.75, 0))
  const button = mat(C.ribbon)
  for (const bx of [-0.05, 0.05]) {
    for (const by of [0.7, 0.745]) {
      const z = Math.sqrt(0.15 * 0.15 - bx * bx)
      g.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), button, bx, by, z + 0.004))
    }
  }
  // ケープ：肩から胸の上までを覆う短い紫のケープ。前は開いてネクタイと前身ごろを見せ、
  // 裾は丸い波形（スカラップ）で、水色の縁取りを付ける
  const capeTop = 0.92
  const capeBottom = 0.78
  const capeR = 0.25
  const gap = 0.55 // 前の開き（正面から左右へのラジアン）
  const capeMat = new THREE.MeshStandardMaterial({ color: C.coat, roughness: 0.75, side: THREE.DoubleSide })
  // CylinderGeometry の theta は 0 が +z（正面）
  g.add(mesh(new THREE.CylinderGeometry(0.13, capeR, capeTop - capeBottom, 28, 1, true, gap, Math.PI * 2 - gap * 2), capeMat, 0, (capeTop + capeBottom) / 2, 0))
  const hem: THREE.Vector3[] = []
  const scallops = 9
  for (let i = 0; i <= scallops * 6; i++) {
    const t = i / (scallops * 6)
    const a = gap + t * (Math.PI * 2 - gap * 2)
    // 波の山ごとに少し下へふくらませる
    const dip = Math.abs(Math.sin(t * scallops * Math.PI)) * 0.025
    hem.push(new THREE.Vector3(Math.sin(a) * (capeR + 0.004), capeBottom - dip, Math.cos(a) * (capeR + 0.004)))
  }
  for (let i = 0; i < scallops; i++) {
    const a = gap + ((i + 0.5) / scallops) * (Math.PI * 2 - gap * 2)
    const lobe = mesh(new THREE.SphereGeometry(0.04, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), capeMat, Math.sin(a) * capeR, capeBottom, Math.cos(a) * capeR)
    lobe.rotation.y = a
    lobe.scale.set(1, 0.6, 0.3)
    g.add(lobe)
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hem), scallops * 12, 0.007, 6, false), mat(C.trim)))
  // ネクタイ：結び目から垂れるピンクがかった紫で、V 字にとがった先の縁は金。
  // 縁は同じ形の金の板を、ネクタイの後ろに少し下へずらして重ね、はみ出したところで見せる
  const tieGeometry = new THREE.ExtrudeGeometry(tieShape(), { depth: 0.008, bevelEnabled: false })
  g.add(mesh(tieGeometry, mat(C.tie), 0, 0.855, 0.154))
  g.add(mesh(tieGeometry, gold, 0, 0.843, 0.15))
  // 襟元のピンクのリボン：左右の輪と、結び目にお団子の飾りと同じブローチ
  for (const sx of [-1, 1]) {
    const loop = mesh(new THREE.SphereGeometry(0.04, 12, 8), pink, sx * 0.045, 0.865, 0.165)
    loop.scale.set(1.2, 0.75, 0.45)
    loop.rotation.z = -sx * 0.25
    g.add(loop)
  }
  const knot = brooch(gem, gold, 1)
  knot.position.set(0, 0.865, 0.18)
  knot.scale.setScalar(0.8)
  g.add(knot)

  // 腕と白い手袋（少し開いて下ろす）
  for (const sx of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.04, 0.16, 4, 8), skin, sx * 0.19, 0.74, 0)
    arm.rotation.z = sx * 0.45
    g.add(arm)
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), white, sx * 0.25, 0.63, 0))
  }

  // 背中の大きな黄色いリボン（左右の輪と、垂れる 2 本）
  const ribbon = mat(C.ribbon)
  for (const sx of [-1, 1]) {
    const loop = mesh(new THREE.SphereGeometry(0.1, 12, 8), ribbon, sx * 0.11, 0.7, -0.17)
    loop.scale.set(1.2, 0.7, 0.4)
    g.add(loop)
    const tail = mesh(new THREE.BoxGeometry(0.07, 0.24, 0.02), ribbon, sx * 0.07, 0.55, -0.24)
    tail.rotation.z = sx * 0.25
    g.add(tail)
  }

  // 頭：上と後ろにずらした髪の球で覆う。前髪が上がっていておでこが広いので、生え際は高め
  g.add(mesh(new THREE.SphereGeometry(0.3, 20, 16), skin, HEAD.x, HEAD.y, HEAD.z))
  const cap = mesh(new THREE.SphereGeometry(0.32, 24, 18), hair, CAP_CENTER.x, CAP_CENTER.y, CAP_CENTER.z)
  cap.scale.set(1.1, 1, 1)
  g.add(cap)
  // 後ろ髪：耳の後ろから襟足までを覆う（顔の前は出す）
  const back = mesh(new THREE.SphereGeometry(0.31, 20, 16), hair, 0, 1.1, -0.05)
  back.scale.set(1.05, 1, 1)
  g.add(back)
  g.add(face())
  const hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  // 頭の中心から、横の角度 phi（正面が 0、+ が左）・天頂からの角度 theta・距離 r の点
  const onHead = (phi: number, theta: number, r: number) =>
    new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)).multiplyScalar(r).add(HEAD)
  for (const s of [-1, 1]) {
    // 前髪（エアインテーク）：分け目から、おでこから浮いたアーチになって外へ曲がり、顔の横をあごまで垂れる
    const intake = [onHead(0.04 * s, 0.5, 0.33), onHead(0.2 * s, 0.6, 0.41), onHead(0.48 * s, 0.8, 0.42), onHead(0.74 * s, 1.12, 0.36), onHead(0.84 * s, 1.5, 0.33), onHead(0.78 * s, 1.85, 0.32), onHead(0.66 * s, 2.12, 0.3)]
    g.add(new THREE.Mesh(hairStrand(intake, 0.08, 0.02, 0, 0, 'head'), hairMat))
    // おでこにかかる細い毛：前髪のアーチの内側から外へ流れ、眉の上で止める
    const wisp = [onHead(0.3 * s, 0.86, 0.36), onHead(0.25 * s, 0.98, 0.318), onHead(0.3 * s, 1.05, 0.307), onHead(0.4 * s, 1.07, 0.305)]
    g.add(new THREE.Mesh(hairStrand(wisp, 0.016, 0.004, 0, 0, 'head'), hairMat))
    // 前髪の後ろで、顔のまわりを肩まで垂れる横髪
    const side = [onHead(0.95 * s, 0.9, 0.33), onHead(1.1 * s, 1.4, 0.35), onHead(1.05 * s, 1.9, 0.34), onHead(0.98 * s, 2.35, 0.31)]
    g.add(new THREE.Mesh(hairStrand(side, 0.09, 0.03, 0, 0, 'head'), hairMat))
  }
  // アホ毛：頭のてっぺんから立って、大きく 1 回巻く
  const ahoge = [[0, 1.5, 0.03], [0, 1.62, 0.04], [0.03, 1.72, 0.03], [0.1, 1.74, 0.01], [0.14, 1.67, 0], [0.1, 1.61, 0], [0.06, 1.64, 0.01]].map(([x, y, z]) => new THREE.Vector3(x, y, z))
  g.add(new THREE.Mesh(hairStrand(ahoge, 0.03, 0.012), hairMat))

  // お団子と飾り：金縁のピンクの宝石を真ん中に、上へ水色の羽・下へ白い羽。その下にピンクの花びらの飾りと黄色の透けたベール
  const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  const swirlMat = new THREE.MeshStandardMaterial({ color: C.white, roughness: 0.6 })
  const petal = new THREE.MeshStandardMaterial({ color: C.pink, roughness: 0.7, side: THREE.DoubleSide })
  const veil = new THREE.MeshStandardMaterial({ color: C.veil, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false })
  const wingGeometry = wingShape()
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

  g.add(twinTail(1), twinTail(-1))

  return g
}
