import type { BuildingDef } from '../../config'
import { spanAtZ, type Kit } from './kit'

// 建物モデルで共通に使う色と部品（屋上・ガラスの壁・天井の照明・展示の車など）。
// 中庭まわり（models.ts）と、キャンパスの外側の棟（outerModels.ts）の両方で使う。

export type Pt = readonly [number, number]
export type Model = (k: Kit, b: BuildingDef) => void

export const WHITE = 0xf0f1f0
export const OFFWHITE = 0xe2dfd8
export const GLASS = 0x86a7bd
export const CLEAR = 0xc3d6df
export const FRAME = 0x8f989f
export const WOOD = 0xc89a64
export const RED_CHAIR = 0xd23a2a
export const ORANGE = 0xe0662a
export const WARM_LIGHT = 0xffe0a8

/** 0..1 の決定的なハッシュ（窓の配置のばらつき用） */
export function h3(a: number, b: number, c: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453
  return s - Math.floor(s)
}

/** 階の床の高さの配列（1 階の高さ、基準階の高さ、階数） */
export function levels(ground: number, typical: number, floors: number): number[] {
  const out = [0, ground]
  for (let i = 1; i < floors; i++) out.push(ground + typical * i)
  return out
}

/** 屋上のスラブとパラペット（立ち上がり） */
export function roof(k: Kit, x0: number, z0: number, x1: number, z1: number, y: number, parapet: number, color: number) {
  k.box(x0, y - 0.3, z0, x1, y + 0.05, z1, 0xc9c7c1)
  const t = 0.3
  k.box(x0, y, z0, x1, y + parapet, z0 + t, color)
  k.box(x0, y, z1 - t, x1, y + parapet, z1, color)
  k.box(x0, y, z0, x0 + t, y + parapet, z1, color)
  k.box(x1 - t, y, z0, x1, y + parapet, z1, color)
}

/** 屋上の設備（室外機・塔屋）。見下ろしで屋上が単調にならないように */
export function rooftop(k: Kit, x0: number, z0: number, x1: number, z1: number, y: number, r: () => number) {
  for (let i = 0; i < 6; i++) {
    const w = 1.2 + r() * 2.2
    const d = 1.0 + r() * 1.6
    const x = x0 + 1 + r() * (x1 - x0 - w - 2)
    const z = z0 + 1 + r() * (z1 - z0 - d - 2)
    k.box(x, y, z, x + w, y + 0.9 + r() * 0.8, z + d, 0xa9adb0)
  }
}

/** 展示用の車（箱を組み合わせた簡易形） */
export function car(k: Kit, x: number, y: number, z: number, angle: number, color: number) {
  k.obox(x, y + 0.3, z, 4.2, 0.6, 1.8, angle, color)
  k.obox(x - Math.cos(angle) * 0.3, y + 0.9, z + Math.sin(angle) * 0.3, 2.2, 0.55, 1.6, angle, 0x2a3138)
  for (const [u, v] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
    const wx = x + u * Math.cos(angle) + v * Math.sin(angle)
    const wz = z - u * Math.sin(angle) + v * Math.cos(angle)
    k.cylinder(wx, wz, 0.33, y, y + 0.66, 0x1d1f22, 8)
  }
}

/** 多角形の外周にガラスの壁と細いマリオンを立てる */
export function ringWalls(k: Kit, poly: readonly Pt[], y0: number, y1: number, step: number, glass: number, mullion: number) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    k.wall(a, b, y0, y1, glass, 'glass')
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len
    const n = Math.max(1, Math.round(len / step))
    for (let j = 0; j <= n; j++) {
      const u = (j / n) * len
      k.obox(a[0] + ux * u, y0, a[1] + uz * u, 0.05, y1 - y0, 0.1, Math.atan2(-uz, ux), mullion)
    }
    // 上下の枠
    k.slabWall(a, b, y1 - 0.12, y1, 0.12, mullion)
  }
}

/** 多角形の内側に並べる天井の照明（z 方向に step ごとの帯） */
export function ceilingLights(k: Kit, poly: readonly Pt[], y: number, step: number, color: number, width = 0.5) {
  const zs = poly.map((p) => p[1])
  for (let z = Math.min(...zs) + step / 2; z < Math.max(...zs); z += step) {
    const span = spanAtZ(poly, z)
    if (!span) continue
    const [x0, x1] = [span[0] + 0.6, span[1] - 0.6]
    if (x1 - x0 < 0.5) continue
    k.quad([x0, y, z + width / 2], [x1, y, z + width / 2], [x1, y, z - width / 2], [x0, y, z - width / 2], color, 'light')
  }
}
