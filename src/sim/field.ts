/** 雪の量の単位：0.25m² を最大の高さまで覆う雪 = 1。セル解像度を変えてもバランスが変わらないようにするため */
export const UNIT_AREA = 0.25

/**
 * 雪原。res×res のセルに雪の量 (0..1) を持つ。中心 (centerX, centerZ)、一辺 size の正方形。
 * セル (i, j) は ワールド座標 x = centerX - size/2 + (i+0.5)*cellSize, z = 同様 に対応し、
 * data[j * res + i] に格納する（描画側のテクスチャも同じ並び）。
 */
export class SnowField {
  readonly res: number
  readonly size: number
  readonly centerX: number
  readonly centerZ: number
  readonly cellSize: number
  readonly data: Float32Array
  /** セル量 1.0 が何単位の雪に相当するか */
  readonly unitsPerCell: number
  /** 雪が積もらないセル（建物の敷地や寄付ゾーン）。fill / add の対象外 */
  readonly blocked: Uint8Array
  /** 描画側がテクスチャを再アップロードすべきか */
  dirty = true
  /** 前回の描画から変わったセルの範囲（描画側が変換し直す範囲。dirty のときだけ有効） */
  readonly dirtyRect = { i0: 0, i1: 0, j0: 0, j1: 0 }

  constructor(res: number, size: number, centerX = 0, centerZ = 0) {
    this.res = res
    this.size = size
    this.centerX = centerX
    this.centerZ = centerZ
    this.cellSize = size / res
    this.data = new Float32Array(res * res)
    this.unitsPerCell = (this.cellSize * this.cellSize) / UNIT_AREA
    this.blocked = new Uint8Array(res * res)
  }

  cellX(i: number): number {
    return this.centerX - this.size / 2 + (i + 0.5) * this.cellSize
  }

  cellZ(j: number): number {
    return this.centerZ - this.size / 2 + (j + 0.5) * this.cellSize
  }

  private toCellX(x: number): number {
    return Math.floor((x - this.centerX + this.size / 2) / this.cellSize)
  }

  private toCellZ(z: number): number {
    return Math.floor((z - this.centerZ + this.size / 2) / this.cellSize)
  }

  /** 雪原の端から margin 以上内側に収める */
  clamp(o: { x: number; z: number }, margin: number) {
    const h = this.size / 2 - margin
    o.x = Math.min(this.centerX + h, Math.max(this.centerX - h, o.x))
    o.z = Math.min(this.centerZ + h, Math.max(this.centerZ - h, o.z))
  }

  /** 雪原の端から margin 以上内側のランダムな点 */
  randomPoint(margin: number): { x: number; z: number } {
    const h = this.size / 2 - margin
    return { x: this.centerX + (Math.random() * 2 - 1) * h, z: this.centerZ + (Math.random() * 2 - 1) * h }
  }

  /** 雪原全体を描き直す必要があることにする（セーブの読み込みなど、data を直接書き換えたとき） */
  markAllDirty() {
    this.touch(0, this.res - 1, 0, this.res - 1)
  }

  /** 変わったセルの範囲を広げる */
  private touch(i0: number, i1: number, j0: number, j1: number) {
    const r = this.dirtyRect
    if (!this.dirty) {
      r.i0 = i0
      r.i1 = i1
      r.j0 = j0
      r.j1 = j1
      this.dirty = true
      return
    }
    r.i0 = Math.min(r.i0, i0)
    r.i1 = Math.max(r.i1, i1)
    r.j0 = Math.min(r.j0, j0)
    r.j1 = Math.max(r.j1, j1)
  }

  amountAt(x: number, z: number): number {
    const i = this.toCellX(x)
    const j = this.toCellZ(z)
    if (i < 0 || j < 0 || i >= this.res || j >= this.res) return 0
    return this.data[j * this.res + i]
  }

