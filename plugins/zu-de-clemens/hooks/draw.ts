import type { ModelForkResult, ProcessRunInit, ProcessRunResult } from 'claude-code'

import { kindById, SUMMARY_ONLY } from './catalog'
import type { CheckResult } from './check'
import type { DiagramKind } from './catalog'
import type { TriggerKind } from './jev'
import { markClassesD2 } from './marks'

/** draw が外から使う 2 つの働き。$ との接続は register.tsx が行う */
export type DrawIO = {
  fork: (prompt: string) => Promise<ModelForkResult>
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  /** 図の検品用に、D2 から PNG（base64）を作る。作れなければ undefined */
  png?: (d2: string) => Promise<string | undefined>
}

/** 図にしない形。流れのない返答は、ペインの Markdown で一覧・表として出す */
export type TextKind = 'list' | 'table'
// list は 0.3.2 の名前。今は checklist だが、描き直しなどで古い返事が来ても読めるよう残す
const TEXT_KINDS: readonly string[] = ['list', 'table', 'checklist', 'kanban', 'procon', 'timeline']
const MAX_MARKDOWN_LINES = 30

/** 図の中で利用者に返答を求める問い。section は一覧の見出し（無ければ空） */
export type Reply = { section: string; question: string }

/** markdown があれば一覧・表。svg と d2 は空になる */
export type Figure = { kind: DiagramKind | TextKind; title: string; recommend?: string; replies?: Reply[]; svg: string; ascii: string; d2: string; markdown?: string }

export type DrawResult =
  | { ok: true; figure: Figure }
  | { ok: false; reason: 'nothing-to-fork' | 'fork-failed' | 'invalid-reply' | 'unsafe-d2' | 'd2-failed' | 'd2-missing' }

type Failure = Extract<DrawResult, { ok: false }>['reason']

const D2_CANDIDATES = ['d2', '/opt/homebrew/bin/d2', '/usr/local/bin/d2']
const RUN_TIMEOUT_MS = 10_000
const ATTEMPTS = 2

const TRIGGER_TEXT: Record<TriggerKind, string> = {
  question: 'Claude is asking the user the question below. Show the options so the user can compare them and choose.',
  answer: 'Claude just gave the answer below. Show it so the reader grasps it at a glance.',
  prompt: 'The user asked for an overview of this session. Show the topics, what is decided and what is still open.',
}

type Parsed = ({ d2: string } | { markdown: string }) & { kind: string; title: string; recommend?: string; replies?: Reply[] }

const MAX_REPLIES = 5
const MAX_QUESTION = 200

// fork の返事は信頼の境界の外。問いは文字として出すだけなので、長さと数だけ絞る
function parseReplies(text: string): Reply[] {
  return [...text.replace(/```[\s\S]*?```/g, '').matchAll(/^REPLY:(.*)$/gm)]
    .map(m => {
      const raw = m[1]!
      const bar = raw.indexOf('|')
      return bar < 0
        ? { section: '', question: raw.trim() }
        : { section: raw.slice(0, bar).trim(), question: raw.slice(bar + 1).trim() }
    })
    .filter(r => r.question)
    .map(r => ({ section: r.section.slice(0, MAX_QUESTION), question: r.question.slice(0, MAX_QUESTION) }))
    .slice(0, MAX_REPLIES)
}

export function parseReply(text: string): Parsed | undefined {
  const blocks = [...text.matchAll(/```(d2|md)\s*\n([\s\S]*?)```/g)]
  if (blocks.length !== 1) return undefined
  const line = (name: string) => new RegExp(`^${name}:[ \\t]*(.+)$`, 'm').exec(text)?.[1]?.trim()
  const kind = line('KIND')
  const title = line('TITLE')
  if (!kind || !title) return undefined
  const recommend = line('RECOMMEND')
  const body = blocks[0]![2]!.trim()
  const replies = parseReplies(text)
  return { ...(blocks[0]![1] === 'md' ? { markdown: body } : { d2: body }), kind, title, ...(recommend ? { recommend } : {}), ...(replies.length ? { replies } : {}) }
}

// fork の返事は信頼の境界の外。ペインの Markdown はリンクを押せるので、リンク・画像・URL・HTML を落として文字だけ残す
export function plainMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/\b(?:https?|file|ftp):\/\/\S+/gi, '')
    .replace(/\bwww\.\S+/gi, '')
    .split('\n')
    .slice(0, MAX_MARKDOWN_LINES)
    .join('\n')
    .trim()
}

