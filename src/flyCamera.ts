import './flyCamera.css'
import * as THREE from 'three'

// 神視点（?view=god）と Editor で共通の、FPS のスペクテイター風カメラ（issue #42）。
// - 見回す：Pointer Lock 中はマウスを動かすだけ、ロックしていないときはドラッグ（タッチも）
// - 移動：W/S は見ている方向（上下も含む）、A/D は水平に左右、E/Q で真上・真下。ホイール・ピンチで前後
// - Ctrl（単独で押して離す）でロックの ON/OFF。神視点はクリックでもロックする（Editor のクリックは場所の指定）
// - 感度・視野角・移動速度・入った建物を透かすかはブラウザに保存して、神視点と Editor で共有する

/** 移動速度の段階（m/秒）。キャンパスは東西 450m ほどなので、最速で数秒で端まで行ける程度 */
const SPEEDS = [
  { label: '遅い', value: 10 },
  { label: '普通', value: 25 },
  { label: '速い', value: 60 },
  { label: '最速', value: 120 },
]

/** 建物に当たったときの動き。貫通は建物の中へ入れる（seeThrough なら入った建物を透かす）。回り込むは壁に沿って滑る */
export type CollisionMode = 'pass' | 'stop' | 'slide'

export type FlyOptions = {
  /** カメラが動ける範囲（中心と半幅）と高さ */
  area: { x: number; z: number; half: number }
  minY: number
  maxY: number
  /** その点が建物の中なら true。無ければ当たり判定しない */
  blocked?: (p: THREE.Vector3) => boolean
  /** マウスのクリック（ドラッグでないもの）で Pointer Lock に入るか */
  clickToLock: boolean
}

/** マウス 1px あたりの回転（rad）。感度 1 のとき */
const BASE_SENSITIVITY = 0.002
const MAX_PITCH = THREE.MathUtils.degToRad(89)
/**
 * Pointer Lock 中、1 回の mousemove でこれ（px）を超え、直前の動きよりずっと大きい移動は捨てる。
 * Chrome（とくに Windows）はロックの直後や、ときどき数百 px の飛んだ movementX/Y を返し、視点が急に飛ぶため
 */
const SPIKE_PX = 200
const STORAGE_KEY = 'snow-campus-fly'
const AXES = ['x', 'z', 'y'] as const

const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const delta = new THREE.Vector3()
const next = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/** seeThrough：カメラが入った建物を透かして外を見るか（切ると室内が見える。issue #62） */
type Settings = { sensitivity: number; fov: number; speed: number; seeThrough: boolean }

// localStorage はプライベートモードなどで例外を投げることがあるので、全部 try/catch で包む
function loadSettings(fov: number): Settings {
  const fallback = { sensitivity: 1, fov, speed: 1, seeThrough: false }
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>) }
  } catch {
    return fallback
  }
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement

