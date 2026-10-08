import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PLAYER, WORLD } from './config'
import { createGame, distanceToBuilding, stepGame } from './sim/game'
import { SnowSurface } from './render/snowSurface'
import { Monolith } from './render/monolith'
import { PlayerView } from './render/playerView'
import { Projectiles, Sparkles, Suction } from './render/effects'
import { Input } from './input'
import { Hud } from './hud'

// ?view=god で展示用の神視点（自動周回）カメラ
const isGodView = new URLSearchParams(location.search).get('view') === 'god'

const app = document.querySelector<HTMLDivElement>('#app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xb9cbe0)
scene.fog = new THREE.Fog(0xb9cbe0, 55, 140)
const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize()
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3))
const sun = new THREE.DirectionalLight(0xffffff, 1.6)
sun.position.copy(sunDir).multiplyScalar(30)
scene.add(sun)

const state = createGame()

const snow = new SnowSurface(state.field, sunDir)
scene.add(snow.mesh)
// 雪原の外側（回収できない背景の雪面）。高さは雪原外周の初期値 0.75 に合わせる
const outer = new THREE.Mesh(
  new THREE.RingGeometry(WORLD.size * 0.7, 160, 4, 1, Math.PI / 4),
  // 日向の雪面（SnowSurface の平地）とほぼ同じ色を無ライティングで出す
  new THREE.MeshBasicMaterial({ color: 0xf0f3fa }),
)
outer.rotation.x = -Math.PI / 2
outer.position.y = 0.75 * WORLD.snowMaxHeight
scene.add(outer)

const playerView = new PlayerView()
const suction = new Suction()
const sparkles = new Sparkles()
const projectiles = new Projectiles()
scene.add(playerView.group, suction.mesh, sparkles.mesh, projectiles.mesh)

type BuildingView = {
  monolith: Monolith
  /** 表示上の進捗（飛行中の雪玉を除いた量に滑らかに追従） */
  display: number
  /** 飛行中の雪玉に載っている雪の量 */
  inFlight: number
  /** カラー化の進捗。-1 は未開始 */
  colorize: number
}
const buildingViews = new Map<string, BuildingView>()
for (const b of state.buildings) {
  const view = { monolith: new Monolith(b, sunDir), display: 0, inFlight: 0, colorize: -1 }
  buildingViews.set(b.id, view)
  scene.add(view.monolith.group)
}

const input = new Input(renderer.domElement, !isGodView)
const hud = new Hud(document.body)

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300)
const controls = isGodView ? new OrbitControls(camera, renderer.domElement) : null
if (controls) {
  camera.position.set(0, 38, 40)
  controls.target.set(0, 2, -4)
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.6
  controls.enableDamping = true
}

