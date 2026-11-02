import * as THREE from 'three'
import { SkyDome } from './skyDome'

// 空と太陽（issue #98）。明け方のトワイライト → 朝焼け → 昼 → 夕焼け → トワイライトを 10 分で一周し、夜は飛ばす。
// 太陽は冬至の神奈川工科大学（北緯 35.49°）の位置を計算して置くので、校舎の影の向きと長さは実際の冬の日に近い。
// 時刻を決めるのは呼び出し元の時計（ソロはページを開いてからの時間、タイムアタックは計測時間、マルチはルームの playTime）。

/** 一周の秒数。タイムアタック（5〜8 分）を走り終えるころに夕焼けへかかる長さ */
export const CYCLE_SECONDS = 600

const LATITUDE = THREE.MathUtils.degToRad(35.49)
/** 冬至の太陽の赤緯 */
const DECLINATION = THREE.MathUtils.degToRad(-23.44)
/**
 * ゲームの -X（北）が指している真の方位（度、東回り）。config.ts の座標は OSM の外形を 5.1° 回して軸にそろえたもの。
 * 回した向きが記録に残っていないので、太陽の向きが実物とずれていたら符号を反転する
 */
const MAP_NORTH_BEARING = 5.1

/**
 * 一周のうちの秒 → 太陽時（時）。昼は早く流し、日の出前後と日の入り前後に時間を割く。
 * 6.56 時と 17.44 時は太陽高度 -7°（ブルーアワー）で、ここで夕方から明け方へつなぐ
 */
const SCHEDULE: [number, number][] = [
  [0, 6.56],
  [35, 6.92],
  [70, 7.2],
  [110, 7.68],
  [160, 8.4],
  [330, 15.0],
  [420, 16.0],
  [480, 16.5],
  [530, 16.8],
  [565, 17.08],
  [600, 17.44],
]

export function solarHourAt(cycleTime: number): number {
  const t = THREE.MathUtils.euclideanModulo(cycleTime, CYCLE_SECONDS)
  for (let i = 1; i < SCHEDULE.length; i++) {
    const [t1, h1] = SCHEDULE[i]
    if (t <= t1) {
      const [t0, h0] = SCHEDULE[i - 1]
      return h0 + ((h1 - h0) * (t - t0)) / (t1 - t0)
    }
  }
  return SCHEDULE[SCHEDULE.length - 1][1]
}

/** 太陽時から、太陽への向き（ゲームのワールド座標、単位ベクトル）と高度（ラジアン）を出す */
export function sunDirection(hour: number, out: THREE.Vector3): number {
  const h = THREE.MathUtils.degToRad((hour - 12) * 15)
  const sinE = Math.sin(LATITUDE) * Math.sin(DECLINATION) + Math.cos(LATITUDE) * Math.cos(DECLINATION) * Math.cos(h)
  const elevation = Math.asin(sinE)
  // 北から東回りの方位
  const azimuth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(LATITUDE) - Math.tan(DECLINATION) * Math.cos(LATITUDE)) + Math.PI
  const a = azimuth - THREE.MathUtils.degToRad(MAP_NORTH_BEARING)
  const c = Math.cos(elevation)
  // ゲームでは北が -X、東が -Z
  out.set(-Math.cos(a) * c, sinE, -Math.sin(a) * c)
  return elevation
}

export type CloudKind = 'clear' | 'streak' | 'scale'
export const CLOUD_LABELS: Record<CloudKind, string> = { clear: '快晴', streak: 'すじ雲', scale: 'うろこ雲' }
const CLOUD_KINDS: CloudKind[] = ['clear', 'streak', 'scale']

/** 周回ごとの雲の型。周回の番号だけで決まるので、マルチプレイでも全員同じになる。最初の周回はすじ雲 */
export function cloudKindOf(cycle: number): CloudKind {
  if (cycle <= 0) return 'streak'
  const h = Math.sin(cycle * 127.1 + 311.7) * 43758.5453
  return CLOUD_KINDS[Math.floor((h - Math.floor(h)) * CLOUD_KINDS.length)]
}

/** 雲の量（0..1）。朝は少なく、午後から夕焼けにかけて増える。夕焼けで下から照らされた雲を見せるため */
function cloudCoverAt(kind: CloudKind, cycleTime: number): number {
  if (kind === 'clear') return 0
  const t = cycleTime / CYCLE_SECONDS
  const base = kind === 'streak' ? 0.42 : 0.5
  return base * (0.45 + 0.55 * THREE.MathUtils.smoothstep(t, 0.15, 0.7))
}