// fork の返事は信頼の境界の外。手元のファイルや外部の URL を読ませる書き方を拒む（計画のレビュー 2）。
export function isSafeD2(d2: string): boolean {
  return !/(^|[\s:{])@|\.\.\.@|icon\s*:|https?:\/\//m.test(d2)
}

// ペインは縦に長い。横向きの図は幅に合わせて縮められ、文字が読めなくなる（右向きで 1820px 幅になった例がある）
export function downward(d2: string): string {
  return `direction: down\n${d2.replace(/^direction:.*$\n?/gm, '')}`
}

// 格子（grid-columns/rows）の中の矢印は ELK を通らず直線で引かれ、箱を貫いて文字が重なる（#4）。
// 中身（その枠の中のもの）に矢印がつながる枠からだけ格子を外す。枠そのものから出る矢印は重ならないので、
// 矢印のない整理の図（#1）や、原因の系統を縦に積んだ特性要因の図は格子のまま縦に積む（2026-11-24 に実測）
// shortcut: 行ごとの簡易な読み取り。引用符の中の "->" も矢印とみなす。誤検知しても格子が外れて横に広がるだけ
export function gridOnlyWithoutEdges(d2: string): string {
  const lines = d2.split('\n')
  const scopeOf: string[] = []
  const endpoints: string[] = []
  const stack: string[] = []
  for (const line of lines) {
    const scope = stack.join('.')
    scopeOf.push(scope)
    const trimmed = line.trim()
    if (/<-|->|--/.test(trimmed)) {
      // a -> b -> c: 矢印で区切った各端を、今の枠からの絶対の名前にする
      const head = trimmed.replace(/\s*:[^>]*$/, '').replace(/\s*\{.*$/, '')
      for (const part of head.split(/<->|->|<-|--/)) {
        const name = part.trim().replace(/\[\d+\]$/, '')
        if (name) endpoints.push(scope ? `${scope}.${name}` : name)
      }
      continue
    }
    const open = /^([A-Za-z0-9_.-]+)\s*(?::[^{]*)?\{\s*$/.exec(trimmed)
    if (open) stack.push(open[1]!)
    else if (trimmed === '}') stack.pop()
  }
  return lines
    .filter((line, i) => {
      if (!/^\s*grid-(columns|rows):/.test(line)) return true
      const scope = scopeOf[i]!
      return !endpoints.some(e => scope === '' || e.startsWith(`${scope}.`))
    })
    .join('\n')
}

// バナーに寄せた配色。ライトは藤色の地に紫の線、ダークは Dark Mauve の地に水色の線。判断のひし形（N4）だけ別の色にする。
// AA2 は表の型の文字（既定の青は白地で 4.3:1 しかない）、AA4 は円柱の地。
// どの色も、文字は 4.5:1・線は 3:1 以上を満たすよう測って決めた
const THEME = `vars: {
  d2-config: {
    theme-overrides: {
      N2: "#555A6B"
      N4: "#BDEFFF"
      B1: "#6A3FC1"
      B2: "#6A3FC1"
      B4: "#ECE3FB"
      B5: "#F4EEFD"
      B6: "#FAF7FF"
      AA2: "#6A3FC1"
      AA4: "#ECE3FB"
    }
    dark-theme-overrides: {
      N4: "#7A4A6E"
      B1: "#5FE3FF"
      B2: "#5FE3FF"
      B4: "#4C4F66"
    }
  }
}
`

// 矢印の文字は D2 の既定で斜体になり、日本語が読みにくい（2026-11-24 の実機の画面）。全部の矢印でまっすぐにする
const UPRIGHT_EDGE_LABELS = '(** -> **)[*].style.italic: false\n'

export function themed(d2: string): string {
  return THEME + UPRIGHT_EDGE_LABELS + d2
}

function buildPrompt(input: DrawInput, feedback?: string): string {
  const kinds = input.candidates.slice(0, 3).map(c => kindById(c.id)).filter(k => k !== undefined)
  return [
    'Show the target ONE way in the side pane, about the current conversation: a diagram or a list.',
    TRIGGER_TEXT[input.trigger],
    '',
    'Target:',
    JSON.stringify(input.text),
    '',
    'First decide the form. Draw a diagram only when the main point of the target is a flow, a branch, a structure or relations that arrows or nesting show. Otherwise (findings, states, to-dos, steps already done, a comparison of options), reply with a ```md list or table, as described in the rules below.',
    '',
    'If you draw a diagram, these kinds are suggested (most likely first). You may pick any of them:',
    ...input.candidates.slice(0, 3).map((c, i) => {
      const kind = kinds[i]!
      const how = kind.form === 'md' ? 'Example (reply with a ```md block, not D2):' : 'Example:'
      return `- ${kind.id} (p=${c.p.toFixed(2)}): ${kind.when.en}\n  ${how}\n${kind.sample.replace(/^/gm, '    ')}`
    }),
    '',
    'Rules:',
    '- Write D2. Lay it out top to bottom (direction: down); the pane is tall and narrow.',
    '- Boxes without arrows between them ignore direction and sit side by side. To stack them top to bottom, add grid-columns: 1 inside the container that holds them (or at the top if the diagram has no arrows at all).',
    '- Never put grid-columns on a container whose members have arrows to or from them, nor at the top of a diagram with arrows: arrows inside a grid are drawn straight through other boxes. An arrow from the container itself is fine.',
    '- Draw only what the target states. If it does not say where or to whom something goes, do not guess the end of that arrow and do not skip anything in between; keep the wording of the target instead.',
    '- Do not invent an order. If the target says several judgments or steps happen together, at once or in no fixed order, do not chain them; put them in one container and label it as unordered.',
    '- A property of a whole group (e.g. no threshold, no log) belongs in its container label, not in a box beside the members.',
    '- Keep each relation as the target states it. Something proposed to replace X is not an input to X: do not draw it as an arrow into X; label the edge with the target\'s own word (e.g. replaces), make it dashed with {style.stroke-dash: 3} and keep proposals apart from the current state.',
    '- The reader must get the point from the diagram alone. Put the conclusion of the target in TITLE as one sentence, not a topic name.',
    '- Write each label so it keeps its subject: what was checked or what it is, then the result (e.g. "29 settings files checked → 0 secrets"). Do not cut a label down to a fragment that only makes sense next to the target.',
    '- When items have a state, start the label with a mark: ✓ done or fine, ! needs action, ? not checked. Use the same mark for the same state everywhere.',
    '- If the items have no order, cause or flow between them (findings, states, to-dos, or a comparison of options), do not draw a diagram. Reply with a ```md block instead: a heading per group and one bullet per item that starts with its state mark, or a table for a comparison. At most 15 lines, no links. Use KIND: checklist for items with states, KIND: table for a comparison, or a suggested md kind above.',
    // 1 行 20 字では幅 455px になり、ペインで縮む。2 行・16 字なら 261px（2026-11-13 に d2 0.9 で実測）
    `- At most 12 boxes. Labels: at most 2 lines (split with \\n), each line at most ${input.lang === 'ja' ? 16 : 30} characters.`,
    '- No colors, styles, icons, imports or URLs. The only exceptions are the dashed edge above and the state marks.',
    `- Write labels in ${input.lang === 'ja' ? 'Japanese' : 'English'}.`,
    '',
    'Reply with exactly this and nothing else:',
    '```d2',
    '<your D2>',
    '```',
    '(or one ```md block instead, as above)',
    'KIND: <the kind id you used, or list or table>',
    'TITLE: <the conclusion of the target, one sentence>',
    ...(input.trigger === 'question'
      ? ['RECOMMEND: <the option you recommend and why, one line>']
      : [
          'REPLY: <heading of the md group it belongs to, or empty> | <question> (0 to 5 lines)',
          '',
          'REPLY lines: add one only for each thing the target asks the user to answer or decide, with the choices it offers (e.g. "Go with A or C?"). Do not invent questions; if the target asks nothing, write no REPLY line. Write the heading exactly as in your md block, or leave it empty for a diagram, a table or a question about the whole target.',
        ]),
    ...(feedback ? ['', `Your previous reply was rejected: ${feedback}`, 'Fix it and reply again in the same format.'] : []),
  ].join('\n')
}

async function findD2(io: DrawIO): Promise<string | undefined> {
  for (const bin of D2_CANDIDATES) {
    try {
      if ((await io.run([bin, '--version'], { timeoutMs: RUN_TIMEOUT_MS })).exitCode === 0) return bin
    } catch {
      // 次の候補を試す
    }
  }
  return undefined
}

type DrawInput = {
  trigger: TriggerKind
  text: string
  candidates: { id: DiagramKind; p: number }[]
  lang: 'ja' | 'en'
  /** 図の検品（実験機能）。渡されたときだけ PNG を作って確かめる */
  check?: (png: string, kind: DiagramKind) => Promise<CheckResult>
}

// 質問から描いた図の答えは、質問のダイアログで返す
const repliesFor = (input: DrawInput, parsed: Parsed) =>
  input.trigger !== 'question' && parsed.replies ? { replies: parsed.replies } : {}

export async function draw(io: DrawIO, input: DrawInput): Promise<DrawResult> {
  const d2 = await findD2(io)
  if (!d2) return { ok: false, reason: 'd2-missing' }
  let feedback: string | undefined
  let last: Failure = 'invalid-reply'
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const reply = await io.fork(buildPrompt(input, feedback))
    if (!reply.isAnswered) return { ok: false, reason: reply.reason === 'nothing-to-fork' ? 'nothing-to-fork' : 'fork-failed' }
    const parsed = parseReply(reply.text)
    if (parsed && 'markdown' in parsed) {
      const markdown = plainMarkdown(parsed.markdown)
      if (TEXT_KINDS.includes(parsed.kind) && markdown) {
        const { kind, title, recommend } = parsed
        return { ok: true, figure: { kind: kind as TextKind | DiagramKind, title, ...(recommend ? { recommend } : {}), ...repliesFor(input, parsed), svg: '', ascii: markdown, d2: '', markdown } }
      }
      last = 'invalid-reply'
      feedback = 'a ```md block must come with KIND: list or KIND: table and must not be empty'
      continue
    }
    if (!parsed || !kindById(parsed.kind)) {
      last = 'invalid-reply'
      feedback = 'it must contain exactly one ```d2 code block and the KIND and TITLE lines, with KIND one of the suggested kind ids'
      continue
    }
    if (input.trigger !== 'prompt' && SUMMARY_ONLY.includes(parsed.kind as DiagramKind)) {
      last = 'invalid-reply'
      feedback = `${parsed.kind} is only for session overviews; pick another kind that shows how the parts relate`
      continue
    }
    parsed.d2 = themed(downward(markClassesD2(gridOnlyWithoutEdges(parsed.d2))))
    if (!isSafeD2(parsed.d2)) {
      last = 'unsafe-d2'
      feedback = 'it used an import (@...), an icon or a URL, which are not allowed'
      continue
    }
    try {
      const checked = await io.run([d2, 'validate', '-'], { stdin: parsed.d2, timeoutMs: RUN_TIMEOUT_MS })
      if (checked.exitCode !== 0) {
        last = 'd2-failed'
        feedback = `d2 validate failed: ${(checked.stderr || checked.stdout).trim().slice(0, 500)}`
        continue
      }
      const svg = await io.run([d2, '--layout=elk', '--theme', '0', '--dark-theme', '200', '--scale', '1', '--pad', '20', '-', '-'], { stdin: parsed.d2, timeoutMs: RUN_TIMEOUT_MS })
      const ascii = await io.run([d2, '--layout=elk', '--stdout-format', 'ascii', '-', '-'], { stdin: parsed.d2, timeoutMs: RUN_TIMEOUT_MS })
      if (svg.exitCode !== 0 || ascii.exitCode !== 0) return { ok: false, reason: 'd2-failed' }
      if (input.check && io.png && attempt < ATTEMPTS - 1) {
        const png = await io.png(parsed.d2)
        const checked = png ? await input.check(png, parsed.kind as DiagramKind) : { ok: 'skipped' as const }
        if (checked.ok === false) {
          feedback = `the drawn diagram failed a visual check: ${checked.problem}`
          continue
        }
      }
      return {
        ok: true,
        figure: {
          kind: parsed.kind as DiagramKind,
          title: parsed.title,
          ...(parsed.recommend ? { recommend: parsed.recommend } : {}),
          ...repliesFor(input, parsed),
          svg: svg.stdout,
          ascii: ascii.stdout,
          d2: parsed.d2,
        },
      }
    } catch {
      // 打ち切り（10 秒）や起動の失敗
      return { ok: false, reason: 'd2-failed' }
    }
  }
  return { ok: false, reason: last }
}