  fill(fn: (x: number, z: number) => number) {
    for (let j = 0; j < this.res; j++) {
      for (let i = 0; i < this.res; i++) {
        const k = j * this.res + i
        this.data[k] = this.blocked[k] ? 0 : Math.min(1, Math.max(0, fn(this.cellX(i), this.cellZ(j))))
      }
    }
    this.touch(0, this.res - 1, 0, this.res - 1)
  }

  /** 矩形内の雪をどけて、以後も積もらないようにする */
  blockRect(minX: number, minZ: number, maxX: number, maxZ: number) {
    for (let j = 0; j < this.res; j++) {
      const z = this.cellZ(j)
      if (z < minZ || z > maxZ) continue
      for (let i = 0; i < this.res; i++) {
        const x = this.cellX(i)
        if (x < minX || x > maxX) continue
        this.data[j * this.res + i] = 0
        this.blocked[j * this.res + i] = 1
      }
    }
    this.touch(0, this.res - 1, 0, this.res - 1)
  }

  /**
   * (x, z) を中心に半径 radius の雪を削り、削った量（単位換算済み）を返す。
   * 中心ほど速く削れる（1 - (d/r)^2 の減衰）。合計が maxAmount を超える場合は全体を比例縮小する。
   * arc を渡すと、向き facing（+Z 方向が 0）を中心とした角度 arc（ラジアン）の扇形だけを削る。
   */
  collect(
    x: number,
    z: number,
    radius: number,
    rate: number,
    dt: number,
    maxAmount: number,
    arc?: { facing: number; angle: number },
  ): number {
    if (maxAmount <= 0) return 0
    const { res, data } = this
    const i0 = Math.max(0, this.toCellX(x - radius))
    const i1 = Math.min(res - 1, this.toCellX(x + radius))
    const j0 = Math.max(0, this.toCellZ(z - radius))
    const j1 = Math.min(res - 1, this.toCellZ(z + radius))
    const r2 = radius * radius
    // 扇形の判定：中心方向との内積 >= cos(半角) × 距離
    const fx = arc ? Math.sin(arc.facing) : 0
    const fz = arc ? Math.cos(arc.facing) : 0
    const cosHalf = arc && arc.angle < Math.PI * 2 ? Math.cos(arc.angle / 2) : -2

    const forEachCell = (fn: (k: number, take: number) => void) => {
      for (let j = j0; j <= j1; j++) {
        const dz = this.cellZ(j) - z
        for (let i = i0; i <= i1; i++) {
          const dx = this.cellX(i) - x
          const d2 = dx * dx + dz * dz
          if (d2 > r2) continue
          if (dx * fx + dz * fz < cosHalf * Math.sqrt(d2)) continue
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
    this.touch(i0, i1, j0, j1)
    return want * scale * this.unitsPerCell
  }

  /** 雪原全体の雪の合計（単位換算済み） */
  total(): number {
    let sum = 0
    for (let k = 0; k < this.data.length; k++) sum += this.data[k]
    return sum * this.unitsPerCell
  }

  /** (x, z) を中心に半径 radius へ雪を降らせる（降雪機）。中心ほど速く積もる */
  add(x: number, z: number, radius: number, rate: number, dt: number) {
    const { res, data, blocked } = this
    const i0 = Math.max(0, this.toCellX(x - radius))
    const i1 = Math.min(res - 1, this.toCellX(x + radius))
    const j0 = Math.max(0, this.toCellZ(z - radius))
    const j1 = Math.min(res - 1, this.toCellZ(z + radius))
    const r2 = radius * radius
    for (let j = j0; j <= j1; j++) {
      const dz = this.cellZ(j) - z
      for (let i = i0; i <= i1; i++) {
        const dx = this.cellX(i) - x
        const d2 = dx * dx + dz * dz
        const k = j * res + i
        if (d2 > r2 || blocked[k]) continue
        data[k] = Math.min(1, data[k] + rate * dt * (1 - d2 / r2))
      }
    }
    if (i0 <= i1 && j0 <= j1) this.touch(i0, i1, j0, j1)
  }
}
