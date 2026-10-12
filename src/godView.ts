import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { MoveInput } from './sim/game'

// ?view=god の神視点（展示用）カメラ。マウス／タッチは OrbitControls（回転・ズーム）、
// WASD / 矢印でカメラを見ている方向へ移動する（FPS のスペクテイター風。自機は動かさない）。
// 右下のパネルで自動回転の ON/OFF・移動速度の段階・建物に当たったときの動き（貫通／止まる／回り込む）を切り替える。

/** カメラの高さの範囲（m）。地面に潜らず、上がりすぎない程度 */
const MIN_Y = 2
const MAX_Y = 250
/** カメラがキャンパスの外へ出られる幅（m）。最初の引きの位置も入るように */
const OUTSIDE = 80

/** 移動速度の段階（m/秒）。キャンパスは一辺 200m 強なので、最速で数秒で端まで行ける程度 */
const SPEEDS = [
  { label: '遅い', value: 10 },
  { label: '普通', value: 25 },
  { label: '速い', value: 60 },
  { label: '最速', value: 120 },
]

/** 建物に当たったときの動き。貫通は中に入った建物を main が薄くする。回り込むは壁に沿って滑る */
const COLLISIONS = [
  { label: '貫通', value: 'pass' },
  { label: '止まる', value: 'stop' },
  { label: '回り込む', value: 'slide' },
] as const

const AXES = ['x', 'z', 'y'] as const

const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const delta = new THREE.Vector3()
const next = new THREE.Vector3()

export class GodCamera {
  readonly controls: OrbitControls
  private speedIndex = 1
  private collisionIndex = 0
  private readonly camera: THREE.PerspectiveCamera
  private readonly limit: number
  private readonly blocked: (p: THREE.Vector3) => boolean
  private readonly rotateButton: HTMLButtonElement
  private readonly speedButton: HTMLButtonElement
  private readonly collisionButton: HTMLButtonElement

  /** limit：キャンパスの範囲（原点からの x / z の絶対値。カメラはこれより OUTSIDE だけ外まで動ける）。blocked：その点が建物の中なら true */
  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, limit: number, blocked: (p: THREE.Vector3) => boolean) {
    this.camera = camera
    this.limit = limit
    this.blocked = blocked
    camera.position.set(0, 120, 165)
    this.controls = new OrbitControls(camera, dom)
    this.controls.target.set(0, 8, 0)
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 0.6
    this.controls.enableDamping = true
    // 地面の下に潜らない
    this.controls.maxPolarAngle = Math.PI * 0.48

    const panel = document.createElement('div')
    panel.id = 'god-bar'
    panel.innerHTML = `<button data-rotate></button><button data-speed></button><button data-collision></button>`
    document.body.appendChild(panel)
    this.rotateButton = panel.querySelector('[data-rotate]')!
    this.speedButton = panel.querySelector('[data-speed]')!
    this.rotateButton.addEventListener('click', () => this.toggleRotate())
    this.collisionButton = panel.querySelector('[data-collision]')!
    this.speedButton.addEventListener('click', () => this.cycleSpeed())
    this.collisionButton.addEventListener('click', () => this.cycleCollision())
    // R で自動回転、Shift で速度の段階、C で建物の当たり方を切り替え（神視点ではスキルもショップも無いので被らない）
    addEventListener('keydown', (e) => {
      if (e.repeat) return
      if (e.code === 'KeyR') this.toggleRotate()
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.cycleSpeed()
      else if (e.code === 'KeyC') this.cycleCollision()
    })
    this.refresh()
  }

  toggleRotate() {
    this.controls.autoRotate = !this.controls.autoRotate
    this.refresh()
  }

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length
    this.refresh()
  }

  cycleCollision() {
    this.collisionIndex = (this.collisionIndex + 1) % COLLISIONS.length
    this.refresh()
  }

  /** move はスクリーン基準（x: 右, z: 下）。W/S は見ている方向（上下も含む）、A/D は水平に左右へ、カメラと注視点を一緒に動かす */
  update(dt: number, move: MoveInput) {
    if (move.x !== 0 || move.z !== 0) {
      this.camera.getWorldDirection(forward)
      right.crossVectors(forward, this.camera.up)
      // 真上から見下ろしているときは右方向が決まらないので、カメラのローカル X 軸を使う
      if (right.lengthSq() < 1e-6) right.setFromMatrixColumn(this.camera.matrixWorld, 0)
      right.setY(0).normalize()
      const step = SPEEDS[this.speedIndex].value * dt
      delta.copy(right).multiplyScalar(move.x * step).addScaledVector(forward, -move.z * step)
      // カメラが範囲外に出ないぶんだけ動かす（注視点はカメラの遠く先にあるので、注視点で制限すると手前で止まってしまう）
      const pos = this.camera.position
      const range = this.limit + OUTSIDE
      delta.x = THREE.MathUtils.clamp(pos.x + delta.x, -range, range) - pos.x
      delta.y = THREE.MathUtils.clamp(pos.y + delta.y, MIN_Y, MAX_Y) - pos.y
      delta.z = THREE.MathUtils.clamp(pos.z + delta.z, -range, range) - pos.z
      this.collide(delta)
      const target = this.controls.target
      target.add(delta)
      pos.add(delta)
      // 注視点が地面に潜ったら、見ている向きのまま地面の上まで引き寄せる（回転の中心が地中にならないように）
      if (target.y < 0) target.sub(pos).multiplyScalar(pos.y / (pos.y - target.y)).add(pos)
    }
    this.controls.update(dt)
  }

  /** カメラが建物に入らないよう delta を削る。回転やズームで既に中にいるときは、出られるように何もしない */
  private collide(delta: THREE.Vector3) {
    const mode = COLLISIONS[this.collisionIndex].value
    const pos = this.camera.position
    if (mode === 'pass' || this.blocked(pos)) return
    if (!this.blocked(next.copy(pos).add(delta))) return
    if (mode === 'stop') {
      delta.set(0, 0, 0)
      return
    }
    // 軸ごとに動かしてみて、ぶつかる軸だけ止める（建物は軸に沿った箱なので、壁や屋根に沿って滑る）
    next.copy(pos)
    for (const axis of AXES) {
      next[axis] += delta[axis]
      if (this.blocked(next)) {
        next[axis] -= delta[axis]
        delta[axis] = 0
      }
    }
  }

  private refresh() {
    this.rotateButton.innerHTML = `自動回転 ${this.controls.autoRotate ? 'ON' : 'OFF'} <kbd>R</kbd>`
    this.rotateButton.classList.toggle('active', this.controls.autoRotate)
    this.speedButton.innerHTML = `速度 ${SPEEDS[this.speedIndex].label} <kbd>Shift</kbd>`
    this.collisionButton.innerHTML = `建物 ${COLLISIONS[this.collisionIndex].label} <kbd>C</kbd>`
  }
}
