import { TIME_ATTACK } from './config'

// タイムアタック（?mode=timeattack）。セーブとは別の新しいゲームで、建物を順に完成させるまでのタイムを計る。
// - タイムはゲーム内時間（毎フレームの dt の合計）。タブを離れている間や、低 fps で dt が頭打ちになった分は進まない
//   （そのぶんゲームの進みも遅くなるので、端末の性能差で不公平にならない）。
// - 区間タイム（スプリット）は「見た目上の完成」＝完成演出の開始で取る。sim の completed は雪玉を投げた瞬間に立つので使わない。
// - 記録は localStorage（端末ごと）。学園祭で1台を回して遊ぶ想定で、上位数件とベスト記録の区間タイムを残す。

const KEY = 'snow-campus-timeattack-v1'

type Run = { time: number; at: number }
/** ゴール（完成させる建物の並び）ごとの記録 */
type Board = { runs: Run[]; bestSplits: number[] }

export type GoalBuilding = { id: string; label: string }
export type TimeAttackActions = { retry: () => void; quit: () => void }

// localStorage はプライベートモードなどで例外を投げることがあるので、全部 try/catch で包む
function loadBoards(): Record<string, Board> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Board>
  } catch {
    return {}
  }
}

function saveBoards(boards: Record<string, Board>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(boards))
  } catch {
    // 記録が残らないだけで、遊ぶのには困らない
  }
}

/** 1:23.45 の形式 */
export function formatTime(t: number): string {
  const cs = Math.floor(t * 100)
  const m = Math.floor(cs / 6000)
  const s = Math.floor(cs / 100) % 60
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}

/** ベストとの差。1分未満は秒だけ（−2.10 / +0.35） */
function formatDiff(d: number): string {
  const sign = d < 0 ? '−' : '+'
  const abs = Math.abs(d)
  return sign + (abs < 60 ? abs.toFixed(2) : formatTime(abs))
}

export class TimeAttack {
  phase: 'countdown' | 'running' | 'finished' = 'countdown'
  /** 経過時間（ゲーム内の秒） */
  elapsed = 0
  private countdown = TIME_ATTACK.countdown
  private readonly splits: number[] = []
  private readonly key: string
  /** 開始時点の記録（区間タイムの比較用。ゴールした後で書き換えても比較は前のベストと） */
  private readonly prev: Board
  private resultShown = false
  private splitTimer = 0

  private readonly timeEl: HTMLSpanElement
  private readonly splitEl: HTMLSpanElement
  private readonly countdownEl: HTMLDivElement
  private readonly resultEl: HTMLDivElement

  private readonly goal: GoalBuilding[]
  private readonly actions: TimeAttackActions

  /** anchor（HUD）のすぐ下にタイマーを置く。上中央は建設中の建物のラベルと重なるため */
  constructor(root: HTMLElement, anchor: HTMLElement, goal: GoalBuilding[], actions: TimeAttackActions) {
    this.goal = goal
    this.actions = actions
    this.key = goal.map((b) => b.id).join(',')
    const board = loadBoards()[this.key]
    this.prev = { runs: board?.runs ?? [], bestSplits: board?.bestSplits ?? [] }

    const timer = document.createElement('div')
    timer.id = 'ta-timer'
    const best = this.prev.runs[0]
    const goalLabel = goal.length === 1 ? goal[0].label : `${goal[goal.length - 1].label}まで ${goal.length}棟`
    timer.innerHTML = `
      <span class="ta-head">タイムアタック・${goalLabel}</span>
      <span class="ta-time">${formatTime(0)}</span>
      <span class="ta-best">${best ? `ベスト ${formatTime(best.time)}` : 'ベスト なし'}</span>
      <span class="ta-split"></span>`
    root.appendChild(timer)
    // HUD の高さは画面幅（フォントサイズ）で変わるので、実測して追従する
    new ResizeObserver(() => (timer.style.top = `${anchor.getBoundingClientRect().bottom + 8}px`)).observe(anchor)
    this.timeEl = timer.querySelector('.ta-time')!
    this.splitEl = timer.querySelector('.ta-split')!

    this.countdownEl = document.createElement('div')
    this.countdownEl.id = 'ta-countdown'
    root.appendChild(this.countdownEl)

    this.resultEl = document.createElement('div')
    this.resultEl.id = 'ta-result'
    this.resultEl.hidden = true
    root.appendChild(this.resultEl)

    document.body.classList.add('time-attack')
  }

