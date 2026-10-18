import type { ModelForkResult, ProcessRunInit, ProcessRunResult } from 'claude-code'

import { kindById } from './catalog'
import type { DiagramKind } from './catalog'
import type { TriggerKind } from './jev'

/** draw が外から使う 2 つの働き。$ との接続は register.tsx が行う */
export type DrawIO = {
  fork: (prompt: string) => Promise<ModelForkResult>
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
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
    '- Write D2. Keep the flow in one direction.',
    '- At most 12 boxes. Labels at most 20 characters.',
    '- No colors, styles, icons, imports or URLs.',
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

type DrawInput = { trigger: TriggerKind; text: string; candidates: { id: DiagramKind; p: number }[]; lang: 'ja' | 'en' }

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
