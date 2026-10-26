import * as THREE from 'three'
import { FlyCamera, type CollisionMode } from './flyCamera'

// ?view=god の神視点（展示用）カメラ。操作は Editor と共通の FPS 風カメラ（flyCamera.ts）で、
// クリック（または Alt）で Pointer Lock に入ってマウスで見回し、WASD で見ている方向へ進む。自機は動かさない。
// 右下のパネルで自動回転の ON/OFF・移動速度の段階・建物に当たったときの動き（貫通／止まる／回り込む）・感度と視野角を切り替える。

/** カメラの高さの範囲（m）。地面に潜らず、上がりすぎない程度 */
const MIN_Y = 2
const MAX_Y = 400
/** カメラがキャンパスの外へ出られる幅（m）。最初の引きの位置も入るように */
const OUTSIDE = 80
/** 自動回転の速さ（rad/秒）。1 周およそ 100 秒 */
const AUTO_ROTATE_SPEED = 0.063

const COLLISIONS: { label: string; value: CollisionMode }[] = [
  { label: '貫通', value: 'pass' },
  { label: '止まる', value: 'stop' },
  { label: '回り込む', value: 'slide' },
]

export class GodCamera {
  readonly fly: FlyCamera
  autoRotate = true
  private collisionIndex = 0
  /** このフレームで見回し・移動の操作があったか（そのあいだは自動回転を止める） */
  private interacted = false
  private readonly rotateButton: HTMLButtonElement
  private readonly speedButton: HTMLButtonElement
  private readonly collisionButton: HTMLButtonElement

  /** area：キャンパスの範囲（中心と半幅。カメラはこれより OUTSIDE だけ外まで動ける）。blocked：その点が建物の中なら true */
  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, area: { x: number; z: number; half: number }, blocked: (p: THREE.Vector3) => boolean) {
    this.fly = new FlyCamera(camera, dom, {
      area: { x: area.x, z: area.z, half: area.half + OUTSIDE },
      minY: MIN_Y,
      maxY: MAX_Y,
      blocked,
      clickToLock: true,
    })
    camera.position.set(area.x, 230, area.z + 300)
    this.fly.lookAt(new THREE.Vector3(area.x, 8, area.z))
    this.fly.onUserInput = () => (this.interacted = true)
    // マウスで見回し始めたら、自動回転は切る（ロック中に勝手に回ると酔う）
    this.fly.onLockChange = (locked) => {
      if (locked && this.autoRotate) this.toggleRotate()
    }
    this.fly.onSpeedChange(() => this.refresh())

    const panel = document.createElement('div')
    panel.id = 'god-bar'
    panel.innerHTML = `<button data-rotate></button><button data-speed></button><button data-collision></button>`
    panel.appendChild(this.fly.settingsPanel)
    document.body.appendChild(panel)
    this.rotateButton = panel.querySelector('[data-rotate]')!
    this.speedButton = panel.querySelector('[data-speed]')!
    this.collisionButton = panel.querySelector('[data-collision]')!
    this.rotateButton.addEventListener('click', () => this.toggleRotate())
    this.speedButton.addEventListener('click', () => this.fly.cycleSpeed())
    this.collisionButton.addEventListener('click', () => this.cycleCollision())
    // R で自動回転、C で建物の当たり方を切り替え（Shift の速度は FlyCamera が受け持つ。神視点ではスキルもショップも無いので被らない）
    addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey) return
      if (e.code === 'KeyR') this.toggleRotate()
      else if (e.code === 'KeyC') this.cycleCollision()
    })
    this.refresh()
  }

  toggleRotate() {
    this.autoRotate = !this.autoRotate
    this.refresh()
  }

  cycleCollision() {
    this.collisionIndex = (this.collisionIndex + 1) % COLLISIONS.length
    this.fly.collision = COLLISIONS[this.collisionIndex].value
    this.refresh()
  }

  update(dt: number) {
    this.fly.update(dt)
    if (this.autoRotate && !this.interacted && !this.fly.locked) this.fly.orbit(AUTO_ROTATE_SPEED * dt)
    this.interacted = false
  }

  private refresh() {
    this.rotateButton.innerHTML = `自動回転 ${this.autoRotate ? 'ON' : 'OFF'} <kbd>R</kbd>`
    this.rotateButton.classList.toggle('active', this.autoRotate)
    this.speedButton.innerHTML = `速度 ${this.fly.speedLabel} <kbd>Shift</kbd>`
    this.collisionButton.innerHTML = `建物 ${COLLISIONS[this.collisionIndex].label} <kbd>C</kbd>`
  }
}
