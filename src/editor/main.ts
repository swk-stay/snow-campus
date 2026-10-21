import './editor.css'
import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { WORLD } from '../config'
import { createGame, refillField } from '../sim/game'
import { SnowSurface } from '../render/snowSurface'
import { Monolith } from '../render/monolith'
import { section } from '../render/buildings/material'
import { createScenery } from '../render/scenery'
import { FlyCamera } from '../flyCamera'
import { NOTE_KINDS, fmt, loadNotes, notesToJson, notesToMarkdown, parseNotes, saveNotes, type Note, type NoteKind } from './notes'

// 任意の座標に「ここに〇〇を置いて」「この木を消して」を書き込む Editor（issue #26）。
// 全棟完成の状態のキャンパスを自由に見回し、クリックした場所（建物・木・地面）の 3 軸の座標にテキストを置く。
// 建物の中に置くときは「断面」で上の階を消して、床をクリックする。書き出した Markdown / JSON を実装する人に渡す。
// カメラは神視点と共通の FPS 風（flyCamera.ts、issue #42）。Ctrl で「選択モード（カーソルでクリック）」と
// 「視点モード（Pointer Lock でマウス見回し、クリックで画面中央を選ぶ）」を切り替える。

const app = document.querySelector<HTMLDivElement>('#app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
app.appendChild(renderer.domElement)
const labelRenderer = new CSS2DRenderer()
labelRenderer.domElement.id = 'editor-labels'
document.body.appendChild(labelRenderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xb9cbe0)
scene.fog = new THREE.Fog(0xb9cbe0, 450, 1200)
const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize()
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3))
const sun = new THREE.DirectionalLight(0xffffff, 1.6)
sun.position.copy(sunDir).multiplyScalar(30)
scene.add(sun)

const state = createGame()
const snow = new SnowSurface(state.field, sunDir)
scene.add(snow.mesh)
const scenery = createScenery()
scene.add(scenery)

// 建物は全部完成・カラーの状態で建てておく（ガラス越しに中も見える）
const monoliths = state.buildings.map((b) => {
  const m = new Monolith(b, sunDir)
  m.update(0, 1, 1, 'done', false)
  m.group.userData.target = b.label
  scene.add(m.group)
  const el = document.createElement('div')
  el.className = 'editor-building'
  el.textContent = b.label
  const label = new CSS2DObject(el)
  label.position.set(b.x, b.height + 2, b.z)
  scene.add(label)
  return m
})

const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2000)
camera.position.set(WORLD.centerX + 120, 230, WORLD.centerZ + 300)
// 建物の中にも入れるように当たり判定はしない。断面で消した上の階をくぐって床に近寄れる
const fly = new FlyCamera(camera, renderer.domElement, {
  area: { x: WORLD.centerX, z: WORLD.centerZ, half: WORLD.size / 2 + 80 },
  minY: 0.3,
  maxY: 400,
  clickToLock: false,
})
fly.lookAt(new THREE.Vector3(WORLD.centerX, 0, WORLD.centerZ))

// いまの操作モードの表示（左上）
const modeBadge = document.createElement('div')
modeBadge.id = 'editor-mode'
document.body.appendChild(modeBadge)
function refreshMode(locked: boolean) {
  modeBadge.classList.toggle('locked', locked)
  modeBadge.innerHTML = locked
    ? '<b>視点モード</b> マウスで見回す ／ クリックで画面中央を選ぶ ／ <kbd>Ctrl</kbd> か <kbd>Esc</kbd> で選択モードへ'
    : '<b>選択モード</b> ドラッグで見回す ／ クリックで場所を選ぶ ／ <kbd>Ctrl</kbd> で視点モードへ'
}
fly.onLockChange = refreshMode
refreshMode(false)

// ---------- カーソル（次に置く場所） ----------

const cursor = new THREE.Group()
cursor.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })))
// X（赤）・Y（緑）・Z（青）の 3 軸。どの向きに数値を動かせばよいかの目安
const axes = new THREE.AxesHelper(3)
;(axes.material as THREE.Material).depthTest = false
cursor.add(axes)
cursor.renderOrder = 10
cursor.traverse((o) => (o.renderOrder = 10))
const cursorStem = stem(0xffffff)
scene.add(cursor, cursorStem)

