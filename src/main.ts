import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { FX, UPGRADES, WORLD, type UpgradeId } from './config'
import {
  buyUpgrade,
  createGame,
  currentBuilding,
  distanceToBuilding,
  stats,
  stepGame,
  type Building,
  type GameEvent,
} from './sim/game'
import { SnowSurface } from './render/snowSurface'
import { Monolith } from './render/monolith'
import { PlayerView } from './render/playerView'
import { Projectiles, Sparkles, Suction } from './render/effects'
import { UnitsView } from './render/units'
import { BuildingLabels } from './render/buildingLabels'
import { Input } from './input'
import { Hud } from './hud'
import { Shop } from './shop'
import { Minimap } from './minimap'
import { CameraRig, type Shot, type ViewMode } from './camera'
import { createDebugGui } from './debugGui'
import { clearStorage, loadFromStorage, saveToStorage } from './save'
import { playCoin, playFanfare, unlockAudio } from './audio'

// ?view=god で展示用の神視点（自動周回）カメラ、?debug で lil-gui の調整パネル
const params = new URLSearchParams(location.search)
const isGodView = params.get('view') === 'god'

const app = document.querySelector<HTMLDivElement>('#app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xb9cbe0)
const fog = new THREE.Fog(0xb9cbe0, 55, 140)
scene.fog = fog
const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize()
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3))
const sun = new THREE.DirectionalLight(0xffffff, 1.6)
sun.position.copy(sunDir).multiplyScalar(30)
scene.add(sun)

const state = createGame()
const resumed = loadFromStorage(state)

const snow = new SnowSurface(state.field, sunDir)
scene.add(snow.mesh)
// 雪原の外側（回収できない背景の雪面）。高さは雪原外周の初期値 0.75 に合わせる
const outer = new THREE.Mesh(
  new THREE.RingGeometry(WORLD.size * 0.7, 400, 4, 1, Math.PI / 4),
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
const units = new UnitsView()
scene.add(playerView.group, suction.mesh, sparkles.mesh, projectiles.mesh, units.group)

type BuildingView = {
  monolith: Monolith
  /** 表示上の進捗（飛行中の雪玉を除いた量に滑らかに追従） */
  display: number
  /** 飛行中の雪玉に載っている雪の量 */
  inFlight: number
  /** カラー化の進捗。-1 は未開始 */
  colorize: number
  /** 完成演出を始めたか */
  celebrated: boolean
  /** 演出開始からカラー化が始まるまでの待ち（カメラが建物に着くのを待つ） */
  hold: number
}
const buildingViews = new Map<string, BuildingView>()
state.buildings.forEach((b, i) => {
  // セーブから再開した場合、完成済みの建物は最初からカラーで建っている
  const view: BuildingView = {
    monolith: new Monolith(b, i, sunDir),
    display: b.deposited / b.required,
    inFlight: 0,
    colorize: b.completed ? 1 : -1,
    celebrated: b.completed,
    hold: 0,
  }
  buildingViews.set(b.id, view)
  scene.add(view.monolith.group)
})

const labels = new BuildingLabels(scene, state.buildings)

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200)
const rig = new CameraRig(camera)
try {
  rig.mode = (localStorage.getItem('snow-campus-view') as ViewMode | null) ?? 'top'
} catch {
  // 視点の記憶は無くても困らない
}
const controls = isGodView ? new OrbitControls(camera, renderer.domElement) : null
if (controls) {
  camera.position.set(0, 70, 75)
  controls.target.set(0, 2, 0)
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.6
  controls.enableDamping = true
  fog.near = 150
  fog.far = 400
}

const input = new Input(renderer.domElement, !isGodView)
const hud = new Hud(document.body)
// 購入で発生したイベントも、stepGame のイベントと同じ経路で処理する
const pendingEvents: GameEvent[] = []
let resetting = false
function resetSave() {
  resetting = true
  clearStorage()
  location.reload()
}
const shop = isGodView ? null : new Shop(document.body, (id) => pendingEvents.push(...buyUpgrade(state, id)), resetSave)
const minimap = new Minimap(document.body, () => toggleOverview())
unlockAudio()

// 画面左下の視点ボタン
const viewBar = document.createElement('div')
viewBar.id = 'view-bar'
viewBar.innerHTML = `<button data-view></button><button data-map>全体マップ <kbd>M</kbd></button>`
document.body.appendChild(viewBar)
const viewButton = viewBar.querySelector<HTMLButtonElement>('[data-view]')!
viewButton.addEventListener('click', () => toggleView())
viewBar.querySelector('[data-map]')!.addEventListener('click', () => toggleOverview())
if (isGodView) document.body.classList.add('god-view')

