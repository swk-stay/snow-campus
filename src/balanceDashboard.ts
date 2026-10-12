import { ECONOMY, ITEMS, PLAYER, UPGRADE_EFFECT, UPGRADES, type ItemId, type UpgradeId } from './config'
import { diskYield, rateForYield, theory } from './sim/balance'
import { canBuyItem, currentBuilding, itemCost, maxLevel, upgradeCost, type GameEvent, type GameState } from './sim/game'
import { diffText, isChanged, resetTuning, saveTuning, TUNABLE, TUNABLES, type Tunable, type TuneValue } from './tuning'

// バランス調整ダッシュボード（?balance）。画面の右側に常駐し、B キーで開閉する。
// - 実測：直近 30 秒（ゲーム内時間）の SPS（Snow per sec）・G/秒と、建物ごとの完成時刻
// - レート：SPS を直接入力すると、元のパラメータ（削る速さ・投げる間隔など）を逆算して書き換える
// - 建物・アップグレード・アイテム・その他の値の編集と、config.ts へ書き戻すための差分
// 調整した値は localStorage に残る（tuning.ts）。ゲーム速度（一時停止・早回し）もここで変える。

/** 実測の窓（ゲーム内の秒数）。1 秒ごとのバケツに分けて持つ */
const WINDOW = 30
const SPEEDS = [0, 1, 2, 4, 8]
const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[]
const ITEM_IDS = Object.keys(ITEMS) as ItemId[]

type Bucket = { collect: number; player: number; plow: number; rare: number; gold: number }
const emptyBucket = (): Bucket => ({ collect: 0, player: 0, plow: 0, rare: 0, gold: 0 })

export class BalanceDashboard {
  /** 1 フレームに stepGame を何回回すか（0 で一時停止） */
  timeScale = 1
  private readonly panel: HTMLElement
  private readonly toggleButton: HTMLButtonElement
  private readonly refreshers: (() => void)[] = []
  private refreshTimer = 0

  private buckets: Bucket[] = []
  private bucketTime = 0
  /** 計測を始めてからのゲーム内時間 */
  private elapsed = 0
  private lastCollected: number
  private readonly completedAt = new Map<string, number>()
  private readonly s: GameState

  constructor(root: HTMLElement, s: GameState) {
    this.s = s
    this.lastCollected = s.totalCollected
    this.resetMetrics()

    this.panel = el('aside', { id: 'balance' })
    const speed = el('span', { class: 'bal-speed' })
    for (const n of SPEEDS) {
      const b = el('button', {}, n === 0 ? '⏸' : `×${n}`) as HTMLButtonElement
      b.title = n === 0 ? '一時停止' : `ゲーム速度 ×${n}`
      b.addEventListener('click', () => (this.timeScale = n))
      this.refreshers.push(() => b.classList.toggle('active', this.timeScale === n))
      speed.appendChild(b)
    }
    const close = el('button', { class: 'bal-close', title: 'B で開閉' }, '×')
    close.addEventListener('click', () => this.toggle(false))
    this.panel.append(el('header', {}, el('b', {}, 'バランス調整'), speed, close))

    const body = el('div', { class: 'bal-body' })
    body.append(this.metricsSection(), this.rateSection(), this.buildingSection(), this.upgradeSection(), this.itemSection(), this.otherSection(), this.diffSection())
    this.panel.appendChild(body)
    // 入力中のキーをゲーム側（移動・ショップ・スキル）に渡さない
    for (const type of ['keydown', 'keyup'] as const) this.panel.addEventListener(type, (e) => e.stopPropagation())
    root.appendChild(this.panel)

    this.toggleButton = el('button', { id: 'balance-toggle' }, '調整 ', el('kbd', {}, 'B')) as HTMLButtonElement
    this.toggleButton.addEventListener('click', () => this.toggle(true))
    root.appendChild(this.toggleButton)

    addEventListener('keydown', (e) => e.code === 'KeyB' && !e.repeat && this.toggle())
    this.toggle(true)
    this.refresh()
  }

  toggle(open = !document.body.classList.contains('balance-open')) {
    document.body.classList.toggle('balance-open', open)
    // ゲーム画面の幅が変わるので、レンダラーのサイズを合わせ直してもらう
    dispatchEvent(new Event('resize'))
  }

