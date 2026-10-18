import type { HttpInit, HttpResponse } from 'claude-code'

import { KINDS } from './catalog'
import type { DiagramKind } from './catalog'

export type TriggerKind = 'question' | 'answer' | 'prompt'

/** judge が外から使う 3 つの働き。$ との接続は register.tsx が行う */
export type JevIO = {
  fetch: (url: string, init: HttpInit) => Promise<HttpResponse>
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  log: (text: string) => void
}

export type Judgement =
  | { ok: true; needsDiagram?: number; kinds?: { id: DiagramKind; p: number }[]; sessionSummary?: number }
  | { ok: false; reason: 'unauthorized' | 'unavailable' | 'malformed' }

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const TIMEOUT_MS = 10_000
const MAX_TEXT = 6_000
const MAX_PROMPT = 600
const MAX_PROMPTS = 3

// 質問文と判定条件は英語で書く。Jev の精度がいちばん高い言語のため（設計 4 章）。
const NEEDS_DIAGRAM = {
  type: 'noul',
  instructions: 'Would a diagram help the user understand `target.text` better than text alone?',
  criteria: {
    true: 'It describes relationships between parts, the scope of an effect, a flow, a comparison of options, or things nested inside other things.',
    false: 'It is a simple fact, a yes/no answer, a short definition, or small talk.',
  },
}

const DIAGRAM_KIND = {
  type: 'choice',
  instructions: 'Which kind of diagram fits `target.text` best?',
  criteria: {
    ...Object.fromEntries(KINDS.map(kind => [kind.id, kind.when.en])),
    none: 'No diagram kind fits.',
  },
}

const SESSION_SUMMARY = {
  type: 'noul',
  instructions: 'Is the user asking for an overview of this whole session: which topics came up, what has been decided and what is still open?',
  criteria: {
    true: 'Examples: "Where does this session stand now?", "We jumped around a lot, what did we decide?", "How far did we get?", "Let us sort things out."',
    false: 'Asking about one specific thing (an error, a build, a function), asking what a term means, or giving an instruction. Examples: "What is D2?", "Go with plan A", "What is wrong with this function?"',
  },
}

const tail = (text: string, max: number) => (text.length <= max ? text : text.slice(-max))
const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

function buildBody(trigger: TriggerKind, text: string, recentPrompts: string[]) {
  return {
    model: 'jev-latest',
    state: {
      target: { kind: trigger, text: tail(text, MAX_TEXT) },
      recent_prompts: recentPrompts.slice(-MAX_PROMPTS).map(prompt => tail(prompt, MAX_PROMPT)),
    },
    questions: trigger === 'prompt'
      ? { session_summary: SESSION_SUMMARY }
      : { needs_diagram: NEEDS_DIAGRAM, diagram_kind: DIAGRAM_KIND },
  }
}

function parse(trigger: TriggerKind, text: string): Judgement {
  let answers: any
  try {
    answers = JSON.parse(text)?.answers
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (trigger === 'prompt') {
    const p = answers?.session_summary?.noul
    return isProbability(p) ? { ok: true, sessionSummary: p } : { ok: false, reason: 'malformed' }
  }
  const p = answers?.needs_diagram?.noul
  const probabilities = answers?.diagram_kind?.probabilities
  if (!isProbability(p) || !probabilities || typeof probabilities !== 'object') return { ok: false, reason: 'malformed' }
  const entries = Object.entries(probabilities)
  if (!entries.every(([, value]) => isProbability(value))) return { ok: false, reason: 'malformed' }
  const kinds = entries
    .filter(([id]) => KINDS.some(kind => kind.id === id))
    .map(([id, value]) => ({ id: id as DiagramKind, p: value as number }))
    .sort((a, b) => b.p - a.p)
  return { ok: true, needsDiagram: p, kinds }
}

export async function judge(
  io: JevIO,
  input: { key: string; trigger: TriggerKind; text: string; recentPrompts: string[] },
): Promise<Judgement> {
  const stop = new AbortController()
  const timeout = io.sleep(TIMEOUT_MS, stop.signal).then(() => 'timeout' as const, () => 'cancelled' as const)
  try {
    const response = await Promise.race([
      io.fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(input.trigger, input.text, input.recentPrompts)),
      }),
      timeout,
    ])
    if (response === 'timeout' || response === 'cancelled') {
      io.log('jev: timed out')
      return { ok: false, reason: 'unavailable' }
    }
    if (response.status === 401 || response.status === 403) {
      io.log(`jev: HTTP ${response.status}`)
      return { ok: false, reason: 'unauthorized' }
    }
    if (!response.ok) {
      io.log(`jev: HTTP ${response.status}`)
      return { ok: false, reason: 'unavailable' }
    }
    return parse(input.trigger, response.text)
  } catch {
    // 例外の文にはリクエストの中身（キーを含む）が載りうるので、ログには種類だけを書く。
    io.log('jev: request failed')
    return { ok: false, reason: 'unavailable' }
  } finally {
    stop.abort()
  }
}
