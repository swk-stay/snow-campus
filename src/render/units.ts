import * as THREE from 'three'
import { UPGRADE_EFFECT } from '../config'
import type { Plow, SnowMachine } from '../sim/game'

// 自動除雪機と降雪機の見た目。sim 側の配列と id で突き合わせて、増減に追従する。

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

const FLAKES = 160

function createMachineMesh(): THREE.Group {
  const g = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x8aa0b8, roughness: 0.5, metalness: 0.3 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3, 10), metal)
  pole.position.y = 1.5
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0x4a7fd6, roughness: 0.5 }))
  head.position.y = 3.1
  head.rotation.x = Math.PI / 2.6
  head.name = 'head'
  g.add(pole, head)

  // 範囲内に舞う雪（Points）。ローカル座標で落下させて、下まで来たら上に戻す
  const positions = new Float32Array(FLAKES * 3)
  const r = UPGRADE_EFFECT.snowMachine.radius
  for (let i = 0; i < FLAKES; i++) {
    const a = Math.random() * Math.PI * 2
    const d = r * Math.sqrt(Math.random())
    positions.set([Math.cos(a) * d, Math.random() * 4, Math.sin(a) * d], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const flakes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.9 }))
  flakes.name = 'flakes'
  flakes.frustumCulled = false
  g.add(flakes)
  return g
}

export class UnitsView {
  readonly group = new THREE.Group()
  private readonly plows = new Map<number, THREE.Group>()
  private readonly machines = new Map<number, THREE.Group>()

  /** 除雪機の現在位置（雪玉の発射元）。存在しなければ null */
  plowPosition(id: number, out: THREE.Vector3): THREE.Vector3 | null {
    const m = this.plows.get(id)
    return m ? out.copy(m.position).setY(1.2) : null
  }

  update(dt: number, time: number, plows: Plow[], machines: SnowMachine[], onSpawn: (pos: THREE.Vector3) => void) {
    sync(this.plows, plows, createPlowMesh, this.group, onSpawn)
    sync(this.machines, machines, createMachineMesh, this.group, onSpawn)

    for (const p of plows) {
      const m = this.plows.get(p.id)!
      m.position.set(p.x, 0, p.z)
      let dr = p.facing - m.rotation.y
      dr = Math.atan2(Math.sin(dr), Math.cos(dr))
      m.rotation.y += dr * Math.min(1, dt * 6)
      m.position.y = Math.abs(Math.sin(time * 14 + p.id)) * 0.04
      ;(m.getObjectByName('lamp') as THREE.Mesh).visible = Math.sin(time * 8) > 0
    }

    for (const ms of machines) {
      const m = this.machines.get(ms.id)!
      m.position.set(ms.x, 0, ms.z)
      m.getObjectByName('head')!.rotation.z = time * 2
      const pos = (m.getObjectByName('flakes') as THREE.Points).geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < FLAKES; i++) {
        let y = pos.getY(i) - dt * 1.2
        if (y < 0) y += 4
        pos.setY(i, y)
        pos.setX(i, pos.getX(i) + Math.sin(time * 1.5 + i) * dt * 0.2)
      }
      pos.needsUpdate = true
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
