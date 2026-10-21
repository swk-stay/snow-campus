import { BUILDINGS, ITEMS, UPGRADES, type ItemId, type UpgradeId } from './config'
import { GAME_VERSION } from './version'
import { canBuy, canBuyItem, itemCost, maxLevel, upgradeCost, type GameState } from './sim/game'

// ショップ。「アップグレード」（レベル制）と「アイテム」（一度買えばずっと有効な解禁型）の2タブ。
// スマホは画面下のボタンで開くシート、PC は E キーでも開閉できる。
// 購入はコールバックで main に返す（オンライン化後はここがサーバーへの送信になる）。

const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[]
const ITEM_IDS = Object.keys(ITEMS) as ItemId[]

type Row = { row: HTMLElement; level: HTMLElement; buy: HTMLButtonElement }

/** パネルの一番下に並べるボタン（タイムアタックの開始、セーブを消す など） */
export type ShopAction = { label: string; onClick: () => void; confirm?: string; danger?: boolean }

export class Shop {
  private readonly panel: HTMLDivElement
  private readonly button: HTMLButtonElement
  private readonly upgradeRows = new Map<UpgradeId, Row>()
  private readonly itemRows = new Map<ItemId, Row>()
  private readonly tabs: Record<'upgrade' | 'item', HTMLButtonElement>
  private readonly lists: Record<'upgrade' | 'item', HTMLDivElement>
  private open = false

  constructor(root: HTMLElement, onBuy: (id: UpgradeId) => void, onBuyItem: (id: ItemId) => void, actions: ShopAction[]) {
    this.button = document.createElement('button')
    this.button.id = 'shop-button'
    this.button.innerHTML = 'ショップ <kbd>E</kbd>'
    this.button.addEventListener('click', () => this.toggle())
    root.appendChild(this.button)

    this.panel = document.createElement('div')
    this.panel.id = 'shop'
    this.panel.innerHTML = `
      <div class="shop-head">
        <button class="shop-tab active" data-tab="upgrade">アップグレード</button>
        <button class="shop-tab" data-tab="item">アイテム<span class="shop-badge"></span></button>
        <span class="shop-tier"></span><button class="shop-close">×</button>
      </div>
      <div class="shop-list" data-list="upgrade"></div>
      <div class="shop-list" data-list="item" hidden></div>`
    this.panel.querySelector('.shop-close')!.addEventListener('click', () => this.toggle(false))
    this.tabs = {
      upgrade: this.panel.querySelector('[data-tab="upgrade"]')!,
      item: this.panel.querySelector('[data-tab="item"]')!,
    }
    this.lists = {
      upgrade: this.panel.querySelector('[data-list="upgrade"]')!,
      item: this.panel.querySelector('[data-list="item"]')!,
    }
    for (const tab of ['upgrade', 'item'] as const) this.tabs[tab].addEventListener('click', () => this.showTab(tab))

    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id]
      const r = makeRow(def.label, def.description)
      r.buy.addEventListener('click', () => onBuy(id))
      this.upgradeRows.set(id, r)
      this.lists.upgrade.appendChild(r.row)
    }
    for (const id of ITEM_IDS) {
      const def = ITEMS[id]
      const r = makeRow(def.label, def.description)
      r.buy.addEventListener('click', () => onBuyItem(id))
      this.itemRows.set(id, r)
      this.lists.item.appendChild(r.row)
    }

    for (const action of actions) {
      const button = document.createElement('button')
      button.className = `shop-action${action.danger ? ' danger' : ''}`
      button.textContent = action.label
      button.addEventListener('click', () => {
        if (!action.confirm || confirm(action.confirm)) action.onClick()
      })
      this.panel.appendChild(button)
    }
    // どのバージョンで遊んでいるか（変更点はパッチノート.md）
    const version = document.createElement('div')
    version.className = 'shop-version'
    version.textContent = GAME_VERSION
    this.panel.appendChild(version)
    root.appendChild(this.panel)

    addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !e.repeat) this.toggle()
      if (e.code === 'Escape') this.toggle(false)
    })
  }

  toggle(open = !this.open) {
    this.open = open
    this.panel.classList.toggle('visible', open)
    // ショップを開いている間はスキルボタンを隠す（パネルと重なるため）
    document.body.classList.toggle('shop-open', open)
  }

  private showTab(tab: 'upgrade' | 'item') {
    for (const t of ['upgrade', 'item'] as const) {
      this.tabs[t].classList.toggle('active', t === tab)
      this.lists[t].hidden = t !== tab
    }
  }

  /** 毎フレーム呼んでよい（変化した値だけ DOM に書く） */
  update(s: GameState) {
    let affordable = false
    for (const id of UPGRADE_IDS) {
      const { level, buy } = this.upgradeRows.get(id)!
      const check = canBuy(s, id)
      setText(level, `Lv ${s.upgrades[id]}/${maxLevel(s, id)}`)
      setText(buy, check === 'max' ? (s.tier < UPGRADES[id].maxLevel.length - 1 ? '建物を完成させよう' : 'MAX') : `${upgradeCost(s, id)} G`)
      buy.disabled = check !== 'ok'
      affordable ||= check === 'ok'
    }

    let newItems = 0
    for (const id of ITEM_IDS) {
      const { row, level, buy } = this.itemRows.get(id)!
      const check = canBuyItem(s, id)
      row.classList.toggle('locked', check === 'locked')
      row.classList.toggle('owned', check === 'owned')
      setText(level, check === 'owned' ? '入手済み' : check === 'locked' ? unlockText(s, id) : '')
      setText(buy, check === 'owned' ? '✓' : `${itemCost(id)} G`)
      buy.disabled = check !== 'ok'
      if (check === 'ok') newItems++
    }
    setText(this.tabs.item.querySelector('.shop-badge')!, newItems > 0 ? `${newItems}` : '')
    affordable ||= newItems > 0

    setText(this.panel.querySelector('.shop-tier')!, `Tier ${s.tier}`)
    this.button.classList.toggle('glow', affordable && !this.open)
  }
}

function makeRow(label: string, description: string): Row {
  const row = document.createElement('div')
  row.className = 'shop-row'
  row.innerHTML = `
    <div class="shop-info"><b>${label}</b> <span class="shop-level"></span><small>${description}</small></div>
    <button class="shop-buy"></button>`
  return { row, level: row.querySelector('.shop-level')!, buy: row.querySelector('.shop-buy')! }
}

/** 解禁条件のうち、まだ満たしていないものを文章にする */
function unlockText(s: GameState, id: ItemId): string {
  const { tier, collected } = ITEMS[id].unlock
  const parts: string[] = []
  if (tier !== undefined && s.tier < tier) parts.push(`「${BUILDINGS[tier - 1].label}」完成`)
  if (collected !== undefined && s.totalCollected < collected) parts.push(`雪を累計 ${collected}（あと ${Math.ceil(collected - s.totalCollected)}）`)
  return `🔒 ${parts.join(' ＋ ')}で解禁`
}

function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text
}