  /** 毎フレーム、そのフレームのイベントと進んだゲーム内時間を渡す */
  record(events: GameEvent[], dt: number) {
    this.elapsed += dt
    let b = this.buckets[this.buckets.length - 1]
    // 回収はブリザードの分も含めたいので、イベントではなく累計の差分で数える
    b.collect += this.s.totalCollected - this.lastCollected
    this.lastCollected = this.s.totalCollected
    for (const e of events) {
      if (e.type === 'gold') b.gold += e.amount
      else if (e.type === 'throw') {
        if (e.from) b.plow += e.amount
        else if (e.rare) b.rare += e.amount
        else b.player += e.amount
      } else if (e.type === 'complete') this.completedAt.set(e.buildingId, this.elapsed)
    }
    this.bucketTime += dt
    while (this.bucketTime >= 1) {
      this.bucketTime -= 1
      b = emptyBucket()
      this.buckets.push(b)
      if (this.buckets.length > WINDOW) this.buckets.shift()
    }
  }

  /** 毎フレーム呼んでよい（表示の更新は 0.25 秒ごと） */
  update(dt: number) {
    this.refreshTimer -= dt
    if (this.refreshTimer > 0) return
    this.refreshTimer = 0.25
    this.refresh()
    // lil-gui（?debug）で変えた値も拾えるように、ここで保存する
    saveTuning()
  }

  private refresh() {
    for (const fn of this.refreshers) fn()
  }

  private resetMetrics() {
    this.buckets = [emptyBucket()]
    this.bucketTime = 0
    this.elapsed = 0
    this.completedAt.clear()
  }

  /** 直近の窓での 1 秒あたりの量 */
  private rate(key: keyof Bucket): number {
    const span = Math.min(this.elapsed, this.buckets.length - 1 + this.bucketTime)
    if (span <= 0) return 0
    return this.buckets.reduce((sum, b) => sum + b[key], 0) / span
  }

  // ---- セクション ----

  private metricsSection(): HTMLElement {
    const reset = el('button', { class: 'bal-small' }, '計測リセット')
    reset.addEventListener('click', () => this.resetMetrics())
    const deposit = () => this.rate('player') + this.rate('plow') + this.rate('rare')
    return section(
      `実測（直近 ${WINDOW} 秒・ゲーム内時間）`,
      grid(
        ['経過時間', this.text(() => time(this.elapsed)), reset],
        ['回収 SPS', this.text(() => num(this.rate('collect'))), this.text(() => `累計 ${num(this.s.totalCollected)}`)],
        ['寄付 SPS', this.text(() => num(deposit())), this.text(() => `自分 ${num(this.rate('player'))} / 除雪機 ${num(this.rate('plow'))} / レア ${num(this.rate('rare'))}`)],
        ['G / 秒', this.text(() => num(this.rate('gold'))), this.text(() => `所持 ${num(this.s.gold)} G`)],
        [
          this.text(() => `${currentBuilding(this.s)?.label ?? '全部'} 完成まで`),
          this.text(() => {
            const b = currentBuilding(this.s)
            if (!b) return '完成済み'
            const sps = deposit()
            return sps > 0 ? time((b.required - b.deposited) / sps) : '—'
          }),
          this.text(() => {
            const b = currentBuilding(this.s)
            return b ? `残り ${num(b.required - b.deposited)}（いまの寄付 SPS のまま）` : ''
          }),
        ],
        ['雪原の残り', this.text(() => num(this.s.field.total())), this.text(() => `Tier ${this.s.tier}`)],
      ),
    )
  }