/** 太陽高度（度）ごとの色。間は線形に混ぜる。色は sRGB の 16 進 */
type Stop = {
  elevation: number
  zenith: number
  horizon: number
  /** 太陽の側の地平線 */
  glow: number
  sun: number
  /** 太陽の光の強さ（地平線の下では 0） */
  sunPower: number
  ambSky: number
  ambGround: number
  cloudLit: number
  cloudShade: number
}

const STOPS: Stop[] = [
  { elevation: -7, zenith: 0x34428a, horizon: 0x9aa0cc, glow: 0xd6a2b8, sun: 0xffb27a, sunPower: 0, ambSky: 0xa9aedb, ambGround: 0x6f7299, cloudLit: 0xc9a7c8, cloudShade: 0x8186b0 },
  { elevation: -3, zenith: 0x3d5296, horizon: 0xd99fae, glow: 0xf58e64, sun: 0xff9a5a, sunPower: 0, ambSky: 0xb4abd2, ambGround: 0x7a7096, cloudLit: 0xf79a8e, cloudShade: 0x9a8cb2 },
  { elevation: 0, zenith: 0x4f68a6, horizon: 0xf0ae94, glow: 0xff8c48, sun: 0xff8a3c, sunPower: 0.55, ambSky: 0xc2b6d2, ambGround: 0x857792, cloudLit: 0xffa070, cloudShade: 0xae93b0 },
  { elevation: 3, zenith: 0x5c7fbc, horizon: 0xf1c5a6, glow: 0xffae6a, sun: 0xffa95e, sunPower: 0.85, ambSky: 0xcbc6db, ambGround: 0x8a8194, cloudLit: 0xffc58c, cloudShade: 0xbaa9bc },
  { elevation: 8, zenith: 0x5588c6, horizon: 0xdcd8dc, glow: 0xffd7a4, sun: 0xffd09a, sunPower: 0.95, ambSky: 0xdfe0ea, ambGround: 0x8a8f9e, cloudLit: 0xfff0d8, cloudShade: 0xc9c9d6 },
  { elevation: 15, zenith: 0x4a84c8, horizon: 0xc8d6e6, glow: 0xf2eadc, sun: 0xffeacc, sunPower: 1, ambSky: 0xf2f4fa, ambGround: 0x8896a8, cloudLit: 0xffffff, cloudShade: 0xd3dae6 },
  { elevation: 30, zenith: 0x3f7cc9, horizon: 0xbcd0e6, glow: 0xe6eef6, sun: 0xfff4e6, sunPower: 1, ambSky: 0xffffff, ambGround: 0x8899aa, cloudLit: 0xffffff, cloudShade: 0xd5dde8 },
]

type ColorKey = Exclude<keyof Stop, 'elevation' | 'sunPower'>
const COLOR_KEYS: ColorKey[] = ['zenith', 'horizon', 'glow', 'sun', 'ambSky', 'ambGround', 'cloudLit', 'cloudShade']

/** 太陽高度ごとの色を線形の色空間で持っておき、毎フレームはそこから混ぜる */
const linearStops = STOPS.map((s) => ({
  elevation: s.elevation,
  sunPower: s.sunPower,
  colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, new THREE.Color(s[k])])) as Record<ColorKey, THREE.Color>,
}))

/** 自前のシェーダー（雪原・建物）で共有する光の uniform。Daylight が毎フレーム書き換える。初期値は昼 */
export const lighting = {
  /** 太陽への向き。地平線より下には向けない（影と陰影の向きに使う） */
  uSunDir: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
  /** 太陽の光（色 × 強さ。線形） */
  uSunColor: { value: new THREE.Color(0xfff4e6) },
  uAmbSky: { value: new THREE.Color(0xffffff) },
  uAmbGround: { value: new THREE.Color(0x8899aa) },
  /** ガラスに映す空の色 */
  uSkyHorizon: { value: new THREE.Color(0xbcd0e6) },
  uSkyZenith: { value: new THREE.Color(0x3f7cc9) },
}

/** 影を描く範囲の大きさ (m)。プレイ中の視点用と、キャンパス全体を見せる視点用 */
const SHADOW_NEAR_HALF = 110
const SHADOW_WIDE_HALF = 300
/** 陰影と影を作るときの太陽の高さの下限（度）。影の長さは高さの 8 倍くらいまでになる */
const MIN_LIGHT_ELEVATION = 7
/** 影を落とすものの高さの上限（K1号館 54m ＋屋上の設備） */
const CASTER_HEIGHT = 60

export type DaylightDebug = {
  /** 一周のうちの秒を固定する（null で時計どおり） */
  time: number | null
  cloud: CloudKind | 'auto'
}

