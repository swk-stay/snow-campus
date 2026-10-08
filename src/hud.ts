// 画面上部のステータス表示とトースト。DOM で十分なので Three.js には載せない。

export class Hud {
  private readonly snowFill: HTMLDivElement
  private readonly snowText: HTMLSpanElement
  private readonly buildFill: HTMLDivElement
  private readonly buildText: HTMLSpanElement
  private readonly toastEl: HTMLDivElement
  private toastTimer = 0

  constructor(root: HTMLElement) {
    const hud = document.createElement('div')
    hud.id = 'hud'
    hud.innerHTML = `
      <div class="hud-row"><span class="hud-label">雪</span><div class="bar"><div class="fill snow"></div></div><span class="hud-value" data-snow></span></div>
      <div class="hud-row"><span class="hud-label">校舎</span><div class="bar"><div class="fill build"></div></div><span class="hud-value" data-build></span></div>
    `
    root.appendChild(hud)
    this.snowFill = hud.querySelector('.fill.snow')!
    this.snowText = hud.querySelector('[data-snow]')!
    this.buildFill = hud.querySelector('.fill.build')!
    this.buildText = hud.querySelector('[data-build]')!

    this.toastEl = document.createElement('div')
    this.toastEl.id = 'toast'
    root.appendChild(this.toastEl)
  }

  update(carried: number, capacity: number, buildProgress: number) {
    this.snowFill.style.width = `${(carried / capacity) * 100}%`
    this.snowText.textContent = `${Math.floor(carried)}/${capacity}`
    this.buildFill.style.width = `${buildProgress * 100}%`
    this.buildText.textContent = `${Math.floor(buildProgress * 100)}%`
  }

  toast(text: string, ms = 2500) {
    this.toastEl.textContent = text
    this.toastEl.classList.add('visible')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('visible'), ms)
  }
}
