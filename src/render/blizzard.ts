import * as THREE from 'three'
import { SKILL_EFFECT, WORLD } from '../config'
import type { TornadoPath } from '../sim/game'
import type { Sparkles } from './effects'

// 必殺技「ブリザード」の演出。sim の竜巻（sim/game.ts の Tornado）とは別に、スキルのイベントで届いた通り道から手元で動かす。
// - 構えている間：足元から向いている方向へ、竜巻の通り道を地面に描く（流れる矢羽根）
// - 放ったあと：竜巻が通り道をまっすぐ進む。半透明の渦（円錐）2 枚と、渦に巻かれて昇る雪粒・横から吸い込まれる雪の塊
// - 周り一帯に横殴りの雪を降らせ、画面の縁を白く凍らせる（強さは intensity）

/** 竜巻の高さ・根元と上端の半径 (m) */
const HEIGHT = 15
const BOTTOM_R = 0.9
const TOP_R = 6.5
/** 雪玉を投げる高さ（渦の上の方から飛び出す） */
export const TORNADO_THROW_Y = HEIGHT * 0.7

const MAX_TORNADOES = 4
/** 1 本の竜巻の粒の数：渦を昇る粉雪・横から吸い込まれる塊・上端で振り回される塊 */
const SWIRL = 360
const INFLOW = 140
const CHUNKS = 60
const PER = SWIRL + INFLOW + CHUNKS

const FADE_IN = 0.35
const FADE_OUT = 1.2

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`

/** 竜巻の軸のゆらぎ（高さ y での中心のずれ）。シェーダーの WOBBLE と同じ式 */
function wobble(y: number, t: number, seed: number, out: { x: number; z: number }) {
  const k = y / HEIGHT
  out.x = Math.sin(y * 0.35 + t * 2.3 + seed) * 0.9 * k
  out.z = Math.cos(y * 0.3 + t * 1.9 + seed * 1.7) * 0.9 * k
}
const WOBBLE_GLSL = /* glsl */ `
  vec2 wobble(float y, float t, float seed) {
    float k = y / ${HEIGHT.toFixed(1)};
    return vec2(sin(y * 0.35 + t * 2.3 + seed), cos(y * 0.3 + t * 1.9 + seed * 1.7)) * 0.9 * k;
  }