export class Daylight {
  readonly sun: THREE.DirectionalLight
  readonly hemi: THREE.HemisphereLight
  readonly dome = new SkyDome()
  readonly debug: DaylightDebug = { time: null, cloud: 'auto' }
  /** 直近の update で使った一周のうちの秒と太陽時（デバッグ表示用） */
  cycleTime = 0
  hour = 0
  cloud: CloudKind = 'streak'
  /** 遠くの景色に掛けるフォグの色（カメラの向いている方角の地平線の色） */
  readonly fogColor = new THREE.Color()

  private readonly sunDir = new THREE.Vector3()
  private readonly mixed = Object.fromEntries(COLOR_KEYS.map((k) => [k, new THREE.Color()])) as Record<ColorKey, THREE.Color>
  private readonly focus = new THREE.Vector3()
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly up = new THREE.Vector3()

  constructor(scene: THREE.Scene, shadowMapSize: number) {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3)
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6)
    this.sun.castShadow = true
    const s = this.sun.shadow
    s.mapSize.set(shadowMapSize, shadowMapSize)
    s.bias = -0.0004
    s.normalBias = 0.04
    s.radius = 1.5
    scene.add(this.hemi, this.sun, this.sun.target, this.dome.mesh)
  }

  /**
   * @param clock 時計（秒）。一周 CYCLE_SECONDS で繰り返す
   * @param wide キャンパス全体を見せる視点（全体マップ・神視点・タイトル・演出）なら true。影を広い範囲に描く
   */
  update(clock: number, camera: THREE.Camera, wide: boolean) {
    const cycleTime = this.debug.time ?? THREE.MathUtils.euclideanModulo(clock, CYCLE_SECONDS)
    const cycle = this.debug.time === null ? Math.floor(clock / CYCLE_SECONDS) : 0
    this.cycleTime = cycleTime
    this.hour = solarHourAt(cycleTime)
    const elevation = THREE.MathUtils.radToDeg(sunDirection(this.hour, this.sunDir))
    this.cloud = this.debug.cloud === 'auto' ? cloudKindOf(cycle) : this.debug.cloud

    // 高度で色を混ぜる
    let i = 1
    while (i < linearStops.length - 1 && elevation > linearStops[i].elevation) i++
    const a = linearStops[i - 1]
    const b = linearStops[i]
    const k = THREE.MathUtils.clamp((elevation - a.elevation) / (b.elevation - a.elevation), 0, 1)
    for (const key of COLOR_KEYS) this.mixed[key].copy(a.colors[key]).lerp(b.colors[key], k)
    const c = this.mixed
    // 太陽は地平線に沈む少し前から暗くし、沈んだら消す
    const sunPower = THREE.MathUtils.lerp(a.sunPower, b.sunPower, k) * THREE.MathUtils.smoothstep(elevation, -0.8, 1.5)
    // 夜をはさまずに夕方から明け方へ切り替わるので、つなぎ目の前後では地平線の焼けを薄くして、焼けの方角が飛ぶのを目立たなくする
    const seam = Math.min(cycleTime, CYCLE_SECONDS - cycleTime)
    const glowAmount = (0.25 + 0.75 * THREE.MathUtils.smoothstep(seam, 0, 18)) * (1 - THREE.MathUtils.smoothstep(elevation, 6, 25) * 0.7)

    // 陰影と影の向きは、方位は太陽のままで、高さは MIN_LIGHT_ELEVATION より下げない。
    // 実際の高さで落とすと、日の出・日の入りの前後は 50m 級の棟の影が 500m を超え、キャンパスのほとんどが日陰になって夕日の当たる場所が残らないため
    const lightDir = lighting.uSunDir.value.copy(this.sunDir)
    const minY = Math.sin(THREE.MathUtils.degToRad(MIN_LIGHT_ELEVATION))
    if (lightDir.y < minY) {
      const hz = Math.hypot(lightDir.x, lightDir.z)
      lightDir.set((lightDir.x / hz) * Math.sqrt(1 - minY * minY), minY, (lightDir.z / hz) * Math.sqrt(1 - minY * minY))
    }
    lighting.uSunColor.value.copy(c.sun).multiplyScalar(sunPower)
    lighting.uAmbSky.value.copy(c.ambSky)
    lighting.uAmbGround.value.copy(c.ambGround)
    lighting.uSkyHorizon.value.copy(c.horizon).lerp(c.glow, 0.3 * glowAmount)
    lighting.uSkyZenith.value.copy(c.zenith)

    // three.js 標準のマテリアル（並木・小物・プレイヤー）用のライト
    this.hemi.color.copy(c.ambSky)
    this.hemi.groundColor.copy(c.ambGround)
    this.sun.color.copy(c.sun)
    // 沈んでいる間も castShadow は切らない。切り替えると全マテリアルのシェーダーが作り直されて、日の出・日の入りのたびに止まるため
    this.sun.intensity = 1.6 * sunPower

    // フォグは、カメラの向いている方角の地平線の色（空のドームと同じ式）にする。夕日のほうを向くと遠景が焼けて見える
    camera.getWorldDirection(this.forward)
    this.fogColor.copy(c.horizon).lerp(c.glow, SkyDome.glowAt(this.forward, this.sunDir, glowAmount))
    this.dome.setFogColor(this.fogColor)

    this.dome.update(camera, {
      sunDir: this.sunDir,
      sunVisible: THREE.MathUtils.smoothstep(elevation, -1.2, 0.3),
      zenith: c.zenith,
      horizon: c.horizon,
      glow: c.glow,
      glowAmount,
      sun: c.sun,
      cloudLit: c.cloudLit,
      cloudShade: c.cloudShade,
      cloudKind: this.cloud,
      cloudCover: cloudCoverAt(this.cloud, cycleTime),
      // 雲の流れは時計で決める（マルチプレイで全員そろうように）
      cloudTime: this.debug.time ?? clock,
    })

    this.placeShadow(camera, wide, lightDir)
  }

  /**
   * 影を描く範囲をカメラの見ているあたりに合わせる。範囲の中心はテクセルの格子にそろえて、動いたときに影の縁がちらつかないようにする。
   * 光から見て、太陽の方角に沿った向きは地面が sin(高度) に縮んで見えるので、その向きだけ範囲を狭めて解像度を稼ぐ
   */
  private placeShadow(camera: THREE.Camera, wide: boolean, lightDir: THREE.Vector3) {
    const half = wide ? SHADOW_WIDE_HALF : SHADOW_NEAR_HALF
    camera.getWorldDirection(this.forward)
    const flat = Math.hypot(this.forward.x, this.forward.z)
    // カメラの前方、少し先を中心にする
    const ahead = wide ? 0 : half * 0.45
    this.focus.copy(camera.position).setY(0)
    if (flat > 1e-3) {
      this.focus.x += (this.forward.x / flat) * ahead
      this.focus.z += (this.forward.z / flat) * ahead
    }

    const cam = this.sun.shadow.camera
    const sinE = lightDir.y
    const cosE = Math.sqrt(1 - sinE * sinE)
    const halfAlong = half * sinE + CASTER_HEIGHT * cosE
    cam.left = -half
    cam.right = half
    cam.top = halfAlong
    cam.bottom = -halfAlong
    // 地平線すれすれの太陽では、遠くの高い棟からの影も届くように光源を離す
    const distance = CASTER_HEIGHT / Math.max(sinE, 0.03) + 50
    cam.near = 1
    cam.far = distance + half + CASTER_HEIGHT

    // 光から見た横軸・縦軸で中心をテクセルの格子にそろえる
    this.right.crossVectors(lightDir, THREE.Object3D.DEFAULT_UP).normalize()
    this.up.crossVectors(this.right, lightDir).normalize()
    const size = this.sun.shadow.mapSize.x
    const snapX = (2 * half) / size
    const snapY = (2 * halfAlong) / size
    const x = this.focus.dot(this.right)
    const y = this.focus.dot(this.up)
    this.focus.addScaledVector(this.right, Math.round(x / snapX) * snapX - x).addScaledVector(this.up, Math.round(y / snapY) * snapY - y)

    this.sun.target.position.copy(this.focus)
    this.sun.position.copy(this.focus).addScaledVector(lightDir, distance)
    this.sun.target.updateMatrixWorld()
    cam.updateProjectionMatrix()
  }
}

/** 自前のシェーダーに影を組み込むための uniform（three.js のライトの uniform）。ShaderMaterial に lights: true と一緒に渡す */
export function lightUniforms() {
  return THREE.UniformsUtils.clone(THREE.UniformsLib.lights)
}

/** 標準のマテリアルでできた物（並木・小物・プレイヤー・除雪機）に影を落とさせ、受けさせる。光らない物と半透明の物は影を落とさない */
export function enableShadows(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material]
    const lit = mats.every((m) => !(m instanceof THREE.MeshBasicMaterial))
    o.castShadow = lit && mats.every((m) => !m.transparent)
    o.receiveShadow = lit
  })
}
