import * as THREE from 'three'

// キュアアンサー（「名探偵プリキュア！」、issue #105）をデフォルメしたモデル。
// 参考：https://www.toei-anim.co.jp/tv/precure/character/answer.php
// 2 頭身にして、遠目でも分かる特徴だけを残す：薄紫の髪・頭の上の 2 つのお団子と羽の飾り・
// 毛先がピンクになってハート形に巻く長いツインテール・水色の瞳・紫の上着と水色のスカートに黄色のフリル・
// 背中の大きな黄色いリボン・胸のピンクのリボン・白いニーハイに紫のブーツ。
// 顔は +z を向く（PlayerView の向きに合わせる）。背中の雪玉（-z）とツインテールが重ならないよう、髪は横に広げて垂らす。

const C = {
  hair: 0xd9a2f0,
  hairTip: 0xf28fb8,
  skin: 0xffe2cf,
  eye: 0x3cc6c8,
  pupil: 0x1d5c6e,
  coat: 0xb98ae6,
  skirt: 0xcfe0f4,
  frill: 0xf6e7a0,
  ribbon: 0xf2d35c,
  pink: 0xee5fa0,
  gem: 0xd6248a,
  wing: 0xa9e4f2,
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

/**
 * ツインテール 1 本。肩の後ろから外へ広がって垂れ、毛先はハートの片側のように外へ巻き上がる。
 * 太さは根元から毛先へ細くし、色は途中から毛先のピンクへ変える（頂点カラー）。side は +1 が左（+x）
 */
function twinTail(side: 1 | -1): THREE.Mesh {
  const x = (v: number) => v * side
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x(0.2), 1.36, -0.1),
    new THREE.Vector3(x(0.36), 1.12, -0.2),
    new THREE.Vector3(x(0.44), 0.74, -0.24),
    new THREE.Vector3(x(0.46), 0.4, -0.2),
    new THREE.Vector3(x(0.5), 0.17, -0.16),
    new THREE.Vector3(x(0.66), 0.12, -0.14),
    new THREE.Vector3(x(0.78), 0.24, -0.13),
    new THREE.Vector3(x(0.74), 0.38, -0.12),
    new THREE.Vector3(x(0.64), 0.4, -0.12),
  ])
  const tubular = 48
  const radial = 10
  const geometry = new THREE.TubeGeometry(curve, tubular, 1, radial, false)
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const hair = new THREE.Color(C.hair)
  const tip = new THREE.Color(C.hairTip)
  const c = new THREE.Color()
  const center = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    curve.getPointAt(t, center)
    // 根元は太く、毛先に向かって細く（半径 1 の管を縮める）
    const r = 0.17 * (1 - t) + 0.045 * t
    c.lerpColors(hair, tip, THREE.MathUtils.smoothstep(t, 0.45, 0.7))
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j
      v.fromBufferAttribute(pos, k).sub(center).multiplyScalar(r).add(center)
      pos.setXYZ(k, v.x, v.y, v.z)
      c.toArray(colors, k * 3)
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }))
}

export function cureAnswerModel(): THREE.Group {
  const g = new THREE.Group()
  const hair = mat(C.hair)
  const skin = mat(C.skin)
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

  // 頭：顔のまわりを、上と後ろにずらした髪の球で覆う（おでこは前髪、顔の下半分は出る）
  g.add(mesh(new THREE.SphereGeometry(0.3, 20, 16), skin, 0, 1.12, 0))
  const cap = mesh(new THREE.SphereGeometry(0.325, 20, 16), hair, 0, 1.19, -0.045)
  cap.scale.set(1.04, 1, 1)
  g.add(cap)
  // 顔の横に垂れる髪
  for (const sx of [-1, 1]) {
    const lock = mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), hair, sx * 0.25, 1.0, 0.08)
    lock.rotation.z = sx * -0.15
    g.add(lock)
  }
  // アホ毛（頭のてっぺんでくるっと巻く）
  const ahoge = mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 16, Math.PI * 1.6), hair, 0, 1.56, 0.02)
  ahoge.rotation.y = Math.PI / 2
  g.add(ahoge)

  // 目：大きい水色の瞳と、白いハイライト
  const eyeMat = new THREE.MeshBasicMaterial({ color: C.eye })
  const pupilMat = new THREE.MeshBasicMaterial({ color: C.pupil })
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.05, 12, 8), eyeMat, sx * 0.1, 1.13, 0.27)
    eye.scale.set(0.85, 1.25, 0.5)
    g.add(eye)
    const pupil = mesh(new THREE.SphereGeometry(0.025, 8, 6), pupilMat, sx * 0.1, 1.12, 0.29)
    pupil.scale.set(1, 1.3, 0.5)
    g.add(pupil)
    g.add(mesh(new THREE.SphereGeometry(0.012, 6, 4), shineMat, sx * 0.1 - 0.015, 1.16, 0.3))
  }
  // 口（にっこり）
  g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc0465c }), 0, 1.0, 0.285))

  // お団子と飾り：ピンクの花びらの飾りと、水色の小さな羽
  const wing = mat(C.wing)
  const flowerMat = new THREE.MeshStandardMaterial({ color: C.pink, roughness: 0.75, side: THREE.DoubleSide })
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.09, 12, 10), hair, sx * 0.2, 1.42, -0.04))
    const flower = mesh(new THREE.ConeGeometry(0.09, 0.12, 6, 1, true), flowerMat, sx * 0.3, 1.34, -0.04)
    flower.rotation.z = sx * 1.9
    g.add(flower)
    g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), gem, sx * 0.27, 1.4, 0.03))
    const w = mesh(new THREE.SphereGeometry(0.06, 10, 6), wing, sx * 0.3, 1.48, -0.02)
    w.scale.set(1.3, 0.45, 0.3)
    w.rotation.z = sx * 0.6
    g.add(w)
  }

  g.add(twinTail(1), twinTail(-1))

  return g
}
