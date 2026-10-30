import type { ModelForkResult, ProcessRunInit, ProcessRunResult } from 'claude-code'

import { kindById } from './catalog'
import type { CheckResult } from './check'
import type { DiagramKind } from './catalog'
import type { TriggerKind } from './jev'

/** draw が外から使う 2 つの働き。$ との接続は register.tsx が行う */
export type DrawIO = {
  fork: (prompt: string) => Promise<ModelForkResult>
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  /** 図の検品用に、D2 から PNG（base64）を作る。作れなければ undefined */
  png?: (d2: string) => Promise<string | undefined>
}

export type Figure = { kind: DiagramKind; title: string; recommend?: string; svg: string; ascii: string; d2: string }

export type DrawResult =
  | { ok: true; figure: Figure }
  | { ok: false; reason: 'nothing-to-fork' | 'fork-failed' | 'invalid-reply' | 'unsafe-d2' | 'd2-failed' | 'd2-missing' }

type Failure = Extract<DrawResult, { ok: false }>['reason']

const D2_CANDIDATES = ['d2', '/opt/homebrew/bin/d2', '/usr/local/bin/d2']
const RUN_TIMEOUT_MS = 10_000
const ATTEMPTS = 2

const TRIGGER_TEXT: Record<TriggerKind, string> = {
  question: 'Claude is asking the user the question below. Draw a diagram that compares the options so the user can choose.',
  answer: 'Claude just gave the answer below. Draw a diagram that explains it.',
  prompt: 'The user asked for an overview of this session. Draw the topics, what is decided and what is still open.',
}

export function parseReply(text: string): { d2: string; kind: string; title: string; recommend?: string } | undefined {
  const blocks = [...text.matchAll(/```d2\s*\n([\s\S]*?)```/g)]
  if (blocks.length !== 1) return undefined
  const line = (name: string) => new RegExp(`^${name}:[ \\t]*(.+)$`, 'm').exec(text)?.[1]?.trim()
  const kind = line('KIND')
  const title = line('TITLE')
  if (!kind || !title) return undefined
  const recommend = line('RECOMMEND')
  return { d2: blocks[0]![1]!.trim(), kind, title, ...(recommend ? { recommend } : {}) }
}

// fork の返事は信頼の境界の外。手元のファイルや外部の URL を読ませる書き方を拒む（計画のレビュー 2）。
export function isSafeD2(d2: string): boolean {
  return !/(^|[\s:{])@|\.\.\.@|icon\s*:|https?:\/\//m.test(d2)
}

// ペインは縦に長い。横向きの図は幅に合わせて縮められ、文字が読めなくなる（右向きで 1820px 幅になった例がある）
export function downward(d2: string): string {
  return `direction: down\n${d2.replace(/^direction:.*$\n?/gm, '')}`
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

export function themed(d2: string): string {
  return THEME + d2
}

function buildPrompt(input: DrawInput, feedback?: string): string {
  const kinds = input.candidates.slice(0, 3).map(c => kindById(c.id)).filter(k => k !== undefined)
  return [
    'Draw ONE diagram for the side pane, about the current conversation.',
    TRIGGER_TEXT[input.trigger],
    '',
    'Target:',
    JSON.stringify(input.text),
    '',
    'Suggested diagram kinds (most likely first). You may pick any of them:',
    ...input.candidates.slice(0, 3).map((c, i) => {
      const kind = kinds[i]!
      return `- ${kind.id} (p=${c.p.toFixed(2)}): ${kind.when.en}\n  Example:\n${kind.sample.replace(/^/gm, '    ')}`
    }),
    '',
    'Rules:',
    '- Write D2. Lay it out top to bottom (direction: down); the pane is tall and narrow.',
    '- Boxes without arrows between them ignore direction and sit side by side. Wherever that happens, including inside containers, add grid-columns: 1 so they stack top to bottom.',
    '- Draw only what the target states. If it does not say where or to whom something goes, do not guess the end of that arrow and do not skip anything in between; keep the wording of the target instead.',
    '- Do not invent an order. If the target says several judgments or steps happen together, at once or in no fixed order, do not chain them; put them in one container and label it as unordered.',
    '- A property of a whole group (e.g. no threshold, no log) belongs in its container label, not in a box beside the members.',
    '- Keep each relation as the target states it. Something proposed to replace X is not an input to X: do not draw it as an arrow into X; label the edge with the target\'s own word (e.g. replaces), make it dashed with {style.stroke-dash: 3} and keep proposals apart from the current state.',
    '- At most 12 boxes. Labels at most 20 characters.',
    '- No colors, styles, icons, imports or URLs. The only exception is the dashed edge above.',
    `- Write labels in ${input.lang === 'ja' ? 'Japanese' : 'English'}.`,
    '',
    'Reply with exactly this and nothing else:',
    '```d2',
    '<your D2>',
    '```',
    'KIND: <the kind id you used>',
    'TITLE: <one-line title>',
    ...(input.trigger === 'question' ? ['RECOMMEND: <the option you recommend and why, one line>'] : []),
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

export async function draw(io: DrawIO, input: DrawInput): Promise<DrawResult> {
  const d2 = await findD2(io)
  if (!d2) return { ok: false, reason: 'd2-missing' }
  let feedback: string | undefined
  let last: Failure = 'invalid-reply'
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const reply = await io.fork(buildPrompt(input, feedback))
    if (!reply.isAnswered) return { ok: false, reason: reply.reason === 'nothing-to-fork' ? 'nothing-to-fork' : 'fork-failed' }
    const parsed = parseReply(reply.text)
    if (!parsed || !kindById(parsed.kind)) {
      last = 'invalid-reply'
      feedback = 'it must contain exactly one ```d2 code block and the KIND and TITLE lines, with KIND one of the suggested kind ids'
      continue
    }
    parsed.d2 = themed(downward(parsed.d2))
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