  private rateSection(): HTMLElement {
    const plow = UPGRADE_EFFECT.plow
    const th = () => theory(this.s)
    return section(
      'レート（SPS は雪が十分ある場所での上限）',
      el('p', { class: 'bal-note' }, '左が基礎値（Lv0）、右がいまのアップグレード込み。SPS を入れると元のパラメータを逆算する'),
      grid(
        [
          '回収 SPS',
          this.derivedInput(
            () => diskYield(PLAYER.collectRadius, PLAYER.collectRate, PLAYER.collectArc),
            (v) => TUNABLE.get('PLAYER.collectRate')!.set(sig(rateForYield(PLAYER.collectRadius, v, PLAYER.collectArc))),
            1,
            'PLAYER.collectRate',
          ),
          this.text(() => `${num(th().collect)}（半径 ${num(th().collectRadius)}m・${PLAYER.collectArc}°）`),
        ],
        [
          '投げ込み SPS',
          this.derivedInput(
            () => PLAYER.throwChunk / PLAYER.throwInterval,
            (v) => TUNABLE.get('PLAYER.throwInterval')!.set(sig(PLAYER.throwChunk / v)),
            1,
            'PLAYER.throwInterval',
          ),
          this.text(() => num(th().throwRate)),
        ],
        [
          '所持上限',
          this.tuneInput(TUNABLE.get('PLAYER.capacity')!),
          this.text(() => `${th().capacity}（満タンまで ${num(th().fillTime)}秒 / 投げ切り ${num(th().dumpTime)}秒）`),
        ],
        [
          '除雪機 SPS/台',
          this.derivedInput(
            () => diskYield(plow.radius, plow.rate),
            (v) => TUNABLE.get('UPGRADE_EFFECT.plow.rate')!.set(sig(rateForYield(plow.radius, v))),
            1,
            'UPGRADE_EFFECT.plow.rate',
          ),
          this.text(() => `×${th().plows}台 = ${num(th().plows * th().plowEach)}`),
        ],
        ['雪1あたりのG', this.tuneInput(TUNABLE.get('ECONOMY.goldPerSnow')!), this.text(() => `回収 SPS 上限で ${num(th().collect * ECONOMY.goldPerSnow)} G/秒`)],
        ['価格の倍率', this.tuneInput(TUNABLE.get('ECONOMY.costScale')!), el('span', { class: 'bal-dim' }, 'アップグレード・アイテム全部')],
        [
          '必要量の倍率',
          this.tuneInput(TUNABLE.get('ECONOMY.requiredScale')!),
          this.text(() => `全建物の合計 ${num(this.s.buildings.reduce((sum, b) => sum + b.required, 0))}`),
        ],
      ),
    )
  }

  private buildingSection(): HTMLElement {
    const table = el('table', { class: 'bal-table' })
    table.appendChild(el('tr', {}, el('th', {}, '建物'), el('th', {}, '必要量'), el('th', {}, '倍率込み'), el('th', {}, '進捗'), el('th', {}, '完成')))
    this.s.buildings.forEach((b) => {
      table.appendChild(
        el(
          'tr',
          {},
          el('td', {}, b.label),
          el('td', {}, this.tuneInput(TUNABLE.get(`BUILDINGS.${b.id}.required`)!)),
          el('td', {}, this.text(() => `${b.required}`)),
          el('td', {}, this.text(() => (b.completed ? '完成' : b === currentBuilding(this.s) ? `${Math.floor((b.deposited / b.required) * 100)}%` : '—'))),
          el('td', {}, this.text(() => {
            const at = this.completedAt.get(b.id)
            return at === undefined ? '' : time(at)
          })),
        ),
      )
    })
    return section('建物', table, el('p', { class: 'bal-note' }, '完成時刻は計測を始めてからのゲーム内時間'))
  }

