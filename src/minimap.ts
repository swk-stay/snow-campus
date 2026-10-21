import type { Building, GameState } from './sim/game'
import { paintGround } from './render/campusGround'

// 常時表示のミニマップ（右上）。向きは見下ろし視点と同じで固定（上が東。公式キャンパスマップと同じ向き）。
// キャンパス全体は広いので、全部は映さない。自分といま建てている建物の両方が入る範囲を映す
// （一辺 MIN_SPAN〜MAX_SPAN m。雪原の端では止める）。範囲はゆっくり変えて、歩くたびに縮尺がぶれないようにする。
// タップ／M キーで全体マップ（俯瞰カメラ）に切り替える。
// 地面（芝生・園路）の上に、0.3 秒ごとに縮小コピーした雪を重ねる。建物・除雪機・プレイヤーは毎フレーム描く。
// いま建てている建物にはピンを立てる。MAX_SPAN に収まらないほど遠いときは、縁にその方向の矢印を出す。

/** 雪の縮小コピーの解像度（雪原全体で。1 ピクセル約 2m） */
const SNOW_RES = 230
/** ミニマップに映す範囲の一辺の最小・最大 (m)。小さい画面でも建物が潰れない程度で止める */
const MIN_SPAN = 180
const MAX_SPAN = 320
/** 範囲を決めるとき、自分と建物のまわりに足す余白 (m) */
const MARGIN = 22

export class Minimap {
  private readonly canvas: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D
  private readonly snow: HTMLCanvasElement
  private readonly snowCtx: CanvasRenderingContext2D
  private readonly snowImage: ImageData
  private readonly ground = paintGround(1024)
  private snowTimer = 0
  /** いま映している範囲の中心と一辺（目標値へ補間する）。span が 0 なら未初期化 */
  private viewX = 0
  private viewZ = 0
  private span = 0

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
    const { size, centerX, centerZ } = s.field
    const target = s.buildings.find((o) => !o.completed)
    this.follow(dt, s, target)
    // 映す範囲の左上（ワールド座標）。雪原の外へははみ出さない
    const clampView = (v: number, c: number) => Math.min(c + size / 2 - this.span, Math.max(c - size / 2, v - this.span / 2))
    const vx = clampView(this.viewX, centerX)
    const vz = clampView(this.viewZ, centerZ)
    const toPxX = (x: number) => ((x - vx) / this.span) * W
    const toPxZ = (z: number) => ((z - vz) / this.span) * W
    // 雪原全体の画像から、映す範囲だけを切り出して描く
    const blit = (img: HTMLCanvasElement) => {
      const k = img.width / size
      g.drawImage(img, (vx - (centerX - size / 2)) * k, (vz - (centerZ - size / 2)) * k, this.span * k, this.span * k, 0, 0, W, W)
    }

    this.snowTimer -= dt
    if (this.snowTimer <= 0) {
      this.snowTimer = 0.3
      this.drawSnow(s)
    }
    g.imageSmoothingEnabled = true
    blit(this.ground)
    blit(this.snow)

    // 建物：完成はカラー、いま建てているものは金色で点滅、未解放は点線
    for (const b of s.buildings) {
      const x = toPxX(b.x - b.width / 2)
      const y = toPxZ(b.z - b.depth / 2)
      const w = (b.width / this.span) * W
      const h = (b.depth / this.span) * W
      const current = b === target
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

    for (const m of s.machines) dot(g, toPxX(m.x), toPxZ(m.z), 3 * dpr, '#4a7fd6')
    for (const p of s.plows) dot(g, toPxX(p.x), toPxZ(p.z), 3.5 * dpr, '#f28c28')
    // レア雪は点滅する水色の点
    for (const r of s.rares) dot(g, toPxX(r.x), toPxZ(r.z), (3 + Math.sin(time * 8) * 1.2) * dpr, '#5fe3ff')

    // いま建てている建物：範囲の中ならピン、外なら縁にその方向の矢印
    const px = toPxX(s.player.x)
    const pz = toPxZ(s.player.z)
    if (target) {
      const tx = toPxX(target.x)
      const tz = toPxZ(target.z)
      if (tx >= 0 && tz >= 0 && tx <= W && tz <= W) {
        pin(g, tx, tz, dpr, time)
      } else {
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

    // プレイヤー（向きつきの三角）とグランドレベル時の視野
    if (viewYaw !== null) {
      const dir = Math.atan2(-Math.cos(viewYaw), -Math.sin(viewYaw))
      g.fillStyle = 'rgba(255, 255, 255, 0.35)'
      g.beginPath()
      g.moveTo(px, pz)
      g.arc(px, pz, W * 0.18, dir - 0.5, dir + 0.5)
      g.fill()
    }
    // 自分は白い縁の丸の上に三角。雪や建物の色に紛れないように
    dot(g, px, pz, 9 * dpr, 'rgba(255, 255, 255, 0.9)')
    dot(g, px, pz, 7.5 * dpr, '#d9443a')
    g.save()
    g.translate(px, pz)
    g.rotate(-s.player.facing + Math.PI)
    g.fillStyle = '#d9443a'
    g.strokeStyle = '#fff'
    g.lineWidth = 1.5 * dpr
    g.beginPath()
    g.moveTo(0, -5 * dpr)
    g.lineTo(3.8 * dpr, 4 * dpr)
    g.lineTo(-3.8 * dpr, 4 * dpr)
    g.closePath()
    g.fill()
    g.restore()
  }

  /** 映す範囲の目標（自分と建物 target が両方入る範囲）を決めて、そこへ補間する */
  private follow(dt: number, s: GameState, target: Building | undefined) {
    const { x, z } = s.player
    let span = MIN_SPAN
    let cx = x
    let cz = z
    if (target) {
      const need = Math.max(Math.abs(target.x - x) + target.width / 2, Math.abs(target.z - z) + target.depth / 2) + MARGIN * 2
      span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, need))
      // 中心は自分と建物の中間。ただし自分は必ず余白つきで範囲に入れる（建物が遠すぎるときは矢印で示す）
      const reach = span / 2 - MARGIN
      cx = Math.min(x + reach, Math.max(x - reach, (x + target.x) / 2))
      cz = Math.min(z + reach, Math.max(z - reach, (z + target.z) / 2))
    }
    if (this.span === 0) {
      this.span = span
      this.viewX = cx
      this.viewZ = cz
      return
    }
    // 縮尺はゆっくり、中心は自分の動きに遅れない程度に
    this.span += (span - this.span) * (1 - Math.exp(-dt * 1.5))
    const k = 1 - Math.exp(-dt * 4)
    this.viewX += (cx - this.viewX) * k
    this.viewZ += (cz - this.viewZ) * k
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

/** 目標のピン（先端が (x, y)）。少し上下に弾ませる */
function pin(g: CanvasRenderingContext2D, x: number, y: number, dpr: number, time: number) {
  const r = 5.5 * dpr
  const top = y - 15 * dpr - Math.abs(Math.sin(time * 4)) * 2 * dpr
  g.fillStyle = '#ffb020'
  g.strokeStyle = '#fff'
  g.lineWidth = 1.5 * dpr
  g.beginPath()
  g.moveTo(x, y)
  g.arc(x, top, r, Math.PI * 0.75, Math.PI * 0.25)
  g.closePath()
  g.fill()
  g.stroke()
  dot(g, x, top, 2 * dpr, '#fff')
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}
