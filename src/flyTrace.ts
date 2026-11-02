import * as THREE from 'three'

// 神視点と Editor のカメラが急に飛ぶ不具合（PR #53 で原因を絞り切れなかったもの）を追うための記録。
// 直近 8 秒の入力イベント・フレームごとのカメラの状態・当たり判定で削った動き・雪玉（神視点のみ）を持っておき、1 フレームで大きく向きや位置が変わったら
// 前 5 秒・後 1 秒をテキストにまとめて console に出す。console で flyTrace.dump() を呼べば、その場の直近 5 秒も出せる。

const KEEP_MS = 8000
const BEFORE_MS = 5000
const AFTER_MS = 1000
/** 続けて飛んだときに何度も出さないよう、1 回出したらこの間は検出しない */
const COOLDOWN_MS = 2000

type Entry = { t: number; text: string }

const f = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : String(n))
const deg = (rad: number) => f(THREE.MathUtils.radToDeg(rad))
const vec = (v: THREE.Vector3) => `(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`

export class FlyTrace {
  /** 1 フレームでこれを超えて向き（度）・位置（m）が変わったら、飛んだとみなす */
  thresholds = { degPerFrame: 30, metersPerFrame: 30 }
  /** 最後に console へ出したログ */
  lastDump = ''
  private entries: Entry[] = []
  private readonly prevPos = new THREE.Vector3()
  private readonly prevQuat = new THREE.Quaternion()
  private prevFrameAt = -1
  /** state：検出した瞬間の状態（出力は 1 秒後なので、そのあいだにロックやフォーカスが変わることがある） */
  private pending: { at: number; reason: string; state: string } | null = null
  private lastTriggerAt = -Infinity
  private readonly camera: THREE.PerspectiveCamera
  private readonly header: () => string

  /** header：ログの先頭に付ける、その時点の設定（感度・速度など） */
  constructor(camera: THREE.PerspectiveCamera, header: () => string) {
    this.camera = camera
    this.header = header
    this.bindEvents()
    Object.assign(window, { flyTrace: this })
  }

  log(text: string, t = performance.now()) {
    this.entries.push({ t, text })
  }

  /** フレームの頭で呼ぶ。前のフレームからの変化を見て、飛んでいたら記録を始める */
  /** inside：カメラが建物の中か（当たり判定が無ければ null） */
  frame(dt: number, yaw: number, pitch: number, locked: boolean, inside: boolean | null) {
    const now = performance.now()
    const cam = this.camera
    const rawDt = this.prevFrameAt < 0 ? 0 : now - this.prevFrameAt
    let moved = 0
    let turned = 0
    if (this.prevFrameAt >= 0) {
      moved = cam.position.distanceTo(this.prevPos)
      turned = THREE.MathUtils.radToDeg(cam.quaternion.angleTo(this.prevQuat))
    }
    this.log(
      `frame 間隔=${f(rawDt)}ms dt=${f(dt * 1000)}ms pos=${vec(cam.position)} yaw=${deg(yaw)}° pitch=${deg(pitch)}° 回転=${f(turned)}° 移動=${f(moved, 2)}m${locked ? ' ロック中' : ''}${inside ? ' 建物内' : ''}`,
      now,
    )

    const bad = ![cam.position.x, cam.position.y, cam.position.z, yaw, pitch].every(Number.isFinite)
    const reason = bad
      ? '位置か向きが NaN／Infinity'
      : turned > this.thresholds.degPerFrame
        ? `1 フレームで ${f(turned)}° 回った`
        : moved > this.thresholds.metersPerFrame
          ? `1 フレームで ${f(moved)}m 動いた`
          : null
    if (reason && !this.pending && now - this.lastTriggerAt > COOLDOWN_MS) {
      this.lastTriggerAt = now
      this.pending = { at: now, reason, state: this.state() }
    }
    if (reason) this.log(`★ 飛んだ：${reason}`, now)

    if (this.pending && now - this.pending.at >= AFTER_MS) {
      const { at, reason: r, state } = this.pending
      this.pending = null
      this.output(this.format(r, state, at, at - BEFORE_MS, now))
    }

    this.prevFrameAt = now
    this.prevPos.copy(cam.position)
    this.prevQuat.copy(cam.quaternion)
    const keepFrom = now - KEEP_MS
    let drop = 0
    while (drop < this.entries.length && this.entries[drop].t < keepFrom) drop++
    if (drop > 0) this.entries.splice(0, drop)
  }