  private upgradeSection(): HTMLElement {
    const list = el('div', { class: 'bal-cards' })
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id]
      list.appendChild(
        el(
          'div',
          { class: 'bal-card' },
          el(
            'div',
            { class: 'bal-card-head' },
            el('b', {}, def.label),
            this.text(() => `Lv ${this.s.upgrades[id]}/${maxLevel(this.s, id)}`),
            this.text(() => `次 ${upgradeCost(this.s, id)} G`),
            this.text(() => `上限まで計 ${costToMax(this.s, id)} G`),
          ),
          el('div', { class: 'bal-effect' }, this.text(() => effectText(this.s, id))),
          el(
            'div',
            { class: 'bal-inline' },
            el('label', {}, '基本価格', this.tuneInput(TUNABLE.get(`UPGRADES.${id}.baseCost`)!)),
            el('label', {}, '伸び', this.tuneInput(TUNABLE.get(`UPGRADES.${id}.growth`)!)),
            el('label', { class: 'wide' }, 'Tierごとの上限', this.tuneInput(TUNABLE.get(`UPGRADES.${id}.maxLevel`)!)),
          ),
        ),
      )
    }
    return section('アップグレード', el('p', { class: 'bal-note' }, '価格 = 基本価格 × 伸び^Lv × 価格の倍率。効果は「いま → 次のLv」'), list)
  }

  private itemSection(): HTMLElement {
    const list = el('div', { class: 'bal-cards' })
    for (const id of ITEM_IDS) {
      list.appendChild(
        el(
          'div',
          { class: 'bal-card' },
          el(
            'div',
            { class: 'bal-card-head' },
            el('b', {}, ITEMS[id].label),
            this.text(() => ({ ok: '購入できる', owned: '入手済み', locked: '🔒 未解禁', gold: 'G不足' })[canBuyItem(this.s, id)]),
            this.text(() => `${itemCost(id)} G`),
          ),
          el(
            'div',
            { class: 'bal-inline' },
            el('label', {}, '価格', this.tuneInput(TUNABLE.get(`ITEMS.${id}.cost`)!)),
            el('label', {}, '解禁Tier', this.tuneInput(TUNABLE.get(`ITEMS.${id}.unlock.tier`)!, true)),
            el('label', {}, '解禁の累計', this.tuneInput(TUNABLE.get(`ITEMS.${id}.unlock.collected`)!, true)),
          ),
        ),
      )
    }
    return section('アイテム', el('p', { class: 'bal-note' }, '解禁条件は空欄で「条件なし」'), list)
  }

  /** 上のセクションに出していない値をグループごとに並べる */
  private otherSection(): HTMLElement {
    const shown = new Set(['経済', '建物', 'アップグレード', 'アイテム'])
    const groups = new Map<string, Tunable[]>()
    for (const t of TUNABLES) if (!shown.has(t.group)) groups.set(t.group, [...(groups.get(t.group) ?? []), t])
    const details = section('その他のパラメータ')
    for (const [group, ts] of groups) {
      details.append(el('h4', {}, group), grid(...ts.map((t) => [t.label, this.tuneInput(t)] as Cell[])))
    }
    details.open = false
    return details
  }

  private diffSection(): HTMLElement {
    const pre = el('pre', { class: 'bal-diff' })
    const count = el('span', { class: 'bal-dim' })
    this.refreshers.push(() => {
      const text = diffText()
      setText(pre, text || '（config.ts から変えた値はまだない）')
      setText(count, `${text ? text.split('\n').length : 0} 件`)
    })
    const copy = el('button', { class: 'bal-small' }, 'コピー')
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(diffText())
        copy.textContent = 'コピーした'
      } catch {
        // クリップボードが使えない環境では選択だけしておく
        getSelection()?.selectAllChildren(pre)
        copy.textContent = '選択した'
      }
      setTimeout(() => (copy.textContent = 'コピー'), 1500)
    })
    const reset = el('button', { class: 'bal-small danger' }, '全部 config.ts の値に戻す')
    reset.addEventListener('click', () => {
      if (!confirm('調整した値を全部 config.ts の値に戻しますか？')) return
      resetTuning()
      this.refresh()
    })
    return section('変更した値（config.ts へ書き戻す）', el('div', { class: 'bal-inline' }, count, copy, reset), pre)
  }

  // ---- 部品 ----

  /** 0.25 秒ごとに書き換わるテキスト */
  private text(fn: () => string): HTMLElement {
    const span = el('span')
    this.refreshers.push(() => setText(span, fn()))
    return span
  }

  private tuneInput(t: Tunable, optional = false): HTMLInputElement {
    return this.input(() => t.get(), (v) => t.set(v), t.step, { optional, changed: () => isChanged(t), title: t.path })
  }

  /** SPS など、元のパラメータから計算した値を直接編集する入力。changedPath は書き換え先（変更済みの印に使う） */
  private derivedInput(get: () => number, set: (v: number) => void, step: number, changedPath: string): HTMLInputElement {
    const t = TUNABLE.get(changedPath)!
    return this.input(get, (v) => typeof v === 'number' && v > 0 && set(v), step, { changed: () => isChanged(t), title: `${changedPath} を逆算して書き換える` })
  }

  private input(
    get: () => TuneValue,
    set: (v: TuneValue) => void,
    step: number,
    opts: { optional?: boolean; changed: () => boolean; title: string },
  ): HTMLInputElement {
    const isArray = Array.isArray(get())
    const input = el('input', { class: 'bal-input', title: opts.title }) as HTMLInputElement
    input.type = isArray ? 'text' : 'number'
    if (!isArray) {
      input.step = `${step}`
      input.min = '0'
    }
    input.addEventListener('change', () => {
      const v = parse(input.value, isArray, opts.optional ?? false)
      if (v !== null) set(v)
      saveTuning()
      input.blur()
      this.refresh()
    })
    this.refreshers.push(() => {
      input.classList.toggle('changed', opts.changed())
      if (document.activeElement !== input) setValue(input, format(get()))
    })
    return input
  }
}

