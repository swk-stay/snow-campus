import * as THREE from 'three'
import { ellipsePath, faceMesh, hairSheet, HEAD, mat, mesh, onHead, skinMaterial, type FaceDraw } from './chibi'

// 篠澤広（「学園アイドルマスター」）を 2 頭身にデフォルメしたモデル。
// 参考はユーザーが見せた私服の設定画（前・後ろ・服の各部）で、リポジトリには入れていない。
// 遠目で分かるよう残した特徴：腰まで届くまっすぐな長い髪（明るい灰色がかったベージュで、頭に沿って細く、毛先だけ暗くなって外へ散る）・
// 右寄りの分け目からおでこの上を斜めに横切って左へ流れる前髪・それを左のこめかみで留める 2 本の長いヘアピン・半分まぶたの下りたオレンジの目・
// 足首まで届く生成りのロングカーディガン（裏地はグレージュ、袖は広く、袖口の上に麦の穂のような矢羽の刺繍）・
// 胸元をオレンジの紐で編み上げた白いキャミソール（裾が広がる）・水色のデニムのショートパンツ（裾は切りっぱなし）・
// 左の腰から垂れる焦げ茶のロープベルト・右の手首のヘアゴム・ジュート底の白いスリッポン。
// 設定画の立ち姿（手を体の前で組む）は絵のためのものなので、腕はプリキュアと同じく体の横に下ろす。
// 長い髪は肩の前に落ちる束と、腕の後ろに落ちる束に分かれ、首の後ろは空く（設定画の後ろ姿）。背中の雪玉とは重ならない。

const C = {
  hair: 0xe6d9c2,
  hairTip: 0x958a82,
  coat: 0xf4f0e6,
  lining: 0xcbbfba,
  embroidery: 0xcdbfa5,
  cami: 0xfbfaf6,
  lace: 0xd2743a,
  denim: 0xa9b6e6,
  fray: 0xeef1f8,
  rope: 0x3d3330,
  pin: 0x3a3640,
  shoe: 0xf3efe4,
  jute: 0xd6b47c,
  piping: 0x6b6766,
} as const

/** 顔の絵を貼る範囲の下端。目鼻を下に寄せ、口からあごまでが長く見えないようにする */
const FACE_BOTTOM = 2.45

/**
 * 顔の絵：眉・目・頬・鼻・口。プリキュアと同じく、2 頭身に合わせて線と塗りだけの単純な形にデフォルメする。
 * 目は大きく、左右を寄せ、顔の高さの半分より少し下に置く（設定画の目は、分け目からあごまでの 6 割ほど下）。
 * 広らしさは、上まぶたが平らに下りて黒目の上が隠れた、眠たげな目に寄せる。黒目は上が赤みのオレンジで、下が明るいオレンジ
 */
