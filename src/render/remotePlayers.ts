import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { SnowField } from '../sim/field'
import type { Player } from '../sim/game'
import { PlayerView } from './playerView'

// マルチプレイで、自分以外のプレイヤーの見た目と頭上の名前。sim の players と id で突き合わせて増減に追従する。
// 名前の DOM は BuildingLabels の CSS2DRenderer がシーンごと描く。

/** 自分（赤）と見分けがつく上着の色。参加順ではなく id から決めるので、端末が違っても同じ人は同じ色になる */
const JACKETS = [0x2f7fd9, 0x2fa65a, 0x9b4fd1, 0xe08a1e, 0x1fa3a3, 0xd94a8c, 0x6b7a8f]

export function jacketColor(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return JACKETS[h % JACKETS.length]
}

type Avatar = { view: PlayerView; label: CSS2DObject; name: HTMLDivElement; lastX: number; lastZ: number }

export class RemotePlayers {
  readonly group = new THREE.Group()
  private readonly avatars = new Map<string, Avatar>()

  update(dt: number, players: Player[], field: SnowField) {
    const seen = new Set<string>()
    for (const p of players) {
      seen.add(p.id)
      let a = this.avatars.get(p.id)
      if (!a) {
        const view = new PlayerView(jacketColor(p.id))
        const name = document.createElement('div')
        name.className = 'player-name'
        const label = new CSS2DObject(name)
        label.position.y = 2
        view.group.add(label)
        this.group.add(view.group)
        a = { view, label, name, lastX: p.x, lastZ: p.z }
        this.avatars.set(p.id, a)
      }
      if (a.name.textContent !== p.name) a.name.textContent = p.name
      const moving = Math.hypot(p.x - a.lastX, p.z - a.lastZ) > dt * 0.5
      a.lastX = p.x
      a.lastZ = p.z
      a.view.update(dt, p, field, moving)
    }
    for (const [id, a] of this.avatars) {
      if (seen.has(id)) continue
      // CSS2DObject は外しても DOM が残るので、自分で消す
      a.name.remove()
      this.group.remove(a.view.group)
      this.avatars.delete(id)
    }
  }

  /** 投げ込みの雪玉の出どころ（背中の雪玉）。いないプレイヤーなら null */
  packPosition(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    return this.avatars.get(id)?.view.packWorldPosition(out) ?? null
  }

  position(id: string): THREE.Vector3 | null {
    return this.avatars.get(id)?.view.group.position ?? null
  }
}
