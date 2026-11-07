import * as THREE from 'three'
import { ellipsePath, faceMesh, HEAD, mat, mesh, skinMaterial, type FaceDraw } from './chibi'

// 「名探偵プリキュア！」のプリキュアをデフォルメしたモデルの共通部分（issue #105）。
// 顔と服の形はどのキャラクターも同じで、服は色だけ違う（CureColors）。髪型と髪の飾りはキャラクターごとのファイルで作る。
// 2 頭身にして、遠目でも分かる特徴だけを残す。頭・顔の貼り方・髪の束など、作品によらない部品は chibi.ts。

/** 服の色。形はどのキャラクターも同じ */
export type CureColors = {
  /** ケープと、スカートの上の裾（ペプラム） */
  coat: number
  skirt: number
  /** スカートのいちばん下のフリル */
  frill: number
  /** 前身ごろのボタン */
  button: number
  tie: number
  /** 襟元のリボン */
  collarBow: number
  /** ケープの裾の縁取り */
  trim: number
  /** スカートの裾の宝石 */
  gem: number
  /** 背中の大きなリボン */
  backBow: number
  boot: number
}

export const WHITE = 0xfbf8ff
const GOLD = 0xe8c25a

export function gemMaterial(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.3 })
}

export function goldMaterial() {
  return new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.35, metalness: 0.6 })
}

/**
 * 顔の絵：眉・目・頬・鼻・口。
 * 公式のデフォルメのイラストに合わせて、線と塗りだけの単純な描き方にする。
 * 立ち絵に寄せて目を細かく描き込むと、2 頭身の体には生々しすぎて不気味に見えたため。
 * eye：目の塗りの色（省略すると線と同じ焦げ茶）。smile：false なら口を閉じて小さくする
 */
export function face({ eye, smile = true }: { eye?: string; smile?: boolean } = {}): THREE.Mesh {
  const draw: FaceDraw = (ctx, px, py) => drawCureFace(ctx, px, py, eye, smile)
  return faceMesh(draw)
}

function drawCureFace(ctx: CanvasRenderingContext2D, px: (phi: number) => number, py: (theta: number) => number, eye: string | undefined, smile: boolean) {
  const ellipse = (x: number, y: number, rx: number, ry: number, rot = 0) => ellipsePath(ctx, x, y, rx, ry, rot)
  const ink = '#4b2e2a' // 線と目の焦げ茶

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
    ctx.fillStyle = eye ?? ink
    ellipse(x, y, rx, ry)
    ctx.fill()
    if (eye) {
      // 色付きの目には瞳を入れる（塗り一色だと平坦に見える）
      ctx.fillStyle = ink
      ellipse(x, y + ry * 0.1, rx * 0.5, ry * 0.55)
      ctx.fill()
    }
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
  if (!smile) {
    // 閉じた口：短い下向きの弧
    ctx.strokeStyle = ink
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(mx - 16, my + 4)
    ctx.quadraticCurveTo(mx, my + 14, mx + 16, my + 4)
    ctx.stroke()
  }
  const mouth = () => {
    ctx.beginPath()
    ctx.moveTo(mx - mw, my)
    ctx.quadraticCurveTo(mx, my - 14, mx + mw, my)
    ctx.bezierCurveTo(mx + mw * 0.9, my + 80, mx - mw * 0.9, my + 80, mx - mw, my)
  }
  if (smile) {
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
  }
}

/**
 * ブローチ：金縁の宝石と、右上（side が -1 なら左上）の金の星。原点が宝石の中心で、+z を向く。
 * キュアアンサーではお団子の飾りとネクタイの結び目に同じ形を使う
 */
export function brooch(gem: THREE.Material, gold: THREE.Material, side: number): THREE.Group {
  const b = new THREE.Group()
  b.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), gem))
  b.add(mesh(new THREE.TorusGeometry(0.033, 0.008, 6, 16), gold))
  b.add(mesh(new THREE.OctahedronGeometry(0.014), gold, side * 0.04, 0.03, 0))
  return b
}

/**
 * 天使の羽（片方）。根元が原点で +y へ伸び、+x 側に羽根の丸みが 3 つ並ぶ。薄く押し出し、
 * 根元の base の色から先の tip の色へ変える（頂点カラー）
 */
