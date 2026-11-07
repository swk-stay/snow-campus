import * as THREE from 'three'
import { face, HEAD, hairCap, hairStrands, mat, mesh, onHead, skinMaterial, WHITE } from './cure'

// 友利奈緒（「Charlotte」）をデフォルメしたモデル。顔の描き方と髪の束は cure.ts の部品を使い、体は制服なので自前で組む。
// 参考：https://charlotte-anime.jp/character/ の立ち絵（前と、顔の正面・横）
// 特徴：腰まである銀髪のゆるく波打つロングヘア・左の頭の上で結んだサイドテール・青い目・
// 白いセーラー襟と黄色いリボンの赤いブレザー・焦げ茶のプリーツスカート・黒いニーソックスと茶色のブーツ・右手にビデオカメラ。
// 背中の雪玉（-z）と重ならないよう、長い髪は肩の後ろ横へ広げて垂らす。

const C = {
  hair: 0xdcd6cc,
  hairTip: 0xc9c0b4,
  tie: 0x8a2a30,
  blazer: 0xc8323c,
  ribbon: 0xf2cf4a,
  skirt: 0x4a2a24,
  sock: 0x2a2a30,
  boot: 0x7a5236,
  camera: 0x3a3c42,
} as const

const strand = hairStrands(C.hair, C.hairTip)

/** 髪を垂らす点。y の間隔ごとに x と z を交互に振って、ゆるい波にする。side は +1 が左（+x） */
function wave(side: number, x0: number, z0: number, y0: number, y1: number, drift: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  const n = 5
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const sway = i === 0 ? 0 : Math.sin(t * Math.PI * 2.5) * 0.03
    points.push(new THREE.Vector3(side * (x0 + drift * t + sway), y0 + (y1 - y0) * t, z0 - sway * 0.7))
  }
  return points
}

function body(): THREE.Group {
  const g = new THREE.Group()
  const skin = skinMaterial()
  const white = mat(WHITE)
  const blazer = mat(C.blazer)

  // 脚：黒いニーソックスと茶色のブーツ（つま先を前に）
  for (const sx of [-0.09, 0.09]) {
    g.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 10), mat(C.sock), sx, 0.27, 0))
    const boot = mesh(new THREE.SphereGeometry(0.075, 12, 8), mat(C.boot), sx, 0.07, 0.025)
    boot.scale.set(1, 0.85, 1.35)
    g.add(boot)
  }

  // スカート：角を立てた円錐でプリーツに見せる
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.34, 0.24, 14), new THREE.MeshStandardMaterial({ color: C.skirt, roughness: 0.85, flatShading: true }), 0, 0.5, 0))

  // 胴：赤いブレザー。裾の白い縁取り
  g.add(mesh(new THREE.CapsuleGeometry(0.15, 0.14, 4, 12), blazer, 0, 0.75, 0))
  const hem = mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 24), white, 0, 0.64, 0)
  hem.rotation.x = Math.PI / 2
  g.add(hem)

  // セーラー襟：後ろは四角い垂れ、前は肩から胸の真ん中へ下りる V 字の 2 本
  const flap = mesh(new THREE.BoxGeometry(0.3, 0.16, 0.012), white, 0, 0.86, -0.13)
  flap.rotation.x = -0.35
  g.add(flap)
  for (const sx of [-1, 1]) {
    const band = mesh(new THREE.BoxGeometry(0.05, 0.2, 0.012), white, sx * 0.085, 0.87, 0.14)
    band.rotation.z = sx * 0.55
    band.rotation.x = 0.25
    g.add(band)
  }

  // 黄色いリボン：襟の V の下で結ぶ。左右の輪と結び目、垂れる 2 本
  const ribbon = mat(C.ribbon)
  for (const sx of [-1, 1]) {
    const loop = mesh(new THREE.SphereGeometry(0.045, 12, 8), ribbon, sx * 0.055, 0.8, 0.165)
    loop.scale.set(1.3, 0.7, 0.45)
    loop.rotation.z = -sx * 0.2
    g.add(loop)
    const tail = mesh(new THREE.BoxGeometry(0.045, 0.13, 0.014), ribbon, sx * 0.035, 0.72, 0.17)
    tail.rotation.z = sx * 0.2
    g.add(tail)
  }
  g.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), ribbon, 0, 0.8, 0.175))

  // 腕：赤い袖と白いカフス、肌の手
  for (const sx of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.04, 0.16, 4, 8), blazer, sx * 0.19, 0.74, 0)
    arm.rotation.z = sx * 0.45
    g.add(arm)
    const cuff = mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12), white, sx * 0.235, 0.655, 0)
    cuff.rotation.z = sx * 0.45
    g.add(cuff)
    g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), skin, sx * 0.25, 0.63, 0))
  }

  // 右手（-x）のビデオカメラ：本体の箱と前のレンズ
  const camera = mat(C.camera)
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.1), camera, -0.27, 0.62, 0.06))
  const lens = mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.02, 10), camera, -0.27, 0.625, 0.12)
  lens.rotation.x = Math.PI / 2
  g.add(lens)

  // 頭と顔（青い目、閉じた口）
  g.add(mesh(new THREE.SphereGeometry(0.3, 20, 16), skin, HEAD.x, HEAD.y, HEAD.z))
  g.add(face({ eye: '#2f6fd6', smile: false }))
  return g
}

