import { UPGRADES, type UpgradeId } from './config'
import { canBuy, maxLevel, upgradeCost, type GameState } from './sim/game'

// ショップ。スマホは画面下のボタンで開くシート、PC は E キーでも開閉できる。
// 購入はコールバックで main に返す（オンライン化後はここがサーバーへの送信になる）。

const IDS = Object.keys(UPGRADES) as UpgradeId[]

export class Shop {
  private readonly panel: HTMLDivElement
  private readonly button: HTMLButtonElement
  private readonly rows = new Map<UpgradeId, { level: HTMLElement; buy: HTMLButtonElement }>()
  private open = false

  constructor(root: HTMLElement, onBuy: (id: UpgradeId) => void, onReset: () => void) {
    this.button = document.createElement('button')
    this.button.id = 'shop-button'
    this.button.innerHTML = 'ショップ <kbd>E</kbd>'
    this.button.addEventListener('click', () => this.toggle())
    root.appendChild(this.button)

    this.panel = document.createElement('div')
    this.panel.id = 'shop'
    this.panel.innerHTML = `<div class="shop-head"><span>アップグレード</span><span class="shop-tier"></span><button class="shop-close">×</button></div>`
    this.panel.querySelector('.shop-close')!.addEventListener('click', () => this.toggle(false))
    for (const id of IDS) {
      const def = UPGRADES[id]
      const row = document.createElement('div')
      row.className = 'shop-row'
      row.innerHTML = `
        <div class="shop-info"><b>${def.label}</b> <span class="shop-level"></span><small>${def.description}</small></div>
        <button class="shop-buy"></button>`
      const buy = row.querySelector<HTMLButtonElement>('.shop-buy')!
      buy.addEventListener('click', () => onBuy(id))
      this.rows.set(id, { level: row.querySelector('.shop-level')!, buy })
      this.panel.appendChild(row)
    }
    // 学園祭で次の人に渡すときなどに使う
    const reset = document.createElement('button')
    reset.className = 'shop-reset'
    reset.textContent = 'セーブを消して最初から'
    reset.addEventListener('click', () => {
      if (confirm('セーブデータを消して最初からやり直しますか？')) onReset()
    })
    this.panel.appendChild(reset)
    root.appendChild(this.panel)

    addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !e.repeat) this.toggle()
      if (e.code === 'Escape') this.toggle(false)
    })
  }

  toggle(open = !this.open) {
    this.open = open
    this.panel.classList.toggle('visible', open)
  }

  /** 毎フレーム呼んでよい（変化した値だけ DOM に書く） */
  update(s: GameState) {
    let affordable = false
    for (const id of IDS) {
      const { level, buy } = this.rows.get(id)!
      const check = canBuy(s, id)
      setText(level, `Lv ${s.upgrades[id]}/${maxLevel(s, id)}`)
      setText(buy, check === 'max' ? (s.tier < UPGRADES[id].maxLevel.length - 1 ? '建物を完成させよう' : 'MAX') : `${upgradeCost(s, id)} G`)
      buy.disabled = check !== 'ok'
      affordable ||= check === 'ok'
    }
    setText(this.panel.querySelector('.shop-tier')!, `Tier ${s.tier}`)
    this.button.classList.toggle('glow', affordable && !this.open)
  }
}

function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text
}
