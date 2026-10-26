import './style.css'
import * as THREE from 'three'
import { FX, ITEMS, PLAYER, SKILL_EFFECT, SKILLS, TIME_ATTACK, UPGRADES, WORLD, useCourtyardCourse, type UpgradeId } from './config'
import {
  buyItem,
  buyUpgrade,
  createGame,
  currentBuilding,
  distanceToBuilding,
  movePlayer,
  stats,
  stepGame,
  useSkill,
  type Building,
  type GameEvent,
} from './sim/game'
import { SnowSurface } from './render/snowSurface'
import { Monolith } from './render/monolith'
import { occlusion } from './render/buildings/material'
import { createScenery } from './render/scenery'
import { applySubjectCut, subjectCut } from './render/subjectCut'
import { PlayerView } from './render/playerView'
import { Projectiles, Scoop, Sparkles } from './render/effects'
import { UnitsView } from './render/units'
import { BuildingLabels } from './render/buildingLabels'
import { RareView } from './render/rareView'
import { KeepOutSigns } from './render/keepOut'
import { RemotePlayers } from './render/remotePlayers'
import { SkillBar } from './skillBar'
import { Input } from './input'
import { Hud } from './hud'
import { Shop, type ShopAction } from './shop'
import { TimeAttack } from './timeAttack'
import { Minimap } from './minimap'
import { CameraRig, overviewPose, type Shot, type ViewMode } from './camera'
import { GodCamera } from './godView'
import { createDebugGui } from './debugGui'
import { BalanceDashboard } from './balanceDashboard'
import { loadTuning } from './tuning'
import { clearStorage, hasSave, loadFromStorage, saveToStorage, useSaveSlot } from './save'
import { playCoin, playFanfare, unlockAudio } from './audio'
import { joinFromParams, type MultiSession } from './net/session'
import type { TaggedEvent } from './net/protocol'
import { Title } from './title/title'

// ?view=god で展示用の神視点（マウスで見回し・WASD で移動・自動周回）カメラ、?debug で lil-gui の調整パネル、?balance でバランス調整ダッシュボード、
// ?mode=timeattack でタイムアタック（セーブを読まずに最初から始め、セーブもしない）。
// mode が無ければタイトル画面から始める（?mode=normal は通常プレイへ直接入る）
const params = new URLSearchParams(location.search)
const isGodView = params.get('view') === 'god'
const isBalance = params.has('balance')
// ダッシュボードの早回しや調整値が入るとタイムが比べられないので、?balance とは併用しない
const isTimeAttack = !isGodView && !isBalance && params.get('mode') === 'timeattack'
// ?mode=multi&server=ws://…&room=<roomId>（新しく作るときは room の代わりに create=<ルーム名>）でマルチプレイ。タイトル画面から入る
const isMulti = !isGodView && !isBalance && params.get('mode') === 'multi'
// 調整した値はダッシュボードを開いたときだけ使う（普段のプレイには持ち込まない）。建物の必要量に効くので createGame より前に。
// セーブも本編とは別の枠にする
if (isBalance) {
  loadTuning()
  useSaveSlot('balance')
}
// タイムアタックはキャンパス全体に広げる前の中庭まわりだけで遊ぶ（バランス調整の基準のタイムにする。issue #56）。
// 雪原・建物・アップグレードの上限が変わるので、createGame と描画を作るより前に
if (isTimeAttack) useCourtyardCourse()

const app = document.querySelector<HTMLDivElement>('#app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xb9cbe0)
const fog = new THREE.Fog(0xb9cbe0, 90, 260)
scene.fog = fog
const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize()
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3))
const sun = new THREE.DirectionalLight(0xffffff, 1.6)
sun.position.copy(sunDir).multiplyScalar(30)
scene.add(sun)

const state = createGame()
// マルチプレイはルームの状態をサーバーから受け取ってから描画を作る（完成済みの建物を最初からカラーで建てるため）
const session = isMulti ? await joinOrFail() : null
const resumed = !isTimeAttack && !isMulti && loadFromStorage(state)

