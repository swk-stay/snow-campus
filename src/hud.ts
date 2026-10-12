// 画面上部のステータス表示とトースト。DOM で十分なので Three.js には載せない。

export class Hud {
  readonly el: HTMLDivElement
  private readonly snowFill: HTMLDivElement
  private readonly snowText: HTMLSpanElement
  private readonly buildFill: HTMLDivElement
  private readonly buildText: HTMLSpanElement
  private readonly buildLabel: HTMLSpanElement
  private readonly goldText: HTMLSpanElement
  private readonly rareText: HTMLSpanElement
  private shownGold = 0
  private readonly toastEl: HTMLDivElement
  private toastTimer = 0

  constructor(root: HTMLElement) {
    const hud = document.createElement('div')
    hud.id = 'hud'
    hud.innerHTML = `
      <div class="hud-row"><span class="hud-label">雪</span><div class="bar"><div class="fill snow"></div></div><span class="hud-value" data-snow></span></div>
      <div class="hud-row"><span class="hud-label" data-build-label></span><div class="bar"><div class="fill build"></div></div><span class="hud-value" data-build></span></div>
      <div class="hud-gold"><span class="coin"></span><span data-gold>0</span> G<span class="hud-rare" data-rare hidden></span></div>
    `
    root.appendChild(hud)
    this.el = hud
    this.buildLabel = hud.querySelector('[data-build-label]')!
    this.goldText = hud.querySelector('[data-gold]')!
    this.rareText = hud.querySelector('[data-rare]')!
    this.snowFill = hud.querySelector('.fill.snow')!
    this.snowText = hud.querySelector('[data-snow]')!
    this.buildFill = hud.querySelector('.fill.build')!
    this.buildText = hud.querySelector('[data-build]')!

    this.toastEl = document.createElement('div')
    this.toastEl.id = 'toast'
    root.appendChild(this.toastEl)
  }

  update(dt: number, carried: number, capacity: number, buildLabel: string, buildProgress: number, gold: number, rare: number) {
    this.rareText.hidden = rare === 0
    const rareLabel = `レア雪 ×${rare}`
    if (this.rareText.textContent !== rareLabel) this.rareText.textContent = rareLabel
    // ゴールドはカウントアップ表示
    this.shownGold += (gold - this.shownGold) * Math.min(1, dt * 8)
    if (Math.abs(gold - this.shownGold) < 0.5) this.shownGold = gold
    this.goldText.textContent = `${Math.floor(this.shownGold)}`
    this.buildLabel.textContent = buildLabel
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
