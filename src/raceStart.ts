import type { RaceSync } from './net/protocol'

// マルチプレイのよーいドン（issue #112）。ルームは参加者がそろうまで止まっていて、誰かが「スタート」を押すと
// サーバーが秒読みを始め、全員の画面で同時にカウントダウンが出る。状態はサーバーの RaceSync をそのまま映す。
// 観戦の端末は会場のモニターで誰も触らないことがあるので、ボタンを出さずに待つだけにする

export class RaceStart {
  private readonly card: HTMLDivElement
  private readonly count: HTMLSpanElement
  private readonly startButton: HTMLButtonElement | null
  private readonly countdownEl: HTMLDivElement
  private phase: RaceSync['phase'] | null = null

  constructor(root: HTMLElement, spectator: boolean, actions: { start: () => void; leave: () => void }) {
    this.card = document.createElement('div')
    this.card.id = 'race-wait'
    this.card.hidden = true
    this.card.innerHTML = `
      <div class="ta-card">
        <h2>参加者を待っています</h2>
        <div class="ta-final"><span class="rw-count"></span><small>人</small></div>
        <div class="ta-sub">${spectator ? 'プレイヤーがスタートすると、タイムアタックが始まります' : 'みんながそろったらスタート！ K1号館が完成するまでのタイムを計ります'}</div>
        ${spectator ? '' : '<div class="ta-actions"><button data-start>スタート</button><button data-leave>ルームから抜ける</button></div>'}
      </div>`
    root.appendChild(this.card)
    this.count = this.card.querySelector('.rw-count')!
    this.startButton = this.card.querySelector('[data-start]')
    this.startButton?.addEventListener('click', () => {
      // 押したことが分かるように、サーバーの秒読みが届くまで押せなくしておく
      this.startButton!.disabled = true
      actions.start()
    })
    this.card.querySelector('[data-leave]')?.addEventListener('click', actions.leave)

    this.countdownEl = document.createElement('div')
    this.countdownEl.id = 'ta-countdown'
    root.appendChild(this.countdownEl)
  }

  /** スタートするまで（待っている間と秒読みの間）は操作できない */
  get locked(): boolean {
    return this.phase !== 'running'
  }

  /** 毎フレーム呼ぶ。players はいまルームにいるプレイヤーの数 */
  update(race: RaceSync, players: number) {
    const prev = this.phase
    this.phase = race.phase
    this.card.hidden = race.phase !== 'waiting'
    const n = String(players)
    if (this.count.textContent !== n) this.count.textContent = n
    if (race.phase === 'waiting') {
      if (prev !== 'waiting' && this.startButton) this.startButton.disabled = false
      this.showCountdown('', false)
    } else if (race.phase === 'countdown') {
      this.showCountdown(`${Math.max(1, Math.ceil(race.countdown))}`, false)
    } else if (prev === 'countdown') {
      // 走っている最中に入ってきた人には出さない
      this.showCountdown('スタート！', true)
    }
  }

  private showCountdown(text: string, go: boolean) {
    if (this.countdownEl.textContent === text) return
    this.countdownEl.textContent = text
    this.countdownEl.classList.toggle('go', go)
    // 数字が変わるたびにアニメーションをやり直す
    this.countdownEl.classList.remove('tick')
    void this.countdownEl.offsetWidth
    if (text) this.countdownEl.classList.add('tick')
  }
}