async function joinOrFail(): Promise<MultiSession> {
  try {
    return await joinFromParams(params, state)
  } catch (e) {
    const box = document.createElement('div')
    box.id = 'fatal'
    box.innerHTML = `<p>ルームに参加できませんでした</p><p class="fatal-detail"></p><button>タイトルに戻る</button>`
    box.querySelector('.fatal-detail')!.textContent = e instanceof Error ? e.message : String(e)
    box.querySelector('button')!.addEventListener('click', backToTitle)
    document.body.appendChild(box)
    throw e
  }
}

function backToTitle() {
  location.href = location.pathname
}

const snow = new SnowSurface(state.field, sunDir)
scene.add(snow.mesh)
// 雪原の外側（回収できない背景の雪面）。高さは雪原外周の初期値 0.75 に合わせる
const outer = new THREE.Mesh(
  new THREE.RingGeometry(WORLD.size * 0.7, WORLD.size * 6, 4, 1, Math.PI / 4),
  // 日向の雪面（SnowSurface の平地）とほぼ同じ色を無ライティングで出す
  new THREE.MeshBasicMaterial({ color: 0xf0f3fa }),
)
outer.rotation.x = -Math.PI / 2
outer.position.set(WORLD.centerX, 0.75 * WORLD.snowMaxHeight, WORLD.centerZ)
scene.add(outer)
// 並木・バス（建て直しの対象ではない景色）。被写体やプレイヤーに被る部分は抜く
const scenery = createScenery()
applySubjectCut(scenery)
scene.add(scenery)

const playerView = new PlayerView()
const scoop = new Scoop()
const sparkles = new Sparkles()
const projectiles = new Projectiles()
const units = new UnitsView()
const rareView = new RareView()
const remotePlayers = new RemotePlayers()
scene.add(playerView.group, scoop.mesh, sparkles.mesh, projectiles.mesh, units.group, rareView.group, remotePlayers.group)

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
state.buildings.forEach((b) => {
  // セーブから再開した場合、完成済みの建物は最初からカラーで建っている
  const view: BuildingView = {
    monolith: new Monolith(b, sunDir),
    display: b.deposited / b.required,
    inFlight: 0,
    colorize: b.completed ? 1 : -1,
    celebrated: b.completed,
    hold: 0,
  }
  buildingViews.set(b.id, view)
  scene.add(view.monolith.group)
})

/** 点 q が建物（いま地上に出ている部分）から margin 以内に入っていれば、その建物を返す */
function buildingAt(q: THREE.Vector3, margin: number) {
  return state.buildings.find(
    (b) =>
      Math.abs(q.x - b.x) < b.width / 2 + margin &&
      Math.abs(q.z - b.z) < b.depth / 2 + margin &&
      q.y < buildingViews.get(b.id)!.monolith.topY + margin,
  )
}

const labels = new BuildingLabels(scene, state.buildings)
// タイムアタックの中庭コースは、コースの縁と建て始める前の敷地に「立入禁止」の看板を置く（どちらも見えない壁で押し戻されるため）
const keepOut = isTimeAttack ? new KeepOutSigns(state.buildings) : null
if (keepOut) scene.add(keepOut.group)

const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2500)
const rig = new CameraRig(camera)
try {
  rig.mode = (localStorage.getItem('snow-campus-view') as ViewMode | null) ?? 'ground'
} catch {
  // 視点の記憶は無くても困らない
}
// 神視点のカメラは近くの面で切れないよう、建物から少し離れたところで当たる。キャンパス全体（約 450m）が収まるように、中心から引いて回る
const god = isGodView
  ? new GodCamera(camera, renderer.domElement, { x: WORLD.centerX, z: WORLD.centerZ, half: WORLD.size / 2 }, (q) => !!buildingAt(q, 1))
  : null
if (god) {
  fog.near = 450
  fog.far = 1200
}

