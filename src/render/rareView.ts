import * as THREE from 'three'
import { WORLD } from '../config'
import type { SnowField } from '../sim/field'
import type { RareCrystal } from '../sim/game'

// レア雪の結晶。雪面の上でくるくる回って光る。sim の配列と id で突き合わせて増減に追従する。

const geo = new THREE.OctahedronGeometry(0.45, 0)
const mat = new THREE.MeshStandardMaterial({ color: 0x9ff0ff, emissive: 0x36c8ff, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.1 })
const glowGeo = new THREE.CylinderGeometry(0.15, 0.5, 6, 12, 1, true).translate(0, 3, 0)
const glowMat = new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })

export class RareView {
  readonly group = new THREE.Group()
  private readonly views = new Map<number, THREE.Group>()

  update(time: number, rares: RareCrystal[], field: SnowField) {
    const alive = new Set(rares.map((r) => r.id))
    for (const [id, g] of this.views) {
      if (alive.has(id)) continue
      this.group.remove(g)
      this.views.delete(id)
    }
    for (const r of rares) {
      let g = this.views.get(r.id)
      if (!g) {
        g = new THREE.Group()
        g.add(new THREE.Mesh(geo, mat), new THREE.Mesh(glowGeo, glowMat))
        this.group.add(g)
        this.views.set(r.id, g)
      }
      const ground = field.amountAt(r.x, r.z) * WORLD.snowMaxHeight
      g.position.set(r.x, ground + 0.7 + Math.sin(time * 2 + r.id) * 0.15, r.z)
      g.children[0].rotation.y = time * 2
    }
  }
}