  /** 直近 5 秒を console に出す（飛んだのに検出されなかったとき用） */
  dump(): string {
    const now = performance.now()
    return this.output(this.format('手動で出力', this.state(), now, now - BEFORE_MS, now))
  }

  private output(text: string): string {
    this.lastDump = text
    console.warn('[flyTrace] カメラの記録を出力しました。次のログを右クリック→コピーするか、copy(flyTrace.lastDump) でクリップボードに入ります')
    console.log(text)
    return text
  }

  private state(): string {
    return [
      `日時: ${new Date().toISOString()}`,
      `URL: ${location.href}`,
      `UA: ${navigator.userAgent}`,
      `画面: ${innerWidth}x${innerHeight} dpr=${devicePixelRatio} focus=${document.hasFocus()} visibility=${document.visibilityState}`,
      this.header(),
    ].join('\n')
  }

  private format(reason: string, state: string, at: number, from: number, to: number): string {
    const lines = this.entries.filter((e) => e.t >= from && e.t <= to).map((e) => `${(e.t - at >= 0 ? '+' : '') + f(e.t - at)}ms ${e.text}`)
    return [
      `=== flyTrace: ${reason} ===`,
      state,
      `（日時・画面・設定は検出した瞬間のもの。時刻は検出した瞬間からの ms）`,
      ...lines,
      `=== ここまで ===`,
    ].join('\n')
  }

  // 何が届いたかをそのまま見たいので、FlyCamera の処理とは別に window の capture で受ける
  private bindEvents() {
    const opts = { capture: true, passive: true }
    const lag = (e: Event) => {
      const d = performance.now() - e.timeStamp
      return d > 20 ? ` 遅延=${f(d)}ms` : ''
    }
    const target = (e: Event) => (e.target instanceof Element ? e.target.tagName.toLowerCase() : e.target === document ? 'document' : 'window')
    const locked = () => (document.pointerLockElement ? ' ロック中' : '')

    addEventListener(
      'mousemove',
      (e) => this.log(`mousemove movement=(${e.movementX}, ${e.movementY}) client=(${f(e.clientX)}, ${f(e.clientY)}) buttons=${e.buttons} →${target(e)}${locked()}${lag(e)}`),
      opts,
    )
    // マウスは mousemove で見ているので、ここではタッチ・ペンだけ
    addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') this.log(`pointermove ${e.pointerType}#${e.pointerId} client=(${f(e.clientX)}, ${f(e.clientY)})${lag(e)}`)
      },
      opts,
    )
    for (const type of ['pointerdown', 'pointerup', 'pointercancel'] as const) {
      addEventListener(
        type,
        (e) => this.log(`${type} ${e.pointerType}#${e.pointerId} button=${e.button} client=(${f(e.clientX)}, ${f(e.clientY)}) →${target(e)}${locked()}`),
        opts,
      )
    }
    addEventListener('wheel', (e) => this.log(`wheel deltaY=${f(e.deltaY)} mode=${e.deltaMode} →${target(e)}`), opts)
    for (const type of ['keydown', 'keyup'] as const) {
      addEventListener(type, (e) => this.log(`${type} ${e.code}${e.repeat ? ' repeat' : ''}${e.ctrlKey ? ' ctrl' : ''}${e.shiftKey ? ' shift' : ''}`), opts)
    }
    document.addEventListener('pointerlockchange', () => this.log(`pointerlockchange → ${document.pointerLockElement ? 'ロック' : '解除'}`), opts)
    document.addEventListener('pointerlockerror', () => this.log('pointerlockerror'), opts)
    document.addEventListener('visibilitychange', () => this.log(`visibilitychange → ${document.visibilityState}`), opts)
    // capture で受けると入力欄の blur・focus も届くので、window 自体のものだけ
    addEventListener('blur', (e) => e.target === window && this.log('window blur'), opts)
    addEventListener('focus', (e) => e.target === window && this.log('window focus'), opts)
    addEventListener('resize', () => this.log(`resize ${innerWidth}x${innerHeight}`), opts)
  }
}
