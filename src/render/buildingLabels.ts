import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Building } from '../sim/game'

// 建物の上に浮かぶ進捗ラベル（「432 / 900（48%）」）。
// CSS2DRenderer で DOM を 3D 座標に追従させる（文字がくっきり出て、日本語フォントもそのまま使える）。
// 建設中の建物はせり上がる屋上の少し上に付いていく（縦持ちの見下ろしで画面外に出にくいように）。
// それ以外は完成形の高さの上に固定。

export type LabelStage = 'locked' | 'current' | 'done'

type Label = {
  el: HTMLDivElement
  name: HTMLSpanElement
  value: HTMLSpanElement
  fill: HTMLDivElement
  obj: CSS2DObject
}

export class BuildingLabels {
  readonly renderer = new CSS2DRenderer()
  private readonly labels = new Map<string, Label>()

  constructor(scene: THREE.Scene, buildings: Building[]) {
    this.renderer.domElement.id = 'labels'
    document.body.appendChild(this.renderer.domElement)

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

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.render(scene, camera)
  }
}

function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text
}
