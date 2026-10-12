import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { MoveInput } from './sim/game'

// ?view=god の神視点（展示用）カメラ。マウス／タッチは OrbitControls（回転・ズーム）、
// WASD / 矢印でカメラを水平に移動する（自機は動かさない）。右下のパネルで自動回転の ON/OFF と移動速度の段階を切り替える。

/** 移動速度の段階（m/秒）。キャンパスは一辺 200m 強なので、最速で数秒で端まで行ける程度 */
const SPEEDS = [
  { label: '遅い', value: 10 },
  { label: '普通', value: 25 },
  { label: '速い', value: 60 },
  { label: '最速', value: 120 },
]

const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const delta = new THREE.Vector3()

export class GodCamera {
  readonly controls: OrbitControls
  private speedIndex = 1
  private readonly camera: THREE.PerspectiveCamera
  private readonly limit: number
  private readonly rotateButton: HTMLButtonElement
  private readonly speedButton: HTMLButtonElement

  /** limit：注視点を動かせる範囲（原点からの x / z の絶対値） */
  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, limit: number) {
    this.camera = camera
    this.limit = limit
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
    panel.innerHTML = `<button data-rotate></button><button data-speed></button>`
    document.body.appendChild(panel)
    this.rotateButton = panel.querySelector('[data-rotate]')!
    this.speedButton = panel.querySelector('[data-speed]')!
    this.rotateButton.addEventListener('click', () => this.toggleRotate())
    this.speedButton.addEventListener('click', () => this.cycleSpeed())
    // R で自動回転、Shift で速度の段階を切り替え（神視点ではスキルもショップも無いので被らない）
    addEventListener('keydown', (e) => {
      if (e.repeat) return
      if (e.code === 'KeyR') this.toggleRotate()
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.cycleSpeed()
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

  /** move はスクリーン基準（x: 右, z: 下）。カメラの向きに合わせて、カメラと注視点を一緒に水平移動する */
  update(dt: number, move: MoveInput) {
    if (move.x !== 0 || move.z !== 0) {
      this.camera.getWorldDirection(forward).setY(0)
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
      forward.normalize()
      right.crossVectors(forward, this.camera.up).normalize()
      const step = SPEEDS[this.speedIndex].value * dt
      delta.copy(right).multiplyScalar(move.x * step).addScaledVector(forward, -move.z * step)
      // 注視点が範囲外に出ないぶんだけ動かす
      const target = this.controls.target
      delta.x = THREE.MathUtils.clamp(target.x + delta.x, -this.limit, this.limit) - target.x
      delta.z = THREE.MathUtils.clamp(target.z + delta.z, -this.limit, this.limit) - target.z
      target.add(delta)
      this.camera.position.add(delta)
    }
    this.controls.update(dt)
  }

  private refresh() {
    this.rotateButton.innerHTML = `自動回転 ${this.controls.autoRotate ? 'ON' : 'OFF'} <kbd>R</kbd>`
    this.rotateButton.classList.toggle('active', this.controls.autoRotate)
    this.speedButton.innerHTML = `速度 ${SPEEDS[this.speedIndex].label} <kbd>Shift</kbd>`
  }
}