export class FlyCamera {
  yaw = 0
  pitch = 0
  collision: CollisionMode = 'pass'
  /** ロックの ON/OFF が変わったとき */
  onLockChange: ((locked: boolean) => void) | null = null
  /** 見回し・移動の操作があったとき（神視点の自動回転を止めるのに使う） */
  onUserInput: (() => void) | null = null
  /** 最後にロックが外れた時刻（Esc でロックを外したキーを、ほかの Esc の操作と区別するため） */
  unlockedAt = -Infinity
  readonly settingsPanel: HTMLDivElement
  private readonly camera: THREE.PerspectiveCamera
  private readonly dom: HTMLElement
  private readonly options: FlyOptions
  private readonly settings: Settings
  private readonly keys = new Set<string>()
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private readonly crosshair: HTMLDivElement
  private readonly speedListeners: (() => void)[] = []
  private down = { x: 0, y: 0 }
  private pinch = 0
  /** 直前の mousemove の移動量（px）。飛んだ値を見分けるのに使う */
  private lastMove = 0
  /** ロックに入った直後の mousemove を捨てる（ロック前のカーソルの移動が入っていることがある） */
  private skipMove = false
  /** Ctrl を単独で押しているあいだ true（Ctrl+Enter などのショートカットでは切り替えない） */
  private ctrlAlone = false

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, options: FlyOptions) {
    this.camera = camera
    this.dom = dom
    this.options = options
    this.settings = loadSettings(camera.fov)
    this.settings.speed = THREE.MathUtils.clamp(Math.round(this.settings.speed), 0, SPEEDS.length - 1)
    camera.rotation.order = 'YXZ'
    this.applyFov()

    this.crosshair = document.createElement('div')
    this.crosshair.className = 'fly-crosshair'
    document.body.appendChild(this.crosshair)

    this.settingsPanel = document.createElement('div')
    this.settingsPanel.className = 'fly-settings'
    this.settingsPanel.innerHTML = `
      <label>感度 <input type="range" min="0.2" max="3" step="0.1" data-sens><output data-sens-out></output></label>
      <label>視野角 <input type="range" min="30" max="100" step="1" data-fov><output data-fov-out></output></label>
      <label><input type="checkbox" data-see> 入った建物を透かす</label>
    `
    const sens = this.settingsPanel.querySelector<HTMLInputElement>('[data-sens]')!
    const fov = this.settingsPanel.querySelector<HTMLInputElement>('[data-fov]')!
    const sensOut = this.settingsPanel.querySelector<HTMLOutputElement>('[data-sens-out]')!
    const fovOut = this.settingsPanel.querySelector<HTMLOutputElement>('[data-fov-out]')!
    const see = this.settingsPanel.querySelector<HTMLInputElement>('[data-see]')!
    const show = () => {
      sens.value = String(this.settings.sensitivity)
      fov.value = String(this.settings.fov)
      sensOut.textContent = this.settings.sensitivity.toFixed(1)
      fovOut.textContent = `${Math.round(this.settings.fov)}°`
      see.checked = this.settings.seeThrough
    }
    sens.addEventListener('input', () => {
      this.settings.sensitivity = parseFloat(sens.value)
      show()
      this.save()
    })
    fov.addEventListener('input', () => {
      this.settings.fov = parseFloat(fov.value)
      this.applyFov()
      show()
      this.save()
    })
    see.addEventListener('change', () => {
      this.settings.seeThrough = see.checked
      this.save()
    })
    // スライダーを触ったあとに矢印キーで移動しても、スライダーが動かないように
    for (const el of [sens, fov, see]) el.addEventListener('change', () => el.blur())
    show()

    this.bindKeys()
    this.bindPointer()
  }

  get locked(): boolean {
    return document.pointerLockElement === this.dom
  }

  /** カメラが入った建物を透かすか（透かすのは使う側。神視点は main.ts、Editor は editor/main.ts） */
  get seeThrough(): boolean {
    return this.settings.seeThrough
  }

  get speedLabel(): string {
    return SPEEDS[this.settings.speed].label
  }

  /** 速度の段階が変わったとき（ボタンの表示を直すのに使う） */
  onSpeedChange(fn: () => void) {
    this.speedListeners.push(fn)
  }

  cycleSpeed() {
    this.settings.speed = (this.settings.speed + 1) % SPEEDS.length
    this.save()
    for (const fn of this.speedListeners) fn()
  }

  lock() {
    if (this.locked) return
    // Pointer Lock が使えない環境（スマホなど）では何もしない。ドラッグで見回せる
    if (!this.dom.requestPointerLock) return
    // OS のマウス加速を通さない生の移動量を使う（加速で移動量が跳ねるのを防ぐ）。対応していないブラウザでは普通にロックする
    const result = this.dom.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | undefined
    result?.catch?.(() => this.dom.requestPointerLock()?.catch?.(() => {}))
  }

  unlock() {
    if (this.locked) document.exitPointerLock()
  }

  toggleLock() {
    if (this.locked) this.unlock()
    else this.lock()
  }

  /** 見ている方向（単位ベクトル） */
  getDirection(out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(this.pitch)
    return out.set(-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c)
  }

  /** 位置はそのままで、その点を向く */
  lookAt(target: THREE.Vector3) {
    const d = forward.subVectors(target, this.camera.position)
    if (d.lengthSq() < 1e-9) return
    this.yaw = Math.atan2(-d.x, -d.z)
    this.pitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -MAX_PITCH, MAX_PITCH)
    this.applyRotation()
  }

  /** 画面の中央に見えている地面の点のまわりを、水平に angle（rad）だけ回る（神視点の自動回転） */
  orbit(angle: number) {
    const pos = this.camera.position
    this.getDirection(forward)
    // 見下ろしていれば視線と地面の交点、水平より上を見ていれば少し先の点を中心にする
    const dist = forward.y < -0.05 ? Math.min(pos.y / -forward.y, 600) : 150
    const pivot = next.copy(pos).addScaledVector(forward, dist)
    delta.subVectors(pos, pivot).applyAxisAngle(UP, angle)
    pos.copy(pivot).add(delta)
    this.yaw += angle
    this.applyRotation()
  }

  update(dt: number) {
    let x = 0
    let z = 0
    let y = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (this.keys.has('KeyE')) y += 1
    if (this.keys.has('KeyQ')) y -= 1
    if (x === 0 && z === 0 && y === 0) return
    this.onUserInput?.()
    const len = Math.hypot(x, z, y)
    const step = (SPEEDS[this.settings.speed].value * dt) / len
    this.getDirection(forward)
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    delta.copy(right).multiplyScalar(x * step).addScaledVector(forward, z * step)
    delta.y += y * step
    this.move(delta)
  }

  /** 見ている方向へ distance（m）だけ進む（ホイール・ピンチ） */
  private dolly(distance: number) {
    this.onUserInput?.()
    this.move(this.getDirection(delta).multiplyScalar(distance))
  }

  /** 範囲と建物の当たりを見て、カメラを delta だけ動かす（delta は書き換わる） */
  private move(d: THREE.Vector3) {
    const pos = this.camera.position
    const { area, minY, maxY } = this.options
    d.x = THREE.MathUtils.clamp(pos.x + d.x, area.x - area.half, area.x + area.half) - pos.x
    d.y = THREE.MathUtils.clamp(pos.y + d.y, minY, maxY) - pos.y
    d.z = THREE.MathUtils.clamp(pos.z + d.z, area.z - area.half, area.z + area.half) - pos.z
    this.collide(d)
    pos.add(d)
  }

  /** カメラが建物に入らないよう delta を削る。既に中にいるときは、出られるように何もしない */
  private collide(d: THREE.Vector3) {
    const blocked = this.options.blocked
    const pos = this.camera.position
    if (!blocked || this.collision === 'pass' || blocked(pos)) return
    if (!blocked(next.copy(pos).add(d))) return
    if (this.collision === 'stop') {
      d.set(0, 0, 0)
      return
    }
    // 軸ごとに動かしてみて、ぶつかる軸だけ止める（建物は軸に沿った箱なので、壁や屋根に沿って滑る）
    next.copy(pos)
    for (const axis of AXES) {
      next[axis] += d[axis]
      if (blocked(next)) {
        next[axis] -= d[axis]
        d[axis] = 0
      }
    }
  }

  private look(dx: number, dy: number) {
    const k = BASE_SENSITIVITY * this.settings.sensitivity
    this.yaw -= dx * k
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -MAX_PITCH, MAX_PITCH)
    this.applyRotation()
    this.onUserInput?.()
  }

  private applyRotation() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  private applyFov() {
    this.camera.fov = this.settings.fov
    this.camera.updateProjectionMatrix()
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    } catch {
      // 設定は残らなくても困らない
    }
  }

  private bindKeys() {
    addEventListener('keydown', (e) => {
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        if (!e.repeat) this.ctrlAlone = !isTyping(e.target)
        return
      }
      this.ctrlAlone = false
      // 入力欄に書いているときや、ショートカット（Ctrl+S など）では動かさない
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      this.keys.add(e.code)
      if (!e.repeat && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) this.cycleSpeed()
    })
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      // Ctrl を単独で押して離したら、ロックを切り替える（keydown のユーザー操作の直後なので requestPointerLock が通る）
      if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && this.ctrlAlone) {
        this.ctrlAlone = false
        this.toggleLock()
      }
    })
    addEventListener('blur', () => this.keys.clear())

    document.addEventListener('pointerlockchange', () => {
      const locked = this.locked
      if (!locked) this.unlockedAt = performance.now()
      this.skipMove = locked
      this.lastMove = 0
      this.pointers.clear()
      this.crosshair.classList.toggle('visible', locked)
      document.body.classList.toggle('fly-locked', locked)
      this.onLockChange?.(locked)
    })
  }

  private bindPointer() {
    const dom = this.dom
    dom.addEventListener('mousemove', (e) => {
      if (!this.locked) return
      const size = Math.hypot(e.movementX, e.movementY)
      if (this.skipMove) {
        this.skipMove = false
        if (size > SPIKE_PX / 4) return
      }
      const spike = size > SPIKE_PX && size > this.lastMove * 4
      this.lastMove = size
      if (!spike) this.look(e.movementX, e.movementY)
    })
    dom.addEventListener('pointerdown', (e) => {
      if (this.locked || (e.pointerType === 'mouse' && e.button !== 0)) return
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.down = { x: e.clientX, y: e.clientY }
      this.pinch = this.pinchDistance()
      dom.setPointerCapture(e.pointerId)
    })
    dom.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId)
      if (!p || this.locked) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      if (this.pointers.size === 1) {
        this.look(dx, dy)
      } else {
        // 2 本指はピンチで前後に進む
        const dist = this.pinchDistance()
        this.dolly((dist - this.pinch) * 0.005 * SPEEDS[this.settings.speed].value)
        this.pinch = dist
      }
    })
    const end = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return
      this.pinch = this.pinchDistance()
      // ドラッグでないクリックでロックに入る（神視点）
      if (this.options.clickToLock && e.type === 'pointerup' && e.pointerType === 'mouse' && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) <= 5) this.lock()
    }
    dom.addEventListener('pointerup', end)
    dom.addEventListener('pointercancel', end)
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        // deltaMode が行単位（Firefox）でも、だいたい同じ量になるように
        const amount = e.deltaY * (e.deltaMode === 1 ? 16 : 1)
        this.dolly(-amount * 0.002 * SPEEDS[this.settings.speed].value)
      },
      { passive: false },
    )
  }

  private pinchDistance(): number {
    if (this.pointers.size < 2) return 0
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
}
