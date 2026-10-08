import GUI from 'lil-gui'
import { ECONOMY, FX, PLAYER, UPGRADE_EFFECT, UPGRADES, WORLD, type UpgradeId } from './config'
import { maxLevel, refillField, syncOwnedUnits, type GameState } from './sim/game'

// ?debug のときだけ出す調整パネル。config のオブジェクトを直接書き換えるので即座に反映される。
// 学園祭のライブ用：「回収半径を 8m にすると一瞬で雪が消える」のような見せ方を想定。

export type DebugHooks = {
  /** 完成済みの建物のカラー化演出をもう一度再生する */
  replayColorize: () => void
  /** セーブを消してリロード */
  resetSave: () => void
}

export function createDebugGui(s: GameState, hooks: DebugHooks): GUI {
  const gui = new GUI({ title: 'Snow Campus Debug' })

  const player = gui.addFolder('プレイヤー（基礎値）')
  player.add(PLAYER, 'speed', 1, 20, 0.5).name('移動速度')
  player.add(PLAYER, 'collectRadius', 0.5, 10, 0.1).name('回収半径 (m)')
  player.add(PLAYER, 'collectRate', 0.1, 5, 0.1).name('削る速さ')
  player.add(PLAYER, 'capacity', 10, 1000, 10).name('所持上限')
  player.add(PLAYER, 'throwInterval', 0.01, 0.5, 0.01).name('投げる間隔 (s)')

  const world = gui.addFolder('ワールド')
  world.add(WORLD, 'snowMaxHeight', 0.1, 2, 0.05).name('雪の最大高さ (m)')
  world.add(ECONOMY, 'goldPerSnow', 0, 10, 0.1).name('雪1あたりのG')

  const up = gui.addFolder('アップグレード').close()
  const levels = up.addFolder('現在レベル（直接変更）')
  for (const id of Object.keys(UPGRADES) as UpgradeId[]) {
    levels
      .add(s.upgrades, id, 0, 10, 1)
      .name(UPGRADES[id].label)
      .listen()
      .onChange(() => syncOwnedUnits(s))
  }
  up.add(UPGRADE_EFFECT, 'shovelRadiusPerLevel', 0, 1, 0.05).name('スコップ: 半径/Lv')
  up.add(UPGRADE_EFFECT, 'shovelRatePerLevel', 0, 1, 0.05).name('スコップ: 速さ/Lv')
  up.add(UPGRADE_EFFECT, 'backpackCapacityPerLevel', 0, 2, 0.1).name('リュック: 容量/Lv')
  up.add(UPGRADE_EFFECT.plow, 'speed', 0.5, 10, 0.1).name('除雪機: 速度')
  up.add(UPGRADE_EFFECT.plow, 'radius', 0.5, 5, 0.1).name('除雪機: 半径')
  up.add(UPGRADE_EFFECT.snowMachine, 'rate', 0, 1, 0.01).name('降雪機: 降雪量')

  const fx = gui.addFolder('演出').close()
  fx.add(FX, 'suctionPerSnow', 0, 10, 0.1).name('吸い込みの粒/雪1')
  fx.add(FX, 'colorizeSeconds', 0.5, 10, 0.1).name('カラー化の秒数')

  const actions = {
    gold: () => (s.gold += 1000),
    almost: () => {
      const b = s.buildings.find((b) => !b.completed)
      if (b) b.deposited = Math.max(b.deposited, b.required * 0.9)
    },
    maxAll: () => {
      for (const id of Object.keys(UPGRADES) as UpgradeId[]) s.upgrades[id] = maxLevel(s, id)
      syncOwnedUnits(s)
    },
    refill: () => refillField(s),
    replay: hooks.replayColorize,
    reset: hooks.resetSave,
  }
  const act = gui.addFolder('アクション')
  act.add(actions, 'gold').name('ゴールド +1000')
  act.add(actions, 'almost').name('次の建物を 90% に')
  act.add(actions, 'maxAll').name('アップグレードを上限まで')
  act.add(actions, 'refill').name('雪原をリセット')
  act.add(actions, 'replay').name('カラー化を再生')
  act.add(actions, 'reset').name('セーブを消してリロード')
  act.add(s, 'gold').name('所持ゴールド').listen().disable()
  act.add(s, 'tier').name('Tier').listen().disable()

  return gui
}