export function tomoriNaoModel(): THREE.Group {
  const g = body()
  const hair = mat(C.hair)
  g.add(hairCap(hair))
  const hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  const add = (points: THREE.Vector3[], r0: number, r1: number, g1 = 0, flat?: 'head') => g.add(new THREE.Mesh(strand(points, r0, r1, 0, g1, flat), hairMat))

  // 前髪：分け目は真ん中より右（-x）寄りで、おでこに沿って左（+x）へ流し、眉の上で終える。右側は短く、こめかみへ垂れる
  add([onHead(-0.2, 0.45, 0.325), onHead(0.1, 0.72, 0.325), onHead(0.45, 1.0, 0.318), onHead(0.72, 1.3, 0.312)], 0.05, 0.02, 0, 'head')
  add([onHead(-0.25, 0.5, 0.325), onHead(0.0, 0.85, 0.322), onHead(0.28, 1.12, 0.315), onHead(0.48, 1.32, 0.31)], 0.045, 0.018, 0, 'head')
  add([onHead(-0.22, 0.55, 0.325), onHead(-0.12, 0.9, 0.32), onHead(0.05, 1.18, 0.313), onHead(0.2, 1.34, 0.308)], 0.035, 0.014, 0, 'head')
  add([onHead(-0.3, 0.5, 0.325), onHead(-0.5, 0.78, 0.325), onHead(-0.75, 1.05, 0.318), onHead(-0.92, 1.32, 0.312)], 0.045, 0.02, 0, 'head')

  for (const s of [-1, 1]) {
    // 顔のまわりを胸まで垂れる横髪
    add([onHead(0.95 * s, 0.9, 0.33), onHead(1.1 * s, 1.4, 0.35), ...wave(s, 0.33, 0.1, 0.8, 0.55, 0.02)], 0.09, 0.04, 1)
    // 後ろ髪：肩の後ろの横へ広げて腰まで垂らす（真後ろは背中の雪玉の場所）
    add([onHead(2.2 * s, 0.9, 0.33), ...wave(s, 0.26, -0.16, 0.95, 0.42, 0.08)], 0.11, 0.05, 1)
    add([onHead(2.8 * s, 1.0, 0.32), ...wave(s, 0.12, -0.2, 0.9, 0.5, 0.06)], 0.08, 0.04, 1)
  }

  // サイドテール：左（+x）の頭の上で焦げた赤の結び目でくくり、左の後ろ横を波打ちながら垂れる
  g.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), hair, ...onHead(0.8, 0.55, 0.3).toArray()))
  g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), mat(C.tie), ...onHead(0.85, 0.5, 0.345).toArray()))
  add([onHead(0.85, 0.5, 0.34), new THREE.Vector3(0.36, 1.4, -0.06), new THREE.Vector3(0.44, 1.25, -0.1), ...wave(1, 0.44, -0.12, 1.05, 0.4, -0.04)], 0.09, 0.04, 1)

  return g
}
