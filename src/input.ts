import type { MoveInput } from './sim/game'

// キーボード（WASD / 矢印）と、画面のどこでも触ったところに出るフローティング仮想スティック。
// カメラは常に -Z 方向を向いている前提で、画面の上 = ワールドの -Z に対応させる。

export class Input {
  private readonly keys = new Set<string>()
  private readonly base: HTMLDivElement
  private readonly knob: HTMLDivElement
  private readonly radius = 56
  private pointerId: number | null = null
  private origin = { x: 0, y: 0 }
  private stick = { x: 0, y: 0 }

  constructor(target: HTMLElement, enableStick: boolean) {
    this.base = document.createElement('div')
    this.base.className = 'stick-base'
    this.knob = document.createElement('div')
    this.knob.className = 'stick-knob'
    this.base.appendChild(this.knob)
    document.body.appendChild(this.base)

    addEventListener('keydown', (e) => this.keys.add(e.code))
    addEventListener('keyup', (e) => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())

    if (!enableStick) return

    target.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return
      this.pointerId = e.pointerId
      this.origin = { x: e.clientX, y: e.clientY }
      this.stick = { x: 0, y: 0 }
      target.setPointerCapture(e.pointerId)
      this.base.style.left = `${e.clientX}px`
      this.base.style.top = `${e.clientY}px`
      this.base.classList.add('visible')
      this.drawKnob()
    })
    target.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return
      const dx = e.clientX - this.origin.x
      const dy = e.clientY - this.origin.y
      const len = Math.hypot(dx, dy)
      const k = len > this.radius ? this.radius / len : 1
      this.stick = { x: (dx * k) / this.radius, y: (dy * k) / this.radius }
      this.drawKnob()
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return
      this.pointerId = null
      this.stick = { x: 0, y: 0 }
      this.base.classList.remove('visible')
    }
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
  }

  private drawKnob() {
    this.knob.style.transform = `translate(${this.stick.x * this.radius}px, ${this.stick.y * this.radius}px)`
  }

  move(): MoveInput {
    let x = 0
    let z = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    const kl = Math.hypot(x, z)
    if (kl > 0) {
      x /= kl
      z /= kl
    }
    x += this.stick.x
    z += this.stick.y
    const len = Math.hypot(x, z)
    return len > 1 ? { x: x / len, z: z / len } : { x, z }
  }
}
