import * as THREE from 'three'

// 演出用パーティクル。どれも InstancedMesh のプールで、ドローコールは1種類につき1回。

const tmpMatrix = new THREE.Matrix4()
const tmpQuat = new THREE.Quaternion()
const tmpScale = new THREE.Vector3()
const tmpVec = new THREE.Vector3()
const IDENTITY_QUAT = new THREE.Quaternion()
const tmpColor = new THREE.Color()
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0)

type Particle = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  age: number
  life: number
  size: number
}

function makePool(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    active: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    age: 0,
    life: 1,
    size: 1,
  }))
}

function makeMesh(count: number, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.frustumCulled = false
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, ZERO_MATRIX)
  return mesh
}

/** 雪原から背中の雪玉へ吸い込まれていく雪の粒 */
export class Suction {
  readonly mesh: THREE.InstancedMesh
  private readonly ps: Particle[]
  private cursor = 0

  constructor(count = 500) {
    this.ps = makePool(count)
    this.mesh = makeMesh(count, new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  }

  spawn(pos: THREE.Vector3) {
    const p = this.ps[this.cursor]
    this.cursor = (this.cursor + 1) % this.ps.length
    p.active = true
    p.pos.copy(pos)
    p.vel.set((Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2)
    p.age = 0
    p.size = 0.06 + Math.random() * 0.07
  }

  update(dt: number, target: THREE.Vector3) {
    this.ps.forEach((p, i) => {
      if (!p.active) return
      p.age += dt
      tmpVec.subVectors(target, p.pos)
      const dist = tmpVec.length()
      if (dist < 0.3 || p.age > 3) {
        p.active = false
        this.mesh.setMatrixAt(i, ZERO_MATRIX)
        return
      }
      // 時間とともに引力を強くして、最後は必ず吸い込まれるようにする
      p.vel.addScaledVector(tmpVec.normalize(), (8 + p.age * 40) * dt)
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 2.5))
      p.pos.addScaledVector(p.vel, dt)
      tmpScale.setScalar(p.size * Math.min(1, 0.3 + dist / 1.5))
      this.mesh.setMatrixAt(i, tmpMatrix.compose(p.pos, IDENTITY_QUAT, tmpScale))
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

/** 重力付きの飛び散る粒（着弾の雪しぶき、完成時の金色の粒など） */
export class Sparkles {
  readonly mesh: THREE.InstancedMesh
  private readonly ps: Particle[]
  private cursor = 0

  constructor(count = 400) {
    this.ps = makePool(count)
    this.mesh = makeMesh(
      count,
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    )
    const white = new THREE.Color(0xffffff)
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, white)
  }

  burst(center: THREE.Vector3, count: number, color: THREE.ColorRepresentation, speed: number, spread = 0) {
    const c = new THREE.Color(color)
    for (let n = 0; n < count; n++) {
      const i = this.cursor
      const p = this.ps[i]
      this.cursor = (this.cursor + 1) % this.ps.length
      p.active = true
      p.pos.set(
        center.x + (Math.random() - 0.5) * spread,
        center.y,
        center.z + (Math.random() - 0.5) * spread,
      )
      p.vel.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()))
      p.age = 0
      p.life = 0.6 + Math.random() * 0.8
      p.size = 0.05 + Math.random() * 0.1
      this.mesh.setColorAt(i, c)
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  update(dt: number) {
    this.ps.forEach((p, i) => {
      if (!p.active) return
      p.age += dt
      if (p.age > p.life) {
        p.active = false
        this.mesh.setMatrixAt(i, ZERO_MATRIX)
        return
      }
      p.vel.y -= 9.8 * dt
      p.pos.addScaledVector(p.vel, dt)
      tmpQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.age * 8)
      tmpScale.setScalar(p.size * (1 - p.age / p.life))
      this.mesh.setMatrixAt(i, tmpMatrix.compose(p.pos, tmpQuat, tmpScale))
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

type Projectile = {
  active: boolean
  from: THREE.Vector3
  to: THREE.Vector3
  t: number
  duration: number
  arc: number
  scale: number
  onLand: (() => void) | null
}

/** プレイヤーから建物へ放物線で飛ぶ雪玉 */
export class Projectiles {
  readonly mesh: THREE.InstancedMesh
  private readonly ps: Projectile[]
  private cursor = 0

  constructor(count = 96) {
    this.ps = Array.from({ length: count }, () => ({
      active: false,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      t: 0,
      duration: 1,
      arc: 1,
      scale: 1,
      onLand: null,
    }))
    this.mesh = makeMesh(
      count,
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    )
    const white = new THREE.Color(0xffffff)
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, white)
  }

  /** scale: 雪玉の見た目の大きさ（量が多いほど大きく）、color: レア雪などで色を変える */
  launch(from: THREE.Vector3, to: THREE.Vector3, onLand: () => void, scale = 1, color: THREE.ColorRepresentation = 0xffffff) {
    this.mesh.setColorAt(this.cursor, tmpColor.set(color))
    this.mesh.instanceColor!.needsUpdate = true
    const p = this.ps[this.cursor]
    this.cursor = (this.cursor + 1) % this.ps.length
    // プール一周で上書きされる場合も、着弾処理（進捗の反映）だけは取りこぼさない
    if (p.active) p.onLand?.()
    p.active = true
    p.from.copy(from)
    p.to.copy(to)
    p.t = 0
    p.duration = 0.45 + from.distanceTo(to) * 0.03
    p.arc = 2 + from.distanceTo(to) * 0.15
    p.onLand = onLand
    p.scale = scale
  }

  update(dt: number) {
    this.ps.forEach((p, i) => {
      if (!p.active) return
      p.t += dt
      const u = Math.min(1, p.t / p.duration)
      if (u >= 1) {
        p.active = false
        this.mesh.setMatrixAt(i, ZERO_MATRIX)
        p.onLand?.()
        p.onLand = null
        return
      }
      tmpVec.lerpVectors(p.from, p.to, u)
      tmpVec.y += p.arc * 4 * u * (1 - u)
      tmpScale.setScalar(p.scale)
      this.mesh.setMatrixAt(i, tmpMatrix.compose(tmpVec, IDENTITY_QUAT, tmpScale))
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
