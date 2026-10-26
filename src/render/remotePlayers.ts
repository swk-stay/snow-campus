import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { SnowField } from '../sim/field'
import type { Player } from '../sim/game'
import { skinById, type SkinId } from '../skins'
import { PlayerView } from './playerView'

// マルチプレイで、自分以外のプレイヤーの見た目（各自が選んだスキン）と頭上の名前。sim の players と id で突き合わせて増減に追従する。
// 名前の DOM は BuildingLabels の CSS2DRenderer がシーンごと描く。

type Avatar = { view: PlayerView; skin: SkinId; label: CSS2DObject; name: HTMLDivElement; lastX: number; lastZ: number }

export class RemotePlayers {
  readonly group = new THREE.Group()
  private readonly avatars = new Map<string, Avatar>()

  update(dt: number, players: Player[], field: SnowField) {
    const seen = new Set<string>()
    for (const p of players) {
      seen.add(p.id)
      let a = this.avatars.get(p.id)
      if (!a) {
        const view = new PlayerView(skinById(p.skin))
        const name = document.createElement('div')
        name.className = 'player-name'
        const label = new CSS2DObject(name)
        label.position.y = 2
        view.group.add(label)
        this.group.add(view.group)
        a = { view, skin: p.skin, label, name, lastX: p.x, lastZ: p.z }
        this.avatars.set(p.id, a)
      } else if (a.skin !== p.skin) {
        // いまは参加中にスキンを変えられないが、変わったら見た目を作り直す（名前のラベルは付け替える）
        const view = new PlayerView(skinById(p.skin))
        view.group.position.copy(a.view.group.position)
        view.group.add(a.label)
        this.group.remove(a.view.group)
        this.group.add(view.group)
        a.view = view
        a.skin = p.skin
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
