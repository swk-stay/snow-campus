import * as THREE from 'three'
import { WORLD } from '../config'
import type { SnowField } from '../sim/field'
import { paintGround } from './campusGround'

// 雪原の描画。SnowField を R8 テクスチャに詰め、頂点シェーダーで高さに変換する。
// 法線は高さマップの差分から求めるので、削った跡の縁にちゃんと陰影が付く。
// キャンパス全体だとセルが 77 万個あるので、頂点は 2 セルに 1 つに間引き、
// 雪の有無（地面が見えるか）だけはフラグメントシェーダーでセル単位に引き直す（削った跡の縁がぼけないように）。

/** 頂点を何セルに 1 つ置くか */
const VERTEX_STRIDE = 2

const vertexShader = /* glsl */ `
  uniform sampler2D uField;
  uniform float uSize;
  uniform vec2 uCenter;
  uniform float uTexel;
  uniform float uMaxH;
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <fog_pars_vertex>

  float h(vec2 xz) {
    return texture2D(uField, (xz - uCenter) / uSize + 0.5).r;
  }

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // 法線は頂点の間隔（2 セル）で差分をとる
    float e = uSize * uTexel * ${VERTEX_STRIDE.toFixed(1)};
    float hx = h(wp.xz + vec2(e, 0.0)) - h(wp.xz - vec2(e, 0.0));
    float hz = h(wp.xz + vec2(0.0, e)) - h(wp.xz - vec2(0.0, e));
    vNormal = normalize(vec3(-hx * uMaxH / (2.0 * e), 1.0, -hz * uMaxH / (2.0 * e)));
    wp.y += h(wp.xz) * uMaxH;
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uField;
  uniform vec2 uCenter;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform vec3 uPlayer; // xy = プレイヤーの xz, z = 回収半径
  uniform vec3 uFacing; // xy = 向きの単位ベクトル (x, z), z = 回収の扇形の半角
  uniform sampler2D uGround;
  uniform float uSize;
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    // 雪の有無はセル単位のテクスチャから引き直す（頂点は間引いているので、削った跡の縁を細かく出すため）
    vec2 uv = (vWorld.xz - uCenter) / uSize + 0.5;
    float vH = texture2D(uField, uv).r;
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, uSunDir), 0.0);

    // 雪の下の地面（芝生・園路・構内道路。campusGround.ts で描いたもの）
    vec3 ground = texture2D(uGround, uv).rgb;
    vec3 groundLit = ground * (0.55 + 0.45 * diff);

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
    // 回収範囲は向いている方向の扇形（既定は前方の半円）。弧と両端の半径の線を描く
    vec2 rel = vWorld.xz - uPlayer.xy;
    float ang = acos(clamp(dot(rel / max(d, 1e-4), uFacing.xy), -1.0, 1.0));
    float inArc = step(ang, uFacing.z);
    float inside = step(d, uPlayer.z) * inArc;
    float arcLine = smoothstep(0.09, 0.0, abs(d - uPlayer.z)) * inArc;
    float edgeLine = smoothstep(0.09, 0.0, d * sin(min(abs(ang - uFacing.z), 1.57))) * step(d, uPlayer.z)
      * step(uFacing.z, 3.13);
    float ring = max(arcLine, edgeLine);
    col = mix(col, vec3(0.25, 0.55, 1.0), ring * 0.55);
    col = mix(col, vec3(0.6, 0.8, 1.0), inside * 0.06);

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
      uCenter: { value: new THREE.Vector2(field.centerX, field.centerZ) },
      uTexel: { value: 1 / field.res },
      uMaxH: { value: WORLD.snowMaxHeight },
      uSunDir: { value: sunDir.clone().normalize() },
      uTime: { value: 0 },
      uPlayer: { value: new THREE.Vector3() },
      uFacing: { value: new THREE.Vector3(0, 1, Math.PI) },
      uGround: { value: createGroundTexture() },
    }

    // 頂点は VERTEX_STRIDE セルに 1 つ（880×880 セルで約 19 万頂点）
    const seg = Math.round(field.res / VERTEX_STRIDE) - 1
    const geo = new THREE.PlaneGeometry(field.size, field.size, seg, seg)
    geo.rotateX(-Math.PI / 2)
    geo.translate(field.centerX, 0, field.centerZ)
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, fog: true }))
    this.mesh.frustumCulled = false
  }

  /** facing: プレイヤーの向き（+Z 方向が 0）、arc: 回収の扇形の角度（ラジアン） */
  update(time: number, playerX: number, playerZ: number, collectRadius: number, facing: number, arc: number) {
    if (this.field.dirty) {
      // 変わった範囲だけ 8bit に詰め直す（毎フレーム 77 万セル全部を回すと重いため）
      const { data: src, res, dirtyRect: r } = this.field
      for (let j = r.j0; j <= r.j1; j++) {
        for (let k = j * res + r.i0, end = j * res + r.i1; k <= end; k++) this.texData[k] = Math.round(Math.min(1, src[k]) * 255)
      }
      this.texture.needsUpdate = true
      this.field.dirty = false
    }
    this.uniforms.uTime.value = time
    this.uniforms.uMaxH.value = WORLD.snowMaxHeight
    this.uniforms.uPlayer.value.set(playerX, playerZ, collectRadius)
    this.uniforms.uFacing.value.set(Math.sin(facing), Math.cos(facing), Math.min(Math.PI, arc / 2))
  }
}

function createGroundTexture(): THREE.Texture {
  const tex = new THREE.CanvasTexture(paintGround(4096))
  tex.colorSpace = THREE.SRGBColorSpace
  // Canvas の上端が -Z。雪原のテクスチャ（行 0 が -Z）と向きをそろえる
  tex.flipY = false
  tex.anisotropy = 8
  return tex
}
