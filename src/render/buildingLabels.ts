import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Building } from '../sim/game'

// 建物の上に浮かぶ進捗ラベル（「432 / 900（48%）」）。
// CSS2DRenderer で DOM を 3D 座標に追従させる（文字がくっきり出て、日本語フォントもそのまま使える）。
// 建設中の建物はせり上がる屋上の少し上に付いていく（縦持ちの見下ろしで画面外に出にくいように）。
// それ以外は完成形の高さの上に固定。
// 全体マップ（引き）では、自分の位置がキャラクターの小ささに埋もれないよう「現在地」マーカーを重ねる。

export type LabelStage = 'locked' | 'current' | 'done'

type Label = {
  el: HTMLDivElement
  name: HTMLSpanElement
  value: HTMLSpanElement
  fill: HTMLDivElement
  obj: CSS2DObject
}

const arrowForward = new THREE.Vector3()

export class BuildingLabels {
  readonly renderer = new CSS2DRenderer()
  private readonly labels = new Map<string, Label>()
  private readonly arrowObj: CSS2DObject
  private readonly arrowEl: HTMLDivElement
  private readonly arrowIcon: SVGElement
  private readonly arrowLabel: HTMLSpanElement
  private readonly markerObj: CSS2DObject
  private readonly markerEl: HTMLDivElement

  constructor(scene: THREE.Scene, buildings: Building[]) {
    this.renderer.domElement.id = 'labels'
    document.body.appendChild(this.renderer.domElement)

    // 光の柱が遠くて見えないとき用に、キャラクターの頭上に建設予定地の方向を示す矢印を出す。
    // 矢じり（頭）だけの三角形だと回転しても向きが分かりにくいので、軸（尾）付きの矢印にする
    this.arrowEl = document.createElement('div')
    this.arrowEl.className = 'site-arrow'
    this.arrowEl.hidden = true
    this.arrowEl.innerHTML = `
      <svg class="site-arrow-icon" viewBox="0 0 24 24"><path d="M12 1 L21 12 L15 12 L15 23 L9 23 L9 12 L3 12 Z" /></svg>
      <span class="site-arrow-label"></span>
    `
    this.arrowIcon = this.arrowEl.querySelector('.site-arrow-icon')!
    this.arrowLabel = this.arrowEl.querySelector('.site-arrow-label')!
    this.arrowObj = new CSS2DObject(this.arrowEl)
    scene.add(this.arrowObj)

    // 現在地マーカー：足元で脈打つ輪と、その上の「現在地」
    this.markerEl = document.createElement('div')
    this.markerEl.className = 'player-marker'
    this.markerEl.hidden = true
    this.markerEl.innerHTML = '<span class="pm-label">現在地</span>'
    this.markerObj = new CSS2DObject(this.markerEl)
    scene.add(this.markerObj)

    for (const b of buildings) {
      const el = document.createElement('div')
      el.className = 'building-label'
      el.innerHTML = `<span class="bl-name"></span><span class="bl-value"></span><div class="bl-bar"><div class="bl-fill"></div></div>`
      const obj = new CSS2DObject(el)
      obj.position.set(b.x, b.height + 1.6, b.z)
      scene.add(obj)
      this.labels.set(b.id, {
        el,
        name: el.querySelector('.bl-name')!,
        value: el.querySelector('.bl-value')!,
        fill: el.querySelector('.bl-fill')!,
        obj,
      })
    }
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h)
  }

  /**
   * @param progress 表示上の進捗 0..1（雪玉の着弾に合わせて補間済みのもの）
   * @param topY いま見えている屋上の高さ
   */
  update(b: Building, stage: LabelStage, progress: number, topY: number, camera: THREE.Camera) {
    const l = this.labels.get(b.id)!
    l.obj.position.y = stage === 'current' ? Math.max(0, topY) + 2.2 : b.height + 1.2
    l.el.dataset.stage = stage
    setText(l.name, b.label)
    if (stage === 'current') {
      const pct = Math.floor(progress * 100)
      setText(l.value, `${Math.floor(progress * b.required)} / ${b.required}（${pct}%）`)
      l.fill.style.width = `${progress * 100}%`
    } else {
      setText(l.value, stage === 'done' ? '完成' : '未解放')
    }
    // 遠くのラベルは薄く（グランドレベルで画面がうるさくならないように）
    const d = camera.position.distanceTo(l.obj.position)
    const fade = stage === 'current' ? 1 : Math.max(0, Math.min(1, (90 - d) / 40))
    l.el.style.opacity = `${fade}`
  }

  /**
   * @param playerPos プレイヤーのワールド座標
   * @param target 矢印で示す建物。null なら隠す
   */
  updateArrow(playerPos: THREE.Vector3, target: Building | null, camera: THREE.Camera) {
    this.arrowEl.hidden = !target
    if (!target) return
    this.arrowObj.position.set(playerPos.x, playerPos.y + 2.3, playerPos.z)

    // カメラの向きを基準にした画面上の回転角（0 deg で真上 = 正面）
    camera.getWorldDirection(arrowForward)
    const fx = arrowForward.x
    const fz = arrowForward.z
    const tx = target.x - playerPos.x
    const tz = target.z - playerPos.z
    const screenX = fx * tz - fz * tx
    const screenY = tx * fx + tz * fz
    const deg = (Math.atan2(screenX, screenY) * 180) / Math.PI
    this.arrowIcon.style.transform = `rotate(${deg}deg)`
    setText(this.arrowLabel, target.label)
  }

  /** 全体マップ中だけ、プレイヤーの位置に現在地マーカーを出す */
  updateMarker(playerPos: THREE.Vector3, visible: boolean) {
    this.markerEl.hidden = !visible
    if (visible) this.markerObj.position.copy(playerPos)
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.render(scene, camera)
  }
}

function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text
}