export function wingShape(base: number, tip: number): THREE.BufferGeometry {
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
  const baseColor = new THREE.Color(base)
  const tipColor = new THREE.Color(tip)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    c.lerpColors(baseColor, tipColor, THREE.MathUtils.smoothstep(pos.getY(i) + pos.getX(i) * 0.5, 0.02, 0.12)).toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
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
 * 髪と髪の飾りを除いた体：脚・スカート・前身ごろ・ケープ・ネクタイと襟元のリボン・腕・背中のリボン・頭と顔。
 * knot：襟元のリボンの結び目に付ける飾り（キャラクターごとに違う）
 */
export function cureBody(c: CureColors, knot: THREE.Object3D): THREE.Group {
  const g = new THREE.Group()
  const skin = skinMaterial()
  const white = mat(WHITE)
  const gold = goldMaterial()

  // 脚：白いニーハイとブーツ（つま先を前に）
  for (const sx of [-0.09, 0.09]) {
    g.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 10), white, sx, 0.27, 0))
    const boot = mesh(new THREE.SphereGeometry(0.075, 12, 8), mat(c.boot), sx, 0.07, 0.025)
    boot.scale.set(1, 0.85, 1.35)
    g.add(boot)
  }

  // スカート：下からフリル、スカート、上着の裾（ペプラム）
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.1, 20), mat(c.frill), 0, 0.44, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.33, 0.2, 20), mat(c.skirt), 0, 0.53, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.29, 0.14, 8), mat(c.coat), 0, 0.6, 0))
  // 裾の宝石
  g.add(mesh(new THREE.OctahedronGeometry(0.035), gemMaterial(c.gem), 0, 0.6, 0.23))
  // 胴：白い前身ごろに、ボタンを 2 列 × 2 段
  g.add(mesh(new THREE.CapsuleGeometry(0.15, 0.14, 4, 12), white, 0, 0.75, 0))
  const button = mat(c.button)
  for (const bx of [-0.05, 0.05]) {
    for (const by of [0.7, 0.745]) {
      const z = Math.sqrt(0.15 * 0.15 - bx * bx)
      g.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), button, bx, by, z + 0.004))
    }
  }
  // ケープ：肩から胸の上までを覆う短いケープ。前は開いてネクタイと前身ごろを見せ、
  // 裾は丸い波形（スカラップ）で、縁取りを付ける
  const capeTop = 0.92
  const capeBottom = 0.78
  const capeR = 0.25
  const gap = 0.55 // 前の開き（正面から左右へのラジアン）
  const capeMat = new THREE.MeshStandardMaterial({ color: c.coat, roughness: 0.75, side: THREE.DoubleSide })
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
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hem), scallops * 12, 0.007, 6, false), mat(c.trim)))
  // ネクタイ：結び目から垂れ、V 字にとがった先の縁は金。
  // 縁は同じ形の金の板を、ネクタイの後ろに少し下へずらして重ね、はみ出したところで見せる
  const tieGeometry = new THREE.ExtrudeGeometry(tieShape(), { depth: 0.008, bevelEnabled: false })
  g.add(mesh(tieGeometry, mat(c.tie), 0, 0.855, 0.154))
  g.add(mesh(tieGeometry, gold, 0, 0.843, 0.15))
  // 襟元のリボン：左右の輪と、結び目の飾り
  const collarBow = mat(c.collarBow)
  for (const sx of [-1, 1]) {
    const loop = mesh(new THREE.SphereGeometry(0.04, 12, 8), collarBow, sx * 0.045, 0.865, 0.165)
    loop.scale.set(1.2, 0.75, 0.45)
    loop.rotation.z = -sx * 0.25
    g.add(loop)
  }
  knot.position.set(0, 0.865, 0.18)
  g.add(knot)

  // 腕と白い手袋（少し開いて下ろす）
  for (const sx of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.04, 0.16, 4, 8), skin, sx * 0.19, 0.74, 0)
    arm.rotation.z = sx * 0.45
    g.add(arm)
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), white, sx * 0.25, 0.63, 0))
  }

  // 背中の大きなリボン（左右の輪と、垂れる 2 本）
  const backBow = mat(c.backBow)
  for (const sx of [-1, 1]) {
    const loop = mesh(new THREE.SphereGeometry(0.1, 12, 8), backBow, sx * 0.11, 0.7, -0.17)
    loop.scale.set(1.2, 0.7, 0.4)
    g.add(loop)
    const tail = mesh(new THREE.BoxGeometry(0.07, 0.24, 0.02), backBow, sx * 0.07, 0.55, -0.24)
    tail.rotation.z = sx * 0.25
    g.add(tail)
  }

  // 頭と顔
  g.add(mesh(new THREE.SphereGeometry(0.3, 20, 16), skin, HEAD.x, HEAD.y, HEAD.z))
  g.add(face())
  return g
}
