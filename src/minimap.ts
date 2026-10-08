import type { GameState } from './sim/game'

// 常時表示のミニマップ（右上）。北が上で固定。タップ／M キーで全体マップ（俯瞰カメラ）に切り替える。
// 雪の量は 0.3 秒ごとに縮小コピーした画像、建物・除雪機・プレイヤーは毎フレーム描く。

const SNOW_RES = 80

export class Minimap {
  private readonly canvas: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D
  private readonly snow: HTMLCanvasElement
  private readonly snowCtx: CanvasRenderingContext2D
  private readonly snowImage: ImageData
  private snowTimer = 0

  constructor(root: HTMLElement, onTap: () => void) {
    const wrap = document.createElement('div')
    wrap.id = 'minimap'
    wrap.innerHTML = '<span class="minimap-hint">MAP <kbd>M</kbd></span>'
    this.canvas = document.createElement('canvas')
    wrap.prepend(this.canvas)
    wrap.addEventListener('click', onTap)
    root.appendChild(wrap)
    this.g = this.canvas.getContext('2d')!

    this.snow = document.createElement('canvas')
    this.snow.width = this.snow.height = SNOW_RES
    this.snowCtx = this.snow.getContext('2d')!
    this.snowImage = this.snowCtx.createImageData(SNOW_RES, SNOW_RES)
  }

  /**
   * @param viewYaw グランドレベル時のカメラの向き（null なら視野を描かない）
   */
  update(dt: number, time: number, s: GameState, viewYaw: number | null) {
    const dpr = Math.min(devicePixelRatio, 2)
    const css = this.canvas.clientWidth
    if (this.canvas.width !== Math.round(css * dpr)) this.canvas.width = this.canvas.height = Math.round(css * dpr)
    const W = this.canvas.width
    const g = this.g
    const size = s.field.size
    const toPx = (v: number) => ((v + size / 2) / size) * W

    this.snowTimer -= dt
    if (this.snowTimer <= 0) {
      this.snowTimer = 0.3
      this.drawSnow(s)
    }
    g.imageSmoothingEnabled = true
    g.drawImage(this.snow, 0, 0, W, W)

    // 建物：完成はカラー、いま建てているものは金色で点滅、未解放は点線
    for (const b of s.buildings) {
      const x = toPx(b.x - b.width / 2)
      const y = toPx(b.z - b.depth / 2)
      const w = (b.width / size) * W
      const h = (b.depth / size) * W
      const current = !b.completed && s.buildings.find((o) => !o.completed) === b
      g.setLineDash([])
      if (b.completed) {
        g.fillStyle = '#e08a4a'
        g.fillRect(x, y, w, h)
      } else if (current) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 6)
        g.fillStyle = `rgba(255, 200, 80, ${0.35 + 0.4 * pulse})`
        g.fillRect(x, y, w, h * (0.15 + 0.85 * (b.deposited / b.required)))
        g.strokeStyle = '#ffb020'
        g.lineWidth = 2 * dpr
        g.strokeRect(x - pulse * 3 * dpr, y - pulse * 3 * dpr, w + pulse * 6 * dpr, h + pulse * 6 * dpr)
      } else {
        g.strokeStyle = 'rgba(80, 90, 110, 0.7)'
        g.lineWidth = 1 * dpr
        g.setLineDash([3 * dpr, 3 * dpr])
        g.strokeRect(x, y, w, h)
      }
    }
    g.setLineDash([])

    for (const m of s.machines) dot(g, toPx(m.x), toPx(m.z), 3 * dpr, '#4a7fd6')
    for (const p of s.plows) dot(g, toPx(p.x), toPx(p.z), 3.5 * dpr, '#f28c28')
    // レア雪は点滅する水色の点
    for (const r of s.rares) dot(g, toPx(r.x), toPx(r.z), (3 + Math.sin(time * 8) * 1.2) * dpr, '#5fe3ff')

    // プレイヤー（向きつきの三角）とグランドレベル時の視野
    const px = toPx(s.player.x)
    const pz = toPx(s.player.z)
    if (viewYaw !== null) {
      const dir = Math.atan2(-Math.cos(viewYaw), -Math.sin(viewYaw))
      g.fillStyle = 'rgba(255, 255, 255, 0.35)'
      g.beginPath()
      g.moveTo(px, pz)
      g.arc(px, pz, W * 0.18, dir - 0.5, dir + 0.5)
      g.fill()
    }
    g.save()
    g.translate(px, pz)
    g.rotate(-s.player.facing + Math.PI)
    g.fillStyle = '#d9443a'
    g.strokeStyle = '#fff'
    g.lineWidth = 1.5 * dpr
    g.beginPath()
    g.moveTo(0, -6 * dpr)
    g.lineTo(4.5 * dpr, 5 * dpr)
    g.lineTo(-4.5 * dpr, 5 * dpr)
    g.closePath()
    g.fill()
    g.stroke()
    g.restore()
  }

  private drawSnow(s: GameState) {
    const { res, data } = s.field
    const px = this.snowImage.data
    const step = res / SNOW_RES
    for (let j = 0; j < SNOW_RES; j++) {
      for (let i = 0; i < SNOW_RES; i++) {
        const v = data[Math.floor(j * step) * res + Math.floor(i * step)]
        // 地面（濃紺）→ 雪（白）
        const o = (j * SNOW_RES + i) * 4
        px[o] = 40 + v * 205
        px[o + 1] = 48 + v * 202
        px[o + 2] = 62 + v * 193
        px[o + 3] = 255
      }
    }
    this.snowCtx.putImageData(this.snowImage, 0, 0)
  }
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}