const input = new Input(renderer.domElement, !isGodView)
const hud = new Hud(document.body)
// 購入で発生したイベントも、stepGame のイベントと同じ経路で処理する
const pendingEvents: GameEvent[] = []
let resetting = false
function resetSave() {
  resetting = true
  clearStorage()
  // タイトル画面に戻すと、もう一度「はじめから」を押すことになる
  const url = new URL(location.href)
  if (!url.searchParams.has('mode')) url.searchParams.set('mode', 'normal')
  location.href = url.href
}
/** 通常モードとタイムアタックの切り替え。どちらもページを読み直す（通常モードのセーブは pagehide で保存される） */
function switchMode(timeAttack: boolean) {
  const url = new URL(location.href)
  url.searchParams.set('mode', timeAttack ? 'timeattack' : 'normal')
  location.href = url.href
}
/**
 * タイムアタックを終えた状態（建物・ゴールド・アップグレード・アイテム）を通常モードのセーブにして、通常モードで続ける（issue #61）。
 * 雪原は大きさが違うので、通常モードで読むときに作り直される
 */
function carryOverToNormal() {
  if (hasSave() && !confirm('通常モードのセーブを、このタイムアタックのデータで上書きしますか？（いまのセーブは消えます）')) return
  if (!saveToStorage(state)) {
    hud.toast('セーブできませんでした', 2000)
    return
  }
  switchMode(false)
}
const timeAttack = isTimeAttack
  ? new TimeAttack(document.body, hud.el, state.buildings.slice(0, TIME_ATTACK.goal), {
      retry: () => location.reload(),
      quit: () => switchMode(false),
      carryOver: carryOverToNormal,
    })
  : null
function leaveRoom() {
  session?.leave()
  backToTitle()
}
const shopActions: ShopAction[] = session
  ? [{ label: 'ルームから抜ける', onClick: leaveRoom, confirm: 'ルームから抜けてタイトルに戻りますか？（ルームの進行はサーバーに残ります）', danger: true }]
  : isTimeAttack
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
      (id) => (session ? session.buyUpgrade(id) : pendingEvents.push(...buyUpgrade(state, id))),
      (id) => (session ? session.buyItem(id) : pendingEvents.push(...buyItem(state, id))),
      shopActions,
    )
/** 演出中・全体マップ中・タイムアタックのカウントダウン中・タイトル画面では操作できない */
const inputLocked = () => rig.inputLocked || !!timeAttack?.locked || !!title?.active
const skillBar = isGodView
  ? null
  : new SkillBar(document.body, (id) => {
      if (inputLocked()) return
      if (session) session.skill(id)
      else pendingEvents.push(...useSkill(state, state.player, id))
    })
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
  viewButton.innerHTML = `視点変更 <kbd>V</kbd>`
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
  if (e.repeat || isGodView) return
  if (rig.cinematic && rig.cinematicElapsed > skipAfter) rig.skipCinematic()
  else if (e.code === 'KeyV') toggleView()
  else if (e.code === 'KeyM') toggleOverview()
})
// 俯瞰中は画面タップで戻る。演出は少し見せてからタップでスキップできる
renderer.domElement.addEventListener('pointerdown', () => {
  if (rig.overview) toggleOverview()
  else if (rig.cinematic && rig.cinematicElapsed > skipAfter) rig.skipCinematic()
})

const dashboard = isBalance ? new BalanceDashboard(document.body, state) : null

if (params.has('debug')) {
  createDebugGui(state, {
    replayColorize: () => {
      for (const view of buildingViews.values()) if (view.colorize >= 0) view.colorize = 0
    },
    resetSave,
  })
}

