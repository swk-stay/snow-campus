declare const __GAME_VERSION__: string

/** ゲームのバージョン（package.json の version を vite の define で埋め込む）。変更点はパッチノート.md */
export const GAME_VERSION = `v${__GAME_VERSION__}`