  /** カウントダウン中は操作もゲームの進行も止める */
  get locked(): boolean {
    return this.phase === 'countdown'
  }

  /** 毎フレーム呼ぶ。結果画面は完成演出が終わってから出す */
  update(dt: number, cinematic: boolean) {
    if (this.phase === 'countdown') {
      this.countdown -= dt
      if (this.countdown <= 0) {
        this.phase = 'running'
        this.showCountdown('スタート！', true)
      } else {
        this.showCountdown(`${Math.ceil(this.countdown)}`, false)
      }
    } else if (this.phase === 'running') {
      this.elapsed += dt
    } else if (!this.resultShown && !cinematic) {
      this.resultShown = true
      this.resultEl.hidden = false
    }

    const text = formatTime(this.elapsed)
    if (this.timeEl.textContent !== text) this.timeEl.textContent = text
    if (this.splitTimer > 0) {
      this.splitTimer -= dt
      if (this.splitTimer <= 0) this.splitEl.classList.remove('visible')
    }
  }

  /** 建物の完成演出が始まったときに呼ぶ。ゴールの建物を全部完成させたらタイムを確定する */
  complete(buildingId: string) {
    if (this.phase !== 'running') return
    const i = this.splits.length
    if (this.goal[i]?.id !== buildingId) return
    this.splits.push(this.elapsed)

    const best = this.prev.bestSplits[i]
    const diff = best === undefined ? '' : ` <b class="${this.elapsed < best ? 'ahead' : 'behind'}">${formatDiff(this.elapsed - best)}</b>`
    this.splitEl.innerHTML = `${this.goal[i].label} ${formatTime(this.elapsed)}${diff}`
    this.splitEl.classList.add('visible')
    this.splitTimer = 5

    if (this.splits.length === this.goal.length) this.finish()
  }

  private finish() {
    this.phase = 'finished'
    const time = this.elapsed
    const run: Run = { time, at: Date.now() }
    const prevBest = this.prev.runs[0]?.time
    const isBest = prevBest === undefined || time < prevBest

    const boards = loadBoards()
    const runs = [...(boards[this.key]?.runs ?? []), run].sort((a, b) => a.time - b.time).slice(0, TIME_ATTACK.keepRuns)
    boards[this.key] = { runs, bestSplits: isBest ? [...this.splits] : (boards[this.key]?.bestSplits ?? []) }
    saveBoards(boards)

    const splitRows = this.goal
      .map((b, i) => {
        const t = this.splits[i]
        const best = this.prev.bestSplits[i]
        const diff = best === undefined ? '' : `<span class="${t < best ? 'ahead' : 'behind'}">${formatDiff(t - best)}</span>`
        return `<tr><td>${b.label}</td><td>${formatTime(t)}</td><td>${diff}</td></tr>`
      })
      .join('')
    const runRows = runs
      .map((r, i) => `<li class="${r === run ? 'me' : ''}"><span>${i + 1}位</span><span>${formatTime(r.time)}</span><small>${formatDate(r.at)}</small></li>`)
      .join('')
    this.resultEl.innerHTML = `
      <div class="ta-card">
        <h2>${isBest ? '新記録！' : 'クリア！'}</h2>
        <div class="ta-final">${formatTime(time)}</div>
        <div class="ta-sub">${prevBest === undefined ? 'はじめての記録' : isBest ? `これまでのベスト ${formatTime(prevBest)}（${formatDiff(time - prevBest)}）` : `ベスト ${formatTime(prevBest)}（${formatDiff(time - prevBest)}）`}</div>
        <table class="ta-splits">${splitRows}</table>
        <h3>この端末の記録</h3>
        <ol class="ta-runs">${runRows}</ol>
        <div class="ta-actions"><button data-retry>もう一度</button><button data-quit>通常モードへ</button></div>
      </div>`
    this.resultEl.querySelector('[data-retry]')!.addEventListener('click', this.actions.retry)
    this.resultEl.querySelector('[data-quit]')!.addEventListener('click', this.actions.quit)
  }

  private showCountdown(text: string, go: boolean) {
    if (this.countdownEl.textContent === text) return
    this.countdownEl.textContent = text
    this.countdownEl.classList.toggle('go', go)
    // 数字が変わるたびにアニメーションをやり直す
    this.countdownEl.classList.remove('tick')
    void this.countdownEl.offsetWidth
    this.countdownEl.classList.add('tick')
  }
}

function formatDate(at: number): string {
  const d = new Date(at)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
