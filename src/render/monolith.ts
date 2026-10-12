import * as THREE from 'three'
import type { Building } from '../sim/game'
import { Kit } from './buildings/kit'
import { createBuildingMaterials } from './buildings/material'
import { MODELS } from './buildings/models'

// 建物。実在の校舎の 3D モデル（render/buildings/models.ts）を、
//   - progress に応じて地面からせり上がる（y < 0 は discard）
//   - 未完成のあいだは白黒＋雪ブロックの質感（ガラスは氷）
//   - 完成後は colorize でノイズ状に色が広がる（境界が金色に光る）。ガラスは透けて中が見えるようになる
// シェーダーは buildings/material.ts。ワールド座標とローカル座標の高さだけで判定しているので、
// 将来 glTF に差し替えても同じ仕組みで動く。

const apronVertex = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const apronFragment = /* glsl */ `
  uniform vec2 uHalf;
  uniform float uActive;
  uniform float uTime;
  varying vec2 vPos;
  void main() {
    vec2 e = uHalf - abs(vPos);
    float edge = min(e.x, e.y);
    float pulse = 0.5 + 0.5 * sin(uTime * 6.0);
    float line = smoothstep(0.25, 0.0, edge);
    float alpha = line * (0.35 + 0.5 * uActive * pulse) + 0.06 * uActive;
    vec3 col = mix(vec3(0.55, 0.8, 1.0), vec3(1.0, 0.8, 0.35), uActive);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`

/** 光の柱の高さ。一番高い K1号館（54m）より高くする */
const BEACON_HEIGHT = 90

const beaconVertex = /* glsl */ `
  varying float vY;
  void main() {
    vY = position.y / ${BEACON_HEIGHT.toFixed(1)};
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const beaconFragment = /* glsl */ `
  uniform float uTime;
  varying float vY;
  void main() {
    float a = (1.0 - vY) * (1.0 - vY) * (0.35 + 0.1 * sin(uTime * 3.0 - vY * 20.0));
    gl_FragColor = vec4(1.0, 0.72, 0.2, a * 0.9);
  }
`

export class Monolith {
  readonly group = new THREE.Group()
  /** 建物のモデル本体（Editor のクリック判定に使う） */
  readonly body: THREE.Group
  private readonly ghost: THREE.LineSegments
  private readonly apron: THREE.Mesh
  private readonly beacon: THREE.Mesh
  private readonly height: number
  private readonly shared
  private readonly apronUniforms
  private readonly signs: THREE.MeshBasicMaterial[]
  private readonly pad: THREE.Mesh

  constructor(b: Building, sunDir: THREE.Vector3) {
    this.height = b.height
    this.group.position.set(b.x, 0, b.z)

    this.shared = {
      uColorize: { value: 0 },
      uHeight: { value: b.height },
      uSunDir: { value: sunDir.clone().normalize() },
    }
    const kit = new Kit()
    MODELS[b.id](kit, b)
    this.body = kit.build(createBuildingMaterials(this.shared))
    const signs = kit.buildSigns()
    if (signs.length) this.body.add(...signs)
    this.signs = signs.map((m) => m.material)
    this.group.add(this.body)

    // 着工前の敷地は雪をかぶった平らな台にしておく（更地のままだと駐車場のように見えるため）
    this.pad = new THREE.Mesh(new THREE.PlaneGeometry(b.width, b.depth), new THREE.MeshLambertMaterial({ color: 0xf2f6fc }))
    this.pad.rotation.x = -Math.PI / 2
    this.pad.position.y = 0.3
    this.group.add(this.pad)

    // 完成形のゴースト（ゴールを見せる）。敷地の外接矩形の箱
    const geo = new THREE.BoxGeometry(b.width, b.height, b.depth)
    geo.translate(0, b.height / 2, 0)
    this.ghost = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }),
    )
    this.group.add(this.ghost)

    // 寄付ゾーンの枠
    const hx = b.width / 2 + b.dropRange
    const hz = b.depth / 2 + b.dropRange
    this.apronUniforms = {
      uHalf: { value: new THREE.Vector2(hx, hz) },
      uActive: { value: 0 },
      uTime: { value: 0 },
    }
    this.apron = new THREE.Mesh(
      new THREE.PlaneGeometry(hx * 2, hz * 2),
      new THREE.ShaderMaterial({
        uniforms: this.apronUniforms,
        vertexShader: apronVertex,
        fragmentShader: apronFragment,
        transparent: true,
        depthWrite: false,
      }),
    )
    this.apron.rotation.x = -Math.PI / 2
    this.apron.position.y = 0.02
    this.group.add(this.apron)

    // 次に建てる建物の目印になる光の柱（グランドレベルでも遠くから見える）
    const beaconGeo = new THREE.CylinderGeometry(1.4, 2.4, BEACON_HEIGHT, 20, 1, true)
    beaconGeo.translate(0, BEACON_HEIGHT / 2, 0)
    this.beacon = new THREE.Mesh(
      beaconGeo,
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.apronUniforms.uTime },
        vertexShader: beaconVertex,
        fragmentShader: beaconFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.group.add(this.beacon)
  }

  /** 現在見えている屋上の高さ（ワールド y） */
  get topY(): number {
    return this.height + this.body.position.y
  }

  /**
   * @param progress 建設進捗 0..1（表示用に補間済みのもの）
   * @param colorize カラー化の進捗 0..1
   * @param stage locked: まだ解放されていない / current: いま建てている / done: 完成
   * @param inZone プレイヤーが寄付ゾーンにいるか
   */
  update(time: number, progress: number, colorize: number, stage: 'locked' | 'current' | 'done', inZone: boolean) {
    this.body.position.y = -(1 - progress) * this.height - 0.05
    this.body.visible = progress > 0.002
    this.pad.visible = !this.body.visible
    this.shared.uColorize.value = colorize
    // サインはカラー化が終わる頃に浮かび上がる
    for (const m of this.signs) m.opacity = Math.max(0, Math.min(1, (colorize - 0.7) / 0.3))
    this.apronUniforms.uTime.value = time
    this.apronUniforms.uActive.value += ((inZone ? 1 : 0) - this.apronUniforms.uActive.value) * 0.15
    const current = stage === 'current'
    this.ghost.visible = current
    this.apron.visible = current
    this.beacon.visible = current
  }
}
