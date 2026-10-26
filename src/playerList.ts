import { MAX_PLAYERS } from './net/protocol'
import type { Player } from './sim/game'
import { skinById } from './skins'

// マルチプレイで、いまルームにいるプレイヤーの名前を並べる一覧（issue #81）。ミニマップの下に出す。
// PC は Tab キー、スマホは見出しのタップで開け閉めする。観戦（神視点）の端末でも Tab が効くよう、キーはここで受ける。
// 毎フレーム update が呼ばれるので、顔ぶれが変わったときだけ DOM を作り直す

export class PlayerList {
  readonly el: HTMLDivElement
  private readonly head: HTMLButtonElement
  private readonly count: HTMLSpanElement
  private readonly arrow: HTMLSpanElement
  private readonly list: HTMLUListElement
  private open = true
  private signature = ''

  constructor(root: HTMLElement) {
    this.el = document.createElement('div')
    this.el.id = 'player-list'
    this.head = document.createElement('button')
    this.head.type = 'button'
    this.head.className = 'pl-head'
    this.count = document.createElement('span')
    this.count.className = 'pl-count'
    const kbd = document.createElement('kbd')
    kbd.textContent = 'Tab'
    this.arrow = document.createElement('span')
    this.arrow.className = 'pl-arrow'
    this.head.append(this.count, kbd, this.arrow)
    this.list = document.createElement('ul')
    this.el.append(this.head, this.list)
    root.appendChild(this.el)
    this.apply()

    this.head.addEventListener('click', () => {
      this.toggle()
      this.head.blur() // フォーカスが残ると Enter でも開け閉めしてしまうため
    })
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault() // ブラウザのフォーカス移動を止める
      this.toggle()
    })
  }

  private toggle() {
    this.open = !this.open
    this.apply()
  }

  private apply() {
    this.list.hidden = !this.open
    this.arrow.textContent = this.open ? '▾' : '▸'
    this.head.setAttribute('aria-expanded', String(this.open))
  }

  /** meId は自分の id。観戦は一覧に入っていないので null */
  update(players: Player[], meId: string | null) {
    const sig = `${meId}|${players.map((p) => `${p.id}:${p.name}:${p.skin}`).join('|')}`
    if (sig === this.signature) return
    this.signature = sig
    this.count.textContent = `参加者 ${players.length}/${MAX_PLAYERS}`
    const sorted = [...players].sort((a, b) => Number(b.id === meId) - Number(a.id === meId))
    this.list.replaceChildren(...sorted.map((p) => {
      const li = document.createElement('li')
      const dot = document.createElement('i')
      dot.style.background = '#' + skinById(p.skin).color.toString(16).padStart(6, '0')
      const name = document.createElement('span')
      name.className = 'pl-name'
      name.textContent = p.name // 名前は入力された文字列なので textContent だけで入れる
      li.append(dot, name)
      if (p.id === meId) {
        const me = document.createElement('small')
        me.textContent = '（自分）'
        li.append(me)
      }
      return li
    }))
  }
}