const drawFace: FaceDraw = (ctx, px, py) => {
  const ink = '#4a3226'

  // 頬：うすいピンクのぼかし
  for (const sx of [-1, 1]) {
    const x = px(sx * 0.5)
    const y = py(2.08)
    const blush = ctx.createRadialGradient(x, y, 0, x, y, 30)
    blush.addColorStop(0, 'rgba(248, 150, 160, 0.45)')
    blush.addColorStop(1, 'rgba(248, 150, 160, 0)')
    ctx.fillStyle = blush
    ellipsePath(ctx, x, y, 36, 22)
    ctx.fill()
  }

  // 眉：髪に近い薄茶の細い線。ゆるい弧
  ctx.strokeStyle = '#a8907a'
  ctx.lineWidth = 3.5
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(px(sx * 0.17), py(1.52))
    ctx.quadraticCurveTo(px(sx * 0.35), py(1.42), px(sx * 0.55), py(1.5))
    ctx.stroke()
  }

  // 目：縦長の大きな丸を、平らな上まぶたの線で上 3 割ほど切る。中は 2 色のグラデーションと暗い瞳、光は大小 2 つだけ
  for (const sx of [-1, 1]) {
    const x = px(sx * 0.35)
    const y = py(1.8)
    const rx = 40
    const ry = 48
    const top = y - ry * 0.4
    const lid = () => {
      ctx.moveTo(x - sx * rx * 1.02, top + 4)
      ctx.quadraticCurveTo(x, top - 6, x + sx * rx * 1.1, top + 8)
    }
    ctx.save()
    ctx.beginPath()
    lid()
    ctx.lineTo(x + sx * rx * 1.2, y + ry * 1.2)
    ctx.lineTo(x - sx * rx * 1.2, y + ry * 1.2)
    ctx.closePath()
    ctx.clip()
    const iris = ctx.createLinearGradient(0, top, 0, y + ry)
    iris.addColorStop(0, '#b2481c')
    iris.addColorStop(1, '#f6a63c')
    ctx.fillStyle = iris
    ellipsePath(ctx, x, y, rx, ry)
    ctx.fill()
    ctx.fillStyle = 'rgba(110, 40, 14, 0.8)'
    ellipsePath(ctx, x, y + 4, rx * 0.42, ry * 0.5)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ellipsePath(ctx, x - sx * rx * 0.38, top + 16, 10, 10)
    ctx.fill()
    ellipsePath(ctx, x + sx * rx * 0.4, y + ry * 0.55, 5, 5)
    ctx.fill()
    ctx.restore()

    ctx.strokeStyle = ink
    ctx.lineWidth = 7
    ctx.beginPath()
    lid()
    ctx.stroke()
    // 目尻のまつげ：下へ流す
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x + sx * rx * 1.05, top + 7)
    ctx.quadraticCurveTo(x + sx * rx * 1.25, top + 14, x + sx * rx * 1.28, top + 28)
    ctx.stroke()
  }

  // 鼻：小さな点
  ctx.fillStyle = 'rgba(220, 150, 150, 0.7)'
  ellipsePath(ctx, px(0), py(2.04), 4, 3)
  ctx.fill()

  // 口：小さく開いた口
  ellipsePath(ctx, px(0), py(2.27), 8, 6)
  ctx.fillStyle = '#d97478'
  ctx.fill()
  ctx.strokeStyle = '#6a3a32'
  ctx.lineWidth = 2.5
  ctx.stroke()
}

/**
 * 前が開いて、後ろの裾にスリットの入った長い上着の、左右の身ごろ。
 * rows は上から順に [y, 半径, 前の開き（正面から左右へのラジアン）, 後ろのスリット（真後ろから左右へのラジアン）]。
 * 面は外を向くので、表は FrontSide、裏地は BackSide の材質で同じ形を 2 回描く
 */
function coatGeometry(rows: [number, number, number, number][], columns: number): THREE.BufferGeometry {
  const positions: number[] = []
  const index: number[] = []
  for (const side of [1, -1]) {
    const base = positions.length / 3
    for (const [y, r, gap, slit] of rows) {
      for (let j = 0; j <= columns; j++) {
        // 正面（+z）から side の側を回って後ろへ
        const a = gap + (Math.PI - slit - gap) * (j / columns)
        positions.push(side * Math.sin(a) * r, y, Math.cos(a) * r)
      }
    }
    const at = (i: number, j: number) => base + i * (columns + 1) + j
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < columns; j++) {
        // 下（i + 1）と後ろ（j + 1）の向きの外積が外を向く。右の身ごろは x が反転するので巻き順も逆にする
        const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)]
        if (side > 0) index.push(a, b, c, c, b, d)
        else index.push(a, c, b, c, d, b)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * 袖の模様：生成りの地に、袖口の少し上を一周する矢羽の刺繍（上下に細い線、間に「く」の字の葉を並べる）。
 * CylinderGeometry の v は上が 1 なので、Canvas の下ほど袖口に近い
 */
function sleeveTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `#${C.coat.toString(16)}`
  ctx.fillRect(0, 0, 512, 256)
  const top = 150
  const bottom = 222
  ctx.fillStyle = `#${C.embroidery.toString(16)}`
  ctx.fillRect(0, top, 512, 5)
  ctx.fillRect(0, bottom - 5, 512, 5)
  const mid = (top + bottom) / 2
  const count = 12
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * (512 / count)
    // 「く」の字を作る 2 枚の葉
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(x, mid + s * 12)
      ctx.rotate(-s * 0.7)
      ellipsePath(ctx, 0, 0, 14, 6)
      ctx.fill()
      ctx.restore()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** from から to へ向けた物（+y を to の向きにそろえる）の回転 */
