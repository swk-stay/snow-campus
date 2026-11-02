import * as THREE from 'three'
import type { CloudKind } from './daylight'

// 空のドーム。カメラを中心にした大きな球の内側に、天頂から地平線へのグラデーション、太陽の側の地平線の焼け、太陽、雲を描く。
// 地平線より下はフォグと同じ色で塗る（雪原の外は遠くでフォグに沈むので、境目が見えないように）。

/** 焼けが地平線から上へどれだけ広がるか（大きいほど地平線に張り付く） */
const GLOW_FALLOFF = 4.0
/** 焼けが太陽の方角からどれだけ横へ広がるか（大きいほど狭い） */
const GLOW_SPREAD = 3.0

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // 一番奥に描く
    gl_Position = p.xyww;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform float uGlowAmount;
  uniform vec3 uSunDir;
  uniform vec3 uSun;
  uniform float uSunVisible;
  uniform vec3 uFog;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uCloudKind; // 0: なし, 1: すじ雲, 2: うろこ雲
  uniform float uCloudCover;
  uniform float uCloudTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(17.0, 9.0);
      a *= 0.5;
    }
    return v;
  }

  // 雲の濃さ（0..1）。空を高さ一定の平面に見立てて、その上の模様を流す
  float cloudDensity(vec3 d) {
    vec2 p = d.xz / (d.y + 0.12);
    // 冬の北西の季節風：北西（-X, +Z）から南東へ流れる
    vec2 wind = vec2(0.8, -0.6) * uCloudTime * 0.006;
    float cover = uCloudCover;
    if (uCloudKind < 1.5) {
      // すじ雲：風の向きに引き伸ばした薄い筋
      vec2 q = p + wind;
      vec2 r = vec2(dot(q, vec2(0.8, -0.6)) * 0.35, dot(q, vec2(0.6, 0.8)) * 2.2);
      float n = fbm(r * 1.1 + fbm(q * 0.6) * 1.5);
      float lo = 0.75 - cover * 0.6;
      return smoothstep(lo, lo + 0.3, n) * 0.85;
    }
    // うろこ雲：細かい粒の集まりが、大きなまだら模様の中にだけ出る
    vec2 q = p * 3.2 + wind * 3.0;
    float cells = noise(q * 2.4) * 0.65 + noise(q * 5.1) * 0.35;
    float patchy = fbm(p * 0.55 + wind * 0.7);
    float mask = smoothstep(1.0 - cover * 1.3, 1.1 - cover * 0.6, patchy);
    return smoothstep(0.45, 0.72, cells) * mask * 0.8;
  }

  void main() {
    vec3 d = normalize(vDir);
    float y = max(d.y, 0.0);

    vec3 col = mix(uHorizon, uZenith, pow(y, 0.5));
    // 太陽の側の地平線の焼け
    vec2 dh = normalize(d.xz + vec2(1e-5));
    vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
    float toward = pow(dot(dh, sh) * 0.5 + 0.5, ${GLOW_SPREAD.toFixed(1)});
    col = mix(col, uGlow, clamp(toward * uGlowAmount * exp(-y * ${GLOW_FALLOFF.toFixed(1)}), 0.0, 1.0));

    float cosS = dot(d, uSunDir);
    // 太陽のまわりのにじみ
    col += uSun * (pow(max(cosS, 0.0), 300.0) * 0.8 + pow(max(cosS, 0.0), 12.0) * 0.18) * uSunVisible;

    // 雲。太陽に近いところと、太陽が低いときは下側が太陽の色に染まる
    if (uCloudKind > 0.5 && d.y > 0.0) {
      float c = cloudDensity(d);
      float near = pow(max(cosS, 0.0), 4.0);
      float low = 1.0 - smoothstep(0.05, 0.5, uSunDir.y);
      vec3 cloud = mix(uCloudShade, uCloudLit, clamp(0.35 + 0.45 * near + 0.35 * low - 0.25 * c, 0.0, 1.0));
      cloud += uSun * near * 0.25 * uSunVisible;
      // 地平線の近くは霞ませる
      c *= smoothstep(0.0, 0.18, d.y);
      col = mix(col, cloud, c);
    }

    // 太陽の円盤（雲より手前に、薄い雲越しにも見えるように）
    float disc = smoothstep(0.99985, 0.99993, cosS) * uSunVisible;
    col = mix(col, uSun * 1.6 + vec3(0.3), disc);

    // 地平線より下はフォグの色。地平線のすぐ上でフォグの色からなめらかにつなぐ
    col = mix(uFog, col, smoothstep(-0.02, 0.03, d.y));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export type SkyParams = {
  sunDir: THREE.Vector3
  /** 太陽の円盤とにじみの見え方（0: 沈んでいる） */
  sunVisible: number
  zenith: THREE.Color
  horizon: THREE.Color
  glow: THREE.Color
  glowAmount: number
  sun: THREE.Color
  cloudLit: THREE.Color
  cloudShade: THREE.Color
  cloudKind: CloudKind
  cloudCover: number
  cloudTime: number
}

const CLOUD_KIND_INDEX: Record<CloudKind, number> = { clear: 0, streak: 1, scale: 2 }

export class SkyDome {
  readonly mesh: THREE.Mesh
  private readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uGlowAmount: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSun: { value: new THREE.Color() },
    uSunVisible: { value: 1 },
    uFog: { value: new THREE.Color() },
    uCloudLit: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uCloudKind: { value: 0 },
    uCloudCover: { value: 0 },
    uCloudTime: { value: 0 },
  }

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1
  }

  /** 地平線（高さ 0）の方角 dir での焼けの混ざり具合。フォグの色をシェーダーと同じ式で出すのに使う */
  static glowAt(dir: THREE.Vector3, sunDir: THREE.Vector3, amount: number): number {
    const dl = Math.hypot(dir.x, dir.z) || 1
    const sl = Math.hypot(sunDir.x, sunDir.z) || 1
    const dot = (dir.x * sunDir.x + dir.z * sunDir.z) / (dl * sl)
    return Math.min(1, Math.max(0, Math.pow(dot * 0.5 + 0.5, GLOW_SPREAD) * amount))
  }

  update(camera: THREE.Camera, p: SkyParams) {
    this.mesh.position.copy(camera.position)
    const u = this.uniforms
    u.uSunDir.value.copy(p.sunDir)
    u.uSunVisible.value = p.sunVisible
    u.uZenith.value.copy(p.zenith)
    u.uHorizon.value.copy(p.horizon)
    u.uGlow.value.copy(p.glow)
    u.uGlowAmount.value = p.glowAmount
    u.uSun.value.copy(p.sun)
    u.uCloudLit.value.copy(p.cloudLit)
    u.uCloudShade.value.copy(p.cloudShade)
    u.uCloudKind.value = CLOUD_KIND_INDEX[p.cloudKind]
    u.uCloudCover.value = p.cloudCover
    u.uCloudTime.value = p.cloudTime
  }

  /** 地平線より下を塗るフォグの色 */
  setFogColor(color: THREE.Color) {
    this.uniforms.uFog.value.copy(color)
  }
}