/** 点から地面までの縦線（空中や上の階に置いたとき、どこの真上かが分かるように） */
function stem(color: number): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)])
  return new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.3, depthTest: false, transparent: true, opacity: 0.8 }))
}
function placeStem(line: THREE.Line, x: number, y: number, z: number) {
  line.position.set(x, y, z)
  line.scale.y = Math.max(0.001, y)
  line.computeLineDistances()
  line.visible = y > 0.3
}

// ---------- リクエストの印 ----------

let notes = loadNotes()
let selectedId: number | null = null

type Marker = { group: THREE.Group; ball: THREE.Mesh; line: THREE.Line; el: HTMLDivElement }
const markers = new Map<number, Marker>()
const markerGeo = new THREE.SphereGeometry(0.5, 16, 12)

function syncMarkers() {
  for (const [id, m] of markers) {
    if (!notes.some((n) => n.id === id)) {
      scene.remove(m.group)
      markers.delete(id)
    }
  }
  notes.forEach((n, i) => {
    let m = markers.get(n.id)
    if (!m) {
      const group = new THREE.Group()
      const ball = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }))
      ball.renderOrder = 9
      const line = stem(0xffffff)
      const el = document.createElement('div')
      el.className = 'editor-note'
      el.addEventListener('pointerdown', (e) => e.stopPropagation())
      el.addEventListener('click', () => select(n.id))
      const label = new CSS2DObject(el)
      label.center.set(0, 1)
      ball.add(label)
      group.add(ball, line)
      scene.add(group)
      m = { group, ball, line, el }
      markers.set(n.id, m)
    }
    const color = NOTE_KINDS[n.kind].color
    ;(m.ball.material as THREE.MeshBasicMaterial).color.setHex(color)
    ;(m.line.material as THREE.LineDashedMaterial).color.setHex(color)
    // 完了済みは薄く。「完了を隠す」のときは選択中のもの以外は出さない
    ;(m.ball.material as THREE.MeshBasicMaterial).opacity = n.done ? 0.35 : 1
    ;(m.line.material as THREE.LineDashedMaterial).opacity = n.done ? 0.3 : 0.8
    m.group.visible = !(n.done && hideDoneCheck.checked && n.id !== selectedId)
    m.ball.position.set(n.x, n.y, n.z)
    m.ball.userData.size = n.id === selectedId ? 1.5 : 1
    placeStem(m.line, n.x, n.y, n.z)
    m.el.textContent = `${n.done ? '✓ ' : ''}${i + 1}. ${NOTE_KINDS[n.kind].label}：${n.text.split('\n')[0] || '（テキストなし）'}`
    m.el.style.borderColor = `#${color.toString(16).padStart(6, '0')}`
    m.el.classList.toggle('selected', n.id === selectedId)
    m.el.classList.toggle('done', n.done)
  })
}

// ---------- パネル ----------

