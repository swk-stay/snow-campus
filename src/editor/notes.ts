// Editor で置く「リクエスト」。オブジェクトそのものではなく、座標＋自由なテキスト（「ここにベンチ」「この木を消す」など）を置いて、
// 書き出したものを実装する人（人でも AI でも）に渡す。珍しい物でも書けるように、種類は大まかな 4 つだけにして中身は文章で持つ。

export type NoteKind = 'add' | 'remove' | 'change' | 'memo'

export const NOTE_KINDS: Record<NoteKind, { label: string; color: number }> = {
  add: { label: '置く', color: 0x2fae5f },
  remove: { label: '消す', color: 0xd9433b },
  change: { label: '変える', color: 0xf09a1f },
  memo: { label: 'メモ', color: 0x3b7bd9 },
}

export type Note = {
  id: number
  kind: NoteKind
  text: string
  /** ゲームのワールド座標（m）。+X が南、+Z が西、+Y が上 */
  x: number
  y: number
  z: number
  /** クリックしたときに当たったもの（「K1号館」「並木（桜） 根元 (12.0, 30.5)」など）。空なら地面や空中 */
  target: string
  /** 実装済み。Markdown の書き出しからは外し、画面では薄く表示する */
  done: boolean
}

const STORAGE_KEY = 'snow-campus-editor-notes'

export function loadNotes(): Note[] {
  try {
    return parseNotes(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveNotes(notes: Note[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // 保存できなくても、書き出しで持ち出せる
  }
}

/** 書き出した JSON（配列、または { notes: [...] }）を読む。形の合わないものは捨てる */
export function parseNotes(json: string): Note[] {
  const raw: unknown = JSON.parse(json)
  const list = Array.isArray(raw) ? raw : (raw as { notes?: unknown })?.notes
  if (!Array.isArray(list)) throw new Error('notes の配列が見つかりません')
  return list
    .filter((n): n is Note => typeof n === 'object' && n !== null && ['x', 'y', 'z'].every((k) => Number.isFinite(n[k])))
    .map((n, i) => ({
      id: Number.isFinite(n.id) ? n.id : i + 1,
      kind: n.kind in NOTE_KINDS ? n.kind : 'memo',
      text: String(n.text ?? ''),
      x: n.x,
      y: n.y,
      z: n.z,
      target: String(n.target ?? ''),
      done: n.done === true,
    }))
}

export function notesToJson(notes: Note[]): string {
  return JSON.stringify({ coordinate: COORDINATE_NOTE, notes }, null, 2)
}

const COORDINATE_NOTE = 'ワールド座標（m）。+X が南、+Z が西、+Y が上。原点は中庭の南西寄り（src/config.ts）'

export const fmt = (v: number) => v.toFixed(1)

/** issue やチャットにそのまま貼れる形。完了済みは省く（番号は一覧の番号のまま） */
export function notesToMarkdown(notes: Note[]): string {
  const todo = notes.filter((n) => !n.done)
  const lines = [`## Editor のリクエスト（${todo.length} 件）`, '', `座標は ${COORDINATE_NOTE}`, '']
  notes.forEach((n, i) => {
    if (n.done) return
    const where = `(${fmt(n.x)}, ${fmt(n.y)}, ${fmt(n.z)})`
    const target = n.target ? ` ／ 対象: ${n.target}` : ''
    lines.push(`${i + 1}. **[${NOTE_KINDS[n.kind].label}]** ${n.text.trim().replace(/\s*\n\s*/g, ' / ') || '（テキストなし）'} — 座標 ${where}${target}`)
  })
  const done = notes.length - todo.length
  if (done) lines.push('', `（完了済みの ${done} 件は省略）`)
  return lines.join('\n')
}