function resize() {
  const { clientWidth: w, clientHeight: h } = app
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

const tmp = new THREE.Vector3()
const packPos = new THREE.Vector3()
const lookAt = new THREE.Vector3(state.player.x, 0, state.player.z)
const lookTarget = new THREE.Vector3()
let last = performance.now()
let suckBudget = 0

renderer.setAnimationLoop((now: number) => {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  const time = now / 1000

  const move = input.move()
  const events = stepGame(state, move, dt)
  const p = state.player

  playerView.update(dt, p, state.field, Math.hypot(move.x, move.z) > 0.05)
  playerView.packWorldPosition(packPos)

  for (const e of events) {
    if (e.type === 'collect') {
      suckBudget += e.amount * 2.5
    } else if (e.type === 'throw') {
      const b = state.buildings.find((b) => b.id === e.buildingId)!
      const view = buildingViews.get(b.id)!
      view.inFlight += e.amount
      const to = new THREE.Vector3(
        b.x + (Math.random() - 0.5) * b.width * 0.8,
        Math.max(0.3, view.monolith.topY) + 0.2,
        b.z + (Math.random() - 0.5) * b.depth * 0.8,
      )
      projectiles.launch(packPos, to, () => {
        view.inFlight = Math.max(0, view.inFlight - e.amount)
        sparkles.burst(to, 5, 0xffffff, 3)
      })
    }
    // 'complete' は雪玉の着弾と表示の追従を待ってから演出するので、ここでは何もしない
  }

  // 削った場所から雪の粒を湧かせる
  for (let n = 0; suckBudget >= 1 && n < 40; n++, suckBudget--) {
    const a = Math.random() * Math.PI * 2
    const r = PLAYER.collectRadius * Math.sqrt(Math.random())
    tmp.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r)
    tmp.y = state.field.amountAt(tmp.x, tmp.z) * WORLD.snowMaxHeight + 0.05
    suction.spawn(tmp)
  }
  suckBudget = Math.min(suckBudget, 40)

  for (const b of state.buildings) {
    const view = buildingViews.get(b.id)!
    const target = Math.min(1, Math.max(0, (b.deposited - view.inFlight) / b.required))
    const prev = view.display
    view.display += (target - view.display) * Math.min(1, dt * 6)
    if (Math.abs(target - view.display) < 1e-4) view.display = target

    // せり上がるときに足元から雪煙
    const rise = view.display - prev
    if (rise > 0) {
      const count = Math.min(6, Math.ceil(rise * 400))
      for (let n = 0; n < count; n++) {
        const edge = Math.random() < 0.5
        tmp.set(
          b.x + (edge ? (Math.random() - 0.5) * b.width : Math.sign(Math.random() - 0.5) * b.width / 2),
          0.1,
          b.z + (edge ? Math.sign(Math.random() - 0.5) * b.depth / 2 : (Math.random() - 0.5) * b.depth),
        )
        sparkles.burst(tmp, 1, 0xf4f8ff, 2)
      }
    }

    if (view.colorize < 0 && b.completed && view.inFlight < 1e-6 && view.display >= 0.999) {
      view.colorize = 0
      for (let n = 0; n < 12; n++) {
        tmp.set(b.x + (Math.random() - 0.5) * b.width, Math.random() * b.height, b.z + b.depth / 2 + 0.3)
        sparkles.burst(tmp, 8, n % 2 ? 0xffd36e : 0xfff4c2, 5)
      }
      hud.toast(`${b.label}が復活した！`)
    } else if (view.colorize >= 0 && view.colorize < 1) {
      view.colorize = Math.min(1, view.colorize + dt / 2.5)
      if (Math.random() < 0.5) {
        tmp.set(b.x + (Math.random() - 0.5) * b.width, view.colorize * b.height, b.z + b.depth / 2 + 0.2)
        sparkles.burst(tmp, 2, 0xffd36e, 2.5)
      }
    }

    const inZone = !b.completed && distanceToBuilding(b, p.x, p.z) <= b.dropRange
    view.monolith.update(time, view.display, Math.max(0, view.colorize), inZone)
  }

  suction.update(dt, packPos)
  sparkles.update(dt)
  projectiles.update(dt)
  snow.update(time, p.x, p.z, PLAYER.collectRadius)

  const main = buildingViews.get(state.buildings[0].id)!
  hud.update(p.carried, p.capacity, main.display)

  if (controls) {
    controls.update()
  } else {
    // 縦持ち（狭い画角）では少し引いて周囲が見えるようにする。
    // 建物に近づいたら、せり上がる様子が画面に収まるよう引きつつ注視点を建物へ寄せる
    let near = 0
    let focus: (typeof state.buildings)[number] | null = null
    for (const b of state.buildings) {
      const w = Math.min(1, Math.max(0, 1 - (distanceToBuilding(b, p.x, p.z) - b.dropRange) / 8))
      if (w > near) {
        near = w
        focus = b
      }
    }
    const portrait = camera.aspect < 1
    const offset = portrait ? tmp.set(0, 19, 16) : tmp.set(0, 12, 13)
    offset.multiplyScalar(1 + near * (portrait ? 0.6 : 0.45))
    const k = 1 - Math.exp(-dt * 4)
    camera.position.lerp(offset.add(playerView.group.position), k)
    lookTarget.copy(playerView.group.position)
    if (focus) lookTarget.lerp(tmp.set(focus.x, focus.height * 0.35, focus.z), near * 0.5)
    lookAt.lerp(lookTarget, k)
    camera.lookAt(lookAt.x, lookAt.y + 0.5, lookAt.z - 1)
  }

  renderer.render(scene, camera)
})

// 開発時のみ、コンソールから状態をいじれるようにする（例: game.buildings[0].deposited = 890）
if (import.meta.env.DEV) Object.assign(window, { game: state })
