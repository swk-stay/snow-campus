import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// サーバーは遊ぶ人が手元のチェックアウトから起動するので、package.json の version だけでは
// どのコミットか・手を入れているかが分からない。コミットと未コミットの変更の有無、Node のバージョンも並べる
// 例: snow-campus-server/0.3.0 (6f163f2-dirty; node v22.11.0)

const root = new URL('..', import.meta.url)

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return undefined
  }
}

const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string }
const commit = git(['rev-parse', '--short', 'HEAD'])
// 追跡していないファイル（エディタの設定など）はサーバーの動きに関わらないので数えない
const dirty = commit !== undefined && git(['status', '--porcelain', '--untracked-files=no']) !== ''

export const SERVER_VERSION = `snow-campus-server/${pkg.version} (${commit ?? 'git不明'}${dirty ? '-dirty' : ''}; node ${process.version})`