function aim(object: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  object.position.copy(from).add(to).multiplyScalar(0.5)
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
}

/**
 * ヘアピン：頭の表面の点（phi, theta）に沿わせて置く細い棒。angle は表面の上での向き（0 が横向き、+ で上へ傾く）
 */
function hairPin(material: THREE.Material, phi: number, theta: number, angle: number): THREE.Mesh {
  const pin = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.1, 3, 6), material)
  pin.position.copy(onHead(phi, theta, 0.338))
  const normal = pin.position.clone().sub(HEAD).normalize()
  // 頭の表面の横向き（phi が増える向き）と上向き（theta が減る向き）
  const east = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi))
  const north = new THREE.Vector3().crossVectors(normal, east)
  const along = east.multiplyScalar(Math.cos(angle)).addScaledVector(north, Math.sin(angle)).normalize()
  // CapsuleGeometry は y が長い向き
  const side = new THREE.Vector3().crossVectors(along, normal)
  pin.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, along, normal))
  return pin
}

/** 体の軸のまわりの角度 a（正面が 0、+ が左）・半径 r・高さ y の点 */
function ring(a: number, r: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r)
}

/** 頭の表面に沿う髪の流れ。[phi, theta] の列を、頭の中心から r の点にする */
function overHead(path: [number, number][], r: number): THREE.Vector3[] {
  return path.map(([phi, theta]) => onHead(phi, theta, r))
}

/** 2 本の流れ（[phi, theta] の列）の間を count 本に割った流れ */
function between(a: [number, number][], b: [number, number][], count: number): [number, number][][] {
  return Array.from({ length: count }, (_, k) => a.map(([p, t], i): [number, number] => [p + (b[i][0] - p) * (k / (count - 1)), t + (b[i][1] - t) * (k / (count - 1))]))
}

/** 分け目の位置（頭の上の横の角度）。右（-x）寄りの横分け */
const PART = -0.22

/**
 * 前髪。設定画では右寄りの分け目から、前髪の大半がおでこの上を斜めに横切って左のこめかみへ流れ、2 本のヘアピンで留まる。
 * おでこの縁は分け目の下（右寄り）がいちばん高く、左の眉尻へ向かって斜めに下がる。右へは短く流れて顔の横に落ちる。
 * 2 頭身は頭の球の上半分が大きいので、分け目を高くするとおでこが広く見える。分け目の下の縁は天頂から 1.12 ラジアンまで下げ、
 * 左右は眉（theta 1.42〜1.52）にかからない高さで止める。
 * top は頭のてっぺんから耳の上へ流れる上の縁、arch はおでこを縁取って顔の横をあごまで下りる下の縁。
 * 顔の横の髪は目尻のすぐ外（目の幅の半分ほど）から始まるので、arch は目尻（phi 0.5）の少し外を通す。
 * 外へ離すと顔とおでこが横に広がって見え、目も離れて見える
 */
const BANGS: Record<-1 | 1, { top: [number, number][]; arch: [number, number][] }> = {
  [-1]: {
    top: [[PART, 0.08], [-0.6, 0.3], [-0.95, 0.6], [-1.15, 0.95], [-1.26, 1.3], [-1.3, 1.65], [-1.3, 1.95]],
    arch: [[PART, 1.12], [-0.38, 1.18], [-0.52, 1.28], [-0.6, 1.4], [-0.66, 1.56], [-0.69, 1.8], [-0.66, 2.15]],
  },
  [1]: {
    top: [[PART, 0.08], [0.3, 0.32], [0.8, 0.6], [1.1, 0.95], [1.25, 1.3], [1.32, 1.65], [1.32, 1.95]],
    arch: [[PART, 1.12], [0, 1.2], [0.2, 1.28], [0.36, 1.35], [0.5, 1.42], [0.62, 1.66], [0.67, 2.15]],
  },
}

/** 体の前（z > 0）か後ろ（z < 0）に、正面か真後ろを向いて垂れる髪の板の、内側から外側への 5 本の流れの x と z */
function hangingColumns(side: number, x0: number, x1: number, z0: number, z1: number): [number, number][] {
  return Array.from({ length: 5 }, (_, k) => [side * (x0 + (x1 - x0) * (k / 4)), z0 + (z1 - z0) * (k / 4)])
}