const panel = document.createElement('div')
panel.id = 'editor-panel'
panel.innerHTML = `
  <div class="ep-head">
    <b>Editor</b><span class="ep-sub">クリックした場所にリクエストを置く</span>
    <a href="./" class="ep-back">ゲームへ</a>
  </div>
  <section class="ep-form">
    <div class="ep-xyz">
      <label><span class="ax-x">X</span><input type="number" step="0.5" data-axis="x"></label>
      <label><span class="ax-y">Y</span><input type="number" step="0.5" data-axis="y"></label>
      <label><span class="ax-z">Z</span><input type="number" step="0.5" data-axis="z"></label>
    </div>
    <small class="ep-hint">+X 南 ／ +Y 上 ／ +Z 西（m）。数値は直接編集・↑↓キーで 0.5 ずつ</small>
    <label class="ep-row">対象 <input type="text" data-target placeholder="クリックで自動入力（空でもよい）"></label>
    <div class="ep-kinds">${(Object.keys(NOTE_KINDS) as NoteKind[])
      .map((k) => `<label><input type="radio" name="kind" value="${k}"><span style="--c:#${NOTE_KINDS[k].color.toString(16).padStart(6, '0')}">${NOTE_KINDS[k].label}</span></label>`)
      .join('')}</div>
    <textarea data-text rows="3" placeholder="例：ここにベンチを 3 脚／この木を消す／屋上に雪だるまの像／2 階の窓際にこたつ"></textarea>
    <label class="ep-row ep-done"><input type="checkbox" data-done> 完了済み（実装した）</label>
    <div class="ep-actions">
      <button data-submit class="primary"></button>
      <button data-cancel>選択解除</button>
      <button data-delete class="danger">削除</button>
    </div>
  </section>
  <section class="ep-view">
    <label class="ep-row"><input type="checkbox" data-section> 断面（この高さより上を消す）</label>
    <div class="ep-row"><input type="range" min="0.5" max="60" step="0.5" data-clip><output data-clip-out></output></div>
    <label class="ep-row"><input type="checkbox" data-glass checked> ガラスを無視してクリック（窓の向こうの床や家具に置ける）</label>
    <label class="ep-row"><input type="checkbox" data-snow> 雪をどけて地面（芝生・園路）を見る</label>
    <div class="ep-actions"><button data-speed></button></div>
  </section>
  <section class="ep-list-wrap">
    <div class="ep-list-head"><b>リクエスト一覧</b><span data-count></span></div>
    <label class="ep-row"><input type="checkbox" data-hide-done> 完了済みを隠す</label>
    <ol class="ep-list" data-list></ol>
    <div class="ep-actions">
      <button data-copy>Markdown をコピー</button>
      <button data-download>JSON を保存</button>
      <button data-import>JSON を読込</button>
      <button data-clear class="danger">全消去</button>
    </div>
    <input type="file" accept="application/json,.json" data-file hidden>
  </section>
  <small class="ep-hint">WASD・矢印：移動 ／ E・Q：上下 ／ ホイール：前後 ／ Shift：速度 ／ Ctrl：視点モード（マウスで見回す）と選択モードの切り替え</small>
`
document.body.appendChild(panel)
const q = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!
const axisInputs = { x: q<HTMLInputElement>('[data-axis=x]'), y: q<HTMLInputElement>('[data-axis=y]'), z: q<HTMLInputElement>('[data-axis=z]') }
const targetInput = q<HTMLInputElement>('[data-target]')
const textInput = q<HTMLTextAreaElement>('[data-text]')
const doneCheck = q<HTMLInputElement>('[data-done]')
const doneRow = q<HTMLLabelElement>('.ep-done')
const hideDoneCheck = q<HTMLInputElement>('[data-hide-done]')
const submitButton = q<HTMLButtonElement>('[data-submit]')
const cancelButton = q<HTMLButtonElement>('[data-cancel]')
const deleteButton = q<HTMLButtonElement>('[data-delete]')
const sectionCheck = q<HTMLInputElement>('[data-section]')
const clipRange = q<HTMLInputElement>('[data-clip]')
const clipOut = q<HTMLOutputElement>('[data-clip-out]')
const glassCheck = q<HTMLInputElement>('[data-glass]')
const snowCheck = q<HTMLInputElement>('[data-snow]')
const list = q<HTMLOListElement>('[data-list]')
const fileInput = q<HTMLInputElement>('[data-file]')
const speedButton = q<HTMLButtonElement>('[data-speed]')
// 感度・視野角のスライダーは移動速度のボタンの下に
speedButton.parentElement!.after(fly.settingsPanel)
const refreshSpeed = () => (speedButton.innerHTML = `移動速度 ${fly.speedLabel} <kbd>Shift</kbd>`)
speedButton.addEventListener('click', () => fly.cycleSpeed())
fly.onSpeedChange(refreshSpeed)
refreshSpeed()
// パネルの操作がカメラやクリック判定に漏れないように
panel.addEventListener('pointerdown', (e) => e.stopPropagation())

const kindValue = () => (panel.querySelector<HTMLInputElement>('input[name=kind]:checked')?.value ?? 'add') as NoteKind
const setKind = (k: NoteKind) => (q<HTMLInputElement>(`input[name=kind][value=${k}]`).checked = true)
setKind('add')

