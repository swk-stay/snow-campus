import * as THREE from 'three'

// 実写真が用意できるまでのプレースホルダー。Canvas で「それっぽい校舎の外観」を描く。
// 完成時のカラー化が映えるよう、色ははっきりめにしている。

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function drawWall(g: CanvasRenderingContext2D, w: number, h: number) {
  const wall = g.createLinearGradient(0, 0, 0, h)
  wall.addColorStop(0, '#e0b48a')
  wall.addColorStop(1, '#b97f55')
  g.fillStyle = wall
  g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(90, 45, 25, 0.22)'
  g.lineWidth = 1
  for (let y = 0; y < h; y += 11) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(w, y)
    g.stroke()
  }
  // 屋上の笠木と基礎
  g.fillStyle = '#f1e8d8'
  g.fillRect(0, 0, w, 34)
  g.fillStyle = '#8c8c8c'
  g.fillRect(0, h - 36, w, 36)
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

function drawFloors(g: CanvasRenderingContext2D, w: number, cols: number, floors: number, skip?: (col: number, floor: number) => boolean) {
  const top = 60
  const floorH = 136
  const cellW = w / cols
  for (let f = 0; f < floors; f++) {
    const y = top + f * floorH
    if (f > 0) {
      g.fillStyle = '#efe4d2'
      g.fillRect(0, y - 14, w, 8)
    }
    for (let c = 0; c < cols; c++) {
      if (skip?.(c, f)) continue
      drawWindow(g, c * cellW + cellW * 0.2, y + 14, cellW * 0.6, 84)
    }
  }
}

export function createFrontTexture(label: string): THREE.CanvasTexture {
  const [c, g] = makeCanvas(1024, 660)
  drawWall(g, c.width, c.height)
  const cols = 10
  drawFloors(g, c.width, cols, 4, (col, floor) => floor === 3 && (col === 4 || col === 5))

  // 正面玄関
  const doorX = c.width / 2 - 100
  g.fillStyle = '#5b5b5b'
  g.fillRect(doorX - 16, 470, 232, 154)
  g.fillStyle = '#2c6e49'
  g.fillRect(doorX - 30, 462, 260, 22)
  for (let i = 0; i < 4; i++) drawWindow(g, doorX + 6 + i * 50, 500, 38, 120)

  // 時計と看板
  g.fillStyle = '#f7f2ea'
  g.beginPath()
  g.arc(c.width / 2, 34, 30, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#333'
  g.lineWidth = 4
  g.stroke()
  g.beginPath()
  g.moveTo(c.width / 2, 34)
  g.lineTo(c.width / 2, 14)
  g.moveTo(c.width / 2, 34)
  g.lineTo(c.width / 2 + 14, 40)
  g.stroke()
  g.fillStyle = '#7a2e1f'
  g.fillRect(c.width / 2 - 130, 412, 260, 44)
  g.fillStyle = '#ffe9a8'
  g.font = 'bold 30px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(label, c.width / 2, 435)

  return toTexture(c)
}

export function createSideTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(440, 660)
  drawWall(g, c.width, c.height)
  drawFloors(g, c.width, 4, 4)
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
