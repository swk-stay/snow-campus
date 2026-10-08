/** 雪の量の単位：0.25m² を最大の高さまで覆う雪 = 1。セル解像度を変えてもバランスが変わらないようにするため */
const UNIT_AREA = 0.25

/**
 * 雪原。res×res のセルに雪の量 (0..1) を持つ。
 * セル (i, j) は ワールド座標 x = -size/2 + (i+0.5)*cellSize, z = 同様 に対応し、
 * data[j * res + i] に格納する（描画側のテクスチャも同じ並び）。
 */
export class SnowField {
  readonly res: number
  readonly size: number
  readonly cellSize: number
  readonly data: Float32Array
  /** セル量 1.0 が何単位の雪に相当するか */
  readonly unitsPerCell: number
  /** 描画側がテクスチャを再アップロードすべきか */
  dirty = true

  constructor(res: number, size: number) {
    this.res = res
    this.size = size
    this.cellSize = size / res
    this.data = new Float32Array(res * res)
    this.unitsPerCell = (this.cellSize * this.cellSize) / UNIT_AREA
  }

  cellCenter(i: number): number {
    return -this.size / 2 + (i + 0.5) * this.cellSize
  }

  private toCell(v: number): number {
    return Math.floor((v + this.size / 2) / this.cellSize)
  }

  amountAt(x: number, z: number): number {
    const i = this.toCell(x)
    const j = this.toCell(z)
    if (i < 0 || j < 0 || i >= this.res || j >= this.res) return 0
    return this.data[j * this.res + i]
  }

  fill(fn: (x: number, z: number) => number) {
    for (let j = 0; j < this.res; j++) {
      for (let i = 0; i < this.res; i++) {
        this.data[j * this.res + i] = Math.min(1, Math.max(0, fn(this.cellCenter(i), this.cellCenter(j))))
      }
    }
    this.dirty = true
  }

  clearRect(minX: number, minZ: number, maxX: number, maxZ: number) {
    for (let j = 0; j < this.res; j++) {
      const z = this.cellCenter(j)
      if (z < minZ || z > maxZ) continue
      for (let i = 0; i < this.res; i++) {
        const x = this.cellCenter(i)
        if (x >= minX && x <= maxX) this.data[j * this.res + i] = 0
      }
    }
    this.dirty = true
  }

  /**
   * (x, z) を中心に半径 radius の雪を削り、削った量（単位換算済み）を返す。
   * 中心ほど速く削れる（1 - (d/r)^2 の減衰）。合計が maxAmount を超える場合は全体を比例縮小する。
   */
  collect(x: number, z: number, radius: number, rate: number, dt: number, maxAmount: number): number {
    if (maxAmount <= 0) return 0
    const { res, data } = this
    const i0 = Math.max(0, this.toCell(x - radius))
    const i1 = Math.min(res - 1, this.toCell(x + radius))
    const j0 = Math.max(0, this.toCell(z - radius))
    const j1 = Math.min(res - 1, this.toCell(z + radius))
    const r2 = radius * radius

    const forEachCell = (fn: (k: number, take: number) => void) => {
      for (let j = j0; j <= j1; j++) {
        const dz = this.cellCenter(j) - z
        for (let i = i0; i <= i1; i++) {
          const dx = this.cellCenter(i) - x
          const d2 = dx * dx + dz * dz
          if (d2 > r2) continue
          const k = j * res + i
          const take = Math.min(data[k], rate * dt * (1 - d2 / r2))
          if (take > 0) fn(k, take)
        }
      }
    }

    let want = 0
    forEachCell((_, take) => (want += take))
    if (want <= 0) return 0

    const scale = Math.min(1, maxAmount / this.unitsPerCell / want)
    forEachCell((k, take) => (data[k] -= take * scale))
    this.dirty = true
    return want * scale * this.unitsPerCell
  }
}
