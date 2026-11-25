// 状態の印（✓ ! ?）を、文字ではなく見た目で示すための変換。
// fork には印を文字で書かせ（書きやすく検査しやすい）、描く前に MOD が見た目に変える。

export type MarkState = 'ok' | 'warn' | 'unknown'

const MARKS: Record<string, MarkState> = { '✓': 'ok', '!': 'warn', '?': 'unknown' }

/** 先頭の印を状態に変え、印の文字を外す。「!important」のように印のあとに空白が無い ! と ? は印とみなさない */
export function splitMark(text: string): { state?: MarkState; text: string } {
  const m = /^\s*(✓|!(?=\s)|\?(?=\s))\s*/.exec(text)
  return m ? { state: MARKS[m[1]!]!, text: text.slice(m[0].length) } : { text }
}

// 線の色はライトの箱（#FAF7FF）とダークの箱（#313244）の両方で 3:1 以上（2026-11-24 に計算）。
// 色だけに頼らないよう、要対応は太線、未確認は点線にする
const CLASSES = `classes: {
  st-ok: {style.stroke: "#2E9E5B"; style.stroke-width: 2}
  st-warn: {style.stroke: "#C9730A"; style.stroke-width: 4}
  st-unknown: {style.stroke: "#8A8FA3"; style.stroke-width: 2; style.stroke-dash: 4}
}
`

// 箱の宣言の行（id: ラベル）。矢印の行と、style などの属性の行は対象にしない
const NODE_LINE = /^(\s*)([A-Za-z0-9_-]+)(\s*:\s*)(["']?)(.*)$/
const NOT_NODE = /^(style|shape|label|direction|grid-[a-z]+|vertical-gap|horizontal-gap|near|width|height|class|classes|vars|icon|link|tooltip)$/

/** 印の付いた箱に状態の class を付け、印の文字を消す。印が 1 つも無ければそのまま返す */
export function markClassesD2(d2: string): string {
  let found = false
  const lines = d2.split('\n').flatMap(line => {
    if (/<-|->|--/.test(line)) return [line]
    const m = NODE_LINE.exec(line)
    if (!m || NOT_NODE.test(m[2]!)) return [line]
    const [, indent, id, sep, quote, rest] = m
    const { state, text } = splitMark(rest!)
    if (!state) return [line]
    found = true
    return [`${indent}${id}.class: st-${state}`, `${indent}${id}${sep}${quote}${text}`]
  })
  return found ? CLASSES + lines.join('\n') : d2
}

export type ListGroup = { title: string; state?: MarkState; items: { state?: MarkState; text: string }[] }

/** fork が書いた一覧（見出しと箇条書き）を、見出しごとのまとまりに分ける。表は対象にしない */
export function parseList(md: string): ListGroup[] {
  const groups: ListGroup[] = []
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      const { state, text } = splitMark(heading[1]!)
      groups.push({ title: text, ...(state ? { state } : {}), items: [] })
      continue
    }
    const body = line.replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    if (groups.length === 0) groups.push({ title: '', items: [] })
    const { state, text } = splitMark(body)
    groups[groups.length - 1]!.items.push({ ...(state ? { state } : {}), text })
  }
  return groups
}

/** Markdown の表を行とセルに分ける。区切りの行（|---|）は外す */
export function parseTable(md: string): string[][] {
  return md.split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|'))
    .map(line => line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()))
    .filter(cells => !cells.every(cell => /^:?-+:?$/.test(cell)))
}
