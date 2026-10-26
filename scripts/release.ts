// パッチノートの断片（パッチノート/未リリース/*.md）を 1 つのバージョンにまとめて パッチノート.md に書き、
// package.json と package-lock.json の version を上げる。断片がなければ何もしない。
// main へのマージのたびに GitHub Actions（deploy.yml の release）から `npm run release` で呼ばれる。
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'

const NOTES = 'パッチノート.md'
const FRAGMENTS = 'パッチノート/未リリース'

type Bump = 'minor' | 'patch'
type Fragment = { file: string; bump: Bump; lead: string; sections: Map<string, string[]> }

function parseFragment(file: string): Fragment {
  const text = readFileSync(`${FRAGMENTS}/${file}`, 'utf8').replace(/\r\n/g, '\n')
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  const bump = m?.[1].match(/^bump:\s*(minor|patch)\s*$/m)?.[1] as Bump | undefined
  if (!m || !bump) throw new Error(`${file}: 先頭に「---\\nbump: minor か patch\\n---」が要る`)

  // 最初の「### 」より前が説明、その後は見出しごとの本文
  const [lead, ...rest] = m[2].split(/^### /m)
  const sections = new Map<string, string[]>()
  for (const part of rest) {
    const [heading, ...body] = part.split('\n')
    const items = sections.get(heading.trim()) ?? []
    items.push(body.join('\n').trim())
    sections.set(heading.trim(), items)
  }
  return { file, bump, lead: lead.trim(), sections }
}

function nextVersion(version: string, bump: Bump): string {
  const [major, minor, patch] = version.split('.').map(Number)
  return bump === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
}

const files = readdirSync(FRAGMENTS).filter((f) => f.endsWith('.md')).sort()
if (files.length === 0) {
  console.log('未リリースの断片はない')
  process.exit(0)
}
const fragments = files.map(parseFragment)
const bump: Bump = fragments.some((f) => f.bump === 'minor') ? 'minor' : 'patch'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const prev = pkg.version
const version = nextVersion(prev, bump)

// 見出しは最初に出てきた順。同じ見出しの本文は断片の順に並べる
const sections = new Map<string, string[]>()
for (const f of fragments) {
  for (const [heading, items] of f.sections) sections.set(heading, [...(sections.get(heading) ?? []), ...items])
}
const lead = fragments.map((f) => f.lead).filter(Boolean).join('\n')
const note = bump === 'minor' ? `v${prev} の記録とは比べられない。` : ''
const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())

const entry = [
  `## v${version}（${date}）`,
  lead + note,
  ...[...sections].map(([heading, items]) => `### ${heading}\n\n${items.filter(Boolean).join('\n')}`),
].filter(Boolean).join('\n\n')

const notes = readFileSync(NOTES, 'utf8')
const at = notes.search(/^## v/m)
if (at < 0) throw new Error(`${NOTES} に「## v」で始まる節が見つからない`)
writeFileSync(NOTES, `${notes.slice(0, at)}${entry}\n\n---\n\n${notes.slice(at)}`)

// package.json は version の行だけ書き換えて、ほかの書式を崩さない
for (const path of ['package.json', 'package-lock.json']) {
  const text = readFileSync(path, 'utf8')
  const json = JSON.parse(text) as { version?: string; packages?: Record<string, { version?: string }> }
  json.version = version
  if (json.packages?.['']) json.packages[''].version = version
  writeFileSync(path, path === 'package.json'
    ? text.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`)
    : `${JSON.stringify(json, null, 2)}\n`)
}

for (const f of files) rmSync(`${FRAGMENTS}/${f}`)
console.log(`v${prev} → v${version}（${files.join(', ')}）`)