// オートセーブ：10秒ごと、タブを離れたとき、購入・完成のとき。神視点（展示用）とタイムアタックは保存しない。
// タイトル画面のあいだも保存しない（開いただけで、まだ遊んでいないのにセーブができてしまう）
function save() {
  if (!resetting && !isGodView && !isTimeAttack && !isMulti && !title?.active) saveToStorage(state)
}
setInterval(save, 10_000)
addEventListener('pagehide', save)
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save())
const title =
  isGodView || isBalance || params.has('mode')
    ? null
    : new Title({
        camera,
        fog,
        buildings: state.buildings,
        heightOf: (b) => buildingViews.get(b.id)!.monolith.topY,
        hasSave: hasSave(),
        onPlay: () => resumed && hud.toast('続きから再開！', 1500),
        onNewGame: resetSave,
        onTimeAttack: () => switchMode(true),
      })
if (resumed && !title) hud.toast('続きから再開！', 1500)
if (session) {
  hud.toast(`「${session.roomName}」に参加しました`, 2000)
  session.onNotice = (text) => hud.toast(text, 2000)
  session.onDisconnect = () => {
    alert('サーバーとの接続が切れました。タイトルに戻ります')
    backToTitle()
  }
}

/** マルチプレイで、出来事を起こしたプレイヤーの名前（自分なら null） */
function whoElse(pid: string | null): string | null {
  if (!session || pid === null || pid === state.player.id) return null
  return state.players.find((o) => o.id === pid)?.name ?? '誰か'
}

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

/** 完成のごほうびの説明（降雪機はどの建物でも届く） */
function rewardText(b: Building): string {
  const r = b.reward
  return [r?.speed && '移動速度アップ', r?.rare && 'レア雪が現れるように', '降雪機が届いた'].filter(Boolean).join('・')
}

/** 完成演出のカット割り：完成した建物を正面から → 次の建物（なければキャンパス全体） */
function celebrationShots(b: Building): Shot[] {
  const portrait = camera.aspect < 1
  const look = new THREE.Vector3(b.x, b.height * 0.45, b.z)
  const frame = framing(b, look)
  const shots: Shot[] = [
    {
      pos: clearViewpoint(b, look, frame.dist, frame.height),
      look,
      duration: 1 + FX.colorizeSeconds + 1.8,
      subject: buildingBox(b),
    },
  ]
  const next = currentBuilding(state)
  if (next) {
    const d = (portrait ? 26 : 16) + next.height
    const nextLook = new THREE.Vector3(next.x, next.height * 0.3, next.z)
    shots.push({
      pos: clearViewpoint(next, nextLook, d, d * 0.8),
      look: nextLook,
      duration: 2.8,
      subject: buildingBox(next),
      onStart: () => hud.toast(`次は「${next.label}」！ 光の柱が目印`, 2600),
    })
  } else {
    // 全体マップと同じ構図。遠くから撮るとフォグに沈んで雲の中のように見えるので、フォグも合わせる
    const pos = new THREE.Vector3()
    const lookAll = new THREE.Vector3()
    const fog = overviewPose(camera, WORLD.size, { x: WORLD.centerX, z: WORLD.centerZ }, pos, lookAll)
    shots.push({
      pos,
      look: lookAll,
      duration: 4,
      fog,
      onStart: () => hud.toast('キャンパスが全部復活した！', 3800),
    })
  }
  return shots
}

/**
 * 完成した建物を映す距離（カメラに向いた面から水平に）と高さ。
 * 建物の横幅と高さが画面に収まる距離にし、平たい建物ほど上から見下ろす
 * （KAIT広場のような高さ 3m の大屋根を目の高さから撮ると、線にしか見えず手前の木しか映らないため）
 */
function framing(b: Building, look: THREE.Vector3): { dist: number; height: number } {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  // 縦持ちは横の画角が狭い。そのまま収めると遠くなりすぎるので、横は少しはみ出してもよいことにする
  const tanH = tanV * Math.max(camera.aspect, 0.75)
  const wide = Math.max(b.width, b.depth) / 2
  const fit = Math.max(wide / tanH, (b.height * 0.55) / tanV, 14) * 1.1
  const flat = THREE.MathUtils.clamp(1 - b.height / wide, 0, 1)
  const elevation = THREE.MathUtils.degToRad(14 + 18 * flat)
  return { dist: fit * Math.cos(elevation), height: look.y + fit * Math.sin(elevation) }
}