const pos = new THREE.Vector3()
function setCursor(x: number, y: number, z: number) {
  pos.set(x, y, z)
  cursor.position.copy(pos)
  placeStem(cursorStem, x, y, z)
  for (const axis of ['x', 'y', 'z'] as const) {
    if (document.activeElement !== axisInputs[axis]) axisInputs[axis].value = fmt(pos[axis])
  }
}
for (const axis of ['x', 'y', 'z'] as const) {
  axisInputs[axis].addEventListener('input', () => {
    const v = parseFloat(axisInputs[axis].value)
    if (!Number.isFinite(v)) return
    pos[axis] = v
    setCursor(pos.x, pos.y, pos.z)
    // 選択中のリクエストは、座標を変えたらその場で動かす
    const n = selectedNote()
    if (n) {
      n[axis] = v
      commit()
    }
  })
}

const selectedNote = () => notes.find((n) => n.id === selectedId) ?? null

function select(id: number | null) {
  selectedId = id
  const n = selectedNote()
  if (n) {
    setCursor(n.x, n.y, n.z)
    targetInput.value = n.target
    textInput.value = n.text
    setKind(n.kind)
    doneCheck.checked = n.done
  } else {
    textInput.value = ''
  }
  refreshForm()
  syncMarkers()
  renderList()
}

function refreshForm() {
  const editing = selectedId !== null
  submitButton.textContent = editing ? '更新' : 'ここに追加'
  cancelButton.hidden = !editing
  deleteButton.hidden = !editing
  doneRow.hidden = !editing
  panel.classList.toggle('editing', editing)
}

function commit() {
  saveNotes(notes)
  syncMarkers()
  renderList()
}

submitButton.addEventListener('click', () => {
  const n = selectedNote()
  if (n) {
    Object.assign(n, { kind: kindValue(), text: textInput.value, target: targetInput.value, x: pos.x, y: pos.y, z: pos.z })
    commit()
    select(null)
    return
  }
  const id = notes.reduce((m, n) => Math.max(m, n.id), 0) + 1
  notes.push({ id, kind: kindValue(), text: textInput.value, target: targetInput.value, x: pos.x, y: pos.y, z: pos.z, done: false })
  textInput.value = ''
  commit()
  flash(`${notes.length}. を追加しました`)
})
cancelButton.addEventListener('click', () => select(null))
// 完了済みは座標と同じく、切り替えたらその場で反映する
doneCheck.addEventListener('change', () => {
  const n = selectedNote()
  if (n) setDone(n, doneCheck.checked)
})
hideDoneCheck.addEventListener('change', () => {
  syncMarkers()
  renderList()
})

function setDone(n: Note, done: boolean) {
  n.done = done
  if (n.id === selectedId) doneCheck.checked = done
  commit()
}
deleteButton.addEventListener('click', () => removeNote(selectedId))

function removeNote(id: number | null) {
  if (id === null) return
  notes = notes.filter((n) => n.id !== id)
  if (selectedId === id) select(null)
  commit()
}

function renderList() {
  const doneCount = notes.filter((n) => n.done).length
  q('[data-count]').textContent = doneCount ? `${notes.length} 件（完了 ${doneCount}）` : `${notes.length} 件`
  list.replaceChildren(
    ...notes.map((n) => {
      const li = document.createElement('li')
      li.classList.toggle('selected', n.id === selectedId)
      li.classList.toggle('done', n.done)
      // 番号を一覧・印・Markdown でそろえたいので、隠すときも li は残して見えなくするだけ
      li.hidden = n.done && hideDoneCheck.checked && n.id !== selectedId
      li.style.setProperty('--c', `#${NOTE_KINDS[n.kind].color.toString(16).padStart(6, '0')}`)
      const head = document.createElement('div')
      head.className = 'ep-item-head'
      head.innerHTML = `<span class="ep-kind"></span><span class="ep-pos"></span><button class="ep-check"></button><button class="ep-go" title="カメラを向ける">◎</button><button class="ep-del" title="削除">×</button>`
      head.querySelector('.ep-kind')!.textContent = NOTE_KINDS[n.kind].label
      head.querySelector('.ep-pos')!.textContent = `(${fmt(n.x)}, ${fmt(n.y)}, ${fmt(n.z)})`
      const check = head.querySelector<HTMLButtonElement>('.ep-check')!
      check.textContent = n.done ? '☑' : '☐'
      check.title = n.done ? '未完了に戻す' : '完了済みにする'
      check.addEventListener('click', (e) => {
        e.stopPropagation()
        setDone(n, !n.done)
      })
      head.querySelector('.ep-go')!.addEventListener('click', (e) => {
        e.stopPropagation()
        lookAt(n)
      })
      head.querySelector('.ep-del')!.addEventListener('click', (e) => {
        e.stopPropagation()
        removeNote(n.id)
      })
      const text = document.createElement('div')
      text.className = 'ep-text'
      text.textContent = n.text || '（テキストなし）'
      li.append(head, text)
      if (n.target) {
        const t = document.createElement('small')
        t.textContent = n.target
        li.append(t)
      }
      li.addEventListener('click', () => select(n.id === selectedId ? null : n.id))
      return li
    }),
  )
}

