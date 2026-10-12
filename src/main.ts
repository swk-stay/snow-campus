import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { FX, ITEMS, PLAYER, SKILL_EFFECT, SKILLS, TIME_ATTACK, UPGRADES, WORLD, type UpgradeId } from './config'
import {
  buyItem,
  buyUpgrade,
  createGame,
  currentBuilding,
  distanceToBuilding,
  stats,
  stepGame,
  useSkill,
  type Building,
  type GameEvent,
} from './sim/game'
import { SnowSurface } from './render/snowSurface'
import { Monolith } from './render/monolith'
import { PlayerView } from './render/playerView'
import { Projectiles, Scoop, Sparkles } from './render/effects'
import { UnitsView } from './render/units'
import { BuildingLabels } from './render/buildingLabels'
import { RareView } from './render/rareView'
import { SkillBar } from './skillBar'
import { Input } from './input'
import { Hud } from './hud'
import { Shop, type ShopAction } from './shop'
import { TimeAttack } from './timeAttack'
import { Minimap } from './minimap'
import { CameraRig, type Shot, type ViewMode } from './camera'
import { createDebugGui } from './debugGui'
import { clearStorage, loadFromStorage, saveToStorage } from './save'
import { playCoin, playFanfare, unlockAudio } from './audio'

// ?view=god で展示用の神視点（自動周回）カメラ、?debug で lil-gui の調整パネル、
// ?mode=timeattack でタイムアタック（セーブを読まずに最初から始め、セーブもしない）
const params = new URLSearchParams(location.search)
const isGodView = params.get('view') === 'god'
const isTimeAttack = !isGodView && params.get('mode') === 'timeattack'

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
const resumed = !isTimeAttack && loadFromStorage(state)

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
const scoop = new Scoop()
const sparkles = new Sparkles()
const projectiles = new Projectiles()
const units = new UnitsView()
const rareView = new RareView()
scene.add(playerView.group, scoop.mesh, sparkles.mesh, projectiles.mesh, units.group, rareView.group)

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
/** 通常モードとタイムアタックの切り替え。どちらもページを読み直す（通常モードのセーブは pagehide で保存される） */
function switchMode(timeAttack: boolean) {
  const url = new URL(location.href)
  if (timeAttack) url.searchParams.set('mode', 'timeattack')
  else url.searchParams.delete('mode')
  location.href = url.href
}
const timeAttack = isTimeAttack
  ? new TimeAttack(document.body, hud.el, state.buildings.slice(0, TIME_ATTACK.goal), {
      retry: () => location.reload(),
      quit: () => switchMode(false),
    })
  : null
const shopActions: ShopAction[] = isTimeAttack
  ? [
      { label: '最初からやり直す', onClick: () => location.reload(), confirm: 'タイムアタックを最初からやり直しますか？' },
      { label: 'タイムアタックをやめる', onClick: () => switchMode(false), confirm: 'タイムアタックをやめて通常モードに戻りますか？', danger: true },
    ]
  : [
      { label: 'タイムアタックに挑戦', onClick: () => switchMode(true), confirm: '最初の状態からタイムアタックを始めますか？（いまのセーブはそのまま残ります）' },
      // 学園祭で次の人に渡すときなどに使う
      { label: 'セーブを消して最初から', onClick: resetSave, confirm: 'セーブデータを消して最初からやり直しますか？', danger: true },
    ]
const shop = isGodView
  ? null
  : new Shop(
      document.body,
      (id) => pendingEvents.push(...buyUpgrade(state, id)),
      (id) => pendingEvents.push(...buyItem(state, id)),
      shopActions,
    )
/** 演出中・全体マップ中・タイムアタックのカウントダウン中は操作できない */
const inputLocked = () => rig.inputLocked || !!timeAttack?.locked
const skillBar = isGodView ? null : new SkillBar(document.body, (id) => !inputLocked() && pendingEvents.push(...useSkill(state, id)))
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