/**
 * 建物を映すカメラの位置。西（見下ろしと同じ側）から順に 8 方向を試し、視線が他の建物に
 * さえぎられない方向を選ぶ。どの方向もふさがっていれば、カメラを持ち上げて探し直す。
 * キャンパス全体だと建物が密集していて、決め打ちの方向だと隣の棟の中に入ってしまうため。
 * 視線を遮る棟は演出中に薄くするが、カメラ自体が棟の中にあると画面全体がディザで覆われるので、それは強く避ける
 */
function clearViewpoint(b: Building, look: THREE.Vector3, dist: number, height: number): THREE.Vector3 {
  let best: THREE.Vector3 | null = null
  let bestHits = Infinity
  for (const lift of [0, 12, 28]) {
    for (let i = 0; i < 8; i++) {
      // 西（+Z）から始めて、左右交互に回していく
      const a = (Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI) / 4
      const ux = Math.sin(a), uz = Math.cos(a)
      const half = Math.abs(ux) * (b.width / 2) + Math.abs(uz) * (b.depth / 2)
      const pos = new THREE.Vector3(b.x + ux * (half + dist) + uz * dist * 0.25, height + lift, b.z + uz * (half + dist) - ux * dist * 0.25)
      let hits = 0
      for (let k = 0; k <= 12; k++) {
        tmp.lerpVectors(pos, look, k / 12)
        // カメラの位置そのものは、壁のすぐ外でも画面の半分が薄めた棟で埋まるので広めに見る
        const margin = k === 0 ? 6 : 1
        for (const o of state.buildings) {
          if (o !== b && Math.abs(tmp.x - o.x) < o.width / 2 + margin && Math.abs(tmp.z - o.z) < o.depth / 2 + margin && tmp.y < o.height + margin) {
            hits += k === 0 ? 100 : 1
          }
        }
      }
      if (hits === 0) return pos
      if (hits < bestHits) {
        best = pos
        bestHits = hits
      }
    }
  }
  return best!
}


/** 完成形の外接箱 */
function buildingBox(b: Building): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(b.x - b.width / 2, 0, b.z - b.depth / 2),
    new THREE.Vector3(b.x + b.width / 2, b.height, b.z + b.depth / 2),
  )
}

/** 演出中、カメラから被写体（の箱の角と中心）への視線を遮る建物を薄くする */
const fadeRay = new THREE.Ray()
const fadeBox = new THREE.Box3()
const fadeHit = new THREE.Vector3()
const fadeCenter = new THREE.Vector3()
const fadeSize = new THREE.Vector3()
const fadeSamples = Array.from({ length: 9 }, () => new THREE.Vector3())
function fadeOccluders(dt: number) {
  const subject = rig.subject
  if (subject) {
    subject.getCenter(fadeCenter)
    subject.getSize(fadeSize).multiplyScalar(0.42)
    fadeSamples[0].copy(fadeCenter)
    for (let k = 0; k < 8; k++) {
      fadeSamples[k + 1].set(k & 1 ? 1 : -1, k & 2 ? 1 : -1, k & 4 ? 1 : -1).multiply(fadeSize).add(fadeCenter)
    }
  }
  const cam = camera.position
  // 神視点で「入った建物を透かす」を選んでいれば、カメラが中にいる建物を薄くして外が見えるようにする（壁は両面描画なので、中からだと視界がふさがる）
  const inside = god?.fly.seeThrough ? buildingAt(cam, 1) : undefined
  for (const view of buildingViews.values()) {
    const box = subject ? view.monolith.bounds(fadeBox) : null
    let blocking = false
    if (box && !box.containsPoint(fadeCenter)) {
      fadeRay.origin.copy(cam)
      blocking = fadeSamples.some((s) => {
        fadeRay.direction.subVectors(s, cam).normalize()
        const hit = fadeRay.intersectBox(box, fadeHit)
        return hit !== null && hit.distanceToSquared(cam) < s.distanceToSquared(cam)
      })
    }
    if (inside && view === buildingViews.get(inside.id)) blocking = true
    view.monolith.fade(blocking ? 0.15 : 1, dt)
  }
}

