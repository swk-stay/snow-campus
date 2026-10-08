import * as THREE from 'three'
import { WORLD } from '../config'
import type { SnowField } from '../sim/field'

// 雪原の描画。SnowField を R8 テクスチャに詰め、頂点シェーダーで高さに変換する。
// 法線は高さマップの差分から求めるので、削った跡の縁にちゃんと陰影が付く。

const vertexShader = /* glsl */ `
  uniform sampler2D uField;
  uniform float uSize;
  uniform float uTexel;
  uniform float uMaxH;
  varying float vH;
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <fog_pars_vertex>

  float h(vec2 xz) {
    return texture2D(uField, xz / uSize + 0.5).r;
  }

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float e = uSize * uTexel;
    float hc = h(wp.xz);
    float hx = h(wp.xz + vec2(e, 0.0)) - h(wp.xz - vec2(e, 0.0));
    float hz = h(wp.xz + vec2(0.0, e)) - h(wp.xz - vec2(0.0, e));
    vNormal = normalize(vec3(-hx * uMaxH / (2.0 * e), 1.0, -hz * uMaxH / (2.0 * e)));
    wp.y += hc * uMaxH;
    vH = hc;
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform vec3 uPlayer; // xy = プレイヤーの xz, z = 回収半径
  varying float vH;
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, uSunDir), 0.0);

    // 雪の下の地面（キャンパスの舗装っぽいタイル）
    vec3 ground = vec3(0.035, 0.04, 0.05);
    vec2 g = fract(vWorld.xz / 2.0);
    ground *= 1.0 - 0.35 * step(0.96, max(g.x, g.y));
    vec3 groundLit = ground * (0.6 + 0.4 * diff);

    vec3 snow = mix(vec3(0.42, 0.52, 0.78), vec3(1.0), diff);
    float cover = smoothstep(0.02, 0.18, vH);
    vec3 col = mix(groundLit, snow, cover);

    // 削り跡の縁をうっすら暗く（濡れた感じ）
    col *= 1.0 - cover * (1.0 - cover) * 0.6;

    // きらめき
    float s = hash(floor(vWorld.xz * 24.0));
    col += cover * step(0.996, s) * (0.5 + 0.5 * sin(uTime * 3.0 + s * 50.0)) * 0.8;

    // プレイヤーの影と回収範囲リング
    float d = distance(vWorld.xz, uPlayer.xy);
    col *= 1.0 - 0.35 * smoothstep(0.6, 0.0, d);
    float ring = smoothstep(0.09, 0.0, abs(d - uPlayer.z));
    col = mix(col, vec3(0.25, 0.55, 1.0), ring * 0.55);
    col = mix(col, vec3(0.6, 0.8, 1.0), step(d, uPlayer.z) * 0.06);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export class SnowSurface {
  readonly mesh: THREE.Mesh
  private readonly field: SnowField
  private readonly texData: Uint8Array
  private readonly texture: THREE.DataTexture
  private readonly uniforms

  constructor(field: SnowField, sunDir: THREE.Vector3) {
    this.field = field
    this.texData = new Uint8Array(field.res * field.res)
    this.texture = new THREE.DataTexture(this.texData, field.res, field.res, THREE.RedFormat, THREE.UnsignedByteType)
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false

    this.uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uField: { value: this.texture },
      uSize: { value: field.size },
      uTexel: { value: 1 / field.res },
      uMaxH: { value: WORLD.snowMaxHeight },
      uSunDir: { value: sunDir.clone().normalize() },
      uTime: { value: 0 },
      uPlayer: { value: new THREE.Vector3() },
    }

    // 頂点数はセル数の約4倍。スマホでも問題ない量
    const geo = new THREE.PlaneGeometry(field.size, field.size, 255, 255)
    geo.rotateX(-Math.PI / 2)
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, fog: true }))
    this.mesh.frustumCulled = false
  }

  update(time: number, playerX: number, playerZ: number, collectRadius: number) {
    if (this.field.dirty) {
      const src = this.field.data
      for (let k = 0; k < src.length; k++) this.texData[k] = Math.round(Math.min(1, src[k]) * 255)
      this.texture.needsUpdate = true
      this.field.dirty = false
    }
    this.uniforms.uTime.value = time
    this.uniforms.uMaxH.value = WORLD.snowMaxHeight
    this.uniforms.uPlayer.value.set(playerX, playerZ, collectRadius)
  }
}
