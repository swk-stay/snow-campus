import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

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
  gem: 0xd6248a,
  wing: 0xa9e4f2,
  gold: 0xe8c25a,
  veil: 0xf6e48a,
  shine: 0xf7f0a6,
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
const FACE_PHI = 0.75
const FACE_THETA0 = 1.0
const FACE_THETA1 = 2.2
// 絵は 1 ラジアン 256 単位の座標で描き、Canvas は FACE_SCALE 倍の解像度にする（近くで見ても線がにじまないように）
const FACE_UNIT = 256
const FACE_SCALE = 2

/**
 * 顔。Canvas に 2D で描いた眉・目・頬・口を、頭よりわずかに大きい球の前面に貼る。
 * 立ち絵（docs/cure-answer/front.png）に寄せて、目は横に広く、太い上まつげが目尻で跳ね、
 * 瞳は上が濃い青緑で下が明るい水色、中にピンクのハートのハイライトが入る。口は大きく開けて笑う。
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
  const heart = (x: number, y: number, size: number) => {
    ctx.beginPath()
    ctx.moveTo(x, y + size * 0.9)
    ctx.bezierCurveTo(x - size * 1.3, y, x - size * 0.7, y - size, x, y - size * 0.35)
    ctx.bezierCurveTo(x + size * 0.7, y - size, x + size * 1.3, y, x, y + size * 0.9)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 根元が太く先が細い線（まつげ）
  const lash = (x0: number, y0: number, x1: number, y1: number, width: number) => {
    const nx = -(y1 - y0)
    const ny = x1 - x0
    const len = Math.hypot(nx, ny) || 1
    const ox = (nx / len) * width * 0.5
    const oy = (ny / len) * width * 0.5
    ctx.beginPath()
    ctx.moveTo(x0 + ox, y0 + oy)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x0 - ox, y0 - oy)
    ctx.fill()
  }

  // 頬：ふんわりした赤みと、白い光の点・斜めの短い線
  for (const sx of [-1, 1]) {
    const x = px(sx * 0.5)
    const y = py(1.92)
    const blush = ctx.createRadialGradient(x, y, 0, x, y, 40)
    blush.addColorStop(0, 'rgba(255, 125, 155, 0.6)')
    blush.addColorStop(1, 'rgba(255, 125, 155, 0)')
    ctx.fillStyle = blush
    ellipse(x, y, 44, 26)
    ctx.fill()
    ctx.strokeStyle = 'rgba(232, 96, 126, 0.6)'
    ctx.lineWidth = 2
    for (const dx of [-10, 0, 10]) {
      ctx.beginPath()
      ctx.moveTo(x + dx + 3, y - 5)
      ctx.lineTo(x + dx - 3, y + 5)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ellipse(x + sx * 16, y - 10, 4, 4)
    ctx.fill()
  }

  // 眉：薄紫の太めの帯を濃い紫で縁取る。目から離して高めに置き、目頭側を高く太くして、目尻側へ下がりながら細くなる困り眉（docs/cure-answer/face_04.png）
  ctx.fillStyle = '#c497de'
  ctx.strokeStyle = '#6e4189'
  ctx.lineWidth = 2.5
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(px(sx * 0.16), py(1.1))
    ctx.quadraticCurveTo(px(sx * 0.36), py(1.13), px(sx * 0.58), py(1.28))
    ctx.quadraticCurveTo(px(sx * 0.37), py(1.19), px(sx * 0.17), py(1.165))
    // 目頭側の端は丸める
    ctx.quadraticCurveTo(px(sx * 0.13), py(1.13), px(sx * 0.16), py(1.1))
    ctx.fill()
    ctx.stroke()
  }

  // 目：上が丸く下が平らなアーチ形（docs/cure-answer/face_03.png・face_04.png）。
  // 上は太いまつげの塊のアーチ、目頭側は輪郭線のないまっすぐな辺、下は瞳を平らに切る短い下まぶたの線だけで、上下はつながらない。
  // sx は +1 が Canvas の右（キャラクターの左目）で、目尻は sx の向き
  for (const sx of [-1, 1]) {
    const x = px(sx * 0.38)
    const y = py(1.69)
    const w = 54
    const h = 62
    // 角：目頭の上・目頭の下・目尻の下・目尻の上
    const it = { x: x - sx * w * 0.95, y: y - h * 0.2 }
    const ib = { x: x - sx * w * 0.8, y: y + h * 0.8 }
    const ob = { x: x + sx * w * 0.8, y: y + h * 0.8 }
    const ot = { x: x + sx * w, y: y - h * 0.15 }
    // 上のアーチ（目頭の上から目尻の上への 3 次ベジェ）
    const c1 = { x: x - sx * w * 0.9, y: y - h * 1.22 }
    const c2 = { x: x + sx * w * 0.85, y: y - h * 1.28 }
    const arch = (t: number) => {
      const u = 1 - t
      const a = u * u * u
      const b = 3 * u * u * t
      const c = 3 * u * t * t
      const d = t * t * t
      return { x: a * it.x + b * c1.x + c * c2.x + d * ot.x, y: a * it.y + b * c1.y + c * c2.y + d * ot.y }
    }
    // アーチの t の位置から外（上）へ len 伸ばした点
    const outward = (t: number, len: number) => {
      const p0 = arch(t)
      const p1 = arch(Math.min(1, t + 0.01))
      const p2 = arch(Math.max(0, t - 0.01))
      let nx = p1.y - p2.y
      let ny = -(p1.x - p2.x)
      if (ny > 0) {
        nx = -nx
        ny = -ny
      }
      const n = Math.hypot(nx, ny) || 1
      return { x: p0.x + (nx / n) * len, y: p0.y + (ny / n) * len }
    }
    const eyeShape = () => {
      ctx.beginPath()
      ctx.moveTo(ib.x, ib.y)
      ctx.lineTo(it.x, it.y)
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, ot.x, ot.y)
      ctx.quadraticCurveTo(x + sx * w * 1.02, y + h * 0.5, ob.x, ob.y)
      ctx.quadraticCurveTo(x, y + h * 0.76, ib.x, ib.y)
    }

    // 白目と瞳（目の形で切り抜く）
    ctx.save()
    eyeShape()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.clip()
    // 白目の上側の青みがかった影
    const sclera = ctx.createLinearGradient(0, y - h, 0, y + h * 0.2)
    sclera.addColorStop(0, 'rgba(120, 140, 190, 0.55)')
    sclera.addColorStop(1, 'rgba(120, 140, 190, 0)')
    ctx.fillStyle = sclera
    ctx.fillRect(x - w * 1.1, y - h * 1.3, w * 2.2, h * 1.5)
    // 瞳：縦長の楕円。上はまぶたに隠れ、下は下まぶたの線で平らに切れる。目頭側に寄せて、白目は目尻側に見せる
    const ix = x - sx * w * 0.12
    const iy = y + h * 0.08
    const iris = ctx.createLinearGradient(0, iy - h * 0.9, 0, iy + h * 0.8)
    iris.addColorStop(0, '#174f66')
    iris.addColorStop(0.4, '#3a9fb2')
    iris.addColorStop(0.75, '#78d3cf')
    iris.addColorStop(1, '#c4f2e6')
    ctx.fillStyle = iris
    ellipse(ix, iy, w * 0.64, h * 0.98)
    ctx.fill()
    ctx.strokeStyle = 'rgba(20, 70, 90, 0.8)'
    ctx.lineWidth = 3.5
    ctx.stroke()
    // 目尻側にほんのりピンク
    const tint = ctx.createRadialGradient(ix + sx * w * 0.4, iy, 0, ix + sx * w * 0.4, iy, w * 0.4)
    tint.addColorStop(0, 'rgba(255, 150, 190, 0.5)')
    tint.addColorStop(1, 'rgba(255, 150, 190, 0)')
    ctx.fillStyle = tint
    ellipse(ix, iy, w * 0.64, h * 0.98)
    ctx.fill()
    // 瞳孔（縦長）
    ctx.fillStyle = '#123f50'
    ellipse(ix - sx * 2, iy + h * 0.1, w * 0.19, h * 0.26)
    ctx.fill()
    // 下の淡い黄色の照り返し
    ctx.fillStyle = 'rgba(250, 245, 170, 0.8)'
    ellipse(ix - sx * w * 0.05, iy + h * 0.62, w * 0.18, h * 0.1)
    ctx.fill()
    // ハイライト：上にまぶたへかかる白い大きな光、小さな光、目尻側にピンクのハート
    ctx.fillStyle = '#ffffff'
    ellipse(ix + sx * w * 0.05, iy - h * 0.5, w * 0.4, h * 0.2, sx * 0.1)
    ctx.fill()
    ellipse(ix - sx * w * 0.3, iy + h * 0.3, 4, 6, -sx * 0.4)
    ctx.fill()
    ctx.fillStyle = '#ff7fb4'
    heart(ix + sx * w * 0.36, iy + h * 0.3, 8)
    ctx.fill()
    ctx.restore()

    // 上まぶた：焦げ茶の太いアーチ。目尻側は太くして、外側の縁を少し下まで回り込ませる
    ctx.strokeStyle = '#4a2630'
    ctx.fillStyle = '#4a2630'
    ctx.lineWidth = 12
    ctx.beginPath()
    ctx.moveTo(it.x, it.y)
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, ot.x, ot.y)
    ctx.stroke()
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(ot.x, ot.y)
    ctx.quadraticCurveTo(x + sx * w * 1.03, y + h * 0.15, x + sx * w * 0.98, y + h * 0.38)
    ctx.stroke()
    // まつげ：上へ短く何本も立ち、目尻側は長く外へ跳ねる
    for (const [t, len, width] of [[0.2, 10, 5], [0.35, 13, 5], [0.5, 14, 6], [0.65, 14, 6], [0.8, 18, 7], [0.93, 22, 8]]) {
      const p0 = arch(t)
      const p1 = outward(t, len)
      lash(p0.x, p0.y, p1.x + sx * len * 0.35, p1.y, width)
    }
    for (const [dy, len] of [[0.05, 16], [0.3, 12]]) {
      const p0 = { x: x + sx * w, y: y + h * dy }
      lash(p0.x, p0.y, p0.x + sx * len, p0.y + len * 0.35, 5)
    }
    // まつげの上の紫の小さな光
    ctx.fillStyle = 'rgba(205, 160, 255, 0.95)'
    for (const t of [0.42, 0.58]) {
      const p = arch(t)
      ellipse(p.x, p.y, 3, 2.2, 0.4)
      ctx.fill()
    }
    // 下まぶた：瞳の下の短い平らな線と、小さな下まつげ
    ctx.strokeStyle = '#4a2630'
    ctx.fillStyle = '#4a2630'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x - sx * w * 0.45, y + h * 0.8)
    ctx.quadraticCurveTo(x + sx * w * 0.05, y + h * 0.76, x + sx * w * 0.62, y + h * 0.8)
    ctx.stroke()
    for (const f of [-0.3, 0.3]) {
      const lx = x + sx * w * f
      lash(lx, y + h * 0.8, lx - sx * 2, y + h * 0.95, 3)
    }
    // 目頭の上のピンクがかった影
    ctx.fillStyle = 'rgba(200, 120, 120, 0.45)'
    ellipse(it.x + sx * 4, it.y - h * 0.35, 8, 5, sx * 0.4)
    ctx.fill()
  }

  // 鼻：小さな影だけ
  ctx.strokeStyle = 'rgba(205, 130, 120, 0.8)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(px(0.02), py(1.84))
  ctx.lineTo(px(-0.01), py(1.87))
  ctx.stroke()

  // 口：大きく開けて笑う（上は平ら、下は丸い）。上の歯と舌が見える
  const mx = px(0)
  const my = py(1.98)
  const mouth = () => {
    ctx.beginPath()
    ctx.moveTo(mx - 30, my - 6)
    ctx.quadraticCurveTo(mx, my - 2, mx + 30, my - 6)
    ctx.bezierCurveTo(mx + 24, my + 34, mx - 24, my + 34, mx - 30, my - 6)
  }
  ctx.save()
  mouth()
  ctx.fillStyle = '#a3304d'
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = '#ffffff'
  ellipse(mx, my - 4, 24, 7)
  ctx.fill()
  ctx.fillStyle = '#f08aa0'
  ellipse(mx, my + 27, 20, 12)
  ctx.fill()
  ctx.restore()
  mouth()
  ctx.strokeStyle = '#5a1a2c'
  ctx.lineWidth = 2.5
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

/** 髪のツヤのクローバー形（4 枚の丸い葉）。原点が中心で xy 平面に置く */
function clover(): THREE.BufferGeometry {
  const r = 0.022
  const leaves = [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    return new THREE.CircleGeometry(r, 14).translate(Math.cos(a) * r, Math.sin(a) * r, 0)
  })
  return mergeGeometries(leaves)
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
  // 胴（上着）
  g.add(mesh(new THREE.CapsuleGeometry(0.15, 0.14, 4, 12), coat, 0, 0.75, 0))
  // 裾の宝石と、胸のピンクのリボンと宝石
  g.add(mesh(new THREE.OctahedronGeometry(0.035), gem, 0, 0.6, 0.23))
  for (const sx of [-1, 1]) {
    const bow = mesh(new THREE.ConeGeometry(0.05, 0.09, 8), pink, sx * 0.05, 0.86, 0.14)
    bow.rotation.z = (sx * Math.PI) / 2
    g.add(bow)
  }
  g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), gem, 0, 0.86, 0.16))

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
  const cloverGeometry = clover()
  const dotGeometry = new THREE.CircleGeometry(0.025, 12)
  const shine = new THREE.MeshBasicMaterial({ color: C.shine, side: THREE.DoubleSide })
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
    // 髪のツヤ：前髪のアーチの上に、黄色いクローバー形と丸い光の点を貼る
    for (const [phi, theta, r, size] of [[0.3, 0.7, 0.47, 1], [0.6, 0.98, 0.43, 0.5], [0.13, 0.6, 0.445, 0.35]]) {
      const n = onHead(phi * s, theta, 1).sub(HEAD)
      const spot = new THREE.Mesh(size === 1 ? cloverGeometry : dotGeometry, shine)
      spot.position.copy(n).multiplyScalar(r).add(HEAD)
      spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
      spot.scale.setScalar(size)
      g.add(spot)
    }
    // 前髪の後ろで、顔のまわりを肩まで垂れる横髪
    const side = [onHead(0.95 * s, 0.9, 0.33), onHead(1.1 * s, 1.4, 0.35), onHead(1.05 * s, 1.9, 0.34), onHead(0.98 * s, 2.35, 0.31)]
    g.add(new THREE.Mesh(hairStrand(side, 0.09, 0.03, 0, 0, 'head'), hairMat))
  }
  // アホ毛：頭のてっぺんから立って、大きく 1 回巻く
  const ahoge = [[0, 1.5, 0.03], [0, 1.62, 0.04], [0.03, 1.72, 0.03], [0.1, 1.74, 0.01], [0.14, 1.67, 0], [0.1, 1.61, 0], [0.06, 1.64, 0.01]].map(([x, y, z]) => new THREE.Vector3(x, y, z))
  g.add(new THREE.Mesh(hairStrand(ahoge, 0.03, 0.012), hairMat))

  // お団子と飾り：金縁のピンクの宝石を真ん中に、上へ水色の羽・下へ白い羽。その下にピンクの花びらの飾りと黄色の透けたベール
  const gold = new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.35, metalness: 0.6 })
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
    badge.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), gem, 0, 0, 0.01))
    badge.add(mesh(new THREE.TorusGeometry(0.033, 0.008, 6, 16), gold, 0, 0, 0.01))
    badge.add(mesh(new THREE.OctahedronGeometry(0.014), gold, s * 0.04, 0.03, 0.01))
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