/**
 * 演出中は被写体の建物、ふだんはプレイヤーに被る木・景色・除雪機を抜く（建物は fadeOccluders と uOccl が受け持つ）。
 * 建物を薄くするだけだと、完成演出で手前の並木に建物が隠れてしまうため。
 * キャラクター（プレイヤー）は抜かない。完成演出で自分が建物の手前に映り込んでもそのまま見せる
 */
function cutScenery(dt: number) {
  const subject = rig.subject
  let target = 0
  if (subject) {
    subjectCut.uSubjMin.value.copy(subject.min)
    subjectCut.uSubjMax.value.copy(subject.max)
    target = 0.85
  } else if (!isGodView && !rig.cinematic && !rig.overview) {
    // キャラクターより一回り大きい箱にする（ぴったりだと、抜けた跡が体の形の四角い穴に見えるため）
    const q = playerView.group.position
    subjectCut.uSubjMin.value.set(q.x - 1, q.y, q.z - 1)
    subjectCut.uSubjMax.value.set(q.x + 1, q.y + 2.4, q.z + 1)
    target = 0.85
  }
  const u = subjectCut.uSubjCut
  u.value += (target - u.value) * Math.min(1, dt * 6)
}

/** これより遠い建物は室内を描かない (m)。キャンパス全体だと全棟の家具で頂点が多くなりすぎるため */
const INTERIOR_DISTANCE = 120

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
  // 神視点では WASD はカメラの移動に使い、自機は動かさない
  const move = isGodView || inputLocked() ? { x: 0, z: 0 } : rig.toWorld(input.move())
  // ダッシュボードの早回しは stepGame を複数回まわす（dt を大きくすると除雪機や回収の挙動が変わるため）
  const steps = title?.active ? 0 : (dashboard?.timeScale ?? 1)
  const me = state.player.id
  const events: TaggedEvent[] = pendingEvents.splice(0).map((e) => [me, e])
  // タイムアタックのカウントダウン中はゲームの時間を止める
  const simDt = timeAttack?.locked ? 0 : dt
  if (session) {
    // マルチプレイでは回収・投げ込みはサーバーが決める。手元では自分を動かすだけ
    state.player.boostTime = Math.max(0, state.player.boostTime - dt)
    movePlayer(state, state.player, move, dt)
    events.push(...session.update(dt))
  } else {
    for (let i = 0; i < steps; i++) events.push(...stepGame(state, move, simDt).map((e): TaggedEvent => [me, e]))
  }
  dashboard?.record(events.map(([, e]) => e), simDt * steps)
  const p = state.player
  const st = stats(state)
  const moving = Math.min(1, Math.hypot(move.x, move.z))

  playerView.update(dt, p, state.field, moving > 0.05)
  playerView.packWorldPosition(packPos)

  remotePlayers.update(dt, state.players.filter((o) => o !== p), state.field)

  for (const [pid, e] of events) {
    const other = whoElse(pid)
    if (e.type === 'collect') {
      if (pid === me) scoopBudget += e.amount * FX.scoopPerSnow
    } else if (e.type === 'upgrade') {
      hud.toast(`${other ? `${other}が ` : ''}${UPGRADES[e.id].label} Lv${e.level}！`, 1200)
      sparkles.burst(packPos, 24, 0xffd36e, 4)
      playCoin()
      save()
    } else if (e.type === 'item') {
      hud.toast(other ? `${other}が ${ITEMS[e.id].label} を買った！` : `${ITEMS[e.id].label} を手に入れた！`, 1800)
      sparkles.burst(packPos, 30, 0x9ff0ff, 4)
      playCoin()
      save()
    } else if (e.type === 'skill') {
      if (!other) playSkillEffect(e.id, e.amount)
      else {
        const at = remotePlayers.position(pid!)
        if (at) sparkles.burst(tmp.copy(at).setY(1), 30, 0xffd36e, 4)
        if (e.id === 'blizzard') hud.toast(`${other}のブリザード！！ +${Math.floor(e.amount ?? 0)}`, 2000)
      }
    } else if (e.type === 'skillFail') {
      if (other) continue
      hud.toast(`${SKILLS[e.id].label}：${e.reason}`, 1200)
      skillBar?.shake(e.id)
    } else if (e.type === 'rarePickup') {
      sparkles.burst(tmp.set(e.x, 1, e.z), 24, 0x7fe9ff, 4)
      if (!other) hud.toast('レア雪ゲット！', 900)
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
      const from = e.from ? units.plowPosition(e.from.plowId, tmp) : other ? remotePlayers.packPosition(pid!, tmp) : packPos
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
        hud.toast(`${b.label} 完成！\n${rewardText(b)}`, 3600)
      }
    } else if (view.colorize >= 0 && view.colorize < 1) {
      view.colorize = Math.min(1, view.colorize + dt / FX.colorizeSeconds)
      if (Math.random() < 0.6) {
        tmp.set(b.x + (Math.random() - 0.5) * b.width, view.colorize * b.height, b.z + b.depth / 2 + 0.2)
        sparkles.burst(tmp, 2, 0xffd36e, 2.5)
      }
    }

    // 室内（照明・柱・家具）は近い建物だけ描く。全体マップでは全部省く
    const away = Math.hypot(camera.position.x - b.x, camera.position.z - b.z) - Math.max(b.width, b.depth) / 2
    view.monolith.setInterior(!rig.overview && away < INTERIOR_DISTANCE)

    const stage = view.celebrated ? 'done' : b === shownCurrent ? 'current' : 'locked'
    keepOut?.setLot(b.id, stage === 'locked')
    const inZone = b === current && distanceToBuilding(b, p.x, p.z) <= b.dropRange
    view.monolith.update(time, view.display, Math.max(0, view.colorize), stage, inZone)
    labels.update(b, stage, view.display, view.monolith.topY, camera)
  }
  // 光の柱が遠くて見えない／演出中・全体マップ中は、キャラクターの頭上の矢印で建設予定地の方向を示す
  const arrowTarget = !isGodView && !rig.cinematic && !rig.overview ? current : null
  labels.updateArrow(playerView.group.position, arrowTarget, camera)

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
  dashboard?.update(dt)
  document.body.classList.toggle('cinematic', rig.cinematic)

  if (god) {
    god.update(dt)
  } else if (title?.active) {
    title.update(dt)
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
      blocked: (q) => !!buildingAt(q, 0.4),
      worldSize: WORLD.size,
      worldCenter: { x: WORLD.centerX, z: WORLD.centerZ },
    })
    fog.near = rig.fog.near
    fog.far = rig.fog.far
  }

  // カメラとプレイヤーの間にある建物の部分を抜く（実寸の校舎は高いので、見下ろしでも隠れてしまう）
  const occlude = !isGodView && !rig.cinematic && !rig.overview && !title?.active
  occlusion.uOccl.value += ((occlude ? 1 : 0) - occlusion.uOccl.value) * Math.min(1, dt * 6)
  occlusion.uCamPos.value.copy(camera.position)
  occlusion.uFocus.value.copy(playerView.group.position).setY(playerView.group.position.y + 1)
  fadeOccluders(dt)
  cutScenery(dt)

  renderer.render(scene, camera)
  labels.render(scene, camera)
})

// 開発時のみ、コンソールから状態をいじれるようにする（例: game.buildings[0].deposited = 890, buy('plow')）
if (import.meta.env.DEV) {
  Object.assign(window, { game: state, session, rig, camera, god, scene, renderer, buy: (id: UpgradeId) => pendingEvents.push(...buyUpgrade(state, id)) })
}