function refreshViewButton() {
  viewButton.innerHTML = `${rig.mode === 'top' ? '見下ろし' : 'グランド'} <kbd>V</kbd>`
  document.body.classList.toggle('overview', rig.overview)
}
function toggleView() {
  rig.toggleMode()
  try {
    localStorage.setItem('snow-campus-view', rig.mode)
  } catch {
    // 同上
  }
  refreshViewButton()
}
function toggleOverview() {
  if (rig.cinematic) return
  rig.overview = !rig.overview
  input.release()
  refreshViewButton()
}
refreshViewButton()

addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (rig.cinematic && rig.cinematicElapsed > 2.5) rig.skipCinematic()
  else if (e.code === 'KeyV') toggleView()
  else if (e.code === 'KeyM') toggleOverview()
})
// 俯瞰中は画面タップで戻る。演出は少し見せてからタップでスキップできる
renderer.domElement.addEventListener('pointerdown', () => {
  if (rig.overview) toggleOverview()
  else if (rig.cinematic && rig.cinematicElapsed > 2.5) rig.skipCinematic()
})

if (params.has('debug')) {
  createDebugGui(state, {
    replayColorize: () => {
      for (const view of buildingViews.values()) if (view.colorize >= 0) view.colorize = 0
    },
    resetSave,
  })
}

// オートセーブ：10秒ごと、タブを離れたとき、購入・完成のとき。神視点（展示用）は保存しない
function save() {
  if (!resetting && !isGodView) saveToStorage(state)
}
setInterval(save, 10_000)
addEventListener('pagehide', save)
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save())
if (resumed) hud.toast('続きから再開！', 1500)