`

function funnelMaterial(speed: number, density: number, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uSeed: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;
      varying float vRim;
      ${WOBBLE_GLSL}
      void main() {
        vUv = uv;
        vec3 p = position;
        float y = p.y + ${(HEIGHT / 2).toFixed(1)};
        p.xz += wobble(y, uTime, uSeed);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // 輪郭（視線と面が平行に近い所）ほど濃く見せて、渦の形を出す
        vec3 n = normalize(normalMatrix * normal);
        vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vRim;
      ${NOISE_GLSL}
      void main() {
        // 斜めに巻き上がる筋
        vec2 q = vec2(vUv.x * 7.0 + vUv.y * 2.5 - uTime * ${speed.toFixed(2)}, vUv.y * 3.0 - uTime * 1.3);
        float n = noise(q * vec2(1.0, 2.0)) * 0.65 + noise(q * 3.1) * 0.35;
        float streak = smoothstep(${(1 - density).toFixed(2)}, 0.95, n);
        float ends = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
        float a = (streak * 0.75 + 0.12) * ends * (0.45 + 0.55 * vRim) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

type Visual = {
  path: TornadoPath
  age: number
  /** 通り道の終わりに着くまでの時間 */
  travel: number
  seed: number
  cones: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>[]
  slot: number
}

export class BlizzardFx {
  readonly group = new THREE.Group()
  /** 0..1。降雪と画面の縁の凍りつきの強さ */
  intensity = 0

  private readonly aim: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly flakes: THREE.InstancedMesh
  private readonly snow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  private readonly visuals: Visual[] = []
  private readonly freeSlots = Array.from({ length: MAX_TORNADOES }, (_, i) => i)
  private readonly conePool: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>[] = []
  private readonly windDir = new THREE.Vector2(1, 0)
  private aiming = false
  /** 竜巻が消えてからの時間（降雪を収めていく） */
  private calm = Infinity
  private dustTimer = 0
  private readonly off = { x: 0, z: 0 }
  private readonly center = new THREE.Vector3()
  private readonly flake = new THREE.Vector3()
  /** 粒ごとの乱数（毎フレーム同じ値を使う） */
  private readonly rnd = Float32Array.from({ length: PER * 4 }, () => Math.random())

  private readonly sparkles: Sparkles

  constructor(sparkles: Sparkles) {
    this.sparkles = sparkles
    // ---- 構えたときの通り道 ----
    const aimGeo = new THREE.PlaneGeometry(1, 1)
    aimGeo.rotateX(-Math.PI / 2)
    // 足元（z=0）から前（+z）へ伸びるように。uv.y は根元 0 → 先端 1
    aimGeo.translate(0, 0, 0.5)
    this.aim = new THREE.Mesh(
      aimGeo,
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uLength: { value: 1 }, uColor: { value: new THREE.Color(0x9fe8ff) }, uOpacity: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uLength;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            float across = abs(vUv.x - 0.5) * 2.0;
            float along = vUv.y * uLength;
            // 先へ流れる矢羽根（くの字）
            float c = fract((along - across * 2.0) / 3.5 - uTime * 1.4);
            float chevron = smoothstep(0.0, 0.08, c) * (1.0 - smoothstep(0.22, 0.32, c));
            float edge = smoothstep(0.86, 0.97, across) * (1.0 - smoothstep(0.97, 1.0, across));
            // 根元はプレイヤーと重なるので薄く、先端は止まる位置が分かるように光らせる
            float base = smoothstep(0.0, 2.0, along);
            float tip = smoothstep(uLength - 1.2, uLength - 0.2, along) * (1.0 - smoothstep(uLength - 0.2, uLength, along));
            float a = (0.10 + edge * 0.75 + chevron * 0.5 * (1.0 - across * 0.6) + tip * 0.9) * base * uOpacity;
            gl_FragColor = vec4(uColor, a);
          }
        `,
        transparent: true,
        depthWrite: false,
      }),
    )
    this.aim.visible = false
    this.aim.renderOrder = 2

    // ---- 竜巻の雪粒（全部の竜巻で 1 つの InstancedMesh） ----
    const count = PER * MAX_TORNADOES
    this.flakes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xf4f9ff, toneMapped: false }), count)
    this.flakes.frustumCulled = false
    for (let i = 0; i < count; i++) this.flakes.setMatrixAt(i, ZERO)

    // ---- 渦の円錐（竜巻 1 本につき内側・外側の 2 枚） ----
    const coneGeo = new THREE.CylinderGeometry(TOP_R, BOTTOM_R, HEIGHT, 40, 20, true)
    for (let i = 0; i < MAX_TORNADOES; i++) {
      // 白い雪原に溶けないよう、渦は青みがかった灰色にする（内側ほど明るく）
      const inner = new THREE.Mesh(coneGeo, funnelMaterial(2.2, 0.55, 0xe4f0fa))
      const outer = new THREE.Mesh(coneGeo, funnelMaterial(1.4, 0.45, 0x9fb8cf))
      outer.scale.set(1.25, 1, 1.25)
      for (const m of [inner, outer]) {
        m.visible = false
        m.frustumCulled = false
        this.conePool.push(m)
      }
    }

    // ---- 横殴りの雪（カメラの注視点のまわりの箱の中で、ワールド座標に固定して流す） ----
    const N = 9000
    const seeds = new Float32Array(N * 4)
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random()
    const snowGeo = new THREE.BufferGeometry()
    snowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    snowGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4))
    this.snow = new THREE.Points(
      snowGeo,
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector3() },
          uBox: { value: new THREE.Vector3(64, 30, 64) },
          uWind: { value: new THREE.Vector2() },
          uIntensity: { value: 0 },
          uScale: { value: 300 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 seed;
          uniform float uTime;
          uniform vec3 uCenter;
          uniform vec3 uBox;
          uniform vec2 uWind;
          uniform float uIntensity;
          uniform float uScale;
          varying float vAlpha;
          void main() {
            vec3 p = seed.xyz * uBox;
            float fall = 3.0 + seed.w * 3.0;
            p.y -= uTime * fall;
            p.xz += uWind * uTime * (0.7 + seed.w * 0.6);
            p.x += sin(uTime * 1.7 + seed.x * 40.0) * 0.6;
            p.z += cos(uTime * 1.3 + seed.z * 40.0) * 0.6;
            vec3 origin = uCenter - uBox * 0.5;
            p = mod(p - origin, uBox) + origin;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            // 強さに応じて降る粒の数を増やす（乱数が強さ以下の粒だけ見せる）
            float on = step(fract(seed.w * 7.31 + seed.x * 3.7), uIntensity);
            // カメラのすぐ前の粒はぼやけた大きな玉に見えるので、薄くして大きさも抑える
            vAlpha = on * (0.55 + 0.45 * seed.y) * smoothstep(2.0, 7.0, -mv.z);
            gl_PointSize = min((0.12 + seed.y * 0.18) * uScale / max(0.5, -mv.z), uScale * 0.03);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          void main() {
            vec2 d = gl_PointCoord - 0.5;
            float a = (1.0 - smoothstep(0.2, 0.5, length(d))) * vAlpha;
            if (a < 0.01) discard;
            gl_FragColor = vec4(0.97, 0.98, 1.0, a);
          }
        `,
        transparent: true,
        depthWrite: false,
      }),
    )
    this.snow.frustumCulled = false
    this.snow.visible = false

    this.group.add(this.aim, this.flakes, this.snow, ...this.conePool)
  }

  /** 構えている間の通り道。null で消す。ok が false なら放てない（短すぎる）ので赤くする */
  setAim(path: TornadoPath | null, ok = true) {
    this.aiming = !!path
    if (!path) return
    const m = this.aim
    m.position.set(path.x, WORLD.snowMaxHeight + 0.06, path.z)
    m.rotation.y = Math.atan2(path.dirX, path.dirZ)
    const len = Math.max(0.5, path.length)
    m.scale.set(SKILL_EFFECT.blizzardHalfWidth * 2, 1, len)
    m.material.uniforms.uLength.value = len
    m.material.uniforms.uColor.value.set(ok ? 0x9fe8ff : 0xff8a7a)
  }

  /** 竜巻を出す（自分のもほかのプレイヤーのも） */
  spawn(path: TornadoPath) {
    // 枠が埋まっていたら一番古いものを消す
    if (this.freeSlots.length === 0) this.remove(this.visuals[0])
    const slot = this.freeSlots.shift()!
    const cones = this.conePool.splice(0, 2)
    const seed = Math.random() * 100
    for (const c of cones) {
      c.visible = true
      c.material.uniforms.uSeed.value = seed
    }
    this.visuals.push({ path, age: 0, travel: path.length / SKILL_EFFECT.blizzardSpeed, seed, cones, slot })
    this.windDir.set(path.dirX, path.dirZ)
    this.calm = 0
  }

  /** 竜巻がいまいる地面の位置 */
  private centerOf(v: Visual, out: THREE.Vector3): THREE.Vector3 {
    const d = Math.min(v.path.length, v.age * SKILL_EFFECT.blizzardSpeed)
    return out.set(v.path.x + v.path.dirX * d, 0, v.path.z + v.path.dirZ * d)
  }

  private remove(v: Visual) {
    this.visuals.splice(this.visuals.indexOf(v), 1)
    for (const c of v.cones) {
      c.visible = false
      this.conePool.push(c)
    }
    for (let k = 0; k < PER; k++) this.flakes.setMatrixAt(v.slot * PER + k, ZERO)
    this.freeSlots.push(v.slot)
  }

  /** snowCenter：降雪の箱の中心（カメラの注視点のあたり）。pixelScale：画面の高さ（粒の大きさの換算に使う） */
  update(dt: number, time: number, snowCenter: THREE.Vector3, pixelScale: number, camera: THREE.Camera) {
    // ---- 構え ----
    const aimMat = this.aim.material
    aimMat.uniforms.uTime.value = time
    aimMat.uniforms.uOpacity.value = THREE.MathUtils.damp(aimMat.uniforms.uOpacity.value, this.aiming ? 1 : 0, 14, dt)
    this.aim.visible = aimMat.uniforms.uOpacity.value > 0.01

    // ---- 竜巻 ----
    this.dustTimer -= dt
    const dust = this.dustTimer <= 0
    if (dust) this.dustTimer = 1 / 30
    for (const v of [...this.visuals]) {
      v.age += dt
      if (v.age > v.travel + FADE_OUT) {
        this.remove(v)
        continue
      }
      this.calm = 0
      const fade = Math.min(1, v.age / FADE_IN) * (1 - Math.max(0, (v.age - v.travel) / FADE_OUT))
      const center = this.centerOf(v, this.center)
      const t = time + v.seed
      for (const [i, c] of v.cones.entries()) {
        c.position.set(center.x, HEIGHT / 2, center.z)
        c.rotation.y = -t * (i === 0 ? 2.6 : 1.7)
        // 出てくるときは根元から伸び上がる
        c.scale.y = 0.3 + 0.7 * Math.min(1, v.age / FADE_IN)
        c.position.y = (HEIGHT / 2) * c.scale.y
        c.material.uniforms.uTime.value = t
        c.material.uniforms.uOpacity.value = fade * (i === 0 ? 0.85 : 0.7)
      }
      this.updateFlakes(v, center, t, fade)
      // 進んでいる間は、根元で削った雪が舞い上がる
      if (dust && v.age < v.travel) {
        const R = SKILL_EFFECT.blizzardHalfWidth
        for (let n = 0; n < 3; n++) {
          const a = Math.random() * Math.PI * 2
          const r = R * Math.sqrt(Math.random())
          this.sparkles.burst(tmpS.set(center.x + Math.cos(a) * r, 0.3, center.z + Math.sin(a) * r), 2, 0xffffff, 5)
        }
      }
    }
    this.flakes.instanceMatrix.needsUpdate = true

    // ---- 降雪 ----
    this.calm += this.visuals.length > 0 ? 0 : dt
    const target = this.visuals.length > 0 ? 1 : this.aiming ? 0.3 : Math.max(0, 1 - this.calm / SKILL_EFFECT.blizzardSnowLinger)
    this.intensity = THREE.MathUtils.damp(this.intensity, target, target > this.intensity ? 3 : 1.5, dt)
    const u = this.snow.material.uniforms
    this.snow.visible = this.intensity > 0.01
    u.uTime.value = time
    u.uIntensity.value = this.intensity
    u.uCenter.value.set(snowCenter.x, snowCenter.y + 8, snowCenter.z)
    // 風は竜巻の進む向き。構えているだけのときは弱く
    const wind = this.visuals.length > 0 ? 9 : 4
    u.uWind.value.set(this.windDir.x * wind + Math.sin(time * 0.7) * 1.5, this.windDir.y * wind + Math.cos(time * 0.5) * 1.5)
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 60
    u.uScale.value = pixelScale / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2))
  }

  /** 竜巻の粒の位置。渦を昇る粉雪、根元へ吸い込まれる塊、上端で振り回される塊 */
  private updateFlakes(v: Visual, center: THREE.Vector3, t: number, fade: number) {
    const rnd = this.rnd
    const R = SKILL_EFFECT.blizzardHalfWidth
    const moving = v.age < v.travel
    for (let k = 0; k < PER; k++) {
      const r0 = rnd[k * 4]
      const r1 = rnd[k * 4 + 1]
      const r2 = rnd[k * 4 + 2]
      const r3 = rnd[k * 4 + 3]
      let x: number, y: number, z: number, size: number
      if (k < SWIRL) {
        // 昇りながら回る。上ほど広く、ゆっくり回る
        const h = (r0 + t * (0.18 + r1 * 0.2)) % 1
        y = h * HEIGHT
        const rad = (BOTTOM_R + (TOP_R - BOTTOM_R) * Math.pow(h, 1.25)) * (0.75 + r2 * 0.5)
        const ang = r3 * Math.PI * 2 + t * (7 - h * 4.5)
        wobble(y, t, v.seed, this.off)
        x = Math.cos(ang) * rad + this.off.x
        z = Math.sin(ang) * rad + this.off.z
        size = 0.05 + r1 * 0.09
      } else if (k < SWIRL + INFLOW) {
        // 削った雪：通り道の幅いっぱいから、渦巻きながら根元へ吸い込まれて昇っていく（止まったら吸い込まない）
        const u = (r0 + t * (0.55 + r1 * 0.3)) % 1
        const rad = R * (1 - u) + BOTTOM_R * 1.4 * u
        const ang = r3 * Math.PI * 2 + u * 5 + t * 2.5
        y = 0.2 + u * u * 5
        x = Math.cos(ang) * rad
        z = Math.sin(ang) * rad
        size = (0.12 + r2 * 0.2) * (moving ? 1 : Math.max(0, 1 - (v.age - v.travel) * 3))
      } else {
        // 上端で振り回される大きめの塊
        const ang = r3 * Math.PI * 2 + t * (2.2 + r1)
        y = HEIGHT * (0.55 + r0 * 0.45) + Math.sin(t * 3 + r2 * 9) * 0.6
        const rad = TOP_R * (0.8 + r2 * 0.45) * (y / HEIGHT)
        wobble(y, t, v.seed, this.off)
        x = Math.cos(ang) * rad + this.off.x
        z = Math.sin(ang) * rad + this.off.z
        size = 0.18 + r1 * 0.22
      }
      const grow = Math.min(1, v.age / FADE_IN)
      tmpQ.setFromAxisAngle(UP, t * 5 + r2 * 6)
      tmpS.setScalar(size * fade)
      this.flakes.setMatrixAt(v.slot * PER + k, tmpM.compose(this.flake.set(center.x + x, y * (0.3 + 0.7 * grow), center.z + z), tmpQ, tmpS))
    }
  }
}
