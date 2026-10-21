// バランスの理論値。雪が十分ある場所で削り続けたときの上限など、移動や雪の偏りを無視した目安を出す。
// 実測（調整画面の「実測」）と並べて見て、どこがボトルネックかを判断するのに使う。

import { PLAYER, SNOW_MACHINE, UPGRADE_EFFECT, type UpgradeId } from '../config'
import { UNIT_AREA } from './field'
import { stats, type GameState } from './game'

/**
 * 半径 radius・速さ rate で満タンの雪原を削った（または降らせた）ときの 1 秒あたりの量。
 * セルごとの量は中心ほど多い 1-(d/r)² の重みなので、円の面積の半分 × rate になる。
 * arc（度）を渡すと、その扇形の割合だけに減らす（プレイヤーの前方回収）。
 */
export function diskYield(radius: number, rate: number, arc = 360): number {
  return ((((Math.PI * radius * radius) / 2) * rate) / UNIT_AREA) * (Math.min(arc, 360) / 360)
}

/** diskYield の逆算：1 秒あたり sps を得るのに必要な rate */
export function rateForYield(radius: number, sps: number, arc = 360): number {
  return sps / diskYield(radius, 1, arc)
}

export type Theory = {
  collectRadius: number
  /** プレイヤーの回収 SPS の上限 */
  collect: number
  capacity: number
  /** 空から所持上限まで集める時間 (s) */
  fillTime: number
  /** 寄付ゾーンでの投げ込み SPS */
  throwRate: number
  /** 所持上限ぶんを投げ切る時間 (s) */
  dumpTime: number
  plows: number
  /** 除雪機 1 台の回収 SPS の上限（移動時間は含まない） */
  plowEach: number
  /** 降雪機の台数（＝完成した建物の数） */
  machines: number
  /** 降雪機 1 台の降雪 SPS の上限（雪が満タンになるとそれ以上は積もらない） */
  machineEach: number
  cooldownMult: number
}

/** upgrades を渡すと、そのレベルだった場合の値を返す（アップグレードの効果の比較用） */
export function theory(s: GameState, upgrades: Record<UpgradeId, number> = s.upgrades): Theory {
  const st = stats({ ...s, upgrades })
  const collect = diskYield(st.collectRadius, st.collectRate, PLAYER.collectArc)
  const throwRate = st.throwChunk / st.throwInterval
  const plow = UPGRADE_EFFECT.plow
  const machine = SNOW_MACHINE
  return {
    collectRadius: st.collectRadius,
    collect,
    capacity: st.capacity,
    fillTime: st.capacity / collect,
    throwRate,
    dumpTime: st.capacity / throwRate,
    plows: upgrades.plow,
    plowEach: diskYield(plow.radius, plow.rate),
    machines: s.machines.length,
    machineEach: diskYield(machine.radius, machine.rate),
    cooldownMult: st.cooldownMult,
  }
}
