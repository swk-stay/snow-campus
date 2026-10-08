import * as THREE from 'three'
import type { Building } from '../sim/game'
import { createFrontTexture, createRoofTexture, createSideTexture } from './facadeTexture'

// 写真モノリス。箱に校舎の写真を貼り、
//   - progress に応じて地面からせり上がる（y < 0 は discard）
//   - 未完成のあいだは白黒＋雪ブロックの質感
//   - 完成後は colorize でノイズ状に色が広がる（境界が金色に光る）
// クリッピングや色付けはワールド座標・ローカル座標だけで判定しているので、
// 将来 glTF モデルに差し替えても同じシェーダーを使い回せる。

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vLocal = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uColorize; // 0: 雪の状態, 1: 完全にカラー
  uniform float uHeight;
  uniform vec3 uSunDir;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  varying vec3 vNormal;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
          mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
          mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  void main() {
    if (vWorld.y < 0.0) discard;

    vec3 tex = texture2D(uMap, vUv).rgb;
    float diff = max(dot(normalize(vNormal), uSunDir), 0.0);

    // 雪で固めた状態：輝度だけ残して白く寄せ、ブロックの目地と粒感を足す
    float lum = dot(tex, vec3(0.2126, 0.7152, 0.0722));
    float grain = hash31(floor(vLocal * 40.0));
    vec3 snowy = mix(vec3(lum), vec3(1.0), 0.45) * vec3(0.9, 0.95, 1.05);
    snowy *= 0.9 + 0.1 * grain;
    snowy *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.05, fract(vLocal.y * 1.6)));
    snowy *= 0.65 + 0.4 * diff;

    vec3 color = tex * (0.7 + 0.4 * diff);

    // 下からノイズ混じりに色が広がるディゾルブ
    float n = vnoise(vLocal * 0.9);
    float d = (vLocal.y / uHeight) * 0.65 + n * 0.35;
    float t = mix(-0.1, 1.1, uColorize);
    float colored = 1.0 - smoothstep(t - 0.02, t + 0.02, d);
    float sweeping = step(0.001, uColorize) * step(uColorize, 0.999);
    float glow = smoothstep(0.07, 0.0, abs(d - t)) * sweeping;

    vec3 col = mix(snowy, color, colored);
    col += glow * vec3(1.0, 0.75, 0.3) * 1.6;

    // せり上がり中、地面との境目に雪のふちを付ける
    col = mix(col, vec3(1.0), smoothstep(0.5, 0.0, vWorld.y) * 0.6 * (1.0 - colored));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

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

export class Monolith {
  readonly group = new THREE.Group()
  private readonly body: THREE.Mesh
  private readonly ghost: THREE.LineSegments
  private readonly apron: THREE.Mesh
  private readonly height: number
  private readonly shared
  private readonly apronUniforms

  constructor(b: Building, sunDir: THREE.Vector3) {
    this.height = b.height
    this.group.position.set(b.x, 0, b.z)

    this.shared = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColorize: { value: 0 },
      uHeight: { value: b.height },
      uSunDir: { value: sunDir.clone().normalize() },
      uTime: { value: 0 },
    }
    const make = (map: THREE.Texture) =>
      new THREE.ShaderMaterial({ uniforms: { ...this.shared, uMap: { value: map } }, vertexShader, fragmentShader, fog: true })

    const front = [make(createFrontTexture(b.label)), make(createFrontTexture(b.label))]
    const side = [make(createSideTexture()), make(createSideTexture())]
    const roof = make(createRoofTexture())
    loadPhoto(b.photos.front, front)
    loadPhoto(b.photos.side, side)

    // BoxGeometry の面順: +X, -X, +Y, -Y, +Z, -Z
    const geo = new THREE.BoxGeometry(b.width, b.height, b.depth)
    geo.translate(0, b.height / 2, 0)
    this.body = new THREE.Mesh(geo, [side[0], side[1], roof, roof, front[0], front[1]])
    this.group.add(this.body)

    // 完成形のゴースト（ゴールを見せる）
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
  }

  /** 現在見えている屋上の高さ（ワールド y） */
  get topY(): number {
    return this.height + this.body.position.y
  }

  /**
   * @param progress 建設進捗 0..1（表示用に補間済みのもの）
   * @param colorize カラー化の進捗 0..1
   * @param inZone プレイヤーが寄付ゾーンにいるか
   */
  update(time: number, progress: number, colorize: number, inZone: boolean) {
    this.body.position.y = -(1 - progress) * this.height - 0.05
    this.body.visible = progress > 0.002
    this.shared.uColorize.value = colorize
    this.shared.uTime.value = time
    this.apronUniforms.uTime.value = time
    this.apronUniforms.uActive.value += ((inZone ? 1 : 0) - this.apronUniforms.uActive.value) * 0.15
    const done = colorize > 0
    this.ghost.visible = !done
    this.apron.visible = !done
  }
}

function loadPhoto(url: string | undefined, materials: THREE.ShaderMaterial[]) {
  if (!url) return
  new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}${url}`, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    for (const m of materials) m.uniforms.uMap.value = tex
  })
}
