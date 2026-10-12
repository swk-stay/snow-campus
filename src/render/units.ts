import * as THREE from 'three'
import type { Plow } from '../sim/game'

// 自動除雪機の見た目。sim 側の配列と id で突き合わせて、増減に追従する。

function createPlowMesh(): THREE.Group {
  const g = new THREE.Group()
  const orange = new THREE.MeshStandardMaterial({ color: 0xf28c28, roughness: 0.6 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x333a44, roughness: 0.8 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: 0.2 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 1.5), orange)
  body.position.y = 0.55
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.7), glass)
  cab.position.set(0, 1.1, -0.2)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.8), orange)
  roof.position.set(0, 1.42, -0.2)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.12), dark)
  blade.position.set(0, 0.35, 1.0)
  blade.rotation.x = -0.3
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb020 }))
  lamp.position.set(0, 1.55, -0.2)
  lamp.name = 'lamp'
  g.add(body, cab, roof, blade, lamp)
  for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 12), dark)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.25, z)
    g.add(wheel)
  }
  return g
}

export class UnitsView {
  readonly group = new THREE.Group()
  private readonly plows = new Map<number, THREE.Group>()

  /** 除雪機の現在位置（雪玉の発射元）。存在しなければ null */
  plowPosition(id: number, out: THREE.Vector3): THREE.Vector3 | null {
    const m = this.plows.get(id)
    return m ? out.copy(m.position).setY(1.2) : null
  }

  update(dt: number, time: number, plows: Plow[], onSpawn: (pos: THREE.Vector3) => void) {
    sync(this.plows, plows, createPlowMesh, this.group, onSpawn)

    for (const p of plows) {
      const m = this.plows.get(p.id)!
      m.position.set(p.x, 0, p.z)
      let dr = p.facing - m.rotation.y
      dr = Math.atan2(Math.sin(dr), Math.cos(dr))
      m.rotation.y += dr * Math.min(1, dt * 6)
      m.position.y = Math.abs(Math.sin(time * 14 + p.id)) * 0.04
      ;(m.getObjectByName('lamp') as THREE.Mesh).visible = Math.sin(time * 8) > 0
    }
  }
}

function sync<T extends { id: number; x: number; z: number }>(
  views: Map<number, THREE.Group>,
  units: T[],
  create: () => THREE.Group,
  parent: THREE.Group,
  onSpawn: (pos: THREE.Vector3) => void,
) {
  const alive = new Set(units.map((u) => u.id))
  for (const [id, m] of views) {
    if (alive.has(id)) continue
    parent.remove(m)
    views.delete(id)
  }
  for (const u of units) {
    if (views.has(u.id)) continue
    const m = create()
    m.position.set(u.x, 0, u.z)
    parent.add(m)
    views.set(u.id, m)
    onSpawn(m.position)
  }
}