/**
 * 髪：頭に沿う薄い殻・前髪・長い髪。
 * 共通の hairCap は上と後ろへふくらませた球で、まっすぐ寝た広の髪にはヘルメットのように見えたので使わず、頭の球より少しだけ大きい殻にする
 */
function hair(): THREE.Group {
  const g = new THREE.Group()
  const shell = new THREE.MeshStandardMaterial({ color: C.hair, roughness: 0.65, side: THREE.DoubleSide })
  // 殻：頭のてっぺんと、顔の前（正面から ±0.95）を空けた横と後ろ。SphereGeometry の phi は π/2 が正面（+z）
  const r = 0.318
  const window = 0.95
  const crown = 0.64
  g.add(mesh(new THREE.SphereGeometry(r, 32, 6, 0, Math.PI * 2, 0, crown), shell, HEAD.x, HEAD.y, HEAD.z))
  g.add(mesh(new THREE.SphereGeometry(r, 28, 16, Math.PI / 2 + window, Math.PI * 2 - window * 2, crown, 2.4 - crown), shell, HEAD.x, HEAD.y, HEAD.z))

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide })
  for (const s of [-1, 1] as const) {
    // 前髪と、顔の横から肩の前に落ちる横髪：分け目から頭の上を流れ、顔の横を頬に沿って下り、肩の前をまっすぐ腰の上まで垂れる 1 枚の髪。
    // 前髪を頭の横で切って、肩の前の髪をあごの下から別に垂らすと、斜めからは前髪の切り口が頭の横の段に見え（姫カットのよう）、
    // 正面からは頬のまわりが膨らんで見えたので、つなげて 1 枚にする。
    // おでこの縁（arch）に近い流れほど頭に寄せ（縁で肌との隙間が見えないように）、頬に沿わせる。
    // 肩の前では内側の縁を首の外に置き、首と襟元が左右の横髪の間に見えるようにする（設定画）。毛先は外の房ほど外へ散る
    const { top, arch } = BANGS[s]
    const front = between(top, arch, 6).map((path, k) => {
      const w = k / 5 // 0 が上の縁（頭の横を回る外側）、1 がおでこの縁（頬に沿う内側）
      const x = s * (0.31 - 0.145 * w)
      const z = 0.1 + 0.11 * w
      return [
        ...overHead(path, 0.334 - 0.022 * w ** 3),
        new THREE.Vector3(x, 0.86, z),
        new THREE.Vector3(x * 1.01, 0.76, z - 0.005),
        new THREE.Vector3(x * 1.02, 0.66, z - 0.01),
        new THREE.Vector3(x + s * (0.03 + 0.06 * (1 - w)), 0.58, z - 0.02),
      ]
    })
    g.add(new THREE.Mesh(hairSheet(front, C.hair, C.hairTip, { across: 3, along: 50, wisps: 3, notch: 0.08, gradient: [0.72, 1], byPoints: true }), material))

    // 頭の横から肩と二の腕にかかる髪：前と後ろの髪の間で、殻の下の縁が見えない（おかっぱに見えない）ようにする。
    // 肩の高さで切ると、横からは頭のまわりのギザギザの房に見えたので、二の腕の途中まで垂らす。
    // 根元は殻のすぐ内側を通し、頭のいちばん太いところ（赤道）からまっすぐ下へ垂らす。垂れた髪は赤道で殻に接して外へ出るので、段にならない
    // （殻の上に置くと根元の縁が線に、殻の途中から斜めに出すと出口が頭の横の段に見えた）。
    // 前の横髪と重なってちらつかないよう、横髪の外側（頭の横 phi 1.3）より後ろから始める
    const shoulder = Array.from({ length: 5 }, (_, k) => {
      const a = s * (1.4 + 0.7 * (k / 4))
      return [onHead(a, 1.1, 0.312), onHead(a, 1.5, 0.316), ring(a, 0.321, 1.06), ring(a, 0.33, 0.9), ring(a, 0.345, 0.8), ring(a, 0.35, 0.7)]
    })
    g.add(new THREE.Mesh(hairSheet(shoulder, C.hair, C.hairTip, { across: 4, along: 30, wisps: 4, notch: 0.08, gradient: [0.6, 1.2] }), material))

    // 腕の後ろに落ちる髪：頭の後ろ寄りから、真後ろへ向けた板になって腰まで垂れる。真後ろ（首の後ろ）は空ける。根元は肩の髪と同じく赤道から垂らす。
    // 毛先は外の房ほど大きく横へ広げ、少し持ち上げる（設定画の前からの絵で、腰の高さで腕の外へ広がる暗い毛先）
    const back = hangingColumns(s, 0.12, 0.3, -0.3, -0.22).map(([x, z], k) => {
      const a = s * (2.75 - 0.75 * (k / 4))
      return [onHead(a, 0.9, 0.305), onHead(a, 1.5, 0.316), ring(a, 0.322, 1.06), new THREE.Vector3(x, 0.92, z), new THREE.Vector3(x, 0.74, z - 0.01), new THREE.Vector3(x, 0.62, z), new THREE.Vector3(x + s * (0.05 + 0.13 * (k / 4)), 0.54 + 0.02 * (k / 4), z + 0.03)]
    })
    g.add(new THREE.Mesh(hairSheet(back, C.hair, C.hairTip, { across: 4, along: 40, wisps: 4, notch: 0.12, gradient: [0.62, 1] }), material))
  }

  // 左へ流れる前髪を、こめかみの上で流れを横切って留める 2 本のヘアピン。斜め上へ平行に並べ、流れに沿ってずらす。
  // 設定画のヘアピンは顔の幅の半分ほどあり目立つので長めにし、左下の端がおでこの縁に届くところに置く
  const pin = mat(C.pin)
  g.add(hairPin(pin, 0.28, 1.15, 0.7), hairPin(pin, 0.47, 1.23, 0.7))
  return g
}