// ---- 計算 ----

/** 次のレベルの効果を「いま → 次」で。SPS が増えるものは 100G あたりの増分（コスパ）も出す */
function effectText(s: GameState, id: UpgradeId): string {
  const a = theory(s)
  const b = theory(s, { ...s.upgrades, [id]: s.upgrades[id] + 1 })
  const perGold = (delta: number) => `（100G あたり +${num((delta / upgradeCost(s, id)) * 100)}）`
  switch (id) {
    case 'shovel':
      return `半径 ${num(a.collectRadius)} → ${num(b.collectRadius)}m・回収 SPS ${num(a.collect)} → ${num(b.collect)}${perGold(b.collect - a.collect)}`
    case 'power':
      return `回収 SPS ${num(a.collect)} → ${num(b.collect)}${perGold(b.collect - a.collect)}`
    case 'backpack':
      return `所持上限 ${a.capacity} → ${b.capacity}`
    case 'throwing':
      return `投げ込み SPS ${num(a.throwRate)} → ${num(b.throwRate)}`
    case 'plow':
      return `除雪機 ${a.plows} → ${b.plows}台・SPS ${num(a.plows * a.plowEach)} → ${num(b.plows * b.plowEach)}${perGold(b.plowEach)}`
    case 'cooldown':
      return `スキルの CD ×${num(a.cooldownMult)} → ×${num(b.cooldownMult)}`
  }
}

/** いまの Tier の上限まで買うのに必要なゴールドの合計 */
function costToMax(s: GameState, id: UpgradeId): number {
  const lv = s.upgrades[id]
  let sum = 0
  for (let n = lv; n < maxLevel(s, id); n++) sum += upgradeCost({ ...s, upgrades: { ...s.upgrades, [id]: n } }, id)
  return sum
}

// ---- 表示の小物 ----

type Cell = string | HTMLElement

function el(tag: string, attrs: Record<string, string> = {}, ...children: Cell[]): HTMLElement {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  e.append(...children)
  return e
}

function section(title: string, ...children: HTMLElement[]): HTMLDetailsElement {
  const d = el('details', {}, el('summary', {}, title), ...children) as HTMLDetailsElement
  d.open = true
  return d
}

/** ラベル | 値 | 補足 の3列 */
function grid(...rows: Cell[][]): HTMLElement {
  const g = el('div', { class: 'bal-grid' })
  // 文字列もそのまま入れるとテキストノードになり、:nth-child の列の数え方がずれるので span で包む
  for (const row of rows) for (let i = 0; i < 3; i++) g.append(typeof row[i] === 'string' ? el('span', {}, row[i]) : (row[i] ?? el('span')))
  return g
}

function parse(text: string, isArray: boolean, optional: boolean): TuneValue | null {
  const trimmed = text.trim()
  if (trimmed === '') return optional ? undefined : null
  if (isArray) {
    const values = trimmed.split(/[,\s]+/).filter(Boolean).map(Number)
    return values.length > 0 && values.every((v) => Number.isFinite(v) && v >= 0) ? values : null
  }
  const v = Number(trimmed)
  return Number.isFinite(v) && v >= 0 ? v : null
}

function format(v: TuneValue): string {
  if (v === undefined) return ''
  if (Array.isArray(v)) return v.join(', ')
  return `${sig(v)}`
}

/** 有効数字 4 桁に丸める（逆算した値や表示がだらだら長くならないように） */
function sig(v: number): number {
  return Number(v.toPrecision(4))
}

function num(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  return a >= 100 ? `${Math.round(v)}` : a >= 10 ? v.toFixed(1) : v.toFixed(2)
}

function time(sec: number): string {
  if (!Number.isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  return `${m}:${`${Math.floor(sec % 60)}`.padStart(2, '0')}`
}

function setText(e: Element, text: string) {
  if (e.textContent !== text) e.textContent = text
}

function setValue(e: HTMLInputElement, value: string) {
  if (e.value !== value) e.value = value
}
