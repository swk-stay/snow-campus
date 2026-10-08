import * as THREE from 'three'

// 実写真が用意できるまでのプレースホルダー。Canvas で「それっぽい校舎の外観」を描く。
// 完成時のカラー化が映えるよう、色ははっきりめにしている。
// 建物の寸法から階数・窓の列数を決め、建物ごとに壁の色を変えて見分けがつくようにする。

const PX_PER_M = 72
const FLOOR_H = 3

const PALETTES = [
  { top: '#e0b48a', bottom: '#b97f55', accent: '#2c6e49', sign: '#7a2e1f' }, // レンガ
  { top: '#f2efe6', bottom: '#cfc8b8', accent: '#2f5fb3', sign: '#1f3f7a' }, // 白タイル
  { top: '#9fb7c9', bottom: '#6d8799', accent: '#c94f3d', sign: '#3d2a1f' }, // 青灰
  { top: '#d9d2c3', bottom: '#a69b85', accent: '#6b4fa0', sign: '#2e2050' }, // コンクリート
  { top: '#e6c27a', bottom: '#b58d3d', accent: '#3d7a6b', sign: '#5a3a10' }, // 黄土
  { top: '#c98f7a', bottom: '#8f5a48', accent: '#e0c050', sign: '#402018' }, // 赤茶
]

export type FacadeSpec = { label: string; width: number; depth: number; height: number; palette: number }

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = Math.min(2048, Math.round(w))
  c.height = Math.min(2048, Math.round(h))
  return [c, c.getContext('2d')!]
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function palette(i: number) {
  return PALETTES[i % PALETTES.length]
}

function drawWall(g: CanvasRenderingContext2D, w: number, h: number, pal: (typeof PALETTES)[number]) {
  const wall = g.createLinearGradient(0, 0, 0, h)
  wall.addColorStop(0, pal.top)
  wall.addColorStop(1, pal.bottom)
  g.fillStyle = wall
  g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(60, 40, 25, 0.18)'
  g.lineWidth = 1
  for (let y = 0; y < h; y += 11) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(w, y)
    g.stroke()
  }
  // 屋上の笠木と基礎
  g.fillStyle = '#f1e8d8'
  g.fillRect(0, 0, w, 26)
  g.fillStyle = '#8c8c8c'
  g.fillRect(0, h - 30, w, 30)
}

function drawWindow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#f7f2ea'
  g.fillRect(x - 5, y - 5, w + 10, h + 10)
  const glass = g.createLinearGradient(x, y, x + w, y + h)
  glass.addColorStop(0, '#9fd3ff')
  glass.addColorStop(0.45, '#3b7fc4')
  glass.addColorStop(1, '#1d3f73')
  g.fillStyle = glass
  g.fillRect(x, y, w, h)
  g.fillStyle = 'rgba(255, 255, 255, 0.35)'
  g.beginPath()
  g.moveTo(x, y + h * 0.6)
  g.lineTo(x + w * 0.5, y)
  g.lineTo(x + w * 0.75, y)
  g.lineTo(x, y + h * 0.95)
  g.fill()
  g.fillStyle = '#f7f2ea'
  g.fillRect(x + w / 2 - 2, y, 4, h)
}

/** 壁面に階ごとの窓を並べる。skip で窓を抜く（玄関や看板の場所） */
function drawFloors(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  skip?: (col: number, floor: number, cols: number, floors: number) => boolean,
) {
  const floorPx = FLOOR_H * PX_PER_M
  const floors = Math.max(1, Math.floor((h - 40) / floorPx))
  const cols = Math.max(1, Math.round(w / PX_PER_M / 1.5))
  const cellW = w / cols
  for (let f = 0; f < floors; f++) {
    // f = 0 が最上階
    const y = h - 30 - (floors - f) * floorPx
    if (f > 0) {
      g.fillStyle = 'rgba(255, 250, 240, 0.7)'
      g.fillRect(0, y - 6, w, 8)
    }
    for (let c = 0; c < cols; c++) {
      if (skip?.(c, f, cols, floors)) continue
      drawWindow(g, c * cellW + cellW * 0.2, y + floorPx * 0.2, cellW * 0.6, floorPx * 0.55)
    }
  }
  return { floors, cols, cellW, floorPx }
}

export function createFrontTexture(spec: FacadeSpec): THREE.CanvasTexture {
  const pal = palette(spec.palette)
  const [c, g] = makeCanvas(spec.width * PX_PER_M, spec.height * PX_PER_M)
  const { width: w, height: h } = c
  drawWall(g, w, h, pal)
  const { floorPx } = drawFloors(g, w, h, (col, floor, cols, floors) => {
    const mid = Math.abs(col + 0.5 - cols / 2) < 1.1
    return mid && (floor === floors - 1 || floor === 0)
  })

  // 正面玄関
  const doorW = Math.min(w * 0.3, 260)
  const doorX = w / 2 - doorW / 2
  const doorTop = h - 30 - floorPx * 0.85
  g.fillStyle = '#5b5b5b'
  g.fillRect(doorX - 12, doorTop, doorW + 24, h - 30 - doorTop)
  g.fillStyle = pal.accent
  g.fillRect(doorX - 26, doorTop - 14, doorW + 52, 20)
  const panes = Math.max(2, Math.round(doorW / 55))
  const paneW = doorW / panes
  for (let i = 0; i < panes; i++) drawWindow(g, doorX + i * paneW + 6, doorTop + 20, paneW - 12, h - 30 - doorTop - 26)

  // 看板（最上階の中央）と時計
  const signW = Math.min(w * 0.6, 300)
  const signY = h - 30 - (Math.max(1, Math.floor((h - 40) / floorPx))) * floorPx + floorPx * 0.25
  g.fillStyle = pal.sign
  g.fillRect(w / 2 - signW / 2, signY, signW, 50)
  g.fillStyle = '#ffe9a8'
  g.font = `bold ${Math.min(32, signW / (spec.label.length + 1))}px sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(spec.label, w / 2, signY + 26)
  drawClock(g, w / 2, signY - 34 < 30 ? 30 : signY - 34, 24)

  return toTexture(c)
}

function drawClock(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#f7f2ea'
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#333'
  g.lineWidth = 3
  g.stroke()
  g.beginPath()
  g.moveTo(x, y)
  g.lineTo(x, y - r * 0.7)
  g.moveTo(x, y)
  g.lineTo(x + r * 0.45, y + r * 0.2)
  g.stroke()
}

export function createSideTexture(spec: FacadeSpec): THREE.CanvasTexture {
  const pal = palette(spec.palette)
  const [c, g] = makeCanvas(spec.depth * PX_PER_M, spec.height * PX_PER_M)
  drawWall(g, c.width, c.height, pal)
  drawFloors(g, c.width, c.height)
  return toTexture(c)
}

export function createRoofTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(512, 256)
  g.fillStyle = '#7d8288'
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = 'rgba(0, 0, 0, 0.15)'
  for (let x = 0; x < c.width; x += 32) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, c.height)
    g.stroke()
  }
  g.fillStyle = '#5c6066'
  g.fillRect(60, 60, 70, 50)
  g.fillRect(380, 140, 50, 50)
  return toTexture(c)
}
