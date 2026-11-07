import * as THREE from 'three'

// キャラクターのスキンを 2 頭身にデフォルメしたモデルの、作品によらない共通の部品：頭の位置・顔の絵の貼り方・肌・髪の束・頭を覆う髪。
// 顔は +z を向く（PlayerView の向きに合わせる）。+x がキャラクターの左。
// 背中の雪玉（-z）と重ならないよう、長い髪は横に広げて垂らす。

const SKIN = 0xffe2cf

export function mat(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
}

/** 肌。陰で灰色にくすまないよう、少し自発光させる */
export function skinMaterial() {
  return new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.9, emissive: 0x6e5040 })
}

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  return m
}

/** 頭（肌の球、半径 0.3）の中心 */
export const HEAD = new THREE.Vector3(0, 1.12, 0)

/** 頭の中心から、横の角度 phi（正面が 0、+ が左）・天頂からの角度 theta・距離 r の点 */
export function onHead(phi: number, theta: number, r: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)).multiplyScalar(r).add(HEAD)
}

// 顔の絵を貼る範囲。頭の球の前面を、水平は正面から ±FACE_PHI、縦は天頂からの角度で FACE_THETA0..FACE_THETA1
const FACE_PHI = 0.9
const FACE_THETA0 = 1.0
const FACE_THETA1 = 2.2
// 絵は 1 ラジアン 256 単位の座標で描き、Canvas は FACE_SCALE 倍の解像度にする（近くで見ても線がにじまないように）
const FACE_UNIT = 256
const FACE_SCALE = 2

/**
 * 顔の絵を描く関数。px・py は頭の球の上の点（横の角度 phi・天頂からの角度 theta）を Canvas の座標（1 ラジアン 256 単位）に直す。
 * 描ける範囲は phi が ±0.9、theta が 1.0..bottom（faceMesh の引数。既定の 2.2 なら目はだいたい theta 1.65、口は 1.95）
 */
export type FaceDraw = (ctx: CanvasRenderingContext2D, px: (phi: number) => number, py: (theta: number) => number) => void

/**
 * 顔。Canvas に 2D で描いた絵（draw）を、頭よりわずかに大きい球の前面に貼る。
 * bottom：絵を貼る範囲の下端（天頂からの角度）。目鼻を下に寄せたいときは大きくする（あごの先は π）
 */
export function faceMesh(draw: FaceDraw, bottom = FACE_THETA1): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(FACE_PHI * 2 * FACE_UNIT * FACE_SCALE)
  canvas.height = Math.round((bottom - FACE_THETA0) * FACE_UNIT * FACE_SCALE)
  const ctx = canvas.getContext('2d')!
  ctx.scale(FACE_SCALE, FACE_SCALE)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  draw(
    ctx,
    (phi) => (phi + FACE_PHI) * FACE_UNIT,
    (theta) => (theta - FACE_THETA0) * FACE_UNIT,
  )

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  // SphereGeometry は phi が増えると -x から +z を回って +x へ進むので、正面（+z）は phi = π/2
  const geometry = new THREE.SphereGeometry(0.302, 24, 16, Math.PI / 2 - FACE_PHI, FACE_PHI * 2, FACE_THETA0, bottom - FACE_THETA0)
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
  m.position.copy(HEAD)
  return m
}

/** Canvas に楕円のパスを作る（塗りや線は呼び出し側で） */
export function ellipsePath(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
}

export type HairStrand = (points: THREE.Vector3[], r0: number, r1: number, g0?: number, g1?: number, flat?: 'z' | 'head') => THREE.BufferGeometry

/**
 * 髪の束を作る関数。root は根元の色、tip は毛先の色。
 * 髪の束 1 本は points を通る管で、太さは r0 から r1 へ細くし、平たくして幅のある毛束にする。
 * flat：どの向きに平たくするか。'z' は前後（垂れる髪）、'head' は頭の中心から外向き（頭に沿う前髪）
 * 色は髪全体での位置 g0..g1（0 が根元、1 が毛先）で決め、途中から毛先の色へ変える（頂点カラー）
 */