// 完成演出をスキップできるまでの秒数。タイムアタック中は演出の間もタイムが進むので、すぐスキップできる
const skipAfter = isTimeAttack ? 0.3 : 2.5
addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (rig.cinematic && rig.cinematicElapsed > skipAfter) rig.skipCinematic()
  else if (e.code === 'KeyV') toggleView()
  else if (e.code === 'KeyM') toggleOverview()
})
// 俯瞰中は画面タップで戻る。演出は少し見せてからタップでスキップできる
renderer.domElement.addEventListener('pointerdown', () => {
  if (rig.overview) toggleOverview()
  else if (rig.cinematic && rig.cinematicElapsed > skipAfter) rig.skipCinematic()
})

if (params.has('debug')) {
  createDebugGui(state, {
    replayColorize: () => {
      for (const view of buildingViews.values()) if (view.colorize >= 0) view.colorize = 0
    },
    resetSave,
  })
}

// オートセーブ：10秒ごと、タブを離れたとき、購入・完成のとき。神視点（展示用）とタイムアタックは保存しない
function save() {
  if (!resetting && !isGodView && !isTimeAttack) saveToStorage(state)
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

/** スキル発動時の演出（sim 側の効果とは別。見た目と音だけ） */
function playSkillEffect(id: keyof typeof SKILLS, amount?: number) {
  const pos = playerView.group.position
  if (id === 'dash') {
    sparkles.burst(tmp.copy(pos).setY(0.5), 20, 0xdff4ff, 5)
  } else if (id === 'boost') {
    sparkles.burst(tmp.copy(pos).setY(1), 30, 0xffd36e, 4)
    hud.toast(`ブースト！ ${SKILL_EFFECT.boostTime}秒間スピードアップ`, 1200)
  } else if (id === 'longThrow') {
    hud.toast(`遠投！ +${Math.floor(amount ?? 0)}`, 1200)
  } else if (id === 'blizzard') {
    // 半径いっぱいから雪を巻き上げる
    const r = SKILL_EFFECT.blizzardRadius
    for (let n = 0; n < 60; n++) {
      const a = (n / 60) * Math.PI * 2
      tmp.set(pos.x + Math.cos(a) * r * Math.sqrt(Math.random()), 0.5, pos.z + Math.sin(a) * r * Math.sqrt(Math.random()))
      sparkles.burst(tmp, 3, 0xffffff, 6)
      scoop.spawn(tmp, packPos, Math.random() * 0.4)
    }
    playFanfare()
    hud.toast(`ブリザード！！ +${Math.floor(amount ?? 0)}`, 2000)
  }
}

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
let scoopBudget = 0

renderer.setAnimationLoop((now: number) => {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  const time = now / 1000

  timeAttack?.update(dt, rig.cinematic)
  if (!isGodView) rig.turn(-input.turn() * dt * 2)
  const move = inputLocked() ? { x: 0, z: 0 } : rig.toWorld(input.move())
  // カウントダウン中はゲームの時間を止める
  const events = [...pendingEvents.splice(0), ...stepGame(state, move, timeAttack?.locked ? 0 : dt)]
  const p = state.player
  const st = stats(state)
  const moving = Math.min(1, Math.hypot(move.x, move.z))

  playerView.update(dt, p, state.field, moving > 0.05)
  playerView.packWorldPosition(packPos)

  for (const e of events) {
    if (e.type === 'collect') {
      scoopBudget += e.amount * FX.scoopPerSnow
    } else if (e.type === 'upgrade') {
      hud.toast(`${UPGRADES[e.id].label} Lv${e.level}！`, 1200)
      sparkles.burst(packPos, 24, 0xffd36e, 4)
      playCoin()
      save()
    } else if (e.type === 'item') {
      hud.toast(`${ITEMS[e.id].label} を手に入れた！`, 1800)
      sparkles.burst(packPos, 30, 0x9ff0ff, 4)
      playCoin()
      save()
    } else if (e.type === 'skill') {
      playSkillEffect(e.id, e.amount)
    } else if (e.type === 'skillFail') {
      hud.toast(`${SKILLS[e.id].label}：${e.reason}`, 1200)
      skillBar?.shake(e.id)
    } else if (e.type === 'rarePickup') {
      sparkles.burst(tmp.set(e.x, 1, e.z), 24, 0x7fe9ff, 4)
      hud.toast('レア雪ゲット！', 900)
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
        sparkles.burst(to, e.rare ? 14 : 5, e.rare ? 0x7fe9ff : 0xffffff, 3)
      }, e.rare ? 1.6 : Math.min(2.5, Math.sqrt(e.amount / 4)), e.rare ? 0x7fe9ff : 0xffffff)
    }
  }

  // 削った場所（前方の扇形）から雪をすくい上げ、肩越しに背中へ放り込む。
  // 1か所から数粒ずつ時間差で出して「ひとすくい」の塊に見せる
  const halfArc = (Math.min(360, PLAYER.collectArc) * Math.PI) / 360
  scoopBudget = Math.min(scoopBudget, 40)
  while (scoopBudget >= 1) {
    const a = p.facing + (Math.random() * 2 - 1) * halfArc
    // 手前ほど多く削れるので、粒も手前寄りに出す
    const r = st.collectRadius * (0.25 + 0.75 * Math.random() ** 1.5)
    const x = p.x + Math.sin(a) * r
    const z = p.z + Math.cos(a) * r
    const clump = Math.min(Math.floor(scoopBudget), 3 + Math.floor(Math.random() * 3))
    scoopBudget -= clump
    for (let k = 0; k < clump; k++) {
      tmp.set(x + (Math.random() - 0.5) * 0.3, 0, z + (Math.random() - 0.5) * 0.3)
      tmp.y = state.field.amountAt(tmp.x, tmp.z) * WORLD.snowMaxHeight + 0.03
      scoop.spawn(tmp, packPos, k * 0.03)
    }
    // すくった跡に小さな雪しぶき
    sparkles.burst(tmp, 1, 0xf4f8ff, 1.5)
  }

  const current = currentBuilding(state)
  // 見た目上の「いま建てている建物」。sim は雪玉を投げた瞬間に加算・完成判定するが、
  // 表示は雪玉の着弾を待って伸びるので、完成演出が始まるまでは前の建物を「建設中」として見せ続ける
  // （sim の completed で切り替えると、95% くらいで「完成」表示・次の建物へ切り替わってしまう）
  const shownCurrent = state.buildings.find((b) => !buildingViews.get(b.id)!.celebrated) ?? null
  for (const b of state.buildings) {
    const view = buildingViews.get(b.id)!
    const target = Math.min(1, Math.max(0, (b.deposited - view.inFlight) / b.required))
    const prev = view.display
    // 指数的に近づけるだけだと 99% 付近で長く粘るので、最低速度（毎秒 15%）も保証する
    const gap = target - view.display
    const step = Math.max(Math.abs(gap) * Math.min(1, dt * 6), dt * 0.15)
    view.display = Math.abs(gap) <= step ? target : view.display + Math.sign(gap) * step

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
      timeAttack?.complete(b.id)
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

    const stage = view.celebrated ? 'done' : b === shownCurrent ? 'current' : 'locked'
    const inZone = b === current && distanceToBuilding(b, p.x, p.z) <= b.dropRange
    view.monolith.update(time, view.display, Math.max(0, view.colorize), stage, inZone)
    labels.update(b, stage, view.display, view.monolith.topY, camera)
  }

  scoop.update(dt, packPos)
  sparkles.update(dt)
  projectiles.update(dt)
  units.update(dt, time, state.plows, state.machines, (pos) => sparkles.burst(tmp.copy(pos).setY(1), 30, 0xbfe3ff, 5))
  snow.update(time, p.x, p.z, st.collectRadius, p.facing, (PLAYER.collectArc * Math.PI) / 180)

  // HUD の進捗は「いま建てている建物」（全部完成したら最後の建物）
  const shown = shownCurrent ?? state.buildings[state.buildings.length - 1]
  hud.update(dt, p.carried, p.capacity, shown.label, buildingViews.get(shown.id)!.display, state.gold, p.rare)
  shop?.update(state)
  skillBar?.update(state)
  rareView.update(time, state.rares, state.field)
  // ブースト中・ダッシュ中は足元から雪煙
  if ((p.boostTime > 0 && moving > 0.1) || p.dashTime > 0) sparkles.burst(tmp.copy(playerView.group.position).setY(0.3), p.dashTime > 0 ? 4 : 1, 0xdff4ff, 2)
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