/** カメラの向きはそのままで、リクエストの場所が画面の中央に来るところへ動かす */
function lookAt(n: Note) {
  const p = new THREE.Vector3(n.x, n.y, n.z)
  const dist = Math.min(60, camera.position.distanceTo(p))
  camera.position.copy(p).addScaledVector(fly.getDirection(new THREE.Vector3()), -dist)
  select(n.id)
}

// ---------- 書き出し・読み込み ----------

q('[data-copy]').addEventListener('click', async () => {
  const md = notesToMarkdown(notes)
  try {
    await navigator.clipboard.writeText(md)
    flash('Markdown をコピーしました')
  } catch {
    // クリップボードが使えない環境（http の別端末など）では、選択できる形で見せる
    prompt('コピーしてください', md)
  }
})
q('[data-download]').addEventListener('click', () => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([notesToJson(notes)], { type: 'application/json' }))
  a.download = 'snow-campus-editor.json'
  a.click()
  URL.revokeObjectURL(a.href)
})
q('[data-import]').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (!file) return
  try {
    const loaded = parseNotes(await file.text())
    // 今ある分の後ろに足す（id は振り直す）
    let id = notes.reduce((m, n) => Math.max(m, n.id), 0)
    notes.push(...loaded.map((n) => ({ ...n, id: ++id })))
    commit()
    flash(`${loaded.length} 件を読み込みました`)
  } catch (e) {
    alert(`読み込めませんでした：${(e as Error).message}`)
  }
})
q('[data-clear]').addEventListener('click', () => {
  if (!notes.length || !confirm(`リクエスト ${notes.length} 件をすべて消しますか？`)) return
  notes = []
  select(null)
  commit()
})

let flashTimer = 0
function flash(text: string) {
  let el = document.getElementById('editor-flash')
  if (!el) {
    el = document.createElement('div')
    el.id = 'editor-flash'
    document.body.appendChild(el)
  }
  el.textContent = text
  el.classList.add('visible')
  clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => el.classList.remove('visible'), 1600)
}

// ---------- 表示の切り替え ----------

function applySection() {
  section.uClipY.value = sectionCheck.checked ? parseFloat(clipRange.value) : 1e6
  clipOut.textContent = `${parseFloat(clipRange.value).toFixed(1)} m`
}
clipRange.value = '3'
sectionCheck.addEventListener('change', applySection)
clipRange.addEventListener('input', () => {
  sectionCheck.checked = true
  applySection()
})
applySection()

snowCheck.addEventListener('change', () => {
  if (snowCheck.checked) {
    state.field.data.fill(0)
    state.field.dirty = true
  } else {
    refillField(state)
  }
})

// ---------- クリックで場所を選ぶ ----------

