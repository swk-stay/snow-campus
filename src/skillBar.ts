import { SKILLS, type SkillId } from './config'
import { skillOwned, stats, type GameState } from './sim/game'

// スキルボタン（右下、ショップボタンの上）。覚えたスキルだけ表示する。
// クールダウンは円グラフ状のオーバーレイと残り秒数で見せる。PC はキー（Space / Q / R / F）でも使える。

const IDS = Object.keys(SKILLS) as SkillId[]

export class SkillBar {
  private readonly buttons = new Map<SkillId, { el: HTMLButtonElement; cd: HTMLSpanElement; wasReady: boolean }>()

  constructor(root: HTMLElement, onUse: (id: SkillId) => void) {
    const bar = document.createElement('div')
    bar.id = 'skill-bar'
    for (const id of IDS) {
      const def = SKILLS[id]
      const el = document.createElement('button')
      el.className = `skill${def.ultimate ? ' ultimate' : ''}`
      el.hidden = true
      el.innerHTML = `<span class="skill-name">${def.label}</span><kbd>${def.keyLabel}</kbd><span class="skill-cd"></span>`
      // click だと指を離すまで発動しないので pointerdown で即発動
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        onUse(id)
      })
      bar.appendChild(el)
      this.buttons.set(id, { el, cd: el.querySelector('.skill-cd')!, wasReady: true })
    }
    root.appendChild(bar)

    addEventListener('keydown', (e) => {
      if (e.repeat) return
      const id = IDS.find((i) => SKILLS[i].key === e.code)
      if (id) {
        e.preventDefault()
        onUse(id)
      }
    })
  }

  update(s: GameState) {
    const mult = stats(s).cooldownMult
    for (const id of IDS) {
      const b = this.buttons.get(id)!
      const owned = skillOwned(s, id)
      if (b.el.hidden === owned) {
        b.el.hidden = !owned
        if (owned) b.el.classList.add('learned')
      }
      if (!owned) continue
      const remain = s.player.cooldowns[id]
      const ratio = remain / (SKILLS[id].cooldown * mult)
      b.el.style.setProperty('--cd', `${Math.min(1, ratio)}`)
      const text = remain > 0 ? `${Math.ceil(remain)}` : ''
      if (b.cd.textContent !== text) b.cd.textContent = text
      const ready = remain <= 0
      b.el.classList.toggle('cooling', !ready)
      // 使えるようになった瞬間に光らせる
      if (ready && !b.wasReady) {
        b.el.classList.remove('ready-flash')
        void b.el.offsetWidth
        b.el.classList.add('ready-flash')
      }
      b.wasReady = ready
    }
  }

  /** 使えなかったときにボタンを揺らす */
  shake(id: SkillId) {
    const el = this.buttons.get(id)!.el
    el.classList.remove('shake')
    void el.offsetWidth
    el.classList.add('shake')
  }
}
