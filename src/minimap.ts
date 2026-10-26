import type { GameState } from './sim/game'
import { skinById } from './skins'

// 常時表示のミニマップ（右上）。向きは見下ろし視点と同じで固定（上が東。公式キャンパスマップと同じ向き）。
// キャンパス全体は広いので、プレイヤーのまわり SPAN m 四方だけを映す（雪原の端では止める）。
// タップ／M キーで全体マップ（俯瞰カメラ）に切り替える。
// 地面は塗らず、0.3 秒ごとに縮小コピーした雪だけを重ねる。建物・レア雪・プレイヤーは毎フレーム描く。
// いま建てている建物が範囲の外にあるときは、縁にその方向の矢印を出す。

/** 雪の縮小コピーの解像度（雪原全体で。1 ピクセル約 2m） */
const SNOW_RES = 230
/** ミニマップに映す範囲の一辺 (m) */
const SPAN = 180

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
    const side = Math.round(this.canvas.clientWidth * dpr)
    // canvas の初期サイズは 300×150 なので、幅がちょうど 300 になる端末では高さも見ないと 150 のまま残る
    if (this.canvas.width !== side || this.canvas.height !== side) this.canvas.width = this.canvas.height = side
    const W = this.canvas.width
    const g = this.g
    const { size, centerX, centerZ } = s.field
    // 映す範囲の左上（ワールド座標）。プレイヤーを中心に、雪原の外へははみ出さない
    const clampView = (v: number, c: number) => Math.min(c + size / 2 - SPAN, Math.max(c - size / 2, v - SPAN / 2))
    const vx = clampView(s.player.x, centerX)
    const vz = clampView(s.player.z, centerZ)
    const toPxX = (x: number) => ((x - vx) / SPAN) * W
    const toPxZ = (z: number) => ((z - vz) / SPAN) * W
    // 雪原全体の画像から、映す範囲だけを切り出して描く
    const blit = (img: HTMLCanvasElement) => {
      const k = img.width / size
      g.drawImage(img, (vx - (centerX - size / 2)) * k, (vz - (centerZ - size / 2)) * k, SPAN * k, SPAN * k, 0, 0, W, W)
    }

    this.snowTimer -= dt
    if (this.snowTimer <= 0) {
      this.snowTimer = 0.3
      this.drawSnow(s)
    }
    g.fillStyle = '#7d8691'
    g.fillRect(0, 0, W, W)
    g.imageSmoothingEnabled = true
    blit(this.snow)

    // 建物：完成はカラー、いま建てているものは金色で点滅、未解放は点線
    for (const b of s.buildings) {
      const x = toPxX(b.x - b.width / 2)
      const y = toPxZ(b.z - b.depth / 2)
      const w = (b.width / SPAN) * W
      const h = (b.depth / SPAN) * W
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

    // レア雪は点滅する水色の点
    for (const r of s.rares) dot(g, toPxX(r.x), toPxZ(r.z), (3 + Math.sin(time * 8) * 1.2) * dpr, '#5fe3ff')

    // いま建てている建物が範囲の外なら、縁にその方向の矢印
    const target = s.buildings.find((o) => !o.completed)
    const px = toPxX(s.player.x)
    const pz = toPxZ(s.player.z)
    if (target) {
      const tx = toPxX(target.x)
      const tz = toPxZ(target.z)
      if (tx < 0 || tz < 0 || tx > W || tz > W) {
        const ang = Math.atan2(tz - pz, tx - px)
        // 中心から矢印の方向へ伸ばして、縁の少し内側で止める
        const m = 9 * dpr
        const t = Math.min(
          Math.abs((Math.cos(ang) > 0 ? W - m - px : m - px) / (Math.cos(ang) || 1e-6)),
          Math.abs((Math.sin(ang) > 0 ? W - m - pz : m - pz) / (Math.sin(ang) || 1e-6)),
        )
        g.save()
        g.translate(px + Math.cos(ang) * t, pz + Math.sin(ang) * t)
        g.rotate(ang)
        g.fillStyle = `rgba(255, 176, 32, ${0.75 + 0.25 * Math.sin(time * 6)})`
        g.strokeStyle = '#fff'
        g.lineWidth = 1.5 * dpr
        g.beginPath()
        g.moveTo(7 * dpr, 0)
        g.lineTo(-5 * dpr, 5.5 * dpr)
        g.lineTo(-5 * dpr, -5.5 * dpr)
        g.closePath()
        g.fill()
        g.stroke()
        g.restore()
      }
    }

    // マルチプレイのほかのプレイヤーはスキンの色で。白や黒のスキンでも雪と背景に埋もれないよう、暗い縁と白い縁を重ねる
    for (const o of s.players) {
      if (o === s.player) continue
      const x = toPxX(o.x)
      const z = toPxZ(o.z)
      dot(g, x, z, 6.5 * dpr, 'rgba(0, 0, 0, 0.45)')
      dot(g, x, z, 5.5 * dpr, '#fff')
      dot(g, x, z, 4 * dpr, '#' + skinById(o.skin).color.toString(16).padStart(6, '0'))
    }

    // プレイヤー（向きつきの三角）とグランドレベル時の視野
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
        // 雪が薄いほど透けて地面が見える
        const o = (j * SNOW_RES + i) * 4
        px[o] = 236
        px[o + 1] = 242
        px[o + 2] = 252
        px[o + 3] = Math.min(255, v * 400)
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