const raycaster = new THREE.Raycaster()
const pickTargets: THREE.Object3D[] = [...monoliths.map((m) => m.body), scenery]
const ndc = new THREE.Vector2()
const down = new THREE.Vector2()
renderer.domElement.addEventListener('pointerdown', (e) => down.set(e.clientX, e.clientY))
renderer.domElement.addEventListener('pointerup', (e) => {
  // ドラッグ（カメラ操作）はクリックとみなさない
  if (e.button !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return
  const rect = renderer.domElement.getBoundingClientRect()
  // 視点モード（Pointer Lock 中）は画面中央の照準の場所を選ぶ
  if (fly.locked) ndc.set(0, 0)
  else ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
  pick()
})

function pick() {
  raycaster.setFromCamera(ndc, camera)
  const clipY = section.uClipY.value
  const hit = raycaster.intersectObjects(pickTargets, true).find((h) => {
    if (h.point.y > clipY + 0.01) return false
    const mat = (h.object as THREE.Mesh).material
    // ガラスは 'SLOT_GLASS' の define を持つ
    if (glassCheck.checked && mat instanceof THREE.ShaderMaterial && 'SLOT_GLASS' in mat.defines) return false
    return true
  })
  const ground = groundHit()
  const useHit = hit && (!ground || hit.distance < ground.distanceTo(raycaster.ray.origin))
  if (useHit) {
    setCursor(hit.point.x, hit.point.y, hit.point.z)
    targetInput.value = describe(hit)
  } else if (ground) {
    setCursor(ground.x, ground.y, ground.z)
    targetInput.value = snowCheck.checked ? '地面' : '雪原'
  } else {
    return
  }
  // 選択中のリクエストは、クリックで置き直す
  const n = selectedNote()
  if (n) {
    Object.assign(n, { x: pos.x, y: pos.y, z: pos.z, target: targetInput.value })
    commit()
  }
}

/** 地面（雪があれば雪の表面）との交点。雪の高さはレイが当たったあたりで一度だけ取り直す近似 */
function groundHit(): THREE.Vector3 | null {
  const ray = raycaster.ray
  const out = new THREE.Vector3()
  if (!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out)) return null
  if (Math.abs(out.x - WORLD.centerX) > WORLD.size / 2 || Math.abs(out.z - WORLD.centerZ) > WORLD.size / 2) return null
  const h = state.field.amountAt(out.x, out.z) * WORLD.snowMaxHeight
  if (h > 0) ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), out)
  return out
}

/** 当たったものの説明。木はインスタンスの根元の座標も付ける（「この木を消す」が一意に分かるように） */
function describe(hit: THREE.Intersection): string {
  let o: THREE.Object3D | null = hit.object
  while (o && !o.userData.target) o = o.parent
  const name: string = o?.userData.target ?? ''
  if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
    const m = new THREE.Matrix4()
    hit.object.getMatrixAt(hit.instanceId, m)
    const p = new THREE.Vector3().setFromMatrixPosition(m)
    return `${name} 根元 (${fmt(p.x)}, ${fmt(p.z)})`
  }
  return name
}

// ---------- キー操作 ----------

addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  if (e.key === 'Escape') {
    // Esc で視点モードを抜けたときは、選択は残す
    if (fly.locked || performance.now() - fly.unlockedAt < 200) return
    if (typing) (e.target as HTMLElement).blur()
    select(null)
  } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
    removeNote(selectedId)
  } else if (typing && e.target === textInput && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    submitButton.click()
  }
})

// ---------- ループ ----------

function resize() {
  const { clientWidth: w, clientHeight: h } = app
  renderer.setSize(w, h)
  labelRenderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

setCursor(0, 0, 0)
refreshForm()
syncMarkers()
renderList()

const scaleAt = (p: THREE.Vector3) => Math.min(3, Math.max(0.15, camera.position.distanceTo(p) * 0.012))

let last = performance.now()
renderer.setAnimationLoop((now: number) => {
  fly.update(Math.min(0.1, (now - last) / 1000))
  last = now
  // 印とカーソルは、近寄っても遠ざかっても画面上でだいたい同じ大きさに
  for (const m of markers.values()) m.ball.scale.setScalar(m.ball.userData.size * scaleAt(m.ball.position))
  cursor.scale.setScalar(scaleAt(cursor.position))
  // 雪原の回収範囲の表示は使わないので、プレイヤーは遠くに置いておく
  snow.update(now / 1000, 1e4, 1e4, 0, 0, 0)
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
})

if (import.meta.env.DEV) Object.assign(window, { notes: () => notes, camera, fly })