export function hairStrands(root: number, tip: number): HairStrand {
  const rootColor = new THREE.Color(root)
  const tipColor = new THREE.Color(tip)
  return (points, r0, r1, g0 = 0, g1 = 0, flat = 'z') => {
    const curve = new THREE.CatmullRomCurve3(points)
    const tubular = 56
    const radial = 10
    const geometry = new THREE.TubeGeometry(curve, tubular, 1, radial, false)
    const pos = geometry.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    const center = new THREE.Vector3()
    const v = new THREE.Vector3()
    const axis = new THREE.Vector3(0, 0, 1)
    for (let i = 0; i <= tubular; i++) {
      const t = i / tubular
      curve.getPointAt(t, center)
      const r = r0 + (r1 - r0) * t
      c.lerpColors(rootColor, tipColor, THREE.MathUtils.smoothstep(g0 + (g1 - g0) * t, 0.48, 0.78))
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
}

export type HairSheetOptions = {
  /** 隣り合う guides の間を何列に割るか */
  across?: number
  /** 根元から毛先までを何段に割るか */
  along?: number
  /** 毛先を何本のとがった房に分けるか（0 なら切りそろえる） */
  wisps?: number
  /** 房の間の切れ込みの深さ（長さに対する割合） */
  notch?: number
  /** 根元からの長さの割合で、この範囲で root から tip の色へ変える */
  gradient?: [number, number]
  /**
   * 流れの上の位置を、長さの割合ではなく制御点の番号で割る。どの流れも同じ番号の制御点が同じ段に並ぶので、
   * 長さの違う流れ（頭の上を長く回る流れと、おでこの縁を短く通る流れなど）を、同じ番号の点からそろって垂らせる
   */
  byPoints?: boolean
}

/**
 * 髪の面。guides は髪の流れ（根元から毛先へ並べた制御点）を、面の端から端へ順に並べたもの。
 * 隣り合う流れの間をなめらかにつないだ厚みのない 1 枚の面にする（DoubleSide の材質で描く）。
 * 管を並べる hairStrands と違って表面に溝ができず、まっすぐな髪がまとまって見える。
 * 毛先は wisps 本のとがった房に分け、色は根元から毛先へ変える（頂点カラー）
 */
export function hairSheet(guides: THREE.Vector3[][], root: number, tip: number, options: HairSheetOptions = {}): THREE.BufferGeometry {
  const { across = 4, along = 40, wisps = 0, notch = 0, gradient = [0.6, 1], byPoints = false } = options
  const curves = guides.map((points) => new THREE.CatmullRomCurve3(points))
  const n = curves.length
  const columns = (n - 1) * across + 1
  const rootColor = new THREE.Color(root)
  const tipColor = new THREE.Color(tip)
  const positions = new Float32Array(columns * (along + 1) * 3)
  const colors = new Float32Array(columns * (along + 1) * 3)
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const out = new THREE.Vector3()
  const c = new THREE.Color()
  for (let col = 0; col < columns; col++) {
    const u = col / (columns - 1)
    // 房の真ん中は長さ 1、房の間は 1 - notch（とがった形になるよう直線で結ぶ）
    const frac = wisps > 0 ? (u * wisps) % 1 : 0.5
    const length = 1 - notch * Math.abs(2 * frac - 1)
    const f = col / across
    const i = Math.min(Math.floor(f), n - 2)
    const w = f - i
    for (let row = 0; row <= along; row++) {
      const t = (row / along) * length
      // 流れの向きは各 guide の曲線、横は隣の 4 本を Catmull-Rom でなめらかにつなぐ
      for (let k = 0; k < 4; k++) {
        const curve = curves[THREE.MathUtils.clamp(i - 1 + k, 0, n - 1)]
        if (byPoints) curve.getPoint(t, p[k])
        else curve.getPointAt(t, p[k])
      }
      out.copy(p[1]).multiplyScalar(2)
      out.addScaledVector(p[2].clone().sub(p[0]), w)
      out.addScaledVector(p[0].clone().multiplyScalar(2).addScaledVector(p[1], -5).addScaledVector(p[2], 4).sub(p[3]), w * w)
      out.addScaledVector(p[1].clone().multiplyScalar(3).sub(p[0]).addScaledVector(p[2], -3).add(p[3]), w * w * w)
      out.multiplyScalar(0.5)
      const k = col * (along + 1) + row
      out.toArray(positions, k * 3)
      c.lerpColors(rootColor, tipColor, THREE.MathUtils.smoothstep(t, gradient[0], gradient[1])).toArray(colors, k * 3)
    }
  }
  const index: number[] = []
  for (let col = 0; col < columns - 1; col++) {
    for (let row = 0; row < along; row++) {
      const a = col * (along + 1) + row
      const b = a + along + 1
      index.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** 頭を覆う髪：上と後ろにずらした球と、耳の後ろから襟足までを覆う後ろ髪の球（顔の前は出す） */
export function hairCap(material: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  const cap = mesh(new THREE.SphereGeometry(0.32, 24, 18), material, 0, 1.22, -0.09)
  cap.scale.set(1.1, 1, 1)
  g.add(cap)
  const back = mesh(new THREE.SphereGeometry(0.31, 20, 16), material, 0, 1.1, -0.05)
  back.scale.set(1.05, 1, 1)
  g.add(back)
  return g
}