function resize() {
  const { clientWidth: w, clientHeight: h } = app
  renderer.setSize(w, h)
  labels.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

/** 完成演出のカット割り：完成した建物を正面から → 次の建物（なければキャンパス全体） */
function celebrationShots(b: Building): Shot[] {
  const portrait = camera.aspect < 1
  const dist = (Math.max(b.width, b.height) * 1.1 + 5) * (portrait ? 1.7 : 1)
  const shots: Shot[] = [
    {
      pos: new THREE.Vector3(b.x + dist * 0.25, b.height * 0.5 + 2, b.z + b.depth / 2 + dist),
      look: new THREE.Vector3(b.x, b.height * 0.45, b.z),
      duration: 1 + FX.colorizeSeconds + 1.8,
    },
  ]
  const next = currentBuilding(state)
  if (next) {
    const d = (portrait ? 26 : 16) + next.height
    shots.push({
      pos: new THREE.Vector3(next.x + d * 0.3, d * 0.8, next.z + next.depth / 2 + d),
      look: new THREE.Vector3(next.x, next.height * 0.3, next.z),
      duration: 2.8,
      onStart: () => hud.toast(`次は「${next.label}」！ 光の柱が目印`, 2600),
    })
  } else {
    shots.push({
      pos: new THREE.Vector3(0, 55, 70),
      look: new THREE.Vector3(0, 4, 0),
      duration: 4,
      onStart: () => hud.toast('キャンパスが全部復活した！', 3800),
    })
  }
  return shots
}

const tmp = new THREE.Vector3()
const packPos = new THREE.Vector3()
const focusPos = new THREE.Vector3()
let last = performance.now()
let suckBudget = 0

renderer.setAnimationLoop((now: number) => {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  const time = now / 1000

  if (!isGodView) rig.turn(-input.turn() * dt * 2)
  const move = rig.inputLocked ? { x: 0, z: 0 } : rig.toWorld(input.move())
  const events = [...pendingEvents.splice(0), ...stepGame(state, move, dt)]
  const p = state.player
  const st = stats(state)
  const moving = Math.min(1, Math.hypot(move.x, move.z))

  playerView.update(dt, p, state.field, moving > 0.05)
  playerView.packWorldPosition(packPos)

  for (const e of events) {
    if (e.type === 'collect') {
      suckBudget += e.amount * FX.suctionPerSnow
    } else if (e.type === 'upgrade') {
      hud.toast(`${UPGRADES[e.id].label} Lv${e.level}！`, 1200)
      sparkles.burst(packPos, 24, 0xffd36e, 4)
      playCoin()
      save()
    } else if (e.type === 'complete') {
      // 完成演出自体は雪玉の着弾と表示の追従を待ってから（下のループ）
      save()
    } else if (e.type === 'throw') {
      const b = state.buildings.find((b) => b.id === e.buildingId)!
      const view = buildingViews.get(b.id)!
      const to = new THREE.Vector3(
        b.x + (Math.random() - 0.5) * b.width * 0.8,
        Math.max(0.3, view.monolith.topY) + 0.2,
        b.z + (Math.random() - 0.5) * b.depth * 0.8,
      )
      const from = e.from ? units.plowPosition(e.from.plowId, tmp) : packPos
      if (!from) continue
      view.inFlight += e.amount
      projectiles.launch(from, to, () => {
        view.inFlight = Math.max(0, view.inFlight - e.amount)
        sparkles.burst(to, 5, 0xffffff, 3)
      }, Math.min(2, Math.sqrt(e.amount / 4)))
    }
  }

  // 削った場所から雪の粒を湧かせる
  for (let n = 0; suckBudget >= 1 && n < 40; n++, suckBudget--) {
    const a = Math.random() * Math.PI * 2
    const r = st.collectRadius * Math.sqrt(Math.random())
    tmp.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r)
    tmp.y = state.field.amountAt(tmp.x, tmp.z) * WORLD.snowMaxHeight + 0.05
    suction.spawn(tmp)
  }
  suckBudget = Math.min(suckBudget, 40)

  const current = currentBuilding(state)
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

    if (!view.celebrated && b.completed && view.inFlight < 1e-6 && view.display >= 0.999) {
      // 完成！ カメラを建物へ飛ばして、着いた頃にカラー化を始める
      view.celebrated = true
      view.hold = isGodView ? 0 : 1
      input.release()
      if (!isGodView) rig.play(celebrationShots(b))
    } else if (view.celebrated && view.colorize < 0) {
      view.hold -= dt
      if (view.hold <= 0) {
        view.colorize = 0
        for (let n = 0; n < 14; n++) {
          tmp.set(b.x + (Math.random() - 0.5) * b.width, Math.random() * b.height, b.z + b.depth / 2 + 0.3)
          sparkles.burst(tmp, 8, n % 2 ? 0xffd36e : 0xfff4c2, 5)
        }
        playFanfare()
        hud.toast(`てってれ～！ ${b.label} 完成！`, 3000)
      }
    } else if (view.colorize >= 0 && view.colorize < 1) {
      view.colorize = Math.min(1, view.colorize + dt / FX.colorizeSeconds)
      if (Math.random() < 0.6) {
        tmp.set(b.x + (Math.random() - 0.5) * b.width, view.colorize * b.height, b.z + b.depth / 2 + 0.2)
        sparkles.burst(tmp, 2, 0xffd36e, 2.5)
      }
    }

    const stage = b.completed ? 'done' : b === current ? 'current' : 'locked'
    const inZone = stage === 'current' && distanceToBuilding(b, p.x, p.z) <= b.dropRange
    view.monolith.update(time, view.display, Math.max(0, view.colorize), stage, inZone)
    labels.update(b, stage, view.display, view.monolith.topY, camera)
  }

  suction.update(dt, packPos)
  sparkles.update(dt)
  projectiles.update(dt)
  units.update(dt, time, state.plows, state.machines, (pos) => sparkles.burst(tmp.copy(pos).setY(1), 30, 0xbfe3ff, 5))
  snow.update(time, p.x, p.z, st.collectRadius)

  // HUD の進捗は「いま建てている建物」（全部完成したら最後の建物）
  const shown = current ?? state.buildings[state.buildings.length - 1]
  hud.update(dt, p.carried, p.capacity, shown.label, buildingViews.get(shown.id)!.display, state.gold)
  shop?.update(state)
  minimap.update(dt, time, state, rig.mode === 'ground' && !rig.overview ? rig.yaw : null)
  document.body.classList.toggle('cinematic', rig.cinematic)

  if (controls) {
    controls.update()
  } else {
    // 見下ろしで、いま建てている建物に近づいたら引きのアングルにする
    let near = 0
    if (current) {
      near = Math.min(1, Math.max(0, 1 - (distanceToBuilding(current, p.x, p.z) - current.dropRange) / 8))
      focusPos.set(current.x, current.height * 0.35, current.z)
    }
    rig.update(dt, {
      player: playerView.group.position,
      facing: p.facing,
      moving,
      focus: current ? focusPos : null,
      near,
      blocked: (q) =>
        state.buildings.some(
          (b) =>
            Math.abs(q.x - b.x) < b.width / 2 + 0.4 &&
            Math.abs(q.z - b.z) < b.depth / 2 + 0.4 &&
            q.y < buildingViews.get(b.id)!.monolith.topY + 0.4,
        ),
      worldSize: WORLD.size,
    })
    fog.near = rig.fog.near
    fog.far = rig.fog.far
  }

  renderer.render(scene, camera)
  labels.render(scene, camera)
})

// 開発時のみ、コンソールから状態をいじれるようにする（例: game.buildings[0].deposited = 890, buy('plow')）
if (import.meta.env.DEV) {
  Object.assign(window, { game: state, rig, buy: (id: UpgradeId) => pendingEvents.push(...buyUpgrade(state, id)) })
}
