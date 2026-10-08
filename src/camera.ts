import * as THREE from 'three'
import type { MoveInput } from './sim/game'

// カメラ制御。プレイヤーが選ぶ視点（見下ろし／グランドレベル）に、
// 一時的な「全体マップ（俯瞰）」と「演出カット（完成時など）」が上書きで乗る。
// 入力はスクリーン基準で受け取り、ここでカメラの向き（yaw）に合わせてワールド基準へ変換する。

export type ViewMode = 'top' | 'ground'

/** 演出カット。pos から look を見る。duration 秒たったら次のカットへ */
export type Shot = { pos: THREE.Vector3; look: THREE.Vector3; duration: number; onStart?: () => void }

export type RigContext = {
  player: THREE.Vector3
  /** プレイヤーの向き（+Z が 0） */
  facing: number
  /** 入力の強さ 0..1 */
  moving: number
  /** 見下ろし時に注視点を寄せる建物の中心と、その寄せ具合 0..1 */
  focus: THREE.Vector3 | null
  near: number
  /** その点が建物の中なら true（グランドレベルでカメラが建物にめり込まないように） */
  blocked: (p: THREE.Vector3) => boolean
  worldSize: number
}

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

export class CameraRig {
  mode: ViewMode = 'top'
  /** カメラの水平方向の向き。0 で -Z を見る（見下ろしは常に 0） */
  yaw = 0
  overview = false
  /** フォグの距離（俯瞰では遠くまで見せる）。main が scene.fog に反映する */
  readonly fog = { near: 55, far: 140 }

  private shots: Shot[] = []
  private shotTime = 0
  private readonly pos = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private readonly camera: THREE.PerspectiveCamera
  private initialized = false

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  get cinematic(): boolean {
    return this.shots.length > 0
  }

  /** 演出中・俯瞰中はプレイヤーを動かさない */
  get inputLocked(): boolean {
    return this.cinematic || this.overview
  }

  /** 演出が始まってからの経過秒（スキップ可否の判定用） */
  get cinematicElapsed(): number {
    return this.shotTime
  }

  play(shots: Shot[]) {
    this.shots = shots
    this.shotTime = 0
    this.overview = false
    shots[0]?.onStart?.()
  }

  skipCinematic() {
    this.shots = []
  }

  toggleMode() {
    this.mode = this.mode === 'top' ? 'ground' : 'top'
  }

  /** 手動で水平回転（グランドレベル時） */
  turn(amount: number) {
    if (this.mode === 'ground') this.yaw += amount
  }

  /** スクリーン基準の入力（x: 右, z: 下）をワールド基準へ */
  toWorld(v: MoveInput): MoveInput {
    const yaw = this.mode === 'ground' ? this.yaw : 0
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    return { x: v.x * c + v.z * s, z: -v.x * s + v.z * c }
  }

  update(dt: number, ctx: RigContext): void {
    let speed = 4
    const portrait = this.camera.aspect < 1

    if (this.cinematic) {
      this.shotTime += dt
      // 経過時間からいまのカットを決める
      let t = this.shotTime
      let i = 0
      while (i < this.shots.length && t > this.shots[i].duration) t -= this.shots[i++].duration
      if (i >= this.shots.length) {
        this.shots = []
        return this.update(dt, ctx)
      }
      const shot = this.shots[i]
      if (t - dt <= 0 && i > 0) shot.onStart?.()
      tmp.copy(shot.pos)
      tmp2.copy(shot.look)
      speed = 2.2
      this.setFog(70, 220, dt)
    } else if (this.overview) {
      // フィールド全体が画面に収まる距離（縦持ちは横幅で決まるので遠くなる）
      const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2)
      const fit = (ctx.worldSize * 0.58) / (Math.tan(halfFov) * Math.min(this.camera.aspect, 1.3))
      tmp.set(0, fit * 0.86, fit * 0.5)
      tmp2.set(0, 0, -ctx.worldSize * 0.02)
      speed = 3
      this.setFog(fit * 3, fit * 4, dt)
    } else if (this.mode === 'top') {
      // 縦持ちでは少し引く。建物に近づいたら引きつつ注視点を建物へ寄せる
      tmp.set(0, portrait ? 19 : 12, portrait ? 16 : 13).multiplyScalar(1 + ctx.near * (portrait ? 0.6 : 0.45))
      tmp.add(ctx.player)
      tmp2.copy(ctx.player)
      if (ctx.focus) tmp2.lerp(ctx.focus, ctx.near * 0.5)
      tmp2.y += 0.5
      tmp2.z -= 1
      this.yaw = 0
      this.setFog(55, 140, dt)
    } else {
      // グランドレベル：プレイヤーの背後。歩いている方向へゆっくり回り込む（真後ろへ歩くときは回らない）
      const target = ctx.facing + Math.PI
      const diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw))
      if (ctx.moving > 0.1 && Math.abs(diff) < 2.4) this.yaw += diff * Math.min(1, dt * 1.4 * ctx.moving)
      // 縦持ちは横の画角が狭いので、少し高く・遠くから
      const dist = portrait ? 10 : 6.5
      const height = portrait ? 4 : 2.4
      const head = tmp2.copy(ctx.player).setY(ctx.player.y + 1.4)
      tmp.set(Math.sin(this.yaw) * dist, height, Math.cos(this.yaw) * dist).add(head)
      // 建物にめり込むなら、プレイヤー側へ寄せる
      for (let k = 1; k <= 10; k++) {
        const p = new THREE.Vector3().lerpVectors(head, tmp, k / 10)
        if (ctx.blocked(p)) {
          tmp.lerpVectors(head, tmp, Math.max(0.15, (k - 1.5) / 10))
          break
        }
      }
      // 少し先を見る
      tmp2.set(head.x - Math.sin(this.yaw) * 3, head.y + 0.6, head.z - Math.cos(this.yaw) * 3)
      speed = 6
      this.setFog(40, 130, dt)
    }

    if (!this.initialized) {
      this.pos.copy(tmp)
      this.look.copy(tmp2)
      this.initialized = true
    }
    const k = 1 - Math.exp(-dt * speed)
    this.pos.lerp(tmp, k)
    this.look.lerp(tmp2, k)
    this.camera.position.copy(this.pos)
    this.camera.lookAt(this.look)
  }

  private setFog(near: number, far: number, dt: number) {
    const k = 1 - Math.exp(-dt * 3)
    this.fog.near += (near - this.fog.near) * k
    this.fog.far += (far - this.fog.far) * k
  }
}
