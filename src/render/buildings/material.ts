import * as THREE from 'three'

// 建物モデル共通のシェーダー。Monolith（写真の箱）の頃の仕組みをそのまま使う：
//   - ワールド座標 y < 0 は discard（地面からせり上がる）
//   - 未完成のあいだは白黒＋雪ブロックの質感、完成後は uColorize でノイズ状に色が広がる
// 色は頂点カラーで持ち、建物ごとにマテリアルは 3 種類（slot）だけにする。
//   solid: 壁・床・家具など不透明なもの
//   glass: ガラス。雪の状態ではすりガラス（氷）で、完成すると透けて中の床や柱が見える
//   light: 照明やモニターなど自分で光るもの
// さらに、カメラとプレイヤーの間にある部分はディザで抜く（実寸の建物は高いので、見下ろしでも隠れるため）。
// 演出カットで被写体の手前に被る建物は、uFade で棟ごと薄くする（これもディザ）。

export type Slot = 'solid' | 'glass' | 'light'

/** 全建物で共有する、遮蔽の抜き用 uniform。main が毎フレーム更新する */
export const occlusion = {
  uCamPos: { value: new THREE.Vector3() },
  uFocus: { value: new THREE.Vector3() },
  /** 0 で無効、1 で有効（演出中などは 0 にする） */
  uOccl: { value: 0 },
}

const vertexShader = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_vertex>

  void main() {
    vColor = color;
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
  uniform float uColorize; // 0: 雪の状態, 1: 完全にカラー
  uniform float uHeight;
  uniform vec3 uSunDir;
  uniform vec3 uCamPos;
  uniform vec3 uFocus;
  uniform float uOccl;
  uniform float uFade; // 1: そのまま, 0: 完全に消える
  varying vec3 vColor;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_fragment>

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

  // 4x4 のベイヤー行列（ディザ抜き用）
  float bayer(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float v = mod(q.x + q.y * 2.0, 4.0) * 4.0 + mod(q.x * 2.0 + q.y, 4.0);
    return (v + 0.5) / 16.0;
  }

  void main() {
    if (vWorld.y < 0.0) discard;
    if (bayer(gl_FragCoord.xy) > uFade) discard;

    // カメラ→プレイヤーの線分に近い部分を抜く（カメラ側ほど太く）
    if (uOccl > 0.0) {
      vec3 ab = uFocus - uCamPos;
      float t = clamp(dot(vWorld - uCamPos, ab) / dot(ab, ab), 0.0, 1.0);
      float d = distance(vWorld, uCamPos + ab * t);
      float r = mix(9.0, 2.5, t) * uOccl;
      float cut = smoothstep(r, r * 0.55, d) * step(t, 0.93);
      if (bayer(gl_FragCoord.xy) < cut) discard;
    }

    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    float diff = max(dot(n, uSunDir), 0.0);
    float sky = 0.5 + 0.5 * n.y;
    // 足元を少し暗く（接地感）
    float ao = mix(0.72, 1.0, smoothstep(0.0, 2.2, vLocal.y));

    // 雪で固めた状態：輝度だけ残して白く寄せ、ブロックの目地と粒感を足す
    float lum = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
    float grain = hash31(floor(vLocal * 6.0));
    vec3 snowy = mix(vec3(lum), vec3(1.0), 0.6) * vec3(0.9, 0.95, 1.05);
    snowy *= 0.92 + 0.08 * grain;
    snowy *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.06, fract(vLocal.y * 0.8)));
    snowy *= (0.6 + 0.45 * diff) * ao;

    // 下からノイズ混じりに色が広がるディゾルブ
    float nz = vnoise(vLocal * 0.35);
    float dd = (vLocal.y / uHeight) * 0.65 + nz * 0.35;
    float t = mix(-0.1, 1.1, uColorize);
    float colored = 1.0 - smoothstep(t - 0.02, t + 0.02, dd);
    float sweeping = step(0.001, uColorize) * step(uColorize, 0.999);
    float glow = smoothstep(0.05, 0.0, abs(dd - t)) * sweeping;

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float alpha = 1.0;

  #if defined(SLOT_GLASS)
    // 空を映す反射（フレネル）＋色ガラス。中が透けて見えるように薄く
    float fres = pow(1.0 - abs(dot(n, viewDir)), 3.0);
    vec3 skyCol = mix(vec3(0.62, 0.72, 0.84), vec3(0.85, 0.9, 0.97), n.y * 0.5 + 0.5);
    vec3 color = mix(vColor * 0.42, skyCol, 0.22 + 0.6 * fres);
    color += pow(max(dot(reflect(-viewDir, n), uSunDir), 0.0), 60.0) * 0.8;
    float clearAlpha = 0.34 + 0.5 * fres;
    // 雪の状態は氷のブロック（ほぼ不透明）
    vec3 ice = mix(vec3(0.78, 0.86, 0.95), vec3(1.0), 0.35 * diff) * (0.85 + 0.1 * grain);
    snowy = ice;
    alpha = mix(0.9, clearAlpha, colored);
  #elif defined(SLOT_LIGHT)
    vec3 color = vColor;
  #else
    // 日の当たらない面はわずかに青く（空の照り返し）
    vec3 color = vColor * (0.38 + 0.24 * sky + 0.5 * diff) * ao * mix(vec3(0.88, 0.92, 1.0), vec3(1.0, 0.98, 0.95), diff);
  #endif

    vec3 col = mix(snowy, color, colored);
    col += glow * vec3(1.0, 0.75, 0.3) * 1.6;
    alpha = max(alpha, glow);

    // せり上がり中、地面との境目に雪のふちを付ける
    col = mix(col, vec3(1.0), smoothstep(0.5, 0.0, vWorld.y) * 0.6 * (1.0 - colored));

    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/** 建物ごとの uniform（せり上がりの高さとカラー化の進捗） */
export type BuildingUniforms = {
  uColorize: { value: number }
  uHeight: { value: number }
  uSunDir: { value: THREE.Vector3 }
  /** 演出で手前に被ったときの薄さ（1 でそのまま） */
  uFade: { value: number }
}

export function createBuildingMaterials(u: BuildingUniforms): Record<Slot, THREE.ShaderMaterial> {
  const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...u, ...occlusion }
  const make = (slot: Slot) =>
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      defines: slot === 'glass' ? { SLOT_GLASS: '' } : slot === 'light' ? { SLOT_LIGHT: '' } : {},
      vertexColors: true,
      fog: true,
      side: THREE.DoubleSide,
      transparent: slot === 'glass',
      depthWrite: slot !== 'glass',
    })
  return { solid: make('solid'), glass: make('glass'), light: make('light') }
}