export function shinozawaHiroModel(): THREE.Group {
  const g = new THREE.Group()
  const skin = skinMaterial()

  // 脚と、ジュート底の白いスリッポン（履き口に濃い灰色の縁）
  const shoe = mat(C.shoe)
  const jute = new THREE.MeshStandardMaterial({ color: C.jute, roughness: 1 })
  const piping = mat(C.piping)
  for (const sx of [-0.075, 0.075]) {
    g.add(mesh(new THREE.CylinderGeometry(0.046, 0.04, 0.42, 10), skin, sx, 0.27, 0))
    const upper = mesh(new THREE.SphereGeometry(0.062, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), shoe, sx, 0.022, 0.02)
    upper.scale.set(1, 0.9, 1.45)
    g.add(upper)
    const sole = mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.024, 16), jute, sx, 0.012, 0.02)
    sole.scale.set(1, 1, 1.45)
    g.add(sole)
    const opening = mesh(new THREE.TorusGeometry(0.044, 0.006, 6, 18), piping, sx, 0.062, 0.0)
    opening.rotation.x = Math.PI / 2
    opening.scale.set(1, 1.15, 1)
    g.add(opening)
  }

  // デニムのショートパンツ：腰まわりと左右の脚。裾は白っぽく切りっぱなし
  const denim = mat(C.denim)
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.07, 20), denim, 0, 0.545, 0))
  const fray = mat(C.fray)
  for (const sx of [-0.078, 0.078]) {
    g.add(mesh(new THREE.CylinderGeometry(0.078, 0.088, 0.07, 14), denim, sx, 0.49, 0))
    const hem = mesh(new THREE.TorusGeometry(0.088, 0.008, 6, 18), fray, sx, 0.456, 0)
    hem.rotation.x = Math.PI / 2
    g.add(hem)
  }

  // ロープベルト：腰に巻き、左の腰の前から太ももまで垂らして、先を房にする
  const rope = mat(C.rope)
  const belt = mesh(new THREE.TorusGeometry(0.155, 0.012, 6, 28), rope, 0, 0.572, 0)
  belt.rotation.x = Math.PI / 2
  g.add(belt)
  const tail = new THREE.CatmullRomCurve3([[0.1, 0.572, 0.12], [0.12, 0.5, 0.15], [0.125, 0.4, 0.155], [0.12, 0.33, 0.15]].map(([x, y, z]) => new THREE.Vector3(x, y, z)))
  g.add(new THREE.Mesh(new THREE.TubeGeometry(tail, 24, 0.011, 6, false), rope))
  g.add(mesh(new THREE.ConeGeometry(0.016, 0.06, 8), rope, 0.12, 0.31, 0.15))

  // キャミソール：胸から上は肌。白い身ごろに、胸の下の切り替えから裾が広がる
  g.add(mesh(new THREE.CapsuleGeometry(0.11, 0.1, 4, 12), skin, 0, 0.76, 0))
  const cami = mat(C.cami)
  g.add(mesh(new THREE.CylinderGeometry(0.122, 0.13, 0.1, 20), cami, 0, 0.74, 0))
  const peplum = new THREE.MeshStandardMaterial({ color: C.cami, roughness: 0.75, side: THREE.DoubleSide })
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.12, 24, 1, true), peplum, 0, 0.63, 0))
  const seam = mesh(new THREE.TorusGeometry(0.13, 0.003, 4, 24), mat(0xd9d6d0), 0, 0.69, 0)
  seam.rotation.x = Math.PI / 2
  g.add(seam)
  // 胸元の編み上げ：オレンジの紐が 3 つ交差し、下から 2 本垂れる
  const lace = mat(C.lace)
  for (const y of [0.775, 0.752, 0.729]) {
    for (const s of [-1, 1]) {
      const cross = mesh(new THREE.CapsuleGeometry(0.0035, 0.026, 2, 4), lace, 0, y, 0.133)
      cross.rotation.z = s * 0.75
      g.add(cross)
    }
  }
  for (const sx of [-1, 1]) {
    const points = [[0.004, 0.716, 0.134], [0.006, 0.69, 0.137], [0.009, 0.65, 0.158], [0.012, 0.6, 0.182]].map(([x, y, z]) => new THREE.Vector3(x * sx, y, z))
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.0035, 5, false), lace))
  }

  // ロングカーディガン：襟のない丸首から足首まで。前は開いて、下ほど少し広がる。後ろの裾にスリット
  const coatRows: [number, number, number, number][] = [
    [0.87, 0.115, 0.55, 0],
    [0.82, 0.17, 0.55, 0],
    [0.76, 0.195, 0.58, 0],
    [0.6, 0.208, 0.62, 0],
    [0.45, 0.225, 0.66, 0],
    [0.3, 0.238, 0.68, 0],
    [0.23, 0.244, 0.69, 0.14],
    [0.16, 0.25, 0.7, 0.28],
  ]
  const coatGeo = coatGeometry(coatRows, 24)
  const lining = new THREE.MeshStandardMaterial({ color: C.lining, roughness: 0.85, side: THREE.BackSide })
  g.add(new THREE.Mesh(coatGeo, mat(C.coat)), new THREE.Mesh(coatGeo, lining))

  // 袖：広い袖を、肩から少し開いて体の横に下ろす。袖口から手が出る
  const sleeveMat = new THREE.MeshStandardMaterial({ map: sleeveTexture(), roughness: 0.8 })
  const sleeveLining = new THREE.MeshStandardMaterial({ color: C.lining, roughness: 0.85, side: THREE.BackSide })
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Vector3(sx * 0.165, 0.8, 0)
    const cuff = new THREE.Vector3(sx * 0.245, 0.6, 0.02)
    const sleeveGeo = new THREE.CylinderGeometry(0.058, 0.088, shoulder.distanceTo(cuff), 18, 1, true)
    for (const material of [sleeveMat, sleeveLining]) {
      const sleeve = new THREE.Mesh(sleeveGeo, material)
      aim(sleeve, cuff, shoulder)
      g.add(sleeve)
    }
    const hand = mesh(new THREE.SphereGeometry(0.042, 12, 10), skin, sx * 0.262, 0.565, 0.025)
    hand.scale.set(0.85, 1, 0.85)
    g.add(hand)
    if (sx < 0) {
      // 右の手首のヘアゴム：袖口のすぐ下
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0065, 6, 16), mat(0x2b2a30))
      tie.position.set(sx * 0.255, 0.588, 0.022)
      tie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cuff.clone().sub(shoulder).normalize())
      g.add(tie)
    }
  }

  // 頭と顔と髪
  g.add(mesh(new THREE.SphereGeometry(0.3, 20, 16), skin, HEAD.x, HEAD.y, HEAD.z))
  g.add(faceMesh(drawFace, FACE_BOTTOM))
  g.add(hair())

  return g
}
