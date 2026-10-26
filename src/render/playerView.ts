import * as THREE from 'three'
import { WORLD } from '../config'
import type { SnowField } from '../sim/field'
import type { Player } from '../sim/game'

// プレイヤーの見た目。背中の雪玉が所持量に応じて膨らむ。
// 影と回収範囲リングは SnowSurface のシェーダー側で描いている。

export class PlayerView {
  readonly group = new THREE.Group()
  private readonly body = new THREE.Group()
  private readonly pack: THREE.Mesh
  private y = 0
  private bob = 0

  /** jacket：上着の色（マルチプレイではプレイヤーごとに変える） */
  constructor(jacketColor = 0xd9443a) {
    const jacket = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.7 })
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 4, 12), jacket)
    torso.position.y = 0.62
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.8 }),
    )
    head.position.y = 1.25
    const hat = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2f5fb3, roughness: 0.9 }),
    )
    hat.position.y = 1.3
    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.07, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.9 }),
    )
    scarf.rotation.x = Math.PI / 2
    scarf.position.y = 1.02
    // 顔の向きが分かるように目を付ける
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 })
    for (const sx of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat)
      eye.position.set(sx, 1.28, 0.21)
      this.body.add(eye)
    }

    this.pack = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    )
    this.pack.position.set(0, 0.85, -0.42)

    this.body.add(torso, head, hat, scarf, this.pack)
    this.group.add(this.body)
  }

  /** 吸い込み演出の目標点（背中の雪玉） */
  packWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.pack.getWorldPosition(out)
  }

  update(dt: number, p: Player, field: SnowField, moving: boolean) {
    // 雪に少し埋もれて歩く
    const targetY = field.amountAt(p.x, p.z) * WORLD.snowMaxHeight * 0.6
    this.y += (targetY - this.y) * Math.min(1, dt * 10)
    this.bob = moving ? this.bob + dt * 12 : 0
    this.group.position.set(p.x, this.y + Math.abs(Math.sin(this.bob)) * 0.08, p.z)

    let dr = p.facing - this.body.rotation.y
    dr = Math.atan2(Math.sin(dr), Math.cos(dr))
    this.body.rotation.y += dr * Math.min(1, dt * 12)

    const fill = p.capacity > 0 ? p.carried / p.capacity : 0
    const s = 0.12 + 0.42 * Math.sqrt(fill)
    this.pack.scale.setScalar(s)
    this.pack.position.set(0, 0.75 + s * 0.4, -0.3 - s * 0.8)
  }
}
