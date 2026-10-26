import { formatTime } from './timeAttack'

// マルチプレイの一区切り（issue #92）。中庭まわりの 8 棟（タイムアタックと同じ並びで、最後は K1号館）が建ったら、
// ルームで遊んだ時間をカードで出す。閉じたら残りの棟へ進む。
// 観戦の端末は会場のモニターで誰も触らないことがあるので、ボタンを出さずにしばらくして閉じる

const SPECTATOR_SECONDS = 10

export class MilestoneCard {
  private readonly el: HTMLDivElement
  private readonly spectator: boolean
  private onClose = () => {}

  constructor(root: HTMLElement, spectator: boolean) {
    this.spectator = spectator
    this.el = document.createElement('div')
    this.el.id = 'milestone'
    this.el.hidden = true
    root.appendChild(this.el)
  }

  get open(): boolean {
    return !this.el.hidden
  }

  /** next は次に建てる建物の名前 */
  show(playTime: number, next: string | null, onClose: () => void) {
    this.onClose = onClose
    this.el.innerHTML = `
      <div class="ta-card">
        <h2>中庭まわりが復活！</h2>
        <div class="ta-final">${formatTime(playTime)}</div>
        <div class="ta-sub">このルームで遊んだ時間</div>
        ${next ? `<p class="ms-next">ここからはキャンパス全体へ。次は「${next}」</p>` : ''}
        ${this.spectator ? '' : '<div class="ta-actions"><button data-close>続ける</button></div>'}
      </div>`
    this.el.querySelector('[data-close]')?.addEventListener('click', () => this.close())
    this.el.hidden = false
    if (this.spectator) setTimeout(() => this.close(), SPECTATOR_SECONDS * 1000)
  }

  private close() {
    if (this.el.hidden) return
    this.el.hidden = true
    this.onClose()
  }
}
